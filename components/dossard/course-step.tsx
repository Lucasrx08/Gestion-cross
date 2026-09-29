"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, CircleStop, Cloud, Flag, Link2, Medal, Play, Printer, RefreshCw, RotateCcw, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { RaceEvent } from "@/lib/dossard/types";
import { formatElapsed, type CloudEvent, type CloudHeat, type HeatEntry, ownerApi, raceErrorMessage } from "@/lib/dossard/race-api";

interface OwnerState { event: CloudEvent | null; heats: CloudHeat[]; }
interface HeatEntriesResponse { heat: CloudHeat; entries: HeatEntry[]; }

function isFemale(value?: string) { return /^(f|fille|female|féminin|feminin|girl)$/i.test((value ?? "").trim()); }
function isMale(value?: string) { return /^(m|garçon|garcon|male|masculin|boy)$/i.test((value ?? "").trim()); }
function stationStorageKey(heatId: string) { return `gestion-cross-station-code:${heatId}`; }

function statusLabel(status: HeatEntry["status"]) {
  return status === "finished" ? "Arrivé" : status === "dnf" ? "Abandon / non classé" : status === "exempt" ? "Dispensé" : "À courir";
}

function statusTone(status: HeatEntry["status"]) {
  return status === "finished" ? "bg-emerald-50 text-emerald-700" : status === "exempt" ? "bg-violet-50 text-violet-700" : status === "dnf" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600";
}

function buildChallenge(entries: HeatEntry[], classes: string[]) {
  const finishers = entries.filter((entry) => entry.status === "finished" && entry.finish_position != null);
  const penalty = Math.max(1, ...finishers.map((entry) => entry.finish_position ?? 0)) + 1;
  return classes.map((className) => {
    const members = entries.filter((entry) => entry.participant.class_name === className);
    const points = members.reduce((sum, entry) => sum + (entry.status === "finished" && entry.finish_position ? entry.finish_position : penalty), 0);
    return { className, points, members: members.length, penalty };
  }).sort((a, b) => a.points - b.points || a.className.localeCompare(b.className, "fr"));
}

