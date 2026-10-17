"use client";

import { useState } from "react";
import { Clock3, Flag, Info, Medal, MoreHorizontal, Pencil, Play, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { CloudHeat } from "@/lib/dossard/race-api";

const statusLabel = (status: CloudHeat["status"]) => status === "finished" ? "Terminée" : status === "running" ? "En cours" : "Prête";

export function CourseProgramme({ heats, selectedId, busy, onOpen, onEdit, onStart, onFinish }: {
  heats: CloudHeat[]; selectedId?: string; busy: boolean;
  onOpen: (heat: CloudHeat) => void; onEdit: (heat: CloudHeat) => void; onStart: (heat: CloudHeat) => void; onFinish: (heat: CloudHeat) => void;
}) {
  const [filter, setFilter] = useState("all");
  const [details, setDetails] = useState<CloudHeat>();
  const filters = [{ value: "all", label: "Toutes" }, { value: "draft", label: "À lancer" }, { value: "running", label: "En cours" }, { value: "finished", label: "Terminées" }];
  const ordered = [...heats].sort((a, b) => (a.scheduled_time || "99:99").localeCompare(b.scheduled_time || "99:99") || (a.created_at || "").localeCompare(b.created_at || ""));
  const visible = ordered.filter((heat) => filter === "all" || heat.status === filter);

  return <section aria-label="Programme des courses" className="space-y-4">
    <div className="flex gap-2 overflow-x-auto pb-1">{filters.map((item) => <Button key={item.value} size="sm" variant={filter === item.value ? "default" : "outline"} className="shrink-0" aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}<span className="ml-1 opacity-70">{heats.filter((heat) => item.value === "all" || heat.status === item.value).length}</span></Button>)}</div>
    {!visible.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center"><Flag className="mx-auto size-8 text-primary" /><p className="mt-3 font-bold">{heats.length ? "Aucune course ici." : "Aucune course préparée."}</p></div> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {visible.map((heat) => <article key={heat.id} className={`cross-panel relative flex min-h-48 flex-col p-4 transition hover:border-primary hover:shadow-md ${selectedId === heat.id ? "border-primary ring-1 ring-primary" : "border-slate-200"}`}>
        <button type="button" aria-label={`Ouvrir ${heat.name}`} className="absolute inset-0 rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" onClick={() => onOpen(heat)} />
        <div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500"><Clock3 className="size-4" />{heat.scheduled_time?.slice(0, 5) || "Horaire libre"}</span><Badge variant="outline" className={heat.status === "finished" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : heat.status === "running" ? "border-blue-200 bg-blue-50 text-blue-700" : "bg-slate-50"}>{statusLabel(heat.status)}</Badge></div>
        <div className="mt-3"><h3 className="break-words text-lg font-bold leading-tight">{heat.name}</h3><p className="mt-2 flex items-center gap-2 text-sm text-slate-500"><Users className="size-4" />{heat.counts?.total ?? 0} élèves · {heat.selected_classes.length} classe(s)</p></div>
        <div className="relative z-10 mt-auto flex items-center gap-2 pt-5">
          {heat.status === "draft" && <Button className="flex-1" disabled={busy} onClick={() => onStart(heat)}><Play />Démarrer</Button>}
          {heat.status === "running" && <><Button className="flex-1" disabled={busy} onClick={() => onOpen(heat)}><Flag />Ouvrir</Button><Button variant="destructive" disabled={busy} onClick={() => onFinish(heat)}>Terminer</Button></>}
          {heat.status === "finished" && <Button className="flex-1" disabled={busy} onClick={() => onOpen(heat)}><Medal />Résultats</Button>}
          <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="outline" aria-label={`Actions : ${heat.name}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setDetails(heat)}><Info />Détails et classes</DropdownMenuItem><DropdownMenuItem disabled={busy} onSelect={() => onEdit(heat)}><Pencil />Modifier</DropdownMenuItem>{heat.status === "running" && <><DropdownMenuSeparator /><DropdownMenuItem disabled={busy} className="text-red-600" onSelect={() => onFinish(heat)}><Flag />Terminer</DropdownMenuItem></>}</DropdownMenuContent></DropdownMenu>
        </div>
      </article>)}
    </div>}
    <Dialog open={!!details} onOpenChange={(open) => { if (!open) setDetails(undefined); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>{details?.name}</DialogTitle><DialogDescription>{details ? `${statusLabel(details.status)} · ${details.scheduled_time?.slice(0, 5) || "Horaire libre"}` : ""}</DialogDescription></DialogHeader>
        {details && <div className="space-y-4"><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Participants</p><p className="mt-1 text-xl font-bold">{details.counts?.total ?? 0}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Catégorie</p><p className="mt-1 font-bold">{details.sex_filter === "female" ? "Filles" : details.sex_filter === "male" ? "Garçons" : "Mixte"}</p></div></div><div><p className="text-sm font-bold">Classes ({details.selected_classes.length})</p><div className="mt-2 flex max-h-44 flex-wrap gap-2 overflow-y-auto">{details.selected_classes.map(className => <Badge key={className} variant="secondary">{className}</Badge>)}</div></div>{details.challenge_enabled && <Badge variant="outline">Challenge interclasses activé</Badge>}</div>}
        <DialogFooter><Button variant="outline" onClick={() => { if (details) onEdit(details); setDetails(undefined); }}><Pencil />Modifier</Button><Button onClick={() => { if (details) onOpen(details); setDetails(undefined); }}>Ouvrir la course</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>;
}
