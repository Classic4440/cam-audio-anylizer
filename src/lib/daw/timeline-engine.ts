import { previewNote } from "./midi-synth.ts";
import { MixGraph } from "./mixer-graph.ts";
import { clipEnd, projectEnd } from "./timeline-math.ts";
import type { Project } from "./types.ts";

/**
 * Central playback engine. The timeline playhead IS the engine position:
 * the UI reads `currentTime()` and calls `seek()`; there is no second clock.
 */
export class TimelineEngine {
  ctx: AudioContext | null = null;
  graph: MixGraph | null = null;
  analyser: AnalyserNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private project: Project | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private scheduleKey = "";
  private resched: ReturnType<typeof setTimeout> | null = null;

  playing = false;
  /** Timeline position when not playing. */
  private position = 0;
  private startCtx = 0;
  private startPos = 0;
  onEnded: (() => void) | null = null;

  /** Create the AudioContext (suspended until a user gesture) without starting playback. */
  ensure(): AudioContext {
    this.build();
    return this.ctx!;
  }

  private build(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0.72;
      this.analyser.connect(this.ctx.destination);
      this.graph = new MixGraph(this.ctx, this.analyser);
      if (this.project) this.graph.sync(this.project, true);
    }
  }

  async unlock(): Promise<AudioContext> {
    this.build();
    const ctx = this.ctx!;
    if (ctx.state === "suspended") await ctx.resume();
    return ctx;
  }

  /* ------------------------------ data ------------------------------ */

  setBuffer(assetId: string, buf: AudioBuffer): void {
    this.buffers.set(assetId, buf);
    if (this.playing) this.scheduleSoon(0);
  }
  getBuffer(assetId: string): AudioBuffer | undefined {
    return this.buffers.get(assetId);
  }
  buffersMap(): ReadonlyMap<string, AudioBuffer> {
    return this.buffers;
  }
  dropBuffers(keep: Set<string>): void {
    for (const id of [...this.buffers.keys()]) if (!keep.has(id)) this.buffers.delete(id);
  }

  /** Called on every project change. Mixer changes apply live; clip changes reschedule. */
  setProject(project: Project | null): void {
    this.project = project;
    if (!project) {
      this.stop();
      return;
    }
    this.graph?.sync(project);
    const key = this.keyOf(project);
    if (key !== this.scheduleKey) {
      this.scheduleKey = key;
      if (this.playing) this.scheduleSoon(90);
    }
  }

  private keyOf(p: Project): string {
    let k = "";
    for (const t of p.tracks) {
      if (t.kind === "audio") {
        for (const c of t.clips) {
          if (c.kind !== "audio") continue;
          k += `${t.id}|${c.id}|${c.assetId}|${c.start}|${c.offset}|${c.duration}|${c.gain}|${c.fadeIn}|${c.fadeOut};`;
        }
      } else if (t.kind === "midi") {
        for (const c of t.clips) {
          if (c.kind === "event") k += `${t.id}|${c.id}|${c.start}|${c.duration}|${c.pitch}|${c.velocity};`;
        }
      }
    }
    return k;
  }

  /* ----------------------------- transport ---------------------------- */

  end(): number {
    return this.project ? projectEnd(this.project) : 0;
  }

  currentTime(): number {
    if (!this.playing || !this.ctx) return this.position;
    const t = this.startPos + (this.ctx.currentTime - this.startCtx);
    return Math.min(t, this.end());
  }

  async play(from?: number): Promise<void> {
    const ctx = await this.unlock();
    if (!this.project || !this.graph) return;
    const pos = Math.max(0, from ?? this.position);
    this.startAt(ctx, pos < this.end() - 0.01 ? pos : 0);
  }

  private startAt(ctx: AudioContext, pos: number): void {
    if (!this.project || !this.graph) return;
    this.killSources();
    this.graph.sync(this.project, true);
    const when = ctx.currentTime + 0.04;
    this.startCtx = when;
    this.startPos = pos;
    this.position = pos;
    this.playing = true;
    this.scheduleKey = this.keyOf(this.project);
    this.sources = this.graph.schedule(this.project, this.buffers, pos, when);
  }

  private scheduleSoon(delay: number): void {
    if (this.resched) clearTimeout(this.resched);
    this.resched = setTimeout(() => {
      this.resched = null;
      if (this.playing && this.ctx) this.startAt(this.ctx, this.currentTime());
    }, delay);
  }

  pause(): void {
    this.position = this.currentTime();
    this.killSources();
    this.playing = false;
  }

  /** Stop and return to the start. */
  stop(): void {
    this.killSources();
    this.playing = false;
    this.position = 0;
  }

  /** Move the playhead. Keeps playing if already playing. */
  seek(t: number): void {
    const pos = Math.max(0, Math.min(this.end(), t));
    this.position = pos;
    if (this.playing && this.ctx) this.startAt(this.ctx, pos);
  }

  /** Call from the UI frame loop; stops at the end of the last clip. */
  pollEnded(): boolean {
    if (!this.playing) return false;
    if (this.currentTime() >= this.end() - 1e-3) {
      this.position = this.end();
      this.killSources();
      this.playing = false;
      this.onEnded?.();
      return true;
    }
    return false;
  }

  private killSources(): void {
    if (this.resched) {
      clearTimeout(this.resched);
      this.resched = null;
    }
    for (const s of this.sources) {
      try {
        s.stop();
        s.disconnect();
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
  }

  /** Audition a single MIDI note (call from a user gesture). */
  async preview(synth: "drums" | "bass" | "keys" | undefined, pitch: number, velocity = 0.8): Promise<void> {
    const ctx = await this.unlock();
    if (this.analyser) previewNote(ctx, this.analyser, synth, pitch, velocity);
  }

  /* ----------------------------- metering ----------------------------- */

  getMasterSpectrum(out: Uint8Array): void {
    this.analyser?.getByteFrequencyData(out as never);
  }

  trackLevel(trackId: string): number {
    const a = this.graph?.tracks.get(trackId)?.analyser;
    if (!a) return 0;
    const buf = new Uint8Array(a.fftSize);
    a.getByteTimeDomainData(buf as never);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = Math.abs(((buf[i] ?? 128) - 128) / 128);
      if (v > peak) peak = v;
    }
    return peak;
  }

  /** Last audible time across audio clips (useful for UI hints). */
  lastClipEnd(): number {
    let e = 0;
    for (const t of this.project?.tracks ?? []) for (const c of t.clips) e = Math.max(e, clipEnd(c));
    return e;
  }
}

let engine: TimelineEngine | null = null;
export function getTimelineEngine(): TimelineEngine {
  if (!engine) engine = new TimelineEngine();
  return engine;
}
