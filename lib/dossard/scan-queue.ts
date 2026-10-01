/** File FIFO sans données nominatives. Une écriture échouée ne retire jamais un scan. */
export class ScanQueue {
  private items: string[];
  constructor(
    private storage: Pick<Storage, "getItem" | "setItem">,
    private key: string,
  ) {
    const raw = storage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (
      !Array.isArray(parsed) ||
      parsed.some(
        (item) => typeof item !== "string" || !item || item.length > 40,
      )
    )
      throw new Error(
        "File de scans locale invalide. Ne fermez pas le poste ; contactez l’organisateur.",
      );
    this.items = parsed;
  }
  get length() {
    return this.items.length;
  }
  get first() {
    return this.items[0];
  }
  snapshot() {
    return [...this.items];
  }
  private save(next: string[]) {
    this.storage.setItem(this.key, JSON.stringify(next));
    this.items = next;
  }
  add(code: string) {
    if (!code || code.length > 40) throw new Error("Code de dossard invalide.");
    this.save([...this.items, code]);
  }
  complete() {
    this.save(this.items.slice(1));
  }
  clear() {
    this.save([]);
  }
}
