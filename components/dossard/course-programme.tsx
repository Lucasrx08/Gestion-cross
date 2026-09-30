"use client";

import { useState } from "react";
import { Clock3, Flag, Medal, Pencil, Play } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CloudHeat } from "@/lib/dossard/race-api";

export function CourseProgramme({ heats, selectedId, busy, onOpen, onEdit, onStart }: {
  heats: CloudHeat[]; selectedId?: string; busy: boolean;
  onOpen: (heat: CloudHeat) => void; onEdit: (heat: CloudHeat) => void; onStart: (heat: CloudHeat) => void;
}) {
  const [filter, setFilter] = useState("all");
  const filters = [{ value: "all", label: "Toutes" }, { value: "draft", label: "À lancer" }, { value: "running", label: "En cours" }, { value: "finished", label: "Terminées" }];
  const ordered = [...heats].sort((a, b) => (a.scheduled_time || "99:99").localeCompare(b.scheduled_time || "99:99") || (a.created_at || "").localeCompare(b.created_at || ""));
  const visible = ordered.filter((heat) => filter === "all" || heat.status === filter);
  return <section aria-label="Programme des courses" className="space-y-4">
    <div className="flex flex-wrap gap-2">{filters.map((item) => <Button key={item.value} size="sm" variant={filter === item.value ? "default" : "outline"} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>{item.label}<span className="ml-1 opacity-70">{heats.filter((heat) => item.value === "all" || heat.status === item.value).length}</span></Button>)}</div>
    {!visible.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><Flag className="mx-auto size-8 text-primary" /><p className="mt-3 font-bold">{heats.length ? "Aucune course dans cette catégorie." : "Préparez les courses de votre cross."}</p><p className="mt-1 text-sm text-slate-500">{heats.length ? "Les autres courses restent accessibles dans « Toutes »." : "Choisissez les classes, les filles ou les garçons et l’horaire prévu. Vous pourrez les lancer ici le jour du cross."}</p></div> : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {visible.map((heat) => <article key={heat.id} className={`cross-panel flex flex-col p-5 ${selectedId === heat.id ? "border-primary ring-1 ring-primary" : "border-slate-200"}`}>
        <div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500"><Clock3 className="size-4" />{heat.scheduled_time?.slice(0, 5) || "Horaire libre"}</span><Badge variant="outline" className={heat.status === "finished" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : heat.status === "running" ? "border-blue-200 bg-blue-50 text-blue-700" : "bg-slate-50"}>{heat.status === "draft" ? "Prête" : heat.status === "running" ? "En cours" : "Terminée"}</Badge></div>
        <h3 className="mt-3 break-words text-lg font-bold">{heat.name}</h3>
        <p className="mt-1 text-xs font-semibold text-slate-500">{heat.sex_filter === "female" ? "Filles" : heat.sex_filter === "male" ? "Garçons" : "Mixte"} · {heat.counts?.total ?? 0} élèves{heat.challenge_enabled ? " · Challenge interclasses" : ""}</p>
        <p className="mt-2 flex-1 break-words text-sm leading-relaxed text-slate-500">{heat.selected_classes.join(", ")}</p>
        {heat.status === "finished" && <p className="mt-3 text-xs font-bold text-emerald-700">{heat.counts?.finished ?? 0} arrivées · Résultats disponibles</p>}
        <div className="mt-5 grid grid-cols-2 gap-2">
          {heat.status === "draft" ? <><Button disabled={busy} onClick={() => onStart(heat)}><Play />Lancer</Button><Button variant="outline" disabled={busy} onClick={() => onEdit(heat)}><Pencil />Modifier</Button><Button className="col-span-2" variant="ghost" disabled={busy} onClick={() => onOpen(heat)}>Détails</Button></> : <Button className="col-span-2 w-full" variant={heat.status === "finished" ? "outline" : "default"} disabled={busy} onClick={() => onOpen(heat)}>{heat.status === "finished" ? <Medal /> : <Flag />}{heat.status === "finished" ? "Voir les résultats" : "Gérer les arrivées"}</Button>}
        </div>
      </article>)}
    </div>}
  </section>;
}