function printResults(heat: CloudHeat, entries: HeatEntry[]) {
  const ranked = entries.filter((entry) => entry.status === "finished").sort((a, b) => (a.finish_position ?? 99999) - (b.finish_position ?? 99999));
  const challenge = heat.challenge_enabled ? buildChallenge(entries, heat.challenge_classes.length ? heat.challenge_classes : heat.selected_classes) : [];
  const rows = ranked.map((entry) => `<tr><td>${entry.finish_position ?? ""}</td><td>${entry.participant.bib_number}</td><td>${entry.participant.last_name.toUpperCase()}</td><td>${entry.participant.first_name}</td><td>${entry.participant.class_name}</td><td>${formatElapsed(entry.elapsed_ms)}</td></tr>`).join("");
  const challengeRows = challenge.map((item, index) => `<tr><td>${index + 1}</td><td>${item.className}</td><td>${item.points}</td><td>${item.members}</td></tr>`).join("");
  const popup = window.open("", "_blank", "width=1000,height=800");
  if (!popup) return;
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${heat.name}</title><style>body{font-family:Arial,sans-serif;color:#102347;padding:28px}h1{color:#1154b3;margin-bottom:4px}h2{margin-top:30px}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border:1px solid #dbe5f2;padding:8px;text-align:left}th{background:#eef5ff}.meta{color:#64748b}@media print{body{padding:0}}</style></head><body><h1>${heat.name}</h1><p class="meta">Classement généré par Gestion Cross</p><table><thead><tr><th>Rang</th><th>Dossard</th><th>Nom</th><th>Prénom</th><th>Classe</th><th>Temps</th></tr></thead><tbody>${rows}</tbody></table>${challenge.length ? `<h2>Challenge classes</h2><p>Le plus petit total de points est classé en premier. Les non-finisseurs et dispensés reçoivent ${challenge[0]?.penalty ?? 0} points.</p><table><thead><tr><th>Rang</th><th>Classe</th><th>Points</th><th>Élèves</th></tr></thead><tbody>${challengeRows}</tbody></table>` : ""}</body></html>`);
  popup.document.close();
  popup.focus();
  window.setTimeout(() => popup.print(), 250);
}

export function CourseStep({ event }: { event: RaceEvent }) {
  const classes = useMemo(() => [...new Set(event.participants.map((participant) => participant.className).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")), [event.participants]);
  const [cloudEvent, setCloudEvent] = useState<CloudEvent | null>(null);
  const [heats, setHeats] = useState<CloudHeat[]>([]);
  const [selectedHeatId, setSelectedHeatId] = useState<string>();
  const [entries, setEntries] = useState<HeatEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [heatName, setHeatName] = useState("");
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());
  const [sexFilter, setSexFilter] = useState("all");
  const [challengeEnabled, setChallengeEnabled] = useState(true);
  const [stationCode, setStationCode] = useState("");
  const selectedHeat = heats.find((heat) => heat.id === selectedHeatId);

  const refreshOwnerState = async () => {
    try {
      const state = await ownerApi<OwnerState>("owner_state", { localEventId: event.id });
      setCloudEvent(state.event);
      setHeats(state.heats ?? []);
      if (!selectedHeatId && state.heats?.length) setSelectedHeatId(state.heats[0].id);
    } catch (error) {
      toast.error(raceErrorMessage(error));
    }
  };

  const refreshEntries = async (heatId = selectedHeatId) => {
    if (!heatId) return;
    try {
      const result = await ownerApi<HeatEntriesResponse>("heat_entries", { heatId });
      setEntries(result.entries ?? []);
      setHeats((items) => items.map((item) => item.id === result.heat.id ? { ...item, ...result.heat } : item));
    } catch (error) {
      toast.error(raceErrorMessage(error));
    }
  };

  useEffect(() => { void refreshOwnerState(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedHeatId) { setEntries([]); setStationCode(""); return; }
    setStationCode(window.localStorage.getItem(stationStorageKey(selectedHeatId)) ?? "");
    void refreshEntries(selectedHeatId);
  }, [selectedHeatId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedHeatId || selectedHeat?.status !== "running") return;
    const timer = window.setInterval(() => { void refreshEntries(selectedHeatId); }, 2500);
    return () => window.clearInterval(timer);
  }, [selectedHeatId, selectedHeat?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const sync = async () => {
    if (!event.participants.length) return toast.error("Importez d’abord les élèves.");
    setLoading(true);
    try {
      const result = await ownerApi<{ event: CloudEvent; participantCount: number }>("sync_event", { event });
      setCloudEvent(result.event);
      toast.success(`${result.participantCount} élèves synchronisés pour le mode course.`);
      await refreshOwnerState();
    } catch (error) {
      toast.error(raceErrorMessage(error));
    } finally { setLoading(false); }
  };

  const toggleClass = (className: string) => {
    setSelectedClasses((current) => {
      const next = new Set(current);
      if (next.has(className)) next.delete(className); else next.add(className);
      return next;
    });
  };

  const createHeat = async () => {
    if (!cloudEvent) return;
    const selected = [...selectedClasses];
    if (!heatName.trim() || !selected.length) return toast.error("Donnez un nom à la course et choisissez au moins une classe.");
    const participants = event.participants.filter((participant) => selected.includes(participant.className) && (sexFilter === "all" || (sexFilter === "female" ? isFemale(participant.sex) : isMale(participant.sex))));
    if (!participants.length) return toast.error("Aucun élève ne correspond à cette sélection.");
    setLoading(true);
    try {
      const result = await ownerApi<{ heat: CloudHeat; participantCount: number }>("create_heat", {
        eventId: cloudEvent.id,
        name: heatName.trim(),
        selectedClasses: selected,
        sexFilter,
        challengeEnabled,
        challengeClasses: selected,
        participantIds: participants.map((participant) => participant.id),
      });
      setHeatName("");
      setSelectedClasses(new Set());
      toast.success(`Course créée avec ${result.participantCount} participants.`);
      await refreshOwnerState();
      setSelectedHeatId(result.heat.id);
    } catch (error) { toast.error(raceErrorMessage(error)); }
    finally { setLoading(false); }
  };

  const startHeat = async () => {
    if (!selectedHeatId) return;
    setLoading(true);
    try {
      const result = await ownerApi<{ heat: CloudHeat; stationCode: string }>("start_heat", { heatId: selectedHeatId });
      window.localStorage.setItem(stationStorageKey(selectedHeatId), result.stationCode);
      setStationCode(result.stationCode);
      toast.success("Course lancée. Les postes d’arrivée peuvent se connecter.");
      await refreshOwnerState();
      await refreshEntries(selectedHeatId);
    } catch (error) { toast.error(raceErrorMessage(error)); }
    finally { setLoading(false); }
  };

  const regenerateCode = async () => {
    if (!selectedHeatId) return;
    try {
      const result = await ownerApi<{ stationCode: string }>("regenerate_station_code", { heatId: selectedHeatId });
      window.localStorage.setItem(stationStorageKey(selectedHeatId), result.stationCode);
      setStationCode(result.stationCode);
      toast.success("Nouveau code d’arrivée généré.");
    } catch (error) { toast.error(raceErrorMessage(error)); }
  };

  const finishHeat = async () => {
    if (!selectedHeatId || !confirm("Terminer la course ? Les élèves encore 'À courir' seront classés non-finisseurs.")) return;
    try {
      await ownerApi("finish_heat", { heatId: selectedHeatId });
      toast.success("Course terminée et classement figé.");
      await refreshOwnerState();
      await refreshEntries(selectedHeatId);
    } catch (error) { toast.error(raceErrorMessage(error)); }
  };

  const changeStatus = async (entry: HeatEntry, status: "registered" | "dnf" | "exempt") => {
    try {
      await ownerApi("set_entry_status", { entryId: entry.id, status });
      await refreshEntries();
    } catch (error) { toast.error(raceErrorMessage(error)); }
  };

  const removeFinish = async (entry: HeatEntry) => {
    if (!confirm(`Supprimer l’arrivée de ${entry.participant.first_name} ${entry.participant.last_name} ?`)) return;
    try {
      await ownerApi("remove_finish", { entryId: entry.id });
      await refreshEntries();
    } catch (error) { toast.error(raceErrorMessage(error)); }
  };

  const move = async (entry: HeatEntry, delta: number) => {
    const position = (entry.finish_position ?? 0) + delta;
    if (position < 1) return;
    try {
      await ownerApi("reorder_finish", { entryId: entry.id, position });
      await refreshEntries();
    } catch (error) { toast.error(raceErrorMessage(error)); }
  };

  const stationLink = stationCode && typeof window !== "undefined" ? `${window.location.origin}${window.location.pathname}?station=${encodeURIComponent(stationCode)}` : "";
  const challenge = selectedHeat?.challenge_enabled ? buildChallenge(entries, selectedHeat.challenge_classes.length ? selectedHeat.challenge_classes : selectedHeat.selected_classes) : [];
  const ranked = entries.filter((entry) => entry.status === "finished").sort((a, b) => (a.finish_position ?? 99999) - (b.finish_position ?? 99999));

  return <div className="space-y-6">
    <section className="race-card rounded-[1.6rem] border bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div><div className="flex items-center gap-2"><Cloud className="text-[#1154b3]"/><h2 className="text-xl font-black">Mode Course</h2></div><p className="mt-1 max-w-3xl text-sm text-slate-500">Synchronisez la liste pour gérer les arrivées sur plusieurs ordinateurs. Le code de course suffit pour ouvrir un second couloir d’arrivée, sans définir à l’avance les places prises par chaque PC.</p></div>
        <Button onClick={sync} disabled={loading || !event.participants.length}><RefreshCw className={loading ? "animate-spin" : ""}/>{cloudEvent ? "Resynchroniser les élèves" : "Activer le mode course"}</Button>
      </div>
      {cloudEvent && <div className="mt-4 flex flex-wrap gap-2"><Badge className="bg-emerald-50 text-emerald-700">Cloud prêt</Badge><Badge variant="outline">{event.participants.length} élèves</Badge><Badge variant="outline">{heats.length} course{heats.length > 1 ? "s" : ""}</Badge></div>}
    </section>

    {cloudEvent && <section className="grid gap-5 xl:grid-cols-[420px_minmax(0,1fr)]">
      <div className="space-y-5">
        <div className="race-card rounded-[1.6rem] border bg-white p-5 shadow-sm">
          <h3 className="font-black">Créer une course</h3>
          <div className="mt-4 space-y-4"><div><Label>Nom de la course</Label><Input value={heatName} onChange={(e) => setHeatName(e.target.value)} placeholder="Ex. 6e filles" /></div><div><Label>Sexe</Label><Select value={sexFilter} onValueChange={setSexFilter}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">Tous</SelectItem><SelectItem value="female">Filles</SelectItem><SelectItem value="male">Garçons</SelectItem></SelectContent></Select></div><div><Label>Classes concernées</Label><div className="mt-2 grid grid-cols-2 gap-2">{classes.map((className) => <label key={className} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-bold ${selectedClasses.has(className) ? "border-blue-500 bg-blue-50 text-blue-800" : "bg-white"}`}><input type="checkbox" checked={selectedClasses.has(className)} onChange={() => toggleClass(className)} />{className}</label>)}</div></div><label className="flex items-center gap-2 rounded-xl bg-[#fff8cc] p-3 text-sm font-bold"><input type="checkbox" checked={challengeEnabled} onChange={(e) => setChallengeEnabled(e.target.checked)} />Activer le challenge classes</label><Button className="w-full" onClick={createHeat} disabled={loading}><Flag/>Créer la course</Button></div>
        </div>

        <div className="race-card rounded-[1.6rem] border bg-white p-5 shadow-sm"><h3 className="font-black">Courses</h3><div className="mt-3 space-y-2">{!heats.length && <p className="text-sm text-slate-500">Aucune course créée.</p>}{heats.map((heat) => <button key={heat.id} onClick={() => setSelectedHeatId(heat.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedHeatId === heat.id ? "border-[#1154b3] bg-blue-50" : "hover:bg-slate-50"}`}><div className="flex items-center justify-between gap-2"><span className="font-black">{heat.name}</span><Badge className={heat.status === "running" ? "bg-emerald-100 text-emerald-800" : heat.status === "finished" ? "bg-slate-200 text-slate-700" : "bg-blue-100 text-blue-800"}>{heat.status === "running" ? "En cours" : heat.status === "finished" ? "Terminée" : "Prête"}</Badge></div><p className="mt-1 text-xs text-slate-500">{heat.selected_classes.join(", ")} · {heat.counts?.finished ?? heat.next_position} arrivée(s)</p></button>)}</div></div>
      </div>

      <div className="space-y-5">
        {!selectedHeat ? <div className="grid min-h-80 place-items-center rounded-[1.6rem] border bg-white text-slate-500">Sélectionnez une course.</div> : <>
          <div className="race-card rounded-[1.6rem] border bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><h2 className="text-2xl font-black">{selectedHeat.name}</h2><p className="text-sm text-slate-500">{selectedHeat.selected_classes.join(", ")} · {entries.length} engagés</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void refreshEntries()}><RefreshCw/>Actualiser</Button>{selectedHeat.status === "draft" && <Button onClick={startHeat}><Play/>Lancer la course</Button>}{selectedHeat.status === "running" && <Button className="bg-red-600 hover:bg-red-700" onClick={finishHeat}><CircleStop/>Terminer</Button>}{selectedHeat.status === "finished" && <Button onClick={() => printResults(selectedHeat, entries)}><Printer/>Imprimer les classements</Button>}</div></div>

            {selectedHeat.status === "running" && <div className="mt-5 rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase tracking-widest text-blue-500">Code d’arrivée</p><p className="mt-1 font-mono text-3xl font-black tracking-[.18em] text-[#102347]">{stationCode || "Code perdu"}</p><p className="mt-2 text-sm text-slate-600">Ouvrez ce lien sur autant de PC que nécessaire : chaque poste rejoint immédiatement le même couloir logique.</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" onClick={regenerateCode}><RotateCcw/>Nouveau code</Button>{stationLink && <Button variant="outline" onClick={async () => { await navigator.clipboard.writeText(stationLink); toast.success("Lien copié."); }}><Link2/>Copier le lien</Button>}</div></div>{stationLink && <p className="mt-3 break-all rounded-lg bg-white p-2 font-mono text-xs text-blue-700">{stationLink}</p>}</div>}

            <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">{[{label:"Engagés",value:entries.length},{label:"Arrivés",value:entries.filter((e)=>e.status==="finished").length},{label:"Dispensés",value:entries.filter((e)=>e.status==="exempt").length},{label:"Non-finisseurs",value:entries.filter((e)=>e.status==="dnf").length}].map((item) => <div key={item.label} className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">{item.label}</p><p className="text-2xl font-black">{item.value}</p></div>)}</div>
          </div>

          <div className="overflow-hidden rounded-[1.6rem] border bg-white shadow-sm"><div className="flex items-center justify-between border-b p-4"><div><h3 className="font-black">Arrivées et statuts</h3><p className="text-xs text-slate-500">Les flèches corrigent immédiatement l’ordre d’arrivée.</p></div>{selectedHeat.status !== "draft" && <Button size="sm" variant="outline" onClick={() => printResults(selectedHeat, entries)}><Printer/>Imprimer</Button>}</div><div className="overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="bg-blue-50 text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Rang</th><th>Dossard</th><th>Élève</th><th>Classe</th><th>Temps</th><th>Statut</th><th className="px-4 text-right">Actions</th></tr></thead><tbody className="divide-y">{[...entries].sort((a,b) => (a.finish_position ?? 999999) - (b.finish_position ?? 999999) || a.participant.last_name.localeCompare(b.participant.last_name,"fr")).map((entry) => <tr key={entry.id} className="hover:bg-slate-50"><td className="px-4 py-3 text-lg font-black text-[#1154b3]">{entry.finish_position ?? "—"}</td><td className="font-mono font-bold">{entry.participant.bib_number}</td><td><b>{entry.participant.last_name.toUpperCase()}</b><br/><span className="text-slate-500">{entry.participant.first_name}</span></td><td>{entry.participant.class_name}</td><td className="font-mono text-xs">{formatElapsed(entry.elapsed_ms)}</td><td><Badge className={statusTone(entry.status)}>{statusLabel(entry.status)}</Badge></td><td className="px-4"><div className="flex justify-end gap-1">{entry.status === "finished" ? <><Button size="icon-sm" variant="ghost" disabled={entry.finish_position === 1} onClick={() => move(entry,-1)}><ArrowUp/></Button><Button size="icon-sm" variant="ghost" disabled={entry.finish_position === ranked.length} onClick={() => move(entry,1)}><ArrowDown/></Button><Button size="icon-sm" variant="ghost" title="Annuler cette arrivée" onClick={() => removeFinish(entry)}><RotateCcw/></Button></> : <Select value={entry.status} onValueChange={(value) => void changeStatus(entry, value as "registered"|"dnf"|"exempt")}><SelectTrigger className="w-36"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="registered">À courir</SelectItem><SelectItem value="dnf">Abandon</SelectItem><SelectItem value="exempt">Dispensé</SelectItem></SelectContent></Select>}</div></td></tr>)}</tbody></table></div></div>

          {selectedHeat.challenge_enabled && <div className="race-card rounded-[1.6rem] border bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><Medal className="text-[#d9a700]"/><h3 className="text-lg font-black">Challenge classes</h3></div><p className="mt-1 text-sm text-slate-500">1er = 1 point, 50e = 50 points. Les dispensés et non-finisseurs prennent la place du dernier arrivé + 1. Le plus petit total gagne.</p><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{challenge.map((item,index) => <div key={item.className} className={`rounded-2xl border p-4 ${index===0 ? "border-yellow-300 bg-yellow-50" : "bg-slate-50"}`}><div className="flex items-center justify-between"><span className="text-2xl font-black">{index+1}</span><Users className="text-slate-400"/></div><p className="mt-2 text-lg font-black">{item.className}</p><p className="text-3xl font-black text-[#1154b3]">{item.points} pts</p><p className="text-xs text-slate-500">{item.members} élèves · pénalité {item.penalty} pts</p></div>)}</div></div>}
        </>}
      </div>
    </section>}
  </div>;
}
