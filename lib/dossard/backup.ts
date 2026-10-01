import {
  getOwnerKeyForBackup,
  restoreOwnerKey,
  ownerApi,
  type CloudHeat,
  type HeatEntry,
} from "./race-api";
import { listEvents, restoreStoredData } from "./storage";
import { parseCrossBackup } from "./backup-validation";
import type { BibTemplate, RaceEvent } from "./types";

interface CrossBackup {
  format: "gestion-cross-backup";
  version: 2;
  createdAt: string;
  ownerKey: string;
  events: RaceEvent[];
  templates: BibTemplate[];
}

export async function downloadCrossBackup(
  events: RaceEvent[],
  templates: BibTemplate[],
) {
  let fresh = 0;
  const snapshots: RaceEvent[] = [];
  for (const event of events) {
    try {
      const state = await ownerApi<{ heats: CloudHeat[] }>("owner_state", {
        localEventId: event.id,
      });
      const courses: NonNullable<RaceEvent["raceArchive"]>["courses"] = [];
      for (const heat of state.heats) {
        const details = await ownerApi<{
          heat: CloudHeat;
          entries: HeatEntry[];
        }>("heat_entries", { heatId: heat.id });
        courses.push({
          heat: { ...details.heat, station_code: undefined },
          entries: details.entries,
        });
      }
      snapshots.push({
        ...event,
        raceArchive: { savedAt: new Date().toISOString(), courses },
      });
      fresh += 1;
    } catch {
      snapshots.push(event);
    }
  }
  if (
    fresh < events.length &&
    !window.confirm(
      "Le serveur n’a pas permis de récupérer toutes les courses. Télécharger quand même les données locales et les éventuelles archives précédentes ? Les résultats manquants ne seront pas sauvegardés.",
    )
  )
    return null;
  const backup: CrossBackup = {
    format: "gestion-cross-backup",
    version: 2,
    createdAt: new Date().toISOString(),
    ownerKey: getOwnerKeyForBackup(),
    events: snapshots,
    templates,
  };
  const validated = parseCrossBackup(backup);
  const bytes = JSON.stringify(validated);
  const blob = new Blob([bytes], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `gestion-cross-sauvegarde-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { complete: fresh === events.length, events: validated.events };
}

export async function restoreCrossBackup(file: File) {
  if (file.size > 100 * 1024 * 1024)
    throw new Error("La sauvegarde dépasse 100 Mo.");
  const parsed = parseCrossBackup(JSON.parse(await file.text()));
  const existing = await listEvents();
  if (existing.length && getOwnerKeyForBackup() !== parsed.ownerKey)
    throw new Error(
      "Cette sauvegarde appartient à un autre accès organisateur. Restaurez-la dans un navigateur vierge pour préserver l’accès aux cross déjà présents.",
    );
  await restoreStoredData(parsed.events, parsed.templates);
  restoreOwnerKey(parsed.ownerKey);
  return { events: parsed.events.length, templates: parsed.templates.length };
}
