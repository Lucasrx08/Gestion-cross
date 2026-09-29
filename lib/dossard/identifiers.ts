import type { NumberingConfig, Participant } from "./types";
export function createLocalId(): string { const bytes = new Uint8Array(16); if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") crypto.getRandomValues(bytes); else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256); bytes[6] = (bytes[6] & 0x0f) | 0x40; bytes[8] = (bytes[8] & 0x3f) | 0x80; const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(""); return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`; }
export function sanitizePrefix(prefix: string): string { return prefix.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 16); }
export function shortNumber(number: number, digits: number): string { return String(number).padStart(Math.max(1, digits), "0"); }
export function technicalId(config: NumberingConfig, number: number): string {
  const prefix = sanitizePrefix(config.prefix);
  const numberPart = shortNumber(number, config.digits);
  return prefix ? `${prefix}-${numberPart}` : numberPart;
}
/**
 * Uniformise les caractères produits par les douchettes configurées avec une
 * disposition de clavier différente de celle de l'ordinateur (ex. § à la
 * place de - sur certains claviers français).
 */
export function normalizeScannedIdentifier(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toUpperCase()
    .replace(/[§_‐‑‒–—−﹘﹣－]/g, "-")
    .replace(/\s+/g, "");
}
export function renumberParticipants(participants: Participant[], config: NumberingConfig): Participant[] { return participants.map((participant, index) => { const bibNumber = config.start + index; return { ...participant, bibNumber, technicalId: technicalId(config, bibNumber) }; }); }
export function nextAvailableNumber(participants: Participant[], start: number): number { return participants.length ? Math.max(start - 1, ...participants.map((participant) => participant.bibNumber)) + 1 : start; }
