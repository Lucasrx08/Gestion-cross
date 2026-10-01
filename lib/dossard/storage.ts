import type {
  BibTemplate,
  LayoutElement,
  Participant,
  RaceEvent,
} from "./types";
const DB_NAME = "dossard-pro-v1",
  DB_VERSION = 1,
  EVENTS_STORE = "events",
  TEMPLATES_STORE = "templates";
let databasePromise: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(EVENTS_STORE))
        db.createObjectStore(EVENTS_STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(TEMPLATES_STORE))
        db.createObjectStore(TEMPLATES_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => {
        request.result.close();
        databasePromise = undefined;
      };
      resolve(request.result);
    };
    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error ?? new Error("Stockage local indisponible."));
    };
    request.onblocked = () => {
      databasePromise = undefined;
      reject(
        new Error("Fermez les autres onglets de Gestion Cross puis réessayez."),
      );
    };
  });
  return databasePromise;
}
function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = request.transaction;
    if (!transaction) return reject(new Error("Transaction absente."));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = () =>
      reject(
        transaction.error ??
          request.error ??
          new Error("Enregistrement interrompu."),
      );
    transaction.onerror = () =>
      reject(
        transaction.error ??
          request.error ??
          new Error("Stockage local indisponible."),
      );
  });
}
async function getStore(mode: IDBTransactionMode, name: string) {
  const db = await openDatabase();
  return db.transaction(name, mode).objectStore(name);
}
const allowedElements = new Set([
  "number",
  "lastName",
  "firstName",
  "fullName",
  "className",
  "sex",
  "barcode",
  "qrcode",
  "freeText",
]);
function cleanParticipant(p: Participant): Participant {
  return {
    id: p.id,
    sourceRow: p.sourceRow,
    bibNumber: p.bibNumber,
    technicalId: p.technicalId,
    lastName: p.lastName,
    firstName: p.firstName,
    className: p.className,
    sex: p.sex || undefined,
    issues: p.issues ?? [],
  };
}
function cleanTemplate(template: BibTemplate): BibTemplate {
  return {
    ...template,
    elements: template.elements
      .filter((element) => allowedElements.has(element.type))
      .map((element) => ({ ...element }) as LayoutElement),
  };
}
function cleanEvent(event: RaceEvent): RaceEvent {
  return {
    ...event,
    participants: event.participants.map(cleanParticipant),
    template: cleanTemplate(event.template),
  };
}
export async function listEvents(): Promise<RaceEvent[]> {
  const items = await result(
    (await getStore("readonly", EVENTS_STORE)).getAll() as IDBRequest<
      RaceEvent[]
    >,
  );
  return items
    .map(cleanEvent)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function saveEvent(event: RaceEvent): Promise<RaceEvent> {
  const saved = { ...cleanEvent(event), updatedAt: new Date().toISOString() };
  await result((await getStore("readwrite", EVENTS_STORE)).put(saved));
  return saved;
}
export async function deleteEvent(id: string) {
  await result((await getStore("readwrite", EVENTS_STORE)).delete(id));
}
export async function listTemplates(): Promise<BibTemplate[]> {
  const items = await result(
    (await getStore("readonly", TEMPLATES_STORE)).getAll() as IDBRequest<
      BibTemplate[]
    >,
  );
  return items
    .map(cleanTemplate)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function saveTemplate(
  template: BibTemplate,
): Promise<BibTemplate> {
  const saved = {
    ...cleanTemplate(template),
    updatedAt: new Date().toISOString(),
  };
  await result((await getStore("readwrite", TEMPLATES_STORE)).put(saved));
  return saved;
}
export async function restoreStoredData(
  events: RaceEvent[],
  templates: BibTemplate[],
) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([EVENTS_STORE, TEMPLATES_STORE], "readwrite");
    tx.oncomplete = () => resolve();
    tx.onabort = () =>
      reject(
        tx.error ??
          new Error("Restauration interrompue : aucune donnée restaurée."),
      );
    tx.onerror = () =>
      reject(tx.error ?? new Error("Restauration impossible."));
    events.forEach((event) =>
      tx.objectStore(EVENTS_STORE).put(cleanEvent(event)),
    );
    templates.forEach((template) =>
      tx.objectStore(TEMPLATES_STORE).put(cleanTemplate(template)),
    );
  });
}
