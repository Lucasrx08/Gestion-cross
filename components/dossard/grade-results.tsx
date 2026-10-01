"use client";

import { Medal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { individualGroups } from "@/lib/dossard/challenge";
import { formatElapsed, type HeatEntry } from "@/lib/dossard/race-api";

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
  const groups = individualGroups(entries);
  const shown =
    category === "all"
      ? groups
      : groups.filter((group) => group.category === category);
  return (
    <section className="cross-panel overflow-hidden">
      <div className="border-b bg-gradient-to-r from-blue-50 to-white p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-[#1154b3] text-white">
            <Medal />
          </span>
          <div>
            <h3 className="text-xl font-bold">Classements par niveau</h3>
            <p className="text-sm text-slate-500">
              {provisional ? "Provisoires · " : ""}Une arrivée commune, un
              classement distinct pour chaque niveau.
            </p>
          </div>
        </div>
        <div
          className="mt-4 flex flex-wrap gap-2"
          aria-label="Filtrer le classement par niveau"
        >
          <Button
            size="sm"
            variant={category === "all" ? "default" : "outline"}
            onClick={() => onCategory("all")}
          >
            Tous les niveaux
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
        <p className="mt-3 text-xs text-slate-500">
          CM1 A, CM1 B et CM1 sont regroupés ; les CM2 restent séparés. Pour une
          classe à double niveau ou sans niveau explicite, vérifiez le libellé
          de chaque élève avant le départ.
        </p>
      </div>
      {!groups.length && (
        <p className="p-6 text-sm text-slate-500">
          Le classement apparaîtra dès que les participants de la course seront
          chargés.
        </p>
      )}
      {shown.map((group) => (
        <div key={group.category} className="border-b last:border-0">
          <div className="flex items-center justify-between gap-3 bg-slate-50 px-5 py-3">
            <h4 className="font-bold text-[#1154b3]">{group.category}</h4>
            <span className="text-xs text-slate-500">
              {group.finished} arrivé(s) · {group.entries.length} élève(s)
            </span>
          </div>
          <div className="cross-scroll">
            <table className="cross-table min-w-[640px]">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="p-3">Rang du niveau</th>
                  <th className="p-3">Élève</th>
                  <th className="p-3">Classe</th>
                  <th className="p-3">Dossard</th>
                  <th className="p-3">Temps / statut</th>
                  <th className="p-3">Arrivée commune</th>
                </tr>
              </thead>
              <tbody>
                {group.entries.map((entry) => (
                  <tr key={entry.id} className="border-t">
                    <td className="p-3 text-xl font-bold text-[#1154b3]">
                      {group.ranks.get(entry.id)?.rank ?? "—"}
                    </td>
                    <td className="p-3">
                      <b>{entry.participant.last_name.toUpperCase()}</b>{" "}
                      {entry.participant.first_name}
                    </td>
                    <td className="p-3">{entry.participant.class_name}</td>
                    <td className="p-3 font-mono">
                      {entry.participant.bib_number}
                    </td>
                    <td className="p-3">
                      {entry.status === "finished"
                        ? formatElapsed(entry.elapsed_ms)
                        : statusLabels[entry.status]}
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
    </section>
  );
}
