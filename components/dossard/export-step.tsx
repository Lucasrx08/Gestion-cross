"use client";

import { useMemo, useState } from "react";
import { Download, FileDown, FileSpreadsheet, Printer, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { StepHeading } from "./step-heading";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  downloadBlob,
  exportParticipantsCsv,
  exportParticipantsXlsx,
  safeFileName,
  selectParticipants,
} from "@/lib/dossard/exports";
import type { ExportFilter, ExportMode, PdfProgress, RaceEvent } from "@/lib/dossard/types";
import { isEventReady } from "@/lib/dossard/validation";

const options: Array<{ value: ExportMode; title: string; description: string }> = [
  { value: "all", title: "Tous les dossards", description: "PDF complet par numéro" },
  { value: "class", title: "Par classe", description: "Une classe choisie" },
  { value: "range", title: "Du dossard X au Y", description: "Une plage de numéros" },
  { value: "selection", title: "Ma sélection", description: "Les lignes cochées" },
  { value: "single", title: "Réimprimer un dossard", description: "Une personne précise" },
];

interface ExportStepProps {
  event: RaceEvent;
  selectedIds: Set<string>;
  initialSingleId?: string;
}

export function ExportStep({ event, selectedIds, initialSingleId }: ExportStepProps) {
  const classes = useMemo(
    () => [...new Set(event.participants.map((participant) => participant.className).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")),
    [event.participants],
  );
  const [mode, setMode] = useState<ExportMode>(initialSingleId ? "single" : "all");
  const [className, setClassName] = useState(classes[0] ?? "");
  const [from, setFrom] = useState(event.numbering.start);
  const [to, setTo] = useState(event.participants.at(-1)?.bibNumber ?? event.numbering.start);
  const [singleId, setSingleId] = useState(initialSingleId ?? "");
  const [search, setSearch] = useState("");
  const [progress, setProgress] = useState<PdfProgress>();
  const [generating, setGenerating] = useState(false);
  const [reduced, setReduced] = useState<number>();

  const filter: ExportFilter = {
    mode,
    className,
    fromNumber: from,
    toNumber: to,
    participantIds: [...selectedIds],
    participantId: singleId,
  };
  const selected = selectParticipants(event.participants, filter);
  const a4Pages = Math.ceil(selected.length / 2);
  const results = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    if (!query) return [];
    return event.participants
      .filter((participant) =>
        [participant.lastName, participant.firstName, participant.className, participant.technicalId]
          .some((value) => value.toLocaleLowerCase("fr").includes(query)),
      )
      .slice(0, 8);
  }, [event.participants, search]);
  const single = event.participants.find((participant) => participant.id === singleId);
  const ready = isEventReady(event);
  const percent = progress?.total ? Math.round((progress.completed / progress.total) * 100) : 0;

  const generate = async () => {
    if (!ready || !selected.length || generating) return;
    setGenerating(true);
    setReduced(undefined);
    try {
      const { generateBibPdf } = await import("@/lib/dossard/pdf");
      const result = await generateBibPdf(event, selected, setProgress);
      const buffer = result.bytes.buffer.slice(
        result.bytes.byteOffset,
        result.bytes.byteOffset + result.bytes.byteLength,
      ) as ArrayBuffer;
      const suffix = mode === "single" ? selected[0].technicalId.toLowerCase() : "dossards-a4";
      downloadBlob(new Blob([buffer], { type: "application/pdf" }), `${safeFileName(event.name)}-${suffix}.pdf`);
      setReduced(result.reducedTextParticipants);
      toast.success(
        `PDF terminé : ${selected.length} dossard${selected.length > 1 ? "s" : ""} sur ${result.a4PageCount} feuille${result.a4PageCount > 1 ? "s" : ""} A4.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Génération impossible.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
  <StepHeading icon={Printer} title="Imprimer les dossards" description="Choisissez les élèves à imprimer et téléchargez votre PDF prêt pour le format A4." />
      {!ready && (
        <section className="flex gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">
          <ShieldAlert />
          <div>
            <p className="font-bold">Export bloqué</p>
            <p className="text-sm">Corrigez les erreurs dans Vérification.</p>
          </div>
        </section>
      )}

      <section className="cross-editor-grid grid gap-4">
        <div className="cross-panel p-5">
          <p className="text-xs font-bold uppercase tracking-wider text-[#1154b3]">PDF A4 haute qualité</p>
          <h2 className="mb-5 text-xl font-black">Choisir les dossards</h2>
          <RadioGroup value={mode} onValueChange={(value) => setMode(value as ExportMode)} className="grid gap-3 sm:grid-cols-2">
            {options.map((option) => (
              <Label
                key={option.value}
                className={`mb-0 cursor-pointer rounded-xl border p-4 ${mode === option.value ? "border-[#1154b3] bg-blue-50 ring-2 ring-blue-700/15" : ""}`}
              >
                <span className="flex gap-3">
                  <RadioGroupItem value={option.value} className="mt-0.5 shrink-0" />
                  <span>
                    <b className="block">{option.title}</b>
                    <span className="text-sm font-normal text-slate-500">{option.description}</span>
                  </span>
                </span>
              </Label>
            ))}
          </RadioGroup>

          <div className="mt-5 rounded-xl bg-slate-50 p-4">
            {mode === "class" && (
              <>
                <Label className="mb-2">Classe</Label>
                <Select value={className} onValueChange={setClassName}>
                  <SelectTrigger className="w-full bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>{classes.map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent>
                </Select>
              </>
            )}
            {mode === "range" && (
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Du numéro</Label><Input type="number" value={from} onChange={(event) => setFrom(Number(event.target.value))} /></div>
                <div><Label>Au numéro</Label><Input type="number" value={to} onChange={(event) => setTo(Number(event.target.value))} /></div>
              </div>
            )}
            {mode === "selection" && <p className="text-sm"><b>{selectedIds.size}</b> participant(s) coché(s).</p>}
            {mode === "single" && (
              <div>
                <Label>Rechercher</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nom, classe ou numéro…" className="pl-9" />
                </div>
                {results.length > 0 && (
                  <div className="mt-2 rounded-lg border bg-white">
                    {results.map((participant) => (
                      <button
                        key={participant.id}
                        type="button"
                        className="flex min-h-12 w-full flex-col gap-1 border-b p-3 text-left last:border-0 hover:bg-slate-50"
                        onClick={() => { setSingleId(participant.id); setSearch(""); }}
                      >
                        <b>{participant.lastName} {participant.firstName}</b>
                        <span className="text-sm text-slate-500">{participant.className} · {participant.technicalId}</span>
                      </button>
                    ))}
                  </div>
                )}
                {single && (
                  <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                    <div>
                      <b>{single.lastName} {single.firstName}</b>
                      <p className="text-sm text-slate-500">{single.className} · {single.technicalId}</p>
                    </div>
                    <Printer className="shrink-0 text-blue-700" />
                  </div>
                )}
              </div>
            )}
            {mode === "all" && <p className="text-sm text-slate-600">Tri par numéro croissant.</p>}
          </div>
        </div>

        <aside className="race-band race-card h-fit rounded-[1.6rem] p-5 text-white">
          <p className="text-xs font-bold uppercase tracking-wider text-[#fed60b]">Impression</p>
          <div className="mt-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-5xl font-black">{a4Pages}</p>
              <p className="text-sm text-blue-100">feuille{a4Pages > 1 ? "s" : ""} A4</p>
            </div>
            <Badge className="bg-white/10 text-white">210 × 297 mm</Badge>
          </div>
          <div className="mt-4 rounded-xl bg-white/10 p-3 text-sm">
            <b>{selected.length} dossard{selected.length > 1 ? "s" : ""}</b>
            <p className="mt-1 text-blue-100">2 dossards A5 paysage par feuille, avec repère de coupe.</p>
          </div>
          {generating && progress && (
            <div className="mt-6 rounded-xl bg-white/5 p-4">
              <div className="mb-2 flex justify-between text-sm">
                <span>{progress.phase === "saving" ? "Finalisation…" : "Génération…"}</span>
                <span>{progress.completed}/{progress.total}</span>
              </div>
              <Progress value={percent} />
            </div>
          )}
          {typeof reduced === "number" && (
            <p className="mt-4 rounded-lg bg-white/10 p-3 text-sm">PDF téléchargé · {reduced} texte(s) ajusté(s).</p>
          )}
          <Button
            size="lg"
            className="mt-6 w-full bg-[#fed60b] font-black text-[#102347] hover:bg-[#ffe45b]"
            disabled={!ready || !selected.length || generating}
            onClick={() => void generate()}
          >
            {generating ? <FileDown className="animate-bounce" /> : <Download />}
            {generating ? "Création…" : "Générer le PDF A4"}
          </Button>
          <p className="mt-3 text-center text-xs text-blue-100">Impression à 100 % / taille réelle.</p>
        </aside>
      </section>

      <section className="cross-panel p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
          <div>
            <h2 className="flex gap-2 font-black"><FileSpreadsheet className="text-[#1154b3]" /> Exporter la base</h2>
            <p className="text-sm text-slate-500">Identifiant, numéro, nom, prénom, classe et sexe uniquement.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!event.participants.length} onClick={() => exportParticipantsCsv(event.participants, event.name)}>CSV</Button>
            <Button variant="outline" disabled={!event.participants.length} onClick={() => exportParticipantsXlsx(event.participants, event.name)}>XLSX</Button>
          </div>
        </div>
      </section>
    </div>
  );
}
