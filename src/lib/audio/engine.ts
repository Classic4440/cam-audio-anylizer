import type { AnalysisResult, LaneId, StemBuffers } from "./types";
import { LANE_ORDER } from "./types";

const FILTERS: Record<LaneId, { type: BiquadFilterType; frequency: number; Q: number }> = {
  kick: { type: "lowpass", frequency: 120, Q: 0.7 },
  snare: { type: "bandpass", frequency: 1400, Q: 0.55 },
  hats: { type: "highpass", frequency: 6800, Q: 0.7 },
  bass: { type: "lowpass", frequency: 280, Q: 0.85 },
  vocals: { type: "bandpass", frequency: 1600, Q: 0.75 },
  chords: { type: "bandpass", frequency: 520, Q: 0.5 },
};

export class PlaybackEngine {
  ctx: AudioContext | null = null;
  mix: AudioBuffer | null = null;
  stems: StemBuffers | null = null;
  analysis: AnalysisResult | null = null;

  master: GainNode | null = null;
  analyser: AnalyserNode | null = null;
  laneGains: Partial<Record<LaneId, GainNode>> = {};
  laneAnalysers: Partial<Record<LaneId, AnalyserNode>> = {};
  dryGain: GainNode | null = null;

  private sources: AudioBufferSourceNode[] = [];
  playing = false;
  private startCtxTime = 0;
  private startOffset = 0;
  offset = 0;
  volume = 0.9;
  muted = new Set<LaneId>();
  solo = new Set<LaneId>();
  onEnded: (() => void) | null = null;

  async unlock(): Promise<AudioContext> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    this.ensureGraph();
    return this.ctx;
  }

  private ensureGraph(): void {
    const ctx = this.ctx;
    if (!ctx || this.master) return;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.72;
    this.master.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    this.dryGain = ctx.createGain();
    this.dryGain.gain.value = 1;
    this.dryGain.connect(this.master);

    for (const id of LANE_ORDER) {
      const g = ctx.createGain();
      g.gain.value = 0;
      const a = ctx.createAnalyser();
      a.fftSize = 256;
      a.smoothingTimeConstant = 0.5;
      a.connect(g);
      g.connect(this.master);
      this.laneGains[id] = g;
      this.laneAnalysers[id] = a;
    }
  }

  load(mix: AudioBuffer, analysis: AnalysisResult, stems: StemBuffers | null): void {
    this.stop();
    this.mix = mix;
    this.stems = stems;
    this.analysis = analysis;
    this.offset = 0;
    this.startOffset = 0;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx?.currentTime ?? 0, 0.02);
  }

  setMute(id: LaneId, mute: boolean): void {
    if (mute) this.muted.add(id);
    else this.muted.delete(id);
    this.applyLaneGains();
  }

  setSolo(id: LaneId, on: boolean): void {
    if (on) this.solo.add(id);
    else this.solo.delete(id);
    this.applyLaneGains();
  }

  clearMix(): void {
    this.muted.clear();
    this.solo.clear();
    this.applyLaneGains();
  }

  private laneAudible(id: LaneId): boolean {
    if (this.solo.size > 0) return this.solo.has(id) && !this.muted.has(id);
    return !this.muted.has(id);
  }

  private applyLaneGains(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const isolated = this.muted.size > 0 || this.solo.size > 0;
    if (this.dryGain) {
      this.dryGain.gain.setTargetAtTime(isolated ? 0 : 1, t, 0.02);
    }
    for (const id of LANE_ORDER) {
      const g = this.laneGains[id];
      if (!g) continue;
      const on = isolated && this.laneAudible(id);
      g.gain.setTargetAtTime(on ? 1 : 0, t, 0.02);
    }
  }

  currentTime(): number {
    if (!this.playing || !this.ctx) return this.offset;
    const t = this.startOffset + (this.ctx.currentTime - this.startCtxTime);
    const dur = this.mix?.duration ?? 0;
    if (t >= dur) return dur;
    return t;
  }

  seek(seconds: number): void {
    const dur = this.mix?.duration ?? 0;
    this.offset = Math.max(0, Math.min(dur, seconds));
    if (this.playing) {
      void this.play(this.offset);
    }
  }

  stop(): void {
    this.stopSources();
    this.playing = false;
    this.offset = 0;
    this.startOffset = 0;
  }

  pause(): void {
    this.offset = this.currentTime();
    this.stopSources();
    this.playing = false;
  }

  async play(from?: number): Promise<void> {
    const ctx = await this.unlock();
    if (!this.mix || !this.dryGain) return;
    this.stopSources();
    const offset = from ?? this.offset;
    this.offset = offset;
    this.startOffset = offset;
    const startAt = ctx.currentTime + 0.03;
    this.startCtxTime = startAt;
    this.playing = true;
    this.applyLaneGains();

    if (this.stems && Object.keys(this.stems).length > 0) {
      for (const id of LANE_ORDER) {
        const buf = this.stems[id];
        const analyser = this.laneAnalysers[id];
        if (!buf || !analyser) continue;
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(analyser);
        src.start(startAt, offset);
        this.sources.push(src);
      }
      const mixSrc = ctx.createBufferSource();
      mixSrc.buffer = this.mix;
      mixSrc.connect(this.dryGain);
      mixSrc.start(startAt, offset);
      mixSrc.onended = () => this.handleEnded(mixSrc);
      this.sources.push(mixSrc);
    } else {
      const src = ctx.createBufferSource();
      src.buffer = this.mix;
      src.connect(this.dryGain);
      for (const id of LANE_ORDER) {
        const spec = FILTERS[id];
        const analyser = this.laneAnalysers[id];
        if (!analyser) continue;
        const filter = ctx.createBiquadFilter();
        filter.type = spec.type;
        filter.frequency.value = spec.frequency;
        filter.Q.value = spec.Q;
        src.connect(filter);
        filter.connect(analyser);
      }
      src.start(startAt, offset);
      src.onended = () => this.handleEnded(src);
      this.sources.push(src);
    }
  }

  private handleEnded(src: AudioBufferSourceNode): void {
    if (!this.sources.includes(src)) return;
    if (!this.playing) return;
    const dur = this.mix?.duration ?? 0;
    if (this.currentTime() >= dur - 0.05) {
      this.playing = false;
      this.offset = dur;
      this.onEnded?.();
    }
  }

  private stopSources(): void {
    for (const s of this.sources) {
      try {
        s.onended = null;
        s.stop();
        s.disconnect();
      } catch {
        /* already stopped */
      }
    }
    this.sources = [];
  }

  getMasterSpectrum(out: Uint8Array): void {
    if (!this.analyser) return;
    this.analyser.getByteFrequencyData(out as never);
  }

  getLaneLevel(id: LaneId): number {
    const a = this.laneAnalysers[id];
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

  dispose(): void {
    this.stop();
    try {
      void this.ctx?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
    this.master = null;
  }
}

let engine: PlaybackEngine | null = null;

export function getEngine(): PlaybackEngine {
  if (!engine) engine = new PlaybackEngine();
  return engine;
}
