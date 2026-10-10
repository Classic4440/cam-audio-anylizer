import { scheduleMidiTracks } from "./midi-synth.ts";
import { clipEnd, projectEnd } from "./timeline-math.ts";
import type { AudioClip, Project, Track } from "./types.ts";

/**
 * One audio graph used by BOTH live playback and offline bounce, so what you
 * hear is exactly what you export:
 *
 *   clip source -> clip gain (gain + fades) -> track gain -> pan -> track analyser -> master
 */

/** Tracks that should be heard right now (mute + solo logic). */
export function audibleTrackIds(tracks: Track[]): Set<string> {
  const anySolo = tracks.some((t) => t.solo);
  const out = new Set<string>();
  for (const t of tracks) {
    if (t.mute) continue;
    if (anySolo && !t.solo) continue;
    out.add(t.id);
  }
  return out;
}

export interface ClipPlan {
  /** Seconds after the schedule start at which the clip begins sounding. */
  when: number;
  /** Position inside the source file to start from. */
  offset: number;
  /** How long to play, seconds. */
  duration: number;
  /** Gain multiplier at the very first sample (accounts for starting mid fade-in). */
  startGain: number;
  /** Seconds, from `when`, over which gain ramps up to the clip gain. */
  rampIn: number;
  /** Seconds, from `when`, at which the fade-out begins. */
  fadeOutAt: number;
  rampOut: number;
}

/** Click-guard so cuts and seeks never produce a hard edge. */
export const MIN_RAMP = 0.004;

/** Where/when to play `clip` when playback starts at timeline position `from`. */
export function planClip(clip: AudioClip, from: number): ClipPlan | null {
  const end = clipEnd(clip);
  if (end <= from + 1e-6) return null;
  const skipped = Math.max(0, from - clip.start);
  const duration = clip.duration - skipped;
  if (duration <= 1e-6) return null;
  const fadeInLeft = Math.max(0, clip.fadeIn - skipped);
  const startGain = clip.fadeIn > 0 && skipped < clip.fadeIn ? skipped / clip.fadeIn : 0;
  const rampIn = Math.max(fadeInLeft, MIN_RAMP);
  const rampOut = Math.min(Math.max(clip.fadeOut, MIN_RAMP), duration);
  const fadeOutAt = Math.max(0, duration - rampOut);
  return {
    when: Math.max(0, clip.start - from),
    offset: clip.offset + skipped,
    duration,
    startGain: fadeInLeft > 0 ? startGain : 0,
    rampIn,
    fadeOutAt,
    rampOut,
  };
}

export interface TrackNodes {
  gain: GainNode;
  pan: StereoPannerNode;
  analyser: AnalyserNode;
}

export class MixGraph {
  readonly ctx: BaseAudioContext;
  readonly master: GainNode;
  readonly tracks = new Map<string, TrackNodes>();

  constructor(ctx: BaseAudioContext, destination: AudioNode) {
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(destination);
  }

  /** Create/remove nodes to match `project.tracks` and apply mixer settings. */
  sync(project: Project, immediate = false): void {
    const now = this.ctx.currentTime;
    const set = (p: AudioParam, v: number) => {
      if (immediate) p.setValueAtTime(v, now);
      else p.setTargetAtTime(v, now, 0.015);
    };
    const live = new Set(project.tracks.map((t) => t.id));
    for (const [id, n] of this.tracks) {
      if (live.has(id)) continue;
      n.gain.disconnect();
      n.pan.disconnect();
      n.analyser.disconnect();
      this.tracks.delete(id);
    }
    const audible = audibleTrackIds(project.tracks);
    for (const t of project.tracks) {
      let n = this.tracks.get(t.id);
      if (!n) {
        const gain = this.ctx.createGain();
        const pan = this.ctx.createStereoPanner();
        const analyser = this.ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        gain.connect(pan);
        pan.connect(analyser);
        analyser.connect(this.master);
        n = { gain, pan, analyser };
        this.tracks.set(t.id, n);
      }
      set(n.gain.gain, audible.has(t.id) ? t.volume : 0);
      set(n.pan.pan, t.pan);
    }
    set(this.master.gain, project.masterVolume);
  }

  /**
   * Schedule every audible-track audio clip for playback starting at timeline
   * position `from`, with timeline `from` landing on context time `startAt`.
   */
  schedule(
    project: Project,
    buffers: ReadonlyMap<string, AudioBuffer>,
    from: number,
    startAt: number,
    onlyTrackIds?: ReadonlySet<string>,
  ): AudioScheduledSourceNode[] {
    const out: AudioScheduledSourceNode[] = [];
    for (const track of project.tracks) {
      if (track.kind !== "audio") continue;
      if (onlyTrackIds && !onlyTrackIds.has(track.id)) continue;
      const nodes = this.tracks.get(track.id);
      if (!nodes) continue;
      for (const clip of track.clips) {
        if (clip.kind !== "audio") continue;
        const buf = buffers.get(clip.assetId);
        if (!buf) continue;
        const plan = planClip(clip, from);
        if (!plan) continue;
        const t0 = startAt + plan.when;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const g = this.ctx.createGain();
        const peak = clip.gain;
        g.gain.setValueAtTime(plan.startGain * peak, t0);
        g.gain.linearRampToValueAtTime(peak, t0 + plan.rampIn);
        if (plan.fadeOutAt > plan.rampIn) {
          g.gain.setValueAtTime(peak, t0 + plan.fadeOutAt);
        }
        g.gain.linearRampToValueAtTime(0, t0 + plan.fadeOutAt + plan.rampOut);
        src.connect(g);
        g.connect(nodes.gain);
        const maxDur = Math.max(0, buf.duration - plan.offset);
        src.start(t0, plan.offset, Math.min(plan.duration, maxDur));
        out.push(src);
      }
    }
    out.push(...scheduleMidiTracks(this.ctx, this.tracks, project, from, startAt, onlyTrackIds, buffers));
    return out;
  }
}

export interface RenderOptions {
  sampleRate?: number;
  from?: number;
  to?: number;
  /** Render only these tracks (stem export). Mute/solo is ignored for them. */
  onlyTrackIds?: string[];
  channels?: number;
}

/** Offline bounce of the project through the exact live graph. */
export async function renderProject(
  project: Project,
  buffers: ReadonlyMap<string, AudioBuffer>,
  OfflineCtor: new (ch: number, length: number, rate: number) => OfflineAudioContext,
  opts: RenderOptions = {},
): Promise<AudioBuffer> {
  const sr = opts.sampleRate ?? 44100;
  const from = Math.max(0, opts.from ?? 0);
  const to = opts.to ?? projectEnd(project);
  const length = Math.max(1, Math.ceil((to - from) * sr));
  const ctx = new OfflineCtor(opts.channels ?? 2, length, sr);
  const graph = new MixGraph(ctx, ctx.destination);
  let target = project;
  let only: Set<string> | undefined;
  if (opts.onlyTrackIds) {
    only = new Set(opts.onlyTrackIds);
    target = {
      ...project,
      tracks: project.tracks.map((t) => ({ ...t, mute: !only!.has(t.id), solo: false })),
    };
    target = { ...target, tracks: target.tracks.map((t) => (only!.has(t.id) ? { ...t, mute: false } : t)) };
  }
  graph.sync(target, true);
  graph.schedule(target, buffers, from, 0, only);
  return ctx.startRendering();
}
