export type ParticipantField = "lastName" | "firstName" | "className" | "sex";
export type LayoutElementType = "number" | "lastName" | "firstName" | "fullName" | "className" | "sex" | "barcode" | "qrcode" | "freeText";
export type TextAlign = "left" | "center" | "right";
export interface ParticipantIssue { severity: "error" | "warning"; code: string; message: string; }
export interface Participant { id: string; sourceRow: number; bibNumber: number; technicalId: string; lastName: string; firstName: string; className: string; sex?: string; issues: ParticipantIssue[]; }
export interface NumberingConfig { prefix: string; start: number; digits: number; }
export interface BackgroundAsset { fileName: string; mimeType: "image/png" | "image/jpeg"; dataUrl: string; widthPx: number; heightPx: number; sizeBytes: number; }
export interface LayoutElement { id: string; type: LayoutElementType; name: string; xMm: number; yMm: number; widthMm: number; heightMm: number; fontSizePt: number; minFontSizePt: number; bold: boolean; italic: boolean; color: string; align: TextAlign; content?: string; showHumanReadable?: boolean; }
export interface BibTemplate { id: string; name: string; widthMm: number; heightMm: number; orientation: "landscape"; background?: BackgroundAsset; elements: LayoutElement[]; createdAt: string; updatedAt: string; }
export interface RaceEvent { id: string; name: string; year: number; location: string; date: string; numbering: NumberingConfig; participants: Participant[]; template: BibTemplate; sourceFileName?: string; createdAt: string; updatedAt: string; }
export type ColumnMapping = Partial<Record<ParticipantField, number>>;
export interface ImportDraft { fileName: string; headers: string[]; rows: unknown[][]; mapping: ColumnMapping; }
export interface ValidationCheck { id: string; label: string; value: number | string; status: "ok" | "warning" | "error"; detail?: string; }
export type ExportMode = "all" | "class" | "range" | "selection" | "single";
export interface ExportFilter { mode: ExportMode; className?: string; fromNumber?: number; toNumber?: number; participantIds?: string[]; participantId?: string; }
export interface PdfProgress { completed: number; total: number; phase: "preparing" | "generating" | "saving" | "done"; }
