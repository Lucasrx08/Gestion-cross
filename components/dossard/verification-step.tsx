"use client";

import { useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, LockKeyhole, ScanBarcode, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BarcodePreview } from "./code-preview";
import { normalizeScannedIdentifier } from "@/lib/dossard/identifiers";
import { previewElementValue } from "@/lib/dossard/preview";
import type { LayoutElement, RaceEvent } from "@/lib/dossard/types";
import { buildValidationChecks, isEventReady, validateParticipants } from "@/lib/dossard/validation";

const NAME_ELEMENT_TYPES = new Set<LayoutElement["type"]>(["lastName", "firstName", "fullName"]);

function reductions(event: RaceEvent) {
  if (typeof document === "undefined") return 0;
  const context = document.createElement("canvas").getContext("2d");
  if (!context) return 0;

  const nameElements = event.template.elements.filter((element) => NAME_ELEMENT_TYPES.has(element.type));
  return event.participants.filter((participant) =>
    nameElements.some((element) => {
      const weight = element.bold ? 700 : 400;
      context.font = `${element.italic ? "italic " : ""}${weight} ${element.fontSizePt * 96 / 72}px "DejaVu Sans", Arial`;
      const availableWidth = Math.max(1, element.widthMm * 96 / 25.4 - 6);
      return context.measureText(previewElementValue(element, participant, event)).width > availableWidth;
    }),
  ).length;
}

