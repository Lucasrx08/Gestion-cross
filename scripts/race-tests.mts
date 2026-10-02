import assert from "node:assert/strict";
import { buildChallenge, challengePenalties, challengePoints, gradeCategory, rankWithinCategory } from "../lib/dossard/challenge";
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

const mixedGradeFinish = [
  entry(21, "finished", "6e A", 1),
  entry(22, "finished", "CM1 A", 2),
  entry(23, "finished", "6ème B", 3),
  entry(24, "finished", "CM1", 4),
  entry(25, "finished", "CM2 B", 5),
  entry(26, "finished", "5e C", 6),
];
const categoryRanks = rankWithinCategory(mixedGradeFinish);
assert.equal(gradeCategory("CM1 B"), "CM1");
assert.equal(gradeCategory("CM1"), "CM1");
assert.equal(gradeCategory("CM2 A"), "CM2");
assert.deepEqual(categoryRanks.get("21"), { category: "6e · filles", rank: 1 });
assert.deepEqual(categoryRanks.get("23"), { category: "6e · filles", rank: 2 });
assert.deepEqual(categoryRanks.get("22"), { category: "CM1 · filles", rank: 1 });
assert.deepEqual(categoryRanks.get("24"), { category: "CM1 · filles", rank: 2 });
assert.deepEqual(categoryRanks.get("25"), { category: "CM2 · filles", rank: 1 });
assert.deepEqual(categoryRanks.get("26"), { category: "5e · filles", rank: 1 });
console.log("✓ Challenge : tous les élèves, variantes de classe, abandon dernier + 10, absents/dispensés dernier + 1, aucune arrivée");
