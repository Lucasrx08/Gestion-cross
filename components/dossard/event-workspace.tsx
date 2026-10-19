"use client";

import Image from "next/image";
import { useEffect, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  LayoutDashboard,
  Palette,
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
import { EventBrandingDialog } from "./event-branding-dialog";
import { resolveEventBranding } from "@/lib/dossard/event-branding";
import { CourseStep } from "./course-step";
import { ActionTile } from "./action-tile";
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
  { value: "layout", label: "Composer", icon: LayoutTemplate },
  { value: "verify", label: "Contrôle", icon: CheckCircle2 },
  { value: "export", label: "Imprimer", icon: FileOutput },
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
  const [brandingOpen, setBrandingOpen] = useState(false);
  const branding = resolveEventBranding(event);
  const primary = branding?.primaryColor || "#1154b3";
  const accent = branding?.secondaryColor || "#fed60b";
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
      <EventBrandingDialog event={event} onChange={onChange} open={brandingOpen} onOpenChange={setBrandingOpen} />
      <header
        className="sticky top-0 z-40 border-b border-border border-t-4 bg-white shadow-sm"
        style={{ borderTopColor: primary }}
      >
        <div className="cross-shell flex h-[4.5rem] items-center gap-3 py-2 sm:gap-4">
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
            <p className="truncate text-base font-bold leading-snug tracking-tight sm:text-lg">
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
        <nav aria-label="Rubriques de l’événement" className="cross-main-nav mb-5 grid grid-cols-4 gap-1 rounded-2xl border bg-white p-1.5">
          {[
            { value: "overview" as Step, label: "Accueil", icon: LayoutDashboard, active: step === "overview" },
            { value: "participants" as Step, label: "Élèves", icon: Users, active: step === "participants" },
            { value: "export" as Step, label: "Dossards", icon: LayoutTemplate, active: ["template", "layout", "verify", "export"].includes(step) },
            { value: "course" as Step, label: "Courses", icon: Flag, active: step === "course" },
          ].map(item => <Button key={item.value} variant={item.active ? "default" : "ghost"} aria-current={item.active ? "page" : undefined} className="h-auto min-h-12 flex-col gap-1 px-2 py-2 text-xs sm:flex-row sm:gap-2 sm:text-sm" onClick={() => setStep(item.value)}><item.icon className="size-4" />{item.label}</Button>)}
        </nav>
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
        <div>
          {step === "overview" && <section>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h1 className="text-2xl font-bold">Vue d’ensemble</h1>
              <div className="flex gap-2 text-xs font-semibold"><span className="rounded-full bg-blue-50 px-3 py-2">{event.participants.length} élèves</span><span className="rounded-full bg-slate-100 px-3 py-2">{levels} niveaux</span>{blockers > 0 && <button className="rounded-full bg-amber-100 px-3 py-2 text-amber-900" onClick={() => setStep("verify")}>{blockers} contrôle(s)</button>}</div>
            </div>
            <div className="mb-6 grid gap-3 sm:grid-cols-2">
              {[
                { value: "participants" as Step, icon: Users, title: "Élèves", description: "Participants, classes et numérotation" },
                { value: "template" as Step, icon: LayoutTemplate, title: "Dossards", description: "Fond et mise en page personnalisés" },
                { value: "verify" as Step, icon: ShieldCheck, title: "Contrôles", description: "Vérification des listes et des dossards" },
                { value: "course" as Step, icon: Flag, title: "Courses & résultats", description: "Programme, arrivées et classements" },
              ].map(card => <ActionTile key={card.value} title={card.title} description={card.description} icon={card.icon} onClick={() => setStep(card.value)} />)}
            </div>
            <section className="cross-panel mb-6 flex flex-wrap items-center gap-5 p-5 sm:p-6">
              {branding.logoDataUrl && <Image src={branding.logoDataUrl} alt="Logo de l’événement" width={88} height={88} unoptimized className="max-h-22 w-22 object-contain" />}
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold" style={{color: primary}}>Identité visuelle de l’événement</h2>
                <p className="mt-2 text-sm font-semibold">{branding.title}</p>
                <div className="mt-2 flex items-center gap-2"><span className="size-5 rounded-full border" style={{backgroundColor:primary}} /><span className="size-5 rounded-full border" style={{backgroundColor:branding.secondaryColor}} /><span className="text-xs text-muted-foreground">{branding.logoDataUrl ? "Logo personnalisé enregistré" : "Logo de l’événement à ajouter"}</span></div>
              </div>
              <Button variant="outline" onClick={() => setBrandingOpen(true)}><Palette />Modifier l’identité</Button>
            </section>
          </section>}
          {["template", "layout", "verify", "export"].includes(step) && <nav aria-label="Outils des dossards" className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
            {steps.filter(item => ["template", "layout", "verify", "export"].includes(item.value)).map(item => <Button key={item.value} size="sm" variant={step === item.value ? "outline" : "ghost"} aria-current={step === item.value ? "page" : undefined} className="min-h-11 flex-1 shrink-0" onClick={() => setStep(item.value)}><item.icon className="size-4" />{item.label}</Button>)}
          </nav>}

          {step === "participants" && <section>
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
          </section>}
          {step === "template" && <section>
            <TemplateStep
              event={event}
              templates={templates}
              onChange={onChange}
              onSaveTemplate={onSaveTemplate}
            />
          </section>}
          {step === "layout" && <section>
            <LayoutStep
              event={event}
              onChange={onChange}
              onSaveTemplate={onSaveTemplate}
            />
          </section>}
          {step === "verify" && <section>
            <VerificationStep
              event={event}
              onContinue={() => setStep("export")}
              onReviewErrors={() => {
                setParticipantIssueFilter("errors");
                setStep("participants");
              }}
            />
          </section>}
          {step === "export" && <section>
            <ExportStep
              key={singleId ?? "general"}
              event={event}
              selectedIds={selectedIds}
              onChange={onChange}
              initialSingleId={singleId}
            />
          </section>}
          {step === "course" && <section>
            <CourseStep event={event} onChange={onChange} />
          </section>}
        </div>

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
