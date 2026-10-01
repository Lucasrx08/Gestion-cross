import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.116.0";

const URL = Deno.env.get("SUPABASE_URL") ?? "";
const KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ORIGINS = new Set([
  "https://lucasrx08.github.io",
  "https://dossard-pro.lucasrigaux8.chatgpt.site",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);
const PAGE_SIZE = 1000;

type J = Record<string, unknown>;
type StatusRow = { heat_id: string; status: string };
type EntryRow = {
  id: string;
  status: string;
  finish_position: number | null;
  station_order: number | null;
  station_position: number | null;
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
};
type RecentRow = {
  id: string;
  finish_position: number;
  station_order: number;
  station_position: number;
  elapsed_ms: number;
  scanned_at: string;
  station_id: string;
  participant: { bib_code: string; first_name: string; last_name: string; class_name: string };
};

type Page<T> = { data: T[] | null; error: unknown };

const txt = (value: unknown, max = 160) => String(value ?? "").trim().slice(0, max);
const arr = (value: unknown, max = 200) => Array.isArray(value)
  ? [...new Set(value.map((item) => txt(item)).filter(Boolean))].slice(0, max)
  : [];
const client = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });

function cors(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.has(origin) ? origin : "https://lucasrx08.github.io",
    "Access-Control-Allow-Headers": "apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}
function res(request: Request, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...cors(request), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
async function sha(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
function joinCode() {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return String(100000 + (bytes[0] % 900000));
}
function validJoinCode(code: string) {
  return /^\d{6}$/.test(code) || /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(code);
}
const bib = (value: unknown) => txt(value, 40)
  .normalize("NFKC")
  .toUpperCase()
  .replace(/[§_‐‑‒–—−﹘﹣－]/g, "-")
  .replace(/\s+/g, "");

async function ownerHash(body: J) {
  const key = txt(body.ownerKey, 200);
  if (key.length < 32) fail("CLE_ORGANISATEUR_INVALIDE", 401);
  return sha(key);
}
async function ownedEvent(c: SupabaseClient, id: string, owner: string) {
  const { data, error } = await c.from("cross_events").select("*").eq("id", id).eq("owner_key_hash", owner).maybeSingle();
  if (error) throw error;
  if (!data) fail("EVENEMENT_INTROUVABLE", 404);
  return data;
}
async function ownedHeat(c: SupabaseClient, id: string, owner: string) {
  const { data, error } = await c
    .from("cross_heats")
    .select("*,event:cross_events!inner(id,name,owner_key_hash)")
    .eq("id", id)
    .eq("event.owner_key_hash", owner)
    .maybeSingle();
  if (error) throw error;
  if (!data) fail("COURSE_INTROUVABLE", 404);
  return data;
}
async function heatByCode(c: SupabaseClient, rawCode: string) {
  const code = rawCode.toUpperCase();
  if (!validJoinCode(code)) fail("CODE_INVALIDE", 404);
  const { data, error } = await c
    .from("cross_heats")
    .select("id,name,status,next_position,started_at,finished_at,event:cross_events(name)")
    .eq("station_code_hash", await sha(code))
    .maybeSingle();
  if (error) throw error;
  if (!data) fail("CODE_INVALIDE", 404);
  return data;
}
async function paged<T>(fetcher: (from: number, to: number) => Promise<Page<T>>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const page = await fetcher(from, from + PAGE_SIZE - 1);
    if (page.error) throw page.error;
    const data = page.data ?? [];
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}
async function fetchEntries(c: SupabaseClient, heatId: string) {
  return paged<EntryRow>(async (from, to) => {
    const result = await c
      .from("cross_entries")
      .select("id,status,finish_position,station_order,station_position,elapsed_ms,scanned_at,station_id,participant:cross_participants(id,local_participant_id,bib_code,bib_number,last_name,first_name,class_name,sex)")
      .eq("heat_id", heatId)
      .order("finish_position", { ascending: true, nullsFirst: false })
      .order("id", { ascending: true })
      .range(from, to);
    return { data: result.data as EntryRow[] | null, error: result.error };
  });
}

async function syncEvent(body: J) {
  const c = client();
  const owner = await ownerHash(body);
  const event = body.event as J;
  if (!event || typeof event !== "object") fail("EVENEMENT_REQUIS");
  const participants = Array.isArray(event.participants) ? event.participants : [];
  const local = txt(event.id, 120);
  const name = txt(event.name);
  if (!local || !name || !participants.length) fail("EVENEMENT_INCOMPLET");

  const record = {
    owner_id: null,
    owner_key_hash: owner,
    local_event_id: local,
    name,
    year: Number(event.year) || new Date().getFullYear(),
    location: txt(event.location),
    event_date: txt(event.date, 10) || null,
    scoring_mode: "rank",
    dnf_penalty_offset: 10,
  };
  const { data: savedEvent, error } = await c
    .from("cross_events")
    .upsert(record, { onConflict: "owner_key_hash,local_event_id" })
    .select("*")
    .single();
  if (error) throw error;

  const rows = participants.map((item) => {
    const participant = item as J;
    return {
      local_participant_id: txt(participant.id, 120),
      bib_code: bib(participant.technicalId),
      bib_number: Number(participant.bibNumber) || 0,
      last_name: txt(participant.lastName),
      first_name: txt(participant.firstName),
      class_name: txt(participant.className),
      sex: txt(participant.sex, 40),
    };
  });
  const sync = await c.rpc("cross_sync_participants_internal", {
    p_event_id: savedEvent.id,
    p_owner_key_hash: owner,
    p_participants: rows,
  });
  if (sync.error) throw sync.error;
  const summary = (sync.data ?? {}) as Record<string, unknown>;
  return {
    event: savedEvent,
    participantCount: Number(summary.participantCount ?? rows.length),
    deletedCount: Number(summary.deletedCount ?? 0),
    archivedHistoricalCount: Number(summary.archivedHistoricalCount ?? 0),
  };
}

async function ownerState(body: J) {
  const c = client();
  const owner = await ownerHash(body);
  const { data: event, error } = await c
    .from("cross_events")
    .select("*")
    .eq("owner_key_hash", owner)
    .eq("local_event_id", txt(body.localEventId, 120))
    .maybeSingle();
  if (error) throw error;
  if (!event) return { event: null, heats: [] };

  const { data: heats, error: heatError } = await c
    .from("cross_heats")
    .select("*")
    .eq("event_id", event.id)
    .order("created_at", { ascending: false });
  if (heatError) throw heatError;
  const ids = (heats ?? []).map((heat) => heat.id);
  let statuses: StatusRow[] = [];
  if (ids.length) {
    statuses = await paged<StatusRow>(async (from, to) => {
      const result = await c
        .from("cross_entries")
        .select("heat_id,status")
        .in("heat_id", ids)
        .order("heat_id")
        .order("id")
        .range(from, to);
      return { data: result.data as StatusRow[] | null, error: result.error };
    });
  }

  return {
    event,
    heats: (heats ?? []).map((heat) => {
      const rows = statuses.filter((entry) => entry.heat_id === heat.id);
      return {
        ...heat,
        station_code: heat.station_code_plain ?? null,
        station_code_plain: undefined,
        counts: {
          total: rows.length,
          registered: rows.filter((entry) => entry.status === "registered").length,
          finished: rows.filter((entry) => entry.status === "finished").length,
          dnf: rows.filter((entry) => entry.status === "dnf").length,
          exempt: rows.filter((entry) => entry.status === "exempt").length,
          absent: rows.filter((entry) => entry.status === "absent").length,
        },
      };
    }),
  };
}

async function saveHeatPlan(body: J) {
  const c = client();
  const owner = await ownerHash(body);
  const eventId = txt(body.eventId, 80);
  const heatId = txt(body.heatId, 80);
  await ownedEvent(c, eventId, owner);
  const time = txt(body.scheduledTime, 8);
  if (time && !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(time)) fail("HORAIRE_INVALIDE");
  const { data, error } = await c.rpc("cross_save_heat_plan_internal", {
    p_event_id: eventId,
    p_owner_key_hash: owner,
    p_heat_id: heatId || null,
    p_name: txt(body.name),
    p_selected_classes: arr(body.selectedClasses),
    p_sex_filter: txt(body.sexFilter, 10) || "all",
    p_challenge_enabled: Boolean(body.challengeEnabled),
    p_challenge_classes: arr(body.challengeClasses),
    p_participant_ids: arr(body.participantIds, 5000),
    p_scheduled_time: time || null,
  });
  if (error) throw error;
  return data;
}

async function startHeat(body: J) {
  const c = client();
  const owner = await ownerHash(body);
  const heatId = txt(body.heatId, 80);
  await ownedHeat(c, heatId, owner);
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = joinCode();
    const result = await c.rpc("cross_start_heat_internal", {
      p_heat_id: heatId,
      p_owner_key_hash: owner,
      p_station_code: code,
      p_station_code_hash: await sha(code),
    });
    if (!result.error) return result.data;
    const errorCode = (result.error as { code?: string }).code;
    if (errorCode !== "23505") throw result.error;
  }
  fail("CODE_GENERATION_IMPOSSIBLE", 503);
}

async function finishHeat(body: J) {
  const c = client();
  const owner = await ownerHash(body);
  const { data, error } = await c.rpc("cross_finish_heat_internal", {
    p_heat_id: txt(body.heatId, 80),
    p_owner_key_hash: owner,
  });
  if (error) throw error;
  return data;
}

async function heatEntries(body: J) {
  const c = client();
  const owner = await ownerHash(body);
  const id = txt(body.heatId, 80);
  const heat = await ownedHeat(c, id, owner);
  const entries = await fetchEntries(c, id);
  const stations = await c
    .from("cross_stations")
    .select("id,client_station_id,station_order,mode,status,created_at")
    .eq("heat_id", id)
    .order("station_order");
  if (stations.error) throw stations.error;
  return { heat: { ...heat, station_code: heat.station_code_plain ?? null, station_code_plain: undefined }, entries, stations: stations.data ?? [] };
}

async function setStatus(body: J) {
  const c = client();
  const owner = await ownerHash(body);
  const entryId = txt(body.entryId, 80);
  const status = txt(body.status, 20);
  if (!["registered", "dnf", "exempt", "absent"].includes(status)) fail("STATUT_INVALIDE");
  const { data, error } = await c.rpc("cross_set_entry_status_internal", {
    p_entry_id: entryId, p_owner_key_hash: owner, p_status: status,
  });
  if (error) throw error;
  return data;
}

async function removeFinish(body: J) {
  const c = client();
  const owner = await ownerHash(body);
  const entryId = txt(body.entryId, 80);
  const { data, error } = await c.rpc("cross_remove_finish_internal", {
    p_entry_id: entryId, p_owner_key_hash: owner,
  });
  if (error) throw error;
  return data;
}

async function reorder(body: J) {
  const c = client();
  const owner = await ownerHash(body);
  const target = Number(body.position);
  if (!Number.isInteger(target) || target < 1) fail("POSITION_INVALIDE");
  const { data, error } = await c.rpc("cross_reorder_finish_internal", {
    p_entry_id: txt(body.entryId, 80),
    p_owner_key_hash: owner,
    p_target: target,
  });
  if (error) throw error;
  return data;
}

async function deleteHeat(body: J) {
  const c = client();
  const owner = await ownerHash(body);
  const id = txt(body.heatId, 80);
  const { data, error } = await c.rpc("cross_delete_heat_internal", {p_heat_id:id,p_owner_key_hash:owner});
  if (error) throw error;
  return data;
}

async function deleteEvent(body: J) {
  const c = client();
  const owner = await ownerHash(body);
  const localEventId = txt(body.localEventId, 120);
  const { data, error } = await c.rpc("cross_delete_event_internal", {p_local_event_id:localEventId,p_owner_key_hash:owner});
  if (error) throw error;
  return data;
}

async function joinStation(body: J) {
  const code = txt(body.stationCode, 40).toUpperCase();
  const stationId = txt(body.stationId, 80);
  const mode = txt(body.mode, 12);
  if (!stationId || !["start", "continue"].includes(mode)) fail("POSTE_INVALIDE");
  if (!validJoinCode(code)) fail("CODE_INVALIDE", 404);
  const c = client();
  const { data, error } = await c.rpc("cross_join_station_internal", {
    p_station_code_hash: await sha(code),
    p_client_station_id: stationId,
    p_mode: mode,
  });
  if (error) throw error;
  return { station: data };
}

async function stationState(body: J) {
  const c = client();
  const code = txt(body.stationCode, 40).toUpperCase();
  const stationId = txt(body.stationId, 80);
  const heat = await heatByCode(c, code);
  const stations = await c
    .from("cross_stations")
    .select("id,client_station_id,station_order,mode,status")
    .eq("heat_id", heat.id)
    .order("station_order");
  if (stations.error) throw stations.error;
  const statuses = await paged<{ status: string; station_id: string | null }>(async (from, to) => {
    const result = await c.from("cross_entries").select("status,station_id").eq("heat_id", heat.id).order("id").range(from, to);
    return { data: result.data as { status: string; station_id: string | null }[] | null, error: result.error };
  });
  const recent = await c
    .from("cross_entries")
    .select("id,finish_position,station_order,station_position,elapsed_ms,scanned_at,station_id,participant:cross_participants(bib_code,first_name,last_name,class_name)")
    .eq("heat_id", heat.id)
    .eq("status", "finished")
    .eq("station_id", stationId)
    .order("scanned_at", { ascending: false })
    .limit(12);
  if (recent.error) throw recent.error;
  return {
    heat,
    stations: stations.data ?? [],
    myStation: (stations.data ?? []).find((station) => station.client_station_id === stationId) ?? null,
    myScanCount: statuses.filter((entry) => entry.status === "finished" && entry.station_id === stationId).length,
    counts: {
      total: statuses.length,
      finished: statuses.filter((entry) => entry.status === "finished").length,
      dnf: statuses.filter((entry) => entry.status === "dnf").length,
      exempt: statuses.filter((entry) => entry.status === "exempt").length,
      absent: statuses.filter((entry) => entry.status === "absent").length,
    },
    recent: (recent.data ?? []) as RecentRow[],
  };
}

async function scan(body: J) {
  const c = client();
  const code = txt(body.stationCode, 40).toUpperCase();
  const codeBib = bib(body.bibCode);
  const stationId = txt(body.stationId, 80);
  if (!codeBib || !stationId) fail("SCAN_INVALIDE");
  if (!validJoinCode(code)) fail("CODE_INVALIDE", 404);
  const { data, error } = await c.rpc("cross_register_segmented_scan_internal", {
    p_station_code_hash: await sha(code),
    p_bib_code: codeBib,
    p_station_id: stationId,
  });
  if (error) {
    // Réponse perdue après validation : une relance sur le même poste confirme
    // l'arrivée existante, sans ajouter de scan ni modifier son ordre.
    if (String(error.message).includes("DOSSARD_DEJA_SCANNÉ")) {
      const heat = await heatByCode(c, code);
      const existing = await c.from("cross_entries")
        .select("finish_position,station_order,station_position,elapsed_ms,participant:cross_participants!inner(bib_code,first_name,last_name,class_name)")
        .eq("heat_id", heat.id).eq("status", "finished").eq("station_id", stationId)
        .eq("participant.bib_code", codeBib).maybeSingle();
      if (existing.error) throw existing.error;
      if (existing.data) {
        const person = Array.isArray(existing.data.participant) ? existing.data.participant[0] : existing.data.participant;
        return { arrival: { ...existing.data, ...person, participant: undefined }, replay: true };
      }
    }
    throw error;
  }
  return { arrival: data?.[0] ?? null };
}

async function undoLast(body: J) {
  const c = client();
  const code = txt(body.stationCode, 40).toUpperCase();
  const stationId = txt(body.stationId, 80);
  if (!validJoinCode(code)) fail("CODE_INVALIDE", 404);
  const { data, error } = await c.rpc("cross_undo_last_scan_internal", {
    p_station_code_hash: await sha(code),
    p_client_station_id: stationId,
  });
  if (error) throw error;
  return data;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(request) });
  if (request.method !== "POST") return res(request, { error: "METHODE_INVALIDE" }, 405);
  const origin = request.headers.get("origin");
  if (origin && !ORIGINS.has(origin)) return res(request, { error: "ORIGINE_INTERDITE" }, 403);
  try {
    const body = await request.json() as J;
    const action = txt(body.action, 60);
    const handlers: Record<string, () => Promise<unknown>> = {
      sync_event: () => syncEvent(body),
      owner_state: () => ownerState(body),
      create_heat: () => saveHeatPlan(body),
      update_heat: () => saveHeatPlan(body),
      start_heat: () => startHeat(body),
      finish_heat: () => finishHeat(body),
      heat_entries: () => heatEntries(body),
      set_entry_status: () => setStatus(body),
      remove_finish: () => removeFinish(body),
      reorder_finish: () => reorder(body),
      delete_heat: () => deleteHeat(body),
      delete_event: () => deleteEvent(body),
      join_station: () => joinStation(body),
      station_state: () => stationState(body),
      scan: () => scan(body),
      undo_last_scan: () => undoLast(body),
    };
    if (!handlers[action]) return res(request, { error: "ACTION_INCONNUE" }, 404);
    return res(request, { data: await handlers[action]() });
  } catch (error) {
    const raw = error instanceof Error
      ? error.message
      : typeof error === "object" && error && "message" in error
        ? String((error as { message?: unknown }).message)
        : "ERREUR_SERVEUR";
    const candidateStatus = typeof error === "object" && error && "status" in error
      ? Number((error as { status?: unknown }).status)
      : 400;
    const known = raw.match(/(HORAIRE_INVALIDE|NOM_COURSE_REQUIS|FILTRE_INVALIDE|CODE_INVALIDE|CODE_GENERATION_IMPOSSIBLE|COURSE_NON_DEMARREE|COURSE_DEJA_TERMINEE|COURSE_TERMINEE_VERROUILLEE|DOSSARD_INCONNU|DOSSARD_DEJA_SCANNÉ|DOSSARDS_DUPLIQUES|IDENTIFIANTS_DUPLIQUES|DOSSARD_HISTORIQUE_CONFLIT|PARTICIPANT_INVALIDE|PARTICIPANT_DISPENSÉ|PARTICIPANT_ABSENT|CLE_ORGANISATEUR_INVALIDE|EVENEMENT_INTROUVABLE|COURSE_INTROUVABLE|AUCUN_PARTICIPANT|COURSE_DEJA_DEMARREE|SUPPRIMER_ARRIVEE_DABORD|TERMINER_LA_COURSE_DABORD|PARTICIPANT_INTROUVABLE|ARRIVEE_INTROUVABLE|POSTE_NON_ENREGISTRE|POSTE_INVALIDE|POSTE_DEBUT_DEJA_PRIS|POSTE_DEBUT_REQUIS|MAX_POSTES_ATTEINT|AUCUNE_ARRIVEE_A_ANNULER|STATUT_INVALIDE|POSITION_INVALIDE|SCAN_INVALIDE|LISTE_PARTICIPANTS_INVALIDE)/)?.[1];
    console.error(raw);
    return res(request, { error: known ?? "ERREUR_SERVEUR" }, Number.isFinite(candidateStatus) ? candidateStatus : 400);
  }
});
