import assert from "node:assert/strict";
import { buildChallenge, challengePenalties, challengePoints } from "../lib/dossard/challenge";
import type { HeatEntry } from "../lib/dossard/race-api";

function entry(number: number, status: HeatEntry["status"], className = "6ème A", position: number | null = null): HeatEntry {
  return { id: String(number), status, finish_position: position, elapsed_ms: null, station_order: null, station_position: null, scanned_at: null, station_id: null, participant: { id: String(number), local_participant_id: String(number), bib_code: String(number).padStart(4, "0"), bib_number: number, last_name: "TEST", first_name: `Élève ${number}`, class_name: className, sex: "F" } };
}

const members = Array.from({ length: 12 }, (_, index) => entry(index + 1, "finished", index === 11 ? "6eme A" : "6ème A", index + 1));
members.push(entry(13, "exempt"), entry(14, "absent"), entry(15, "dnf"));
const penalties = challengePenalties(members);
assert.deepEqual(penalties, { last: 12, absent: 13, exempt: 13, dnf: 22 });
assert.equal(challengePoints(members[14], penalties), 22);
const results = buildChallenge(members, ["6ème A", "6eme A"]);
assert.equal(results.length, 1);
assert.equal(results[0].members, 15, "Chaque élève doit compter, même au-delà des dix premiers");
assert.equal(results[0].points, 126, "Somme des 12 rangs + 13 + 13 + 22");
assert.deepEqual(challengePenalties([entry(1, "dnf")]), { last: 0, absent: 1, exempt: 1, dnf: 10 });
assert.equal(buildChallenge([...members, entry(16, "finished", "5ème B", 1)], ["5ème B"])[0].members, 1);
console.log("✓ Challenge : tous les élèves, variantes de classe, abandon dernier + 10, absents/dispensés dernier + 1, aucune arrivée");
