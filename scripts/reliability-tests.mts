import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { createRaceEvent } from "../lib/dossard/defaults";
import {
  gradeCategory,
  individualCategory,
  individualGroups,
  rankWithinCategory,
} from "../lib/dossard/challenge";
import { parseCrossBackup } from "../lib/dossard/backup-validation";
import { ScanQueue } from "../lib/dossard/scan-queue";
import { buildRaceWorkbook, overallChallenge } from "../lib/dossard/race-results";
import { participantRoster, rosterPrintDocument } from "../lib/dossard/participant-roster";
import { drawSocialResults } from "../lib/dossard/social-results";
import {
  buildValidationChecks,
  validateParticipants,
} from "../lib/dossard/validation";
import {
  isRetryableRaceError,
  type CloudHeat,
  type HeatEntry,
} from "../lib/dossard/race-api";

let checks = 0;
function test(label: string, action: () => void) {
  action();
  checks++;
  console.log(`✓ ${label}`);
}
const variants: Array<[string, string]> = [
  ["CM1 A", "CM1"],
  ["CM1B", "CM1"],
  ["CM 2 B", "CM2"],
  ["CM2", "CM2"],
  ["6e Avignon", "6e"],
  ["6èmeB", "6e"],
  ["Sixième C", "6e"],
  ["5 E Pasteur", "5e"],
  ["Cinquième", "5e"],
  ["CE 1 A", "CE1"],
  ["CP Garçons", "CP"],
  ["CE2 B", "CE2"],
  ["4ème Flessel", "4e"],
  ["Troisième Gaudí", "3e"],
  ["2nde A", "2nde"],
  ["Première B", "1re"],
  ["Terminale C", "Terminale"],
  ["CM1/CM2", "CM1 CM2"],
  ["Groupe bleu", "GROUPE BLEU"],
  ["", "Sans catégorie"],
];
variants.forEach(([label, expected]) =>
  test(`Niveau « ${label} » → ${expected}`, () =>
    assert.equal(gradeCategory(label), expected)),
);
function entry(
  index: number,
  className: string,
  position: number | null,
  status: HeatEntry["status"] = "finished",
): HeatEntry {
  return {
    id: `entry-${index}`,
    status,
    finish_position: position,
    station_order: null,
    station_position: null,
    elapsed_ms: 12345,
    station_id: null,
    scanned_at: null,
    participant: {
      id: `p-${index}`,
      local_participant_id: `p-${index}`,
      bib_code: String(index).padStart(4, "0"),
      bib_number: index,
      last_name: "FICTIF",
      first_name: `Test-${index}`,
      class_name: className,
      sex: "F",
    },
  };
}
const entries = [
  entry(1, "6e A", 1),
  entry(2, "5e B", 2),
  entry(3, "CM1 A", 3),
  entry(4, "CM2 B", 4),
  entry(5, "CM1B", 5),
  entry(6, "6ème C", 6),
  entry(7, "CM1", null, "absent"),
];
test("Arrivées mélangées : rangs 6e et CM1 indépendants, absent non classé", () => {
  const ranks = rankWithinCategory(entries);
  assert.deepEqual(ranks.get("entry-6"), { category: "6e · filles", rank: 2 });
  assert.deepEqual(ranks.get("entry-5"), { category: "CM1 · filles", rank: 2 });
  assert.equal(ranks.has("entry-7"), false);
  assert.deepEqual(
    individualGroups(entries).map((g) => [g.category, g.entries.length]),
    [
      ["CM1 · filles", 3],
      ["CM2 · filles", 1],
      ["6e · filles", 2],
      ["5e · filles", 1],
    ],
  );
});

const mixedSexEntries = [
  entry(101, "CP A", 1),
  { ...entry(102, "CP B", 2), participant: { ...entry(102, "CP B", 2).participant, sex: "M" } },
  entry(103, "CP B", 3),
  { ...entry(104, "CP A", 4), participant: { ...entry(104, "CP A", 4).participant, sex: "Garçon" } },
  { ...entry(105, "CP", 5), participant: { ...entry(105, "CP", 5).participant, sex: "" } },
  entry(106, "CP A", null, "exempt"),
];
test("CP filles/garçons mélangés : rangs indépendants, classes A/B regroupées, sexe inconnu isolé", () => {
  const ranks = rankWithinCategory(mixedSexEntries);
  assert.equal(ranks.get("entry-103")?.rank, 2);
  assert.deepEqual(ranks.get("entry-104"), { category: "CP · garçons", rank: 2 });
  assert.deepEqual(ranks.get("entry-105"), { category: "CP · sexe non renseigné", rank: 1 });
  assert.equal(ranks.has("entry-106"), false);
  assert.deepEqual(individualGroups(mixedSexEntries).map(g => [g.category, g.entries.length]), [
    ["CP · filles", 3], ["CP · garçons", 2], ["CP · sexe non renseigné", 1],
  ]);
  assert.equal(individualCategory("CP Garçons", "F"), "CP · filles", "Le sexe de l’élève fait foi, pas le nom de classe");
  assert.equal(individualCategory("CE1 A", "féminin"), "CE1 · filles");
  assert.equal(individualCategory("CE2 B", "boy"), "CE2 · garçons");
});

