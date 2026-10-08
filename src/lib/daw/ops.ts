import { newId } from "./ids.ts";
import { clamp, clipEnd } from "./timeline-math.ts";
import type {
  AudioClip,
  Project,
  SnapMode,
  TimelineClip,
  Track,
  TrackKind,
} from "./types.ts";
import { clipFitsTrack } from "./types.ts";

/**
 * Pure, immutable edit operations on a Project. Every function returns the same
 * object reference when nothing changed, so callers can cheaply detect no-ops
 * and the undo history never records empty edits.
 */

export const MIN_CLIP_SECONDS = 0.02;
const EPS = 1e-6;

export interface Found {
  track: Track;
  clip: TimelineClip;
  index: number;
}

export function findClip(p: Project, id: string): Found | null {
  for (const track of p.tracks) {
    const index = track.clips.findIndex((c) => c.id === id);
    if (index >= 0) return { track, clip: track.clips[index]!, index };
  }
  return null;
}

export function allClipIds(p: Project): Set<string> {
  const s = new Set<string>();
  for (const t of p.tracks) for (const c of t.clips) s.add(c.id);
  return s;
}

const byStart = (a: TimelineClip, b: TimelineClip): number => a.start - b.start;

function replaceTrack(p: Project, trackId: string, fn: (t: Track) => Track): Project {
  let changed = false;
  const tracks = p.tracks.map((t) => {
    if (t.id !== trackId) return t;
    const n = fn(t);
    if (n !== t) changed = true;
    return n;
  });
  return changed ? { ...p, tracks } : p;
}

function replaceClip(p: Project, id: string, fn: (c: TimelineClip) => TimelineClip): Project {
  const found = findClip(p, id);
  if (!found) return p;
  const next = fn(found.clip);
  if (next === found.clip) return p;
  return replaceTrack(p, found.track.id, (t) => ({
    ...t,
    clips: t.clips.map((c) => (c.id === id ? next : c)),
  }));
}

function sourceLimit(p: Project, c: AudioClip): number {
  const asset = p.assets[c.assetId];
  return asset ? Math.max(0, asset.duration - c.offset) : Number.POSITIVE_INFINITY;
}

function fitFades(c: AudioClip): AudioClip {
  const total = c.fadeIn + c.fadeOut;
  if (total <= c.duration) return c;
  const k = c.duration / total;
  return { ...c, fadeIn: c.fadeIn * k, fadeOut: c.fadeOut * k };
}

/* ------------------------------ move ------------------------------ */

export function moveClips(
  p: Project,
  ids: string[],
  dt: number,
  targetTrackId?: string,
): Project {
  const wanted = new Set(ids);
  const selected: Found[] = [];
  for (const t of p.tracks) {
    t.clips.forEach((c, index) => {
      if (wanted.has(c.id)) selected.push({ track: t, clip: c, index });
    });
  }
  if (selected.length === 0) return p;

  const minStart = Math.min(...selected.map((s) => s.clip.start));
  const delta = Math.max(dt, -minStart);

  let dest: Track | null = null;
  const sourceTrackIds = new Set(selected.map((s) => s.track.id));
  if (targetTrackId && sourceTrackIds.size === 1 && !sourceTrackIds.has(targetTrackId)) {
    const target = p.tracks.find((t) => t.id === targetTrackId);
    if (target && selected.every((s) => clipFitsTrack(s.clip, target))) dest = target;
  }

  if (Math.abs(delta) < EPS && !dest) return p;

  const moved = new Map<string, TimelineClip>();
  for (const s of selected) {
    moved.set(s.clip.id, {
      ...s.clip,
      start: Math.max(0, s.clip.start + delta),
      trackId: dest ? dest.id : s.clip.trackId,
    });
  }

  const tracks = p.tracks.map((t) => {
    const keep = t.clips.filter((c) => !moved.has(c.id));
    const incoming = [...moved.values()].filter((c) => c.trackId === t.id);
    if (keep.length === t.clips.length && incoming.length === 0) return t;
    return { ...t, clips: [...keep, ...incoming].sort(byStart) };
  });
  return { ...p, tracks };
}

/* ----------------------------- resize ----------------------------- */

/** Move one edge of a clip to `time`. Audio clips trim into/out of the source. */
export function resizeClip(p: Project, id: string, edge: "left" | "right", time: number): Project {
  return replaceClip(p, id, (c) => {
    const end = clipEnd(c);
    if (edge === "left") {
      const lower = c.kind === "audio" ? Math.max(0, c.start - c.offset) : 0;
      const start = clamp(time, lower, end - MIN_CLIP_SECONDS);
      if (Math.abs(start - c.start) < EPS) return c;
      if (c.kind === "audio") {
        return fitFades({
          ...c,
          start,
          duration: end - start,
          offset: c.offset + (start - c.start),
        });
      }
      return { ...c, start, duration: end - start };
    }
    const upper = c.kind === "audio" ? c.start + sourceLimit(p, c) : Number.POSITIVE_INFINITY;
    const newEnd = clamp(time, c.start + MIN_CLIP_SECONDS, upper);
    const duration = newEnd - c.start;
    if (Math.abs(duration - c.duration) < EPS) return c;
    return c.kind === "audio" ? fitFades({ ...c, duration }) : { ...c, duration };
  });
}

