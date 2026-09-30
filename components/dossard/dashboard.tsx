"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { ArrowUpRight, CalendarDays, ChevronRight, Flag, MapPin, Medal, Plus, QrCode, ScanLine, Trash2, Users } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { publicAsset } from "@/lib/dossard/assets";
import { createRaceEvent } from "@/lib/dossard/defaults";
import type { BibTemplate, RaceEvent } from "@/lib/dossard/types";

const initial = { name: "", year: new Date().getFullYear(), location: "Saint-Lô", date: "" };

export function Dashboard({ events, templates, onCreate, onOpen, onDelete, onJoinCourse }: {
  events: RaceEvent[];
  templates: BibTemplate[];
  onCreate: (event: RaceEvent) => Promise<void>;
  onOpen: (event: RaceEvent) => void;
  onDelete: (event: RaceEvent) => Promise<void>;
  onJoinCourse: (code: string) => void;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<RaceEvent>();
  const [name, setName] = useState("");
  const [year, setYear] = useState(initial.year);
  const [location, setLocation] = useState(initial.location);
  const [date, setDate] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const total = useMemo(() => events.reduce((sum, event) => sum + event.participants.length, 0), [events]);
  const reset = () => { setName(""); setYear(initial.year); setLocation(initial.location); setDate(""); };
  const cleanJoinCode = (value: string) => value.replace(/\D/g, "").slice(0, 6);
  const openJoinedCourse = () => {
    if (joinCode.length !== 6) return;
    onJoinCourse(joinCode);
    setJoinOpen(false);
    setJoinCode("");
  };

  return (
    <main className="cross-shell py-6 sm:py-9">
      <section className="cross-panel grid overflow-hidden lg:grid-cols-[1.5fr_1fr]">
        <div className="p-6 sm:p-9 lg:p-11">
          <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-primary"><span className="size-2 rounded-full bg-[#fed60b]" />Votre cross, bien organisé</span>
          <h1 className="mt-5 max-w-2xl text-[clamp(2rem,4.3vw,3.6rem)] font-bold leading-[1.1] tracking-[-.045em]">Du premier dossard<br className="hidden sm:block" /> au <span className="text-primary">dernier arrivé.</span></h1>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground">Préparez votre événement à votre rythme. Le jour du cross, tout est prêt pour les courses et leurs résultats.</p>
          <div className="cross-actions mt-7">
            <Button size="lg" onClick={() => setCreateOpen(true)}><Plus />Créer un cross</Button>
            <Button size="lg" variant="outline" onClick={() => setJoinOpen(true)}><QrCode />Rejoindre une course</Button>
          </div>
          <p className="mt-5 flex items-center gap-2 text-xs font-medium text-muted-foreground"><span className="size-1.5 shrink-0 rounded-full bg-primary" />Participants, dossards, arrivées et classements</p>
        </div>
        <div className="relative flex flex-col items-center justify-center gap-4 border-t border-blue-100 bg-[#f0f5ff] px-6 py-7 lg:border-l lg:border-t-0">
          <div aria-hidden className="absolute inset-x-7 top-0 h-1 rounded-b-full bg-[#fed60b]" />
          <Image src={publicAsset("/logo-bon-sauveur-cross.png")} alt="Cross du Bon Sauveur — Saint-Lô" width={300} height={300} priority className="size-44 rounded-[1.75rem] bg-white object-contain shadow-sm sm:size-60 lg:size-72" />
          <div className="flex items-center gap-2 rounded-full border border-blue-100 bg-white px-4 py-2 text-sm font-semibold text-[#173970]"><Flag className="size-4 text-primary" />Prêts pour le départ</div>
        </div>
      </section>

      <section aria-label="Vue d’ensemble" className="mt-5 grid gap-3 sm:grid-cols-3">
        {[{ label: "Cross enregistrés", value: events.length, icon: Flag }, { label: "Participants", value: total, icon: Users }, { label: "Modèles de dossard", value: templates.length, icon: QrCode }].map((stat) => (
          <article key={stat.label} className="cross-panel flex items-center gap-4 p-5">
            <span className="cross-icon"><stat.icon className="size-5" /></span>
            <div><p className="text-2xl font-bold leading-tight tabular-nums">{stat.value}</p><p className="mt-1 text-sm text-muted-foreground">{stat.label}</p></div>
          </article>
        ))}
      </section>

      <section className="mt-9">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4"><div><p className="cross-eyebrow">Votre espace d’organisation</p><h2 className="mt-1 text-2xl font-bold tracking-tight">Mes cross</h2></div>{events.length > 0 && <Button variant="outline" onClick={() => setCreateOpen(true)}><Plus />Nouveau cross</Button>}</div>
        {!events.length ? (
          <div className="cross-panel flex flex-col items-center p-7 text-center sm:p-10"><span className="cross-icon bg-[#fff5bc]"><Flag className="size-6" /></span><h3 className="mt-4 text-xl font-bold">Votre prochain cross commence ici</h3><p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">Ajoutez votre événement, importez les élèves et préparez les courses. Vous retrouverez tout dans cet espace.</p><Button className="mt-5" onClick={() => setCreateOpen(true)}>Créer mon premier cross <ArrowUpRight /></Button></div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => (
              <article key={event.id} className="cross-panel flex flex-col p-5 transition-shadow hover:shadow-md sm:p-6">
                <div className="flex items-center justify-between gap-3"><span className="cross-icon bg-[#fff5bc]"><Flag className="size-5" /></span><div className="flex items-center gap-2"><Badge variant="secondary">{event.year}</Badge><Button size="icon-sm" variant="ghost" aria-label={`Supprimer ${event.name}`} className="text-slate-400 hover:text-red-600" onClick={() => setDeleteCandidate(event)}><Trash2 /></Button></div></div>
                <h3 className="mt-5 text-xl font-bold tracking-tight">{event.name}</h3>
                <div className="mt-4 flex-1 space-y-2.5 text-sm text-muted-foreground"><p className="flex items-start gap-2.5"><Users className="mt-0.5 size-4 shrink-0 text-primary" /><span>{event.participants.length} participant(s)</span></p><p className="flex items-start gap-2.5"><CalendarDays className="mt-0.5 size-4 shrink-0 text-primary" /><span>{event.date ? new Date(event.date + "T12:00:00").toLocaleDateString("fr-FR", { dateStyle: "long" }) : "Date à préciser"}</span></p><p className="flex items-start gap-2.5"><MapPin className="mt-0.5 size-4 shrink-0 text-primary" /><span>{event.location || "Lieu à préciser"}</span></p></div>
                <Button className="mt-6 w-full justify-between" onClick={() => onOpen(event)}>Gérer ce cross <ChevronRight /></Button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Les trois temps du cross" className="mt-9 grid gap-4 border-t border-border pt-7 md:grid-cols-3">
        {[{ icon: Users, title: "Avant le départ", text: "Importez les élèves et préparez les dossards et les courses." }, { icon: ScanLine, title: "Sur l’arrivée", text: "Scannez ou saisissez les dossards depuis vos postes d’arrivée." }, { icon: Medal, title: "Après la course", text: "Retrouvez les classements et le challenge interclasses." }].map((item) => <div key={item.title} className="flex items-start gap-3"><span className="cross-icon size-10 bg-white"><item.icon className="size-5" /></span><div><h3 className="text-sm font-bold">{item.title}</h3><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.text}</p></div></div>)}
      </section>
      <footer className="mt-8 flex flex-wrap items-center justify-between gap-2 py-5 text-xs text-muted-foreground"><span className="font-semibold text-primary">Gestion Cross</span><span>Créé par L. RIGAUX</span></footer>

      <Dialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) reset(); }}>
        <DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Créer un cross</DialogTitle><DialogDescription>Créez l’événement général. Les courses seront ajoutées ensuite.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2"><Label>Nom *</Label><Input value={name} placeholder="Ex. Cross du Bon Sauveur" onChange={(event) => setName(event.target.value)} /></div><div><Label>Année</Label><Input type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} /></div><div><Label>Date</Label><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div><div className="sm:col-span-2"><Label>Lieu</Label><Input value={location} onChange={(event) => setLocation(event.target.value)} /></div></div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button><Button disabled={!name.trim()} onClick={async () => { await onCreate(createRaceEvent({ name, year, location, date })); setCreateOpen(false); reset(); }}>Créer le cross</Button></DialogFooter></DialogContent>
      </Dialog>

      <Dialog open={joinOpen} onOpenChange={(open) => { setJoinOpen(open); if (!open) setJoinCode(""); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Rejoindre une course</DialogTitle><DialogDescription>Saisissez le code à 6 chiffres affiché par l’organisateur. Fonctionne sur PC, Mac, iPad ou téléphone.</DialogDescription></DialogHeader>
          <div><Label>Code de course</Label><Input autoFocus value={joinCode} onChange={(event) => setJoinCode(cleanJoinCode(event.target.value))} onKeyDown={(event) => { if (event.key === "Enter") openJoinedCourse(); }} className="mt-2 h-16 text-center font-mono text-3xl font-black tracking-[0.28em]" placeholder="482731" inputMode="numeric" pattern="[0-9]*" maxLength={6} /></div>
          <DialogFooter><Button className="w-full" disabled={joinCode.length !== 6} onClick={openJoinedCourse}>Ouvrir le poste d’arrivée</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteCandidate)} onOpenChange={(open) => !open && setDeleteCandidate(undefined)}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Supprimer ce cross ?</AlertDialogTitle><AlertDialogDescription>« {deleteCandidate?.name} » et ses données locales seront supprimés.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Annuler</AlertDialogCancel><AlertDialogAction className="bg-red-600" onClick={async () => { if (deleteCandidate) { await onDelete(deleteCandidate); setDeleteCandidate(undefined); } }}>Supprimer</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
