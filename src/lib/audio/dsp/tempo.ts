import { clamp01, median, movingAverage, std } from "./util.ts";

/**
 * Onset strength, tempo estimation and beat tracking.
 *
 * Onset strength is a SuperFlux-style log-band spectral flux (max-filtered reference
 * frame suppresses vibrato), detrended and normalised. Tempo uses windowed
 * autocorrelation with a log-normal tempo prior; beats come from Ellis-style
 * dynamic programming, then a robust linear fit gives a precise grid.
 */

export function onsetStrength(bandLog: Float32Array[], hopTime: number): Float32Array {
  const n = bandLog.length;
  const env = new Float32Array(n);
  const nb = bandLog[0]?.length ?? 0;
  for (let f = 1; f < n; f++) {
    const cur = bandLog[f]!;
    const prev = bandLog[f - 1]!;
    let s = 0;
    for (let b = 0; b < nb; b++) {
      const ref = Math.max(prev[Math.max(0, b - 1)]!, prev[b]!, prev[Math.min(nb - 1, b + 1)]!);
      const d = cur[b]! - ref;
      if (d > 0) s += d;
    }
    env[f] = s / Math.max(1, nb);
  }
  // Remove slowly varying level so loud sections don't dominate.
  const trend = movingAverage(env, Math.max(2, Math.round(0.4 / hopTime)));
  for (let i = 0; i < n; i++) env[i] = Math.max(0, env[i]! - trend[i]!);
  const sd = std(env);
  if (sd > 1e-9) for (let i = 0; i < n; i++) env[i]! /= sd;
  return env;
}

export interface TempoEstimate {
  bpm: number;
  confidence: number;
  candidates: { bpm: number; score: number }[];
}

const MIN_BPM = 45;
const MAX_BPM = 210;

function prior(bpm: number): number {
  const oct = Math.log2(bpm / 120);
  return Math.exp(-0.5 * (oct / 0.7) ** 2);
}

export function estimateTempo(env: Float32Array, hopTime: number): TempoEstimate {
  const n = env.length;
  const fallback: TempoEstimate = { bpm: 120, confidence: 0, candidates: [{ bpm: 120, score: 0 }] };
  if (n < 64) return fallback;

  const minLag = Math.max(2, Math.floor(60 / MAX_BPM / hopTime));
  const maxLag = Math.ceil(60 / MIN_BPM / hopTime);
  const win = Math.min(n, Math.round(10 / hopTime));
  const step = Math.max(1, Math.round(5 / hopTime));
  const ac = new Float64Array(maxLag + 2);
  let totalW = 0;

  for (let s = 0; s + win <= n || s === 0; s += step) {
    const seg = env.subarray(s, Math.min(n, s + win));
    const len = seg.length;
    let mean = 0;
    for (let i = 0; i < len; i++) mean += seg[i]!;
    mean /= len;
    let e0 = 0;
    for (let i = 0; i < len; i++) e0 += (seg[i]! - mean) ** 2;
    if (e0 < 1e-6) {
      if (s + win >= n) break;
      continue;
    }
    const top = Math.min(maxLag + 1, len - 2);
    for (let lag = minLag; lag <= top; lag++) {
      let d = 0;
      for (let i = 0; i + lag < len; i++) d += (seg[i]! - mean) * (seg[i + lag]! - mean);
      ac[lag]! += (d / e0) * (len / (len - lag)) * e0;
    }
    totalW += e0;
    if (s + win >= n) break;
  }
  if (totalW < 1e-6) return fallback;
  for (let l = 0; l < ac.length; l++) ac[l]! /= totalW;

  const at = (lag: number): number => {
    const a = Math.floor(lag);
    const f = lag - a;
    return (ac[a] ?? 0) * (1 - f) + (ac[a + 1] ?? 0) * f;
  };

  const scores: { bpm: number; raw: number; score: number }[] = [];
  for (let bpm = MIN_BPM; bpm <= MAX_BPM; bpm += 0.25) {
    const lag = 60 / bpm / hopTime;
    if (lag < minLag || lag > maxLag) continue;
    // Beat-period evidence plus support from the bar-level (2x) period.
    const raw = at(lag) + 0.3 * at(lag * 2);
    scores.push({ bpm, raw, score: raw * prior(bpm) });
  }
  if (!scores.length) return fallback;

  const peaks: { bpm: number; score: number; raw: number }[] = [];
  for (let i = 2; i < scores.length - 2; i++) {
    const s = scores[i]!;
    if (s.score > scores[i - 1]!.score && s.score >= scores[i + 1]!.score && s.score > scores[i - 2]!.score && s.score >= scores[i + 2]!.score) {
      peaks.push(s);
    }
  }
  peaks.sort((a, b) => b.score - a.score);
  const best = peaks[0] ?? scores.reduce((a, b) => (b.score > a.score ? b : a));
  const distinct: typeof peaks = [];
  for (const p of peaks) {
    if (distinct.every((d) => Math.abs(d.bpm - p.bpm) / d.bpm > 0.05)) distinct.push(p);
    if (distinct.length >= 5) break;
  }

  const all = scores.map((s) => s.raw);
  const med = median(all);
  const confidence = clamp01((best.raw - med) / 0.45);
  return {
    bpm: best.bpm,
    confidence,
    candidates: distinct.map((d) => ({ bpm: d.bpm, score: d.score })),
  };
}

