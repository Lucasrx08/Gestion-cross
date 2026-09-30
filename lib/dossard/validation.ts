import type { LayoutElement, Participant, RaceEvent, ValidationCheck } from "./types";

const duplicateKey = (participant: Participant) => [participant.lastName, participant.firstName, participant.className]
  .map((value) => value.trim().toLocaleLowerCase("fr"))
  .join("|");
const female = /^(f|fille|female|féminin|feminin|girl)$/i;
const male = /^(m|garçon|garcon|male|masculin|boy)$/i;
const knownSex = (value?: string) => female.test((value ?? "").trim()) || male.test((value ?? "").trim());

function intersects(a: LayoutElement, b: LayoutElement) {
  return a.xMm < b.xMm + b.widthMm
    && a.xMm + a.widthMm > b.xMm
    && a.yMm < b.yMm + b.heightMm
    && a.yMm + a.heightMm > b.yMm;
}

export function validateParticipants(participants: Participant[]): Participant[] {
  const identities = new Map<string, number>();
  const ids = new Map<string, number>();
  for (const participant of participants) {
    const key = duplicateKey(participant);
    if (key !== "||") identities.set(key, (identities.get(key) ?? 0) + 1);
    ids.set(participant.technicalId, (ids.get(participant.technicalId) ?? 0) + 1);
  }
  return participants.map((participant) => {
    const issues = [];
    if (!participant.lastName.trim()) issues.push({ severity: "error" as const, code: "missing-last-name", message: "Nom manquant" });
    if (!participant.firstName.trim()) issues.push({ severity: "error" as const, code: "missing-first-name", message: "Prénom manquant" });
    if (!participant.className.trim()) issues.push({ severity: "error" as const, code: "missing-class", message: "Classe manquante" });
    if (!participant.technicalId.trim()) issues.push({ severity: "error" as const, code: "missing-id", message: "Identifiant manquant" });
    else if ((ids.get(participant.technicalId) ?? 0) > 1) issues.push({ severity: "error" as const, code: "duplicate-id", message: "Identifiant dupliqué" });
    if ((identities.get(duplicateKey(participant)) ?? 0) > 1) issues.push({ severity: "warning" as const, code: "possible-duplicate", message: "Doublon potentiel" });
    if (!knownSex(participant.sex)) issues.push({ severity: "warning" as const, code: "unknown-sex", message: "Sexe manquant ou non reconnu (utile pour les courses filles/garçons)" });
    return { ...participant, issues };
  });
}

export function buildValidationChecks(event: RaceEvent): ValidationCheck[] {
  const participants = validateParticipants(event.participants);
  const ids = new Set(participants.map((participant) => participant.technicalId));
  const errors = participants.flatMap((participant) => participant.issues).filter((issue) => issue.severity === "error");
  const warnings = participants.flatMap((participant) => participant.issues).filter((issue) => issue.severity === "warning");
  const outside = event.template.elements.filter((element) => element.xMm < 0 || element.yMm < 0 || element.xMm + element.widthMm > event.template.widthMm || element.yMm + element.heightMm > event.template.heightMm).length;
  const codes = event.template.elements.filter((element) => element.type === "barcode" || element.type === "qrcode");
  const invalidCodeSize = codes.filter((element) => element.type === "barcode"
    ? element.widthMm < 45 || element.heightMm < 14
    : element.widthMm < 18 || element.heightMm < 18).length;
  const codeOverlap = codes.filter((code, index) => codes.slice(index + 1).some((other) => intersects(code, other))).length;
  const barcodeCount = event.template.elements.filter((element) => element.type === "barcode").length;
  const qrCount = event.template.elements.filter((element) => element.type === "qrcode").length;

  return [
    { id: "participants", label: "Participants", value: participants.length, status: participants.length ? "ok" : "error", detail: participants.length ? undefined : "Importez au moins un participant." },
    { id: "identifiers", label: "Identifiants uniques", value: `${ids.size} / ${participants.length}`, status: ids.size === participants.length && participants.length > 0 ? "ok" : "error" },
    { id: "barcodes", label: "Codes-barres", value: barcodeCount ? participants.length : 0, status: barcodeCount ? "ok" : "warning", detail: barcodeCount ? undefined : "Ajoutez un Code 128 si vous utilisez une douchette." },
    { id: "qrcodes", label: "QR codes", value: qrCount ? participants.length : 0, status: qrCount ? "ok" : "warning" },
    { id: "errors", label: "Erreurs bloquantes", value: errors.length, status: errors.length ? "error" : "ok" },
    { id: "warnings", label: "Alertes", value: warnings.length, status: warnings.length ? "warning" : "ok", detail: warnings.some((issue) => issue.code === "unknown-sex") ? "Vérifiez le sexe avant de préparer une course Filles ou Garçons." : undefined },
    { id: "layout", label: "Éléments hors page", value: outside, status: outside ? "error" : "ok" },
    { id: "code-size", label: "Dimensions des codes", value: invalidCodeSize, status: invalidCodeSize ? "error" : "ok", detail: invalidCodeSize ? "Code-barres : minimum 45 × 14 mm. QR : minimum 18 × 18 mm." : "Zones de lecture suffisamment grandes." },
    { id: "code-overlap", label: "Codes superposés", value: codeOverlap, status: codeOverlap ? "error" : "ok", detail: codeOverlap ? "Séparez le Code 128 et le QR avant l’export." : undefined },
  ];
}

export const isEventReady = (event: RaceEvent) => buildValidationChecks(event).every((check) => check.status !== "error");
