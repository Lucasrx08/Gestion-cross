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

export function challengePenalties(entries: HeatEntry[]) {
  const last = Math.max(0, ...entries.filter((entry) => entry.status === "finished").map((entry) => entry.finish_position ?? 0));
  return { last, absent: last + 1, exempt: last + 1, dnf: last + 10 };
}

export function challengePoints(entry: HeatEntry, penalties: ReturnType<typeof challengePenalties>) {
  if (entry.status === "finished" && entry.finish_position != null) return entry.finish_position;
  return entry.status === "dnf" ? penalties.dnf : penalties.absent;
}

export function buildChallenge(entries: HeatEntry[], classes: string[]) {
  const penalties = challengePenalties(entries);
  const labels = new Map<string, string>();
  (classes.length ? classes : entries.map((entry) => entry.participant.class_name)).forEach((value) => {
    const key = classKey(value);
    if (key && !labels.has(key)) labels.set(key, value.trim());
  });
  return [...labels].map(([key, className]) => {
    const members = entries.filter((entry) => classKey(entry.participant.class_name) === key);
    return { className, points: members.reduce((sum, entry) => sum + challengePoints(entry, penalties), 0), members: members.length, penalties };
  }).filter((item) => item.members > 0).sort((a, b) => a.points - b.points || a.className.localeCompare(b.className, "fr"));
}

export const challengeRule = "Tous les élèves comptent. Absents et dispensés : dernier arrivé + 1. Abandons (non-finisseurs) : dernier arrivé + 10. Le plus petit total gagne.";
