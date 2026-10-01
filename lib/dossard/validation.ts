import type {
  LayoutElement,
  Participant,
  RaceEvent,
  ValidationCheck,
} from "./types";
import { barcodeGeometry, verifyCode128 } from "./barcode";
import { createQrMatrix } from "./qr";

const duplicateKey = (participant: Participant) =>
  [participant.lastName, participant.firstName, participant.className]
    .map((value) => value.trim().toLocaleLowerCase("fr"))
    .join("|");
const female = /^(f|fille|female|féminin|feminin|girl)$/i;
const male = /^(m|garçon|garcon|male|masculin|boy)$/i;
const knownSex = (value?: string) =>
  female.test((value ?? "").trim()) || male.test((value ?? "").trim());

function intersects(a: LayoutElement, b: LayoutElement) {
  return (
    a.xMm < b.xMm + b.widthMm &&
    a.xMm + a.widthMm > b.xMm &&
    a.yMm < b.yMm + b.heightMm &&
    a.yMm + a.heightMm > b.yMm
  );
}

export function validateParticipants(
  participants: Participant[],
): Participant[] {
  const identities = new Map<string, number>();
  const ids = new Map<string, number>();
  const numbers = new Map<number, number>();
  for (const participant of participants) {
    const key = duplicateKey(participant);
    if (key !== "||") identities.set(key, (identities.get(key) ?? 0) + 1);
    ids.set(
      participant.technicalId,
      (ids.get(participant.technicalId) ?? 0) + 1,
    );
    numbers.set(
      participant.bibNumber,
      (numbers.get(participant.bibNumber) ?? 0) + 1,
    );
  }
  return participants.map((participant) => {
    const issues = [];
    if (!participant.lastName.trim())
      issues.push({
        severity: "error" as const,
        code: "missing-last-name",
        message: "Nom manquant",
      });
    if (!participant.firstName.trim())
      issues.push({
        severity: "error" as const,
        code: "missing-first-name",
        message: "Prénom manquant",
      });
    if (!participant.className.trim())
      issues.push({
        severity: "error" as const,
        code: "missing-class",
        message: "Classe manquante",
      });
    if (!participant.technicalId.trim())
      issues.push({
        severity: "error" as const,
        code: "missing-id",
        message: "Identifiant manquant",
      });
    else if ((ids.get(participant.technicalId) ?? 0) > 1)
      issues.push({
        severity: "error" as const,
        code: "duplicate-id",
        message: "Identifiant dupliqué",
      });
    if (
      !Number.isInteger(participant.bibNumber) ||
      participant.bibNumber < 1 ||
      participant.bibNumber > 2147483647
    )
      issues.push({
        severity: "error" as const,
        code: "invalid-number",
        message: "Numéro de dossard invalide",
      });
    else if ((numbers.get(participant.bibNumber) ?? 0) > 1)
      issues.push({
        severity: "error" as const,
        code: "duplicate-number",
        message: "Numéro de dossard dupliqué",
      });
    if (
      participant.technicalId &&
      (participant.technicalId.length > 40 ||
        !verifyCode128(participant.technicalId))
    )
      issues.push({
        severity: "error" as const,
        code: "invalid-code",
        message:
          "Identifiant incompatible avec le Code 128 ou supérieur à 40 caractères",
      });
    if ((identities.get(duplicateKey(participant)) ?? 0) > 1)
      issues.push({
        severity: "warning" as const,
        code: "possible-duplicate",
        message: "Doublon potentiel",
      });
    if (!knownSex(participant.sex))
      issues.push({
        severity: "warning" as const,
        code: "unknown-sex",
        message:
          "Sexe manquant ou non reconnu (utile pour les courses filles/garçons)",
      });
    return { ...participant, issues };
  });
}

