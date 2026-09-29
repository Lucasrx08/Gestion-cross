"use client";

import Image from "next/image";
import { useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  FileImage,
  FileOutput,
  Flag,
  LayoutTemplate,
  MoreVertical,
  ShieldCheck,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  { value: "export", label: "PDF A4", icon: FileOutput },
  { value: "course", label: "Course", icon: Flag },
];

export function EventWorkspace({
  event,
  templates,
  saveStatus,
  onChange,
  onBack,
  onSaveTemplate,
}: {
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

  return (
    <div className="min-h-screen">
      <header className="race-band sticky top-0 z-40 border-b border-blue-900/20 text-white shadow-lg shadow-blue-950/10">
        <div className="mx-auto flex min-h-[4.7rem] max-w-[1600px] items-center gap-3 px-4 py-2 sm:px-6">
          <Button size="icon-sm" variant="ghost" className="text-white hover:bg-white/15 hover:text-white" onClick={() => void onBack()}>
            <ArrowLeft />
          </Button>
          <Image src={publicAsset("/logo-bon-sauveur-cross.png")} alt="" width={56} height={56} className="size-12 rounded-xl bg-white object-contain shadow sm:size-14" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-black sm:text-lg">{event.name}</p>
            <p className="truncate text-xs text-blue-100">{event.location || "Lieu à préciser"} · {event.year}</p>
          </div>
          <Badge className="hidden border-white/20 bg-white/10 text-white sm:flex">
            <ShieldCheck className="text-[#fed60b]" /> Local + mode course sécurisé
          </Badge>
          <span className={"text-xs " + (saveStatus === "error" ? "text-red-200" : "text-blue-100")}>
            {saveStatus === "saving" ? "Enregistrement…" : saveStatus === "error" ? "Échec" : "Enregistré"}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button size="icon-sm" variant="ghost" className="text-white hover:bg-white/15 hover:text-white"><MoreVertical /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled><ShieldCheck /> Dossards enregistrés sur cet appareil</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600" onSelect={() => setPurgeOpen(true)}><Trash2 /> Supprimer les données nominatives locales</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-4 py-5 sm:px-6">
        <Tabs value={step} onValueChange={(value) => setStep(value as Step)}>
          <div className="mb-6 overflow-x-auto pb-1">
            <TabsList className="race-card h-auto min-w-max gap-1 rounded-2xl border border-blue-100 bg-white p-1.5">
              {steps.map((item, index) => {
                const Icon = item.icon;
                return (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className="min-w-32 gap-2 rounded-xl px-4 py-3 font-bold data-[state=active]:bg-[#1154b3] data-[state=active]:text-white"
                  >
                    <span className="grid size-6 place-items-center rounded-full border text-[11px]">
                      {index + 1}
                    </span>
                    <Icon /> {item.label}
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
          <TabsContent value="course"><CourseStep event={event} /></TabsContent>
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
            <AlertDialogAction className="bg-red-600" onClick={() => {
              onChange({ ...event, participants: [], sourceFileName: undefined });
              setSelectedIds(new Set());
              setSingleId(undefined);
            }}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
