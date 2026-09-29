"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Flag, Loader2, ScanLine, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatElapsed, raceErrorMessage, stationApi, type StationState } from "@/lib/dossard/race-api";

function stationId() {
  const key = "gestion-cross-station-id-v1";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const value = `Poste-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  window.localStorage.setItem(key, value);
  return value;
}

export function RaceStation({ stationCode, onLeave }: { stationCode: string; onLeave: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<StationState>();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [connected, setConnected] = useState(true);
  const [postId, setPostId] = useState("Poste");
  const [lastArrival, setLastArrival] = useState<{ finish_position: number; bib_code: string; first_name: string; last_name: string; class_name: string; elapsed_ms: number }>();

  const refresh = async (quiet = false) => {
    try {
      const next = await stationApi<StationState>("station_state", { stationCode });
      setState(next);
      setConnected(true);
    } catch (error) {
      setConnected(false);
      if (!quiet) toast.error(raceErrorMessage(error));
    } finally { setLoading(false); }
  };

  useEffect(() => {
    setPostId(stationId());
    void refresh();
    const timer = window.setInterval(() => { void refresh(true); }, 1800);
    return () => window.clearInterval(timer);
  }, [stationCode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onOnline = () => void refresh(true);
    const onOffline = () => setConnected(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => { window.removeEventListener("online", onOnline); window.removeEventListener("offline", onOffline); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (!loading && state?.heat.status === "running") inputRef.current?.focus(); }, [loading, state?.heat.status]);

  const scan = async () => {
    const bibCode = code.trim();
    if (!bibCode || scanning || state?.heat.status !== "running") return;
    if (!navigator.onLine || !connected) {
      toast.error("Connexion indisponible : aucun scan n’est enregistré hors ligne afin d’éviter un ordre d’arrivée incorrect.");
      return;
    }
    setScanning(true);
    setCode("");
    try {
      const result = await stationApi<{ arrival: { finish_position: number; bib_code: string; first_name: string; last_name: string; class_name: string; elapsed_ms: number } }>("scan", { stationCode, bibCode, stationId: postId });
      setLastArrival(result.arrival);
      setConnected(true);
      toast.success(`#${result.arrival.finish_position} · ${result.arrival.first_name} ${result.arrival.last_name}`);
      await refresh(true);
    } catch (error) {
      setConnected(false);
      toast.error(raceErrorMessage(error));
    } finally {
      setScanning(false);
      window.setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-50"><div className="text-center"><Loader2 className="mx-auto size-10 animate-spin text-[#1154b3]"/><p className="mt-3 font-bold">Connexion à la course…</p></div></main>;

  return <main className="min-h-screen bg-[#f5f8fc] text-[#102347]">
    <header className="race-band border-b border-blue-900/20 text-white shadow-lg"><div className="mx-auto flex min-h-20 max-w-5xl items-center gap-3 px-4"><Button size="icon-sm" variant="ghost" className="text-white hover:bg-white/15 hover:text-white" onClick={onLeave}><ArrowLeft/></Button><div className="grid size-12 place-items-center rounded-xl bg-white/10"><Flag className="text-[#fed60b]"/></div><div className="min-w-0 flex-1"><p className="truncate text-lg font-black">{state?.heat.event?.name || "Gestion Cross"}</p><p className="truncate text-sm text-blue-100">{state?.heat.name} · {postId}</p></div><Badge className={`border-white/20 text-white ${connected ? "bg-white/10" : "bg-red-600"}`}>{connected ? <Wifi className="text-emerald-300"/> : <WifiOff/>}{connected ? "Connecté" : "Hors connexion"}</Badge></div></header>

    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      {!connected && <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">Connexion au serveur perdue. Les scans sont volontairement bloqués jusqu’au retour du réseau pour préserver l’ordre exact des arrivées.</section>}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{[{label:"Engagés",value:state?.counts.total??0},{label:"Arrivés",value:state?.counts.finished??0},{label:"Dispensés",value:state?.counts.exempt??0},{label:"Absents",value:state?.counts.absent??0},{label:"Non-finisseurs",value:state?.counts.dnf??0}].map((item)=><div key={item.label} className="rounded-2xl border bg-white p-4 shadow-sm"><p className="text-sm text-slate-500">{item.label}</p><p className="mt-1 text-3xl font-black">{item.value}</p></div>)}</section>

      <section className="rounded-[1.8rem] border bg-white p-6 text-center shadow-sm">
        {state?.heat.status === "running" ? <><div className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#fff3a9] text-[#1154b3]"><ScanLine className="size-8"/></div><h1 className="mt-4 text-2xl font-black">Scanner les arrivées</h1><p className="mt-1 text-sm text-slate-500">La douchette peut envoyer 1, 001 ou 0001 : le numéro de dossard sera reconnu. Entrée valide automatiquement.</p><div className="mx-auto mt-5 max-w-xl"><Input ref={inputRef} value={code} onChange={(e)=>setCode(e.target.value)} onKeyDown={(e)=>{if(e.key==="Enter"){e.preventDefault();void scan();}}} placeholder="Scanner ou saisir le numéro du dossard" className="h-16 text-center font-mono text-2xl font-black" inputMode="numeric" autoComplete="off" disabled={scanning || !connected}/><Button className="mt-3 h-12 w-full" onClick={()=>void scan()} disabled={!code.trim()||scanning||!connected}>{scanning?<Loader2 className="animate-spin"/>:<ScanLine/>}Valider l’arrivée</Button></div></> : <><CheckCircle2 className="mx-auto size-16 text-emerald-500"/><h1 className="mt-4 text-2xl font-black">Course terminée</h1><p className="mt-1 text-slate-500">Le poste est en lecture seule. Les corrections et classements sont disponibles sur l’ordinateur organisateur.</p></>}
      </section>

      {lastArrival && <section className="rounded-[1.5rem] border-2 border-emerald-200 bg-emerald-50 p-5"><p className="text-xs font-black uppercase tracking-widest text-emerald-700">Dernière arrivée enregistrée</p><div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-4xl font-black text-emerald-800">#{lastArrival.finish_position}</p><p className="text-xl font-black">{lastArrival.first_name} {lastArrival.last_name.toUpperCase()}</p><p className="text-sm text-slate-600">Dossard {lastArrival.bib_code} · {lastArrival.class_name}</p></div><p className="font-mono text-xl font-black">{formatElapsed(lastArrival.elapsed_ms)}</p></div></section>}

      <section className="overflow-hidden rounded-[1.5rem] border bg-white shadow-sm"><div className="border-b p-4"><h2 className="font-black">20 dernières arrivées</h2><p className="text-xs text-slate-500">Mise à jour automatique depuis tous les postes.</p></div><div className="divide-y">{!state?.recent.length && <p className="p-6 text-center text-sm text-slate-500">Aucune arrivée pour le moment.</p>}{state?.recent.map((arrival)=><div key={arrival.id} className="flex items-center gap-4 p-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-lg font-black text-[#1154b3]">{arrival.finish_position}</span><div className="min-w-0 flex-1"><p className="truncate font-black">{arrival.participant.first_name} {arrival.participant.last_name.toUpperCase()}</p><p className="truncate text-xs text-slate-500">Dossard {arrival.participant.bib_code} · {arrival.participant.class_name} · {arrival.station_id}</p></div><span className="font-mono text-sm font-bold">{formatElapsed(arrival.elapsed_ms)}</span></div>)}</div></section>
    </div>
  </main>;
}
