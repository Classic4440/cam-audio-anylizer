import type { Project } from "./types.ts";
import { allClipIds } from "./ops.ts";

export interface StoreState {
  project: Project | null;
  selection: string[];
  canUndo: boolean;
  canRedo: boolean;
  /** Edits since the last successful save. */
  dirty: boolean;
  lastSavedAt: number | null;
  /** Bumps on every project change so effects can cheaply depend on it. */
  revision: number;
}

type Listener = () => void;

const HISTORY_LIMIT = 150;

/**
 * Framework-free project store with undo/redo and drag "gestures".
 *
 * History holds previous immutable Project references, so it costs almost nothing:
 * unchanged tracks and clips are shared between snapshots. Large data (audio,
 * analysis arrays) never lives here.
 */
export class ProjectStore {
  private state: StoreState = {
    project: null,
    selection: [],
    canUndo: false,
    canRedo: false,
    dirty: false,
    lastSavedAt: null,
    revision: 0,
  };
  private past: Project[] = [];
  private future: Project[] = [];
  private gestureBase: Project | null = null;
  private listeners = new Set<Listener>();

  getState = (): StoreState => this.state;

  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };

  private set(patch: Partial<StoreState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private pruneSelection(project: Project | null, sel: string[]): string[] {
    if (!project || sel.length === 0) return sel.length ? [] : sel;
    const ids = allClipIds(project);
    const next = sel.filter((id) => ids.has(id));
    return next.length === sel.length ? sel : next;
  }

  /** Replace the whole project (open/new). Clears history. */
  open(project: Project, opts: { dirty?: boolean; savedAt?: number | null } = {}): void {
    this.past = [];
    this.future = [];
    this.gestureBase = null;
    this.set({
      project,
      selection: [],
      canUndo: false,
      canRedo: false,
      dirty: opts.dirty ?? false,
      lastSavedAt: opts.savedAt ?? null,
      revision: this.state.revision + 1,
    });
  }

  close(): void {
    this.open(null as unknown as Project);
    this.set({ project: null });
  }

  select(ids: string[], mode: "set" | "add" | "toggle" = "set"): void {
    const cur = this.state.selection;
    let next: string[];
    if (mode === "set") next = ids;
    else if (mode === "add") next = [...new Set([...cur, ...ids])];
    else {
      const s = new Set(cur);
      for (const id of ids) {
        if (s.has(id)) s.delete(id);
        else s.add(id);
      }
      next = [...s];
    }
    if (next.length === cur.length && next.every((v, i) => v === cur[i])) return;
    this.set({ selection: next });
  }

  /** Apply an undoable edit. `fn` must be pure; return the same object for a no-op. */
  commit(fn: (p: Project) => Project, opts: { select?: (p: Project) => string[] | null } = {}): void {
    const cur = this.state.project;
    if (!cur) return;
    if (this.gestureBase) this.endGesture();
    const next = fn(cur);
    if (next === cur) return;
    this.past.push(cur);
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
    const picked = opts.select?.(next);
    this.set({
      project: next,
      selection: picked ?? this.pruneSelection(next, this.state.selection),
      canUndo: true,
      canRedo: false,
      dirty: true,
      revision: this.state.revision + 1,
    });
  }

  /** Begin a drag: edits via updateGesture are live but collapse into one undo step. */
  beginGesture(): void {
    if (this.gestureBase || !this.state.project) return;
    this.gestureBase = this.state.project;
  }

  /** Recompute the project from the gesture's starting point (so drags never accumulate error). */
  updateGesture(fn: (base: Project) => Project): void {
    const base = this.gestureBase;
    if (!base) return;
    const next = fn(base);
    if (next === this.state.project) return;
    this.set({
      project: next,
      selection: this.pruneSelection(next, this.state.selection),
      revision: this.state.revision + 1,
    });
  }

  endGesture(): void {
    const base = this.gestureBase;
    this.gestureBase = null;
    const cur = this.state.project;
    if (!base || !cur || cur === base) return;
    this.past.push(base);
    if (this.past.length > HISTORY_LIMIT) this.past.shift();
    this.future = [];
    this.set({ canUndo: true, canRedo: false, dirty: true });
  }

  cancelGesture(): void {
    const base = this.gestureBase;
    this.gestureBase = null;
    if (base && this.state.project !== base) {
      this.set({ project: base, revision: this.state.revision + 1 });
    }
  }

  undo(): void {
    if (this.gestureBase) this.endGesture();
    const cur = this.state.project;
    const prev = this.past.pop();
    if (!cur || !prev) return;
    this.future.push(cur);
    this.set({
      project: prev,
      selection: this.pruneSelection(prev, this.state.selection),
      canUndo: this.past.length > 0,
      canRedo: true,
      dirty: true,
      revision: this.state.revision + 1,
    });
  }

  redo(): void {
    if (this.gestureBase) this.endGesture();
    const cur = this.state.project;
    const next = this.future.pop();
    if (!cur || !next) return;
    this.past.push(cur);
    this.set({
      project: next,
      selection: this.pruneSelection(next, this.state.selection),
      canUndo: true,
      canRedo: this.future.length > 0,
      dirty: true,
      revision: this.state.revision + 1,
    });
  }

  markSaved(at: number): void {
    this.set({ dirty: false, lastSavedAt: at });
  }
}
