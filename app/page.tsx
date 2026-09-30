"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { Toaster, toast } from "sonner";
import { Dashboard } from "@/components/dossard/dashboard";
import { EventWorkspace } from "@/components/dossard/event-workspace";
import { RaceStation } from "@/components/dossard/race-station";
import { deleteEvent, listEvents, listTemplates, saveEvent, saveTemplate } from "@/lib/dossard/storage";
import type { BibTemplate, RaceEvent } from "@/lib/dossard/types";
import { useDossardWebMcp } from "@/lib/dossard/webmcp";
import { publicAsset } from "@/lib/dossard/assets";

export default function Home(){
 const [events,setEvents]=useState<RaceEvent[]>([]),[templates,setTemplates]=useState<BibTemplate[]>([]),[active,setActive]=useState<RaceEvent>(),[loading,setLoading]=useState(true),[stationCode,setStationCode]=useState(""),[saveStatus,setSaveStatus]=useState<"saved"|"saving"|"error">("saved");
 const activeRef=useRef<RaceEvent|undefined>(undefined);
 useEffect(()=>{window.scrollTo({top:0,behavior:"auto"})},[active?.id]);
 useEffect(()=>{const params=new URLSearchParams(window.location.search);Promise.resolve().then(()=>setStationCode((params.get("station")??"").trim().toUpperCase()));Promise.all([listEvents(),listTemplates()]).then(([e,t])=>{setEvents(e);setTemplates(t)}).catch(()=>toast.error("Le stockage local n’a pas pu être ouvert.")).finally(()=>setLoading(false))},[]);
 useEffect(()=>{activeRef.current=active;if(!active)return;const timer=setTimeout(()=>{saveEvent(active).then(saved=>{setEvents(items=>[saved,...items.filter(e=>e.id!==saved.id)]);setSaveStatus("saved")}).catch(()=>setSaveStatus("error"))},550);return()=>clearTimeout(timer)},[active]);
 const openEvent=(event:RaceEvent)=>{activeRef.current=event;setSaveStatus("saved");setActive(event)};
 const changeActive=(event:RaceEvent)=>{activeRef.current=event;setSaveStatus("saving");setActive(event)};
 const createAndOpen=async(event:RaceEvent)=>{const saved=await saveEvent(event);setEvents(items=>[saved,...items]);openEvent(saved)};
 useDossardWebMcp(events,createAndOpen,openEvent);
 const saveTemplateAndRefresh=async(template:BibTemplate)=>{const saved=await saveTemplate(template);setTemplates(items=>[saved,...items.filter(i=>i.id!==saved.id)])};
 const joinCourse=(code:string)=>{const clean=code.trim().toUpperCase();if(!clean)return;const url=new URL(window.location.href);url.searchParams.set("station",clean);window.history.replaceState({},"",url.toString());setStationCode(clean)};
 if(stationCode)return <><RaceStation stationCode={stationCode} onLeave={()=>{const url=new URL(window.location.href);url.searchParams.delete("station");window.history.replaceState({},"",url.toString());setStationCode("")}}/><Toaster position="bottom-right" richColors closeButton/></>;
 if(loading)return <main className="grid min-h-screen place-items-center text-center"><div><span className="mx-auto grid size-16 place-items-center rounded-[1.4rem] bg-primary text-white shadow-xl"><Loader2 className="animate-spin"/></span><p className="mt-4 font-bold text-[#173970]">Préparation de Gestion Cross…</p></div></main>;
 return <div className="min-h-screen text-[#102347]">
  {!active&&<header className="border-b border-border bg-white"><div className="cross-shell flex min-h-20 items-center gap-3 py-3 sm:gap-4"><Image src={publicAsset("/logo-bon-sauveur-cross.png")} alt="Gestion Cross" width={64} height={64} priority className="size-14 shrink-0 rounded-xl bg-white object-contain"/><div className="min-w-0 flex-1"><p className="text-xl font-bold leading-tight tracking-tight text-primary">Gestion Cross</p><p className="mt-1 text-sm text-muted-foreground">L’organisation du cross, simplement.</p></div><span className="hidden items-center gap-2 rounded-full border border-border px-3 py-2 text-xs font-medium text-muted-foreground md:inline-flex"><Flag className="size-4 text-primary"/>Créé par L. RIGAUX</span></div></header>}
  {active?<EventWorkspace event={active} templates={templates} saveStatus={saveStatus} onChange={changeActive} onSaveTemplate={saveTemplateAndRefresh} onBack={async()=>{const current=activeRef.current;if(current){const saved=await saveEvent(current);setEvents(items=>[saved,...items.filter(e=>e.id!==saved.id)])}activeRef.current=undefined;setActive(undefined);setSaveStatus("saved")}}/>:<Dashboard events={events} templates={templates} onCreate={createAndOpen} onOpen={openEvent} onJoinCourse={joinCourse} onDelete={async event=>{await deleteEvent(event.id);setEvents(items=>items.filter(i=>i.id!==event.id));toast.success("Cross supprimé.")}}/>}
  <Toaster position="bottom-right" richColors closeButton/>
 </div>;
}
