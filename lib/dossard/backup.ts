import { getOwnerKeyForBackup, restoreOwnerKey } from "./race-api";
import { saveEvent, saveTemplate } from "./storage";
import type { BibTemplate, RaceEvent } from "./types";

interface CrossBackup {
  format: "gestion-cross-backup";
  version: 1;
  createdAt: string;
  ownerKey: string;
  events: RaceEvent[];
  templates: BibTemplate[];
}

function validEvent(value: unknown): value is RaceEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<RaceEvent>;
  return typeof event.id === "string"
    && typeof event.name === "string"
    && Array.isArray(event.participants)
    && Boolean(event.template)
    && Array.isArray(event.template?.elements);
}
function validTemplate(value: unknown): value is BibTemplate {
  if (!value || typeof value !== "object") return false;
  const template = value as Partial<BibTemplate>;
  return typeof template.id === "string" && typeof template.name === "string" && Array.isArray(template.elements);
}

export function downloadCrossBackup(events: RaceEvent[], templates: BibTemplate[]) {
  const backup: CrossBackup = {
    format: "gestion-cross-backup",
    version: 1,
    createdAt: new Date().toISOString(),
    ownerKey: getOwnerKeyForBackup(),
    events,
    templates,
  };
  const bytes = JSON.stringify(backup);
  const blob = new Blob([bytes], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `gestion-cross-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function restoreCrossBackup(file: File) {
  if (file.size > 30 * 1024 * 1024) throw new Error("La sauvegarde dépasse 30 Mo.");
  const parsed = JSON.parse(await file.text()) as Partial<CrossBackup>;
  if (parsed.format !== "gestion-cross-backup" || parsed.version !== 1) throw new Error("Ce fichier n’est pas une sauvegarde Gestion Cross compatible.");
  if (!Array.isArray(parsed.events) || !parsed.events.every(validEvent)) throw new Error("La liste des cross de la sauvegarde est invalide.");
  if (!Array.isArray(parsed.templates) || !parsed.templates.every(validTemplate)) throw new Error("Les modèles de dossard de la sauvegarde sont invalides.");
  if (typeof parsed.ownerKey !== "string") throw new Error("La clé organisateur de la sauvegarde est absente.");

  restoreOwnerKey(parsed.ownerKey);
  for (const event of parsed.events) await saveEvent(event);
  for (const template of parsed.templates) await saveTemplate(template);
  return { events: parsed.events.length, templates: parsed.templates.length };
}
