import type { AnalysisResult, ChordEvent, Clip, LaneId } from "./types.ts";
import { detectBassNotes } from "./dsp/bass.ts";
import { computeChroma, type ChromaData } from "./dsp/chroma.ts";
import { bandFlux, detectDrums } from "./dsp/drums.ts";
import { detectChords, detectKey } from "./dsp/key-chords.ts";
import { detectSections } from "./dsp/sections.ts";
import { bandAt, bandLogSpectrogram, FFT_SIZE } from "./dsp/spectral.ts";
import { estimateTempo, fitGrid, onsetStrength, pickMeter, trackBeats } from "./dsp/tempo.ts";
import { cosine, median, normalizePeak, percentile, resample, std, toMono } from "./dsp/util.ts";

/** Bump when detection algorithms change. */
export const ANALYSIS_VERSION = 2;

export type AnalyzeProgress = (pct: number, label: string) => void;

export interface PcmInput {
  channels: Float32Array[];
  sampleRate: number;
  fileName: string;
}

const ANALYSIS_SR = 22050;

function waveformPeaks(samples: Float32Array, bins = 2400): { min: Float32Array; max: Float32Array } {
  const n = Math.min(bins, Math.max(64, Math.floor(samples.length / 32)));
  const min = new Float32Array(n);
  const max = new Float32Array(n);
  const step = samples.length / n;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * step);
    const b = Math.min(samples.length, Math.floor((i + 1) * step));
    let lo = 0;
    let hi = 0;
    for (let j = a; j < b; j++) {
      const v = samples[j] ?? 0;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[i] = lo;
    max[i] = hi;
  }
  return { min, max };
}

export function regionsFromEnvelope(env: Float32Array, rate: number, duration: number, thresh: number, minDur: number): Clip[] {
  const clips: Clip[] = [];
  let start: number | null = null;
  let peak = 0;
  for (let i = 0; i < env.length; i++) {
    const v = env[i] ?? 0;
    if (v >= thresh) {
      if (start === null) {
        start = i / rate;
        peak = v;
      } else if (v > peak) peak = v;
    } else if (start !== null) {
      const end = i / rate;
      if (end - start >= minDur) clips.push({ start, duration: Math.min(duration - start, end - start), velocity: peak });
      start = null;
      peak = 0;
    }
  }
  if (start !== null) clips.push({ start, duration: Math.max(minDur, duration - start), velocity: peak });
  return clips;
}

function refitOffset(beats: number[], period: number): number {
  const r: number[] = [];
  for (const t of beats) {
    const k = Math.round((t - beats[0]!) / period);
    r.push(t - k * period);
  }
  return median(r) + 0; // offset of beat k=0 relative to beats[0]'s lattice
}

/** Per-beat evidence that the harmony changes at this beat (new bars usually start with a new chord). */
function harmonicChange(chroma: ChromaData, beats: number[]): number[] {
  const seg: Float32Array[] = [];
  for (let i = 0; i < beats.length; i++) {
    const a = beats[i]!;
    const b = beats[i + 1] ?? a + 0.5;
    const v = new Float32Array(12);
    let n = 0;
    for (let f = 0; f < chroma.times.length; f++) {
      const t = chroma.times[f]!;
      if (t < a) continue;
      if (t >= b) break;
      let s = 0;
      for (let k = 0; k < 12; k++) s += chroma.chroma[f]![k]!;
      if (s > 1e-6) for (let k = 0; k < 12; k++) v[k]! += chroma.chroma[f]![k]! / s;
      n++;
    }
    seg.push(v);
    void n;
  }
  return seg.map((v, i) => (i === 0 ? 0 : Math.max(0, 1 - cosine(seg[i - 1]!, v))));
}

