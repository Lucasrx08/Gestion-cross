const SUPABASE_URL = "https://iybbfprsnhvdbpvftwjk.supabase.co";
const SUPABASE_KEY = "sb_publishable_bEJiROkfolgJkX4LqsXmDw_6vUspKNu";
const API_URL = `${SUPABASE_URL}/functions/v1/race-api`;
const SESSION_KEY = "gestion-cross-organizer-session-v1";

interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  user?: { id?: string };
}

export interface CloudHeat {
  id: string;
  event_id: string;
  name: string;
  status: "draft" | "running" | "finished";
  selected_classes: string[];
  sex_filter: string;
  challenge_enabled: boolean;
  challenge_classes: string[];
  next_position: number;
  started_at?: string | null;
  finished_at?: string | null;
  counts?: { total: number; registered: number; finished: number; dnf: number; exempt: number };
}

export interface CloudEvent {
  id: string;
  local_event_id: string;
  name: string;
  year: number;
  location: string;
  event_date?: string | null;
}

export interface HeatEntry {
  id: string;
  status: "registered" | "finished" | "dnf" | "exempt";
  finish_position: number | null;
  elapsed_ms: number | null;
  scanned_at: string | null;
  station_id: string | null;
  participant: {
    id: string;
    local_participant_id: string;
    bib_code: string;
    bib_number: number;
    last_name: string;
    first_name: string;
    class_name: string;
    sex: string;
  };
}

export interface StationState {
  heat: {
    id: string;
    name: string;
    status: "draft" | "running" | "finished";
    next_position: number;
    started_at?: string | null;
    finished_at?: string | null;
    event?: { name?: string };
  };
  counts: { total: number; finished: number; dnf: number; exempt: number };
  recent: Array<{
    id: string;
    finish_position: number;
    elapsed_ms: number;
    scanned_at: string;
    station_id: string;
    participant: { bib_code: string; first_name: string; last_name: string; class_name: string };
  }>;
}

function readSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as StoredSession : null;
  } catch {
    return null;
  }
}

function saveSession(raw: Record<string, unknown>) {
  const source = (raw.session && typeof raw.session === "object" ? raw.session : raw) as Record<string, unknown>;
  const expiresIn = Number(source.expires_in) || 3600;
  const session: StoredSession = {
    access_token: String(source.access_token ?? ""),
    refresh_token: String(source.refresh_token ?? ""),
    expires_at: Number(source.expires_at) || Math.floor(Date.now() / 1000) + expiresIn,
    user: source.user && typeof source.user === "object" ? source.user as { id?: string } : undefined,
  };
  if (!session.access_token || !session.refresh_token) throw new Error("SESSION_INVALIDE");
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

async function authRequest(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(payload?.msg ?? payload?.message ?? payload?.error_description ?? "AUTH_INDISPONIBLE");
    throw new Error(message);
  }
  return saveSession(payload as Record<string, unknown>);
}

export async function ensureOrganizerSession() {
  const current = readSession();
  if (current?.access_token && current.expires_at > Math.floor(Date.now() / 1000) + 90) return current;
  if (current?.refresh_token) {
    try {
      return await authRequest("token?grant_type=refresh_token", { refresh_token: current.refresh_token });
    } catch {
      window.localStorage.removeItem(SESSION_KEY);
    }
  }
  return authRequest("signup", {
    data: { app: "gestion-cross", role: "organizer" },
    gotrue_meta_security: {},
  });
}

async function api<T>(action: string, payload: Record<string, unknown>, token?: string): Promise<T> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.error) throw new Error(String(result?.error ?? `HTTP_${response.status}`));
  return result.data as T;
}

export async function ownerApi<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  let session = await ensureOrganizerSession();
  try {
    return await api<T>(action, payload, session.access_token);
  } catch (error) {
    if (error instanceof Error && ["CONNEXION_REQUISE", "SESSION_INVALIDE"].includes(error.message)) {
      window.localStorage.removeItem(SESSION_KEY);
      session = await ensureOrganizerSession();
      return api<T>(action, payload, session.access_token);
    }
    throw error;
  }
}

export function stationApi<T>(action: string, payload: Record<string, unknown> = {}) {
  return api<T>(action, payload);
}

export function raceErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : String(error);
  const messages: Record<string, string> = {
    CODE_INVALIDE: "Code de course invalide ou expiré.",
    COURSE_NON_DEMARREE: "Cette course n’est pas en cours.",
    DOSSARD_INCONNU: "Ce dossard ne fait pas partie de cette course.",
    "DOSSARD_DEJA_SCANNÉ": "Ce dossard a déjà été enregistré à l’arrivée.",
    "PARTICIPANT_DISPENSÉ": "Cet élève est indiqué comme dispensé.",
    CONNEXION_REQUISE: "Connexion organisateur requise.",
    SESSION_INVALIDE: "La session organisateur doit être recréée.",
    AUCUN_PARTICIPANT: "Aucun participant n’est sélectionné.",
    COURSE_DEJA_DEMARREE: "Cette course a déjà démarré.",
    SUPPRIMER_ARRIVEE_DABORD: "Supprimez d’abord l’arrivée de cet élève.",
    TERMINER_LA_COURSE_DABORD: "Terminez la course avant de la supprimer.",
  };
  if (/anonymous|signup|disabled/i.test(code)) return "Le mode organisateur sécurisé n’est pas encore activé dans Supabase (connexion anonyme).";
  return messages[code] ?? `Erreur : ${code}`;
}

export function formatElapsed(ms?: number | null) {
  if (ms == null) return "—";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const centiseconds = Math.floor((ms % 1000) / 10);
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}
