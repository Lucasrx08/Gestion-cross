"use client";
import { useEffect, useRef } from "react";
import { createRaceEvent } from "./defaults";
import type { RaceEvent } from "./types";

interface ToolContext { registerTool(tool: { name: string; title: string; description: string; inputSchema: object; annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean }; execute(input: unknown): unknown | Promise<unknown> }, options?: { signal?: AbortSignal }): void | Promise<void>; }
declare global { interface Document { readonly modelContext?: ToolContext; } }

export function useDossardWebMcp(events: RaceEvent[], onCreate: (event: RaceEvent) => Promise<void>, onOpen: (event: RaceEvent) => void) {
  const eventsRef = useRef(events);
  const createRef = useRef(onCreate);
  const openRef = useRef(onOpen);
  useEffect(() => {
    eventsRef.current = events;
    createRef.current = onCreate;
    openRef.current = onOpen;
  }, [events, onCreate, onOpen]);
  useEffect(() => {
    const context = document.modelContext; if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const register = (tool: Parameters<ToolContext["registerTool"]>[0]) => { try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => undefined); } catch { /* unsupported implementation */ } };
    register({ name: "list_race_events", title: "Lister les événements", description: "Liste les événements enregistrés sur cet appareil sans retourner de noms de participants.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: false }, execute: () => ({ events: eventsRef.current.map((event) => ({ id: event.id, name: event.name, year: event.year, location: event.location, date: event.date, participantCount: event.participants.length })) }) });
    register({ name: "create_race_event", title: "Créer une course", description: "Crée et ouvre un nouvel événement de course local.", inputSchema: { type: "object", properties: { name: { type: "string", minLength: 1 }, year: { type: "integer", minimum: 2020, maximum: 2100 }, location: { type: "string" }, date: { type: "string", pattern: "^$|^[0-9]{4}-[0-9]{2}-[0-9]{2}$" } }, required: ["name"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, async execute(input) { const values = input as Record<string, unknown>; if (typeof values.name !== "string" || !values.name.trim()) throw new Error("Le nom est obligatoire."); const year = typeof values.year === "number" ? values.year : new Date().getFullYear(); if (year < 2020 || year > 2100) throw new Error("Année invalide."); const event = createRaceEvent({ name: values.name, year, location: typeof values.location === "string" ? values.location : "", date: typeof values.date === "string" ? values.date : "" }); await createRef.current(event); return { id: event.id, name: event.name, status: "created_and_opened" }; } });
    register({ name: "open_race_event", title: "Ouvrir une course", description: "Ouvre un événement local existant à partir de son identifiant.", inputSchema: { type: "object", properties: { eventId: { type: "string", minLength: 1 } }, required: ["eventId"], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false }, execute(input) { const eventId = (input as { eventId?: unknown }).eventId; if (typeof eventId !== "string") throw new Error("Identifiant requis."); const event = eventsRef.current.find((item) => item.id === eventId); if (!event) throw new Error("Événement introuvable."); openRef.current(event); return { id: event.id, name: event.name, status: "opened" }; } });
    return () => lifecycle.abort();
  }, []);
}