export function buildValidationChecks(event: RaceEvent): ValidationCheck[] {
  const participants = validateParticipants(event.participants);
  const ids = new Set(
    participants.map((participant) => participant.technicalId),
  );
  const errors = participants
    .flatMap((participant) => participant.issues)
    .filter((issue) => issue.severity === "error");
  const warnings = participants
    .flatMap((participant) => participant.issues)
    .filter((issue) => issue.severity === "warning");
  const outside = event.template.elements.filter(
    (element) =>
      element.xMm < 0 ||
      element.yMm < 0 ||
      element.xMm + element.widthMm > event.template.widthMm ||
      element.yMm + element.heightMm > event.template.heightMm,
  ).length;
  const codes = event.template.elements.filter(
    (element) => element.type === "barcode" || element.type === "qrcode",
  );
  const invalidCodeSize = codes.filter((element) =>
    element.type === "barcode"
      ? element.widthMm < 45 || element.heightMm < 14
      : element.widthMm < 18 || element.heightMm < 18,
  ).length;
  const codeOverlap = codes.filter((code, index) =>
    codes.slice(index + 1).some((other) => intersects(code, other)),
  ).length;
  const textOverlap = codes.filter((code) =>
    event.template.elements.some(
      (other) =>
        other.id !== code.id &&
        other.type !== "barcode" &&
        other.type !== "qrcode" &&
        intersects(code, other),
    ),
  ).length;
  const invalidGeometry = event.template.elements.filter(
    (element) =>
      ![
        element.xMm,
        element.yMm,
        element.widthMm,
        element.heightMm,
        element.fontSizePt,
        element.minFontSizePt,
      ].every(Number.isFinite) ||
      element.widthMm <= 0 ||
      element.heightMm <= 0 ||
      !/^#[0-9a-f]{6}$/i.test(element.color),
  ).length;
  const uniqueCodes = [
    ...new Set(
      participants
        .map((p) => p.technicalId)
        .filter((code) => code.length <= 40 && verifyCode128(code)),
    ),
  ];
  const maxBarcodeModules = Math.max(
    0,
    ...uniqueCodes.map((value) => barcodeGeometry(value).totalModules),
  );
  // Borne conservatrice en mode octet ; évite de générer 1 500 QR à chaque rendu.
  const longestLength = Math.max(
    0,
    ...uniqueCodes.map((value) => value.length),
  );
  const maxQrModules = longestLength
    ? createQrMatrix("x".repeat(longestLength)).size + 8
    : 0;
  const fineCodes = codes.filter((element) =>
    element.type === "barcode"
      ? maxBarcodeModules > 0 && element.widthMm / maxBarcodeModules < 0.25
      : maxQrModules > 0 &&
        Math.min(element.widthMm, element.heightMm) / maxQrModules < 0.4,
  ).length;
  const barcodeCount = event.template.elements.filter(
    (element) => element.type === "barcode",
  ).length;
  const qrCount = event.template.elements.filter(
    (element) => element.type === "qrcode",
  ).length;

  return [
    {
      id: "participants",
      label: "Participants",
      value: participants.length,
      status: participants.length ? "ok" : "error",
      detail: participants.length
        ? undefined
        : "Importez au moins un participant.",
    },
    {
      id: "identifiers",
      label: "Identifiants uniques",
      value: `${ids.size} / ${participants.length}`,
      status:
        ids.size === participants.length && participants.length > 0
          ? "ok"
          : "error",
    },
    {
      id: "barcodes",
      label: "Codes-barres",
      value: barcodeCount ? participants.length : 0,
      status: barcodeCount ? "ok" : "warning",
      detail: barcodeCount
        ? undefined
        : "Ajoutez un Code 128 si vous utilisez une douchette.",
    },
    {
      id: "qrcodes",
      label: "QR codes",
      value: qrCount ? participants.length : 0,
      status: qrCount ? "ok" : "warning",
    },
    {
      id: "errors",
      label: "Erreurs bloquantes",
      value: errors.length,
      status: errors.length ? "error" : "ok",
    },
    {
      id: "warnings",
      label: "Alertes",
      value: warnings.length,
      status: warnings.length ? "warning" : "ok",
      detail: warnings.some((issue) => issue.code === "unknown-sex")
        ? "Vérifiez le sexe avant de préparer une course Filles ou Garçons."
        : undefined,
    },
    {
      id: "layout",
      label: "Éléments hors page",
      value: outside,
      status: outside ? "error" : "ok",
    },
    {
      id: "code-size",
      label: "Dimensions des codes",
      value: invalidCodeSize,
      status: invalidCodeSize ? "error" : "ok",
      detail: invalidCodeSize
        ? "Code-barres : minimum 45 × 14 mm. QR : minimum 18 × 18 mm."
        : "Zones de lecture suffisamment grandes.",
    },
    {
      id: "code-overlap",
      label: "Codes superposés",
      value: codeOverlap,
      status: codeOverlap ? "error" : "ok",
      detail: codeOverlap
        ? "Séparez le Code 128 et le QR avant l’export."
        : undefined,
    },
    {
      id: "text-code-overlap",
      label: "Texte sur les codes",
      value: textOverlap,
      status: textOverlap ? "error" : "ok",
      detail: textOverlap
        ? "Les zones blanches des codes doivent rester libres de tout texte."
        : undefined,
    },
    {
      id: "code-modules",
      label: "Finesse des codes",
      value: fineCodes,
      status: fineCodes ? "error" : "ok",
      detail: fineCodes
        ? "Agrandissez les codes ou raccourcissez le préfixe. Le contrôle tient compte du plus long identifiant."
        : "Module Code 128 ≥ 0,25 mm ; module QR ≥ 0,4 mm (garde-fous d’impression).",
    },
    {
      id: "geometry",
      label: "Réglages du modèle",
      value: invalidGeometry,
      status: invalidGeometry ? "error" : "ok",
      detail: invalidGeometry
        ? "Vérifiez les dimensions et les couleurs des éléments."
        : undefined,
    },
  ];
}

export const isEventReady = (event: RaceEvent) =>
  buildValidationChecks(event).every((check) => check.status !== "error");
