"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { ArrowDown, ArrowUp, Cloud, Copy, Download, Flag, Image as ImageIcon, Link2, Medal, Palette, Play, Plus, Printer, Search, Share2, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RaceEvent, ResultBranding } from "@/lib/dossard/types";
import { formatElapsed, type CloudEvent, type CloudHeat, type EntryStatus, type HeatEntry, type StationInfo, ownerApi, raceErrorMessage } from "@/lib/dossard/race-api";

interface OwnerState { event: CloudEvent | null; heats: CloudHeat[]; }
interface HeatResponse { heat: CloudHeat; entries: HeatEntry[]; stations: StationInfo[]; }
interface ClassOption { key: string; label: string; variants: string[]; group: string; }

const letters = ["A", "B", "C", "D"];
const isFemale = (value?: string) => /^(f|fille|female|féminin|feminin|girl)$/i.test((value ?? "").trim());
const isMale = (value?: string) => /^(m|garçon|garcon|male|masculin|boy)$/i.test((value ?? "").trim());
const stationKey = (id: string) => `gestion-cross-station-code:${id}`;
const esc = (value: unknown) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char] ?? char));
const statusLabel = (status: EntryStatus) => status === "finished" ? "Arrivé" : status === "dnf" ? "Non-finisseur" : status === "exempt" ? "Dispensé" : status === "absent" ? "Absent" : "À courir";

