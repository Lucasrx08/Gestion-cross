/** Tests d’intégration explicites sur des données fictives isolées. Jamais exécutés par la CI. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { gradeCategory, rankWithinCategory } from "../lib/dossard/challenge";
import { parseCrossBackup } from "../lib/dossard/backup-validation";
import { createRaceEvent } from "../lib/dossard/defaults";
import type {
  CloudHeat,
  HeatEntry,
  StationState,
} from "../lib/dossard/race-api";
if (!process.argv.includes("--live"))
  throw new Error(
    "Ajoutez --live pour créer puis supprimer un cross fictif sur le serveur configuré.",
  );
const url = "https://iybbfprsnhvdbpvftwjk.supabase.co/functions/v1/race-api";
const publishable = "sb_publishable_bEJiROkfolgJkX4LqsXmDw_6vUspKNu";
const ownerKey = randomBytes(32).toString("hex"),
  localEventId = `qa-20261001-${randomUUID()}`;
const event = createRaceEvent({
  name: "QA FICTIF — audit 01/10/2026",
  year: 2026,
  location: "TEST AUTOMATISÉ",
});
event.id = localEventId;
const classes = [
  "6e A",
  "6ème B",
  "5e A",
  "5e B",
  "CM1 A",
  "CM1B",
  "CM1",
  "CM2 A",
  "CM2 B",
];
event.participants = Array.from({ length: 1107 }, (_, index) => ({
  id: randomUUID(),
  sourceRow: index + 2,
  bibNumber: index + 1,
  technicalId: String(index + 1).padStart(4, "0"),
  lastName: "FICTIF",
  firstName: `Test-${index + 1}`,
  className: classes[index % classes.length],
  sex: index % 2 ? "M" : "F",
  issues: [],
}));
async function call<T>(
  action: string,
  payload: Record<string, unknown> = {},
  owner = true,
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { apikey: publishable, "Content-Type": "application/json" },
    body: JSON.stringify({
      action,
      ...(owner ? { ownerKey } : {}),
      ...payload,
    }),
    signal: AbortSignal.timeout(25000),
  });
  const data = (await response.json()) as { error?: string; data: T };
  if (!response.ok || data.error)
    throw new Error(data.error ?? `HTTP_${response.status}`);
  return data.data;
}
let heatId = "",
  checks = 0;
function passed(label: string) {
  checks++;
  console.log(`✓ ${label}`);
}
try {
  const synced = await call<{
    event: { id: string };
    participantCount: number;
  }>("sync_event", { event });
  assert.equal(synced.participantCount, 1107);
  passed("Synchronisation 1 107 élèves fictifs");
  const created = await call<{ heat: CloudHeat }>("create_heat", {
    eventId: synced.event.id,
    name: "Course fictive multi-niveaux",
    selectedClasses: classes,
    sexFilter: "all",
    challengeEnabled: true,
    challengeClasses: classes,
    participantIds: event.participants.map((p) => p.id),
    scheduledTime: "10:15",
  });
  heatId = created.heat.id;
  let details = await call<{ heat: CloudHeat; entries: HeatEntry[] }>(
    "heat_entries",
    { heatId },
  );
  assert.equal(details.entries.length, 1107);
  passed("Pagination : toutes les entrées récupérées au-delà de 1 000");
  const starts = await Promise.all([
    call<{ stationCode: string }>("start_heat", { heatId }),
    call<{ stationCode: string }>("start_heat", { heatId }),
  ]);
  assert.equal(starts[0].stationCode, starts[1].stationCode);
  const stationCode = starts[0].stationCode;
  passed("Double lancement : un seul départ et un seul code");
  const posts = Array.from(
    { length: 4 },
    (_, i) => `qa-post-${i + 1}-${randomUUID()}`,
  );
  await call(
    "join_station",
    { stationCode, stationId: posts[0], mode: "start" },
    false,
  );
  await Promise.all(
    posts
      .slice(1)
      .map((stationId) =>
        call(
          "join_station",
          { stationCode, stationId, mode: "continue" },
          false,
        ),
      ),
  );
  const station = await call<StationState>(
    "station_state",
    { stationCode, stationId: posts[0] },
    false,
  );
  assert.equal(station.stations.length, 4);
  assert.deepEqual(
    station.stations.map((s) => s.station_order),
    [1, 2, 3, 4],
  );
  passed("Trois jonctions concurrentes : quatre postes uniques");
  await assert.rejects(
    () =>
      call(
        "join_station",
        { stationCode, stationId: "qa-fifth", mode: "continue" },
        false,
      ),
    /MAX_POSTES_ATTEINT/,
  );
  passed("Cinquième poste refusé");
  await Promise.all(
    posts.map(async (stationId, post) => {
      for (let offset = 0; offset < 30; offset++)
        await call(
          "scan",
          {
            stationCode,
            stationId,
            bibCode: event.participants[post * 30 + offset].technicalId,
          },
          false,
        );
    }),
  );
  details = await call("heat_entries", { heatId });
  const finished = details.entries.filter((e) => e.status === "finished");
  assert.equal(finished.length, 120);
  assert.deepEqual(
    finished.map((e) => e.finish_position),
    Array.from({ length: 120 }, (_, i) => i + 1),
  );
  passed("120 scans / 4 postes simultanés : pas de perte ni rang dupliqué");
  const local = await call<StationState>(
    "station_state",
    { stationCode, stationId: posts[0] },
    false,
  );
  assert.equal(local.myScanCount, 30);
  assert.equal(local.recent.length, 12);
  assert(local.recent.every((e) => e.station_id === posts[0]));
  passed("Historique et compteur du poste indépendants des autres postes");
  const replay = await call<{
    replay: boolean;
    arrival: { finish_position: number };
  }>("scan", { stationCode, stationId: posts[0], bibCode: "0001" }, false);
  assert.equal(replay.replay, true);
  assert.equal(replay.arrival.finish_position, 1);
  passed("Réponse perdue simulée : relance idempotente du même dossard");
  await assert.rejects(
    () =>
      call(
        "scan",
        { stationCode, stationId: posts[1], bibCode: "0001" },
        false,
      ),
    /DOSSARD_DEJA_SCANNÉ/,
  );
  passed("Doublon sur un autre poste refusé");
  const ranks = rankWithinCategory(finished);
  for (const grade of ["CM1", "CM2", "6e", "5e"]) {
    const members = finished.filter(
      (e) => gradeCategory(e.participant.class_name) === grade,
    );
    assert.deepEqual(
      members.map((e) => ranks.get(e.id)?.rank),
      Array.from({ length: members.length }, (_, i) => i + 1),
    );
  }
  passed("Rangs indépendants CM1 / CM2 / 6e / 5e dans la même course");
  await call("undo_last_scan", { stationCode, stationId: posts[0] }, false);
  await call(
    "scan",
    { stationCode, stationId: posts[0], bibCode: "0030" },
    false,
  );
  passed("Annulation puis nouvelle lecture cohérentes");
  const raceEntry = details.entries.find(
    (e) => e.participant.bib_code === "0121",
  )!;
  await Promise.allSettled([
    call("set_entry_status", { entryId: raceEntry.id, status: "absent" }),
    call("scan", { stationCode, stationId: posts[0], bibCode: "0121" }, false),
  ]);
  details = await call("heat_entries", { heatId });
  const raced = details.entries.find((e) => e.id === raceEntry.id)!;
  assert(
    raced.status === "finished"
      ? raced.finish_position != null
      : raced.status === "absent" && raced.finish_position === null,
  );
  passed("Scan et déclaration absent simultanés : état final cohérent");
  const target = details.entries.find(
    (e) => e.participant.bib_code === "0001",
  )!;
  await Promise.allSettled([
    call("remove_finish", { entryId: target.id }),
    call("scan", { stationCode, stationId: posts[0], bibCode: "0001" }, false),
  ]);
  details = await call("heat_entries", { heatId });
  const after = details.entries.find((e) => e.id === target.id)!;
  assert(
    after.status === "finished"
      ? after.finish_position != null
      : after.status === "registered" && after.finish_position === null,
  );
  passed(
    "Retrait et scan simultanés : journal et arrivée non partiellement modifiés",
  );
  await assert.rejects(
    () => call("delete_event", { localEventId }),
    /TERMINER_LA_COURSE_DABORD/,
  );
  await assert.rejects(
    () => call("delete_heat", { heatId }),
    /TERMINER_LA_COURSE_DABORD/,
  );
  passed("Suppression impossible pendant une course");
  await call("finish_heat", { heatId });
  await assert.rejects(
    () => call("undo_last_scan", { stationCode, stationId: posts[0] }, false),
    /COURSE_TERMINEE_VERROUILLEE/,
  );
  passed("Course close : poste verrouillé");
  details = await call("heat_entries", { heatId });
  const first = details.entries.find((e) => e.status === "finished")!;
  await call("reorder_finish", { entryId: first.id, position: 2 });
  await call("remove_finish", { entryId: first.id });
  details = await call("heat_entries", { heatId });
  assert.equal(details.entries.find((e) => e.id === first.id)?.status, "dnf");
  passed(
    "Correction organisateur après clôture : déplacement puis retrait en abandon",
  );
  const snapshot = parseCrossBackup({
    format: "gestion-cross-backup",
    version: 2,
    createdAt: new Date().toISOString(),
    ownerKey,
    events: [
      {
        ...event,
        raceArchive: { savedAt: new Date().toISOString(), courses: [details] },
      },
    ],
    templates: [],
  });
  assert.equal(snapshot.events[0].raceArchive!.courses[0].entries.length, 1107);
  passed("Sauvegarde v2 validée avec la réponse serveur réelle");
  const wrong = await call<{ event: null; heats: unknown[] }>("owner_state", {
    localEventId,
    ownerKey: randomBytes(32).toString("hex"),
  });
  assert.equal(wrong.event, null);
  assert.deepEqual(wrong.heats, []);
  passed("Un autre accès organisateur ne voit pas le cross");
  console.log(`\n${checks} scénarios serveur réussis.`);
} finally {
  if (heatId) await call("finish_heat", { heatId }).catch(() => undefined);
  const cleanup = await call<{ deleted: boolean }>("delete_event", {
    localEventId,
  });
  assert(cleanup.deleted);
  console.log(
    "✓ Cross fictif et données de test supprimés (périmètre de ce test uniquement).",
  );
}
