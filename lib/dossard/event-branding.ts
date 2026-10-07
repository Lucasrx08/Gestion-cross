import type { RaceEvent, ResultBranding } from "./types";

export const escapeDocumentText = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const color = (value: string | undefined, fallback: string) => /^#[0-9a-f]{6}$/i.test(value ?? "") ? value! : fallback;
export function resolveEventBranding(event: Pick<RaceEvent, "name" | "location" | "year" | "resultBranding">): ResultBranding {
  const b = event.resultBranding;
  const secondary = color(b?.secondaryColor, "#fed60b");
  return { title: b?.title || event.name, subtitle: b?.subtitle ?? `${event.location || ""}${event.location ? " · " : ""}${event.year}`, logoDataUrl: b?.logoDataUrl, primaryColor: color(b?.primaryColor, "#1154b3"), secondaryColor: secondary, accentColor: color(b?.accentColor, secondary) };
}
export function eventDocumentHeader(branding: ResultBranding) {
  const esc = escapeDocumentText;
  return `<header class="event-header">${branding.logoDataUrl ? `<img src="${esc(branding.logoDataUrl)}" alt="Logo de l’événement">` : ""}<div><h1>${esc(branding.title)}</h1>${branding.subtitle ? `<p>${esc(branding.subtitle)}</p>` : ""}</div></header>`;
}
export function eventDocumentStyles(branding: ResultBranding) {
  const primary = color(branding.primaryColor, "#1154b3");
  const secondary = color(branding.secondaryColor, "#fed60b");
  return `@page{size:A4 portrait;margin:12mm}*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;color:#263244;background:white;-webkit-print-color-adjust:exact;print-color-adjust:exact}header.event-header{display:flex;align-items:center;gap:5mm;border-bottom:2px solid ${secondary};padding-bottom:4mm;margin-bottom:5mm;break-inside:avoid}header.event-header img{max-width:28mm;max-height:22mm;object-fit:contain}header.event-header h1{margin:0;color:${primary};font-size:22px;overflow-wrap:anywhere}header.event-header p{margin:2mm 0 0;color:#475569;font-size:12px}h2{color:${primary};font-size:18px;break-after:avoid}p{color:#475569;font-size:12px}table{width:100%;border-collapse:collapse;font-size:12px}thead{display:table-header-group}tr{break-inside:avoid}th,td{padding:2.5mm 2mm;border-bottom:1px solid #dbe1e8;text-align:left;overflow-wrap:anywhere}th{background:${primary};color:white;font-weight:700}td:first-child{font-weight:600}tbody tr:nth-child(even){background:#f7f8fa}.podium{font-size:18px;font-weight:700;color:${primary}}.note{padding:3mm;border-left:3px solid ${secondary};background:#f7f8fa;color:#334155}.footer{margin-top:5mm;font-size:10px;color:#64748b}`;
}
export async function waitForDocumentAssets(doc: Document) {
  await Promise.all(Array.from(doc.images).map(image => image.complete ? Promise.resolve() : new Promise<void>(resolve => {
    image.addEventListener("load", () => resolve(), { once: true });
    image.addEventListener("error", () => resolve(), { once: true });
    setTimeout(resolve, 10000);
  })));
  await doc.fonts.ready;
}