/* ------------------------------ split ----------------------------- */

export interface Edit {
  project: Project;
  ids: string[];
}

export function splitClip(p: Project, id: string, t: number): Edit {
  const found = findClip(p, id);
  if (!found) return { project: p, ids: [] };
  const c = found.clip;
  if (t <= c.start + MIN_CLIP_SECONDS || t >= clipEnd(c) - MIN_CLIP_SECONDS) {
    return { project: p, ids: [] };
  }
  const leftDur = t - c.start;
  const rightId = newId("clip");
  let left: TimelineClip;
  let right: TimelineClip;
  if (c.kind === "audio") {
    left = { ...c, duration: leftDur, fadeOut: 0 };
    right = {
      ...c,
      id: rightId,
      start: t,
      duration: c.duration - leftDur,
      offset: c.offset + leftDur,
      fadeIn: 0,
    };
    left = fitFades(left as AudioClip);
    right = fitFades(right as AudioClip);
  } else {
    left = { ...c, duration: leftDur };
    right = { ...c, id: rightId, start: t, duration: c.duration - leftDur };
  }
  const project = replaceTrack(p, found.track.id, (tr) => ({
    ...tr,
    clips: tr.clips.flatMap((x) => (x.id === id ? [left, right] : [x])).sort(byStart),
  }));
  return { project, ids: [id, rightId] };
}

/** Split every listed clip that spans `t`. Returns the ids of the right-hand halves. */
export function splitClipsAt(p: Project, ids: string[], t: number): Edit {
  let project = p;
  const created: string[] = [];
  for (const id of ids) {
    const r = splitClip(project, id, t);
    if (r.ids.length === 2) {
      project = r.project;
      created.push(r.ids[1]!);
    }
  }
  return { project, ids: created };
}

/* --------------------- duplicate / delete / rename ---------------- */

export function duplicateClips(p: Project, ids: string[]): Edit {
  const wanted = new Set(ids);
  const src: TimelineClip[] = [];
  for (const t of p.tracks) for (const c of t.clips) if (wanted.has(c.id)) src.push(c);
  if (src.length === 0) return { project: p, ids: [] };
  const lo = Math.min(...src.map((c) => c.start));
  const hi = Math.max(...src.map(clipEnd));
  const shift = hi - lo;
  const copies = src.map((c) => ({ ...c, id: newId("clip"), start: c.start + shift }));
  const tracks = p.tracks.map((t) => {
    const mine = copies.filter((c) => c.trackId === t.id);
    return mine.length ? { ...t, clips: [...t.clips, ...mine].sort(byStart) } : t;
  });
  return { project: { ...p, tracks }, ids: copies.map((c) => c.id) };
}

export function deleteClips(p: Project, ids: string[]): Project {
  const wanted = new Set(ids);
  let changed = false;
  const tracks = p.tracks.map((t) => {
    if (!t.clips.some((c) => wanted.has(c.id))) return t;
    changed = true;
    return { ...t, clips: t.clips.filter((c) => !wanted.has(c.id)) };
  });
  return changed ? { ...p, tracks } : p;
}

export function renameClip(p: Project, id: string, name: string): Project {
  const clean = name.trim().slice(0, 80);
  if (!clean) return p;
  return replaceClip(p, id, (c) => (c.name === clean ? c : { ...c, name: clean }));
}

export function setClipGain(p: Project, id: string, gain: number): Project {
  return replaceClip(p, id, (c) =>
    c.kind === "audio" ? { ...c, gain: clamp(gain, 0, 4) } : c,
  );
}

export function setClipFades(p: Project, id: string, fadeIn: number, fadeOut: number): Project {
  return replaceClip(p, id, (c) => {
    if (c.kind !== "audio") return c;
    const a = clamp(fadeIn, 0, c.duration);
    const b = clamp(fadeOut, 0, c.duration - a);
    return a === c.fadeIn && b === c.fadeOut ? c : { ...c, fadeIn: a, fadeOut: b };
  });
}

/** Shift pitched event clips by `semitones` (clamped to the MIDI range). */
export function transposeClips(p: Project, ids: string[], semitones: number): Project {
  if (!semitones) return p;
  const wanted = new Set(ids);
  let changed = false;
  const tracks = p.tracks.map((t) => {
    if (!t.clips.some((c) => wanted.has(c.id) && c.kind === "event" && c.pitch !== undefined)) return t;
    const clips = t.clips.map((c) => {
      if (!wanted.has(c.id) || c.kind !== "event" || c.pitch === undefined) return c;
      const pitch = clamp(Math.round(c.pitch + semitones), 0, 127);
      if (pitch === c.pitch) return c;
      changed = true;
      return { ...c, pitch, chord: undefined };
    });
    return { ...t, clips };
  });
  return changed ? { ...p, tracks } : p;
}

