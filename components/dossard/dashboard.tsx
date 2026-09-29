"use client";

import { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  FileImage,
  Flag,
  Footprints,
  MapPin,
  Mountain,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRaceEvent } from "@/lib/dossard/defaults";
import type { BibTemplate, RaceEvent } from "@/lib/dossard/types";

const initialForm = {
  name: "",
  year: new Date().getFullYear(),
  location: "Saint-Lô",
  date: "",
};

export function Dashboard({
  events,
  templates,
  onCreate,
  onOpen,
  onDelete,
}: {
  events: RaceEvent[];
  templates: BibTemplate[];
  onCreate: (event: RaceEvent) => Promise<void>;
  onOpen: (event: RaceEvent) => void;
  onDelete: (event: RaceEvent) => Promise<void>;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<RaceEvent>();
  const [name, setName] = useState(initialForm.name);
  const [year, setYear] = useState(initialForm.year);
  const [location, setLocation] = useState(initialForm.location);
  const [date, setDate] = useState(initialForm.date);
  const total = useMemo(
    () => events.reduce((sum, event) => sum + event.participants.length, 0),
    [events],
  );
  const reset = () => {
    setName(initialForm.name);
    setYear(initialForm.year);
    setLocation(initialForm.location);
    setDate(initialForm.date);
  };

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
      <section className="race-band race-card relative overflow-hidden rounded-[2rem] px-6 py-8 text-white sm:px-9 lg:px-12 lg:py-10">
        <div className="race-grid absolute inset-0 opacity-20" aria-hidden />
        <div className="absolute -right-12 -top-20 size-64 rounded-full border-[42px] border-[#fed60b]/90 opacity-80" aria-hidden />
        <div className="absolute bottom-0 right-12 hidden items-end gap-1 text-[#fed60b]/25 lg:flex" aria-hidden>
          <Mountain className="size-44" strokeWidth={1.2} />
          <Footprints className="mb-8 size-16 -rotate-12" />
        </div>
        <div className="relative max-w-3xl">
          <Badge className="mb-4 border-white/20 bg-white/10 text-white">
            <ShieldCheck /> Données conservées sur cet appareil
          </Badge>
          <p className="text-sm font-black uppercase tracking-[.22em] text-[#fed60b]">
            Générateur de dossards
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-5xl">
            Les dossards sont sur la ligne de départ.
          </h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-blue-100 sm:text-lg">
            Importez la liste, placez les informations et obtenez vos feuilles A4 prêtes à imprimer.
          </p>
          <Button
            size="lg"
            className="mt-6 bg-[#fed60b] font-black text-[#102347] shadow-lg shadow-black/15 hover:bg-[#ffe45b]"
            onClick={() => setCreateOpen(true)}
          >
            <Plus /> Nouvelle course
          </Button>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {[
          { label: "Courses", value: events.length, icon: Flag, tone: "bg-[#eaf2ff] text-[#1154b3]" },
          { label: "Participants", value: total, icon: Users, tone: "bg-[#fff4b5] text-[#7c5d00]" },
          { label: "Modèles", value: templates.length, icon: Sparkles, tone: "bg-[#eef3fb] text-[#173970]" },
        ].map((stat) => (
          <article key={stat.label} className="race-card rounded-2xl border border-white bg-white p-4 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-[#65738e]">{stat.label}</p>
              <span className={"grid size-9 place-items-center rounded-xl " + stat.tone}>
                <stat.icon className="size-5" />
              </span>
            </div>
            <p className="mt-2 text-3xl font-black text-[#102347]">{stat.value}</p>
          </article>
        ))}
      </section>

      <section className="mt-6">
        {!events.length ? (
          <div className="race-surface rounded-[1.7rem] border border-blue-100 p-7 text-center sm:p-10">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#fff2a8] text-[#1154b3]">
              <Flag />
            </span>
            <h2 className="mt-4 text-2xl font-black">Créez votre premier événement</h2>
            <p className="mt-2 text-[#65738e]">Le parcours guidé tient en cinq étapes simples.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {events.map((event) => (
              <article
                key={event.id}
                className="race-card group relative overflow-hidden rounded-[1.6rem] border border-blue-100 bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-xl"
              >
                <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#fed60b] via-[#fed60b] to-[#1154b3]" />
                <div className="flex justify-between gap-3">
                  <div className="min-w-0">
                    <Badge className="bg-[#fff3a9] text-[#173970]">{event.year}</Badge>
                    <h2 className="mt-3 truncate text-xl font-black">{event.name}</h2>
                  </div>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="text-slate-400 hover:text-red-600"
                    onClick={() => setDeleteCandidate(event)}
                  >
                    <Trash2 />
                  </Button>
                </div>
                <div className="mt-4 space-y-2 text-sm text-[#65738e]">
                  <p className="flex gap-2"><Users className="text-[#1154b3]" />{event.participants.length} participant(s)</p>
                  <p className="flex gap-2"><CalendarDays className="text-[#1154b3]" />{event.date ? new Date(event.date + "T12:00:00").toLocaleDateString("fr-FR", { dateStyle: "long" }) : "Date à préciser"}</p>
                  <p className="flex gap-2"><MapPin className="text-[#1154b3]" />{event.location || "Lieu à préciser"}</p>
                </div>
                <Button className="mt-5 w-full justify-between font-bold" onClick={() => onOpen(event)}>
                  Ouvrir l’atelier <ChevronRight />
                </Button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="race-card mt-7 rounded-[1.6rem] border border-blue-100 bg-white p-5">
        <div className="flex gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-[#fff3a9] text-[#1154b3]"><FileImage /></span>
          <div>
            <h2 className="font-black">Mes modèles de dossard</h2>
            <p className="text-sm text-[#65738e]">Fonds et mises en page réutilisables.</p>
          </div>
        </div>
        {!templates.length ? (
          <p className="mt-4 rounded-xl bg-[#f5f8fd] p-5 text-sm text-[#65738e]">Aucun modèle enregistré.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {templates.slice(0, 8).map((template) => (
              <div key={template.id} className="rounded-xl border border-blue-100 p-3">
                <b>{template.name}</b>
                <p className="text-sm text-[#65738e]">{template.elements.length} éléments · {template.background ? "fond inclus" : "sans fond"}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) reset();
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Préparer une course</DialogTitle>
            <DialogDescription>Les informations restent modifiables ensuite.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label>Nom *</Label><Input value={name} placeholder="Ex. Cross du Bon Sauveur" autoFocus onChange={(event) => setName(event.target.value)} /></div>
            <div><Label>Année</Label><Input type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} /></div>
            <div><Label>Date</Label><Input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></div>
            <div className="sm:col-span-2"><Label>Lieu</Label><Input value={location} onChange={(event) => setLocation(event.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Annuler</Button>
            <Button disabled={!name.trim()} onClick={async () => {
              await onCreate(createRaceEvent({ name, year, location, date }));
              setCreateOpen(false);
              reset();
            }}>Créer la course</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(deleteCandidate)} onOpenChange={(open) => !open && setDeleteCandidate(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet événement ?</AlertDialogTitle>
            <AlertDialogDescription>« {deleteCandidate?.name} » et toutes ses données locales seront supprimés.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600" onClick={async () => {
              if (deleteCandidate) {
                await onDelete(deleteCandidate);
                setDeleteCandidate(undefined);
              }
            }}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
