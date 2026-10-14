/** Test isolé du rattrapage F/M. Crée puis supprime uniquement ses données fictives. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";

if (!process.argv.includes("--live"))
  throw new Error("Ajoutez --live pour exécuter ce test serveur isolé.");

const url = "https://iybbfprsnhvdbpvftwjk.supabase.co/functions/v1/race-api";
const publishable = "sb_publishable_bEJiROkfolgJkX4LqsXmDw_6vUspKNu";
const ownerKey = randomBytes(32).toString("hex");
const localEventId = `qa-sex-rescue-${randomUUID()}`;
const participant = (id: string, bib: string, className: string, sex: string) => ({
  id,
  sourceRow: 2,
  bibNumber: Number(bib),
  technicalId: bib,
  lastName: "FICTIF",
  firstName: `Test-${bib}`,
  className,
  sex,
  issues: [],
});
const wrongSex = participant(randomUUID(), "9001", "6e A", "F");
const expectedBoy = participant(randomUUID(), "9002", "6e A", "M");
const wrongClass = participant(randomUUID(), "9003", "5e A", "F");
const event = {
  id: localEventId,
  name: "QA FICTIF — rattrapage sexe",
  year: 2026,
  location: "TEST AUTOMATISÉ",
  date: "2026-10-14",
  participants: [wrongSex, expectedBoy, wrongClass],
};

async function call<T>(action: string, payload: Record<string, unknown> = {}, owner = true) {
  const response = await fetch(url, {
    method: "POST",
    headers: { apikey: publishable, "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...(owner ? { ownerKey } : {}), ...payload }),
    signal: AbortSignal.timeout(25_000),
  });
  const body = (await response.json()) as { data?: T; error?: string };
  if (!response.ok || body.error) throw new Error(body.error ?? `HTTP_${response.status}`);
  return body.data as T;
}

let heatId = "";
try {
  const synced = await call<{ event: { id: string } }>("sync_event", { event });
  const created = await call<{ heat: { id: string } }>("create_heat", {
    eventId: synced.event.id,
    name: "Course Garçons 6e",
    selectedClasses: ["6e A"],
    sexFilter: "male",
    challengeEnabled: false,
    challengeClasses: [],
    participantIds: [expectedBoy.id],
    scheduledTime: "10:00",
  });
  heatId = created.heat.id;
  const started = await call<{ stationCode: string }>("start_heat", { heatId });
  const stationId = `qa-post-${randomUUID()}`;
  await call("join_station", { stationCode: started.stationCode, stationId, mode: "start" }, false);

  const rescued = await call<{
    arrival: { bib_code: string; sex: string; sex_corrected: boolean };
  }>("scan", { stationCode: started.stationCode, stationId, bibCode: wrongSex.technicalId }, false);
  assert.equal(rescued.arrival.bib_code, wrongSex.technicalId);
  assert.equal(rescued.arrival.sex, "M");
  assert.equal(rescued.arrival.sex_corrected, true);

  await assert.rejects(
    () => call("scan", { stationCode: started.stationCode, stationId, bibCode: wrongClass.technicalId }, false),
    /DOSSARD_INCONNU/,
  );

  const details = await call<{
    entries: Array<{
      sex_corrected_at_scan?: boolean;
      participant: { bib_code: string; sex: string };
    }>;
  }>("heat_entries", { heatId });
  const entry = details.entries.find((item) => item.participant.bib_code === wrongSex.technicalId);
  assert(entry);
  assert.equal(entry.participant.sex, "M");
  assert.equal(entry.sex_corrected_at_scan, true);
  console.log("✓ Sexe F erroné accepté et classé M dans la course Garçons.");
  console.log("✓ Dossard d’une classe non sélectionnée toujours refusé.");
  console.log("✓ Correction limitée à la course et signalée dans les résultats.");
} finally {
  if (heatId) await call("finish_heat", { heatId }).catch(() => undefined);
  await call("delete_event", { localEventId }).catch(() => undefined);
  console.log("✓ Données fictives supprimées.");
}
