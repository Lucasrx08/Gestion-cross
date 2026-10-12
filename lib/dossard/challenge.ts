import type { HeatEntry } from "./race-api";

export function classKey(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  // 6e, 6ème, 6eme, 6 E et leurs variantes avec nom de classe partagent la même clé.
  return normalized
    .replace(/^([3456])\s*(?:E|EME)(?=\s|$)/, "$1EME")
    .replace(/^2\s*(?:NDE|DE)(?=\s|$)/, "2NDE")
    .replace(/^1\s*(?:ERE|RE)(?=\s|$)/, "1ERE");
}

export function gradeCategory(value: string) {
  const key = classKey(value);
  // Une classe à double niveau ne permet pas de déduire le niveau de chaque élève.
  // On la conserve distincte plutôt que de la classer arbitrairement en CM1/CE1.
  if (/^(?:CM1\s+CM2|CE1\s+CE2|CE2\s+CM1|CP\s+CE1)\b/.test(key)) return key;
  const primary = key.match(/^(CP|CE\s*[12]|CM\s*[12])(?=\s|$|[A-Z])/);
  if (primary) return primary[1].replace(/\s/g, "");
  const college = key.match(/^([3456])\s*(?:EME|IEME|E)(?=\s|$|[A-Z])/);
  if (college) return `${college[1]}e`;
  const words: Record<string, string> = {
    SIXIEME: "6e",
    CINQUIEME: "5e",
    QUATRIEME: "4e",
    TROISIEME: "3e",
    SECONDE: "2nde",
    PREMIERE: "1re",
    TERMINALE: "Terminale",
    TERM: "Terminale",
  };
  const word = key.split(" ")[0];
  if (words[word]) return words[word];
  if (/^2\s*(?:NDE|ND|DE)/.test(key)) return "2nde";
  if (/^1\s*(?:ERE|ER|RE)/.test(key)) return "1re";
  return key || "Sans catégorie";
}

export const gradeOrder = [
  "CP",
  "CE1",
  "CE2",
  "CM1",
  "CM2",
  "6e",
  "5e",
  "4e",
  "3e",
  "2nde",
  "1re",
  "Terminale",
];
export function individualCategory(className: string, sex?: string) {
  const normalized = classKey(sex ?? "");
  const label = ["F", "FILLE", "FILLES", "FEMININ", "FEMALE", "GIRL"].includes(normalized)
    ? "filles"
    : ["M", "G", "GARCON", "GARCONS", "MASCULIN", "MALE", "BOY"].includes(normalized)
      ? "garçons"
      : "sexe non renseigné";
  return `${gradeCategory(className)} · ${label}`;
}

export function compareCategories(a: string, b: string) {
  const ai = gradeOrder.indexOf(a.split(" · ")[0]),
    bi = gradeOrder.indexOf(b.split(" · ")[0]);
  return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.localeCompare(b, "fr");
}

export function individualGroups(entries: HeatEntry[]) {
  const ranks = rankWithinCategory(entries);
  const groups = new Map<string, HeatEntry[]>();
  entries.forEach((entry) => {
    const category = individualCategory(entry.participant.class_name, entry.participant.sex);
    groups.set(category, [...(groups.get(category) ?? []), entry]);
  });
  return [...groups]
    .sort(([a], [b]) => compareCategories(a, b))
    .map(([category, members]) => ({
      category,
      entries: members.sort(
        (a, b) =>
          (a.finish_position ?? Infinity) - (b.finish_position ?? Infinity) ||
          a.participant.last_name.localeCompare(
            b.participant.last_name,
            "fr",
          ) ||
          a.participant.bib_number - b.participant.bib_number,
      ),
      ranks,
      finished: members.filter((entry) => ranks.has(entry.id)).length,
    }));
}

