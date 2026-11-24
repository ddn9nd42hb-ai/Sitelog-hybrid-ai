/**
 * Tiny persistence layer.
 *
 * IndexedDB when the browser has it (so a phone can close the tab on site and
 * come back), an in-memory fallback when it does not (tests, exotic browsers).
 * Nothing here talks to the network — the app is offline-first by design.
 */
import type { Finding, TraceEntry } from "../lib/types";

const DB_NAME = "sitelog";
const DB_VERSION = 1;
const STORE_FINDINGS = "findings";
const STORE_TRACES = "traces";
const STORE_META = "meta";

interface MetaRow {
  key: string;
  value: unknown;
}

export interface Store {
  listFindings(projectId: string): Promise<Finding[]>;
  saveFinding(finding: Finding): Promise<void>;
  deleteFinding(id: string): Promise<void>;
  listTraces(): Promise<TraceEntry[]>;
  addTrace(trace: TraceEntry): Promise<void>;
  clearProject(projectId: string): Promise<void>;
  getMeta<T>(key: string): Promise<T | undefined>;
  setMeta(key: string, value: unknown): Promise<void>;
}

type Row = Finding | TraceEntry | MetaRow;

class MemoryStore implements Store {
  private findings: Finding[] = [];
  private traces: TraceEntry[] = [];
  private meta = new Map<string, unknown>();

  async listFindings(projectId: string) {
    return this.findings.filter((f) => f.projectId === projectId).sort((a, b) => b.createdAt - a.createdAt);
  }
  async saveFinding(finding: Finding) {
    const i = this.findings.findIndex((f) => f.id === finding.id);
    if (i >= 0) this.findings[i] = finding;
    else this.findings.push(finding);
  }
  async deleteFinding(id: string) {
    this.findings = this.findings.filter((f) => f.id !== id);
  }
  async listTraces() {
    return [...this.traces].sort((a, b) => b.at - a.at).slice(0, 40);
  }
  async addTrace(trace: TraceEntry) {
    this.traces.push(trace);
  }
  async clearProject(projectId: string) {
    this.findings = this.findings.filter((f) => f.projectId !== projectId);
    this.traces = [];
  }
  async getMeta<T>(key: string) {
    return this.meta.get(key) as T | undefined;
  }
  async setMeta(key: string, value: unknown) {
    this.meta.set(key, value);
  }
}

class IdbStore implements Store {
  constructor(private readonly db: IDBDatabase) {}

  private tx(store: string, mode: IDBTransactionMode = "readonly"): IDBObjectStore {
    return this.db.transaction(store, mode).objectStore(store);
  }

  private request<T>(req: IDBRequest): Promise<T> {
    return new Promise((resolve, reject) => {
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  }

  async listFindings(projectId: string): Promise<Finding[]> {
    const rows = await this.request<Finding[]>(this.tx(STORE_FINDINGS).getAll());
    return rows.filter((f) => f.projectId === projectId).sort((a, b) => b.createdAt - a.createdAt);
  }

  async saveFinding(finding: Finding): Promise<void> {
    await this.write(STORE_FINDINGS, finding);
  }

  async deleteFinding(id: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const req = this.tx(STORE_FINDINGS, "readwrite").delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async listTraces(): Promise<TraceEntry[]> {
    const rows = await this.request<TraceEntry[]>(this.tx(STORE_TRACES).getAll());
    return rows.sort((a, b) => b.at - a.at).slice(0, 40);
  }

  async addTrace(trace: TraceEntry): Promise<void> {
    await this.write(STORE_TRACES, trace);
  }

  async clearProject(projectId: string): Promise<void> {
    const findings = await this.listFindings(projectId);
    for (const f of findings) await this.deleteFinding(f.id);
    await this.clear(STORE_TRACES);
  }

  async getMeta<T>(key: string): Promise<T | undefined> {
    const row = await this.request<MetaRow | undefined>(this.tx(STORE_META).get(key));
    return row?.value as T | undefined;
  }

  async setMeta(key: string, value: unknown): Promise<void> {
    await this.write(STORE_META, { key, value });
  }

  private async write(store: string, row: Row): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const req = this.tx(store, "readwrite").put(row);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  private async clear(store: string): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const req = this.tx(store, "readwrite").clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

let cached: Promise<Store> | null = null;

export function getStore(): Promise<Store> {
  if (!cached) {
    cached = (async () => {
      if (typeof indexedDB === "undefined") return new MemoryStore();
      try {
        const db = await openDatabase();
        return new IdbStore(db);
      } catch {
        return new MemoryStore();
      }
    })();
  }
  return cached;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_FINDINGS)) {
        db.createObjectStore(STORE_FINDINGS, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_TRACES)) {
        db.createObjectStore(STORE_TRACES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Test seam. */
export function resetStoreForTests(): void {
  cached = null;
}