const map = new Map<string, string>();
let blocked = false;
const storage = {
  getItem: (key: string) => map.get(key) ?? null,
  setItem: (key: string, value: string) => {
    if (blocked) throw new Error("quota");
    map.set(key, value);
  },
};
test("File persistante : ordre FIFO et restauration après rechargement", () => {
  const q = new ScanQueue(storage, "test");
  q.add("0001");
  q.add("0002");
  const restored = new ScanQueue(storage, "test");
  assert.deepEqual(restored.snapshot(), ["0001", "0002"]);
  restored.complete();
  assert.equal(restored.first, "0002");
});
test("Un stockage indisponible ne perd pas un scan ni ne valide un ajout", () => {
  const q = new ScanQueue(storage, "test");
  blocked = true;
  assert.throws(() => q.complete());
  assert.throws(() => q.add("0003"));
  assert.deepEqual(q.snapshot(), ["0002"]);
  blocked = false;
});
test("File corrompue : refus explicite, jamais de vidage silencieux", () => {
  map.set("bad", '{"unexpected":true}');
  assert.throws(() => new ScanQueue(storage, "bad"));
  assert.equal(map.get("bad"), '{"unexpected":true}');
});
test("Réseau/timeout : réessai ; dossard inconnu : refus sans réessai infini", () => {
  assert(isRetryableRaceError(new Error("REQUEST_TIMEOUT")));
  assert(isRetryableRaceError(new Error("ARRIVEE_NON_ENREGISTREE")));
  assert(!isRetryableRaceError(new Error("DOSSARD_INCONNU")));
});

const event = createRaceEvent({ name: "Cross fictif" });
event.participants = entries.map((e, index) => ({
  id: e.participant.id,
  sourceRow: index + 2,
  bibNumber: e.participant.bib_number,
  technicalId: e.participant.bib_code,
  lastName: "FICTIF",
  firstName: `Test-${index}`,
  className: e.participant.class_name,
  sex: "F",
  issues: [],
}));
const backup = {
  format: "gestion-cross-backup",
  version: 1,
  createdAt: new Date().toISOString(),
  ownerKey: "a".repeat(64),
  events: [event],
  templates: [event.template],
};
test("Sauvegarde v1 conservée : modèles et élèves valides", () =>
  assert.equal(parseCrossBackup(backup).events[0].participants.length, 7));
