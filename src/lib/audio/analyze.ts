import { fftRadix2, hzBin, makeHann } from "./fft";
import type {
  AnalysisResult,
  ChordEvent,
  Clip,
  LaneId,
  SectionMarker,
} from "./types";
import { LANE_ORDER } from "./types";

const FFT_SIZE = 2048;
const HOP = 512;
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

type ChordQuality = ChordEvent["quality"];

const CHORD_TEMPLATES: { quality: ChordQuality; v: number[] }[] = [
  { quality: "maj", v: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0] },
  { quality: "min", v: [1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0] },
  { quality: "7", v: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0] },
  { quality: "sus", v: [1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0] },
];

export type AnalyzeProgress = (pct: number, label: string) => void;

function maxOf(arr: ArrayLike<number>, floor = 0): number {
  let m = floor;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i] ?? 0;
    if (v > m) m = v;
  }
  return m;
}

function yieldFrame(): Promise<void> {
  return new Promise((r) => setTimeout(r, 0));
}

function toMono(buffer: AudioBuffer): Float32Array {
  const n = buffer.length;
  const out = new Float32Array(n);
  const chs = buffer.numberOfChannels;
  for (let c = 0; c < chs; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < n; i++) out[i] += d[i] ?? 0;
  }
  if (chs > 1) {
    const inv = 1 / chs;
    for (let i = 0; i < n; i++) out[i]! *= inv;
  }
  return out;
}

function downsample(input: Float32Array, from: number, to: number): Float32Array {
  if (from <= to * 1.05) return input;
  const ratio = from / to;
  const n = Math.floor(input.length / ratio);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.max(start + 1, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let j = start; j < end && j < input.length; j++) s += input[j] ?? 0;
    out[i] = s / (end - start);
  }
  return out;
}

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

function rotate(arr: number[], k: number): number[] {
  const n = arr.length;
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = arr[(i - k + n) % n]!;
  return out;
}

function cosine(a: number[] | Float32Array, b: number[] | Float32Array): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na < 1e-12 || nb < 1e-12) return 0;
  return dot / Math.sqrt(na * nb);
}

function peakPick(env: Float32Array, minSep: number, k = 1.6): number[] {
  const peaks: number[] = [];
  let mean = 0;
  for (let i = 0; i < env.length; i++) mean += env[i] ?? 0;
  mean /= Math.max(1, env.length);
  let v = 0;
  for (let i = 0; i < env.length; i++) {
    const d = (env[i] ?? 0) - mean;
    v += d * d;
  }
  const std = Math.sqrt(v / Math.max(1, env.length));
  const thr = mean + k * std;
  for (let i = 2; i < env.length - 2; i++) {
    const x = env[i] ?? 0;
    if (
      x > thr &&
      x >= (env[i - 1] ?? 0) &&
      x >= (env[i + 1] ?? 0) &&
      x >= (env[i - 2] ?? 0) &&
      x >= (env[i + 2] ?? 0)
    ) {
      const last = peaks[peaks.length - 1];
      if (last === undefined || i - last >= minSep) peaks.push(i);
      else if (x > (env[last] ?? 0)) peaks[peaks.length - 1] = i;
    }
  }
  return peaks;
}

function quantizeTime(t: number, grid: number, window: number): number {
  const q = Math.round(t / grid) * grid;
  return Math.abs(q - t) <= window ? Math.max(0, q) : t;
}

function regionsFromEnvelope(
  env: Float32Array,
  rate: number,
  duration: number,
  thresh: number,
  minDur: number,
): Clip[] {
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
      if (end - start >= minDur) {
        clips.push({ start, duration: Math.min(duration - start, end - start), velocity: peak });
      }
      start = null;
      peak = 0;
    }
  }
  if (start !== null) {
    clips.push({
      start,
      duration: Math.max(minDur, duration - start),
      velocity: peak,
    });
  }
  return clips;
}

function chordName(root: number, quality: ChordQuality): string {
  const n = NOTE_NAMES[root] ?? "C";
  if (quality === "maj") return n;
  if (quality === "min") return `${n}m`;
  if (quality === "7") return `${n}7`;
  if (quality === "maj7") return `${n}maj7`;
  if (quality === "sus") return `${n}sus`;
  return `${n}dim`;
}

function detectKey(chroma: Float32Array): { key: string; mode: "major" | "minor" } {
  let best = -Infinity;
  let root = 0;
  let mode: "major" | "minor" = "minor";
  for (let r = 0; r < 12; r++) {
    const maj = cosine(chroma, rotate(MAJOR_PROFILE, r));
    const min = cosine(chroma, rotate(MINOR_PROFILE, r));
    if (maj > best) {
      best = maj;
      root = r;
      mode = "major";
    }
    if (min > best) {
      best = min;
      root = r;
      mode = "minor";
    }
  }
  const name = NOTE_NAMES[root] ?? "A";
  return { key: mode === "major" ? `${name} major` : `${name} minor`, mode };
}

