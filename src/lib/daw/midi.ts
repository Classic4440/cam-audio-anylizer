import { clipEnd } from "./timeline-math.ts";
import type { EventClip, Project, Track } from "./types.ts";

/** Standard MIDI File (type 1) writer. Pure and dependency-free. */

export interface MidiNote {
  start: number;
  duration: number;
  pitch: number;
  velocity: number;
}
export interface MidiTrackSpec {
  name: string;
  /** 0-based MIDI channel (9 = General MIDI drums). */
  channel: number;
  program?: number;
  notes: MidiNote[];
}

const PPQ = 480;

function vlq(n: number): number[] {
  let v = Math.max(0, Math.round(n));
  const out = [v & 0x7f];
  while ((v >>= 7) > 0) out.unshift((v & 0x7f) | 0x80);
  return out;
}
const u32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u16 = (n: number) => [(n >>> 8) & 255, n & 255];
const text = (s: string) => Array.from(new TextEncoder().encode(s));

function chunk(tag: string, data: number[]): number[] {
  return [...text(tag), ...u32(data.length), ...data];
}

export function encodeMidi(
  tracks: MidiTrackSpec[],
  bpm: number,
  timeSig: [number, number] = [4, 4],
  markers: { time: number; name: string }[] = [],
): Uint8Array {
  const ticksPerSec = (bpm / 60) * PPQ;
  const toTick = (t: number) => Math.max(0, Math.round(t * ticksPerSec));
  const chunks: number[][] = [];

  // Conductor track: tempo, time signature, section markers.
  const cond: { tick: number; bytes: number[] }[] = [];
  const mpq = Math.round(60_000_000 / bpm);
  cond.push({ tick: 0, bytes: [0xff, 0x51, 3, (mpq >> 16) & 255, (mpq >> 8) & 255, mpq & 255] });
  cond.push({ tick: 0, bytes: [0xff, 0x58, 4, timeSig[0], Math.log2(timeSig[1]), 24, 8] });
  for (const m of markers) {
    const b = text(m.name);
    cond.push({ tick: toTick(m.time), bytes: [0xff, 0x06, ...vlq(b.length), ...b] });
  }
  cond.sort((a, b) => a.tick - b.tick);
  const condBytes: number[] = [];
  let last = 0;
  for (const e of cond) {
    condBytes.push(...vlq(e.tick - last), ...e.bytes);
    last = e.tick;
  }
  condBytes.push(0, 0xff, 0x2f, 0);
  chunks.push(chunk("MTrk", condBytes));

  for (const t of tracks) {
    const ev: { tick: number; order: number; bytes: number[] }[] = [];
    const nm = text(t.name);
    ev.push({ tick: 0, order: 0, bytes: [0xff, 0x03, ...vlq(nm.length), ...nm] });
    if (t.program !== undefined && t.channel !== 9) ev.push({ tick: 0, order: 1, bytes: [0xc0 | t.channel, t.program & 127] });
    for (const n of t.notes) {
      const on = toTick(n.start);
      const off = Math.max(on + 1, toTick(n.start + n.duration));
      const vel = Math.max(1, Math.min(127, Math.round(n.velocity * 127)));
      const pitch = Math.max(0, Math.min(127, Math.round(n.pitch)));
      ev.push({ tick: on, order: 3, bytes: [0x90 | t.channel, pitch, vel] });
      ev.push({ tick: off, order: 2, bytes: [0x80 | t.channel, pitch, 0] });
    }
    ev.sort((a, b) => a.tick - b.tick || a.order - b.order);
    const bytes: number[] = [];
    let prev = 0;
    for (const e of ev) {
      bytes.push(...vlq(e.tick - prev), ...e.bytes);
      prev = e.tick;
    }
    bytes.push(0, 0xff, 0x2f, 0);
    chunks.push(chunk("MTrk", bytes));
  }

  const header = chunk("MThd", [...u16(1), ...u16(chunks.length), ...u16(PPQ)]);
  return Uint8Array.from([...header, ...chunks.flat()]);
}

/* ------------------------- project -> MIDI notes ------------------------ */

export const DRUM_PITCH = { kick: 36, snare: 38, hats: 42 } as const;

const CHORD_INTERVALS: Record<string, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  sus: [0, 5, 7],
  dim: [0, 3, 6],
};

/** Chord clip -> chord-tone notes voiced around middle C. */
export function chordNotes(c: EventClip): MidiNote[] {
  if (!c.chord) return [];
  const iv = CHORD_INTERVALS[c.chord.quality] ?? CHORD_INTERVALS.maj!;
  const base = 48 + c.chord.root;
  return iv.map((i) => ({
    start: c.start,
    duration: c.duration,
    pitch: base + i,
    velocity: Math.min(1, c.velocity * 0.8),
  }));
}

/** Notes for any event track, by what the track is. */
export function trackNotes(t: Track): MidiNote[] {
  const out: MidiNote[] = [];
  for (const c of t.clips) {
    if (c.kind !== "event") continue;
    if (t.kind === "chords" || c.chord) {
      out.push(...chordNotes(c));
    } else if (t.lane === "kick" || t.lane === "snare" || t.lane === "hats") {
      out.push({ start: c.start, duration: Math.min(c.duration, 0.12), pitch: DRUM_PITCH[t.lane], velocity: c.velocity });
    } else if (c.pitch !== undefined) {
      out.push({ start: c.start, duration: c.duration, pitch: c.pitch, velocity: c.velocity });
    }
  }
  return out;
}

/** Everything in the project that can become MIDI, grouped into sensible MIDI tracks. */
export function projectMidiTracks(p: Project): MidiTrackSpec[] {
  const specs: MidiTrackSpec[] = [];
  const drums: MidiNote[] = [];
  for (const t of p.tracks) {
    if (t.kind === "audio") continue;
    if (t.lane === "kick" || t.lane === "snare" || t.lane === "hats") {
      drums.push(...trackNotes(t));
    } else if (t.kind === "midi" && t.synth === "drums") {
      for (const c of t.clips) if (c.kind === "event" && c.pitch !== undefined) drums.push({ start: c.start, duration: Math.min(c.duration, 0.12), pitch: c.pitch, velocity: c.velocity });
    } else {
      const notes = trackNotes(t);
      if (notes.length) specs.push({ name: t.name, channel: t.synth === "bass" || t.lane === "bass" ? 1 : 0, program: t.synth === "bass" || t.lane === "bass" ? 33 : 0, notes });
    }
  }
  if (drums.length) specs.unshift({ name: "Drums", channel: 9, notes: drums });
  return specs;
}

export function exportProjectMidi(p: Project): Uint8Array {
  return encodeMidi(
    projectMidiTracks(p),
    p.bpm,
    [p.beatsPerBar, p.beatUnit],
    p.markers.map((m) => ({ time: m.time, name: m.name })),
  );
}

export function eventEnd(c: EventClip): number {
  return clipEnd(c);
}
