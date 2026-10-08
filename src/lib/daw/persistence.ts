import type { Peaks } from "./peaks.ts";
import type { Project } from "./types.ts";

/**
 * Browser-local persistence on IndexedDB. Nothing is uploaded anywhere.
 *
 *  projects : { id, name, createdAt, updatedAt, project }
 *  analysis : { id (= project id), analysis }       structured-clone (typed arrays ok)
 *  assets   : { projectId, assetId, blob, name }     original audio bytes
 *  peaks    : { projectId, assetId, peaks }          waveform cache
 */

const DB_NAME = "lanes-studio";
const DB_VERSION = 1;
const LAST_KEY = "lanes:last-project";

export interface ProjectSummary {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  duration: number;
  tracks: number;
}

function idb(): IDBFactory {
  const f = (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  if (!f) throw new Error("This browser has no IndexedDB, so projects cannot be saved.");
  return f;
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function resetDbConnection(): void {
  dbPromise = null;
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = idb().open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("projects")) db.createObjectStore("projects", { keyPath: "id" });
      if (!db.objectStoreNames.contains("analysis")) db.createObjectStore("analysis", { keyPath: "id" });
      if (!db.objectStoreNames.contains("assets")) {
        db.createObjectStore("assets", { keyPath: ["projectId", "assetId"] });
      }
      if (!db.objectStoreNames.contains("peaks")) {
        db.createObjectStore("peaks", { keyPath: ["projectId", "assetId"] });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error ?? new Error("Could not open the project database."));
    };
    req.onblocked = () => {
      dbPromise = null;
      reject(new Error("The project database is blocked by another tab. Close other LANES tabs and retry."));
    };
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Storage write failed."));
    tx.onabort = () => reject(tx.error ?? new Error("Storage write was aborted (disk full?)."));
  });
}

function explain(e: unknown): Error {
  if (e instanceof DOMException && e.name === "QuotaExceededError") {
    return new Error("Browser storage is full. Delete old projects to free space.");
  }
  return e instanceof Error ? e : new Error(String(e));
}

export async function saveProject(project: Project, analysis?: unknown): Promise<number> {
  try {
    const db = await openDb();
    const now = Date.now();
    const saved: Project = { ...project, updatedAt: now };
    const tx = db.transaction(["projects", "analysis"], "readwrite");
    tx.objectStore("projects").put({
      id: saved.id,
      name: saved.name,
      createdAt: saved.createdAt,
      updatedAt: now,
      duration: projectDuration(saved),
      trackCount: saved.tracks.length,
      project: saved,
    });
    if (analysis !== undefined) tx.objectStore("analysis").put({ id: saved.id, analysis });
    await done(tx);
    setLastProjectId(saved.id);
    void requestPersistence();
    return now;
  } catch (e) {
    throw explain(e);
  }
}

function projectDuration(p: Project): number {
  let end = 0;
  for (const t of p.tracks) for (const c of t.clips) end = Math.max(end, c.start + c.duration);
  return end;
}

export async function loadProject(
  id: string,
): Promise<{ project: Project; analysis: unknown } | null> {
  const db = await openDb();
  const tx = db.transaction(["projects", "analysis"], "readonly");
  const rec = (await wrap(tx.objectStore("projects").get(id))) as { project: Project } | undefined;
  if (!rec) return null;
  const a = (await wrap(tx.objectStore("analysis").get(id))) as { analysis: unknown } | undefined;
  return { project: rec.project, analysis: a?.analysis };
}

export async function listProjects(): Promise<ProjectSummary[]> {
  const db = await openDb();
  const rows = (await wrap(db.transaction("projects").objectStore("projects").getAll())) as Array<{
    id: string;
    name: string;
    createdAt: number;
    updatedAt: number;
    duration?: number;
    trackCount?: number;
  }>;
  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      duration: r.duration ?? 0,
      tracks: r.trackCount ?? 0,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProject(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["projects", "analysis", "assets", "peaks"], "readwrite");
  tx.objectStore("projects").delete(id);
  tx.objectStore("analysis").delete(id);
  const range = IDBKeyRange.bound([id, ""], [id, "\uffff"]);
  tx.objectStore("assets").delete(range);
  tx.objectStore("peaks").delete(range);
  await done(tx);
  if (getLastProjectId() === id) setLastProjectId(null);
}

export async function saveAsset(projectId: string, assetId: string, blob: Blob, name: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction("assets", "readwrite");
    tx.objectStore("assets").put({ projectId, assetId, blob, name });
    await done(tx);
  } catch (e) {
    throw explain(e);
  }
}

export async function loadAsset(projectId: string, assetId: string): Promise<Blob | null> {
  const db = await openDb();
  const rec = (await wrap(db.transaction("assets").objectStore("assets").get([projectId, assetId]))) as
    | { blob: Blob }
    | undefined;
  return rec?.blob ?? null;
}

export async function listAssetIds(projectId: string): Promise<string[]> {
  const db = await openDb();
  const keys = (await wrap(
    db
      .transaction("assets")
      .objectStore("assets")
      .getAllKeys(IDBKeyRange.bound([projectId, ""], [projectId, "\uffff"])),
  )) as Array<[string, string]>;
  return keys.map((k) => k[1]);
}

export async function savePeaks(projectId: string, assetId: string, peaks: Peaks): Promise<void> {
  const db = await openDb();
  const tx = db.transaction("peaks", "readwrite");
  tx.objectStore("peaks").put({ projectId, assetId, peaks });
  await done(tx);
}

export async function loadPeaks(projectId: string, assetId: string): Promise<Peaks | null> {
  const db = await openDb();
  const rec = (await wrap(db.transaction("peaks").objectStore("peaks").get([projectId, assetId]))) as
    | { peaks: Peaks }
    | undefined;
  return rec?.peaks ?? null;
}

/** Copy a project under a new id, including its audio and waveform cache (Save As). */
export async function copyProjectData(fromId: string, toProject: Project, analysis?: unknown): Promise<void> {
  const ids = await listAssetIds(fromId);
  for (const assetId of ids) {
    const blob = await loadAsset(fromId, assetId);
    if (blob) await saveAsset(toProject.id, assetId, blob, toProject.assets[assetId]?.name ?? assetId);
    const pk = await loadPeaks(fromId, assetId);
    if (pk) await savePeaks(toProject.id, assetId, pk);
  }
  await saveProject(toProject, analysis);
}

/** Asset ids the project references that have no stored audio (e.g. after importing a project file). */
export async function missingAssets(project: Project): Promise<string[]> {
  const have = new Set(await listAssetIds(project.id));
  return Object.keys(project.assets).filter((id) => !have.has(id));
}

export function getLastProjectId(): string | null {
  try {
    return globalThis.localStorage?.getItem(LAST_KEY) ?? null;
  } catch {
    return null;
  }
}

export function setLastProjectId(id: string | null): void {
  try {
    if (id) globalThis.localStorage?.setItem(LAST_KEY, id);
    else globalThis.localStorage?.removeItem(LAST_KEY);
  } catch {
    /* private mode */
  }
}

async function requestPersistence(): Promise<void> {
  try {
    const s = (globalThis as { navigator?: Navigator }).navigator?.storage;
    if (s?.persist && !(await s.persisted?.())) await s.persist();
  } catch {
    /* best effort */
  }
}
