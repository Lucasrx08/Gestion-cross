"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { Toaster, toast } from "sonner";
import { Dashboard } from "@/components/dossard/dashboard";
import { EventWorkspace } from "@/components/dossard/event-workspace";
import { RaceStation } from "@/components/dossard/race-station";
import { deleteEvent, listEvents, listTemplates, saveEvent, saveTemplate } from "@/lib/dossard/storage";
import type { BibTemplate, RaceEvent } from "@/lib/dossard/types";
import { useDossardWebMcp } from "@/lib/dossard/webmcp";
import { publicAsset } from "@/lib/dossard/assets";

export default function Home() {
  const [events, setEvents] = useState<RaceEvent[]>([]);
  const [templates, setTemplates] = useState<BibTemplate[]>([]);
  const [active, setActive] = useState<RaceEvent>();
  const [loading, setLoading] = useState(true);
  const [stationCode, setStationCode] = useState("");
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");
  const activeRef = useRef<RaceEvent | undefined>(undefined);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setStationCode((params.get("station") ?? "").trim().toUpperCase());
    Promise.all([listEvents(), listTemplates()])
      .then(([loadedEvents, loadedTemplates]) => {
        setEvents(loadedEvents);
        setTemplates(loadedTemplates);
      })
      .catch(() => toast.error("Le stockage local n’a pas pu être ouvert."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    activeRef.current = active;
    if (!active) return;
    const timer = setTimeout(() => {
      saveEvent(active)
        .then((saved) => {
          setEvents((items) => [saved, ...items.filter((event) => event.id !== saved.id)]);
          setSaveStatus("saved");
        })
        .catch(() => setSaveStatus("error"));
    }, 550);
    return () => clearTimeout(timer);
  }, [active]);

  const openEvent = (event: RaceEvent) => {
    activeRef.current = event;
    setSaveStatus("saved");
    setActive(event);
  };

  const changeActive = (event: RaceEvent) => {
    activeRef.current = event;
    setSaveStatus("saving");
    setActive(event);
  };

  const createAndOpen = async (event: RaceEvent) => {
    const saved = await saveEvent(event);
    setEvents((items) => [saved, ...items]);
    openEvent(saved);
  };

  useDossardWebMcp(events, createAndOpen, openEvent);

  const saveTemplateAndRefresh = async (template: BibTemplate) => {
    const saved = await saveTemplate(template);
    setTemplates((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
  };

  if (stationCode) {
    return <><RaceStation stationCode={stationCode} onLeave={() => {
      const url = new URL(window.location.href);
      url.searchParams.delete("station");
      window.history.replaceState({}, "", url.toString());
      setStationCode("");
    }} /><Toaster position="bottom-right" richColors closeButton /></>;
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center text-center">
        <div>
          <span className="mx-auto grid size-16 place-items-center rounded-[1.4rem] bg-primary text-white shadow-xl shadow-blue-900/15">
            <Loader2 className="animate-spin" />
          </span>
          <p className="mt-4 font-bold text-[#173970]">Préparation de la ligne de départ…</p>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen text-[#102347]">
      {!active && (
        <header className="border-b border-blue-100 bg-white/90 backdrop-blur">
          <div className="mx-auto flex min-h-20 max-w-[1500px] items-center gap-4 px-4 py-2 sm:px-6 lg:px-10">
            <Image
              src={publicAsset("/logo-bon-sauveur-cross.png")}
              alt="Logo Bon Sauveur Cross"
              width={80}
              height={80}
              priority
              className="size-16 rounded-2xl bg-white object-contain shadow-sm sm:size-20"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-black leading-tight text-[#1154b3] sm:text-xl">Bon Sauveur Cross</p>
              <p className="flex items-center gap-1.5 text-sm font-bold text-[#66738b]">
                <Flag className="size-4 text-[#fed60b]" /> Dossards · Courses · Classements
              </p>
            </div>
            <span className="hidden rounded-full bg-[#fff3a9] px-4 py-2 text-sm font-black text-[#173970] sm:block">Saint-Lô</span>
          </div>
        </header>
      )}

      {active ? (
        <EventWorkspace
          event={active}
          templates={templates}
          saveStatus={saveStatus}
          onChange={changeActive}
          onSaveTemplate={saveTemplateAndRefresh}
          onBack={async () => {
            const current = activeRef.current;
            if (current) {
              const saved = await saveEvent(current);
              setEvents((items) => [saved, ...items.filter((event) => event.id !== saved.id)]);
            }
            activeRef.current = undefined;
            setActive(undefined);
            setSaveStatus("saved");
          }}
        />
      ) : (
        <Dashboard
          events={events}
          templates={templates}
          onCreate={createAndOpen}
          onOpen={openEvent}
          onDelete={async (event) => {
            await deleteEvent(event.id);
            setEvents((items) => items.filter((item) => item.id !== event.id));
            toast.success("Événement supprimé.");
          }}
        />
      )}
      <Toaster position="bottom-right" richColors closeButton />
    </div>
  );
}
