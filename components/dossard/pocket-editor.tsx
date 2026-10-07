"use client";
import Image from "next/image";
import { useState } from "react";
import { Download, Plus, Trash2, Move } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveEventBranding } from "@/lib/dossard/event-branding";
import { downloadBlob, safeFileName } from "@/lib/dossard/exports";
import type { RaceEvent } from "@/lib/dossard/types";
import type { ClassPocket } from "@/lib/dossard/print-documents";

export function PocketEditor({event,onChange,classes}:{event:RaceEvent;onChange:(event:RaceEvent)=>void;classes:string[]}) {
  const [activeId,setActiveId]=useState("");const [busy,setBusy]=useState(false);
  const pockets=event.classPockets??[];
  const active=pockets.find(p=>p.id===activeId)??pockets[0];const branding=resolveEventBranding(event);
  const save=(next:ClassPocket[])=>onChange({...event,classPockets:next});
  const update=(patch:Partial<ClassPocket>)=>{if(active)save(pockets.map(p=>p.id===active.id?{...p,...patch}:p));};
  const create=()=>{const id=crypto.randomUUID();save([...pockets,{id,classes:[],text:"",x:12,y:70,fontSize:18}]);setActiveId(id);};
  const generate=async(all:boolean)=>{
    const selected=all?classes.map((name,i)=>({id:String(i),classes:[name],text:"",x:12,y:70,fontSize:18})):pockets.filter(p=>p.classes.length);
    if(!selected.length)return toast.error("Associez au moins une classe à une pochette.");
    setBusy(true);try{const {generatePocketPdf}=await import("@/lib/dossard/print-documents");const bytes=await generatePocketPdf(event,selected);downloadBlob(new Blob([new Uint8Array(bytes)],{type:"application/pdf"}),`${safeFileName(event.name)}-pochettes-classes.pdf`);toast.success(`${selected.length} pochette(s) téléchargée(s).`);}catch(error){toast.error(error instanceof Error?error.message:"Création impossible.");}finally{setBusy(false);}
  };
  return <section className="cross-panel space-y-5 p-5">
    <div><h2 className="text-xl font-black">Pochettes de classes</h2><p className="text-sm text-slate-500">Une feuille A4 paysage à plier au milieu pour ranger les dossards. Associez plusieurs classes et ajoutez le nom du collègue ou un texte libre. Ces réglages sont sauvegardés avec l’événement.</p></div>
    <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={create}><Plus/>Créer une pochette</Button><Button variant="outline" disabled={busy||!classes.length} onClick={()=>void generate(true)}><Download/>PDF : une pochette par classe</Button></div>
    {!!pockets.length&&<div className="flex flex-wrap gap-2">{pockets.map((p,i)=><Button key={p.id} variant={p.id===active?.id?"default":"outline"} onClick={()=>setActiveId(p.id)}>{p.classes.join(" + ")||`Pochette ${i+1}`}</Button>)}</div>}
    {active&&<div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <fieldset><legend className="mb-2 text-sm font-semibold">Classes à associer à cette pochette</legend><div className="grid max-h-56 grid-cols-2 gap-2 overflow-y-auto rounded-xl border p-3">{classes.map(name=><label key={name} className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={active.classes.includes(name)} onChange={e=>update({classes:e.target.checked?[...active.classes,name]:active.classes.filter(c=>c!==name)})}/>{name}</label>)}</div></fieldset>
        <div><Label htmlFor="pocket-text">Texte libre</Label><textarea id="pocket-text" maxLength={240} rows={3} className="mt-2 w-full rounded-lg border p-3 text-sm" placeholder="Ex. : Mme Dupont · Distribution au départ" value={active.text} onChange={e=>update({text:e.target.value})}/></div>
        <div className="grid grid-cols-3 gap-2"><div><Label htmlFor="pocket-x">Position X (%)</Label><Input id="pocket-x" type="number" min={5} max={75} value={active.x} onChange={e=>update({x:Math.max(5,Math.min(75,Number(e.target.value)))})}/></div><div><Label htmlFor="pocket-y">Position Y (%)</Label><Input id="pocket-y" type="number" min={5} max={85} value={active.y} onChange={e=>update({y:Math.max(5,Math.min(85,Number(e.target.value)))})}/></div><div><Label htmlFor="pocket-size">Taille du texte</Label><Input id="pocket-size" type="number" min={10} max={30} value={active.fontSize} onChange={e=>update({fontSize:Math.max(10,Math.min(30,Number(e.target.value)))})}/></div></div>
        <p className="flex items-center gap-2 text-sm text-slate-500"><Move className="size-4"/>Déplacez le texte dans l’aperçu, au doigt ou à la souris. Les positions X et Y permettent aussi un réglage précis.</p>
        <Button variant="outline" onClick={()=>save(pockets.filter(p=>p.id!==active.id))}><Trash2/>Supprimer cette pochette</Button>
      </div>
      <div>
        <div className="relative aspect-[297/210] overflow-hidden rounded-lg border bg-white shadow-sm" aria-label="Aperçu de la pochette A4 paysage">
          <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-slate-300"/>
          <div className="absolute left-[4%] top-[7%] w-[42%] text-center">
            {branding.logoDataUrl&&<Image unoptimized width={160} height={80} src={branding.logoDataUrl} alt="Logo de l’événement" className="mx-auto mb-3 h-14 max-w-full object-contain"/>}
            <p className="text-base font-black sm:text-lg" style={{color:branding.primaryColor}}>{branding.title}</p>
            <div className="my-3 border-b-2" style={{borderColor:branding.secondaryColor}}/>
            <p className="text-sm font-bold" style={{color:branding.primaryColor}}>{active.classes.join(" · ")||"Classes à choisir"}</p>
          </div>
          <button type="button" aria-label="Déplacer le texte libre" className="absolute cursor-move touch-none rounded border border-dashed border-slate-400 p-1 text-left" style={{left:`${active.x/2}%`,top:`${active.y}%`,maxWidth:`${48-active.x/2}%`,color:branding.primaryColor,fontSize:`${active.fontSize/2}px`}}
            onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);}}
            onPointerMove={e=>{if(!e.currentTarget.hasPointerCapture(e.pointerId))return;const r=e.currentTarget.parentElement!.getBoundingClientRect();update({x:Math.round(Math.max(5,Math.min(75,(e.clientX-r.left)/r.width*200))),y:Math.round(Math.max(5,Math.min(85,(e.clientY-r.top)/r.height*100)))});}}
            onPointerUp={e=>{if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}>{active.text||"Votre texte libre"}</button>
        </div>
        <p className="mt-2 text-xs text-slate-500">La moitié droite reste libre. Le PDF comprend seulement un repère central de pliage, sans URL ni numéro de page.</p>
      </div>
    </div>}
    {!!pockets.length&&<Button disabled={busy||!pockets.some(p=>p.classes.length)} onClick={()=>void generate(false)}><Download/>{busy?"Création…":"Télécharger mes pochettes personnalisées"}</Button>}
  </section>;
}