/** Ellis (2007) dynamic-programming beat tracker. Returns beat times in seconds. */
export function trackBeats(env: Float32Array, hopTime: number, bpm: number, tightness = 100): number[] {
  const n = env.length;
  const P = 60 / bpm / hopTime;
  if (n < 4 || P < 2) return [];
  const lo = Math.max(1, Math.round(P / 2));
  const hi = Math.max(lo + 1, Math.round(P * 2));
  const score = new Float64Array(n);
  const back = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    let best = 0;
    let bj = -1;
    for (let j = Math.max(0, i - hi); j <= i - lo; j++) {
      const d = (i - j) / P;
      const s = score[j]! - tightness * Math.log(d) ** 2;
      if (s > best) {
        best = s;
        bj = j;
      }
    }
    score[i] = env[i]! + best;
    back[i] = bj;
  }
  // Start backtracking from the best-scoring frame in the final stretch.
  let end = n - 1;
  let top = -Infinity;
  for (let i = Math.max(0, n - Math.round(P * 1.5)); i < n; i++) {
    if (score[i]! > top) {
      top = score[i]!;
      end = i;
    }
  }
  const idx: number[] = [];
  for (let i = end; i >= 0; i = back[i]!) {
    idx.push(i);
    if (back[i] === -1) break;
  }
  idx.reverse();
  return idx.map((i) => i * hopTime);
}

export interface GridFit {
  period: number;
  /** Time of the grid's beat k=0 (may be negative-extrapolated by the caller). */
  offset: number;
  rms: number;
  inliers: number;
}

/** Robust least-squares fit of t_i = offset + k_i * period to tracked beats. */
export function fitGrid(beats: number[]): GridFit | null {
  if (beats.length < 6) return null;
  const diffs: number[] = [];
  for (let i = 1; i < beats.length; i++) diffs.push(beats[i]! - beats[i - 1]!);
  const med = median(diffs);
  if (!(med > 0)) return null;
  // Assign beat indices sequentially so a small period error never accumulates
  // into a wrong index; a missed beat shows up as a ~2x gap.
  const ks: number[] = [0];
  for (let i = 1; i < beats.length; i++) {
    ks.push(ks[i - 1]! + Math.max(1, Math.round(diffs[i - 1]! / med)));
  }
  let keep = beats.map((_, i) => i);
  let period = med;
  let offset = beats[0]!;
  for (let iter = 0; iter < 4; iter++) {
    if (keep.length < 4) return null;
    let sk = 0;
    let st = 0;
    let skk = 0;
    let skt = 0;
    for (const i of keep) {
      const k = ks[i]!;
      const t = beats[i]!;
      sk += k;
      st += t;
      skk += k * k;
      skt += k * t;
    }
    const m = keep.length;
    const den = m * skk - sk * sk;
    if (Math.abs(den) < 1e-9) return null;
    period = (m * skt - sk * st) / den;
    offset = (st - period * sk) / m;
    keep = [];
    for (let i = 0; i < beats.length; i++) {
      if (Math.abs(beats[i]! - (offset + ks[i]! * period)) < 0.15 * period) keep.push(i);
    }
  }
  let ss = 0;
  for (const i of keep) ss += (beats[i]! - (offset + ks[i]! * period)) ** 2;
  return { period, offset, rms: Math.sqrt(ss / keep.length), inliers: keep.length / beats.length };
}

export interface MeterResult {
  beatsPerBar: number;
  /** Index (0-based) into `beats` of the first downbeat. */
  phase: number;
  contrast: number;
}

/** Choose bar length (3 or 4) and which beat is the downbeat from accent strength. */
export function pickMeter(
  beats: number[],
  accent: Float32Array,
  hopTime: number,
  /** Optional per-beat evidence (0..1) that a new bar starts here, e.g. harmonic change. */
  barStart?: number[],
): MeterResult {
  const acc = beats.map((t) => {
    const f = Math.round(t / hopTime);
    let m = 0;
    for (let d = -2; d <= 2; d++) m = Math.max(m, accent[f + d] ?? 0);
    return m;
  });
  const overall0 = acc.reduce((a, b) => a + b, 0) / Math.max(1, acc.length);
  if (barStart) for (let i = 0; i < acc.length; i++) acc[i]! += 2.5 * overall0 * (barStart[i] ?? 0);
  const overall = acc.reduce((a, b) => a + b, 0) / Math.max(1, acc.length);
  const evaluate = (m: number): { phase: number; contrast: number } => {
    let bestP = 0;
    let bestV = -Infinity;
    const means: number[] = [];
    for (let p = 0; p < m; p++) {
      let s = 0;
      let c = 0;
      for (let i = p; i < acc.length; i += m) {
        s += acc[i]!;
        c++;
      }
      const v = c ? s / c : 0;
      means.push(v);
      if (v > bestV) {
        bestV = v;
        bestP = p;
      }
    }
    const rest = means.filter((_, i) => i !== bestP);
    const others = rest.reduce((a, b) => a + b, 0) / Math.max(1, rest.length);
    return { phase: bestP, contrast: (bestV - others) / Math.max(1e-6, overall) };
  };
  const m4 = evaluate(4);
  const m3 = evaluate(3);
  // Default to 4/4; only call 3/4 when the 3-beat accent pattern is clearly stronger.
  if (beats.length >= 12 && m3.contrast > 0.5 && m3.contrast > m4.contrast * 1.6) {
    return { beatsPerBar: 3, phase: m3.phase, contrast: m3.contrast };
  }
  return { beatsPerBar: 4, phase: m4.phase, contrast: m4.contrast };
}
