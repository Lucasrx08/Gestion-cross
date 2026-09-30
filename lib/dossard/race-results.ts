import { buildChallenge, challengePenalties, challengePoints, challengeRule, classKey } from "./challenge";
import { formatElapsed, type CloudHeat, type HeatEntry } from "./race-api";

const labels = { registered: "À courir", finished: "Arrivé", dnf: "Abandon", exempt: "Dispensé", absent: "Absent" };
function fileName(value: string) { return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "résultats"; }

export async function exportRaceResults(courses: Array<{ heat: CloudHeat; entries: HeatEntry[] }>, name: string, kind: "individual" | "classes") {
  const XLSX = await import("xlsx");
  const book = XLSX.utils.book_new();
  for (const [index, { heat, entries }] of courses.entries()) {
    const rows: unknown[][] = [[heat.name], []];
    if (kind === "individual") {
      rows.push(["Rang", "Dossard", "Nom", "Prénom", "Classe", "Sexe", "Temps", "Statut"]);
      [...entries].sort((a, b) => (a.finish_position ?? Infinity) - (b.finish_position ?? Infinity) || a.participant.last_name.localeCompare(b.participant.last_name, "fr")).forEach((entry) => rows.push([
        entry.finish_position ?? "", entry.participant.bib_number, entry.participant.last_name, entry.participant.first_name, entry.participant.class_name, entry.participant.sex, entry.elapsed_ms == null ? "" : formatElapsed(entry.elapsed_ms), labels[entry.status],
      ]));
    } else {
      if (!heat.challenge_enabled) continue;
      rows.push([challengeRule], [], ["Rang", "Classe", "Points", "Élèves comptabilisés"]);
      buildChallenge(entries, heat.challenge_classes.length ? heat.challenge_classes : heat.selected_classes).forEach((result, position) => rows.push([position + 1, result.className, result.points, result.members]));
      rows.push([], ["Détail de tous les élèves"], ["Classe", "Dossard", "Nom", "Prénom", "Statut", "Points"]);
      const penalties = challengePenalties(entries);
      const selectedClasses = new Set(buildChallenge(entries, heat.challenge_classes.length ? heat.challenge_classes : heat.selected_classes).map((result) => classKey(result.className)));
      entries.filter((entry) => selectedClasses.has(classKey(entry.participant.class_name))).forEach((entry) => rows.push([entry.participant.class_name, entry.participant.bib_number, entry.participant.last_name, entry.participant.first_name, labels[entry.status], challengePoints(entry, penalties)]));
    }
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    sheet["!cols"] = kind === "individual" ? [8, 12, 25, 22, 32, 10, 16, 18].map((wch) => ({ wch })) : [28, 18, 25, 25, 18, 12].map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(book, sheet, `${index + 1} ${heat.name}`.replace(/[\\/?*\[\]:]/g, "-").slice(0, 31));
  }
  if (book.SheetNames.length) XLSX.writeFile(book, `${fileName(name)}-${kind === "individual" ? "classements" : "challenge-interclasses"}.xlsx`);
}
