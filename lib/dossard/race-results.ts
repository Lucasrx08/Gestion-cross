import {
  buildChallenge,
  challengePenalties,
  challengePoints,
  challengeRule,
  classKey,
  gradeCategory,
  individualCategory,
  challengeRatios,
  individualGroups,
  rankWithinCategory,
} from "./challenge";
import { type CloudHeat, type HeatEntry } from "./race-api";

const labels = {
  registered: "À courir",
  finished: "Arrivé",
  dnf: "Abandon",
  exempt: "Dispensé",
  absent: "Absent",
};
function fileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "résultats";
}

export function overallChallenge(
  courses: Array<{ heat: CloudHeat; entries: HeatEntry[] }>,
  grade = "all",
) {
  const totals = new Map<string, {
    className: string; points: number; members: number; courses: number;
    girls: number; boys: number; unknown: number; girlsPoints: number; boysPoints: number; exempt: number; pending: number;
  }>();
  courses.filter(({ heat }) => heat.challenge_enabled && heat.status === "finished").forEach(({ heat, entries }) => {
    buildChallenge(entries, heat.challenge_classes.length ? heat.challenge_classes : heat.selected_classes).forEach(result => {
      const key = classKey(result.className);
      const current = totals.get(key) ?? { className: result.className, points: 0, members: 0, courses: 0, girls: 0, boys: 0, unknown: 0, girlsPoints: 0, boysPoints: 0, exempt: 0, pending: 0 };
      for (const field of ["points", "members", "girls", "boys", "unknown", "girlsPoints", "boysPoints", "exempt", "pending"] as const) current[field] += result[field];
      current.courses++;
      totals.set(key, current);
    });
  });
  return [...totals.values()].map(result => ({ ...result, ...challengeRatios(result) }))
    .filter(result => gradeCategory(result.className) !== "Lycée")
    .filter(result => grade === "all" || gradeCategory(result.className) === grade)
    .sort((a, b) => Number(b.complete) - Number(a.complete) || (a.score ?? Infinity) - (b.score ?? Infinity) || a.className.localeCompare(b.className, "fr"));
}

