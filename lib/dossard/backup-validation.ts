import { z } from "zod";
import type { BibTemplate, RaceEvent } from "./types";

const text = z.string();
const finite = z.number().finite();
const background = z.object({
  fileName: text,
  mimeType: z.enum(["image/png", "image/jpeg"]),
  dataUrl: text.regex(/^data:image\/(png|jpeg);base64,/),
  widthPx: finite.positive(),
  heightPx: finite.positive(),
  sizeBytes: finite.nonnegative(),
});
const element = z.object({
  id: text.min(1),
  type: z.enum([
    "number",
    "lastName",
    "firstName",
    "fullName",
    "className",
    "sex",
    "barcode",
    "qrcode",
    "freeText",
  ]),
  name: text,
  xMm: finite,
  yMm: finite,
  widthMm: finite.positive(),
  heightMm: finite.positive(),
  fontSizePt: finite.positive(),
  minFontSizePt: finite.positive(),
  bold: z.boolean(),
  italic: z.boolean(),
  color: text.regex(/^#[0-9a-f]{6}$/i),
  align: z.enum(["left", "center", "right"]),
  content: text.optional(),
  showHumanReadable: z.boolean().optional(),
});
const template = z.object({
  id: text.min(1),
  name: text,
  widthMm: z.literal(210),
  heightMm: z.literal(148),
  orientation: z.literal("landscape"),
  background: background.optional(),
  elements: z.array(element),
  createdAt: text,
  updatedAt: text,
});
const participant = z.object({
  id: text.min(1),
  sourceRow: finite.int().nonnegative(),
  bibNumber: finite.int().positive(),
  technicalId: text.min(1),
  lastName: text,
  firstName: text,
  className: text,
  sex: text.optional(),
  issues: z
    .array(
      z.object({
        severity: z.enum(["error", "warning"]),
        code: text,
        message: text,
      }),
    )
    .default([]),
});
const nullableNumber = finite.nullable();
const cloudEntry = z.object({
  id: text,
  status: z.enum(["registered", "finished", "dnf", "exempt", "absent"]),
  finish_position: nullableNumber,
  station_order: nullableNumber,
  station_position: nullableNumber,
  elapsed_ms: nullableNumber,
  scanned_at: text.nullable(),
  station_id: text.nullable(),
  participant: z.object({
    id: text,
    local_participant_id: text,
    bib_code: text,
    bib_number: finite,
    last_name: text,
    first_name: text,
    class_name: text,
    sex: text,
  }),
});
const cloudHeat = z.object({
  id: text,
  event_id: text,
  name: text,
  status: z.enum(["draft", "running", "finished"]),
  selected_classes: z.array(text),
  sex_filter: text,
  challenge_enabled: z.boolean(),
  challenge_classes: z.array(text),
  challenge_best_count: nullableNumber,
  next_position: finite,
  scheduled_time: text.nullable().optional(),
  created_at: text.optional(),
  started_at: text.nullable().optional(),
  finished_at: text.nullable().optional(),
});
const archive = z.object({
  savedAt: text,
  courses: z.array(z.object({ heat: cloudHeat, entries: z.array(cloudEntry) })),
});
const event = z.object({
  id: text.min(1),
  name: text,
  year: finite.int(),
  location: text,
  date: text,
  numbering: z.object({
    prefix: text,
    start: finite.int().positive(),
    digits: finite.int().min(1).max(8),
  }),
  participants: z.array(participant),
  template,
  sourceFileName: text.optional(),
  resultBranding: z
    .object({
      title: text.optional(),
      subtitle: text.optional(),
      logoDataUrl: text.optional(),
      primaryColor: text.optional(),
      secondaryColor: text.optional(),
      accentColor: text.optional(),
    })
    .optional(),
  classPockets: z.array(z.object({
    id: text.min(1), classes: z.array(text), text: text.max(240),
    x: finite.min(5).max(75), y: finite.min(5).max(85), fontSize: finite.min(10).max(30),
  })).optional(),
  createdAt: text,
  updatedAt: text,
});
const eventWithArchive = event.extend({ raceArchive: archive.optional() });
const schema = z.object({
  format: z.literal("gestion-cross-backup"),
  version: z.union([z.literal(1), z.literal(2)]),
  createdAt: text,
  ownerKey: text.regex(/^[a-f0-9]{64}$/i),
  events: z.array(eventWithArchive),
  templates: z.array(template),
});
export function parseCrossBackup(value: unknown): {
  ownerKey: string;
  events: RaceEvent[];
  templates: BibTemplate[];
} {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new Error(
      "Sauvegarde invalide : aucun changement effectué. Vérifiez le format, la clé organisateur et les données.",
    );
  for (const items of [result.data.events, result.data.templates]) {
    if (new Set(items.map((item) => item.id)).size !== items.length)
      throw new Error("La sauvegarde contient des identifiants dupliqués.");
  }
  for (const item of result.data.events) {
    if (
      new Set(item.participants.map((p) => p.id)).size !==
      item.participants.length
    )
      throw new Error(
        "La sauvegarde contient des élèves avec le même identifiant interne.",
      );
  }
  return result.data;
}
