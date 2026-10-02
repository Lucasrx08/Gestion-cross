"use client";

import Image from "next/image";
import { useEffect, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  ArrowRight,
  LayoutDashboard,
  CheckCircle2,
  CloudOff,
  FileImage,
  FileOutput,
  Flag,
  LayoutTemplate,
  MoreVertical,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
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
import { ownerApi, raceErrorMessage } from "@/lib/dossard/race-api";
import { buildValidationChecks } from "@/lib/dossard/validation";
import { gradeCategory } from "@/lib/dossard/challenge";

type Step =
  | "overview"
  | "participants"
  | "template"
  | "layout"
  | "verify"
  | "export"
  | "course";
const steps: Array<{ value: Step; label: string; icon: typeof Users }> = [
  { value: "participants", label: "Participants", icon: Users },
  { value: "template", label: "Fond", icon: FileImage },
  { value: "layout", label: "Dossard", icon: LayoutTemplate },
  { value: "verify", label: "Contrôle", icon: CheckCircle2 },
  { value: "export", label: "PDF dossards", icon: FileOutput },
  { value: "course", label: "Courses & résultats", icon: Flag },
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
  const [step, setStep] = useState<Step>("overview");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [participantIssueFilter, setParticipantIssueFilter] = useState<
    "all" | "errors" | "warnings"
  >("all");
  const [singleId, setSingleId] = useState<string>();
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [serverPurgeOpen, setServerPurgeOpen] = useState(false);
  const [serverPurging, setServerPurging] = useState(false);
  const current = steps.findIndex((item) => item.value === step);
  const blockers = buildValidationChecks(event).filter(
    (check) => check.status === "error",
  ).length;
  const levels = new Set(
    event.participants.map((participant) =>
      gradeCategory(participant.className),
    ),
  ).size;
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [step]);
  const branding = event.resultBranding;
  const primary = branding?.primaryColor || "#1154b3";
  const accent = branding?.accentColor || "#fed60b";
  const logo =
    branding?.logoDataUrl || publicAsset("/logo-bon-sauveur-cross.png");

  const purgeServerCopy = async () => {
    setServerPurging(true);
    try {
      const result = await ownerApi<{ deleted: boolean }>("delete_event", {
        localEventId: event.id,
      });
      toast.success(
        result.deleted
          ? "Copie partagée supprimée du serveur."
          : "Aucune copie partagée n’était présente sur le serveur.",
      );
      setServerPurgeOpen(false);
    } catch (error) {
      toast.error(raceErrorMessage(error));
    } finally {
      setServerPurging(false);
    }
  };

  return (
    <div
      className="cross-workspace min-h-screen"
      style={
        {
          "--cross-primary": primary,
          "--cross-accent": accent,
        } as CSSProperties
      }
    >
      <header
        className="sticky top-0 z-40 border-b border-border border-t-4 bg-white shadow-sm"
        style={{ borderTopColor: primary }}
      >
        <div className="cross-shell flex min-h-16 items-center gap-3 py-2 sm:gap-4">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Retour à l’accueil"
            className="shrink-0 text-muted-foreground"
            onClick={() => void onBack()}
          >
            <ArrowLeft />
          </Button>
          <Image
            src={logo}
            alt="Logo du cross"
            width={60}
            height={60}
            unoptimized={Boolean(branding?.logoDataUrl)}
            className="size-11 shrink-0 rounded-xl border border-border bg-white object-contain p-1"
          />
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold leading-snug tracking-tight sm:text-lg">
              {event.name}
            </p>
            <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
              {event.location || "Lieu à préciser"} · {event.year}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="hidden items-center gap-1.5 text-xs font-medium text-primary md:inline-flex">
              <ShieldCheck className="size-4" style={{ color: primary }} />{" "}
              Gestion Cross
            </span>
            <span
              className={
                "text-xs font-medium " +
                (saveStatus === "error"
                  ? "text-red-600"
                  : "text-muted-foreground")
              }
            >
              {saveStatus === "saving"
                ? "Enregistrement…"
                : saveStatus === "error"
                  ? "Échec"
                  : "Enregistré"}
            </span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label="Options du cross"
                className="shrink-0 text-muted-foreground"
              >
                <MoreVertical />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem disabled>
                <ShieldCheck /> Données locales + courses partagées sécurisées
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setServerPurgeOpen(true)}>
                <CloudOff /> Supprimer la copie partagée du serveur
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-red-600"
                onSelect={() => setPurgeOpen(true)}
              >
                <Trash2 /> Supprimer les données nominatives locales
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <main className="cross-shell py-3 sm:py-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Button
            variant={step === "overview" ? "default" : "outline"}
            onClick={() => setStep("overview")}
          >
            <LayoutDashboard />
            Vue d’ensemble
          </Button>
          <p className="text-xs text-muted-foreground">
            Élèves et modèles : cet appareil · Courses : serveur partagé
          </p>
        </div>
        {saveStatus === "error" && (
          <div
            role="alert"
            className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            Les dernières modifications ne sont pas enregistrées. Ne fermez pas
            cet onglet.{" "}
            <Button
              size="sm"
              variant="outline"
              className="ml-2"
              onClick={() => onChange({ ...event })}
            >
              Réessayer l’enregistrement
            </Button>
          </div>
        )}
        <Tabs value={step} onValueChange={(value) => setStep(value as Step)}>
          <TabsContent value="overview">
            <section className="mb-6 overflow-hidden rounded-[1.75rem] bg-gradient-to-br from-[#102347] via-[#1154b3] to-[#277bd6] p-6 text-white shadow-lg sm:p-9">
              <p className="text-xs font-bold uppercase tracking-[.2em] text-[#fed60b]">
                Votre centre d’organisation
              </p>
              <h1 className="mt-3 text-3xl font-bold sm:text-4xl">
                Un cross prêt, du dossard au podium.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-blue-100 sm:text-base">
                Préparez vos élèves et vos dossards, organisez les départs, puis
                retrouvez les classements de chaque niveau et le challenge
                interclasses.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                {[
                  `${event.participants.length} élèves`,
                  `${levels} niveaux`,
                  blockers
                    ? `${blockers} contrôle(s) à traiter`
                    : "Dossards prêts à imprimer",
                ].map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </section>
            <div className="mb-6 grid gap-4 md:grid-cols-2">
              {[
                {
                  value: "participants" as Step,
                  icon: Users,
                  title: "1. Préparer les élèves",
                  detail:
                    "Import Excel/CSV, classes, noms et numérotation. Vérifiez les niveaux avant le départ.",
                  action: "Gérer les participants",
                  color: "bg-blue-50 text-blue-700",
                },
                {
                  value: "template" as Step,
                  icon: LayoutTemplate,
                  title: "2. Créer vos dossards",
                  detail:
                    "Ajoutez votre fond, disposez les textes, le numéro et les codes. Réutilisez vos modèles.",
                  action: "Personnaliser les dossards",
                  color: "bg-violet-50 text-violet-700",
                },
                {
                  value: "verify" as Step,
                  icon: ShieldCheck,
                  title: "3. Vérifier et imprimer",
                  detail:
                    "Contrôle des doublons, des dimensions et de la lisibilité. Deux dossards A5 par page A4.",
                  action: "Contrôler les dossards",
                  color: "bg-emerald-50 text-emerald-700",
                },
                {
                  value: "course" as Step,
                  icon: Flag,
                  title: "4. Piloter le jour J",
                  detail:
                    "Programme des courses, quatre postes d’arrivée, classements distincts par niveau et challenge.",
                  action: "Ouvrir courses & résultats",
                  color: "bg-amber-50 text-amber-700",
                },
              ].map((card) => (
                <button
                  key={card.value}
                  type="button"
                  className="cross-panel group flex items-start gap-4 p-6 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-blue-600"
                  onClick={() => setStep(card.value)}
                >
                  <span
                    className={`grid size-12 shrink-0 place-items-center rounded-2xl ${card.color}`}
                  >
                    <card.icon className="size-6" />
                  </span>
                  <div>
                    <h2 className="text-lg font-bold">{card.title}</h2>
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">
                      {card.detail}
                    </p>
                    <span className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#1154b3]">
                      {card.action}
                      <ArrowRight className="size-4 transition group-hover:translate-x-1" />
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </TabsContent>
          <div className="cross-panel mb-4 p-1.5">
            <TabsList
              aria-label="Étapes du cross"
              className="cross-steps grid w-full bg-transparent"
            >
              {steps.map((item) => {
                const Icon = item.icon;
                return (
                  <TabsTrigger
                    key={item.value}
                    value={item.value}
                    className="cross-step min-w-0 flex-col gap-1.5 rounded-xl px-2 py-3 text-xs font-semibold sm:flex-row sm:gap-2 sm:text-sm"
                  >
                    <Icon className="size-4 shrink-0 sm:size-[18px]" />
                    <span className="whitespace-normal text-center leading-tight">
                      {item.label}
                    </span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <TabsContent value="participants">
            <ParticipantsStep
              event={event}
              onChange={onChange}
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
              onReprint={(id) => {
                setSingleId(id);
                setStep("export");
              }}
              issueFilter={participantIssueFilter}
              onIssueFilterChange={setParticipantIssueFilter}
            />
          </TabsContent>
          <TabsContent value="template">
            <TemplateStep
              event={event}
              templates={templates}
              onChange={onChange}
              onSaveTemplate={onSaveTemplate}
            />
          </TabsContent>
          <TabsContent value="layout">
            <LayoutStep
              event={event}
              onChange={onChange}
              onSaveTemplate={onSaveTemplate}
            />
          </TabsContent>
          <TabsContent value="verify">
            <VerificationStep
              event={event}
              onContinue={() => setStep("export")}
              onReviewErrors={() => {
                setParticipantIssueFilter("errors");
                setStep("participants");
              }}
            />
          </TabsContent>
          <TabsContent value="export">
            <ExportStep
              key={singleId ?? "general"}
              event={event}
              selectedIds={selectedIds}
              initialSingleId={singleId}
            />
          </TabsContent>
          <TabsContent value="course">
            <CourseStep event={event} onChange={onChange} />
          </TabsContent>
        </Tabs>

        {step !== "overview" && (
          <nav className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
            <Button
              variant="outline"
              disabled={current <= 0}
              onClick={() => setStep(steps[current - 1].value)}
            >
              Étape précédente
            </Button>
            <p className="hidden text-sm font-medium text-muted-foreground sm:block">
              Étape {current + 1} / {steps.length}
            </p>
            <Button
              disabled={current >= steps.length - 1}
              onClick={() => setStep(steps[current + 1].value)}
            >
              Étape suivante
            </Button>
          </nav>
        )}
      </main>

      <AlertDialog open={purgeOpen} onOpenChange={setPurgeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Supprimer les données nominatives locales ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Les {event.participants.length} participants seront effacés de cet
              appareil. Le modèle de dossard restera disponible. Cette action ne
              supprime pas automatiquement les courses déjà partagées sur le
              serveur.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600"
              onClick={() => {
                onChange({
                  ...event,
                  participants: [],
                  sourceFileName: undefined,
                  raceArchive: undefined,
                });
                setSelectedIds(new Set());
                setSingleId(undefined);
              }}
            >
              Supprimer localement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={serverPurgeOpen} onOpenChange={setServerPurgeOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Supprimer la copie partagée du serveur ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Les courses, postes d’arrivée, scans, classements et participants
              synchronisés de ce cross seront supprimés du serveur. Vos données
              locales et vos dossards resteront sur cet appareil. Une course en
              cours doit d’abord être terminée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={serverPurging}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600"
              disabled={serverPurging}
              onClick={() => void purgeServerCopy()}
            >
              {serverPurging ? "Suppression…" : "Supprimer du serveur"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
