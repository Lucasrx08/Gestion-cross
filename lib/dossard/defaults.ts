import type { BibTemplate, LayoutElement, RaceEvent } from "./types";
import { createLocalId } from "./identifiers";
export const A5_LANDSCAPE = { widthMm: 210, heightMm: 148 } as const;
const nowIso = () => new Date().toISOString();
const prefixStopWords = new Set(["de", "des", "du", "la", "le", "les", "l", "d", "et"]);
function defaultPrefix(name: string, year: number): string {
  const words = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word && !prefixStopWords.has(word));
  const initials = words.map((word) => word[0]).join("").toUpperCase().slice(0, 6) || "COURSE";
  return `${initials}${String(year).slice(-2)}`;
}
export const elementLabels: Record<LayoutElement["type"], string> = { number: "Numéro", lastName: "Nom", firstName: "Prénom", fullName: "Nom + prénom", className: "Classe", sex: "Sexe", barcode: "Code-barres", qrcode: "QR code", freeText: "Texte libre" };
export function createElement(type: LayoutElement["type"], index = 0): LayoutElement {
  const base: LayoutElement = { id: createLocalId(), type, name: elementLabels[type], xMm: 20 + index * 2, yMm: 20 + index * 2, widthMm: 80, heightMm: 14, fontSizePt: 24, minFontSizePt: 8, bold: type === "number" || type === "fullName", italic: false, color: "#17202a", align: "center" };
  if (type === "number") return { ...base, xMm: 20, yMm: 24, widthMm: 170, heightMm: 49, fontSizePt: 92 };
  if (type === "fullName") return { ...base, xMm: 15, yMm: 80, widthMm: 180, heightMm: 15, fontSizePt: 28 };
  if (type === "className") return { ...base, xMm: 15, yMm: 97, widthMm: 180, heightMm: 11, fontSizePt: 19 };
  if (type === "barcode") return { ...base, xMm: 27, yMm: 112, widthMm: 112, heightMm: 27, fontSizePt: 7, showHumanReadable: true };
  if (type === "qrcode") return { ...base, xMm: 164, yMm: 112, widthMm: 27, heightMm: 27, fontSizePt: 8 };
  if (type === "freeText") return { ...base, xMm: 15, yMm: 8, widthMm: 180, heightMm: 10, fontSizePt: 15, bold: true, content: "{{event}} • {{year}}" };
  return base;
}
export function createDefaultTemplate(name = "Dossard A5 paysage"): BibTemplate { const now = nowIso(); return { id: createLocalId(), name, ...A5_LANDSCAPE, orientation: "landscape", elements: [createElement("freeText"), createElement("number"), createElement("fullName"), createElement("className"), createElement("barcode"), createElement("qrcode")], createdAt: now, updatedAt: now }; }
export function createRaceEvent(input?: Partial<Pick<RaceEvent, "name" | "year" | "location" | "date">>): RaceEvent { const now = nowIso(); const year = input?.year ?? new Date().getFullYear(); const name = input?.name?.trim() || "Nouvelle course"; return { id: createLocalId(), name, year, location: input?.location?.trim() || "Saint-Lô", date: input?.date || "", numbering: { prefix: defaultPrefix(name, year), start: 1, digits: 4 }, participants: [], template: createDefaultTemplate("Dossard de course"), createdAt: now, updatedAt: now }; }
