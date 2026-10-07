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
import type { RaceEvent, ResultBranding } from "@/lib/dossard/types";
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
  challengePenalties,
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
import { drawSocialResults } from "@/lib/dossard/social-results";

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

function hexToRgb(hex: string) {
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return { r: 17, g: 84, b: 179 };
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}
function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b]
    .map((value) =>
      Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
function mixColor(a: string, b: string, amount: number) {
  const x = hexToRgb(a),
    y = hexToRgb(b);
  return rgbToHex(
    x.r + (y.r - x.r) * amount,
    x.g + (y.g - x.g) * amount,
    x.b + (y.b - x.b) * amount,
  );
}
function colorDistance(
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
) {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}
async function extractPalette(dataUrl: string) {
  const image = new window.Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("IMAGE_INVALIDE"));
    image.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = 72;
  canvas.height = 72;
  const ctx = canvas.getContext("2d");
  if (!ctx) return [] as string[];
  ctx.drawImage(image, 0, 0, 72, 72);
  const data = ctx.getImageData(0, 0, 72, 72).data;
  const buckets = new Map<
    string,
    { r: number; g: number; b: number; count: number }
  >();
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 150) continue;
    const r = data[index],
      g = data[index + 1],
      b = data[index + 2];
    if (r > 245 && g > 245 && b > 245) continue;
    if (r < 18 && g < 18 && b < 18) continue;
    if (Math.max(r, g, b) - Math.min(r, g, b) < 22) continue;
    const qr = Math.round(r / 32) * 32,
      qg = Math.round(g / 32) * 32,
      qb = Math.round(b / 32) * 32;
    const key = `${qr}-${qg}-${qb}`;
    const item = buckets.get(key) ?? { r: qr, g: qg, b: qb, count: 0 };
    item.count += 1;
    buckets.set(key, item);
  }
  const candidates = [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 18);
  const picked: typeof candidates = [];
  candidates.forEach((candidate) => {
    if (
      picked.length < 4 &&
      picked.every((other) => colorDistance(candidate, other) > 72)
    )
      picked.push(candidate);
  });
  picked.sort((a, b) => a.r + a.g + a.b - (b.r + b.g + b.b));
  return picked.map((color) => rgbToHex(color.r, color.g, color.b));
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
  const [socialPreview, setSocialPreview] = useState<{ dataUrl: string; fileName: string; story: boolean }>();
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
  const [editingHeat, setEditingHeat] = useState<CloudHeat>();
  const [ownerLoading, setOwnerLoading] = useState(true);
  const [ownerError, setOwnerError] = useState("");
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [resultCategory, setResultCategory] = useState("all");
  const [courseView, setCourseView] = useState<"manage" | "rankings" | "arrival" | "results">("manage");
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
  const branding: ResultBranding = {
    title: event.resultBranding?.title || event.name,
    subtitle:
      event.resultBranding?.subtitle ||
      `${event.location || ""}${event.location ? " · " : ""}${event.year}`,
    logoDataUrl: event.resultBranding?.logoDataUrl,
    primaryColor: event.resultBranding?.primaryColor || "#1154b3",
    secondaryColor: event.resultBranding?.secondaryColor || "#fed60b",
    accentColor: event.resultBranding?.accentColor || "#173970",
  };

  const refreshOwner = async () => {
    try {
      const state = await ownerApi<OwnerState>("owner_state", {
        localEventId: event.id,
      });
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
    try {
      const result = await ownerApi<HeatResponse>("heat_entries", { heatId });
      if (activeHeatRef.current !== heatId) return;
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
    if (courseView !== "rankings" && courseView !== "results") return;
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
  const createHeat = async () => {
    if (!cloudEvent) return;
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
        scheduledTime: scheduledTime || null,
        challengeEnabled,
        challengeClasses: selectedOptions.map((option) => option.label),
        challengeBestCount: null,
        participantIds: participants.map((participant) => participant.id),
      });
      setCreateOpen(false);
      resetCreate();
      await refreshOwner();
      setSelectedHeatId(result.heat.id);
      toast.success(
        `Course ${editingHeat ? "modifiée" : "préparée"} avec ${result.participantCount} élèves. Elle reste prête à lancer.`,
      );
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
  const finish = async () => {
    if (
      !selectedHeatId ||
      !confirm(
        "Terminer la course ? Les élèves encore à courir seront classés non-finisseurs.",
      )
    )
      return;
    try {
      await ownerApi("finish_heat", { heatId: selectedHeatId });
      await refreshOwner();
      await refreshEntries();
      toast.success("Course terminée. Les résultats sont prêts.");
    } catch (error) {
      toast.error(raceErrorMessage(error));
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

  const updateBranding = (patch: Partial<ResultBranding>) =>
    onChange({ ...event, resultBranding: { ...branding, ...patch } });
  const uploadLogo = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result);
      let palette: string[] = [];
      try {
        palette = await extractPalette(dataUrl);
      } catch {
        /* palette manuelle toujours disponible */
      }
      updateBranding({
        logoDataUrl: dataUrl,
        ...(palette[0] && !event.resultBranding?.primaryColor ? { primaryColor: palette[0] } : {}),
        ...(palette[1] && !event.resultBranding?.secondaryColor ? { secondaryColor: palette[1] } : {}),
        ...(palette[2] && !event.resultBranding?.accentColor ? { accentColor: palette[2] } : {}),
      });
      if (palette.length >= 2)
        toast.success("Logo ajouté. Les couleurs déjà choisies sont conservées.");
    };
    reader.readAsDataURL(file);
  };

  const printWindow = (title: string, body: string) => {
    const popup = window.open("", "_blank", "width=1000,height=800");
    if (!popup)
      return toast.error("Le navigateur a bloqué la fenêtre d’impression.");
    const primary = branding.primaryColor || "#1154b3",
      accent = branding.accentColor || "#173970";
    popup.document.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>@page{margin:14mm}body{font-family:Arial,sans-serif;color:#102347}header{display:flex;align-items:center;gap:18px;border-bottom:5px solid ${esc(accent)};padding-bottom:14px;margin-bottom:24px}header img{max-width:105px;max-height:85px;object-fit:contain}h1{margin:0;color:${esc(primary)}}h2{margin-top:24px;color:${esc(primary)}}p{color:#64748b}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{padding:8px;border-bottom:1px solid #dbe5f2;text-align:left}th{background:${esc(mixColor(primary, "#ffffff", 0.9))}}.podium{font-size:18px;font-weight:700}.note{padding:12px;border-radius:10px;background:${esc(mixColor(accent, "#ffffff", 0.9))};color:#334155}.footer{margin-top:30px;font-size:11px;color:#94a3b8}</style></head><body>${body}<div class="footer">Gestion Cross · Créé par L. RIGAUX</div></body></html>`,
    );
    popup.document.close();
    popup.focus();
    // Une temporisation fixe imprimait parfois avant que le logo ne soit chargé.
    void Promise.all(
      Array.from(popup.document.images).map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              image.addEventListener("load", () => resolve(), { once: true });
              image.addEventListener("error", () => resolve(), { once: true });
              window.setTimeout(resolve, 10000);
            }),
      ),
    )
      .then(() => popup.document.fonts.ready)
      .then(() => {
        if (!popup.closed) popup.print();
      });
  };
  const documentHeader = () => {
    const logo = branding.logoDataUrl;
    return `<header>${logo ? `<img src="${esc(logo)}" alt="Logo de l’événement">` : ""}<div><h1>${esc(branding.title || event.name)}</h1><p>${esc(branding.subtitle || "")}</p></div></header>`;
  };
  const printIndividual = () => {
    if (!selectedHeat) return;
    const sections = selectedGroups
      .map((group) => {
        const rows = group.entries
          .map(
            (entry) =>
              `<tr><td>${group.ranks.get(entry.id)?.rank ?? "—"}</td><td>${entry.finish_position ?? "—"}</td><td>${entry.participant.bib_number}</td><td><b>${esc(entry.participant.last_name.toUpperCase())}</b> ${esc(entry.participant.first_name)}</td><td>${esc(entry.participant.class_name)}</td><td>${esc({ finished: "Arrivé", registered: "À courir", absent: "Absent", exempt: "Dispensé", dnf: "Abandon" }[entry.status])}</td></tr>`,
          )
          .join("");
        return `<h2>Catégorie ${esc(group.category)}</h2><p>${group.finished} arrivé(s) sur ${group.entries.length} élève(s)</p><table><thead><tr><th>Rang catégorie</th><th>Arrivée commune</th><th>Dossard</th><th>Élève</th><th>Classe</th><th>Statut</th></tr></thead><tbody>${rows}</tbody></table>`;
      })
      .join("");
    printWindow(
      `${selectedHeat.name} - individuel`,
      `${documentHeader()}<h2>${esc(selectedHeat.name)} · Classements par niveau et sexe</h2><p class="note">Le rang d’arrivée est commun à tous. Chaque niveau a un classement filles et un classement garçons ; les classes du même niveau et du même sexe sont regroupées.</p>${sections}`,
    );
  };
  const printBackupSheet = () => {
    if (!selectedHeat || entriesLoading) return;
    const rows = Array.from({ length: 30 }, () => "<tr><td></td><td></td></tr>").join("");
    const page = `<section class="backup-page">${documentHeader()}<h2>${esc(selectedHeat.name)} · Feuille de secours</h2><table><thead><tr><th style="width:40%">Ordre d’arrivée</th><th>Numéro de dossard</th></tr></thead><tbody>${rows}</tbody></table></section>`;
    printWindow(`${selectedHeat.name} - feuille de secours`, `<style>@page{size:A4 portrait;margin:12mm}.backup-page header{margin-bottom:3mm;padding-bottom:3mm;border-bottom-width:2px;gap:4mm}.backup-page header img{max-width:22mm;max-height:18mm}.backup-page h1{font-size:19px}.backup-page h2{font-size:17px;margin:3mm 0 2mm}.backup-page p{font-size:11px;margin:2mm 0;color:#334155}.backup-page table{margin-top:3mm;table-layout:fixed}.backup-page th{font-size:12px;padding:2mm;border:1px solid #94a3b8}.backup-page td{height:6.8mm;padding:0 2mm;border:1px solid #94a3b8}body>.footer{display:none}</style>${page}`);
  };
  const printClasses = () => {
    if (!selectedHeat || !classResults.length) return;
    const rows = classResults
      .map(
        (result, index) =>
          `<tr><td class="podium">${index + 1}</td><td><b>${esc(result.className)}</b></td><td>${result.points}</td><td>${result.members}</td></tr>`,
      )
      .join("");
    const penalties = challengePenalties(entries);
    printWindow(
      `${selectedHeat.name} - challenge interclasses`,
      `${documentHeader()}<h2>${esc(selectedHeat.name)} · Challenge interclasses</h2><p class="note"><b>Tous les élèves comptent.</b> Absents et dispensés : dernier arrivé + 1, soit ${penalties.absent} point(s). Abandons (non-finisseurs) : dernier arrivé + 10, soit ${penalties.dnf} point(s). Le plus petit total gagne.</p><table><thead><tr><th>Rang</th><th>Classe</th><th>Points</th><th>Élèves comptabilisés</th></tr></thead><tbody>${rows}</tbody></table>`,
    );
  };

  const printOverall = () => {
    if (challengeLoading || challengeError || !overallResults.length) return;
    const rows = overallResults.map((result, index) => `<tr><td>${index + 1}</td><td>${esc(result.className)}</td><td>${result.points}</td><td>${result.girls}</td><td>${result.boys}</td><td>${result.unknown}</td><td>${result.members}</td><td>${result.courses}</td></tr>`).join("");
    printWindow(`${event.name} - challenge interclasses - ${challengeGradeLabel}`, `${documentHeader()}<h2>Challenge interclasses · ${esc(challengeGradeLabel)}</h2><p class="note">Filles et garçons d’une même classe sont additionnés, y compris dans des courses séparées. ${esc(challengeRule)} Seules les courses terminées avec challenge activé sont incluses.</p><table><thead><tr><th>Rang</th><th>Classe</th><th>Points cumulés</th><th>Filles</th><th>Garçons</th><th>Sexe non renseigné</th><th>Élèves comptabilisés</th><th>Courses</th></tr></thead><tbody>${rows}</tbody></table>`);
  };

  const downloadResults = async (
    kind: "individual" | "classes",
    all = false,
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
      await exportRaceResults(data, all ? event.name : courses[0].name, kind, all && kind === "classes" ? challengeGrade : "all");
      toast.success("Résultats téléchargés au format Excel.");
    } catch (error) {
      toast.error(raceErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const social = async (kind: "individual" | "classes", story = false, general = false) => {
    const socialClassResults = general ? overallResults : classResults;
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
    const penalties = challengePenalties(entries);
    drawSocialResults(ctx, {
      story,
      title: branding.title || event.name,
      subtitle: branding.subtitle || "",
      heading: kind === "classes" ? "CHALLENGE INTERCLASSES" : "CLASSEMENT INDIVIDUEL",
      category: general ? `${challengeGradeLabel} · filles + garçons` : kind === "individual" ? selectedGroups[0]?.category || "" : selectedHeat!.name,
      note: kind === "classes" ? general ? "Courses terminées · tous les élèves comptent" : `Absent / dispensé : ${penalties.absent} pts · abandon : ${penalties.dnf} pts` : selectedHeat!.name,
      primary: branding.primaryColor || "#1154b3",
      secondary: branding.secondaryColor || "#fed60b",
      rows: kind === "classes"
        ? socialClassResults.map((result, index) => ({ rank: index + 1, label: result.className, detail: `${result.points} pts` }))
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
    setSocialPreview({ dataUrl: canvas.toDataURL("image/png"), fileName, story });
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
      <nav aria-label="Rubriques des courses" className="grid grid-cols-2 gap-2 rounded-2xl border bg-white p-2 sm:grid-cols-4">
        {([{ value: "manage", label: "Gestion des courses" }, { value: "rankings", label: "Classements" }, { value: "arrival", label: "Ordre d’arrivée commun" }, { value: "results", label: "Résultats" }] as const).map(view => <Button key={view.value} variant={courseView === view.value ? "default" : "ghost"} aria-current={courseView === view.value ? "page" : undefined} className="h-auto min-h-11 whitespace-normal" onClick={() => setCourseView(view.value)}>{view.label}</Button>)}
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
        onEdit={editHeat}
        onOpen={(heat) => {
          setCourseView(heat.status === "draft" ? "manage" : "rankings");
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
      {courseView !== "manage" && (
        <section className="cross-panel flex flex-wrap items-center gap-3 p-4">
          <Label htmlFor="selected-course">Course à consulter</Label>
          <Select value={selectedHeatId ?? ""} onValueChange={id => { setEntriesLoading(true); setSelectedHeatId(id); }}>
            <SelectTrigger id="selected-course" className="w-full sm:w-96"><SelectValue placeholder="Choisir une course" /></SelectTrigger>
            <SelectContent>{heats.map(heat => <SelectItem key={heat.id} value={heat.id}>{heat.name} · {heat.status === "finished" ? "Terminée" : heat.status === "running" ? "En cours" : "Prête"}</SelectItem>)}</SelectContent>
          </Select>
        </section>
      )}
      {(courseView === "rankings" || courseView === "results") && (
        <section className="cross-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
            <div><h3 className="text-xl font-bold">Challenge interclasses général</h3><p className="mt-1 text-sm text-slate-500">Filles + garçons de la même classe, même dans des courses séparées. Cumul des {challengeCourses.length} course(s) terminée(s) avec challenge activé.</p><p className="mt-1 text-xs text-slate-500">{challengeRule}</p></div>
            <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={challengeLoading} onClick={() => setChallengeRevision(value => value + 1)}>Actualiser le challenge</Button>{courseView === "results" && <><Button disabled={challengeLoading || !!challengeError || !overallResults.length} onClick={printOverall}><Printer />Imprimer le challenge général</Button><Button variant="outline" disabled={loading || challengeLoading || !!challengeError || !overallResults.length} onClick={() => void downloadResults("classes", true)}><FileSpreadsheet />Excel général</Button><Button variant="outline" disabled={challengeLoading || !!challengeError || !overallResults.length} onClick={() => void social("classes", false, true)}><ImageIcon />Post général</Button><Button variant="outline" disabled={challengeLoading || !!challengeError || !overallResults.length} onClick={() => void social("classes", true, true)}><Download />Story générale</Button></>}</div>
          </div>
          <div className="border-b bg-slate-50/60 p-4">
            <div className="flex flex-wrap gap-2" aria-label="Filtrer le challenge interclasses par niveau">
              <Button size="sm" variant={challengeGrade === "all" ? "default" : "outline"} aria-pressed={challengeGrade === "all"} onClick={() => setChallengeGrade("all")}>Tous les niveaux</Button>
              {challengeGrades.map(grade => <Button key={grade} size="sm" variant={challengeGrade === grade ? "default" : "outline"} aria-pressed={challengeGrade === grade} onClick={() => setChallengeGrade(grade)}>{gradeLabels[grade] ?? grade}</Button>)}
            </div>
            <p className="mt-2 text-xs text-slate-500">{challengeGradeLabel} · Le filtre s’applique au tableau, à l’impression, à l’Excel général et aux posts et stories du challenge général. Filles et garçons restent additionnés.</p>
          </div>
          {challengeLoading ? <p className="p-5" role="status">Calcul du cumul filles et garçons…</p> : challengeError ? <p className="p-5 text-red-700" role="alert">{challengeError}</p> : !overallResults.length ? <p className="p-5 text-sm text-slate-500">{challengeGrade === "all" ? "Le challenge apparaîtra après la fin d’une course avec challenge activé." : `Aucun résultat de challenge pour le niveau ${challengeGradeLabel}.`}</p> : <div className="cross-scroll"><table className="cross-table w-full"><thead><tr className="bg-blue-50 text-left text-xs text-slate-500"><th>Rang</th><th>Classe</th><th>Points cumulés</th><th>Filles</th><th>Garçons</th><th>Sexe non renseigné</th><th>Élèves comptabilisés</th><th>Courses</th></tr></thead><tbody>{overallResults.map((result, index) => <tr className="border-t" key={classKey(result.className)}><td className="font-bold">{index + 1}</td><td className="font-bold">{result.className}</td><td>{result.points}</td><td>{result.girls}</td><td>{result.boys}</td><td>{result.unknown || "—"}</td><td>{result.members}</td><td>{result.courses}</td></tr>)}</tbody></table></div>}
        </section>
      )}
      {courseView === "results" && heats.some((heat) => heat.status === "finished") && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
          <p className="mr-auto text-sm font-bold text-emerald-800">
            Récupérer les résultats des courses terminées
          </p>
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => void downloadResults("individual", true)}
          >
            <FileSpreadsheet />
            Tous les classements
          </Button>
          {heats.some(
            (heat) => heat.status === "finished" && heat.challenge_enabled,
          ) && (
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => void downloadResults("classes", true)}
            >
              <FileSpreadsheet />
              Tous les challenges
            </Button>
          )}
        </section>
      )}

      {selectedHeat && (
        <>
          <section
            ref={selectedSectionRef}
            className="scroll-mt-24 cross-panel p-5 sm:p-6"
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
              <div className={`flex flex-wrap gap-2 ${courseView !== "manage" ? "hidden" : ""}`}>
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
                      className="bg-red-600 hover:bg-red-700"
                      onClick={() => void finish()}
                    >
                      Terminer
                    </Button>
                  </>
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
          {courseView === "results" && selectedHeat.status === "running" && <p className="cross-panel p-5 text-sm text-slate-500">Les impressions et visuels de cette course seront disponibles après sa clôture. Les classements provisoires sont dans « Classements ».</p>}

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

          {courseView === "rankings" && selectedHeat.status !== "draft" && (
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
                          </td>
                          <td className="p-3">
                            <div className="flex justify-end gap-1">
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

          {courseView === "results" && (
            <section className="cross-panel p-5 sm:p-6">
              <h3 className="text-lg font-bold">Feuille de secours · {selectedHeat.name}</h3>
              <p className="mt-1 text-sm text-slate-500">Une seule page A4 avec l’en-tête de la course et 30 lignes vierges : ordre d’arrivée et numéro de dossard. Imprimez plusieurs exemplaires si nécessaire.</p>
              <Button className="mt-4" variant="outline" disabled={entriesLoading} onClick={printBackupSheet}><Printer />Imprimer la feuille de secours</Button>
            </section>
          )}
          {courseView === "results" && selectedHeat.status === "finished" && (
            <section className="cross-panel p-5 sm:p-6">
              <p className="text-xs font-bold uppercase tracking-widest text-[#1154b3]">
                Résultats
              </p>
              <h3 className="mt-1 text-2xl font-bold">Imprimer ou publier</h3>
              <p className="mt-1 text-sm text-slate-500">
                Retrouvez les résultats de cette course en PDF, en Excel et en
                visuels.
              </p>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <article className="cross-panel p-5">
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
                  </div>
                </article>
                <article className="cross-panel p-5">
                  <Users className="text-[#1154b3]" />
                  <h4 className="mt-2 text-lg font-bold">
                    Challenge de cette course
                  </h4>
                  <p className="text-sm text-slate-500">
                    Filles et garçons de chaque classe sont additionnés dans cette course. Le cumul de toutes les courses figure dans le challenge général ci-dessus. Absents et dispensés : dernier +
                    1. Abandons (non-finisseurs) : dernier + 10.
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
              </div>
              {classResults.length > 0 && (
                <div className="mt-5 rounded-2xl bg-slate-50 p-4">
                  <div className="flex flex-wrap gap-3">
                    {classResults.slice(0, 5).map((result, index) => (
                      <Badge
                        key={result.className}
                        className="px-3 py-1.5 text-sm"
                      >
                        {index + 1}. {result.className} · {result.points} pts
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
                ? "Modifier la course préparée"
                : "Préparer une course"}
            </DialogTitle>
            <DialogDescription>
              Enregistrez les classes et les réglages maintenant. La course
              attendra votre clic sur « Lancer » le jour du cross.
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
                <Select value={sexFilter} onValueChange={setSexFilter}>
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
            <div className="sticky top-0 z-10 -mx-1 bg-white pb-3 pt-1">
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
            <div className="space-y-5">
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
                loading || !heatName.trim() || chosenParticipants.length === 0
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

      <Dialog open={!!socialPreview} onOpenChange={open => { if (!open) setSocialPreview(undefined); }}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col sm:max-w-2xl">
          <DialogHeader><DialogTitle>Aperçu {socialPreview?.story ? "de la story" : "de la publication"}</DialogTitle><DialogDescription>Vérifiez le logo et le classement avant de télécharger le visuel.</DialogDescription></DialogHeader>
          {socialPreview && <div className="min-h-0 overflow-auto rounded-xl bg-slate-100 p-3"><Image unoptimized src={socialPreview.dataUrl} alt="Visuel des résultats sur fond blanc" width={1080} height={socialPreview.story ? 1920 : 1080} className="mx-auto h-auto max-h-[65dvh] w-auto max-w-full bg-white object-contain" /></div>}
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

      <Dialog open={brandingOpen} onOpenChange={setBrandingOpen}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>En-tête & identité visuelle</DialogTitle>
            <DialogDescription>
              Cette identité est utilisée sur les PDF de résultats, les posts,
              les stories et dans l’en-tête du cross.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Titre affiché</Label>
              <Input
                value={branding.title}
                onChange={(event) =>
                  updateBranding({ title: event.target.value })
                }
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Sous-titre</Label>
              <Input
                value={branding.subtitle}
                onChange={(event) =>
                  updateBranding({ subtitle: event.target.value })
                }
                placeholder="Ex. Saint-Lô · 2026"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Logo de la course</Label>
              <Input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={(event) => uploadLogo(event.target.files?.[0])}
              />
              <p className="mt-1 text-xs text-slate-500">
                Ce logo sera utilisé sur les publications, les stories et les feuilles imprimées. Les couleurs déjà choisies sont conservées ; les couleurs non définies sont détectées à l’import. Vous pouvez ensuite les ajuster.
              </p>
            </div>
            {branding.logoDataUrl && (
              <div className="sm:col-span-2 flex justify-center rounded-2xl bg-slate-50 p-4">
                <Image
                  src={branding.logoDataUrl}
                  alt="Logo de la course"
                  width={240}
                  height={176}
                  unoptimized
                  className="max-h-44 max-w-full object-contain"
                />
              </div>
            )}
            <div>
              <Label>Couleur principale</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  type="color"
                  value={branding.primaryColor}
                  onChange={(event) =>
                    updateBranding({ primaryColor: event.target.value })
                  }
                  className="h-11 w-16 p-1"
                />
                <Input
                  value={branding.primaryColor}
                  onChange={(event) =>
                    updateBranding({ primaryColor: event.target.value })
                  }
                />
              </div>
            </div>
            <div>
              <Label>Couleur secondaire</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  type="color"
                  value={branding.secondaryColor}
                  onChange={(event) =>
                    updateBranding({ secondaryColor: event.target.value })
                  }
                  className="h-11 w-16 p-1"
                />
                <Input
                  value={branding.secondaryColor}
                  onChange={(event) =>
                    updateBranding({ secondaryColor: event.target.value })
                  }
                />
              </div>
            </div>
            <div>
              <Label>Couleur d’accent</Label>
              <div className="mt-1 flex gap-2">
                <Input
                  type="color"
                  value={branding.accentColor}
                  onChange={(event) =>
                    updateBranding({ accentColor: event.target.value })
                  }
                  className="h-11 w-16 p-1"
                />
                <Input
                  value={branding.accentColor}
                  onChange={(event) =>
                    updateBranding({ accentColor: event.target.value })
                  }
                />
              </div>
            </div>
            <div
              className="rounded-2xl p-4 text-white"
              style={{
                background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.accentColor})`,
              }}
            >
              <p className="font-bold">Aperçu des couleurs</p>
              <p className="text-sm text-white/80">
                Les exports reprendront cette palette.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setBrandingOpen(false)}>Terminer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              Absents et dispensés : dernier arrivé + 1. Abandons
              (non-finisseurs) : dernier arrivé + 10.
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
