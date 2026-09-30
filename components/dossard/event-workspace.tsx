"use client";

import Image from "next/image";
import { useMemo, useState, type CSSProperties } from "react";
import { ArrowLeft, CheckCircle2, FileImage, FileOutput, Flag, LayoutTemplate, MoreVertical, ShieldCheck, Trash2, Users } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CourseStep } from "./course-step";
import { ExportStep } from "./export-step";
import { LayoutStep } from "./layout-step";
import { ParticipantsStep } from "./participants-step";
import { TemplateStep } from "./template-step";
import { VerificationStep } from "./verification-step";
import type { BibTemplate, RaceEvent } from "@/lib/dossard/types";
import { publicAsset } from "@/lib/dossard/assets";

type Step = "participants" | "template" | "layout" | "verify" | "export" | "course";
const steps: Array<{ value: Step; label: string; icon: typeof Users }> = [
  { value: "participants", label: "Participants", icon: Users },
  { value: "template", label: "Fond", icon: FileImage },
  { value: "layout", label: "Dossard", icon: LayoutTemplate },
  { value: "verify", label: "Contrôle", icon: CheckCircle2 },
  { value: "export", label: "PDF dossards", icon: FileOutput },
  { value: "course", label: "Courses & résultats", icon: Flag },
];

export function EventWorkspace({ event, templates, saveStatus, onChange, onBack, onSaveTemplate }: {
  event: RaceEvent;
  templates: BibTemplate[];
  saveStatus: "saved" | "saving" | "error";
  onChange: (event: RaceEvent) => void;
  onBack: () => Promise<void>;
  onSaveTemplate: (template: BibTemplate) => Promise<void>;
}) {
  const [step, setStep] = useState<Step>("participants");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [participantIssueFilter, setParticipantIssueFilter] = useState<"all" | "errors" | "warnings">("all");
  const [singleId, setSingleId] = useState<string>();
  const [purgeOpen, setPurgeOpen] = useState(false);
  const current = steps.findIndex((item) => item.value === step);
  const branding = event.resultBranding;
  const primary = branding?.primaryColor || "#1154b3";
  const accent = branding?.accentColor || "#fed60b";
  const logo = branding?.logoDataUrl || publicAsset("/logo-bon-sauveur-cross.png");
  const headerBackground = useMemo(() => `linear-gradient(110deg, ${primary} 0%, ${primary} 58%, color-mix(in srgb, ${primary} 78%, white) 100%)`, [primary]);

  return (
    <div className="min-h-screen" style={{ "--cross-primary": primary } as CSSProperties}>
      <header className="sticky top-0 z-40 border-b border-black/10 text-white shadow-md" style={{ background: headerBackground }}>
        <div className="mx-auto flex h-[4.25rem] max-w-[1500px] items-center gap-3 px-3 sm:px-5 lg:px-7">
          <Button size="icon-sm" variant="ghost" className="shrink-0 text-white hover:bg-white/15 hover:text-white" onClick={() => void onBack()}>
            <ArrowLeft />
          </Button>
          <Image src={logo} alt="Logo du cross" width={60} height={60} unoptimized={Boolean(branding?.logoDataUrl)} className="size-[3.15rem] shrink-0 rounded-xl bg-white object-contain p-1 shadow-sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-black leading-tight sm:text-xl">{event.name}</p>
            <p className="mt-0.5 truncate text-xs font-medium text-white/75 sm:text-sm">{event.location || "Lieu à préciser"} · {event.year}</p>
          </div>
          <div className="hidden items-center gap-3 sm:flex">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1.5 text-xs font-bold">
              <ShieldCheck className="size-4" style={{ color: accent }} /> Gestion Cross
            </span>
            <span className={"text-xs font-semibold " + (saveStatus === "error" ? "text-red-200" : "text-white/70")}>
              {saveStatus === "saving" ? "Enregistrement…" : saveStatus === "error" ? "Échec" : "Enregistré"}
            </span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" className="shrink-0 text-white hover:bg-white/15 hover:text-white"><MoreVertical /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled><ShieldCheck /> Données du cross sur cet appareil</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600" onSelect={() => setPurgeOpen(true)}><Trash2 /> Supprimer les données nominatives locales</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="mx-auto max-w-[1500px] px-3 py-4 sm:px-5 lg:px-7">
        <Tabs value={step} onValueChange={(value) => setStep(value as Step)}>
          <div className="mb-4 rounded-2xl border border-slate-200/80 bg-white p-1.5 shadow-sm sm:mb-6 sm:p-2">
            <TabsList aria-label="Étapes du cross" className="cross-steps grid w-full grid-cols-3 gap-1 bg-transparent sm:grid-cols-6 sm:gap-1.5">
              {steps.map((item) => {
                const Icon = item.icon;
                return (
                  <TabsTrigger key={item.value} value={item.value} className="cross-step min-w-0 flex-col gap-1.5 rounded-xl px-1 py-3 text-xs font-bold sm:py-3.5 lg:flex-row lg:gap-2 lg:px-2 lg:text-sm">
                    <Icon className="size-4 shrink-0 sm:size-[18px]" />
                    <span className="whitespace-normal text-center leading-tight">{item.label}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <TabsContent value="participants"><ParticipantsStep event={event} onChange={onChange} selectedIds={selectedIds} onSelectedIdsChange={setSelectedIds} onReprint={(id) => { setSingleId(id); setStep("export"); }} issueFilter={participantIssueFilter} onIssueFilterChange={setParticipantIssueFilter} /></TabsContent>
          <TabsContent value="template"><TemplateStep event={event} templates={templates} onChange={onChange} onSaveTemplate={onSaveTemplate} /></TabsContent>
          <TabsContent value="layout"><LayoutStep event={event} onChange={onChange} onSaveTemplate={onSaveTemplate} /></TabsContent>
          <TabsContent value="verify"><VerificationStep event={event} onContinue={() => setStep("export")} onReviewErrors={() => { setParticipantIssueFilter("errors"); setStep("participants"); }} /></TabsContent>
          <TabsContent value="export"><ExportStep key={singleId ?? "general"} event={event} selectedIds={selectedIds} initialSingleId={singleId} /></TabsContent>
          <TabsContent value="course"><CourseStep event={event} onChange={onChange} /></TabsContent>
        </Tabs>

        <nav className="mt-7 flex items-center justify-between border-t border-blue-100 pt-5">
          <Button variant="outline" disabled={current <= 0} onClick={() => setStep(steps[current - 1].value)}>Étape précédente</Button>
          <p className="hidden rounded-full bg-[#fff3a9] px-4 py-2 text-sm font-black text-[#173970] sm:block">Étape {current + 1} / {steps.length}</p>
          <Button disabled={current >= steps.length - 1} onClick={() => setStep(steps[current + 1].value)}>Étape suivante</Button>
        </nav>
      </main>

      <AlertDialog open={purgeOpen} onOpenChange={setPurgeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer les données nominatives locales ?</AlertDialogTitle>
            <AlertDialogDescription>Les {event.participants.length} participants seront effacés de cet appareil. Le modèle de dossard restera disponible.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600" onClick={() => { onChange({ ...event, participants: [], sourceFileName: undefined }); setSelectedIds(new Set()); setSingleId(undefined); }}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