test("Sauvegarde invalide/refusée : clé, géométrie et IDs dupliqués", () => {
  assert.throws(() => parseCrossBackup({ ...backup, ownerKey: "wrong" }));
  const bad = structuredClone(backup);
  bad.events[0].template.elements[0].widthMm = -5;
  assert.throws(() => parseCrossBackup(bad));
  assert.throws(() => parseCrossBackup({ ...backup, events: [event, event] }));
});
const heat: CloudHeat = {
  id: "heat",
  event_id: "event",
  name: "CM1/CM2 & collège — course avec un nom extrêmement long",
  status: "finished",
  selected_classes: ["CM1", "CM2", "6e", "5e"],
  sex_filter: "all",
  challenge_enabled: true,
  challenge_classes: [],
  challenge_best_count: null,
  next_position: 7,
};
test("Sauvegarde v2 : archive complète et suppression des codes de partage", () => {
  const withArchive = {
    ...event,
    raceArchive: {
      savedAt: new Date().toISOString(),
      courses: [
        {
          heat: {
            ...heat,
            station_code: "123456",
            station_code_hash: "secret-hash",
          },
          entries,
        },
      ],
    },
  };
  const restored = parseCrossBackup({
    ...backup,
    version: 2,
    events: [withArchive],
  });
  assert.equal(restored.events[0].raceArchive!.courses[0].entries.length, 7);
  assert(!JSON.stringify(restored).includes("secret-hash"));
  assert(!JSON.stringify(restored).includes("123456"));
});
test("Numéros identiques, même avec codes différents : bloqués", () => {
  const duplicate = {
    ...event.participants[1],
    bibNumber: event.participants[0].bibNumber,
  };
  assert(
    validateParticipants([event.participants[0], duplicate]).every((p) =>
      p.issues.some((i) => i.code === "duplicate-number"),
    ),
  );
});
test("Dossard par défaut prêt ; texte sur code et modules trop fins bloqués", () => {
  assert(buildValidationChecks(event).every((c) => c.status !== "error"));
  const overlap = structuredClone(event);
  const barcode = overlap.template.elements.find((e) => e.type === "barcode")!;
  overlap.template.elements[0].xMm = barcode.xMm;
  overlap.template.elements[0].yMm = barcode.yMm;
  assert.equal(
    buildValidationChecks(overlap).find((c) => c.id === "text-code-overlap")
      ?.status,
    "error",
  );
  const long = structuredClone(event);
  long.participants[0].technicalId = "x".repeat(40);
  assert.equal(
    buildValidationChecks(long).find((c) => c.id === "code-modules")?.status,
    "error",
  );
  long.participants[0].technicalId = "x".repeat(10000);
  assert.doesNotThrow(() => buildValidationChecks(long));
});
const workbook = await buildRaceWorkbook(
  [
    { heat, entries },
    { heat: { ...heat, id: "heat2" }, entries },
  ],
  "individual",
);
test("Excel : arrivée commune + une feuille distincte par niveau, noms uniques ≤ 31", () => {
  assert.equal(workbook.SheetNames.length, 10);
  assert.equal(new Set(workbook.SheetNames).size, 10);
  assert(workbook.SheetNames.every((name) => name.length <= 31));
  const cm1 =
    workbook.Sheets[
      workbook.SheetNames.find((name) => name.startsWith("1 CM1 · filles -"))!
    ];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(cm1, {
    header: 1,
    blankrows: true,
  });
  assert.equal(rows[4][0], 1);
  assert.equal(rows[5][0], 2);
  assert.equal(rows[5][1], 5);
  assert.equal(rows[6][6], "Absent");
});
const mixedBook = await buildRaceWorkbook([{ heat, entries: mixedSexEntries }], "individual");
test("Excel mixte : feuilles filles/garçons distinctes et rangs cohérents avec l’arrivée commune", () => {
  assert.equal(mixedBook.SheetNames.length, 4);
  const boysName = mixedBook.SheetNames.find(name => name.startsWith("1 CP · garçons -"))!;
  const boys = XLSX.utils.sheet_to_json<unknown[]>(mixedBook.Sheets[boysName], { header: 1, blankrows: true });
  assert.deepEqual(boys.slice(4).map(row => row.slice(0, 2)), [[1, 2], [2, 4]]);
  const common = XLSX.utils.sheet_to_json<unknown[]>(mixedBook.Sheets[mixedBook.SheetNames[0]], { header: 1, blankrows: true });
  assert.deepEqual(common[6].slice(0, 3), [4, 2, "CP · garçons"]);
});
const large = Array.from({ length: 1500 }, (_, index) =>
  entry(index + 1, index % 2 ? "CM1 A" : "CM2 B", index + 1),
);
const largeBook = await buildRaceWorkbook(
  [{ heat, entries: large }],
  "individual",
);
test("Excel 1 500 arrivées : aucune troncature, 750 par niveau", () => {
  assert.equal(
    XLSX.utils.sheet_to_json(largeBook.Sheets[largeBook.SheetNames[0]], {
      header: 1,
      blankrows: true,
    }).length,
    1503,
  );
  assert.equal(individualGroups(large)[0].finished, 750);
});
test("Challenge général : filles et garçons additionnés par classe sur des courses séparées", () => {
  const girls = [entry(1, "6e A", 1), entry(2, "6e B", 2)];
  const boys = [entry(3, "6ème A", 2), entry(4, "6e B", 1)].map(e => ({ ...e, participant: { ...e.participant, sex: "M" } }));
  const heats = [
    { heat: { ...heat, id: "girls", selected_classes: ["6e A", "6e B"], challenge_classes: ["6e A", "6e B"], challenge_enabled: true }, entries: girls },
    { heat: { ...heat, id: "boys", selected_classes: ["6ème A", "6e B"], challenge_classes: ["6ème A", "6e B"], challenge_enabled: true }, entries: boys },
  ];
  const result = overallChallenge(heats);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(r => [r.points, r.girls, r.boys, r.members, r.courses]), [[3, 1, 1, 2, 2], [3, 1, 1, 2, 2]]);
  assert.deepEqual(overallChallenge([...heats, { ...heats[0], heat: { ...heats[0].heat, status: "running" } }, { ...heats[1], heat: { ...heats[1].heat, challenge_enabled: false } }]), result);
});
test("Tous les classements Excel : arrivée commune présente et temps supprimé", () => {
  for (const name of mixedBook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(mixedBook.Sheets[name], { header: 1, blankrows: true });
    assert(rows.some(row => row.includes("Arrivée commune")));
    assert(!rows.some(row => row.includes("Temps")));
  }
});
test("Liste de secours : classe, nom, prénom, numéro et code complet ; texte HTML protégé", () => {
  const participants = [
    { ...event.participants[0], lastName: "Zulu", className: "6e B", technicalId: "CROSS-0007", bibNumber: 7 },
    { ...event.participants[1], lastName: "Albert", firstName: "Éloïse", className: "6e B", technicalId: "CROSS-0008", bibNumber: 8 },
    { ...event.participants[0], lastName: "<script>", className: "6ème A", technicalId: "CROSS-0009", bibNumber: 9 },
  ];
  const groups = participantRoster(participants);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.find(g => g.className === "6e B")!.participants.map(p => p.bibNumber), [8, 7]);
  const html = rosterPrintDocument("Cross & école", participants);
  assert(html.includes("CROSS-0007") && html.includes("Éloïse") && html.includes("&lt;SCRIPT&gt;"));
  assert(!html.includes("<script>"));
  assert(html.includes("Cross &amp; école"));
});
test("Challenge filtré : variantes 6ème/6e regroupées, points et effectifs filles/garçons conservés", () => {
  const data = [{ heat: { ...heat, challenge_enabled: true, challenge_classes: [], selected_classes: [] }, entries }];
  const all = overallChallenge(data);
  const sixth = overallChallenge(data, "6e");
  assert.deepEqual(sixth, all.filter(r => gradeCategory(r.className) === "6e"));
  assert.equal(sixth.length, 2);
  assert.deepEqual(overallChallenge(data, "3e"), []);
});
const filteredClassesBook = await buildRaceWorkbook([{ heat: { ...heat, challenge_enabled: true, challenge_classes: [], selected_classes: [] }, entries }], "classes", "6e");
test("Excel du challenge filtré : général et détails contiennent uniquement les classes du niveau choisi", () => {
  const rows = filteredClassesBook.SheetNames.flatMap(name => XLSX.utils.sheet_to_json<unknown[]>(filteredClassesBook.Sheets[name], { header: 1, blankrows: true }));
  assert(rows.some(row => row.includes("6e A")));
  assert(rows.some(row => row.includes("6ème C")));
  assert(!rows.some(row => row.some(cell => ["5e B", "CM1 A", "CM2 B", "CM1B", "CM1"].includes(String(cell)))));
});
test("Visuels blancs : logo séparé du titre, deux couleurs et lignes dans le cadre post/story", () => {
  for (const story of [false, true]) {
    const texts: Array<{value: string; y: number; colour: string}> = [];
    const rects: Array<{colour: string; width: number; height: number}> = [];
    let logoBottom = 0;
    const ctx = { fillStyle: "", font: "", textAlign: "", fillRect(this: {fillStyle: string}, _x: number, _y: number, width: number, height: number) { rects.push({ colour: this.fillStyle, width, height }); }, measureText(this: {font: string}, value: string) { return { width: value.length * Number.parseInt(this.font.split(" ")[1]) * .56 }; }, fillText(this: {fillStyle: string}, value: string, _x: number, y: number) { texts.push({ value, y, colour: this.fillStyle }); }, drawImage(_logo: unknown, _x: number, y: number, _w: number, h: number) { logoBottom = y + h; }, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} } as unknown as CanvasRenderingContext2D;
    drawSocialResults(ctx, { story, primary: "#bf1281", secondary: "#f198a5", title: "LA ROSE RUN 2026", subtitle: "Saint-Lô", heading: "CHALLENGE INTERCLASSES", category: "6ème · filles + garçons", note: "Tous les élèves comptent", rows: Array.from({length: 10}, (_,i) => ({rank: i + 1, label: "6e AVIGNON", detail: "130 pts"})) }, {width: 240, height: 320} as HTMLImageElement);
    assert.equal(rects[0].colour, "#ffffff");
    assert(texts[0].y > logoBottom + 40);
    const resultRows = texts.filter(t => t.value === "6e AVIGNON");
    assert.equal(resultRows.length, story ? 8 : 6);
    assert(resultRows.at(-1)!.y < (story ? 1920 : 1080) - 125);
    assert(texts.every(t => ["#bf1281", "#f198a5"].includes(t.colour)));
  }
});
console.log(`\n${checks} contrôles de fiabilité réussis.`);
