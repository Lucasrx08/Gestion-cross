import { classKey } from "./challenge";
import type { Participant } from "./types";

const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);

export function participantRoster(participants: Participant[]) {
  const groups = new Map<string, { className: string; participants: Participant[] }>();
  for (const participant of participants) {
    const key = classKey(participant.className);
    const group = groups.get(key) ?? { className: participant.className.trim() || "Sans classe", participants: [] };
    group.participants.push(participant);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.className.localeCompare(b.className, "fr", { numeric: true })).map(group => ({
    ...group,
    participants: [...group.participants].sort((a, b) => a.lastName.localeCompare(b.lastName, "fr") || a.firstName.localeCompare(b.firstName, "fr") || a.bibNumber - b.bibNumber),
  }));
}

export function rosterPrintDocument(name: string, participants: Participant[]) {
  const sections = participantRoster(participants).map(group => `<section><h2>${escapeHtml(group.className)} · ${group.participants.length} élève(s)</h2><table><thead><tr><th>Nom</th><th>Prénom</th><th>N° de dossard</th><th>Code à saisir au scan</th></tr></thead><tbody>${group.participants.map(p => `<tr><td>${escapeHtml(p.lastName.toLocaleUpperCase("fr"))}</td><td>${escapeHtml(p.firstName)}</td><td><b>${escapeHtml(p.bibNumber)}</b></td><td class="code">${escapeHtml(p.technicalId)}</td></tr>`).join("")}</tbody></table></section>`).join("");
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(name)} · Liste des dossards par classe</title><style>@page{size:A4;margin:14mm}body{font:12px Arial,sans-serif;color:#102347}h1{font-size:22px}h2{font-size:18px;color:#1154b3}section+section{break-before:page}thead{display:table-header-group}tr{break-inside:avoid}table{width:100%;border-collapse:collapse}th,td{padding:9px 6px;border-bottom:1px solid #dbe5f2;text-align:left}th{background:#eef4fc}.code{font-family:monospace;font-size:13px}p{color:#475569}</style></head><body><h1>${escapeHtml(name)}</h1><p>Liste de secours des dossards · ${participants.length} élève(s). Au scan, saisissez le code complet indiqué dans la dernière colonne, en conservant le préfixe et les zéros éventuels.</p>${sections}</body></html>`;
}
