import type { Participant } from "./types";
import { classKey } from "./challenge";
export type BibPrintSort = "class-name" | "name" | "number";
export function sortBibParticipants(participants: Participant[], sort: BibPrintSort) {
  const compare = (a: string, b: string) => a.localeCompare(b, "fr", { numeric: true, sensitivity: "base" });
  return [...participants].sort((a, b) => (sort === "number" ? a.bibNumber - b.bibNumber : (sort === "class-name" ? compare(a.className, b.className) : 0) || compare(a.lastName, b.lastName) || compare(a.firstName, b.firstName) || a.bibNumber - b.bibNumber));
}
/** Nullable slots keep an odd class from sharing its last sheet with another class. */
export function arrangeBibSheets(participants: Participant[], cutAndStack: boolean, perClass = false): Array<Participant | null> {
  const groups = new Map<string, Participant[]>();
  for (const p of participants) {
    const key = perClass ? classKey(p.className) : "all";
    const group = groups.get(key) ?? []; group.push(p); groups.set(key, group);
  }
  const result: Array<Participant | null> = [];
  for (const group of groups.values()) {
    if (!cutAndStack) { result.push(...group); if (perClass && group.length % 2) result.push(null); continue; }
    const half = Math.ceil(group.length / 2);
    for (let page = 0; page < half; page++) result.push(group[page], group[page + half] ?? null);
  }
  return result;
}
