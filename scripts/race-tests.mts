import assert from "node:assert/strict";
import { buildChallenge, challengePenalties, challengePoints, gradeCategory, rankWithinCategory } from "../lib/dossard/challenge";
import { overallChallenge, buildRaceWorkbook } from "../lib/dossard/race-results";
import type { CloudHeat, HeatEntry } from "../lib/dossard/race-api";

function entry(number: number, status: HeatEntry["status"], className = "6ème A", position: number | null = null): HeatEntry {
  return { id: String(number), status, finish_position: position, elapsed_ms: null, station_order: null, station_position: null, scanned_at: null, station_id: null, participant: { id: String(number), local_participant_id: String(number), bib_code: String(number).padStart(4, "0"), bib_number: number, last_name: "TEST", first_name: `Élève ${number}`, class_name: className, sex: "F" } };
}

const members = Array.from({ length: 12 }, (_, index) => entry(index + 1, "finished", index === 11 ? "6eme A" : "6ème A", index + 1));
members.push(entry(13, "exempt"), entry(14, "absent"), entry(15, "dnf"));
const penalties = challengePenalties(members);
assert.deepEqual([penalties.last, penalties.absent, penalties.exempt, penalties.dnf], [12, 13, 0, 22]);
assert.equal(challengePoints(members[12], penalties), null);
assert.equal(challengePoints(members[14], penalties), 22);
const results = buildChallenge(members, ["6ème A", "6eme A"]);
assert.equal(results.length, 1);
assert.equal(results[0].members, 14, "Dispensé exclu du diviseur ; les 12 arrivés, absent et non finisher comptent");
assert.equal(results[0].points, 113, "Somme des 12 rangs + 13 + 22 ; dispensé exclu");
assert.equal(results[0].girlsRatio, 113 / 14);
assert.equal(challengePoints(entry(1, "dnf"), challengePenalties([])), 10);
assert.equal(challengePoints(entry(1, "absent"), challengePenalties([])), 1);
assert.equal(challengePoints(entry(1, "registered"), penalties), null);
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
const lycéeRanks = rankWithinCategory([
  entry(27, "finished", "2nde A", 1),
  entry(28, "finished", "Terminale ST2S A", 2),
  entry(29, "finished", "Première ECP", 3),
]);
assert.deepEqual(lycéeRanks.get("27"), { category: "Lycée · filles", rank: 1 });
assert.deepEqual(lycéeRanks.get("28"), { category: "Lycée · filles", rank: 2 });
assert.deepEqual(lycéeRanks.get("29"), { category: "Lycée · filles", rank: 3 });
console.log("✓ Challenge : dispensés exclus, moyennes, abandon dernier + 10, absent dernier + 1 et aucune arrivée");

const heat: CloudHeat = { id: "qa", event_id: "qa", name: "Course fictive", status: "finished", selected_classes: [], sex_filter: "all", challenge_enabled: true, challenge_classes: [], challenge_best_count: null, next_position: 1 };
const boy = (e: HeatEntry): HeatEntry => ({ ...e, participant: { ...e.participant, sex: "M" } });
const girls = [entry(101, "finished", "6e A", 1), entry(102, "finished", "6e A", 2), entry(103, "finished", "6e A", 3), entry(104, "finished", "6e A", 4), entry(105, "finished", "6e B", 5), entry(106, "exempt", "6e A")];
const boys = girls.filter(e => e.status !== "exempt").map((e, i) => boy({ ...e, id: `boy-${i}` }));
const courseData = [{ heat: { ...heat, id: "girls" }, entries: girls }, { heat: { ...heat, id: "boys" }, entries: boys }];
const ratios = overallChallenge(courseData);
assert.deepEqual(ratios.map(r => [r.className, r.score, r.girlsRatio, r.boysRatio, r.members, r.exempt]), [["6e A", 5, 2.5, 2.5, 8, 1], ["6e B", 10, 5, 5, 2, 0]], "Le ratio doit gagner même si la somme brute de A est supérieure à celle de B");
const penalized = [...girls, entry(107, "absent", "6e A"), entry(108, "dnf", "6e A"), entry(109, "registered", "6e B")];
const penaltyResults = buildChallenge(penalized, []);
const classA = penaltyResults.find(r => r.className === "6e A")!;
assert.equal(classA.points, 10 + 6 + 15);
assert.equal(classA.members, 6);
assert.equal(classA.girlsRatio, 31 / 6);
assert.equal(classA.exempt, 1);
assert.equal(penaltyResults.find(r => r.className === "6e B")!.score, null, "À courir n’est pas automatiquement absent");
const weighted = overallChallenge([
  { heat, entries: girls.slice(0, 2) },
  { heat: { ...heat, id: "second" }, entries: [entry(110, "finished", "6e A", 1)] },
  { heat: { ...heat, id: "boys" }, entries: [boy(entry(111, "finished", "6e A", 1))] },
])[0];
assert.equal(weighted.girlsRatio, 4 / 3, "Les points et effectifs sont cumulés avant division, pas les moyennes des courses");
assert.equal(weighted.score, 4 / 3 + 1);
const mixed = [entry(201, "finished", "6e A", 1), boy(entry(202, "finished", "6e A", 2)), entry(203, "finished", "5e B", 3), entry(204, "finished", "6e B", 4), entry(205, "absent", "6e A"), boy(entry(206, "dnf", "6e A"))];
const mixedPenalties = challengePenalties(mixed);
assert.equal(challengePoints(mixed[3], mixedPenalties), 2, "Rang du niveau et du sexe, pas arrivée commune");
assert.equal(challengePoints(mixed[4], mixedPenalties), 3, "Absent filles : dernière fille de 6e +1");
assert.equal(challengePoints(mixed[5], mixedPenalties), 11, "Non finisher garçons : dernier garçon de 6e +10");
assert.equal(buildChallenge([entry(301, "exempt")], []).length, 0, "Une classe entièrement dispensée ne gagne pas avec zéro point");
assert.equal(overallChallenge([{ heat, entries: girls }])[0].complete, false, "Pas de vainqueur définitif avant les garçons");
const unknown = { ...entry(302, "finished", "6e A", 6), participant: { ...entry(302, "finished").participant, class_name: "6e A", sex: "" } };
const invalid = overallChallenge([{ heat, entries: [...girls, ...boys, unknown] }]).find(r => r.className === "6e A")!;
assert.equal(invalid.score, null, "Un sexe inconnu ne peut produire un score validé");
const book = await buildRaceWorkbook(courseData, "classes");
const XLSX = await import("xlsx");
const general = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets["Classement général"], { header: 1, blankrows: true });
assert.equal(general[5][2], 5);
assert.equal(general[5][3], 2.5);
assert.equal(general[5][9], 1);
const details = book.SheetNames.slice(1).flatMap(name => XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[name], { header: 1, blankrows: true }));
assert(details.some(row => row.includes("Dispensé") && row.includes("Exclu")));
console.log("✓ Moyennes filles + garçons, effectifs inégaux, pondération, pénalités par catégorie, états provisoires et Excel cohérent");