/** Add an event (note/hit) to an event or MIDI track. */
export function addEventClip(
  p: Project,
  spec: { trackId: string; start: number; duration: number; pitch?: number; velocity?: number; name?: string },
): Edit {
  const track = p.tracks.find((t) => t.id === spec.trackId);
  if (!track || track.kind === "audio") return { project: p, ids: [] };
  const id = newId("clip");
  const clip: TimelineClip = {
    kind: "event",
    id,
    trackId: track.id,
    name: spec.name ?? track.name,
    start: Math.max(0, spec.start),
    duration: Math.max(MIN_CLIP_SECONDS, spec.duration),
    velocity: spec.velocity ?? 0.8,
    pitch: spec.pitch,
  };
  return {
    project: replaceTrack(p, track.id, (t) => ({ ...t, clips: [...t.clips, clip].sort(byStart) })),
    ids: [id],
  };
}

/* ------------------------------ tracks ---------------------------- */

export type TrackPatch = Partial<
  Pick<Track, "name" | "volume" | "pan" | "mute" | "solo" | "armed" | "color">
>;

export function updateTrack(p: Project, trackId: string, patch: TrackPatch): Project {
  return replaceTrack(p, trackId, (t) => {
    const next: Track = { ...t, ...patch };
    if (patch.volume !== undefined) next.volume = clamp(patch.volume, 0, 1.5);
    if (patch.pan !== undefined) next.pan = clamp(patch.pan, -1, 1);
    if (patch.name !== undefined) next.name = patch.name.trim().slice(0, 40) || t.name;
    const same = (Object.keys(next) as (keyof Track)[]).every((k) => next[k] === t[k]);
    return same ? t : next;
  });
}

export function addTrack(
  p: Project,
  spec: { name: string; kind: TrackKind; color: string; lane?: Track["lane"]; index?: number },
): Edit {
  const id = newId("trk");
  const track: Track = {
    id,
    name: spec.name,
    kind: spec.kind,
    color: spec.color,
    lane: spec.lane,
    volume: 1,
    pan: 0,
    mute: false,
    solo: false,
    armed: false,
    clips: [],
  };
  const tracks = [...p.tracks];
  tracks.splice(spec.index ?? tracks.length, 0, track);
  return { project: { ...p, tracks }, ids: [id] };
}

export function removeTrack(p: Project, trackId: string): Project {
  if (!p.tracks.some((t) => t.id === trackId)) return p;
  return { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) };
}

export function addAudioClip(
  p: Project,
  spec: { trackId: string; assetId: string; start: number; name?: string },
): Edit {
  const asset = p.assets[spec.assetId];
  const track = p.tracks.find((t) => t.id === spec.trackId);
  if (!asset || !track || track.kind !== "audio") return { project: p, ids: [] };
  const id = newId("clip");
  const clip: AudioClip = {
    kind: "audio",
    id,
    trackId: track.id,
    name: spec.name ?? asset.name,
    start: Math.max(0, spec.start),
    duration: asset.duration,
    assetId: asset.id,
    offset: 0,
    gain: 1,
    fadeIn: 0,
    fadeOut: 0,
  };
  const project = replaceTrack(p, track.id, (t) => ({
    ...t,
    clips: [...t.clips, clip].sort(byStart),
  }));
  return { project, ids: [id] };
}

/* ------------------------- project-level edits -------------------- */

export function setBpm(p: Project, bpm: number): Project {
  const v = clamp(Math.round(bpm * 100) / 100, 30, 300);
  if (v === p.bpm) return p;
  return { ...p, bpm: v, corrections: { ...p.corrections, bpm: true } };
}

export function setKey(p: Project, key: string, mode: "major" | "minor"): Project {
  if (key === p.key && mode === p.keyMode) return p;
  return { ...p, key, keyMode: mode, corrections: { ...p.corrections, key: true } };
}

export function setDownbeat(p: Project, time: number): Project {
  const beat = 60 / p.bpm;
  const off = ((time % beat) + beat) % beat;
  if (Math.abs(off - p.beatOffset) < EPS) return p;
  return { ...p, beatOffset: off, corrections: { ...p.corrections, downbeat: true } };
}

export function setSnap(p: Project, snap: SnapMode): Project {
  return snap === p.snap ? p : { ...p, snap };
}

export function renameProject(p: Project, name: string): Project {
  const clean = name.trim().slice(0, 80);
  return clean && clean !== p.name ? { ...p, name: clean } : p;
}

export function setMasterVolume(p: Project, v: number): Project {
  const x = clamp(v, 0, 1.5);
  return x === p.masterVolume ? p : { ...p, masterVolume: x };
}

export function setMarkers(p: Project, markers: Project["markers"]): Project {
  return { ...p, markers };
}
