import type { Project, SnapMode, TimelineClip, Track } from "./types.ts";

export function beatSeconds(bpm: number): number {
  return 60 / Math.max(1, bpm);
}

/** Snap interval in seconds, or 0 when snapping is off. */
export function snapStep(snap: SnapMode, bpm: number, beatsPerBar = 4): number {
  const beat = beatSeconds(bpm);
  switch (snap) {
    case "off":
      return 0;
    case "1/4":
      return beat / 4;
    case "1/2":
      return beat / 2;
    case "1":
      return beat;
    case "bar":
      return beat * beatsPerBar;
  }
}

/** Snap a time to the project's grid (anchored on `beatOffset`). */
export function snapTime(
  t: number,
  p: Pick<Project, "snap" | "bpm" | "beatOffset" | "beatsPerBar">,
): number {
  const step = snapStep(p.snap, p.bpm, p.beatsPerBar);
  if (step <= 0) return t;
  const n = Math.round((t - p.beatOffset) / step);
  return p.beatOffset + n * step;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function clipEnd(c: Pick<TimelineClip, "start" | "duration">): number {
  return c.start + c.duration;
}

/** End of the last clip, never less than `min` seconds. */
export function projectEnd(p: Pick<Project, "tracks">, min = 1): number {
  let end = min;
  for (const t of p.tracks) for (const c of t.clips) end = Math.max(end, clipEnd(c));
  return end;
}

export interface Viewport {
  pxPerSec: number;
  scrollX: number;
}

export const timeToX = (t: number, v: Viewport): number => t * v.pxPerSec - v.scrollX;
export const xToTime = (x: number, v: Viewport): number => (x + v.scrollX) / v.pxPerSec;

export type HitZone = "left" | "body" | "right";
export interface Hit {
  clipId: string;
  trackId: string;
  zone: HitZone;
}

export interface TrackRow {
  track: Track;
  top: number;
  height: number;
}

export function layoutRows(tracks: Track[], heightOf: (t: Track) => number, top = 0): TrackRow[] {
  const rows: TrackRow[] = [];
  let y = top;
  for (const track of tracks) {
    const height = heightOf(track);
    rows.push({ track, top: y, height });
    y += height;
  }
  return rows;
}

export function rowAt(rows: TrackRow[], y: number): TrackRow | null {
  for (const r of rows) if (y >= r.top && y < r.top + r.height) return r;
  return null;
}

/**
 * Find the clip under a point. `edgePx` is the grab zone for resize handles,
 * shrunk automatically on narrow clips so the body stays grabbable.
 * Later clips win when overlapping (they draw on top).
 */
export function hitTestClip(
  rows: TrackRow[],
  x: number,
  y: number,
  v: Viewport,
  edgePx = 8,
): Hit | null {
  const row = rowAt(rows, y);
  if (!row) return null;
  const t = xToTime(x, v);
  const clips = row.track.clips;
  for (let i = clips.length - 1; i >= 0; i--) {
    const c = clips[i]!;
    if (t < c.start - 4 / v.pxPerSec || t > clipEnd(c) + 4 / v.pxPerSec) continue;
    const x0 = timeToX(c.start, v);
    const x1 = timeToX(clipEnd(c), v);
    if (x < x0 - 4 || x > x1 + 4) continue;
    const w = x1 - x0;
    const edge = Math.min(edgePx, Math.max(2, w / 3));
    let zone: HitZone = "body";
    if (x - x0 <= edge) zone = "left";
    else if (x1 - x <= edge) zone = "right";
    return { clipId: c.id, trackId: row.track.id, zone };
  }
  return null;
}

/** Clips whose time range intersects [t0,t1] on rows intersecting [y0,y1]; for marquee select. */
export function clipsInRect(rows: TrackRow[], t0: number, t1: number, y0: number, y1: number): string[] {
  const lo = Math.min(t0, t1);
  const hi = Math.max(t0, t1);
  const yl = Math.min(y0, y1);
  const yh = Math.max(y0, y1);
  const ids: string[] = [];
  for (const r of rows) {
    if (r.top + r.height < yl || r.top > yh) continue;
    for (const c of r.track.clips) if (clipEnd(c) >= lo && c.start <= hi) ids.push(c.id);
  }
  return ids;
}

/** Bar/beat position as 1-based "bar.beat.sixteenth". */
export function formatPosition(
  t: number,
  bpm: number,
  beatOffset: number,
  beatsPerBar = 4,
): string {
  const beat = beatSeconds(bpm);
  const rel = (t - beatOffset) / beat;
  const neg = rel < 0;
  const abs = Math.abs(rel);
  const totalBeats = Math.floor(abs + 1e-9);
  const bar = Math.floor(totalBeats / beatsPerBar) + 1;
  const b = (totalBeats % beatsPerBar) + 1;
  const sixteenth = Math.floor((abs - totalBeats) * 4 + 1e-9) + 1;
  return `${neg ? "-" : ""}${bar}.${b}.${sixteenth}`;
}

/* ---------------------- piano-roll layout (MIDI rows) --------------------- */

export interface MidiLayout {
  lo: number;
  hi: number;
  /** Pixels per semitone. */
  h: number;
  top: number;
}

const ROLL_PAD = 6;

/** Visible pitch range for a MIDI row: fits the notes with a 12-semitone minimum span. */
export function midiLayout(track: Track, rowTop: number, rowHeight: number): MidiLayout {
  let lo = 127;
  let hi = 0;
  for (const c of track.clips) {
    if (c.kind === "event" && c.pitch !== undefined) {
      lo = Math.min(lo, c.pitch);
      hi = Math.max(hi, c.pitch);
    }
  }
  if (lo > hi) {
    lo = 48;
    hi = 72;
  }
  lo -= 2;
  hi += 2;
  while (hi - lo < 11) {
    lo -= 1;
    hi += 1;
  }
  lo = Math.max(0, lo);
  hi = Math.min(127, hi);
  const h = (rowHeight - ROLL_PAD * 2) / (hi - lo + 1);
  return { lo, hi, h, top: rowTop + ROLL_PAD };
}

export const pitchToY = (l: MidiLayout, pitch: number): number => l.top + (l.hi - pitch) * l.h;
export const yToPitch = (l: MidiLayout, y: number): number =>
  clamp(l.hi - Math.floor((y - l.top) / l.h), 0, 127);
