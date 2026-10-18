"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import QRCode from "qrcode";
import Image from "next/image";
import {
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  CircleHelp,
  Cloud,
  Copy,
  Download,
  FileSpreadsheet,
  Flag,
  Image as ImageIcon,
  Link2,
  ListOrdered,
  Loader2,
  Medal,
  MoreHorizontal,
  Palette,
  Pencil,
  Play,
  Plus,
  Printer,
  Search,
  Share2,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { HelpDialog } from "./help-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { downloadBlob, safeFileName } from "@/lib/dossard/exports";
import type { RaceEvent } from "@/lib/dossard/types";
import {
  type CloudEvent,
  type CloudHeat,
  type EntryStatus,
  type HeatEntry,
  type StationInfo,
  ownerApi,
  raceErrorMessage,
} from "@/lib/dossard/race-api";
import {
  buildChallenge,
  formatChallengeScore,
  challengeRule,
  classKey,
  gradeCategory,
  individualCategory,
  gradeOrder,
  compareCategories,
  individualGroups,
  rankWithinCategory,
} from "@/lib/dossard/challenge";
import { exportRaceResults, overallChallenge } from "@/lib/dossard/race-results";
import { CourseProgramme } from "./course-programme";
import { GradeResults } from "./grade-results";
import { EventBrandingDialog } from "./event-branding-dialog";
import { resolveEventBranding, eventDocumentHeader } from "@/lib/dossard/event-branding";
import { drawSocialResults } from "@/lib/dossard/social-results";
import {
  drawTvTop20,
  paginateTvCategories,
  TV_RESULT_HEIGHT,
  TV_RESULT_WIDTH,
} from "@/lib/dossard/tv-results";

interface OwnerState {
  event: CloudEvent | null;
  heats: CloudHeat[];
}
interface HeatResponse {
  heat: CloudHeat;
  entries: HeatEntry[];
  stations: StationInfo[];
}
interface ClassOption {
  key: string;
  label: string;
  variants: string[];
  group: string;
}

const letters = ["A", "B", "C", "D"];
const gradeLabels: Record<string, string> = { "6e": "6ème", "5e": "5ème", "4e": "4ème", "3e": "3ème" };
const isFemale = (value?: string) =>
  /^(f|fille|female|féminin|feminin|girl)$/i.test((value ?? "").trim());
const isMale = (value?: string) =>
  /^(m|garçon|garcon|male|masculin|boy)$/i.test((value ?? "").trim());
const stationKey = (id: string) => `gestion-cross-station-code:${id}`;
const esc = (value: unknown) =>
  String(value ?? "").replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ] ?? char,
  );

function prettyClass(value: string) {
  const key = classKey(value);
  const simple = key.match(/^([3456])EME$/);
  if (simple) return `${simple[1]}ème`;
  return value.trim().replace(/\s+/g, " ");
}
function classGroup(value: string) {
  const grade = gradeCategory(value);
  return gradeOrder.includes(grade) ? grade : "Autres";
}

function loadCanvasImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new window.Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function ExportMenu({ disabled, socialDisabled, onPdf, onExcel, onPost, onStory }: {
  disabled?: boolean;
  socialDisabled?: boolean;
  onPdf: () => void;
  onExcel: () => void;
  onPost: () => void;
  onStory: () => void;
}) {
  return <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" className="mt-2 w-full" disabled={disabled}><Download />Choisir le format</Button></DropdownMenuTrigger><DropdownMenuContent align="start" className="min-w-48"><DropdownMenuLabel>Document</DropdownMenuLabel><DropdownMenuItem onClick={onPdf}><Printer />PDF</DropdownMenuItem><DropdownMenuItem onClick={onExcel}><FileSpreadsheet />Excel</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuLabel>{socialDisabled ? "Choisir une catégorie pour les visuels" : "Réseaux sociaux"}</DropdownMenuLabel><DropdownMenuItem disabled={socialDisabled} onClick={onPost}><ImageIcon />Publication</DropdownMenuItem><DropdownMenuItem disabled={socialDisabled} onClick={onStory}><ImageIcon />Story</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}

export function CourseStep({
  event,
  onChange,
}: {
  event: RaceEvent;
  onChange: (event: RaceEvent) => void;
}) {
  const classOptions = useMemo<ClassOption[]>(() => {
    const map = new Map<string, ClassOption>();
    event.participants.forEach((participant) => {
      const raw = participant.className.trim();
      if (!raw) return;
      const key = classKey(raw);
      const existing = map.get(key);
      if (existing) {
        if (!existing.variants.includes(raw)) existing.variants.push(raw);
        return;
      }
      map.set(key, {
        key,
        label: prettyClass(raw),
        variants: [raw],
        group: classGroup(raw),
      });
    });
    return [...map.values()].sort(
      (a, b) =>
        compareCategories(a.group, b.group) ||
        a.label.localeCompare(b.label, "fr"),
    );
  }, [event.participants]);

  const [cloudEvent, setCloudEvent] = useState<CloudEvent | null>(null);
  const [heats, setHeats] = useState<CloudHeat[]>([]);
  const [selectedHeatId, setSelectedHeatId] = useState<string>();
  const [entries, setEntries] = useState<HeatEntry[]>([]);
  const [stations, setStations] = useState<StationInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [brandingOpen, setBrandingOpen] = useState(false);
  const [socialPreview, setSocialPreview] = useState<{
    dataUrl: string;
    fileName: string;
    format: "post" | "story" | "tv";
    width: number;
    height: number;
    pages?: Array<{ dataUrl: string; fileName: string }>;
  }>();
  const [previewIndex, setPreviewIndex] = useState(0);
  const [statusOpen, setStatusOpen] = useState(false);
  const [qr, setQr] = useState("");
  const [heatName, setHeatName] = useState("");
  const [selectedClassKeys, setSelectedClassKeys] = useState<Set<string>>(
    new Set(),
  );
  const [classSearch, setClassSearch] = useState("");
  const [statusSearch, setStatusSearch] = useState("");
  const [sexFilter, setSexFilter] = useState("all");
  const [challengeEnabled, setChallengeEnabled] = useState(true);
  const [stationCode, setStationCode] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const scheduledInputRef = useRef<HTMLInputElement>(null);
  const planRevisionRef = useRef(0);
  const [editingHeat, setEditingHeat] = useState<CloudHeat>();
  const [reorderEntry, setReorderEntry] = useState<HeatEntry>();
  const [targetPosition, setTargetPosition] = useState("");
  const [ownerLoading, setOwnerLoading] = useState(true);
  const [ownerError, setOwnerError] = useState("");
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [resultCategory, setResultCategory] = useState("all");
  const [courseView, setCourseView] = useState<
    "manage" | "results" | "challenge" | "arrival" | "exports"
  >("manage");
  const [tvSecondHeatId, setTvSecondHeatId] = useState("");
  const [challengeCourses, setChallengeCourses] = useState<Array<{ heat: CloudHeat; entries: HeatEntry[] }>>([]);
  const [challengeLoading, setChallengeLoading] = useState(false);
  const [challengeError, setChallengeError] = useState("");
  const [challengeRevision, setChallengeRevision] = useState(0);
  const [challengeGrade, setChallengeGrade] = useState("all");
  const [challengeExportGrade, setChallengeExportGrade] = useState("all");
  const [challengeHelpOpen, setChallengeHelpOpen] = useState(false);
  const [courseDetailsOpen, setCourseDetailsOpen] = useState(false);
  const [courseFocus, setCourseFocus] = useState(false);
  const [finishCandidate, setFinishCandidate] = useState<CloudHeat>();
  const [arrivalSearch, setArrivalSearch] = useState("");
  const [challengeDetail, setChallengeDetail] = useState<ReturnType<typeof overallChallenge>[number]>();
  const allOverallResults = overallChallenge(challengeCourses);
  const overallResults = overallChallenge(challengeCourses, challengeGrade);
  const challengeGrades = [...new Set(["6e", "5e", "4e", "3e", ...allOverallResults.map(result => gradeCategory(result.className))])].sort(compareCategories);
  const challengeExportGrades = challengeGrades.filter(grade =>
    allOverallResults.some(result => gradeCategory(result.className) === grade),
  );
  const resolvedChallengeExportGrade = challengeExportGrades.includes(challengeExportGrade)
    ? challengeExportGrade
    : "all";
  const challengeGradeLabel = challengeGrade === "all" ? "Tous les niveaux" : (gradeLabels[challengeGrade] ?? challengeGrade);
  const activeHeatRef = useRef<string | undefined>(undefined);
  const selectedSectionRef = useRef<HTMLElement>(null);
  const scrollRequested = useRef(false);

  const selectedHeat = heats.find((heat) => heat.id === selectedHeatId);
  const ranked = entries
    .filter((entry) => entry.status === "finished")
    .sort(
      (a, b) => (a.finish_position ?? 99999) - (b.finish_position ?? 99999),
    );
  const arrivalQuery = arrivalSearch.trim().toLocaleLowerCase("fr");
  const visibleArrivals = ranked.filter(entry => !arrivalQuery || [entry.participant.first_name, entry.participant.last_name, entry.participant.class_name, String(entry.participant.bib_number)].join(" ").toLocaleLowerCase("fr").includes(arrivalQuery));
  const categoryRanks = rankWithinCategory(entries);
  const gradeGroups = individualGroups(entries);
  const visibleCategory = gradeGroups.some(
    (group) => group.category === resultCategory,
  )
    ? resultCategory
    : "all";
  const selectedGroups =
    visibleCategory === "all"
      ? gradeGroups
      : gradeGroups.filter((group) => group.category === visibleCategory);
  const classResults = selectedHeat?.challenge_enabled
    ? buildChallenge(
        entries,
        selectedHeat.challenge_classes.length
          ? selectedHeat.challenge_classes
          : selectedHeat.selected_classes,
      )
    : [];
  const branding = resolveEventBranding(event);
  const resolvedTvSecondHeatId = heats.some(
    (heat) =>
      heat.id === tvSecondHeatId &&
      heat.id !== selectedHeatId &&
      heat.status === "finished",
  )
    ? tvSecondHeatId
    : (heats.find(
        (heat) => heat.id !== selectedHeatId && heat.status === "finished",
      )?.id ?? "");

  const refreshOwner = async () => {
    const revision = planRevisionRef.current;
    try {
      const state = await ownerApi<OwnerState>("owner_state", {
        localEventId: event.id,
      });
      if (revision !== planRevisionRef.current) return;
      setCloudEvent(state.event);
      setHeats(state.heats ?? []);
      setOwnerError("");
      setSelectedHeatId((current) =>
        current && state.heats?.some((heat) => heat.id === current)
          ? current
          : undefined,
      );
    } catch (error) {
      const message = raceErrorMessage(error);
      setOwnerError(message);
      toast.error(message);
    } finally {
      setOwnerLoading(false);
    }
  };
  const refreshEntries = async (heatId = selectedHeatId) => {
    if (!heatId) return;
    const revision = planRevisionRef.current;
    try {
      const result = await ownerApi<HeatResponse>("heat_entries", { heatId });
      if (activeHeatRef.current !== heatId || revision !== planRevisionRef.current) return;
      setEntries(result.entries ?? []);
      setStations(result.stations ?? []);
      setHeats((items) =>
        items.map((item) =>
          item.id === result.heat.id ? { ...item, ...result.heat } : item,
        ),
      );
      if (result.heat.station_code) {
        window.localStorage.setItem(
          stationKey(result.heat.id),
          result.heat.station_code,
        );
        if (activeHeatRef.current === result.heat.id)
          setStationCode(result.heat.station_code);
      }
    } catch (error) {
      toast.error(raceErrorMessage(error));
    }
  };

  useEffect(() => {
    void Promise.resolve().then(() => refreshOwner());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (courseView !== "challenge" && courseView !== "exports") return;
    let cancelled = false;
    void Promise.resolve().then(async () => {
      if (cancelled) return;
      setChallengeLoading(true);
      setChallengeError("");
      try {
        const results = await Promise.all(heats.filter(heat => heat.status === "finished" && heat.challenge_enabled).map(async heat => {
          const result = await ownerApi<HeatResponse>("heat_entries", { heatId: heat.id });
          return { heat: result.heat, entries: result.entries };
        }));
        if (!cancelled) setChallengeCourses(results);
      } catch (error) {
        if (!cancelled) setChallengeError(raceErrorMessage(error));
      } finally {
        if (!cancelled) setChallengeLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [courseView, heats, entries, challengeRevision]);
  useEffect(() => {
    activeHeatRef.current = selectedHeatId;
    void Promise.resolve().then(async () => {
      if (activeHeatRef.current !== selectedHeatId) return;
      setEntries([]);
      setStations([]);
      setStationCode(
        selectedHeatId
          ? (window.localStorage.getItem(stationKey(selectedHeatId)) ?? "")
          : "",
      );
      if (!selectedHeatId) {
        setEntriesLoading(false);
        return;
      }
      setEntriesLoading(true);
      await refreshEntries(selectedHeatId);
      if (activeHeatRef.current === selectedHeatId) setEntriesLoading(false);
    });
  }, [selectedHeatId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!selectedHeatId || selectedHeat?.status !== "running") return;
    const timer = window.setInterval(
      () => void refreshEntries(selectedHeatId),
      1800,
    );
    return () => window.clearInterval(timer);
  }, [selectedHeatId, selectedHeat?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!shareOpen || !stationCode) return;
    const url = new URL(window.location.href);
    url.searchParams.set("station", stationCode);
    QRCode.toDataURL(url.toString(), { width: 360, margin: 2 })
      .then(setQr)
      .catch(() => setQr(""));
  }, [shareOpen, stationCode]);
  useEffect(() => {
    if (scrollRequested.current && selectedHeatId && !entriesLoading) {
      selectedSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      scrollRequested.current = false;
    }
  }, [selectedHeatId, entriesLoading]);

  const sync = async () => {
    if (!event.participants.length)
      return toast.error("Importez d’abord les élèves.");
    setLoading(true);
    try {
      const result = await ownerApi<{
        event: CloudEvent;
        participantCount: number;
      }>("sync_event", { event });
      setCloudEvent(result.event);
      toast.success(
        `${result.participantCount} élèves prêts pour les courses.`,
      );
      await refreshOwner();
      setCreateOpen(true);
    } catch (error) {
      toast.error(raceErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };
  const toggleClass = (key: string) =>
    setSelectedClassKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const resetCreate = () => {
    setHeatName("");
    setSelectedClassKeys(new Set());
    setClassSearch("");
    setSexFilter("all");
    setChallengeEnabled(true);
    setScheduledTime("");
    setEditingHeat(undefined);
  };
  const openCreate = () => {
    resetCreate();
    setCreateOpen(true);
  };
  const editHeat = (heat: CloudHeat) => {
    setEditingHeat(heat);
    setHeatName(heat.name);
    setSexFilter(heat.sex_filter);
    setChallengeEnabled(heat.challenge_enabled);
    setScheduledTime(heat.scheduled_time?.slice(0, 5) || "");
    setSelectedClassKeys(new Set(heat.selected_classes.map(classKey)));
    setClassSearch("");
    setCreateOpen(true);
  };
  const chosenParticipants = event.participants.filter(
    (participant) =>
      selectedClassKeys.has(classKey(participant.className)) &&
      (sexFilter === "all" ||
        (sexFilter === "female"
          ? isFemale(participant.sex)
          : isMale(participant.sex))),
  );
  const metadataOnlyEdit = Boolean(editingHeat && editingHeat.status !== "draft");
  const createHeat = async () => {
    if (!cloudEvent) return;
    const requestedTime = scheduledInputRef.current?.value ?? scheduledTime;
    if (!heatName.trim()) return toast.error("Indiquez un nom de course.");
    if (requestedTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(requestedTime)) return toast.error("Indiquez un horaire valide (HH:MM).");
    if (editingHeat && metadataOnlyEdit) {
      setLoading(true);
      try {
        const result = await ownerApi<{ heat: CloudHeat }>("update_heat_metadata", {
          heatId: editingHeat.id,
          name: heatName.trim(),
          scheduledTime: requestedTime || null,
          challengeEnabled,
        });
        const saved = await ownerApi<HeatResponse>("heat_entries", { heatId: result.heat.id });
        setHeats(items => items.map(item => item.id === saved.heat.id ? { ...item, ...saved.heat } : item));
        if (activeHeatRef.current === saved.heat.id) setEntries(saved.entries);
        setCreateOpen(false);
        resetCreate();
        toast.success(`Course modifiée · ${requestedTime ? `horaire confirmé à ${requestedTime}` : "horaire libre confirmé"}. Les arrivées sont conservées.`);
      } catch (error) {
        toast.error(raceErrorMessage(error));
      } finally {
        setLoading(false);
      }
      return;
    }
    const selectedOptions = classOptions.filter((option) =>
      selectedClassKeys.has(option.key),
    );
    if (!heatName.trim() || !selectedOptions.length)
      return toast.error("Indiquez un nom et au moins une classe.");
    const rawClasses = new Set(
      selectedOptions.flatMap((option) => option.variants),
    );
    const classParticipants = event.participants.filter((participant) =>
      rawClasses.has(participant.className),
    );
    const unknownSex = classParticipants.filter(
      (participant) => !isFemale(participant.sex) && !isMale(participant.sex),
    );
    if (sexFilter !== "all" && unknownSex.length)
      return toast.error(
        `${unknownSex.length} élève(s) ont un sexe manquant ou non reconnu. Corrigez la liste avant de préparer une course Filles/Garçons.`,
      );
    const participants = classParticipants.filter(
      (participant) =>
        sexFilter === "all" ||
        (sexFilter === "female"
          ? isFemale(participant.sex)
          : isMale(participant.sex)),
    );
    if (!participants.length)
      return toast.error("Aucun élève ne correspond à cette sélection.");
    setLoading(true);
    planRevisionRef.current++;
    try {
      await ownerApi("sync_event", { event });
      const result = await ownerApi<{
        heat: CloudHeat;
        participantCount: number;
      }>(editingHeat ? "update_heat" : "create_heat", {
        eventId: cloudEvent.id,
        ...(editingHeat ? { heatId: editingHeat.id } : {}),
        name: heatName.trim(),
        selectedClasses: selectedOptions.map((option) => option.label),
        sexFilter,
        scheduledTime: requestedTime || null,
        challengeEnabled,
        challengeClasses: selectedOptions.map((option) => option.label),
        challengeBestCount: null,
        participantIds: participants.map((participant) => participant.id),
      });
      const saved = await ownerApi<HeatResponse>("heat_entries", { heatId: result.heat.id });
      if ((saved.heat.scheduled_time?.slice(0, 5) ?? "") !== requestedTime) {
        throw new Error("L’horaire relu ne correspond pas à votre modification. La course reste ouverte pour correction.");
      }
      planRevisionRef.current++;
      setHeats(items => {
        const updated = { ...items.find(item => item.id === saved.heat.id), ...saved.heat, counts: { total: saved.entries.length, registered: saved.entries.filter(e => e.status === "registered").length, finished: saved.entries.filter(e => e.status === "finished").length, dnf: saved.entries.filter(e => e.status === "dnf").length, exempt: saved.entries.filter(e => e.status === "exempt").length, absent: saved.entries.filter(e => e.status === "absent").length } };
        return items.some(item => item.id === updated.id) ? items.map(item => item.id === updated.id ? updated : item) : [...items, updated];
      });
      if (activeHeatRef.current === saved.heat.id) setEntries(saved.entries);
      setSelectedHeatId(saved.heat.id);
      setCreateOpen(false);
      resetCreate();
      toast.success(`Course ${editingHeat ? "modifiée" : "préparée"} · ${requestedTime ? `horaire confirmé à ${requestedTime}` : "horaire libre confirmé"} · ${result.participantCount} élèves.`);
    } catch (error) {
      toast.error(raceErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };
  const start = async (heat = selectedHeat) => {
    if (!heat || loading) return;
    setLoading(true);
    try {
      const result = await ownerApi<{ stationCode: string; heat: CloudHeat }>(
        "start_heat",
        { heatId: heat.id },
      );
      window.localStorage.setItem(stationKey(heat.id), result.stationCode);
      setSelectedHeatId(heat.id);
      activeHeatRef.current = heat.id;
      setHeats((items) =>
        items.map((item) =>
          item.id === heat.id ? { ...item, ...result.heat } : item,
        ),
      );
      setStationCode(result.stationCode);
      setCourseFocus(true);
      setCourseView("manage");
      await refreshOwner();
      await refreshEntries(heat.id);
      setShareOpen(true);
    } catch (error) {
      toast.error(raceErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };
  const finish = async (heat = selectedHeat) => {
    if (!heat || loading) return;
    try {
      setLoading(true);
      setSelectedHeatId(heat.id);
      activeHeatRef.current = heat.id;
      await ownerApi("finish_heat", { heatId: heat.id });
      await refreshOwner();
      await refreshEntries(heat.id);
      setFinishCandidate(undefined);
      setCourseFocus(true);
      setCourseView("results");
      toast.success("Course terminée. Les résultats sont prêts.");
    } catch (error) {
      toast.error(raceErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };
  const changeStatus = async (
    entry: HeatEntry,
    status: Exclude<EntryStatus, "finished">,
  ) => {
    try {
      await ownerApi("set_entry_status", { entryId: entry.id, status });
      await refreshEntries();
    } catch (error) {
      toast.error(raceErrorMessage(error));
    }
  };
  const removeFinish = async (entry: HeatEntry) => {
    if (
      !confirm(
        `Annuler l’arrivée de ${entry.participant.first_name} ${entry.participant.last_name} ?`,
      )
    )
      return;
    try {
      await ownerApi("remove_finish", { entryId: entry.id });
      await refreshEntries();
    } catch (error) {
      toast.error(raceErrorMessage(error));
    }
  };
  const move = async (entry: HeatEntry, delta: number) => {
    if (!entry.finish_position) return;
    try {
      await ownerApi("reorder_finish", {
        entryId: entry.id,
        position: Math.max(1, entry.finish_position + delta),
      });
      await refreshEntries();
    } catch (error) {
      toast.error(raceErrorMessage(error));
    }
  };
  const moveToPosition = async () => {
    const position = Number(targetPosition);
    if (!reorderEntry || !Number.isInteger(position) || position < 1 || position > ranked.length) {
      return toast.error(`Indiquez une place entre 1 et ${ranked.length}.`);
    }
    setLoading(true);
    try {
      await ownerApi("reorder_finish", { entryId: reorderEntry.id, position });
      await refreshEntries();
      setReorderEntry(undefined);
      setTargetPosition("");
      toast.success(`Élève déplacé à la place ${position}.`);
    } catch (error) {
      toast.error(raceErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };
  const deleteHeat = async () => {
    if (
      !selectedHeatId ||
      !selectedHeat ||
      !confirm(`Supprimer « ${selectedHeat.name} » ?`)
    )
      return;
    try {
      await ownerApi("delete_heat", { heatId: selectedHeatId });
      window.localStorage.removeItem(stationKey(selectedHeatId));
      setSelectedHeatId(undefined);
      setEntries([]);
      await refreshOwner();
    } catch (error) {
      toast.error(raceErrorMessage(error));
    }
  };


  const [printingDocument, setPrintingDocument] = useState(false);
  const printWindow = (title: string, body: string) => {
    if (printingDocument) return;
    setPrintingDocument(true);
    void (async () => {
      try {
        const { generateEventDocumentPdf, sectionsFromPrintHtml } = await import("@/lib/dossard/print-documents");
        const bytes = await generateEventDocumentPdf(event, sectionsFromPrintHtml(body));
        downloadBlob(new Blob([new Uint8Array(bytes)], {type:"application/pdf"}), `${safeFileName(title)}.pdf`);
        toast.success("PDF prêt pour l’impression, sans en-tête ou pied de page du navigateur.");
      } catch(error) { toast.error(error instanceof Error ? error.message : "Impression impossible."); }
      finally { setPrintingDocument(false); }
    })();
  };
  const documentHeader = () => eventDocumentHeader(branding);

  const individualPrintMarkup = (
    heatName: string,
    heatEntries: HeatEntry[],
    category = "all",
  ) => {
    const groups = individualGroups(heatEntries).filter(
      (group) => category === "all" || group.category === category,
    );
    return `${documentHeader()}<h2>${esc(heatName)} · Classements par niveau et sexe</h2><p class="note">Le rang d’arrivée est commun à tous. Chaque niveau a un classement filles et un classement garçons ; les classes du même niveau et du même sexe sont regroupées.</p>${groups
      .map((group) => {
        const rows = group.entries
          .map(
            (entry) =>
              `<tr><td>${group.ranks.get(entry.id)?.rank ?? "—"}</td><td>${entry.finish_position ?? "—"}</td><td>${entry.participant.bib_number}</td><td><b>${esc(entry.participant.last_name.toUpperCase())}</b> ${esc(entry.participant.first_name)}</td><td>${esc(entry.participant.class_name)}</td><td>${esc({ finished: "Arrivé", registered: "À courir", absent: "Absent", exempt: "Dispensé", dnf: "Abandon" }[entry.status])}</td></tr>`,
          )
          .join("");
        return `<h2>Catégorie ${esc(group.category)}</h2><p>${group.finished} arrivé(s) sur ${group.entries.length} élève(s)</p><table><thead><tr><th>Rang catégorie</th><th>Arrivée commune</th><th>Dossard</th><th>Élève</th><th>Classe</th><th>Statut</th></tr></thead><tbody>${rows}</tbody></table>`;
      })
      .join("")}`;
  };

  const printIndividual = () => {
    if (!selectedHeat) return;
    printWindow(
      `${selectedHeat.name} - individuel`,
      individualPrintMarkup(selectedHeat.name, entries, visibleCategory),
    );
  };
  const printAllIndividuals = async () => {
    const courses = heats.filter((heat) => heat.status === "finished");
    if (!courses.length)
      return toast.error("Aucune course terminée à imprimer.");
    setLoading(true);
    try {
      const data = await Promise.all(
        courses.map(async (heat) => {
          const result = await ownerApi<HeatResponse>("heat_entries", {
            heatId: heat.id,
          });
          return { heat: result.heat, entries: result.entries };
        }),
      );
      printWindow(
        `${event.name} - tous les classements`,
        data
          .map(({ heat, entries: heatEntries }) =>
            individualPrintMarkup(heat.name, heatEntries),
          )
          .join(""),
      );
    } catch (error) {
      toast.error(raceErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };
  const printBackupSheet = () => {
    if (!selectedHeat || entriesLoading) return;
    const rows = Array.from({ length: 30 }, () => "<tr><td></td><td></td></tr>").join("");
    const page = `<section class="backup-page">${documentHeader()}<h2>${esc(selectedHeat.name)} · Feuille de secours</h2><table><thead><tr><th style="width:40%">Ordre d’arrivée</th><th>Numéro de dossard</th></tr></thead><tbody>${rows}</tbody></table></section>`;
    printWindow(`${selectedHeat.name} - feuille de secours`, `<style>@page{size:A4 portrait;margin:12mm}.backup-page header{margin-bottom:3mm;padding-bottom:3mm;border-bottom-width:2px;gap:4mm}.backup-page header img{max-width:22mm;max-height:18mm}.backup-page h1{font-size:19px}.backup-page h2{font-size:17px;margin:3mm 0 2mm}.backup-page p{font-size:11px;margin:2mm 0;color:#334155}.backup-page table{margin-top:3mm;table-layout:fixed}.backup-page th{font-size:12px;padding:2mm;border:1px solid #94a3b8}.backup-page td{height:6.8mm;padding:0 2mm;border:1px solid #94a3b8}body>.footer{display:none}</style>${page}`);
  };
  const printClasses = () => {
    if (!selectedHeat || !classResults.length) return;
    const rows = classResults.map((result, index) => `<tr><td>${index + 1}</td><td>${esc(result.className)}</td><td>${formatChallengeScore(result.score)}</td><td>${formatChallengeScore(result.girlsRatio)} (${result.girls})</td><td>${formatChallengeScore(result.boysRatio)} (${result.boys})</td><td>${result.exempt}</td></tr>`).join("");
    printWindow(`${selectedHeat.name} - challenge interclasses`, `${documentHeader()}<h2>${esc(selectedHeat.name)} · Challenge de cette course</h2><p class="note">${esc(challengeRule)} Les effectifs sont indiqués entre parenthèses.</p><table><thead><tr><th>Rang</th><th>Classe</th><th>Score</th><th>Moyenne filles</th><th>Moyenne garçons</th><th>Dispensés exclus</th></tr></thead><tbody>${rows}</tbody></table>`);
  };

  const printOverall = (grade = "all") => {
    const printable = overallChallenge(challengeCourses, grade);
    const label = grade === "all" ? "Tous les niveaux · lycée exclu" : (gradeLabels[grade] ?? grade);
    if (challengeLoading || challengeError || !printable.length) return;
    const rows = printable.map((result, index) => `<tr><td>${result.complete ? index + 1 : "—"}</td><td>${esc(result.className)}${result.complete ? "" : " · Provisoire"}</td><td>${formatChallengeScore(result.score)}</td><td>${formatChallengeScore(result.girlsRatio)} (${result.girls})</td><td>${formatChallengeScore(result.boysRatio)} (${result.boys})</td><td>${result.exempt}</td></tr>`).join("");
    printWindow(`${event.name} - challenge interclasses - ${label}`, `${documentHeader()}<h2>Challenge interclasses · ${esc(label)}</h2><p class="note">${esc(challengeRule)} Les classes de lycée sont exclues. Seules les courses terminées avec challenge activé sont incluses. Les effectifs sont indiqués entre parenthèses.</p><table><thead><tr><th>Rang</th><th>Classe</th><th>Score F + G</th><th>Moyenne filles</th><th>Moyenne garçons</th><th>Dispensés exclus</th></tr></thead><tbody>${rows}</tbody></table>`);
  };

  const downloadResults = async (
    kind: "individual" | "classes",
    all = false,
    gradeOverride?: string,
  ) => {
    const courses = (all ? heats : selectedHeat ? [selectedHeat] : []).filter(
      (heat) =>
        heat.status === "finished" &&
        (kind === "individual" || heat.challenge_enabled),
    );
    if (!courses.length)
      return toast.error("Aucun résultat disponible pour cet export.");
    setLoading(true);
    try {
      const data = await Promise.all(
        courses.map(async (heat) => {
          const result = await ownerApi<HeatResponse>("heat_entries", {
            heatId: heat.id,
          });
          return { heat: result.heat, entries: result.entries };
        }),
      );
      await exportRaceResults(data, all ? event.name : courses[0].name, kind, all && kind === "classes" ? (gradeOverride ?? challengeGrade) : "all");
      toast.success("Résultats téléchargés au format Excel.");
    } catch (error) {
      toast.error(raceErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const social = async (
    kind: "individual" | "classes",
    story = false,
    general = false,
    grade = challengeGrade,
  ) => {
    const socialClassResults = general
      ? overallChallenge(challengeCourses, grade).filter(result => result.complete)
      : classResults.filter(result => result.score !== null);
    const socialGradeLabel = grade === "all" ? "Tous les niveaux" : (gradeLabels[grade] ?? grade);
    if (general && (challengeLoading || challengeError || !socialClassResults.length)) return;
    if (kind === "individual" && selectedGroups.length !== 1)
      return toast.error(
        "Choisissez une catégorie dans « Classements par niveau et sexe » avant de créer le visuel.",
      );
    if (!selectedHeat && !general) return;
    if (!branding.logoDataUrl) {
      setBrandingOpen(true);
      return toast.error("Ajoutez le logo de votre événement dans « En-tête & visuels » avant de créer une publication ou une story.");
    }
    const width = 1080,
      height = story ? 1920 : 1080;
    let logo: HTMLImageElement | undefined;
    try {
      logo = await loadCanvasImage(branding.logoDataUrl);
    } catch {
      setBrandingOpen(true);
      return toast.error("Le logo de l’événement n’a pas pu être chargé. Ajoutez-le à nouveau dans « En-tête & visuels ».");
    }
    const rows = kind === "classes"
      ? socialClassResults.map((result, index) => ({ rank: index + 1, label: result.className, detail: formatChallengeScore(result.score) }))
      : (selectedGroups[0]?.entries.filter(entry => entry.status === "finished") || []).slice(0, 10).map(entry => ({ rank: categoryRanks.get(entry.id)?.rank || 0, label: `${entry.participant.first_name} ${entry.participant.last_name.toUpperCase()}`, detail: entry.participant.class_name }));
    const fileName = safeFileName(`${general ? event.name + "-challenge-general" + (grade === "all" ? "" : "-" + grade) : selectedHeat!.name}-${kind}-${story ? "story" : "post"}`);
    const pageCount = Math.max(1, Math.ceil(rows.length / 10));
    const pages = Array.from({length:pageCount}, (_,index) => {
      const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Aperçu indisponible.");
      drawSocialResults(ctx, {
        story, title: branding.title || event.name, subtitle: branding.subtitle || "",
        heading: kind === "classes" ? "CHALLENGE INTERCLASSES" : "TOP 10 · CLASSEMENT",
        category: general ? `${socialGradeLabel} · filles + garçons` : kind === "individual" ? selectedGroups[0]?.category || "" : selectedHeat!.name,
        note: `${kind === "classes" ? "Moyenne filles + moyenne garçons · dispensés exclus" : selectedHeat!.name}${pageCount > 1 ? ` · ${index + 1}/${pageCount}` : ""}`,
        primary: branding.primaryColor || "#1154b3", secondary: branding.secondaryColor || "#fed60b",
        rows: rows.slice(index*10,(index+1)*10),
      }, logo);
      return {dataUrl:canvas.toDataURL("image/png"), fileName:`${fileName}${pageCount > 1 ? `-${index+1}` : ""}.png`};
    });
    setPreviewIndex(0);
    setSocialPreview({ dataUrl:pages[0].dataUrl, fileName:pages[0].fileName, format:story ? "story" : "post", width, height, pages:pageCount > 1 ? pages : undefined });
  };

  const tvFullCategories = async () => {
    if (!selectedHeat || selectedHeat.status !== "finished") return;
    if (!branding.logoDataUrl) {
      setBrandingOpen(true);
      return toast.error(
        "Ajoutez le logo de votre événement dans « En-tête & visuels » avant de créer l’export TV.",
      );
    }
    const categories = individualGroups(entries)
      .map(group => ({
        category: group.category,
        rows: group.entries
          .filter(entry => entry.status === "finished" && entry.finish_position != null)
          .map(entry => ({
            rank: group.ranks.get(entry.id)?.rank ?? 0,
            name: `${entry.participant.first_name} ${entry.participant.last_name.toUpperCase()}`.trim(),
            className: entry.participant.class_name,
          })),
      }))
      .filter(group => group.rows.length);
    if (!categories.length)
      return toast.error("Aucune arrivée disponible pour cet export TV.");

    let logo: HTMLImageElement;
    try {
      logo = await loadCanvasImage(branding.logoDataUrl);
    } catch {
      setBrandingOpen(true);
      return toast.error(
        "Le logo de l’événement n’a pas pu être chargé. Ajoutez-le à nouveau dans « En-tête & visuels ».",
      );
    }
    const categoryPages = paginateTvCategories(categories);
    const pages = categoryPages.map((page, index) => {
      const canvas = document.createElement("canvas");
      canvas.width = TV_RESULT_WIDTH * 2;
      canvas.height = TV_RESULT_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("CANVAS_INDISPONIBLE");
      const drawPanel = (category: typeof page.left | undefined, offset: number) => {
        const panel = document.createElement("canvas");
        panel.width = TV_RESULT_WIDTH;
        panel.height = TV_RESULT_HEIGHT;
        const panelContext = panel.getContext("2d");
        if (!panelContext) throw new Error("CANVAS_INDISPONIBLE");
        drawTvTop20(panelContext, {
          title: branding.title || event.name,
          subtitle: branding.subtitle || "",
          heading: "CLASSEMENT COMPLET",
          course: category?.category ?? "—",
          primary: branding.primaryColor || "#1154b3",
          secondary: branding.secondaryColor || "#fed60b",
          rows: category?.rows ?? [],
          page: page.page,
          pageCount: page.pageCount,
        }, logo);
        ctx.drawImage(panel, offset, 0);
      };
      drawPanel(page.left, 0);
      drawPanel(page.right, TV_RESULT_WIDTH);
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(TV_RESULT_WIDTH - 1, 32, 2, TV_RESULT_HEIGHT - 80);
      const pair = [page.left.category, page.right?.category].filter(Boolean).join("-");
      return {
        dataUrl: canvas.toDataURL("image/png"),
        fileName: `${safeFileName(event.name)}-${safeFileName(selectedHeat.name)}-${safeFileName(pair)}-ecran-${index + 1}.png`,
      };
    });
    setPreviewIndex(0);
    setSocialPreview({
      dataUrl: pages[0].dataUrl,
      fileName: pages[0].fileName,
      format: "tv",
      width: TV_RESULT_WIDTH * 2,
      height: TV_RESULT_HEIGHT,
      pages,
    });
  };

  const tvDuo = async () => {
    const secondHeat = heats.find(
      (heat) =>
        heat.id === resolvedTvSecondHeatId && heat.status === "finished",
    );
    if (!selectedHeat || selectedHeat.status !== "finished" || !secondHeat)
      return toast.error("Choisissez deux courses terminées pour le visuel TV.");
    if (selectedHeat.id === secondHeat.id)
      return toast.error("Choisissez deux courses différentes.");
    if (!branding.logoDataUrl) {
      setBrandingOpen(true);
      return toast.error(
        "Ajoutez le logo de votre événement dans « En-tête & visuels » avant de créer l’export TV.",
      );
    }
    setLoading(true);
    try {
      const [left, right, logo] = await Promise.all([
        ownerApi<HeatResponse>("heat_entries", { heatId: selectedHeat.id }),
        ownerApi<HeatResponse>("heat_entries", { heatId: secondHeat.id }),
        loadCanvasImage(branding.logoDataUrl),
      ]);
      const panel = (
        heat: CloudHeat,
        heatEntries: HeatEntry[],
      ) => {
        const canvas = document.createElement("canvas");
        canvas.width = TV_RESULT_WIDTH;
        canvas.height = TV_RESULT_HEIGHT;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("CANVAS_INDISPONIBLE");
        const top = heatEntries
          .filter(
            (entry) =>
              entry.status === "finished" && entry.finish_position != null,
          )
          .slice()
          .sort(
            (a, b) =>
              (a.finish_position ?? Infinity) -
              (b.finish_position ?? Infinity),
          )
          .slice(0, 20);
        drawTvTop20(
          ctx,
          {
            title: branding.title || event.name,
            subtitle: branding.subtitle || "",
            course: heat.name,
            primary: branding.primaryColor || "#1154b3",
            secondary: branding.secondaryColor || "#fed60b",
            rows: top.map((entry) => ({
              rank: entry.finish_position!,
              name: `${entry.participant.first_name} ${entry.participant.last_name.toUpperCase()}`.trim(),
              className: entry.participant.class_name,
            })),
          },
          logo,
        );
        return canvas;
      };
      const canvas = document.createElement("canvas");
      canvas.width = TV_RESULT_WIDTH * 2;
      canvas.height = TV_RESULT_HEIGHT;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("CANVAS_INDISPONIBLE");
      ctx.drawImage(panel(left.heat, left.entries), 0, 0);
      ctx.drawImage(panel(right.heat, right.entries), TV_RESULT_WIDTH, 0);
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(TV_RESULT_WIDTH - 1, 32, 2, TV_RESULT_HEIGHT - 80);
      setSocialPreview({
        dataUrl: canvas.toDataURL("image/png"),
        fileName: `${safeFileName(event.name)}-${safeFileName(left.heat.name)}-${safeFileName(right.heat.name)}-tv.png`,
        format: "tv",
        width: TV_RESULT_WIDTH * 2,
        height: TV_RESULT_HEIGHT,
      });
    } catch (error) {
      toast.error(
        error instanceof Error && error.message === "CANVAS_INDISPONIBLE"
          ? "La création du visuel TV est indisponible sur cet appareil."
          : raceErrorMessage(error),
      );
    } finally {
      setLoading(false);
    }
  };

  const filteredClassOptions = classOptions.filter(
    (option) =>
      !classSearch.trim() ||
      option.label
        .toLocaleLowerCase("fr")
        .includes(classSearch.toLocaleLowerCase("fr")) ||
      option.variants.some((variant) =>
        variant
          .toLocaleLowerCase("fr")
          .includes(classSearch.toLocaleLowerCase("fr")),
      ),
  );
  const groupedOptions = useMemo(() => {
    const groups = new Map<string, ClassOption[]>();
    filteredClassOptions.forEach((option) =>
      groups.set(option.group, [...(groups.get(option.group) ?? []), option]),
    );
    return groups;
  }, [filteredClassOptions]);
  const statusEntries = entries
    .filter((entry) => {
      if (!statusSearch.trim()) return true;
      const query = statusSearch.toLocaleLowerCase("fr");
      return `${entry.participant.first_name} ${entry.participant.last_name} ${entry.participant.class_name} ${entry.participant.bib_number}`
        .toLocaleLowerCase("fr")
        .includes(query);
    })
    .sort(
      (a, b) =>
        a.participant.class_name.localeCompare(
          b.participant.class_name,
          "fr",
        ) ||
        a.participant.last_name.localeCompare(b.participant.last_name, "fr"),
    );

  const shareLink =
    typeof window !== "undefined" && stationCode
      ? (() => {
          const url = new URL(window.location.href);
          url.searchParams.set("station", stationCode);
          return url.toString();
        })()
      : "";
  const copyShareLink = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      toast.success(
        "Lien copié. Vous pouvez le coller sur l’autre PC ou iPad.",
      );
    } catch {
      toast.error(
        "Copie indisponible. Copiez le lien affiché ou utilisez le QR code.",
      );
    }
  };
  const shareCourse = async () => {
    if (!shareLink) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: selectedHeat?.name || "Course",
          text: "Ouvrir un poste d’arrivée Gestion Cross",
          url: shareLink,
        });
        return;
      } catch {
        /* partage annulé */
      }
    }
    await copyShareLink();
  };

  const archivePanel = event.raceArchive && (
    <section className="cross-panel border-amber-200 bg-amber-50 p-5">
      <h3 className="font-bold">Archive locale des résultats</h3>
      <p className="mt-1 text-sm text-slate-600">
        Copie du {new Date(event.raceArchive.savedAt).toLocaleString("fr-FR")} ·{" "}
        {event.raceArchive.courses.length} course(s). Lecture seule : le serveur
        reste la référence pour les courses en cours.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() =>
            void exportRaceResults(
              event.raceArchive!.courses,
              event.name + "-archive",
              "individual",
            ).catch(() => toast.error("Export de l’archive impossible."))
          }
        >
          <FileSpreadsheet />
          Classements archivés
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            void exportRaceResults(
              event.raceArchive!.courses,
              event.name + "-archive",
              "classes",
            ).catch(() => toast.error("Export de l’archive impossible."))
          }
        >
          <Users />
          Challenge archivé
        </Button>
      </div>
    </section>
  );
  const activePreview = socialPreview?.pages?.[previewIndex] ?? socialPreview;
  const downloadPreview = (all = false) => {
    if (!socialPreview || !activePreview) return;
    const downloads = all && socialPreview.pages?.length
      ? socialPreview.pages
      : [{ dataUrl: activePreview.dataUrl, fileName: activePreview.fileName }];
    downloads.forEach((item) => {
      const link = document.createElement("a");
      link.download = item.fileName;
      link.href = item.dataUrl;
      link.click();
    });
  };
  const hasFinishedCourses = heats.some((heat) => heat.status === "finished");
  const courseExportTiles = selectedHeat?.status === "finished" && <>
                <article className="rounded-2xl border bg-white p-4">
                  <Medal className="text-[#1154b3]" />
                  <h4 className="mt-2 text-lg font-bold">
                    Classement individuel
                  </h4>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Select value={visibleCategory} onValueChange={setResultCategory}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Toutes les catégories</SelectItem>{gradeGroups.map(group => <SelectItem key={group.category} value={group.category}>{group.category}</SelectItem>)}</SelectContent></Select>
                    <ExportMenu disabled={loading || entriesLoading} socialDisabled={selectedGroups.length !== 1} onPdf={printIndividual} onExcel={() => void downloadResults("individual")} onPost={() => void social("individual", false)} onStory={() => void social("individual", true)} />
                    <Button
                      variant="outline"
                      disabled={entriesLoading}
                      onClick={() => void tvFullCategories()}
                    >
                      <ImageIcon />
                      TV · classements complets
                    </Button>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">TV : deux catégories par écran, classement complet.</p>
                </article>
                <article className="rounded-2xl border bg-white p-4">
                  <Users className="text-[#1154b3]" />
                  <h4 className="mt-2 text-lg font-bold">
                    Challenge de cette course
                  </h4>
                  <ExportMenu disabled={loading || !classResults.length || entriesLoading} onPdf={printClasses} onExcel={() => void downloadResults("classes")} onPost={() => void social("classes", false)} onStory={() => void social("classes", true)} />
                </article>
                <article className="rounded-2xl border bg-white p-4">
                  <ImageIcon className="text-[#1154b3]" />
                  <h4 className="mt-2 text-lg font-bold">
                    Télévision · deux courses côte à côte
                  </h4>
                  <p className="text-sm text-slate-500">PNG Full HD prêt à diffuser.</p>
                  <div className="mt-4 space-y-3">
                    <div className="rounded-xl bg-slate-50 p-3 text-sm">
                      <span className="text-slate-500">À gauche :</span>{" "}
                      <b>{selectedHeat.name}</b>
                    </div>
                    <Select value={resolvedTvSecondHeatId} onValueChange={setTvSecondHeatId}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Course à afficher à droite" />
                      </SelectTrigger>
                      <SelectContent>
                        {heats
                          .filter(
                            (heat) =>
                              heat.status === "finished" &&
                              heat.id !== selectedHeat.id,
                          )
                          .map((heat) => (
                            <SelectItem key={heat.id} value={heat.id}>
                              {heat.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    <Button
                      className="w-full"
                      disabled={loading || !resolvedTvSecondHeatId}
                      onClick={() => void tvDuo()}
                    >
                      <Download />
                      PNG TV · deux courses
                    </Button>
                  </div>
                </article>
  </>;
  if (ownerLoading)
    return (
      <section className="grid min-h-48 place-items-center text-slate-500">
        <div className="flex items-center gap-3">
          <Loader2 className="animate-spin" />
          Chargement du programme des courses…
        </div>
      </section>
    );
  if (ownerError)
    return (
      <div className="space-y-4">
        {archivePanel}
        <section className="rounded-2xl border bg-white p-8 text-center">
          <p role="alert" className="font-bold text-red-700">
            {ownerError}
          </p>
          <Button className="mt-4" onClick={() => void refreshOwner()}>
            Réessayer
          </Button>
        </section>
      </div>
    );
  if (!cloudEvent)
    return (
      <section className="mx-auto max-w-4xl cross-panel p-6 text-center sm:p-9">
        <Cloud className="mx-auto size-14 text-[#1154b3]" />
        <h2 className="mt-4 text-3xl font-bold">
          Activer la gestion des courses
        </h2>
        <p className="mx-auto mt-2 max-w-2xl text-[#65738e]">
          Synchronisez les participants pour gérer les arrivées sur 1 à 4
          postes, les classements et le challenge interclasses.
        </p>
        <Button
          size="lg"
          className="mt-6"
          disabled={loading}
          onClick={() => void sync()}
        >
          <Cloud />
          Activer le mode course
        </Button>
      </section>
    );

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <div className="cross-course-controls sticky top-20 z-30 overflow-hidden rounded-2xl border bg-white/95 shadow-sm backdrop-blur">
        <nav aria-label="Rubriques des courses" className="flex gap-1 overflow-x-auto p-1.5">
          {([
            { value: "manage", label: "Courses", icon: Flag },
            { value: "arrival", label: "Arrivées", icon: ListOrdered },
            { value: "results", label: "Résultats", icon: Medal },
            { value: "challenge", label: "Challenge", icon: Users },
            { value: "exports", label: "Impression", icon: Printer },
          ] as const).map(view => <Button key={view.value} variant={courseView === view.value ? "default" : "ghost"} aria-current={courseView === view.value ? "page" : undefined} className="min-h-11 flex-1 shrink-0 flex-col gap-1 px-2 py-2 text-xs sm:flex-row sm:gap-2 sm:text-sm" onClick={() => { setCourseView(view.value); if (view.value === "manage") setCourseFocus(false); }}><view.icon className="size-4" />{view.label}</Button>)}
        </nav>
        {courseView !== "challenge" && (courseView !== "manage" || courseFocus) && <section ref={selectedSectionRef} aria-label="Commandes de la course" className="flex scroll-mt-40 flex-wrap items-center gap-2 border-t px-3 py-2.5">
          {courseView === "manage" && <Button size="icon" variant="ghost" aria-label="Retour au programme" title="Programme" onClick={() => setCourseFocus(false)}><ChevronLeft /></Button>}
          <Select value={selectedHeatId ?? ""} onValueChange={id => { if (id !== selectedHeatId) { setEntriesLoading(true); setSelectedHeatId(id); } }}>
            <SelectTrigger aria-label="Course sélectionnée" className="min-w-0 flex-1 sm:max-w-sm"><SelectValue placeholder="Choisir une course" /></SelectTrigger>
            <SelectContent>{heats.map(heat => <SelectItem key={heat.id} value={heat.id}>{heat.name} · {heat.status === "finished" ? "Terminée" : heat.status === "running" ? "En cours" : "Prête"}</SelectItem>)}</SelectContent>
          </Select>
          {selectedHeat && <>
            <Badge variant="outline" className={selectedHeat.status === "running" ? "hidden border-blue-200 bg-blue-50 text-blue-700 sm:inline-flex" : "hidden sm:inline-flex"}>{selectedHeat.status === "running" ? "En cours" : selectedHeat.status === "finished" ? "Terminée" : "Prête"}</Badge>
            {selectedHeat.status === "draft" && <Button size="sm" disabled={loading} onClick={() => void start()}><Play />Démarrer</Button>}
            {selectedHeat.status === "running" && stationCode && <Button size="sm" variant="outline" asChild><a href={shareLink} target="_blank" rel="noopener noreferrer"><Link2/><span className="hidden sm:inline">Scanner</span></a></Button>}
            {selectedHeat.status === "running" && <Button size="sm" variant="destructive" disabled={loading} onClick={() => setFinishCandidate(selectedHeat)}><Flag />Terminer</Button>}
            <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="outline" aria-label="Actions de la course" title="Actions de la course"><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuItem onSelect={() => setCourseDetailsOpen(true)}><CircleHelp />Détails et classes</DropdownMenuItem>
              <DropdownMenuItem disabled={loading} onSelect={() => editHeat(selectedHeat)}><Pencil />Modifier la course</DropdownMenuItem>
              <DropdownMenuItem disabled={entriesLoading} onSelect={() => setStatusOpen(true)}><Users />Absents et dispensés</DropdownMenuItem>
              {selectedHeat.status === "running" && <DropdownMenuItem disabled={!stationCode} onSelect={() => setShareOpen(true)}><Link2 />Ouvrir / ajouter un poste</DropdownMenuItem>}
              <DropdownMenuItem onSelect={() => setBrandingOpen(true)}><Palette />En-tête et couleurs</DropdownMenuItem>
              {selectedHeat.status !== "running" && <><DropdownMenuSeparator /><DropdownMenuItem className="text-red-600" onSelect={() => void deleteHeat()}><Trash2 />Supprimer la course</DropdownMenuItem></>}
            </DropdownMenuContent></DropdownMenu>
          </>}
        </section>}
      </div>
      <div hidden={courseView !== "manage" || courseFocus} className="space-y-5">
      {archivePanel}
      <section className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-bold tracking-tight">Programme</h2>
          <div className="flex flex-wrap gap-2">
            <Button disabled={loading} onClick={openCreate}>
              <Plus />
              Préparer une course
            </Button>
            <Button variant="outline" onClick={() => setBrandingOpen(true)}>
              <Palette />
              En-tête & visuels
            </Button>
          </div>
      </section>

      <CourseProgramme
        heats={heats}
        selectedId={selectedHeatId}
        busy={loading}
        onStart={(heat) => void start(heat)}
        onFinish={setFinishCandidate}
        onEdit={editHeat}
        onOpen={(heat) => {
          setCourseFocus(true);
          setCourseView(heat.status === "finished" ? "results" : "manage");
          if (heat.id === selectedHeatId)
            selectedSectionRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          else {
            scrollRequested.current = true;
            setEntriesLoading(true);
            setSelectedHeatId(heat.id);
          }
        }}
      />
      </div>
      {courseView === "challenge" && (
        <section className="cross-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
          <div><h3 className="text-xl font-bold">Challenge interclasses</h3><p className="mt-1 text-sm text-slate-500">{challengeCourses.length} course(s) · lycée exclu</p></div>
            <div className="flex gap-2"><Button size="icon" variant="ghost" aria-label="Comprendre le challenge" onClick={() => setChallengeHelpOpen(true)}><CircleHelp /></Button><Button size="sm" variant="outline" disabled={challengeLoading} onClick={() => setChallengeRevision(value => value + 1)}>Actualiser</Button></div>
          </div>
          <div className="border-b bg-slate-50/60 p-4">
            <div className="flex flex-wrap gap-2" aria-label="Filtrer le challenge interclasses par niveau">
              <Button size="sm" variant={challengeGrade === "all" ? "default" : "outline"} aria-pressed={challengeGrade === "all"} onClick={() => setChallengeGrade("all")}>Tous les niveaux</Button>
              {challengeGrades.map(grade => <Button key={grade} size="sm" variant={challengeGrade === grade ? "default" : "outline"} aria-pressed={challengeGrade === grade} onClick={() => setChallengeGrade(grade)}>{gradeLabels[grade] ?? grade}</Button>)}
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-500">{challengeGradeLabel}</p>
          </div>
          {challengeLoading ? <p className="p-5" role="status">Calcul des moyennes filles et garçons…</p> : challengeError ? <p className="p-5 text-red-700" role="alert">{challengeError}</p> : !overallResults.length ? <p className="p-5 text-sm text-slate-500">{challengeGrade === "all" ? "Le challenge apparaîtra après la fin d’une course avec challenge activé." : `Aucun résultat de challenge pour le niveau ${challengeGradeLabel}.`}</p> : <div className="cross-scroll"><table className="cross-table w-full"><thead><tr className="bg-slate-50"><th>Rang</th><th>Classe</th><th>Score</th><th className="text-right">Détail</th></tr></thead><tbody>{overallResults.map((result, index) => <tr key={classKey(result.className)}><td className="font-bold text-primary">{result.complete ? index + 1 : "—"}</td><td><span className="font-bold">{result.className}</span>{!result.complete && <span className="mt-0.5 block text-xs text-amber-700">{result.unknown ? "Sexe à renseigner" : "Provisoire"}</span>}</td><td className="font-bold tabular-nums">{formatChallengeScore(result.score)}</td><td className="text-right"><Button size="icon" variant="ghost" aria-label={`Voir le calcul de ${result.className}`} onClick={() => setChallengeDetail(result)}><ChevronRight /></Button></td></tr>)}</tbody></table></div>}
        </section>
      )}
      {courseView === "exports" && heats.length > 0 && (
        <section className="cross-panel p-4 sm:p-5">
          <h2 className="text-xl font-bold">Téléchargements</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <article className="rounded-2xl border bg-white p-4">
              <h3 className="font-bold">Toutes les courses</h3>
              <DropdownMenu><DropdownMenuTrigger asChild><Button className="mt-3 w-full" disabled={loading || printingDocument || !hasFinishedCourses}><Download />Choisir le format</Button></DropdownMenuTrigger><DropdownMenuContent align="start"><DropdownMenuItem onClick={() => void printAllIndividuals()}><Printer />PDF complet</DropdownMenuItem><DropdownMenuItem onClick={() => void downloadResults("individual", true)}><FileSpreadsheet />Excel complet</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
            </article>
            <article className="rounded-2xl border bg-white p-4">
              <h3 className="font-bold">Challenge interclasses</h3>
              <Select value={resolvedChallengeExportGrade} onValueChange={setChallengeExportGrade} disabled={!allOverallResults.length}>
                <SelectTrigger aria-label="Périmètre du challenge à exporter" className="mt-3 w-full"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="all">Challenge complet · hors lycée</SelectItem>{challengeExportGrades.map(grade => <SelectItem key={grade} value={grade}>{gradeLabels[grade] ?? grade}</SelectItem>)}</SelectContent>
              </Select>
              <ExportMenu disabled={loading || challengeLoading || !!challengeError || !allOverallResults.length} onPdf={() => printOverall(resolvedChallengeExportGrade)} onExcel={() => void downloadResults("classes", true, resolvedChallengeExportGrade)} onPost={() => void social("classes", false, true, resolvedChallengeExportGrade)} onStory={() => void social("classes", true, true, resolvedChallengeExportGrade)} />
            </article>
            {courseExportTiles}
            {selectedHeat && <article className="rounded-2xl border bg-white p-4">
              <Printer className="text-[#1154b3]" />
              <h3 className="mt-2 text-lg font-bold">Feuille de secours</h3>
              <p className="text-sm text-slate-500">30 lignes : arrivée + dossard.</p>
              <Button className="mt-4" size="sm" variant="outline" disabled={entriesLoading} onClick={printBackupSheet}><Printer />Imprimer / PDF</Button>
            </article>}
          </div>
        </section>
      )}

      {selectedHeat && courseView !== "challenge" && (courseView !== "manage" || courseFocus) && (
        <>
          {courseView === "manage" && <section aria-busy={entriesLoading} className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {[
                { label: "Engagés", value: entries.length },
                {
                  label: "Arrivés",
                  value: entries.filter((entry) => entry.status === "finished")
                    .length,
                },
                {
                  label: "Dispensés",
                  value: entries.filter((entry) => entry.status === "exempt")
                    .length,
                },
                {
                  label: "Absents",
                  value: entries.filter((entry) => entry.status === "absent")
                    .length,
                },
                {
                  label: "Non-finisseurs",
                  value: entries.filter((entry) => entry.status === "dnf")
                    .length,
                },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border bg-white px-3 py-2.5">
                  <p className="text-xs text-slate-500">{item.label}</p>
                  <p className="mt-0.5 text-2xl font-bold">{item.value}</p>
                </div>
              ))}
          </section>}

          {courseView === "manage" && <div className="grid gap-3 sm:grid-cols-3">
            {[
              { value: "arrival" as const, title: "Arrivée commune", detail: `${ranked.length} arrivées`, icon: ListOrdered },
              { value: "results" as const, title: "Classements", detail: `${gradeGroups.length} catégories`, icon: Medal },
              { value: "exports" as const, title: "Impression", detail: "PDF, Excel, visuels", icon: Printer },
            ].map(item => <button key={item.value} type="button" className="cross-panel flex items-center gap-3 p-4 text-left transition hover:border-primary hover:shadow-sm" onClick={() => setCourseView(item.value)}><span className="cross-icon"><item.icon className="size-5" /></span><span className="min-w-0 flex-1"><span className="block font-bold">{item.title}</span><span className="mt-1 block text-xs text-slate-500">{item.detail}</span></span><ChevronRight className="size-4 text-slate-400" /></button>)}
          </div>}

          {(courseView === "results" || courseView === "arrival") && selectedHeat.status === "draft" && <p className="rounded-xl border border-dashed p-4 text-sm text-slate-500">Course prête à démarrer.</p>}
          {courseView === "exports" && selectedHeat.status !== "finished" && <p className="text-sm text-slate-500">Les classements et visuels de cette course seront disponibles après sa clôture.</p>}

          {courseView === "manage" && selectedHeat.status === "running" && stations.length > 0 && (
            <section className="cross-panel p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <h3 className="font-bold">Postes d’arrivée</h3>
                <div className="flex items-center gap-2"><HelpDialog title="Postes d’arrivée"><p>Les postes sont fusionnés dans l’ordre A → B → C → D. Chaque poste scanne une portion successive de la file d’arrivée.</p></HelpDialog><Badge>{stations.length}/4</Badge></div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {stations.map((station) => {
                  const scans = entries.filter(
                    (entry) => entry.station_order === station.station_order,
                  ).length;
                  return (
                    <div key={station.id} className="rounded-2xl border p-4">
                      <p className="text-xs font-bold text-slate-500">
                        Poste {station.station_order}
                      </p>
                      <p className="mt-1 text-2xl font-bold">
                        {letters[station.station_order - 1]} ·{" "}
                        {station.mode === "start" ? "Début" : "Suite"}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {scans} scan(s)
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {courseView === "results" && selectedHeat.status !== "draft" && (
            <GradeResults
              entries={entries}
              category={visibleCategory}
              onCategory={setResultCategory}
              provisional={selectedHeat.status === "running"}
            />
          )}
          {courseView === "arrival" && selectedHeat.status !== "draft" && (
            <section className="cross-panel overflow-hidden">
              <div className="flex flex-col gap-2 border-b p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-xl font-bold">Ordre d’arrivée commun</h3>
                  <p className="mt-1 text-xs text-slate-500">{ranked.length} arrivées</p>
                </div>
                {selectedHeat.status === "finished" && (
                  <Button
                    variant="outline"
                    onClick={() => void refreshEntries()}
                  >
                    <Cloud />
                    Actualiser
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-3 border-b px-4 py-3"><Search className="size-4 shrink-0 text-slate-400" /><Input aria-label="Rechercher dans les arrivées" value={arrivalSearch} onChange={e=>setArrivalSearch(e.target.value)} placeholder="Nom, classe ou dossard…" className="max-w-sm"/><HelpDialog title="Corriger une arrivée"><p>Utilisez « Place » pour envoyer un élève directement au rang d’arrivée commune souhaité. Les autres élèves se décalent automatiquement.</p><p>Les corrections de place sont disponibles une fois la course terminée. Le classement par catégorie est recalculé automatiquement.</p></HelpDialog></div>
              {!ranked.length ? (
                <p className="p-8 text-center text-sm text-slate-500">
                  Aucune arrivée enregistrée.
                </p>
              ) : (
                <div>
                  <div className="divide-y md:hidden">{visibleArrivals.map(entry=><div key={entry.id} className="flex items-center gap-3 p-3"><span className="w-8 shrink-0 text-center text-xl font-bold text-primary">{entry.finish_position}</span><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{entry.participant.first_name} {entry.participant.last_name.toUpperCase()}</p><p className="mt-0.5 text-xs text-slate-500">{entry.participant.class_name} · dossard {entry.participant.bib_number}</p><p className="mt-0.5 text-xs text-slate-500">{categoryRanks.get(entry.id)?.category} · rang {categoryRanks.get(entry.id)?.rank ?? "—"}</p></div><Button size="sm" variant="outline" disabled={loading || selectedHeat.status !== "finished"} onClick={()=>{setReorderEntry(entry);setTargetPosition(String(entry.finish_position ?? ""));}}>Place</Button></div>)}</div>
                  <div className="cross-scroll hidden md:block">
                  <table className="cross-table min-w-[720px]">

                    <thead className="bg-blue-50 text-left text-xs uppercase text-slate-500">
                      <tr>
                        <th className="p-3">Rang arrivée</th>
                        <th className="p-3">Rang catégorie</th>
                        <th className="p-3">Poste</th>
                        <th className="p-3">Dossard</th>
                        <th className="p-3">Élève</th>
                        <th className="p-3">Niveau / classe</th>
                        <th className="p-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleArrivals.map((entry) => (
                        <tr key={entry.id} className="border-t">
                          <td className="p-3 text-xl font-bold text-[#1154b3]">
                            {entry.finish_position}
                          </td>
                          <td className="p-3 font-bold">
                            {categoryRanks.get(entry.id)?.rank ?? "—"} ·{" "}
                            {categoryRanks.get(entry.id)?.category ?? "—"}
                          </td>
                          <td className="p-3 font-bold">
                            {entry.station_order
                              ? `${letters[entry.station_order - 1]}${entry.station_position ?? ""}`
                              : "—"}
                          </td>
                          <td className="p-3 font-mono font-bold">
                            {entry.participant.bib_number}
                          </td>
                          <td className="p-3">
                            <b>{entry.participant.last_name.toUpperCase()}</b>{" "}
                            {entry.participant.first_name}
                          </td>
                          <td className="p-3">
                            {entry.participant.class_name}
                            {entry.sex_corrected_at_scan && (
                              <Badge className="ml-2 bg-amber-100 text-amber-800">
                                Sexe corrigé → {entry.participant.sex}
                              </Badge>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={selectedHeat.status !== "finished"}
                                onClick={() => {
                                  setReorderEntry(entry);
                                  setTargetPosition(String(entry.finish_position ?? ""));
                                }}
                              >
                                <Pencil />
                                Place
                              </Button>
                              <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`Actions pour ${entry.participant.first_name} ${entry.participant.last_name}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem disabled={loading || selectedHeat.status !== "finished" || entry.finish_position === 1} onSelect={()=>void move(entry,-1)}><ArrowUp />Monter d’une place</DropdownMenuItem><DropdownMenuItem disabled={loading || selectedHeat.status !== "finished" || entry.finish_position === ranked.length} onSelect={()=>void move(entry,1)}><ArrowDown />Descendre d’une place</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem className="text-red-600" onSelect={()=>void removeFinish(entry)}><Trash2 />Retirer l’arrivée</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                  {!visibleArrivals.length && <p className="p-6 text-center text-sm text-slate-500">Aucun élève pour cette recherche.</p>}
                </div>
              )}
            </section>
          )}


        </>
      )}

      <AlertDialog open={!!finishCandidate} onOpenChange={open => { if (!open && !loading) setFinishCandidate(undefined); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Terminer « {finishCandidate?.name} » ?</AlertDialogTitle><AlertDialogDescription>Les élèves encore à courir seront déclarés non-finisseurs. Les arrivées déjà enregistrées sont conservées.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={loading}>Continuer la course</AlertDialogCancel><AlertDialogAction disabled={loading} className="bg-red-600 text-white hover:bg-red-700" onClick={e => { e.preventDefault(); void finish(finishCandidate); }}>{loading ? "Clôture…" : "Terminer la course"}</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!challengeDetail} onOpenChange={open=>{if(!open)setChallengeDetail(undefined);}}><DialogContent><DialogHeader><DialogTitle>{challengeDetail?.className}</DialogTitle><DialogDescription>Détail du challenge interclasses</DialogDescription></DialogHeader>{challengeDetail && <div className="space-y-4"><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Moyenne filles</p><p className="mt-1 text-xl font-bold">{formatChallengeScore(challengeDetail.girlsRatio)}</p><p className="mt-1 text-xs text-slate-500">{challengeDetail.girls} élèves</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Moyenne garçons</p><p className="mt-1 text-xl font-bold">{formatChallengeScore(challengeDetail.boysRatio)}</p><p className="mt-1 text-xs text-slate-500">{challengeDetail.boys} élèves</p></div></div><div className="flex items-center justify-between rounded-xl bg-blue-50 p-4"><span className="font-bold">Score de la classe</span><span className="text-2xl font-bold">{formatChallengeScore(challengeDetail.score)}</span></div><p className="text-sm text-slate-500">{challengeDetail.exempt} dispensé(s) exclus · {challengeDetail.complete ? "Calcul complet" : "Calcul provisoire"}</p></div>}</DialogContent></Dialog>
      <Dialog open={challengeHelpOpen} onOpenChange={setChallengeHelpOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Comment fonctionne le challenge ?</DialogTitle><DialogDescription>Le plus petit score remporte le challenge interclasses.</DialogDescription></DialogHeader>
          <div className="space-y-3 text-sm text-slate-600"><p>{challengeRule}</p><p>Le score d’une classe additionne la moyenne des filles et la moyenne des garçons. Les dispensés sont exclus du calcul et les classes de lycée ne participent pas au challenge.</p><p>Les absents reçoivent la dernière place + 1 ; les non-finisseurs la dernière place + 10.</p></div>
        </DialogContent>
      </Dialog>
      <Dialog open={courseDetailsOpen} onOpenChange={setCourseDetailsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{selectedHeat?.name ?? "Détails de la course"}</DialogTitle><DialogDescription>{selectedHeat ? `${selectedHeat.scheduled_time?.slice(0, 5) || "Horaire libre"} · ${entries.length} engagés` : ""}</DialogDescription></DialogHeader>
          {selectedHeat && <div className="space-y-4"><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Catégorie</p><p className="mt-1 font-bold">{selectedHeat.sex_filter === "female" ? "Filles" : selectedHeat.sex_filter === "male" ? "Garçons" : "Mixte"}</p></div><div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Challenge</p><p className="mt-1 font-bold">{selectedHeat.challenge_enabled ? "Activé" : "Désactivé"}</p></div></div><div><p className="text-sm font-bold">Classes ({selectedHeat.selected_classes.length})</p><div className="mt-2 flex max-h-52 flex-wrap gap-2 overflow-y-auto">{selectedHeat.selected_classes.map(className => <Badge key={className} variant="secondary">{className}</Badge>)}</div></div></div>}
          <DialogFooter><Button variant="outline" onClick={() => { if (selectedHeat) editHeat(selectedHeat); setCourseDetailsOpen(false); }}><Pencil />Modifier</Button><Button onClick={() => setCourseDetailsOpen(false)}>Fermer</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (!open) resetCreate();
        }}
      >
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="shrink-0 px-6 pr-16 pt-6">
            <DialogTitle>
              {editingHeat
                ? "Modifier la course"
                : "Préparer une course"}
            </DialogTitle>
            <DialogDescription>
              {metadataOnlyEdit
                ? "Modifiez le nom, l’horaire ou le challenge. Les classes, les participants et les arrivées restent verrouillés et sont conservés."
                : "Enregistrez les classes et les réglages maintenant. La course attendra votre clic sur « Lancer » le jour du cross."}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
            <div className="grid gap-4 py-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Nom de la course *</Label>
                <Input
                  value={heatName}
                  onChange={(event) => setHeatName(event.target.value)}
                  placeholder="Ex. 6e filles"
                />
              </div>
              <div>
                <Label>Sexe</Label>
                <Select value={sexFilter} onValueChange={setSexFilter} disabled={metadataOnlyEdit}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous</SelectItem>
                    <SelectItem value="female">Filles</SelectItem>
                    <SelectItem value="male">Garçons</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-3 self-end rounded-xl bg-amber-50 px-4 py-3 font-bold">
                <input
                  type="checkbox"
                  checked={challengeEnabled}
                  onChange={(event) =>
                    setChallengeEnabled(event.target.checked)
                  }
                  className="size-5 shrink-0 accent-primary"
                />
                Challenge interclasses
              </label>
            </div>
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="scheduled-time">
                  Départ prévu (facultatif)
                </Label>
                <Input
                  id="scheduled-time"
                  ref={scheduledInputRef}
                  type="time"
                  value={scheduledTime}
                  onChange={(event) => setScheduledTime(event.target.value)}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Cet horaire organise le programme. Le départ reste manuel.
                </p>
              </div>
              <div className="self-end rounded-xl bg-blue-50 p-3">
                <p className="font-bold text-primary">
                  {chosenParticipants.length} élèves dans cette course
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {chosenParticipants.length
                    ? `Classements distincts : ${[...new Set(chosenParticipants.map((p) => individualCategory(p.className, p.sex)))].join(" / ")}.`
                    : "Classes et sexe sélectionnés ci-dessous."}
                </p>
              </div>
            </div>
            {chosenParticipants.some(
              (p) => !gradeOrder.includes(gradeCategory(p.className)),
            ) && (
              <p
                role="alert"
                className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"
              >
                Certaines classes n’ont pas un niveau unique reconnu. Corrigez
                le libellé de classe de chaque élève avant le départ (par
                exemple CM1 A ou CM2 A). Une classe CM1/CM2 n’est pas classée
                arbitrairement en CM1.
              </p>
            )}
            {challengeEnabled && (
              <div className="mb-4 flex items-center justify-between rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900"><span>Challenge interclasses activé</span><Button type="button" size="icon-sm" variant="ghost" aria-label="Règles du challenge" onClick={() => setChallengeHelpOpen(true)}><CircleHelp /></Button></div>
            )}
            {metadataOnlyEdit && (
              <p className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                Modification sûre : les classes et les élèves ne peuvent plus changer après le départ. Seuls le nom, l’horaire et l’activation du challenge sont modifiables.
              </p>
            )}
            <div className={`sticky top-0 z-10 -mx-1 bg-white pb-3 pt-1 ${metadataOnlyEdit ? "hidden" : ""}`}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={classSearch}
                    onChange={(event) => setClassSearch(event.target.value)}
                    className="pl-9"
                    placeholder="Rechercher une classe…"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setSelectedClassKeys(
                        new Set(classOptions.map((option) => option.key)),
                      )
                    }
                  >
                    Tout sélectionner
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedClassKeys(new Set())}
                  >
                    Tout enlever
                  </Button>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">
                {selectedClassKeys.size} classe(s) sélectionnée(s)
              </p>
            </div>
            <div className={`space-y-5 ${metadataOnlyEdit ? "hidden" : ""}`}>
              {[...groupedOptions.entries()].map(([group, options]) => (
                <section key={group}>
                  <h4 className="mb-2 text-xs font-bold uppercase tracking-widest text-[#1154b3]">
                    {group}
                  </h4>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {options.map((option) => {
                      const selected = selectedClassKeys.has(option.key);
                      return (
                        <button
                          key={option.key}
                          type="button"
                          onClick={() => toggleClass(option.key)}
                          className={`flex min-h-12 items-center justify-between rounded-xl border px-4 py-2 text-left text-sm font-bold transition ${selected ? "border-[#1154b3] bg-[#1154b3] text-white" : "border-slate-200 bg-white hover:border-blue-300"}`}
                        >
                          <span className="min-w-0 flex-1">{option.label}</span>
                          <span
                            className={`ml-3 grid size-5 shrink-0 place-items-center rounded-full border ${selected ? "border-white bg-white text-[#1154b3]" : "border-slate-300"}`}
                          >
                            {selected ? "✓" : ""}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t bg-white px-6 py-4">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Annuler
            </Button>
            <Button
              disabled={
                loading || !heatName.trim() || (!metadataOnlyEdit && chosenParticipants.length === 0)
              }
              onClick={() => void createHeat()}
            >
              <Flag />
              {loading
                ? "Enregistrement…"
                : editingHeat
                  ? "Enregistrer les modifications"
                  : "Enregistrer la course"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!reorderEntry} onOpenChange={open => { if (!open) { setReorderEntry(undefined); setTargetPosition(""); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier la place d’arrivée</DialogTitle>
            <DialogDescription>
              {reorderEntry ? `${reorderEntry.participant.first_name} ${reorderEntry.participant.last_name.toUpperCase()} · place actuelle ${reorderEntry.finish_position}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="target-position">Nouvelle place (1 à {ranked.length})</Label>
            <Input id="target-position" type="number" min={1} max={ranked.length} value={targetPosition} onChange={event => setTargetPosition(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void moveToPosition(); }} autoFocus />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReorderEntry(undefined)}>Annuler</Button>
            <Button disabled={loading} onClick={() => void moveToPosition()}>Déplacer l’élève</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!socialPreview} onOpenChange={open => { if (!open) { setSocialPreview(undefined); setPreviewIndex(0); } }}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>Aperçu {socialPreview?.format === "story" ? "de la story" : socialPreview?.format === "tv" ? "des classements TV" : "de la publication"}</DialogTitle>
            <DialogDescription>{socialPreview?.format === "tv" ? `Deux catégories par écran Full HD · classement complet${socialPreview.pages?.length ? ` · ${socialPreview.pages.length} écran(s)` : ""}.` : `PNG ${socialPreview?.width} × ${socialPreview?.height}${socialPreview?.pages?.length ? ` · ${socialPreview.pages.length} visuels` : ""}`}</DialogDescription>
          </DialogHeader>
          {activePreview && <div className="min-h-0 overflow-auto rounded-xl bg-slate-100 p-3"><Image unoptimized src={activePreview.dataUrl} alt="Visuel des résultats sur fond blanc" width={socialPreview?.width} height={socialPreview?.height} className="mx-auto h-auto max-h-[65dvh] w-auto max-w-full bg-white object-contain" /></div>}
          {socialPreview?.pages && socialPreview.pages.length > 1 && (
            <div className="flex items-center justify-center gap-3">
              <Button size="sm" variant="outline" disabled={previewIndex === 0} onClick={() => setPreviewIndex(index => Math.max(0, index - 1))}><ChevronLeft />Précédent</Button>
              <span className="text-sm font-bold">Visuel {previewIndex + 1} / {socialPreview.pages.length}</span>
              <Button size="sm" variant="outline" disabled={previewIndex === socialPreview.pages.length - 1} onClick={() => setPreviewIndex(index => Math.min(socialPreview.pages!.length - 1, index + 1))}>Suivant<ChevronRight /></Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSocialPreview(undefined)}>Fermer</Button>
            <Button variant="outline" onClick={() => downloadPreview(false)}><Download />Télécharger le PNG</Button>
            {socialPreview?.pages && socialPreview.pages.length > 1 && <Button onClick={() => downloadPreview(true)}><Download />Télécharger les {socialPreview.pages.length} visuels</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajouter un poste d’arrivée</DialogTitle>
            <DialogDescription>
              Sur iPad ou téléphone, scannez le QR code. Sur PC ou Mac, copiez
              simplement le lien. Le code à 6 chiffres permet aussi de passer
              par « Rejoindre une course » sur la page d’accueil.
            </DialogDescription>
          </DialogHeader>
          <div className="text-center">
            {qr && (
              <Image
                src={qr}
                alt="QR code du poste d’arrivée"
                width={240}
                height={240}
                unoptimized
                className="mx-auto size-60 rounded-2xl border bg-white p-2"
              />
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              size="lg"
              variant="outline"
              onClick={() => void copyShareLink()}
            >
              <Copy />
              Copier le lien
            </Button>
            <Button size="lg" onClick={() => void shareCourse()}>
              <Share2 />
              Partager
            </Button>
          </div>
          <div className="rounded-2xl bg-slate-50 p-4 text-center">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-500">
              Code de course
            </p>
            <p className="mt-1 font-mono text-3xl font-bold tracking-[0.25em] text-[#1154b3]">
              {stationCode || "—"}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              À saisir dans « Rejoindre une course » si vous ne pouvez pas
              utiliser le QR code ou le lien.
            </p>
          </div>
          <p className="text-center text-sm text-slate-500">
            Jusqu’à 4 postes simultanés. Chaque appareil choisira ensuite «
            Début de la course » ou « Suite de la course ».
          </p>
        </DialogContent>
      </Dialog>

      <EventBrandingDialog event={event} onChange={onChange} open={brandingOpen} onOpenChange={setBrandingOpen} />
      <Dialog
        open={statusOpen}
        onOpenChange={(open) => {
          setStatusOpen(open);
          if (!open) setStatusSearch("");
        }}
      >
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden p-0 sm:max-w-3xl">
          <DialogHeader className="px-6 pr-16 pt-6">
            <DialogTitle>Absents, dispensés et non-finisseurs</DialogTitle>
            <DialogDescription>
              Dispensés : exclus des points et du ratio. Absents : dernier du niveau et du sexe + 1. Non finishers : dernier + 10.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={statusSearch}
                onChange={(event) => setStatusSearch(event.target.value)}
                className="pl-9"
                placeholder="Nom, classe ou dossard…"
              />
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto border-y">
            <div className="divide-y">
              {statusEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="grid gap-3 px-6 py-3 sm:grid-cols-[minmax(0,1fr)_240px] sm:items-center"
                >
                  <div>
                    <p className="font-bold">
                      <span className="font-mono text-[#1154b3]">
                        #{entry.participant.bib_number}
                      </span>{" "}
                      · {entry.participant.last_name.toUpperCase()}{" "}
                      {entry.participant.first_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {entry.participant.class_name}
                    </p>
                  </div>
                  {entry.status === "finished" ? (
                    <Badge className="w-fit">
                      Arrivé #{entry.finish_position}
                    </Badge>
                  ) : (
                    <Select
                      value={entry.status}
                      onValueChange={(value) =>
                        void changeStatus(
                          entry,
                          value as Exclude<EntryStatus, "finished">,
                        )
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="registered">À courir</SelectItem>
                        <SelectItem value="dnf">
                          Abandon (non-finisseur)
                        </SelectItem>
                        <SelectItem value="exempt">Dispensé</SelectItem>
                        <SelectItem value="absent">Absent</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
              ))}
            </div>
          </div>
          <DialogFooter className="shrink-0 px-6 py-4">
            <Button onClick={() => setStatusOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
