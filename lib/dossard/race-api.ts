const SUPABASE_URL = "https://iybbfprsnhvdbpvftwjk.supabase.co";
const SUPABASE_KEY = "sb_publishable_bEJiROkfolgJkX4LqsXmDw_6vUspKNu";
const API_URL = `${SUPABASE_URL}/functions/v1/race-api`;
const OWNER_KEY_STORAGE = "gestion-cross-owner-key-v1";

export type EntryStatus = "registered" | "finished" | "dnf" | "exempt" | "absent";

export interface CloudHeat {
  id: string;
  event_id: string;
  name: string;
  status: "draft" | "running" | "finished";
  selected_classes: string[];
  sex_filter: string;
  challenge_enabled: boolean;
  challenge_classes: string[];
  challenge_best_count: number | null;
  next_position: number;
  started_at?: string | null;
  finished_at?: string | null;
  counts?: { total: number; registered: number; finished: number; dnf: number; exempt: number; absent: number };
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
  status: EntryStatus;
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
  counts: { total: number; finished: number; dnf: number; exempt: number; absent: number };
  recent: Array<{
    id: string;
    finish_position: number;
    elapsed_ms: number;
    scanned_at: string;
    station_id: string;
    participant: { bib_code: string; first_name: string; last_name: string; class_name: string };
  }>;
}

function ownerKey() {
  if (typeof window === "undefined") throw new Error("CLE_ORGANISATEUR_INDISPONIBLE");
  let value = window.localStorage.getItem(OWNER_KEY_STORAGE);
  if (value && value.length >= 32) return value;
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  value = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  window.localStorage.setItem(OWNER_KEY_STORAGE, value);
  return value;
}

async function api<T>(action: string, payload: Record<string, unknown>, includeOwnerKey = false): Promise<T> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      action,
      ...(includeOwnerKey ? { ownerKey: ownerKey() } : {}),
      ...payload,
    }),
  });
  const result = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || result.error) throw new Error(String(result.error ?? `HTTP_${response.status}`));
  return result.data as T;
}

export function ownerApi<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  return api<T>(action, payload, true);
}

export function stationApi<T>(action: string, payload: Record<string, unknown> = {}) {
  return api<T>(action, payload, false);
}

export function raceErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : String(error);
  const messages: Record<string, string> = {
    CODE_INVALIDE: "Code de course invalide ou expiré.",
    COURSE_NON_DEMARREE: "Cette course n’est pas en cours.",
    DOSSARD_INCONNU: "Ce dossard ne fait pas partie de cette course.",
    "DOSSARD_DEJA_SCANNÉ": "Ce dossard a déjà été enregistré à l’arrivée.",
    "PARTICIPANT_DISPENSÉ": "Cet élève est indiqué comme dispensé.",
    PARTICIPANT_ABSENT: "Cet élève est indiqué comme absent.",
    CLE_ORGANISATEUR_INVALIDE: "La clé organisateur de cet appareil est invalide.",
    CLE_ORGANISATEUR_INDISPONIBLE: "Le stockage local du navigateur est indisponible.",
    AUCUN_PARTICIPANT: "Aucun participant n’est sélectionné.",
    COURSE_DEJA_DEMARREE: "Cette course a déjà démarré.",
    SUPPRIMER_ARRIVEE_DABORD: "Supprimez d’abord l’arrivée de cet élève.",
    TERMINER_LA_COURSE_DABORD: "Terminez la course avant de la supprimer.",
    POSITION_INVALIDE: "Cette position n’est pas valide.",
    PARTICIPANT_INTROUVABLE: "Participant introuvable.",
    COURSE_INTROUVABLE: "Course introuvable.",
    EVENEMENT_INTROUVABLE: "Événement introuvable.",
  };
  if (/Failed to fetch|NetworkError|Load failed/i.test(code)) return "Connexion au serveur impossible. Vérifiez le réseau avant de poursuivre la course.";
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