export function VerificationStep({
  event,
  onContinue,
  onReviewErrors,
}: {
  event: RaceEvent;
  onContinue: () => void;
  onReviewErrors: () => void;
}) {
  const reduced = useMemo(() => reductions(event), [event]);
  const checks = useMemo(() => buildValidationChecks(event).map((check) => {
    if (check.id !== "warnings" || reduced === 0) return check;
    const dataWarnings = typeof check.value === "number" ? check.value : Number(check.value) || 0;
    return { ...check, value: dataWarnings + reduced, status: "warning" as const };
  }), [event, reduced]);
  const validatedParticipants = useMemo(() => validateParticipants(event.participants), [event.participants]);
  const invalidParticipants = useMemo(
    () => validatedParticipants.filter((participant) => participant.issues.some((issue) => issue.severity === "error")),
    [validatedParticipants],
  );
  const expected = event.participants[0]?.technicalId ?? "";
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");
  const [result, setResult] = useState<"idle" | "success" | "error">("idle");
  const ready = isEventReady(event);
  const normalizedValue = normalizeScannedIdentifier(value);
  const normalizedExpected = normalizeScannedIdentifier(expected);
  const scanWasNormalized = Boolean(value.trim()) && value.trim().toUpperCase() !== normalizedValue;
  const evaluate = () => setResult(normalizedValue === normalizedExpected ? "success" : "error");

  return (
    <div className="space-y-6">
      <section className={`rounded-2xl border p-5 ${ready ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-3">
            <span className={`grid size-11 place-items-center rounded-2xl text-white ${ready ? "bg-emerald-600" : "bg-red-600"}`}>
              {ready ? <Check /> : <X />}
            </span>
            <div>
              <h2 className="text-xl font-black">{ready ? "Prêt pour la génération" : "Corrections nécessaires"}</h2>
              <p className="text-sm text-slate-600">{ready ? "Tous les contrôles bloquants sont validés." : "Corrigez les lignes signalées avant le PDF."}</p>
            </div>
          </div>
          <Button disabled={!ready} onClick={onContinue}>Passer à l’export</Button>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {checks.map((check) => (
          <article key={check.id} className="rounded-2xl border bg-white p-4">
            <div className="flex justify-between">
              <div>
                <p className="text-sm text-slate-500">{check.label}</p>
                <p className="text-2xl font-black">{check.value}</p>
              </div>
              <span className={`grid size-8 place-items-center rounded-full ${check.status === "ok" ? "bg-emerald-100 text-emerald-700" : check.status === "warning" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                {check.status === "ok" ? <Check /> : <AlertTriangle />}
              </span>
            </div>
            {check.detail && <p className="mt-2 text-sm text-slate-500">{check.detail}</p>}
          </article>
        ))}
      </section>

      {invalidParticipants.length > 0 && (
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-black text-red-900">{invalidParticipants.length} participant{invalidParticipants.length > 1 ? "s à corriger" : " à corriger"}</p>
              <p className="text-sm text-red-800">La ligne et la donnée manquante sont indiquées ci-dessous.</p>
            </div>
            <Button variant="outline" className="border-red-300 bg-white text-red-800 hover:bg-red-100" onClick={onReviewErrors}>
              Afficher les lignes en erreur
            </Button>
          </div>
          <ul className="mt-4 space-y-2">
            {invalidParticipants.slice(0, 8).map((participant) => (
              <li key={participant.id} className="rounded-xl bg-white px-4 py-3 text-sm text-red-900">
                <span className="font-bold">{participant.sourceRow > 0 ? `Ligne Excel ${participant.sourceRow}` : "Ajout manuel"}</span>
                {" · "}{participant.lastName || "Nom manquant"} {participant.firstName}
                {" · "}{participant.issues.filter((issue) => issue.severity === "error").map((issue) => issue.message).join(" · ")}
              </li>
            ))}
          </ul>
          {invalidParticipants.length > 8 && <p className="mt-3 text-sm text-red-800">Et {invalidParticipants.length - 8} autre(s) ligne(s).</p>}
        </section>
      )}

      {reduced > 0 && (
        <section className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="shrink-0 text-amber-700" />
          <div>
            <p className="font-bold text-amber-900">Alerte non bloquante · {reduced} nom{reduced > 1 ? "s longs seront légèrement réduits" : " long sera légèrement réduit"}</p>
            <p className="text-sm text-amber-800">L’ajustement sera automatique et aucun nom ne sera coupé.</p>
          </div>
        </section>
      )}

      <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,.75fr)]">
        <div className="rounded-2xl border bg-white p-5">
          <div className="mb-5 flex gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[#0d397b] text-white"><ScanBarcode /></span>
            <div>
              <h2 className="font-black">Tester la douchette</h2>
              <p className="text-sm text-slate-500">Scannez le code test puis vérifiez la valeur reçue.</p>
            </div>
          </div>
          {expected ? (
            <>
              <div className="mx-auto h-24 max-w-md rounded-xl border p-2"><BarcodePreview value={expected} /></div>
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Input
                  ref={inputRef}
                  value={value}
                  onChange={(inputEvent) => { setValue(inputEvent.target.value); setResult("idle"); }}
                  onKeyDown={(keyboardEvent) => { if (keyboardEvent.key === "Enter") { keyboardEvent.preventDefault(); evaluate(); } }}
                  placeholder="Cliquez ici puis scannez"
                  className="font-mono"
                />
                <Button variant="outline" onClick={() => { setValue(""); setResult("idle"); inputRef.current?.focus(); }}>Démarrer</Button>
                <Button disabled={!value} onClick={evaluate}>Vérifier</Button>
              </div>
              {result === "success" && (
                <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
                  <p className="flex gap-2"><CheckCircle2 /> Scanner reconnu : {normalizedValue}</p>
                  {scanWasNormalized && <p className="mt-1 pl-8 font-normal">Le séparateur envoyé par la douchette a été corrigé automatiquement.</p>}
                </div>
              )}
              {result === "error" && (
                <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">Reçu : {value.trim() || "vide"} · attendu : {expected}</p>
              )}
            </>
          ) : (
            <p className="rounded-xl bg-slate-50 p-5 text-center text-sm text-slate-500">Importez un participant.</p>
          )}
        </div>

        <aside className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
          <div className="flex gap-2 text-blue-900"><ShieldCheck /><h2 className="font-black">Confidentialité vérifiée</h2></div>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex gap-2"><Check className="text-emerald-600" />Les fichiers restent dans ce navigateur.</li>
            <li className="flex gap-2"><Check className="text-emerald-600" />Les codes contiennent uniquement l’identifiant.</li>
            <li className="flex gap-2"><Check className="text-emerald-600" />Aucune liste n’est publiée.</li>
          </ul>
          <div className="mt-5 flex gap-2 rounded-xl bg-white/70 p-3 text-sm text-blue-900"><LockKeyhole />Les données sont liées à cet appareil.</div>
        </aside>
      </section>
    </div>
  );
}
