import { LANE_META, LANE_ORDER, type AnalysisResult, type Clip, type LaneId } from "../audio/types.ts";
import { newId } from "./ids.ts";
import * as ops from "./ops.ts";
import type { AssetMeta, EventClip, Project, TimelineClip, Track } from "./types.ts";
import { DRUM_PITCH } from "./midi.ts";
import { voiceChord } from "./voicing.ts";
import type { PatchId } from "../audio/dsp/tone.ts";
import { rhythmForChord, type Strike } from "../audio/dsp/comping.ts";

const laneColor = (lane: LaneId) => `var(${LANE_META[lane].colorVar})`;

export function eventClips(trackId: string, lane: LaneId, clips: Clip[], chords?: AnalysisResult["chords"]): EventClip[] {
  if (lane === "chords" && chords) {
    return chords.map((c) => ({
      kind: "event" as const,
      id: newId("clip"),
      trackId,
      name: c.name,
      start: c.start,
      duration: Math.max(0.05, c.duration),
      velocity: 0.85,
      pitch: 60 + c.root,
      chord: { root: c.root, quality: c.quality },
    }));
  }
  return clips.map((c) => ({
    kind: "event" as const,
    id: newId("clip"),
    trackId,
    name: c.label ?? LANE_META[lane].label,
    start: c.start,
    duration: Math.max(0.03, c.duration),
    velocity: c.velocity,
    pitch: c.pitch,
  }));
}

function emptyTrack(id: string, name: string, kind: Track["kind"], color: string, extra: Partial<Track> = {}): Track {
  return { id, name, kind, color, volume: 1, pan: 0, mute: false, solo: false, armed: false, clips: [], ...extra };
}

export function assetMeta(spec: {
  id?: string;
  name: string;
  mime: string;
  size: number;
  buffer: { duration: number; sampleRate: number; numberOfChannels: number };
  role: AssetMeta["role"];
}): AssetMeta {
  return {
    id: spec.id ?? newId("asset"),
    name: spec.name,
    mime: spec.mime,
    size: spec.size,
    duration: spec.buffer.duration,
    sampleRate: spec.buffer.sampleRate,
    channels: spec.buffer.numberOfChannels,
    role: spec.role,
    createdAt: Date.now(),
  };
}

/** Build an editable project from an analysis result and its source audio asset. */
export function projectFromAnalysis(a: AnalysisResult, asset: AssetMeta, name?: string): Project {
  const now = Date.now();
  const mixId = newId("trk");
  const tracks: Track[] = [];
  const mix = emptyTrack(mixId, "Mix", "audio", "var(--foreground)");
  mix.clips.push({
    kind: "audio",
    id: newId("clip"),
    trackId: mixId,
    name: asset.name.replace(/\.[^.]+$/, ""),
    start: 0,
    duration: asset.duration,
    assetId: asset.id,
    offset: 0,
    gain: 1,
    fadeIn: 0,
    fadeOut: 0,
  });
  tracks.push(mix);
  for (const lane of LANE_ORDER) {
    const id = newId("trk");
    const t = emptyTrack(id, LANE_META[lane].label, lane === "chords" ? "chords" : "analysis", laneColor(lane), { lane });
    t.clips = eventClips(id, lane, a.lanes[lane], a.chords);
    tracks.push(t);
  }
  return {
    id: newId("proj"),
    name: name ?? (a.fileName.replace(/\.[^.]+$/, "") || "Untitled"),
    createdAt: now,
    updatedAt: now,
    bpm: a.bpm,
    beatOffset: a.beatOffset,
    beatsPerBar: a.timeSignature[0],
    beatUnit: a.timeSignature[1],
    key: a.key,
    keyMode: a.keyMode,
    bpmConfidence: a.bpmConfidence ?? 0,
    keyConfidence: a.keyConfidence ?? 0,
    corrections: { bpm: false, key: false, downbeat: false },
    assets: { [asset.id]: asset },
    tracks,
    markers: a.sections.map((s) => ({ id: newId("mk"), time: s.start, duration: s.duration, name: s.name })),
    masterVolume: 1,
    snap: "1",
  };
}

/** Empty project for "New Project" (import audio afterwards). */
export function blankProject(name = "Untitled"): Project {
  const now = Date.now();
  const id = newId("trk");
  return {
    id: newId("proj"), name, createdAt: now, updatedAt: now, bpm: 120, beatOffset: 0, beatsPerBar: 4, beatUnit: 4,
    key: "C major", keyMode: "major", bpmConfidence: 0, keyConfidence: 0,
    corrections: { bpm: false, key: false, downbeat: false },
    assets: {}, tracks: [emptyTrack(id, "Track 1", "audio", "var(--foreground)")], markers: [], masterVolume: 1, snap: "1",
  };
}

/** Replace the contents of the lane tracks with fresh analysis (keeps mixer settings). */
export function applyLanes(p: Project, a: AnalysisResult): Project {
  return {
    ...p,
    tracks: p.tracks.map((t) => {
      if (!t.lane) return t;
      return { ...t, clips: eventClips(t.id, t.lane, a.lanes[t.lane], a.chords) as TimelineClip[] };
    }),
  };
}

