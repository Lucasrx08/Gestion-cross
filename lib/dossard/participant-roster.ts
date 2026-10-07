import { eventDocumentHeader, eventDocumentStyles } from "./event-branding";
import { classKey } from "./challenge";
import type { Participant, ResultBranding } from "./types";

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

export function rosterPrintDocument(name: string, participants: Participant[], branding: ResultBranding = {title:name}) {
  const pages: string[] = [];
  for (const group of participantRoster(participants)) {
    const count = Math.ceil(group.participants.length / 24);
    for (let page = 0; page < count; page++) {
      const rows = group.participants.slice(page * 24, (page + 1) * 24);
      pages.push(`<section class="roster-page">${eventDocumentHeader({...branding, title:branding.title || name})}<div class="class-heading"><h2>${escapeHtml(group.className)}</h2><span>${group.participants.length} élèves${count > 1 ? ` · ${page + 1}/${count}` : ""}</span></div><p>Liste des dossards par classe · Saisir le code complet indiqué, avec ses éventuels zéros et préfixe.</p><table><thead><tr><th style="width:32%">Nom</th><th style="width:24%">Prénom</th><th style="width:16%">Dossard</th><th style="width:28%">Code à saisir au scan</th></tr></thead><tbody>${rows.map(p => `<tr><td>${escapeHtml(p.lastName.toLocaleUpperCase("fr"))}</td><td>${escapeHtml(p.firstName)}</td><td><b>${escapeHtml(p.bibNumber)}</b></td><td class="code">${escapeHtml(p.technicalId)}</td></tr>`).join("")}</tbody></table><div class="footer">${escapeHtml(branding.title || name)} · Liste des dossards · Gestion Cross · L. RIGAUX</div></section>`);
    }
  }
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>${escapeHtml(branding.title || name)} · Liste des dossards par classe</title><style>${eventDocumentStyles(branding)}.roster-page{max-width:186mm;margin:0 auto}.roster-page+.roster-page{break-before:page}.class-heading{display:flex;align-items:center;justify-content:space-between;gap:4mm}.class-heading h2{margin:0}.class-heading span{font-size:12px;color:#475569}.code{font-family:monospace;font-size:13px;font-weight:bold}table{table-layout:fixed}td{height:6.8mm;padding:1.5mm 2mm}section>p{font-size:11px;line-height:1.4;margin:3mm 0}header.event-header h1{font-size:20px}</style></head><body>${pages.join("")}</body></html>`;
}