function classKey(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function prettyClass(value: string) {
  const key = classKey(value);
  const simple = key.match(/^([3456])EME$/);
  if (simple) return `${simple[1]}ème`;
  return value.trim().replace(/\s+/g, " ");
}
function classGroup(value: string) {
  const key = classKey(value);
  if (/^6EME\b/.test(key)) return "6e";
  if (/^5EME\b/.test(key)) return "5e";
  if (/^4EME\b/.test(key)) return "4e";
  if (/^3EME\b/.test(key)) return "3e";
  if (/^(2NDE|2ND)/.test(key)) return "2nde";
  if (/^(1ER|1ERE|1RE)/.test(key)) return "1re";
  if (/^(TERM|TERMINALE)/.test(key)) return "Terminale";
  if (/^(CP|CE1|CE2|CM1|CM2|CYCLE 2|CYCLE 3)/.test(key)) return "Primaire";
  return "Autres";
}
function uniqueClassLabels(values: string[]) {
  const map = new Map<string, string>();
  values.forEach((value) => { const key = classKey(value); if (key && !map.has(key)) map.set(key, prettyClass(value)); });
  return [...map.values()];
}
function buildChallenge(entries: HeatEntry[], classes: string[]) {
  const finishers = entries.filter((entry) => entry.status === "finished" && entry.finish_position != null);
  const penalty = Math.max(0, ...finishers.map((entry) => entry.finish_position ?? 0)) + 1;
  const labels = uniqueClassLabels(classes.length ? classes : entries.map((entry) => entry.participant.class_name));
  return labels.map((className) => {
    const key = classKey(className);
    const members = entries.filter((entry) => classKey(entry.participant.class_name) === key);
    const points = members.reduce((sum, entry) => sum + (entry.status === "finished" && entry.finish_position ? entry.finish_position : penalty), 0);
    return { className, points, members: members.length, penalty };
  }).filter((item) => item.members > 0).sort((a, b) => a.points - b.points || a.className.localeCompare(b.className, "fr"));
}

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return { r: 17, g: 84, b: 179 };
  return { r: parseInt(value.slice(0, 2), 16), g: parseInt(value.slice(2, 4), 16), b: parseInt(value.slice(4, 6), 16) };
}
function rgbToHex(r: number, g: number, b: number) { return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`; }
function mixColor(a: string, b: string, amount: number) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return rgbToHex(x.r + (y.r - x.r) * amount, x.g + (y.g - x.g) * amount, x.b + (y.b - x.b) * amount);
}
function colorDistance(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) { return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b); }
async function extractPalette(dataUrl: string) {
  const image = new window.Image();
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error("IMAGE_INVALIDE")); image.src = dataUrl; });
  const canvas = document.createElement("canvas"); canvas.width = 72; canvas.height = 72;
  const ctx = canvas.getContext("2d"); if (!ctx) return [] as string[];
  ctx.drawImage(image, 0, 0, 72, 72);
  const data = ctx.getImageData(0, 0, 72, 72).data;
  const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 150) continue;
    const r = data[index], g = data[index + 1], b = data[index + 2];
    if (r > 245 && g > 245 && b > 245) continue;
    if (r < 18 && g < 18 && b < 18) continue;
    if (Math.max(r, g, b) - Math.min(r, g, b) < 22) continue;
    const qr = Math.round(r / 32) * 32, qg = Math.round(g / 32) * 32, qb = Math.round(b / 32) * 32;
    const key = `${qr}-${qg}-${qb}`;
    const item = buckets.get(key) ?? { r: qr, g: qg, b: qb, count: 0 };
    item.count += 1; buckets.set(key, item);
  }
  const candidates = [...buckets.values()].sort((a, b) => b.count - a.count).slice(0, 18);
  const picked: typeof candidates = [];
  candidates.forEach((candidate) => { if (picked.length < 4 && picked.every((other) => colorDistance(candidate, other) > 72)) picked.push(candidate); });
  picked.sort((a, b) => (a.r + a.g + a.b) - (b.r + b.g + b.b));
  return picked.map((color) => rgbToHex(color.r, color.g, color.b));
}

function loadCanvasImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => { const image = new window.Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; });
}

export function CourseStep({ event, onChange }: { event: RaceEvent; onChange: (event: RaceEvent) => void }) {
  const classOptions = useMemo<ClassOption[]>(() => {
    const map = new Map<string, ClassOption>();
    event.participants.forEach((participant) => {
      const raw = participant.className.trim(); if (!raw) return;
      const key = classKey(raw);
      const existing = map.get(key);
      if (existing) { if (!existing.variants.includes(raw)) existing.variants.push(raw); return; }
      map.set(key, { key, label: prettyClass(raw), variants: [raw], group: classGroup(raw) });
    });
    const order = ["6e", "5e", "4e", "3e", "2nde", "1re", "Terminale", "Primaire", "Autres"];
    return [...map.values()].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.label.localeCompare(b.label, "fr"));
  }, [event.participants]);

  const [cloudEvent, setCloudEvent] = useState<CloudEvent | null>(null);
  const [heats, setHeats] = useState<CloudHeat[]>([]);
  const [selectedHeatId, setSelectedHeatId] = useState<string>();
  const [entries, setEntries] = useState<HeatEntry[]>([]);
  const [stations, setStations] = useState<StationInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [brandingOpen, setBrandingOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [qr, setQr] = useState("");
  const [heatName, setHeatName] = useState("");
  const [selectedClassKeys, setSelectedClassKeys] = useState<Set<string>>(new Set());
  const [classSearch, setClassSearch] = useState("");
  const [statusSearch, setStatusSearch] = useState("");
  const [sexFilter, setSexFilter] = useState("all");
  const [challengeEnabled, setChallengeEnabled] = useState(true);
  const [stationCode, setStationCode] = useState("");

  const selectedHeat = heats.find((heat) => heat.id === selectedHeatId);
  const ranked = entries.filter((entry) => entry.status === "finished").sort((a, b) => (a.finish_position ?? 99999) - (b.finish_position ?? 99999));
  const classResults = selectedHeat?.challenge_enabled ? buildChallenge(entries, selectedHeat.challenge_classes.length ? selectedHeat.challenge_classes : selectedHeat.selected_classes) : [];
  const branding: ResultBranding = {
    title: event.resultBranding?.title || event.name,
    subtitle: event.resultBranding?.subtitle || `${event.location || ""}${event.location ? " · " : ""}${event.year}`,
    logoDataUrl: event.resultBranding?.logoDataUrl,
    primaryColor: event.resultBranding?.primaryColor || "#1154b3",
    secondaryColor: event.resultBranding?.secondaryColor || "#f198a5",
    accentColor: event.resultBranding?.accentColor || "#bf1281",
  };

  const refreshOwner = async () => {
    try {
      const state = await ownerApi<OwnerState>("owner_state", { localEventId: event.id });
      setCloudEvent(state.event);
      setHeats(state.heats ?? []);
      setSelectedHeatId((current) => current && state.heats?.some((heat) => heat.id === current) ? current : state.heats?.[0]?.id);
    } catch (error) { toast.error(raceErrorMessage(error)); }
  };
  const refreshEntries = async (heatId = selectedHeatId) => {
    if (!heatId) return;
    try {
      const result = await ownerApi<HeatResponse>("heat_entries", { heatId });
      setEntries(result.entries ?? []);
      setStations(result.stations ?? []);
      setHeats((items) => items.map((item) => item.id === result.heat.id ? { ...item, ...result.heat } : item));
    } catch (error) { toast.error(raceErrorMessage(error)); }
  };

  useEffect(() => { void refreshOwner(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedHeatId) { setEntries([]); setStations([]); setStationCode(""); return; }
    setStationCode(window.localStorage.getItem(stationKey(selectedHeatId)) ?? "");
    void refreshEntries(selectedHeatId);
  }, [selectedHeatId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedHeatId || selectedHeat?.status !== "running") return;
    const timer = window.setInterval(() => void refreshEntries(selectedHeatId), 1800);
    return () => window.clearInterval(timer);
  }, [selectedHeatId, selectedHeat?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!shareOpen || !stationCode) return;
    const url = new URL(window.location.href); url.searchParams.set("station", stationCode);
    QRCode.toDataURL(url.toString(), { width: 360, margin: 2 }).then(setQr).catch(() => setQr(""));
  }, [shareOpen, stationCode]);

  const sync = async () => {
    if (!event.participants.length) return toast.error("Importez d’abord les élèves.");
    setLoading(true);
    try {
      const result = await ownerApi<{ event: CloudEvent; participantCount: number }>("sync_event", { event });
      setCloudEvent(result.event);
      toast.success(`${result.participantCount} élèves prêts pour les courses.`);
      await refreshOwner();
      setCreateOpen(true);
    } catch (error) { toast.error(raceErrorMessage(error)); }
    finally { setLoading(false); }
  };
  const toggleClass = (key: string) => setSelectedClassKeys((current) => { const next = new Set(current); next.has(key) ? next.delete(key) : next.add(key); return next; });
  const resetCreate = () => { setHeatName(""); setSelectedClassKeys(new Set()); setClassSearch(""); setSexFilter("all"); setChallengeEnabled(true); };
  const createHeat = async () => {
    if (!cloudEvent) return;
    const selectedOptions = classOptions.filter((option) => selectedClassKeys.has(option.key));
    if (!heatName.trim() || !selectedOptions.length) return toast.error("Indiquez un nom et au moins une classe.");
    const rawClasses = new Set(selectedOptions.flatMap((option) => option.variants));
    const participants = event.participants.filter((participant) => rawClasses.has(participant.className) && (sexFilter === "all" || (sexFilter === "female" ? isFemale(participant.sex) : isMale(participant.sex))));
    if (!participants.length) return toast.error("Aucun élève ne correspond à cette sélection.");
    setLoading(true);
    try {
      const result = await ownerApi<{ heat: CloudHeat; participantCount: number }>("create_heat", {
        eventId: cloudEvent.id,
        name: heatName.trim(),
        selectedClasses: selectedOptions.map((option) => option.label),
        sexFilter,
        challengeEnabled,
        challengeClasses: selectedOptions.map((option) => option.label),
        challengeBestCount: null,
        participantIds: participants.map((participant) => participant.id),
      });
      setCreateOpen(false); resetCreate(); await refreshOwner(); setSelectedHeatId(result.heat.id);
      toast.success(`Course créée avec ${result.participantCount} élèves.`);
    } catch (error) { toast.error(raceErrorMessage(error)); }
    finally { setLoading(false); }
  };
  const start = async () => {
    if (!selectedHeatId || !confirm("Lancer cette course ? Le chronomètre démarre maintenant.")) return;
    try {
      const result = await ownerApi<{ stationCode: string }>("start_heat", { heatId: selectedHeatId });
      window.localStorage.setItem(stationKey(selectedHeatId), result.stationCode);
      setStationCode(result.stationCode); await refreshOwner(); await refreshEntries(); setShareOpen(true);
    } catch (error) { toast.error(raceErrorMessage(error)); }
  };
  const finish = async () => {
    if (!selectedHeatId || !confirm("Terminer la course ? Les élèves encore à courir seront classés non-finisseurs.")) return;
    try { await ownerApi("finish_heat", { heatId: selectedHeatId }); await refreshOwner(); await refreshEntries(); toast.success("Course terminée. Les résultats sont prêts."); }
    catch (error) { toast.error(raceErrorMessage(error)); }
  };
  const changeStatus = async (entry: HeatEntry, status: Exclude<EntryStatus, "finished">) => {
    try { await ownerApi("set_entry_status", { entryId: entry.id, status }); await refreshEntries(); }
    catch (error) { toast.error(raceErrorMessage(error)); }
  };
  const removeFinish = async (entry: HeatEntry) => {
    if (!confirm(`Annuler l’arrivée de ${entry.participant.first_name} ${entry.participant.last_name} ?`)) return;
    try { await ownerApi("remove_finish", { entryId: entry.id }); await refreshEntries(); }
    catch (error) { toast.error(raceErrorMessage(error)); }
  };
  const move = async (entry: HeatEntry, delta: number) => {
    if (!entry.finish_position) return;
    try { await ownerApi("reorder_finish", { entryId: entry.id, position: Math.max(1, entry.finish_position + delta) }); await refreshEntries(); }
    catch (error) { toast.error(raceErrorMessage(error)); }
  };
  const deleteHeat = async () => {
    if (!selectedHeatId || !selectedHeat || !confirm(`Supprimer « ${selectedHeat.name} » ?`)) return;
    try { await ownerApi("delete_heat", { heatId: selectedHeatId }); window.localStorage.removeItem(stationKey(selectedHeatId)); setSelectedHeatId(undefined); setEntries([]); await refreshOwner(); }
    catch (error) { toast.error(raceErrorMessage(error)); }
  };

  const updateBranding = (patch: Partial<ResultBranding>) => onChange({ ...event, resultBranding: { ...branding, ...patch } });
  const uploadLogo = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      let palette: string[] = [];
      try { palette = await extractPalette(dataUrl); } catch { /* palette manuelle toujours disponible */ }
      updateBranding({ logoDataUrl: dataUrl, ...(palette[0] ? { primaryColor: palette[0] } : {}), ...(palette[1] ? { secondaryColor: palette[1] } : {}), ...(palette[2] ? { accentColor: palette[2] } : {}) });
      if (palette.length >= 2) toast.success("Logo ajouté et couleurs principales détectées.");
    };
    reader.readAsDataURL(file);
  };

  const printWindow = (title: string, body: string) => {
    const popup = window.open("", "_blank", "width=1000,height=800");
    if (!popup) return toast.error("Le navigateur a bloqué la fenêtre d’impression.");
    const primary = branding.primaryColor || "#1154b3", accent = branding.accentColor || "#bf1281";
    popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{margin:14mm}body{font-family:Arial,sans-serif;color:#102347}header{display:flex;align-items:center;gap:18px;border-bottom:5px solid ${esc(accent)};padding-bottom:14px;margin-bottom:24px}header img{max-width:105px;max-height:85px;object-fit:contain}h1{margin:0;color:${esc(primary)}}h2{margin-top:24px;color:${esc(primary)}}p{color:#64748b}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{padding:8px;border-bottom:1px solid #dbe5f2;text-align:left}th{background:${esc(mixColor(primary,"#ffffff",0.9))}}.podium{font-size:18px;font-weight:700}.note{padding:12px;border-radius:10px;background:${esc(mixColor(accent,"#ffffff",0.9))};color:#334155}.footer{margin-top:30px;font-size:11px;color:#94a3b8}</style></head><body>${body}<div class="footer">Gestion Cross · Créé par L. RIGAUX</div></body></html>`);
    popup.document.close(); popup.focus(); window.setTimeout(() => popup.print(), 250);
  };
  const documentHeader = () => `<header>${branding.logoDataUrl ? `<img src="${esc(branding.logoDataUrl)}">` : ""}<div><h1>${esc(branding.title || event.name)}</h1><p>${esc(branding.subtitle || "")}</p></div></header>`;
  const printIndividual = () => {
    if (!selectedHeat) return;
    const rows = ranked.map((entry) => `<tr><td>${entry.finish_position}</td><td>${entry.participant.bib_number}</td><td><b>${esc(entry.participant.last_name.toUpperCase())}</b> ${esc(entry.participant.first_name)}</td><td>${esc(entry.participant.class_name)}</td><td>${esc(formatElapsed(entry.elapsed_ms))}</td></tr>`).join("");
    printWindow(`${selectedHeat.name} - individuel`, `${documentHeader()}<h2>${esc(selectedHeat.name)} · Classement individuel</h2><table><thead><tr><th>Rang</th><th>Dossard</th><th>Élève</th><th>Classe</th><th>Temps</th></tr></thead><tbody>${rows}</tbody></table>`);
  };
  const printClasses = () => {
    if (!selectedHeat || !classResults.length) return;
    const rows = classResults.map((result, index) => `<tr><td class="podium">${index + 1}</td><td><b>${esc(result.className)}</b></td><td>${result.points}</td><td>${result.members}</td></tr>`).join("");
    const penalty = classResults[0]?.penalty ?? 1;
    printWindow(`${selectedHeat.name} - challenge interclasses`, `${documentHeader()}<h2>Challenge interclasses</h2><p class="note"><b>Tous les élèves comptent.</b> Un élève absent, dispensé ou non-finisseur reçoit le rang du dernier arrivé + 1, soit ${penalty} point(s) sur cette course. Le plus petit total gagne.</p><table><thead><tr><th>Rang</th><th>Classe</th><th>Points</th><th>Élèves comptabilisés</th></tr></thead><tbody>${rows}</tbody></table>`);
  };

  const social = async (kind: "individual" | "classes", story = false) => {
    if (!selectedHeat) return;
    const width = 1080, height = story ? 1920 : 1080;
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const primary = branding.primaryColor || "#1154b3", secondary = branding.secondaryColor || "#f198a5", accent = branding.accentColor || "#bf1281";
    const gradient = ctx.createLinearGradient(0, 0, width, height); gradient.addColorStop(0, primary); gradient.addColorStop(1, mixColor(primary, "#000000", 0.25));
    ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = accent; ctx.fillRect(0, 0, width, story ? 22 : 18);
    ctx.globalAlpha = 0.28; ctx.fillStyle = secondary; ctx.beginPath(); ctx.arc(width * 0.92, height * 0.08, story ? 220 : 170, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    let logoHeight = 0;
    if (branding.logoDataUrl) {
      try { const image = await loadCanvasImage(branding.logoDataUrl); const maxW = story ? 280 : 220, maxH = story ? 250 : 190; const ratio = Math.min(maxW / image.width, maxH / image.height); const w = image.width * ratio, h = image.height * ratio; ctx.drawImage(image, 70, 58, w, h); logoHeight = h; } catch { /* export sans logo si image illisible */ }
    }
    const titleY = Math.max(story ? 345 : 260, 80 + logoHeight);
    ctx.fillStyle = "#ffffff"; ctx.font = `900 ${story ? 54 : 48}px Arial`; ctx.fillText(branding.title || event.name, 70, titleY - 82);
    ctx.font = `700 ${story ? 30 : 26}px Arial`; ctx.fillStyle = mixColor("#ffffff", secondary, 0.28); ctx.fillText(branding.subtitle || "", 70, titleY - 38);
    ctx.fillStyle = accent; ctx.fillRect(70, titleY, width - 140, story ? 112 : 96);
    ctx.fillStyle = "#ffffff"; ctx.font = `900 ${story ? 64 : 58}px Arial`; ctx.fillText(kind === "classes" ? "CHALLENGE INTERCLASSES" : "RÉSULTATS", 98, titleY + (story ? 76 : 66));
    const panelY = titleY + (story ? 150 : 130), panelH = height - panelY - 115;
    ctx.fillStyle = mixColor(secondary, "#ffffff", 0.92); ctx.beginPath(); ctx.roundRect(55, panelY, width - 110, panelH, 34); ctx.fill();
    ctx.strokeStyle = secondary; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = primary; ctx.font = `900 ${story ? 48 : 42}px Arial`; ctx.fillText(selectedHeat.name, 90, panelY + 80);
    const lines = kind === "classes" ? classResults.slice(0, story ? 8 : 6).map((result, index) => `${index + 1}. ${result.className}  ·  ${result.points} pts`) : ranked.slice(0, story ? 8 : 6).map((entry) => `${entry.finish_position}. ${entry.participant.first_name} ${entry.participant.last_name.toUpperCase()}  ·  ${entry.participant.class_name}`);
    ctx.font = `700 ${story ? 38 : 32}px Arial`;
    lines.forEach((line, index) => { ctx.fillStyle = index === 0 ? accent : primary; ctx.fillText(line, 95, panelY + 155 + index * (story ? 92 : 74), width - 190); });
    if (kind === "classes" && classResults.length) { ctx.font = `600 ${story ? 25 : 22}px Arial`; ctx.fillStyle = "#64748b"; ctx.fillText(`Tous les élèves comptent · absent / dispensé / non-finisseur = ${classResults[0].penalty} pts`, 95, panelY + panelH - 55, width - 190); }
    ctx.fillStyle = "#ffffff"; ctx.font = `700 ${story ? 24 : 22}px Arial`; ctx.fillText("Gestion Cross · L. RIGAUX", 70, height - 55);
    const link = document.createElement("a"); link.download = `${selectedHeat.name}-${kind}-${story ? "story" : "post"}.png`.replace(/\s+/g, "-"); link.href = canvas.toDataURL("image/png"); link.click();
  };

  const filteredClassOptions = classOptions.filter((option) => !classSearch.trim() || option.label.toLocaleLowerCase("fr").includes(classSearch.toLocaleLowerCase("fr")) || option.variants.some((variant) => variant.toLocaleLowerCase("fr").includes(classSearch.toLocaleLowerCase("fr"))));
  const groupedOptions = useMemo(() => {
    const groups = new Map<string, ClassOption[]>();
    filteredClassOptions.forEach((option) => groups.set(option.group, [...(groups.get(option.group) ?? []), option]));
    return groups;
  }, [filteredClassOptions]);
  const statusEntries = entries.filter((entry) => {
    if (!statusSearch.trim()) return true;
    const query = statusSearch.toLocaleLowerCase("fr");
    return `${entry.participant.first_name} ${entry.participant.last_name} ${entry.participant.class_name} ${entry.participant.bib_number}`.toLocaleLowerCase("fr").includes(query);
  }).sort((a, b) => a.participant.class_name.localeCompare(b.participant.class_name, "fr") || a.participant.last_name.localeCompare(b.participant.last_name, "fr"));

  const shareLink = typeof window !== "undefined" && stationCode ? (() => { const url = new URL(window.location.href); url.searchParams.set("station", stationCode); return url.toString(); })() : "";
  const copyShareLink = async () => { if (!shareLink) return; await navigator.clipboard.writeText(shareLink); toast.success("Lien copié. Vous pouvez le coller sur l’autre PC ou iPad."); };
  const shareCourse = async () => {
    if (!shareLink) return;
    if (navigator.share) { try { await navigator.share({ title: selectedHeat?.name || "Course", text: "Ouvrir un poste d’arrivée Gestion Cross", url: shareLink }); return; } catch { /* partage annulé */ } }
    await copyShareLink();
  };

  if (!cloudEvent) return (
    <section className="mx-auto max-w-4xl rounded-[2rem] border border-blue-100 bg-white p-8 text-center shadow-sm">
      <Cloud className="mx-auto size-14 text-[#1154b3]" /><h2 className="mt-4 text-3xl font-black">Activer la gestion des courses</h2><p className="mx-auto mt-2 max-w-2xl text-[#65738e]">Synchronisez les participants pour gérer les arrivées sur 1 à 4 postes, les classements et le challenge interclasses.</p><Button size="lg" className="mt-6" disabled={loading} onClick={() => void sync()}><Cloud />Activer le mode course</Button>
    </section>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <section className="rounded-[1.7rem] border border-blue-100 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-widest text-[#1154b3]">Courses du cross</p><h2 className="truncate text-2xl font-black">{selectedHeat?.name || "Choisissez une course"}</h2></div>
          <div className="flex flex-wrap gap-2">
            {heats.length > 0 && <Select value={selectedHeatId} onValueChange={setSelectedHeatId}><SelectTrigger className="w-56"><SelectValue placeholder="Choisir une course" /></SelectTrigger><SelectContent>{heats.map((heat) => <SelectItem key={heat.id} value={heat.id}>{heat.name}</SelectItem>)}</SelectContent></Select>}
            <Button onClick={() => setCreateOpen(true)}><Plus />Nouvelle course</Button>
            <Button variant="outline" onClick={() => setBrandingOpen(true)}><Palette />En-tête & visuels</Button>
          </div>
        </div>
      </section>

      {!selectedHeat ? (
        <section className="rounded-[1.7rem] border border-dashed border-blue-200 bg-white p-10 text-center"><Flag className="mx-auto size-12 text-[#1154b3]" /><h3 className="mt-3 text-xl font-black">Aucune course sélectionnée</h3><p className="mt-1 text-slate-500">Créez une course pour commencer.</p></section>
      ) : (
        <>
          <section className="rounded-[1.7rem] border border-blue-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div><div className="flex flex-wrap items-center gap-2"><h3 className="text-2xl font-black">{selectedHeat.name}</h3><Badge variant="outline">{selectedHeat.status === "draft" ? "Prête" : selectedHeat.status === "running" ? "En cours" : "Terminée"}</Badge></div><p className="mt-1 text-sm text-slate-500">{selectedHeat.selected_classes.join(", ")} · {entries.length} engagé(s)</p></div>
              <div className="flex flex-wrap gap-2">
                {selectedHeat.status === "draft" && <Button onClick={() => void start()}><Play />Lancer la course</Button>}
                {selectedHeat.status === "running" && <><Button variant="outline" onClick={() => stationCode ? setShareOpen(true) : toast.error("Le code de cette course n’est plus disponible sur cet appareil.")}><Link2 />Ajouter un poste</Button><Button className="bg-red-600 hover:bg-red-700" onClick={() => void finish()}>Terminer</Button></>}
                <Button variant="outline" onClick={() => setStatusOpen(true)}><Users />Absents / dispensés</Button>
                {selectedHeat.status !== "running" && <Button variant="outline" className="text-red-600" onClick={() => void deleteHeat()}><Trash2 />Supprimer</Button>}
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                { label: "Engagés", value: entries.length },
                { label: "Arrivés", value: entries.filter((entry) => entry.status === "finished").length },
                { label: "Dispensés", value: entries.filter((entry) => entry.status === "exempt").length },
                { label: "Absents", value: entries.filter((entry) => entry.status === "absent").length },
                { label: "Non-finisseurs", value: entries.filter((entry) => entry.status === "dnf").length },
              ].map((item) => <div key={item.label} className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{item.label}</p><p className="mt-1 text-3xl font-black">{item.value}</p></div>)}
            </div>
          </section>

          {selectedHeat.status === "running" && stations.length > 0 && (
            <section className="rounded-[1.7rem] border border-blue-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h3 className="font-black">Postes d’arrivée</h3><p className="text-sm text-slate-500">Chaque poste garde son ordre. Le classement fusionne automatiquement A → B → C → D.</p></div><Badge>{stations.length}/4</Badge></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{stations.map((station) => { const scans = entries.filter((entry) => entry.station_order === station.station_order).length; return <div key={station.id} className="rounded-2xl border p-4"><p className="text-xs font-bold text-slate-500">Poste {station.station_order}</p><p className="mt-1 text-2xl font-black">{letters[station.station_order - 1]} · {station.mode === "start" ? "Début" : "Suite"}</p><p className="mt-1 text-sm text-slate-500">{scans} scan(s)</p></div>; })}</div></section>
          )}

          <section className="overflow-hidden rounded-[1.7rem] border border-blue-100 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-xl font-black">Arrivées</h3><p className="text-sm text-slate-500">L’ordre final est celui des postes A → B → C → D.</p></div>{selectedHeat.status === "finished" && <Button variant="outline" onClick={() => void refreshEntries()}><Cloud />Actualiser</Button>}</div>
            {!ranked.length ? <p className="p-8 text-center text-sm text-slate-500">Aucune arrivée enregistrée.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-blue-50 text-left text-xs uppercase text-slate-500"><tr><th className="p-3">Rang</th><th className="p-3">Poste</th><th className="p-3">Dossard</th><th className="p-3">Élève</th><th className="p-3">Classe</th><th className="p-3">Temps</th><th className="p-3 text-right">Actions</th></tr></thead><tbody>{ranked.map((entry) => <tr key={entry.id} className="border-t"><td className="p-3 text-xl font-black text-[#1154b3]">{entry.finish_position}</td><td className="p-3 font-bold">{entry.station_order ? `${letters[entry.station_order - 1]}${entry.station_position ?? ""}` : "—"}</td><td className="p-3 font-mono font-bold">{entry.participant.bib_number}</td><td className="p-3"><b>{entry.participant.last_name.toUpperCase()}</b> {entry.participant.first_name}</td><td className="p-3">{entry.participant.class_name}</td><td className="p-3 font-mono">{formatElapsed(entry.elapsed_ms)}</td><td className="p-3"><div className="flex justify-end gap-1"><Button size="icon-sm" variant="ghost" disabled={selectedHeat.status !== "finished" || entry.finish_position === 1} onClick={() => void move(entry, -1)}><ArrowUp /></Button><Button size="icon-sm" variant="ghost" disabled={selectedHeat.status !== "finished" || entry.finish_position === ranked.length} onClick={() => void move(entry, 1)}><ArrowDown /></Button><Button size="icon-sm" variant="ghost" className="text-red-600" onClick={() => void removeFinish(entry)}><Trash2 /></Button></div></td></tr>)}</tbody></table></div>}
          </section>

          {selectedHeat.status === "finished" && (
            <section className="rounded-[1.7rem] border border-blue-100 bg-white p-5 shadow-sm">
              <p className="text-xs font-black uppercase tracking-widest text-[#1154b3]">Résultats</p><h3 className="mt-1 text-2xl font-black">Imprimer ou publier</h3><p className="mt-1 text-sm text-slate-500">Les résultats individuels et le challenge interclasses restent volontairement séparés.</p>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <article className="rounded-2xl border p-5"><Medal className="text-[#1154b3]" /><h4 className="mt-2 text-lg font-black">Classement individuel</h4><p className="text-sm text-slate-500">Aucune information sur le challenge interclasses n’apparaît sur ce document.</p><div className="mt-4 flex flex-wrap gap-2"><Button onClick={printIndividual}><Printer />Imprimer</Button><Button variant="outline" onClick={() => void social("individual", false)}><ImageIcon />Post</Button><Button variant="outline" onClick={() => void social("individual", true)}><Download />Story</Button></div></article>
                <article className="rounded-2xl border p-5"><Users className="text-[#1154b3]" /><h4 className="mt-2 text-lg font-black">Challenge interclasses</h4><p className="text-sm text-slate-500">Tous les élèves comptent. Les absents, dispensés et non-finisseurs prennent dernier arrivé + 1.</p><div className="mt-4 flex flex-wrap gap-2"><Button disabled={!classResults.length} onClick={printClasses}><Printer />Imprimer</Button><Button variant="outline" disabled={!classResults.length} onClick={() => void social("classes", false)}><ImageIcon />Post</Button><Button variant="outline" disabled={!classResults.length} onClick={() => void social("classes", true)}><Download />Story</Button></div></article>
              </div>
              {classResults.length > 0 && <div className="mt-5 rounded-2xl bg-slate-50 p-4"><div className="flex flex-wrap gap-3">{classResults.slice(0, 5).map((result, index) => <Badge key={result.className} className="px-3 py-1.5 text-sm">{index + 1}. {result.className} · {result.points} pts</Badge>)}</div></div>}
            </section>
          )}
        </>
      )}

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) resetCreate(); }}>
        <DialogContent className="flex max-h-[90vh] flex-col overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 px-6 pt-6"><DialogTitle>Créer une course</DialogTitle><DialogDescription>Choisissez les classes concernées. Tous les élèves sélectionnés compteront dans le challenge interclasses.</DialogDescription></DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
            <div className="grid gap-4 py-3 sm:grid-cols-2"><div className="sm:col-span-2"><Label>Nom de la course *</Label><Input value={heatName} onChange={(event) => setHeatName(event.target.value)} placeholder="Ex. 6e filles" /></div><div><Label>Sexe</Label><Select value={sexFilter} onValueChange={setSexFilter}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous</SelectItem><SelectItem value="female">Filles</SelectItem><SelectItem value="male">Garçons</SelectItem></SelectContent></Select></div><label className="flex items-center gap-3 self-end rounded-xl bg-amber-50 px-4 py-3 font-bold"><input type="checkbox" checked={challengeEnabled} onChange={(event) => setChallengeEnabled(event.target.checked)} className="size-4" />Challenge interclasses</label></div>
            <div className="sticky top-0 z-10 -mx-1 bg-white pb-3 pt-1"><div className="flex flex-col gap-2 sm:flex-row sm:items-center"><div className="relative flex-1"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={classSearch} onChange={(event) => setClassSearch(event.target.value)} className="pl-9" placeholder="Rechercher une classe…" /></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setSelectedClassKeys(new Set(classOptions.map((option) => option.key)))}>Tout sélectionner</Button><Button size="sm" variant="ghost" onClick={() => setSelectedClassKeys(new Set())}>Tout enlever</Button></div></div><p className="mt-2 text-xs text-slate-500">{selectedClassKeys.size} classe(s) sélectionnée(s)</p></div>
            <div className="space-y-5">{[...groupedOptions.entries()].map(([group, options]) => <section key={group}><h4 className="mb-2 text-xs font-black uppercase tracking-widest text-[#1154b3]">{group}</h4><div className="grid gap-2 sm:grid-cols-2">{options.map((option) => { const selected = selectedClassKeys.has(option.key); return <button key={option.key} type="button" onClick={() => toggleClass(option.key)} className={`flex min-h-12 items-center justify-between rounded-xl border px-4 py-2 text-left text-sm font-bold transition ${selected ? "border-[#1154b3] bg-[#1154b3] text-white" : "border-slate-200 bg-white hover:border-blue-300"}`}><span>{option.label}</span><span className={`grid size-5 place-items-center rounded-full border ${selected ? "border-white bg-white text-[#1154b3]" : "border-slate-300"}`}>{selected ? "✓" : ""}</span></button>; })}</div></section>)}</div>
          </div>
          <DialogFooter className="shrink-0 border-t bg-white px-6 py-4"><Button variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button><Button disabled={loading || !heatName.trim() || selectedClassKeys.size === 0} onClick={() => void createHeat()}><Flag />Créer la course</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Ajouter un poste d’arrivée</DialogTitle><DialogDescription>Sur iPad ou téléphone, scannez le QR code. Sur PC ou Mac, copiez simplement le lien. Le code à 6 chiffres permet aussi de passer par « Rejoindre une course » sur la page d’accueil.</DialogDescription></DialogHeader>
          <div className="text-center">{qr && <img src={qr} alt="QR code du poste d’arrivée" className="mx-auto size-60 rounded-2xl border bg-white p-2" />}</div>
          <div className="grid gap-2 sm:grid-cols-2"><Button size="lg" variant="outline" onClick={() => void copyShareLink()}><Copy />Copier le lien</Button><Button size="lg" onClick={() => void shareCourse()}><Share2 />Partager</Button></div>
          <div className="rounded-2xl bg-slate-50 p-4 text-center"><p className="text-xs font-black uppercase tracking-widest text-slate-500">Code de course</p><p className="mt-1 font-mono text-3xl font-black tracking-[0.25em] text-[#1154b3]">{stationCode || "—"}</p><p className="mt-2 text-xs text-slate-500">À saisir dans « Rejoindre une course » si vous ne pouvez pas utiliser le QR code ou le lien.</p></div>
          <p className="text-center text-sm text-slate-500">Jusqu’à 4 postes simultanés. Chaque appareil choisira ensuite « Début de la course » ou « Suite de la course ».</p>
        </DialogContent>
      </Dialog>

      <Dialog open={brandingOpen} onOpenChange={setBrandingOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>En-tête & identité visuelle</DialogTitle><DialogDescription>Cette identité est utilisée sur les PDF de résultats, les posts, les stories et dans l’en-tête du cross.</DialogDescription></DialogHeader>
          <div className="grid gap-5 sm:grid-cols-2"><div className="sm:col-span-2"><Label>Titre affiché</Label><Input value={branding.title} onChange={(event) => updateBranding({ title: event.target.value })} /></div><div className="sm:col-span-2"><Label>Sous-titre</Label><Input value={branding.subtitle} onChange={(event) => updateBranding({ subtitle: event.target.value })} placeholder="Ex. Saint-Lô · 2026" /></div><div className="sm:col-span-2"><Label>Logo de la course</Label><Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => uploadLogo(event.target.files?.[0])} /><p className="mt-1 text-xs text-slate-500">À l’import, Gestion Cross essaie automatiquement de détecter les couleurs principales du logo. Vous pouvez ensuite les ajuster.</p></div>{branding.logoDataUrl && <div className="sm:col-span-2 flex justify-center rounded-2xl bg-slate-50 p-4"><img src={branding.logoDataUrl} alt="Logo de la course" className="max-h-44 max-w-full object-contain" /></div>}<div><Label>Couleur principale</Label><div className="mt-1 flex gap-2"><Input type="color" value={branding.primaryColor} onChange={(event) => updateBranding({ primaryColor: event.target.value })} className="h-11 w-16 p-1" /><Input value={branding.primaryColor} onChange={(event) => updateBranding({ primaryColor: event.target.value })} /></div></div><div><Label>Couleur secondaire</Label><div className="mt-1 flex gap-2"><Input type="color" value={branding.secondaryColor} onChange={(event) => updateBranding({ secondaryColor: event.target.value })} className="h-11 w-16 p-1" /><Input value={branding.secondaryColor} onChange={(event) => updateBranding({ secondaryColor: event.target.value })} /></div></div><div><Label>Couleur d’accent</Label><div className="mt-1 flex gap-2"><Input type="color" value={branding.accentColor} onChange={(event) => updateBranding({ accentColor: event.target.value })} className="h-11 w-16 p-1" /><Input value={branding.accentColor} onChange={(event) => updateBranding({ accentColor: event.target.value })} /></div></div><div className="rounded-2xl p-4 text-white" style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.accentColor})` }}><p className="font-black">Aperçu des couleurs</p><p className="text-sm text-white/80">Les exports reprendront cette palette.</p></div></div>
          <DialogFooter><Button onClick={() => setBrandingOpen(false)}>Terminer</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={statusOpen} onOpenChange={(open) => { setStatusOpen(open); if (!open) setStatusSearch(""); }}>
        <DialogContent className="flex max-h-[88vh] flex-col overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="px-6 pt-6"><DialogTitle>Absents, dispensés et non-finisseurs</DialogTitle><DialogDescription>Ces trois statuts reçoivent tous la même pénalité dans le challenge : dernier arrivé + 1.</DialogDescription></DialogHeader>
          <div className="px-6 pb-3"><div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={statusSearch} onChange={(event) => setStatusSearch(event.target.value)} className="pl-9" placeholder="Nom, classe ou dossard…" /></div></div>
          <div className="min-h-0 flex-1 overflow-y-auto border-y"><div className="divide-y">{statusEntries.map((entry) => <div key={entry.id} className="grid gap-3 px-6 py-3 sm:grid-cols-[1fr_180px] sm:items-center"><div><p className="font-bold"><span className="font-mono text-[#1154b3]">#{entry.participant.bib_number}</span> · {entry.participant.last_name.toUpperCase()} {entry.participant.first_name}</p><p className="text-xs text-slate-500">{entry.participant.class_name}</p></div>{entry.status === "finished" ? <Badge className="w-fit">Arrivé #{entry.finish_position}</Badge> : <Select value={entry.status} onValueChange={(value) => void changeStatus(entry, value as Exclude<EntryStatus, "finished">)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="registered">À courir</SelectItem><SelectItem value="dnf">Non-finisseur</SelectItem><SelectItem value="exempt">Dispensé</SelectItem><SelectItem value="absent">Absent</SelectItem></SelectContent></Select>}</div>)}</div></div>
          <DialogFooter className="shrink-0 px-6 py-4"><Button onClick={() => setStatusOpen(false)}>Fermer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