export const STEM_LABEL = { drums: "Drums", bass: "Bass", vocals: "Vocals", other: "Other" } as const;
const STEM_COLOR: Record<keyof typeof STEM_LABEL, LaneId> = { drums: "kick", bass: "bass", vocals: "vocals", other: "chords" };

/** Add separated stems as audio tracks and mute the source mix (the stems sum back to it). */
export function addStemTracks(
  p: Project,
  stems: { stem: keyof typeof STEM_LABEL; asset: AssetMeta }[],
): Project {
  let next: Project = { ...p, assets: { ...p.assets } };
  const sourceTrackIds = next.tracks.filter((t) => t.kind === "audio" && !t.name.startsWith("Stem")).map((t) => t.id);
  let idx = Math.max(1, next.tracks.findIndex((t) => t.id === sourceTrackIds[0]) + 1);
  for (const { stem, asset } of stems) {
    next.assets[asset.id] = asset;
    const added = ops.addTrack(next, { name: `${STEM_LABEL[stem]} (stem)`, kind: "audio", color: laneColor(STEM_COLOR[stem]), index: idx++ });
    next = added.project;
    const trackId = added.ids[0]!;
    next = ops.addAudioClip(next, { trackId, assetId: asset.id, start: 0, name: STEM_LABEL[stem] }).project;
  }
  for (const id of sourceTrackIds) next = ops.updateTrack(next, id, { mute: true });
  return next;
}

export interface MidiConvertOptions {
  /** Chord instrument. Pass the one matched to the track's tone. */
  patch?: PatchId;
  brightness?: number;
  /** Drum one-shots cut from the track (asset ids). */
  kit?: Track["kit"];
  /** Detected chord-instrument onsets. When given, chords re-strike with the track's rhythm. */
  strikes?: Strike[];
  /** Drum hit times to ignore as chord strikes (use when strikes came from the full mix). */
  excludeStrikes?: number[];
}

/** Convert the detected drum/bass/chord lanes into editable, audible MIDI tracks. */
export function convertLanesToMidi(p: Project, opts: MidiConvertOptions = {}): Project {
  let next = p;
  const lane = (id: LaneId) => p.tracks.find((t) => t.lane === id);
  const drumTrack = ops.addTrack(next, { name: "Drums (MIDI)", kind: "midi", color: laneColor("kick") });
  next = drumTrack.project;
  const dId = drumTrack.ids[0]!;
  const drumClips: EventClip[] = [];
  for (const l of ["kick", "snare", "hats"] as const) {
    for (const c of lane(l)?.clips ?? []) {
      if (c.kind !== "event") continue;
      drumClips.push({ ...c, id: newId("clip"), trackId: dId, name: LANE_META[l].label, pitch: DRUM_PITCH[l], duration: Math.min(c.duration, 0.12) });
    }
  }
  drumClips.sort((a, b) => a.start - b.start);
  next = { ...next, tracks: next.tracks.map((t) => (t.id === dId ? { ...t, synth: "drums" as const, ...(opts.kit && Object.keys(opts.kit).length ? { kit: opts.kit } : {}), clips: drumClips } : t)) };

  const bass = lane("bass");
  if (bass && bass.clips.some((c) => c.kind === "event" && c.pitch !== undefined)) {
    const b = ops.addTrack(next, { name: "Bass (MIDI)", kind: "midi", color: laneColor("bass") });
    next = b.project;
    const bId = b.ids[0]!;
    next = {
      ...next,
      tracks: next.tracks.map((t) =>
        t.id === bId
          ? { ...t, synth: "bass" as const, clips: bass.clips.filter((c): c is EventClip => c.kind === "event" && c.pitch !== undefined).map((c) => ({ ...c, id: newId("clip"), trackId: bId })) }
          : t,
      ),
    };
  }
  const chords = lane("chords");
  if (chords && chords.clips.length) {
    const k = ops.addTrack(next, { name: "Chords (MIDI)", kind: "midi", color: laneColor("chords") });
    next = k.project;
    const kId = k.ids[0]!;
    // One note per chord tone so each can be edited individually. Voiced with voice leading.
    const notes: EventClip[] = [];
    let prev: number[] | null = null;
    for (const c of chords.clips) {
      if (c.kind !== "event" || !c.chord) continue;
      const voicing = voiceChord(prev, c.chord.root, c.chord.quality);
      prev = voicing;
      const hits = opts.strikes
        ? rhythmForChord(c.start, c.start + c.duration, opts.strikes, {
            gridSec: 60 / p.bpm / 4,
            gridOffset: p.beatOffset,
            exclude: opts.excludeStrikes,
          })
        : [{ start: c.start, duration: c.duration }];
      for (const h of hits) {
        for (const pitch of voicing) {
          notes.push({ kind: "event", id: newId("clip"), trackId: kId, name: c.name, start: h.start, duration: h.duration, velocity: c.velocity * 0.8, pitch });
        }
      }
    }
    next = { ...next, tracks: next.tracks.map((t) => (t.id === kId ? { ...t, synth: "keys" as const, patch: opts.patch ?? "piano", brightness: opts.brightness ?? 0.6, clips: notes } : t)) };
  }
  return next;
}