export function rankWithinCategory(entries: HeatEntry[]) {
  const ranked = entries
    .filter(
      (entry) => entry.status === "finished" && entry.finish_position != null,
    )
    .slice()
    .sort(
      (a, b) =>
        (a.finish_position ?? Infinity) - (b.finish_position ?? Infinity),
    );
  const ranks = new Map<string, { category: string; rank: number }>();
  const counts = new Map<string, number>();
  ranked.forEach((entry) => {
    const category = individualCategory(entry.participant.class_name, entry.participant.sex);
    const rank = (counts.get(category) ?? 0) + 1;
    counts.set(category, rank);
    ranks.set(entry.id, { category, rank });
  });
  return ranks;
}

export function challengePenalties(entries: HeatEntry[]) {
  const ranks = rankWithinCategory(entries);
  const last = Math.max(0, ...[...ranks.values()].map(value => value.rank));
  const byCategory = new Map<string, number>();
  ranks.forEach(({ category, rank }) => byCategory.set(category, rank));
  return { last, absent: last + 1, exempt: 0, dnf: last + 10, ranks, byCategory };
}

export function challengePoints(entry: HeatEntry, penalties: ReturnType<typeof challengePenalties>): number | null {
  if (entry.status === "exempt" || entry.status === "registered") return null;
  if (entry.status === "finished") return penalties.ranks.get(entry.id)?.rank ?? null;
  const category = individualCategory(entry.participant.class_name, entry.participant.sex);
  const last = penalties.byCategory.get(category) ?? 0;
  return last + (entry.status === "dnf" ? 10 : 1);
}

export function challengeSex(entry: HeatEntry): "girls" | "boys" | "unknown" {
  const category = individualCategory(entry.participant.class_name, entry.participant.sex);
  return category.endsWith(" · filles") ? "girls" : category.endsWith(" · garçons") ? "boys" : "unknown";
}

export function challengeRatios(result: { girls: number; boys: number; girlsPoints: number; boysPoints: number; unknown: number; pending: number }) {
  const girlsRatio = result.girls ? result.girlsPoints / result.girls : null;
  const boysRatio = result.boys ? result.boysPoints / result.boys : null;
  return {
    girlsRatio, boysRatio,
    score: result.unknown || result.pending ? null : (girlsRatio ?? 0) + (boysRatio ?? 0),
    complete: girlsRatio !== null && boysRatio !== null && result.unknown === 0 && result.pending === 0,
  };
}

export function formatChallengeScore(score: number | null) {
  return score === null ? "—" : score.toLocaleString("fr", { maximumFractionDigits: 3 });
}

export function buildChallenge(entries: HeatEntry[], classes: string[]) {
  const penalties = challengePenalties(entries);
  const labels = new Map<string, string>();
  (classes.length ? classes : entries.map(entry => entry.participant.class_name)).forEach(value => {
    const key = classKey(value);
    if (key && !labels.has(key)) labels.set(key, value.trim());
  });
  return [...labels].map(([key, className]) => {
    const members = entries.filter(entry => classKey(entry.participant.class_name) === key);
    const totals = { girls: 0, boys: 0, unknown: 0, girlsPoints: 0, boysPoints: 0, points: 0, members: 0, exempt: 0, pending: 0 };
    for (const entry of members) {
      if (entry.status === "exempt") { totals.exempt++; continue; }
      if (entry.status === "registered") { totals.pending++; continue; }
      const points = challengePoints(entry, penalties);
      if (points === null) { totals.pending++; continue; }
      const sex = challengeSex(entry);
      totals[sex]++;
      if (sex === "girls") totals.girlsPoints += points;
      if (sex === "boys") totals.boysPoints += points;
      totals.points += points;
      totals.members++;
    }
    return { className, ...totals, ...challengeRatios(totals), penalties };
  }).filter(item => item.members || item.pending)
    .sort((a, b) => (a.score ?? Infinity) - (b.score ?? Infinity) || a.className.localeCompare(b.className, "fr"));
}

export const challengeRule =
  "Dispensés : aucun point, exclus des effectifs. Absents : dernier du niveau et du sexe + 1. Non finishers : dernier + 10. Moyenne filles = points filles ÷ effectif filles (arrivées, absentes et non finishers) ; idem garçons. Score de classe = moyenne filles + moyenne garçons. Le plus petit score gagne. Classement provisoire tant que les deux groupes ne sont pas disponibles.";