export async function buildRaceWorkbook(
  courses: Array<{ heat: CloudHeat; entries: HeatEntry[] }>,
  kind: "individual" | "classes",
  grade = "all",
) {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  const append = (rows: unknown[][], title: string, widths: number[]) => {
    const base = title.replace(/[\\/?*\[\]:]/g, "-").trim() || "Résultats";
    let safe = base.slice(0, 31),
      suffix = 2;
    while (
      book.SheetNames.some((name) => name.toLowerCase() === safe.toLowerCase())
    ) {
      const ending = ` (${suffix++})`;
      safe = base.slice(0, 31 - ending.length) + ending;
    }
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = widths.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(book, sheet, safe);
  };

  if (
    kind === "classes" &&
    courses.some(({ heat }) => heat.challenge_enabled && heat.status === "finished")
  ) {
    const rows: unknown[][] = [
      [grade === "all" ? "Challenge interclasses général" : `Challenge interclasses · ${grade}`],
      [challengeRule],
      [
        "Les points et effectifs de chaque sexe sont cumulés avant division. Le score est la somme des deux moyennes, sans arrondi pour le classement.",
      ],
      [],
      ["Rang", "Classe", "Score (moyennes F + G)", "Moyenne filles", "Moyenne garçons", "Effectif filles", "Effectif garçons", "Points filles", "Points garçons", "Dispensés exclus", "Statut"],
    ];
    overallChallenge(courses, grade).forEach((result, index) =>
      rows.push([
        result.complete ? index + 1 : "",
        result.className, result.score, result.girlsRatio, result.boysRatio,
        result.girls, result.boys, result.girlsPoints, result.boysPoints, result.exempt,
        result.complete ? "Complet" : result.unknown ? "Sexe à renseigner" : "Provisoire",
      ]),
    );
    append(rows, "Classement général", [8, 30, 26, 18, 18, 18, 18, 16, 16, 20, 24]);
  }

  for (const [index, { heat, entries }] of courses.entries()) {
    const classResults = buildChallenge(entries, heat.challenge_classes.length ? heat.challenge_classes : heat.selected_classes).filter(result => grade === "all" || gradeCategory(result.className) === grade);
    if (kind === "classes" && !classResults.length) continue;
    const rows: unknown[][] = [[heat.name], []];
    if (kind === "individual") {
      rows.push([
        "Arrivée commune",
        "Rang catégorie",
        "Catégorie (niveau et sexe)",
        "Dossard",
        "Nom",
        "Prénom",
        "Classe",
        "Sexe",
        "Statut",
      ]);
      const categoryRanks = rankWithinCategory(entries);
      [...entries]
        .sort(
          (a, b) =>
            (a.finish_position ?? Infinity) - (b.finish_position ?? Infinity) ||
            a.participant.last_name.localeCompare(
              b.participant.last_name,
              "fr",
            ),
        )
        .forEach((entry) => {
          const category = categoryRanks.get(entry.id);
          rows.push([
            entry.finish_position ?? "",
            category?.rank ?? "",
            category?.category ?? individualCategory(entry.participant.class_name, entry.participant.sex),
            entry.participant.bib_number,
            entry.participant.last_name,
            entry.participant.first_name,
            entry.participant.class_name,
            entry.participant.sex,
            labels[entry.status],
          ]);
        });
    } else {
      if (!heat.challenge_enabled) continue;
      rows.push(
        [challengeRule],
        [],
        ["Rang", "Classe", "Score", "Moyenne filles", "Moyenne garçons", "Points", "Élèves comptabilisés", "Dispensés exclus"],
      );
      classResults.forEach((result, position) =>
        rows.push([
          position + 1,
          result.className, result.score, result.girlsRatio, result.boysRatio,
          result.points, result.members, result.exempt,
        ]),
      );
      rows.push(
        [],
        ["Détail de tous les élèves"],
        ["Classe", "Dossard", "Nom", "Prénom", "Statut", "Points"],
      );
      const penalties = challengePenalties(entries);
      const selectedClasses = new Set(
        classResults.map((result) => classKey(result.className)),
      );
      entries
        .filter((entry) =>
          selectedClasses.has(classKey(entry.participant.class_name)),
        )
        .forEach((entry) =>
          rows.push([
            entry.participant.class_name,
            entry.participant.bib_number,
            entry.participant.last_name,
            entry.participant.first_name,
            labels[entry.status],
            challengePoints(entry, penalties) ?? (entry.status === "exempt" ? "Exclu" : "À courir"),
          ]),
        );
    }
    append(
      rows,
      `${index + 1} ${heat.name}`,
      kind === "individual"
        ? [18, 14, 26, 12, 25, 22, 32, 10, 18]
        : [28, 18, 25, 25, 18, 12],
    );
    if (kind === "individual") {
      for (const group of individualGroups(entries)) {
        const gradeRows: unknown[][] = [
          [heat.name, `Catégorie ${group.category}`],
          [
            "Les classes du même niveau et du même sexe sont regroupées ; le rang d’arrivée conserve l’ordre commun.",
          ],
          [],
          [
            "Rang catégorie",
            "Arrivée commune",
            "Dossard",
            "Nom",
            "Prénom",
            "Classe",
            "Statut",
          ],
        ];
        group.entries.forEach((entry) =>
          gradeRows.push([
            group.ranks.get(entry.id)?.rank ?? "",
            entry.finish_position ?? "",
            entry.participant.bib_number,
            entry.participant.last_name,
            entry.participant.first_name,
            entry.participant.class_name,
            labels[entry.status],
          ]),
        );
        // Le niveau est placé en tête pour rester visible même avec un long nom de course.
        append(
          gradeRows,
          `${index + 1} ${group.category} - ${heat.name}`,
          [16, 18, 12, 25, 22, 30, 18],
        );
      }
    }
  }
  return book;
}

export async function exportRaceResults(
  courses: Array<{ heat: CloudHeat; entries: HeatEntry[] }>,
  name: string,
  kind: "individual" | "classes",
  grade = "all",
) {
  const XLSX = await import("xlsx");
  const book = await buildRaceWorkbook(courses, kind, grade);
  if (book.SheetNames.length)
    XLSX.writeFile(
      book,
      `${fileName(name)}-${kind === "individual" ? "classements" : "challenge-interclasses"}${grade === "all" ? "" : `-${fileName(grade)}`}.xlsx`,
    );
}