export function analyzePcm(input: PcmInput, report: AnalyzeProgress = () => undefined): AnalysisResult {
  report(3, "Reading waveform");
  const sr0 = input.sampleRate;
  const monoFull = toMono(input.channels);
  const duration = monoFull.length / sr0;
  const waveform = waveformPeaks(monoFull);

  report(8, "Preparing audio");
  const mono = normalizePeak(resample(monoFull, sr0, ANALYSIS_SR));
  const sr = Math.abs(sr0 - ANALYSIS_SR) < 1 ? sr0 : ANALYSIS_SR;
  const latency = FFT_SIZE / 2 / sr;

  report(12, "Scanning frequencies");
  const spec = bandLogSpectrogram(mono, sr, (f) => report(12 + f * 24, "Scanning frequencies"));
  const hop = spec.hopTime;

  report(38, "Finding tempo");
  const env = onsetStrength(spec.bands, hop);
  const tempo = estimateTempo(env, hop);
  const rawBeats = trackBeats(env, hop, tempo.bpm).map((t) => t + latency);
  const fit = fitGrid(rawBeats);

  let bpm = tempo.bpm;
  let regularity = 0;
  let constantGrid = false;
  let offset = rawBeats[0] ?? 0;
  if (fit && fit.inliers > 0.6 && Math.abs(60 / fit.period - tempo.bpm) / tempo.bpm < 0.06) {
    bpm = 60 / fit.period;
    offset = fit.offset;
    regularity = Math.max(0, 1 - fit.rms / 0.03) * fit.inliers;
    constantGrid = fit.rms < 0.025;
  }
  // Most produced music sits on integer tempos; snap when the estimate is already that close.
  const snapped = Math.round(bpm);
  if (Math.abs(bpm - snapped) < 0.12 && constantGrid) {
    bpm = snapped;
    const period = 60 / bpm;
    const fixed = rawBeats.filter((_, i) => i < 400);
    const lattice = fixed.map((t) => t - Math.round((t - fixed[0]!) / period) * period);
    offset = fixed[0]! + (median(lattice) - fixed[0]!);
  }
  bpm = Math.round(bpm * 100) / 100;
  const period = 60 / bpm;

  let beats: number[] = [];
  if (constantGrid || !rawBeats.length) {
    // A beat a few ms before 0 still belongs to the track (the first hit is often at 0).
    const start = offset - Math.floor((offset + 0.03) / period) * period;
    for (let t = start; t < duration - 0.01; t += period) beats.push(Math.max(0, t));
  } else {
    beats = rawBeats.filter((t) => t >= 0 && t < duration);
  }

  report(44, "Tracking harmony");
  const chroma = computeChroma(mono, sr, (f) => report(44 + f * 20, "Tracking harmony"));

  report(66, "Reading the bar");
  const lowEnv = bandFlux(spec, 35, 130);
  const lsd = std(lowEnv) || 1;
  const accent = new Float32Array(env.length);
  for (let i = 0; i < env.length; i++) accent[i] = env[i]! + lowEnv[i]! / lsd;
  const meter = pickMeter(beats.map((t) => t - latency), accent, hop, harmonicChange(chroma, beats));
  const bpb = meter.beatsPerBar;
  const downbeats: number[] = [];
  for (let i = meter.phase; i < beats.length; i += bpb) downbeats.push(beats[i]!);
  const beatOffset = beats[meter.phase] ?? offset;
  void refitOffset;

  const key = detectKey(chroma);
  report(72, "Detecting chords");
  const chords: ChordEvent[] = detectChords(chroma, beats, { root: key.root, mode: key.mode }, duration);

  report(80, "Placing drum hits");
  const drums = detectDrums(spec, duration, latency, { period, offset: beatOffset });

  report(86, "Following the bass");
  const bassClips = detectBassNotes(mono, sr, duration);

  report(92, "Reading structure");
  const barStarts = downbeats.length >= 2 ? downbeats : beats.filter((_, i) => i % bpb === 0);
  const sections = detectSections(spec, chroma, barStarts.length ? barStarts : [0], duration);

  // Envelopes (display + vocal presence)
  const envRate = 40;
  const envN = Math.max(8, Math.ceil(duration * envRate));
  const range = (f0: number, f1: number): Float32Array => {
    const b0 = bandAt(spec.edges, f0);
    const b1 = Math.max(b0 + 1, bandAt(spec.edges, f1));
    const out = new Float32Array(spec.frames);
    for (let f = 0; f < spec.frames; f++) {
      let s = 0;
      for (let b = b0; b < b1; b++) s += spec.lin[f]![b]! ** 2;
      out[f] = s;
    }
    return out;
  };
  const resampleEnv = (src: Float32Array): Float32Array => {
    const out = new Float32Array(envN);
    let max = 1e-9;
    for (let i = 0; i < src.length; i++) max = Math.max(max, src[i]!);
    for (let i = 0; i < envN; i++) {
      const f = ((i / envN) * duration) / hop;
      const a = Math.floor(f);
      const b = Math.min(spec.frames - 1, a + 1);
      const fr = f - a;
      out[i] = ((1 - fr) * (src[a] ?? 0) + fr * (src[b] ?? 0)) / max;
    }
    return out;
  };
  const envelopes: AnalysisResult["envelopes"] = {
    master: resampleEnv(spec.rms),
    kick: resampleEnv(range(35, 130)),
    snare: resampleEnv(range(130, 2000)),
    hats: resampleEnv(range(6500, 10500)),
    bass: resampleEnv(range(35, 260)),
    vocals: resampleEnv(range(300, 3400)),
    chords: resampleEnv(range(130, 2000)),
  };
  const vocalThresh = Math.max(0.25, percentile(envelopes.vocals, 0.55));
  const percussiveFlux = bandFlux(spec, 35, 10500);
  const vocalClips = regionsFromEnvelope(envelopes.vocals, envRate, duration, vocalThresh, 0.28).filter((c) => {
    const f = Math.min(spec.frames - 1, Math.round((c.start + c.duration / 2) / hop));
    return (percussiveFlux[f] ?? 0) < 0.5;
  });

  const chordClips: Clip[] = chords.map((c) => ({
    start: c.start,
    duration: c.duration,
    velocity: 0.85,
    label: c.name,
    pitch: 60 + c.root,
  }));

  const lanes: Record<LaneId, Clip[]> = {
    kick: drums.kick,
    snare: drums.snare,
    hats: drums.hats,
    bass: bassClips,
    vocals: vocalClips,
    chords: chordClips,
  };

  report(100, "Analysis ready");
  const bpmConfidence = Math.min(1, 0.5 * tempo.confidence + 0.5 * regularity);
  const cands = new Set<number>();
  for (const c of tempo.candidates) cands.add(Math.round(c.bpm * 10) / 10);
  if (bpm / 2 >= 45) cands.add(Math.round((bpm / 2) * 10) / 10);
  if (bpm * 2 <= 210) cands.add(Math.round(bpm * 2 * 10) / 10);
  cands.delete(Math.round(bpm * 10) / 10);

  return {
    duration,
    sampleRate: sr0,
    bpm,
    beatOffset,
    timeSignature: [bpb, 4],
    key: key.key,
    keyMode: key.mode,
    waveform,
    beats,
    downbeats,
    lanes,
    envelopes,
    envelopeRate: envRate,
    chords,
    sections,
    energy: envelopes.master,
    source: "file",
    fileName: input.fileName,
    bpmConfidence,
    keyConfidence: key.confidence,
    bpmCandidates: [...cands].slice(0, 5),
    keyCandidates: key.candidates,
    tuningCents: Math.round(chroma.tuning * 100),
    analysisVersion: ANALYSIS_VERSION,
  };
}
