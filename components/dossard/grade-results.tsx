"use client";

import { useState } from "react";
import { CircleHelp, Medal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { individualGroups } from "@/lib/dossard/challenge";
import { type HeatEntry } from "@/lib/dossard/race-api";

const statusLabels = {
  registered: "À courir",
  finished: "Arrivé",
  absent: "Absent",
  exempt: "Dispensé",
  dnf: "Abandon",
};

export function GradeResults({
  entries,
  category,
  onCategory,
  provisional,
}: {
  entries: HeatEntry[];
  category: string;
  onCategory: (category: string) => void;
  provisional: boolean;
}) {
  const [helpOpen, setHelpOpen] = useState(false);
  const groups = individualGroups(entries);
  const shown =
    category === "all"
      ? groups
      : groups.filter((group) => group.category === category);
  return (
    <section className="cross-panel overflow-hidden">
      <div className="border-b bg-gradient-to-r from-blue-50 to-white p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-[#1154b3] text-white">
            <Medal />
          </span>
          <div className="min-w-0 flex-1"><h3 className="text-xl font-bold">Classements par catégorie</h3>{provisional && <BadgeLabel />}</div>
          <Button size="icon" variant="ghost" aria-label="Comprendre les catégories" onClick={() => setHelpOpen(true)}><CircleHelp /></Button>
        </div>
        <div
          className="mt-4 flex flex-wrap gap-2"
          aria-label="Filtrer le classement par niveau et sexe"
        >
          <Button
            size="sm"
            variant={category === "all" ? "default" : "outline"}
            onClick={() => onCategory("all")}
          >
            Toutes les catégories
          </Button>
          {groups.map((group) => (
            <Button
              key={group.category}
              size="sm"
              variant={category === group.category ? "default" : "outline"}
              onClick={() => onCategory(group.category)}
            >
              {group.category} · {group.finished}/{group.entries.length}
            </Button>
          ))}
        </div>
      </div>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Comment sont créées les catégories ?</DialogTitle><DialogDescription>Le classement sépare automatiquement le niveau et le sexe.</DialogDescription></DialogHeader><div className="space-y-3 text-sm text-slate-600"><p>Les variantes d’un même niveau sont regroupées : CM1, CM1 A et CM1 B concourent ensemble.</p><p>Les filles et les garçons gardent chacun leur classement, même s’ils arrivent mélangés.</p><p>Le sexe et le niveau proviennent de la fiche élève. Les informations inconnues restent isolées afin d’éviter un classement erroné.</p></div></DialogContent></Dialog>
      {!groups.length && (
        <p className="p-6 text-sm text-slate-500">
          Le classement apparaîtra dès que les participants de la course seront
          chargés.
        </p>
      )}
      <div className="grid items-start gap-4 p-4 lg:grid-cols-2">
      {shown.map((group) => (
        <div key={group.category} className="min-w-0 overflow-hidden rounded-xl border">
          <div className="flex items-center justify-between gap-3 bg-slate-50 px-5 py-3">
            <h4 className="font-bold text-primary">{group.category}</h4>
            <span className="text-xs text-slate-500">
              {group.finished} arrivé(s) · {group.entries.length} élève(s)
            </span>
          </div>
          <div className="cross-scroll">
            <table className="cross-table w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="w-12 p-3">Rang</th>
                  <th className="p-3">Élève</th>
                  <th className="p-3">Dossard</th>
                  <th className="w-16 p-3" title="Arrivée commune">Commun</th>
                </tr>
              </thead>
              <tbody>
                {group.entries.map((entry) => (
                  <tr key={entry.id} className="border-t">
                    <td className="p-3 text-xl font-bold text-primary">
                      {group.ranks.get(entry.id)?.rank ?? "—"}
                    </td>
                    <td className="p-3">
                      <b>{entry.participant.last_name.toUpperCase()}</b>{" "}
                      {entry.participant.first_name}
                      <span className="mt-0.5 block text-xs text-slate-500">{entry.participant.class_name}{entry.status !== "finished" && <> · <span className="font-semibold">{statusLabels[entry.status]}</span></>}</span>
                    </td>
                    <td className="p-3 font-mono">
                      {entry.participant.bib_number}
                    </td>
                    <td className="p-3 text-slate-500">
                      {entry.finish_position == null
                        ? "—"
                        : `#${entry.finish_position}`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      </div>
    </section>
  );
}

function BadgeLabel() {
  return <span className="mt-1 inline-flex rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">Provisoire</span>;
}
