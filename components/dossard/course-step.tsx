"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import QRCode from "qrcode";
import Image from "next/image";
import {
  ArrowDown,
  ArrowUp,
  Cloud,
  Copy,
  Download,
  FileSpreadsheet,
  Flag,
  Image as ImageIcon,
  Link2,
  Loader2,
  Medal,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  }>();
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
  const allOverallResults = overallChallenge(challengeCourses);
  const overallResults = overallChallenge(challengeCourses, challengeGrade);
  const challengeGrades = [...new Set(["6e", "5e", "4e", "3e", ...allOverallResults.map(result => gradeCategory(result.className))])].sort(compareCategories);
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
    if (
      !heat ||
      !confirm(
        `Terminer « ${heat.name} » ? Les élèves encore à courir seront classés non-finisseurs.`,
      )
    )
      return;
    try {
      setLoading(true);
      setSelectedHeatId(heat.id);
      activeHeatRef.current = heat.id;
      await ownerApi("finish_heat", { heatId: heat.id });
      await refreshOwner();
      await refreshEntries(heat.id);
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

  const printOverall = (complete = false) => {
    const printable = complete ? allOverallResults : overallResults;
    const label = complete ? "Tous les niveaux · lycée exclu" : challengeGradeLabel;
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

  const social = async (kind: "individual" | "classes", story = false, general = false) => {
    const socialClassResults = general ? overallResults.filter(result => result.complete) : classResults.filter(result => result.score !== null);
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
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let logo: HTMLImageElement | undefined;
    try {
      logo = await loadCanvasImage(branding.logoDataUrl);
    } catch {
      setBrandingOpen(true);
      return toast.error("Le logo de l’événement n’a pas pu être chargé. Ajoutez-le à nouveau dans « En-tête & visuels ».");
    }
    drawSocialResults(ctx, {
      story,
      title: branding.title || event.name,
      subtitle: branding.subtitle || "",
      heading: kind === "classes" ? "CHALLENGE INTERCLASSES" : "CLASSEMENT INDIVIDUEL",
      category: general ? `${challengeGradeLabel} · filles + garçons` : kind === "individual" ? selectedGroups[0]?.category || "" : selectedHeat!.name,
      note: kind === "classes" ? "Moyenne filles + moyenne garçons · dispensés exclus" : selectedHeat!.name,
      primary: branding.primaryColor || "#1154b3",
      secondary: branding.secondaryColor || "#fed60b",
      rows: kind === "classes"
        ? socialClassResults.map((result, index) => ({ rank: index + 1, label: result.className, detail: `${formatChallengeScore(result.score)}` }))
        : (selectedGroups[0]?.entries.filter(entry => entry.status === "finished") || []).map(entry => ({
            rank: categoryRanks.get(entry.id)?.rank || 0,
            label: `${entry.participant.first_name} ${entry.participant.last_name.toUpperCase()}`,
            detail: entry.participant.class_name,
          })),
    }, logo);
    const fileName =
      `${general ? event.name + "-challenge-general" + (challengeGrade === "all" ? "" : "-" + challengeGrade) : selectedHeat!.name}-${kind}-${story ? "story" : "post"}.png`.replace(
        /\s+/g,
        "-",
      );
    setSocialPreview({
      dataUrl: canvas.toDataURL("image/png"),
      fileName,
      format: story ? "story" : "post",
      width,
      height,
    });
  };

  const tvTop20 = async () => {
    if (!selectedHeat || selectedHeat.status !== "finished") return;
    if (!branding.logoDataUrl) {
      setBrandingOpen(true);
      return toast.error(
        "Ajoutez le logo de votre événement dans « En-tête & visuels » avant de créer l’export TV.",
      );
    }
    const top = entries
      .filter(
        (entry) => entry.status === "finished" && entry.finish_position != null,
      )
      .slice()
      .sort(
        (a, b) =>
          (a.finish_position ?? Infinity) -
          (b.finish_position ?? Infinity),
      )
      .slice(0, 20);
    if (!top.length)
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
    const canvas = document.createElement("canvas");
    canvas.width = TV_RESULT_WIDTH;
    canvas.height = TV_RESULT_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawTvTop20(
      ctx,
      {
        title: branding.title || event.name,
        subtitle: branding.subtitle || "",
        course: selectedHeat.name,
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
    setSocialPreview({
      dataUrl: canvas.toDataURL("image/png"),
      fileName: `${safeFileName(event.name)}-${safeFileName(selectedHeat.name)}-top-20-tv.png`,
      format: "tv",
      width: TV_RESULT_WIDTH,
      height: TV_RESULT_HEIGHT,
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
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <nav aria-label="Rubriques des courses" className="grid grid-cols-2 gap-2 rounded-2xl border bg-white p-2 lg:grid-cols-5">
        {([
          { value: "manage", label: "Gestion des courses" },
          { value: "arrival", label: "Ordre d’arrivée commun" },
          { value: "results", label: "Résultats" },
          { value: "challenge", label: "Challenge interclasses" },
          { value: "exports", label: "Impression" },
        ] as const).map(view => <Button key={view.value} variant={courseView === view.value ? "default" : "ghost"} aria-current={courseView === view.value ? "page" : undefined} className="h-auto min-h-11 whitespace-normal" onClick={() => setCourseView(view.value)}>{view.label}</Button>)}
      </nav>
      <div hidden={courseView !== "manage"} className="space-y-5">
      {archivePanel}
      <section className="cross-panel p-5 sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
          <div className="min-w-0 flex-1">
            <p className="cross-eyebrow">Courses du cross</p>
            <h2 className="mt-1 text-[clamp(1.5rem,3vw,2rem)] font-bold tracking-tight">
              Programme du cross
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Préparez tout à l’avance. Le jour du cross, cliquez sur « Lancer »
              à l’heure du départ.
            </p>
          </div>
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
        </div>
      </section>

      <CourseProgramme
        heats={heats}
        selectedId={selectedHeatId}
        busy={loading}
        onStart={(heat) => void start(heat)}
        onFinish={(heat) => void finish(heat)}
        onEdit={editHeat}
        onOpen={(heat) => {
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
      {(courseView === "results" || courseView === "arrival" || courseView === "exports") && (
        <section className="cross-panel flex flex-wrap items-center gap-3 p-4">
          <Label htmlFor="selected-course">Course à consulter</Label>
          <Select value={selectedHeatId ?? ""} onValueChange={id => { setEntriesLoading(true); setSelectedHeatId(id); }}>
            <SelectTrigger id="selected-course" className="w-full sm:w-96"><SelectValue placeholder="Choisir une course" /></SelectTrigger>
            <SelectContent>{heats.map(heat => <SelectItem key={heat.id} value={heat.id}>{heat.name} · {heat.status === "finished" ? "Terminée" : heat.status === "running" ? "En cours" : "Prête"}</SelectItem>)}</SelectContent>
          </Select>
        </section>
      )}
      {courseView === "challenge" && (
        <section className="cross-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
          <div><h3 className="text-xl font-bold">Challenge interclasses général</h3><p className="mt-1 text-sm text-slate-500">Moyenne filles + moyenne garçons de la même classe, même dans des courses séparées. Les classes de lycée sont toujours exclues. {challengeCourses.length} course(s) terminée(s) avec challenge activé.</p><p className="mt-1 text-xs text-slate-500">{challengeRule}</p></div>
            <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={challengeLoading} onClick={() => setChallengeRevision(value => value + 1)}>Actualiser le challenge</Button></div>
          </div>
          <div className="border-b bg-slate-50/60 p-4">
            <div className="flex flex-wrap gap-2" aria-label="Filtrer le challenge interclasses par niveau">
              <Button size="sm" variant={challengeGrade === "all" ? "default" : "outline"} aria-pressed={challengeGrade === "all"} onClick={() => setChallengeGrade("all")}>Tous les niveaux</Button>
              {challengeGrades.map(grade => <Button key={grade} size="sm" variant={challengeGrade === grade ? "default" : "outline"} aria-pressed={challengeGrade === grade} onClick={() => setChallengeGrade(grade)}>{gradeLabels[grade] ?? grade}</Button>)}
            </div>
            <p className="mt-2 text-xs text-slate-500">{challengeGradeLabel} · Le filtre s’applique à ce tableau et aux téléchargements proposés dans « Impression ». Les moyennes filles et garçons sont additionnées. Lycée exclu.</p>
          </div>
          {challengeLoading ? <p className="p-5" role="status">Calcul des moyennes filles et garçons…</p> : challengeError ? <p className="p-5 text-red-700" role="alert">{challengeError}</p> : !overallResults.length ? <p className="p-5 text-sm text-slate-500">{challengeGrade === "all" ? "Le challenge apparaîtra après la fin d’une course avec challenge activé." : `Aucun résultat de challenge pour le niveau ${challengeGradeLabel}.`}</p> : <div className="cross-scroll"><table className="cross-table w-full"><thead><tr className="bg-blue-50 text-left text-xs text-slate-500"><th>Rang</th><th>Classe</th><th>Score F + G</th><th>Moyenne filles</th><th>Moyenne garçons</th><th>Effectif F / G</th><th>Dispensés exclus</th><th>État</th></tr></thead><tbody>{overallResults.map((result, index) => <tr className="border-t" key={classKey(result.className)}><td className="font-bold">{result.complete ? index + 1 : "—"}</td><td className="font-bold">{result.className}</td><td className="font-bold">{formatChallengeScore(result.score)}</td><td>{formatChallengeScore(result.girlsRatio)}</td><td>{formatChallengeScore(result.boysRatio)}</td><td>{result.girls} / {result.boys}</td><td>{result.exempt}</td><td>{result.complete ? "Complet" : result.unknown ? "Sexe à renseigner" : "Provisoire"}</td></tr>)}</tbody></table></div>}
        </section>
      )}
      {courseView === "exports" && heats.some((heat) => heat.status === "finished") && (
        <section className="cross-panel p-4 sm:p-5">
          <p className="cross-eyebrow">Centre de téléchargement</p>
          <h2 className="mt-1 text-2xl font-bold">Impressions et publications</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <article className="rounded-2xl border bg-white p-4">
              <h3 className="font-bold">Toutes les courses</h3>
              <p className="mt-1 text-xs text-slate-500">Tous les classements terminés dans un seul document.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" disabled={loading || printingDocument} onClick={() => void printAllIndividuals()}><Printer />PDF complet</Button>
                <Button size="sm" variant="outline" disabled={loading} onClick={() => void downloadResults("individual", true)}><FileSpreadsheet />Excel complet</Button>
              </div>
            </article>
            <article className="rounded-2xl border bg-white p-4">
              <h3 className="font-bold">Challenge interclasses complet</h3>
              <p className="mt-1 text-xs text-slate-500">Toutes les classes et tous les niveaux, avec exclusion automatique du lycée.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" disabled={challengeLoading || !!challengeError || !allOverallResults.length} onClick={() => printOverall(true)}><Printer />PDF complet</Button>
                <Button size="sm" variant="outline" disabled={loading || challengeLoading || !!challengeError || !allOverallResults.length} onClick={() => void downloadResults("classes", true, "all")}><FileSpreadsheet />Excel complet</Button>
                <Button size="sm" variant="outline" disabled={challengeLoading || !!challengeError || !overallResults.length} onClick={() => void social("classes", false, true)}><ImageIcon />Publication</Button>
                <Button size="sm" variant="outline" disabled={challengeLoading || !!challengeError || !overallResults.length} onClick={() => void social("classes", true, true)}><Download />Story</Button>
              </div>
              <p className="mt-2 text-xs text-slate-500">Visuels : filtre actif {challengeGradeLabel}. PDF/Excel : challenge complet.</p>
            </article>
          </div>
        </section>
      )}

      {selectedHeat && courseView !== "challenge" && (
        <>
          <section
            ref={selectedSectionRef}
            className={`scroll-mt-24 cross-panel p-5 sm:p-6 ${courseView === "exports" ? "hidden" : ""}`}
          >
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-2xl font-bold">{selectedHeat.name}</h3>
                  <Badge variant="outline">
                    {selectedHeat.status === "draft"
                      ? "Prête"
                      : selectedHeat.status === "running"
                        ? "En cours"
                        : "Terminée"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-slate-500">
                  {selectedHeat.selected_classes.join(", ")} · {entries.length}{" "}
                  engagé(s)
                </p>
              </div>
              <div className={`flex flex-wrap gap-2 ${courseView !== "manage" && courseView !== "results" ? "hidden" : ""}`}>
                {selectedHeat.status === "draft" && (
                  <>
                    <Button disabled={loading} onClick={() => void start()}>
                      <Play />
                      Lancer la course
                    </Button>
                    <Button
                      variant="outline"
                      disabled={loading}
                      onClick={() => editHeat(selectedHeat)}
                    >
                      <Pencil />
                      Modifier
                    </Button>
                  </>
                )}
                {selectedHeat.status === "running" && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() =>
                        stationCode
                          ? setShareOpen(true)
                          : toast.error(
                              "Le code de cette course n’est plus disponible sur cet appareil.",
                            )
                      }
                    >
                      <Link2 />
                      Ajouter un poste
                    </Button>
                    <Button
                      variant="outline"
                      disabled={loading}
                      onClick={() => editHeat(selectedHeat)}
                    >
                      <Pencil />
                      Modifier
                    </Button>
                    <Button
                      className="bg-red-600 hover:bg-red-700"
                      onClick={() => void finish(selectedHeat)}
                    >
                      Terminer
                    </Button>
                  </>
                )}
                {selectedHeat.status === "finished" && (
                  <Button
                    variant="outline"
                    disabled={loading}
                    onClick={() => editHeat(selectedHeat)}
                  >
                    <Pencil />
                    Modifier
                  </Button>
                )}
                <Button
                  variant="outline"
                  disabled={entriesLoading}
                  onClick={() => setStatusOpen(true)}
                >
                  <Users />
                  Absents / dispensés
                </Button>
                {selectedHeat.status !== "running" && (
                  <Button
                    variant="outline"
                    className="text-red-600"
                    onClick={() => void deleteHeat()}
                  >
                    <Trash2 />
                    Supprimer
                  </Button>
                )}
              </div>
            </div>
            {courseView === "manage" && selectedHeat.status === "draft" && (
              <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
                Course enregistrée
                {selectedHeat.scheduled_time
                  ? ` · Départ prévu à ${selectedHeat.scheduled_time.slice(0, 5)}`
                  : ""}
                . Vous pouvez renseigner les absents et dispensés avant le
                départ. Le chronomètre démarrera uniquement au clic sur « Lancer
                ».
              </p>
            )}
            <div
              aria-busy={entriesLoading}
              className={`mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 ${courseView !== "manage" ? "hidden" : ""}`}
            >
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
                <div key={item.label} className="rounded-2xl bg-slate-50 p-4">
                  <p className="text-xs text-slate-500">{item.label}</p>
                  <p className="mt-1 text-3xl font-bold">{item.value}</p>
                </div>
              ))}
            </div>
          </section>

          {courseView !== "manage" && selectedHeat.status === "draft" && <p className="cross-panel p-5 text-sm text-slate-500">Cette course est en préparation. Lancez-la depuis « Gestion des courses » pour enregistrer les arrivées.</p>}
          {courseView === "exports" && selectedHeat.status === "running" && <p className="cross-panel p-5 text-sm text-slate-500">Les impressions et visuels de cette course seront disponibles après sa clôture. Les classements provisoires sont dans « Résultats de la course ».</p>}

          {courseView === "manage" && selectedHeat.status === "running" && stations.length > 0 && (
            <section className="cross-panel p-5 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold">Postes d’arrivée</h3>
                  <p className="text-sm text-slate-500">
                    Chaque poste garde son ordre. Le classement fusionne
                    automatiquement A → B → C → D.
                  </p>
                </div>
                <Badge>{stations.length}/4</Badge>
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
                  <p className="text-sm text-slate-500">
                    L’ordre final est celui des postes A → B → C → D.
                  </p>
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
              {!ranked.length ? (
                <p className="p-8 text-center text-sm text-slate-500">
                  Aucune arrivée enregistrée.
                </p>
              ) : (
                <div className="cross-scroll">
                  <table className="cross-table min-w-[980px]">
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
                      {ranked.map((entry) => (
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
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                disabled={
                                  selectedHeat.status !== "finished" ||
                                  entry.finish_position === 1
                                }
                                onClick={() => void move(entry, -1)}
                              >
                                <ArrowUp />
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                disabled={
                                  selectedHeat.status !== "finished" ||
                                  entry.finish_position === ranked.length
                                }
                                onClick={() => void move(entry, 1)}
                              >
                                <ArrowDown />
                              </Button>
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                className="text-red-600"
                                onClick={() => void removeFinish(entry)}
                              >
                                <Trash2 />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {courseView === "exports" && selectedHeat.status === "finished" && (
            <section className="cross-panel p-4 sm:p-5">
              <p className="text-xs font-bold uppercase tracking-widest text-[#1154b3]">
                Course sélectionnée
              </p>
              <h3 className="mt-1 text-xl font-bold">Formats de la course sélectionnée</h3>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <article className="rounded-2xl border bg-white p-4">
                  <Medal className="text-[#1154b3]" />
                  <h4 className="mt-2 text-lg font-bold">
                    Classement individuel
                  </h4>
                  <p className="text-sm text-slate-500">
                    Rang d’arrivée commun et classements filles/garçons par niveau (CP,
                    CE1, collège, lycée…), avec les classes A/B regroupées.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Select value={visibleCategory} onValueChange={setResultCategory}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Toutes les catégories</SelectItem>{gradeGroups.map(group => <SelectItem key={group.category} value={group.category}>{group.category}</SelectItem>)}</SelectContent></Select>
                    <Button disabled={entriesLoading} onClick={printIndividual}>
                      <Printer />
                      PDF ·{" "}
                      {visibleCategory === "all"
                        ? "toutes les catégories"
                        : visibleCategory}
                    </Button>
                    <Button
                      variant="outline"
                      disabled={loading || entriesLoading}
                      onClick={() => void downloadResults("individual")}
                    >
                      <FileSpreadsheet />
                      Excel
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void social("individual", false)}
                    >
                      <ImageIcon />
                      Post
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => void social("individual", true)}
                    >
                      <Download />
                      Story
                    </Button>
                    <Button
                      variant="outline"
                      disabled={entriesLoading}
                      onClick={() => void tvTop20()}
                    >
                      <ImageIcon />
                      PNG TV · Top 20
                    </Button>
                  </div>
                  <p className="mt-3 text-xs text-slate-500">
                    Format demi-écran Full HD 960 × 1080 : placez deux courses
                    côte à côte dans votre fichier télévision, sans recadrage.
                  </p>
                </article>
                <article className="rounded-2xl border bg-white p-4">
                  <Users className="text-[#1154b3]" />
                  <h4 className="mt-2 text-lg font-bold">
                    Challenge de cette course
                  </h4>
                  <p className="text-sm text-slate-500">
                    {challengeRule} Le classement général regroupe les points et effectifs des courses terminées avant de calculer les moyennes.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      disabled={!classResults.length || entriesLoading}
                      onClick={printClasses}
                    >
                      <Printer />
                      Imprimer / PDF
                    </Button>
                    <Button
                      variant="outline"
                      disabled={
                        loading || !classResults.length || entriesLoading
                      }
                      onClick={() => void downloadResults("classes")}
                    >
                      <FileSpreadsheet />
                      Excel
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!classResults.length}
                      onClick={() => void social("classes", false)}
                    >
                      <ImageIcon />
                      Post
                    </Button>
                    <Button
                      variant="outline"
                      disabled={!classResults.length}
                      onClick={() => void social("classes", true)}
                    >
                      <Download />
                      Story
                    </Button>
                  </div>
                </article>
                <article className="rounded-2xl border bg-white p-4">
                  <ImageIcon className="text-[#1154b3]" />
                  <h4 className="mt-2 text-lg font-bold">
                    Télévision · deux courses côte à côte
                  </h4>
                  <p className="text-sm text-slate-500">
                    La course sélectionnée sera placée à gauche. Choisissez la
                    course de droite pour obtenir un PNG Full HD 1920 × 1080 prêt à diffuser.
                  </p>
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
                <article className="rounded-2xl border bg-white p-4">
                  <Printer className="text-[#1154b3]" />
                  <h4 className="mt-2 text-lg font-bold">Feuille de secours</h4>
                  <p className="text-sm text-slate-500">Une page A4 avec l’en-tête et 30 lignes : ordre d’arrivée et dossard.</p>
                  <Button className="mt-4" size="sm" variant="outline" disabled={entriesLoading} onClick={printBackupSheet}><Printer />Imprimer / PDF</Button>
                </article>
              </div>
              {classResults.length > 0 && (
                <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                  <div className="flex flex-wrap gap-3">
                    {classResults.slice(0, 5).map((result, index) => (
                      <Badge
                        key={result.className}
                        className="px-3 py-1.5 text-sm"
                      >
                        {index + 1}. {result.className} · {formatChallengeScore(result.score)}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}

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
              <p className="mb-4 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-slate-600">
                {challengeRule}
              </p>
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

      <Dialog open={!!socialPreview} onOpenChange={open => { if (!open) setSocialPreview(undefined); }}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-2xl">
          <DialogHeader><DialogTitle>Aperçu {socialPreview?.format === "story" ? "de la story" : socialPreview?.format === "tv" ? "du Top 20 TV" : "de la publication"}</DialogTitle><DialogDescription>{socialPreview?.format === "tv" ? "Ce PNG occupe exactement la moitié d’un écran Full HD. Vérifiez le logo, les couleurs et les 20 arrivées." : "Vérifiez le logo et le classement avant de télécharger le visuel."}</DialogDescription></DialogHeader>
          {socialPreview && <div className="min-h-0 overflow-auto rounded-xl bg-slate-100 p-3"><Image unoptimized src={socialPreview.dataUrl} alt="Visuel des résultats sur fond blanc" width={socialPreview.width} height={socialPreview.height} className="mx-auto h-auto max-h-[65dvh] w-auto max-w-full bg-white object-contain" /></div>}
          <DialogFooter><Button variant="outline" onClick={() => setSocialPreview(undefined)}>Fermer</Button><Button onClick={() => { if (!socialPreview) return; const link = document.createElement("a"); link.download = socialPreview.fileName; link.href = socialPreview.dataUrl; link.click(); }}><Download />Télécharger le PNG</Button></DialogFooter>
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