function matchChord(chroma: Float32Array): { root: number; quality: ChordQuality; score: number } {
  let best = -Infinity;
  let root = 0;
  let quality: ChordQuality = "maj";
  for (let r = 0; r < 12; r++) {
    for (const t of CHORD_TEMPLATES) {
      const s = cosine(chroma, rotate(t.v, r));
      if (s > best) {
        best = s;
        root = r;
        quality = t.quality;
      }
    }
  }
  return { root, quality, score: best };
}

export async function analyzeAudioBuffer(
  buffer: AudioBuffer,
  fileName: string,
  onProgress?: AnalyzeProgress,
): Promise<AnalysisResult> {
  const report = onProgress ?? (() => undefined);
  report(4, "Reading waveform");

  const origSr = buffer.sampleRate;
  const duration = buffer.duration;
  const monoFull = toMono(buffer);
  const waveform = waveformPeaks(monoFull);
  await yieldFrame();

  report(12, "Preparing spectrum");
  const targetSr = 22050;
  const sr = origSr > 24000 ? targetSr : origSr;
  const mono = origSr > 24000 ? downsample(monoFull, origSr, targetSr) : monoFull;

  const hann = makeHann(FFT_SIZE);
  const frames = Math.max(1, Math.floor((mono.length - FFT_SIZE) / HOP));
  const flux = new Float32Array(frames);
  const lowFlux = new Float32Array(frames);
  const midFlux = new Float32Array(frames);
  const highFlux = new Float32Array(frames);
  const lowE = new Float32Array(frames);
  const bassE = new Float32Array(frames);
  const midE = new Float32Array(frames);
  const highE = new Float32Array(frames);
  const vocalE = new Float32Array(frames);
  const rms = new Float32Array(frames);
  const chromaSum = new Float32Array(12);
  const chromaFrames: Float32Array[] = new Array(frames);

  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);
  const prev = new Float32Array(FFT_SIZE / 2);
  const kKick = hzBin(90, sr, FFT_SIZE);
  const kBass = hzBin(250, sr, FFT_SIZE);
  const kMid = hzBin(2000, sr, FFT_SIZE);
  const kHigh = hzBin(7000, sr, FFT_SIZE);
  const kVox0 = hzBin(300, sr, FFT_SIZE);
  const kVox1 = hzBin(3400, sr, FFT_SIZE);
  const kCh0 = hzBin(80, sr, FFT_SIZE);
  const kCh1 = hzBin(5000, sr, FFT_SIZE);
  const nyq = FFT_SIZE / 2;

  report(18, "Scanning frequencies");
  for (let f = 0; f < frames; f++) {
    const off = f * HOP;
    for (let i = 0; i < FFT_SIZE; i++) {
      re[i] = (mono[off + i] ?? 0) * (hann[i] ?? 0);
      im[i] = 0;
    }
    fftRadix2(re, im);

    let fl = 0;
    let ll = 0;
    let ml = 0;
    let hl = 0;
    let le = 0;
    let be = 0;
    let me = 0;
    let he = 0;
    let ve = 0;
    let energy = 0;
    const chroma = new Float32Array(12);

    for (let k = 1; k < nyq; k++) {
      const mag = Math.hypot(re[k] ?? 0, im[k] ?? 0);
      const d = mag - (prev[k] ?? 0) * 0.9;
      const pos = d > 0 ? d : 0;
      fl += pos;
      if (k <= kKick) ll += pos;
      else if (k <= kMid) ml += pos;
      else hl += pos;
      const p = mag * mag;
      energy += p;
      if (k <= kKick) le += p;
      if (k <= kBass) be += p;
      if (k > kKick && k <= kMid) me += p;
      if (k >= kHigh) he += p;
      if (k >= kVox0 && k <= kVox1) ve += p;
      if (k >= kCh0 && k <= kCh1) {
        const hz = (k * sr) / FFT_SIZE;
        const midi = 69 + 12 * Math.log2(Math.max(hz, 1) / 440);
        const pc = ((Math.round(midi) % 12) + 12) % 12;
        chroma[pc] += mag;
      }
      prev[k] = mag;
    }

    flux[f] = fl;
    lowFlux[f] = ll;
    midFlux[f] = ml;
    highFlux[f] = hl;
    lowE[f] = le;
    bassE[f] = be;
    midE[f] = me;
    highE[f] = he;
    vocalE[f] = ve;
    let s = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      const x = mono[off + i] ?? 0;
      s += x * x;
    }
    rms[f] = Math.sqrt(s / FFT_SIZE);
    chromaFrames[f] = chroma;
    for (let i = 0; i < 12; i++) chromaSum[i] += chroma[i] ?? 0;

    if (f % 220 === 0) {
      report(18 + Math.round((f / frames) * 42), "Scanning frequencies");
      await yieldFrame();
    }
  }

  const hopTime = HOP / sr;
  const smooth = (src: Float32Array, w = 3): Float32Array => {
    const out = new Float32Array(src.length);
    for (let i = 0; i < src.length; i++) {
      let s = 0;
      let c = 0;
      for (let j = -w; j <= w; j++) {
        const v = src[i + j];
        if (v !== undefined) {
          s += v;
          c++;
        }
      }
      out[i] = s / Math.max(1, c);
    }
    return out;
  };

  report(64, "Finding tempo");
  const onset = smooth(flux, 2);
  const maxOn = maxOf(onset, 1e-6);
  for (let i = 0; i < onset.length; i++) onset[i] = (onset[i] ?? 0) / maxOn;

  const minBpm = 70;
  const maxBpm = 180;
  let bestBpm = 120;
  let bestScore = -Infinity;
  let bestPhase = 0;
  for (let bpm = minBpm; bpm <= maxBpm; bpm += 0.5) {
    const period = 60 / bpm / hopTime;
    if (period < 2) continue;
    let phaseScore = -Infinity;
    let phase = 0;
    const steps = Math.max(4, Math.min(24, Math.round(period)));
    for (let p = 0; p < steps; p++) {
      const ph = (p / steps) * period;
      let s = 0;
      let n = 0;
      for (let i = ph; i < onset.length; i += period) {
        s += onset[i | 0] ?? 0;
        n++;
      }
      const val = n ? s / n : 0;
      if (val > phaseScore) {
        phaseScore = val;
        phase = ph;
      }
    }
    const prior = Math.exp(-0.5 * ((bpm - 120) / 28) ** 2);
    const score = phaseScore * prior;
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
      bestPhase = phase;
    }
  }

  // Prefer half/double if closer to 110–130
  for (const mul of [0.5, 2]) {
    const bpm = bestBpm * mul;
    if (bpm < minBpm || bpm > maxBpm) continue;
    const dist = Math.abs(bpm - 120);
    const dist0 = Math.abs(bestBpm - 120);
    if (dist + 8 < dist0) bestBpm = bpm;
  }
  bestBpm = Math.round(bestBpm * 10) / 10;

  const beatPeriod = 60 / bestBpm;
  const beatOffset = (bestPhase * hopTime) % beatPeriod;
  const beats: number[] = [];
  const downbeats: number[] = [];
  for (let t = beatOffset; t < duration - 0.01; t += beatPeriod) {
    beats.push(t);
    const idx = Math.round((t - beatOffset) / beatPeriod);
    if (idx % 4 === 0) downbeats.push(t);
  }

  report(74, "Placing kicks and hats");
  const frameOf = (t: number) => Math.max(0, Math.min(frames - 1, Math.round(t / hopTime)));
  const grid = beatPeriod / 4;
  const hitsFrom = (env: Float32Array, minSepSec: number, k: number, dur: number): Clip[] => {
    const sep = Math.max(1, Math.round(minSepSec / hopTime));
    const idxs = peakPick(env, sep, k);
    let maxV = 1e-6;
    const raw = idxs.map((i) => {
      const t = i * hopTime;
      const v = env[i] ?? 0;
      if (v > maxV) maxV = v;
      return { t, v };
    });
    return raw.map(({ t, v }) => {
      const q = quantizeTime(t, grid, 0.04);
      return {
        start: Math.min(duration - 0.02, Math.max(0, q)),
        duration: dur,
        velocity: v / maxV,
      };
    });
  };

  const kickClips = hitsFrom(lowFlux, 0.18, 1.15, 0.12);
  const snareClips = hitsFrom(midFlux, 0.16, 1.35, 0.14).filter((c) => {
    const f = frameOf(c.start);
    return (highE[f] ?? 0) > 0 || (midE[f] ?? 0) > 0;
  });
  const hatClips = hitsFrom(highFlux, 0.045, 0.85, 0.055);

  report(82, "Reading bass and vocals");
  const envRate = 40;
  const envN = Math.max(8, Math.ceil(duration * envRate));
  const resampleEnv = (src: Float32Array): Float32Array => {
    const out = new Float32Array(envN);
    const max = maxOf(src, 1e-9);
    for (let i = 0; i < envN; i++) {
      const t = (i / envN) * duration;
      const f = t / hopTime;
      const a = Math.floor(f);
      const b = Math.min(frames - 1, a + 1);
      const frac = f - a;
      const v = (1 - frac) * (src[a] ?? 0) + frac * (src[b] ?? 0);
      out[i] = v / max;
    }
    return out;
  };

  const envelopes: AnalysisResult["envelopes"] = {
    master: resampleEnv(rms),
    kick: resampleEnv(lowE),
    snare: resampleEnv(midE),
    hats: resampleEnv(highE),
    bass: resampleEnv(bassE),
    vocals: resampleEnv(vocalE),
    chords: resampleEnv(midE),
  };

  const bassClips = regionsFromEnvelope(envelopes.bass, envRate, duration, 0.22, 0.18);
  const vocalRaw = regionsFromEnvelope(envelopes.vocals, envRate, duration, 0.28, 0.28);
  const vocalClips = vocalRaw.filter((c) => {
    const f = frameOf(c.start + c.duration / 2);
    const percussive = (lowFlux[f] ?? 0) + (highFlux[f] ?? 0);
    return percussive < (flux[f] ?? 1) * 1.8;
  });

  report(90, "Detecting chords");
  const chords: ChordEvent[] = [];
  if (beats.length) {
    let lastName = "";
    for (let b = 0; b < beats.length; b++) {
      const t0 = beats[b]!;
      const t1 = beats[b + 1] ?? duration;
      const f0 = frameOf(t0);
      const f1 = frameOf(t1);
      const chroma = new Float32Array(12);
      for (let f = f0; f <= f1; f++) {
        const c = chromaFrames[f];
        if (!c) continue;
        for (let i = 0; i < 12; i++) chroma[i] += c[i] ?? 0;
      }
      const match = matchChord(chroma);
      const name = chordName(match.root, match.quality);
      const energyBeat = (rms[f0] ?? 0) + (midE[f0] ?? 0);
      if (match.score < 0.55 || energyBeat < 1e-8) continue;
      if (name === lastName && chords.length) {
        const prevC = chords[chords.length - 1]!;
        prevC.duration = t1 - prevC.start;
      } else {
        chords.push({
          start: t0,
          duration: t1 - t0,
          name,
          root: match.root,
          quality: match.quality,
        });
        lastName = name;
      }
    }
  }

  const chordClips: Clip[] = chords.map((c) => ({
    start: c.start,
    duration: c.duration,
    velocity: 0.85,
    label: c.name,
    pitch: 60 + c.root,
  }));

  const { key, mode } = detectKey(chromaSum);

  const barLen = beatPeriod * 4;
  const sections: SectionMarker[] = [];
  const barCount = Math.max(1, Math.floor(duration / barLen));
  const barEnergy: number[] = [];
  for (let i = 0; i < barCount; i++) {
    const t0 = beatOffset + i * barLen;
    const f0 = frameOf(t0);
    const f1 = frameOf(t0 + barLen);
    let s = 0;
    let n = 0;
    for (let f = f0; f < f1; f++) {
      s += rms[f] ?? 0;
      n++;
    }
    barEnergy.push(n ? s / n : 0);
  }
  const meanBar = barEnergy.reduce((a, b) => a + b, 0) / Math.max(1, barEnergy.length);
  let secStart = 0;
  let secName = "Intro";
  const nameFor = (i: number, e: number): string => {
    if (i === 0) return "Intro";
    if (e > meanBar * 1.18) return "Drop";
    if (e < meanBar * 0.72) return "Break";
    return "Verse";
  };
  for (let i = 1; i < barEnergy.length; i++) {
    const n = nameFor(i, barEnergy[i] ?? 0);
    if (n !== secName) {
      const start = beatOffset + secStart * barLen;
      sections.push({
        start,
        duration: (i - secStart) * barLen,
        name: secName,
      });
      secStart = i;
      secName = n;
    }
  }
  sections.push({
    start: beatOffset + secStart * barLen,
    duration: duration - (beatOffset + secStart * barLen),
    name: secName,
  });

  const energy = envelopes.master;

  const lanes: Record<LaneId, Clip[]> = {
    kick: kickClips,
    snare: snareClips,
    hats: hatClips,
    bass: bassClips,
    vocals: vocalClips,
    chords: chordClips,
  };

  report(100, "Playlist ready");

  return {
    duration,
    sampleRate: origSr,
    bpm: bestBpm,
    beatOffset,
    timeSignature: [4, 4],
    key,
    keyMode: mode,
    waveform,
    beats,
    downbeats,
    lanes,
    envelopes,
    envelopeRate: envRate,
    chords,
    sections,
    energy,
    source: "file",
    fileName,
  };
}

export function emptyEnvelopes(n: number): AnalysisResult["envelopes"] {
  const z = new Float32Array(n);
  return {
    master: z,
    kick: z,
    snare: z,
    hats: z,
    bass: z,
    vocals: z,
    chords: z,
  };
}

export { LANE_ORDER };
