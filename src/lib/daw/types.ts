import type { LaneId } from "../audio/types.ts";

/** Bump when the persisted shape changes; add a step in `migrateProject`. */
export const PROJECT_FORMAT_VERSION = 1;

export type TrackKind = "audio" | "analysis" | "chords" | "midi";
export type SnapMode = "off" | "1/4" | "1/2" | "1" | "bar";

export const SNAP_MODES: { id: SnapMode; label: string }[] = [
  { id: "off", label: "Off" },
  { id: "1/4", label: "1/4 beat" },
  { id: "1/2", label: "1/2 beat" },
  { id: "1", label: "1 beat" },
  { id: "bar", label: "1 bar" },
];

export type AssetRole = "source" | "stem" | "import" | "bounce";

/** Metadata only. The audio bytes live in IndexedDB (`assets` store), never in React state. */
export interface AssetMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
  duration: number;
  sampleRate: number;
  channels: number;
  role: AssetRole;
  createdAt: number;
}

interface ClipBase {
  id: string;
  trackId: string;
  name: string;
  /** Position on the timeline in seconds. Independent of the source position. */
  start: number;
  duration: number;
}

export interface AudioClip extends ClipBase {
  kind: "audio";
  assetId: string;
  /** Where in the source file this clip begins, in seconds. */
  offset: number;
  gain: number;
  fadeIn: number;
  fadeOut: number;
}

export interface EventClip extends ClipBase {
  kind: "event";
  velocity: number;
  /** MIDI note number, when the event is pitched (bass notes, chord roots). */
  pitch?: number;
  /** Chord quality / chord notes for chord clips. */
  chord?: { root: number; quality: string };
}

export type TimelineClip = AudioClip | EventClip;

export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  color: string;
  lane?: LaneId;
  /** How a `midi` track sounds: drum hits (kick 36 / snare 38 / hat 42), bass or keys. */
  synth?: "drums" | "bass" | "keys";
  /** Linear gain, 0..1.5 */
  volume: number;
  /** -1 (left) .. 1 (right) */
  pan: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
  clips: TimelineClip[];
}

export interface Marker {
  id: string;
  time: number;
  duration: number;
  name: string;
}

export interface UserCorrections {
  bpm: boolean;
  key: boolean;
  downbeat: boolean;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  bpm: number;
  /** Time of the first downbeat, seconds. The beat grid is offset + n * 60/bpm. */
  beatOffset: number;
  beatsPerBar: number;
  beatUnit: number;
  key: string;
  keyMode: "major" | "minor";
  bpmConfidence: number;
  keyConfidence: number;
  corrections: UserCorrections;
  assets: Record<string, AssetMeta>;
  tracks: Track[];
  markers: Marker[];
  masterVolume: number;
  snap: SnapMode;
}

export function isAudioClip(c: TimelineClip): c is AudioClip {
  return c.kind === "audio";
}
export function isEventClip(c: TimelineClip): c is EventClip {
  return c.kind === "event";
}

/** Whether `clip` may live on `track`. Audio stays on audio tracks, events on event tracks. */
export function clipFitsTrack(clip: TimelineClip, track: Track): boolean {
  if (clip.kind === "audio") return track.kind === "audio";
  return track.kind !== "audio";
}
