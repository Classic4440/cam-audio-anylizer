import type { Clip } from "../types.ts";
import { bandAt, type Spectrogram } from "./spectral.ts";
import { median, movingAverage, percentile } from "./util.ts";

/**
 * Drum hit detection from log-band flux with adaptive thresholds.
 *  kick  : flux in 35–130 Hz
 *  snare : geometric mean of body (150–400 Hz) and snap (2–7 kHz) flux. A pitched
 *          note has one without the other, a snare has both.
 *  hats  : flux above 6.5 kHz
 */

export function bandFlux(spec: Spectrogram, f0: number, f1: number): Float32Array {
  const b0 = bandAt(spec.edges, f0);
  const b1 = Math.max(b0 + 1, bandAt(spec.edges, f1));
  const out = new Float32Array(spec.frames);
  for (let f = 1; f < spec.frames; f++) {
    let s = 0;
    for (let b = b0; b < b1; b++) {
      const prev = spec.bands[f - 1]!;
      const ref = Math.max(prev[Math.max(0, b - 1)]!, prev[b]!, prev[Math.min(prev.length - 1, b + 1)]!);
      const d = spec.bands[f]![b]! - ref;
      if (d > 0) s += d;
    }
    out[f] = s / (b1 - b0);
  }
  return out;
}

/**
 * Flux on linear magnitudes. Unlike log flux this is dominated by large energy
 * jumps, so a sub-bass kick stands out while a noise burst that merely nudges the
 * low bands (snare, clap) does not.
 */
function linFlux(spec: Spectrogram, f0: number, f1: number): Float32Array {
  const b0 = bandAt(spec.edges, f0);
  const b1 = Math.max(b0 + 1, bandAt(spec.edges, f1));
  const out = new Float32Array(spec.frames);
  for (let f = 1; f < spec.frames; f++) {
    let s = 0;
    for (let b = b0; b < b1; b++) {
      const d = spec.lin[f]![b]! - spec.lin[f - 1]![b]!;
      if (d > 0) s += d;
    }
    out[f] = s;
  }
  return out;
}

function pickPeaks(env: Float32Array, hopTime: number, minSepSec: number, k: number, relFloor = 0.4): number[] {
  const n = env.length;
  const w = Math.max(3, Math.round(0.5 / hopTime));
  const base = movingAverage(env, w);
  const dev = new Float32Array(n);
  for (let i = 0; i < n; i++) dev[i] = Math.abs(env[i]! - base[i]!);
  const mad = median(dev) * 1.4826 + 1e-6;
  const floor = percentile(env, 0.5);
  const sep = Math.max(1, Math.round(minSepSec / hopTime));
  const peaks: number[] = [];
  for (let i = 2; i < n - 2; i++) {
    const x = env[i]!;
    if (x < base[i]! + k * mad || x < floor + 2 * mad) continue;
    if (x < env[i - 1]! || x < env[i + 1]! || x < env[i - 2]! || x < env[i + 2]!) continue;
    const last = peaks[peaks.length - 1];
    if (last === undefined || i - last >= sep) peaks.push(i);
    else if (x > env[last]!) peaks[peaks.length - 1] = i;
  }
  // Drop weak candidates relative to the typical strong hit: these are bleed from other
  // instruments (e.g. hats leaking into the snare band), not hits of this drum.
  if (peaks.length >= 8) {
    const heights = peaks.map((i) => env[i]!);
    const ref = percentile(heights, 0.75);
    return peaks.filter((i) => env[i]! >= relFloor * ref);
  }
  return peaks;
}

export interface DrumLanes {
  kick: Clip[];
  snare: Clip[];
  hats: Clip[];
}

export function detectDrums(
  spec: Spectrogram,
  duration: number,
  /** Seconds added to frame start to get the true onset time (window centre latency). */
  latency: number,
  grid?: { period: number; offset: number },
): DrumLanes {
  const hop = spec.hopTime;
  const kickEnv = linFlux(spec, 35, 130);
  const body = bandFlux(spec, 150, 400);
  const snap = bandFlux(spec, 2000, 7000);
  const snareEnv = new Float32Array(spec.frames);
  for (let i = 0; i < spec.frames; i++) snareEnv[i] = Math.sqrt(body[i]! * snap[i]!);
  const hatEnv = bandFlux(spec, 6500, 10500);

  // A kick's click leaks into the snare band. Real snares carry body and snap energy
  // comparable to (or above) the low-band jump; kicks are overwhelmingly low-band.
  const bodyLin = linFlux(spec, 150, 400);
  const snapLin = linFlux(spec, 2000, 7000);
  const near = (a: Float32Array, i: number): number => Math.max(a[i - 1] ?? 0, a[i] ?? 0, a[i + 1] ?? 0);
  const notKick = (i: number): boolean => {
    const low = near(kickEnv, i);
    return near(bodyLin, i) >= 0.35 * low && near(snapLin, i) >= 0.06 * low;
  };

  const make = (idx: number[], env: Float32Array, dur: number, minSnap = 0.035): Clip[] => {
    let mx = 1e-9;
    for (const i of idx) mx = Math.max(mx, env[i]!);
    const q = grid ? grid.period / 4 : 0;
    return idx.map((i) => {
      let t = Math.max(0, i * hop + latency);
      if (q > 0) {
        const g = Math.round((t - grid!.offset) / q) * q + grid!.offset;
        if (Math.abs(g - t) <= minSnap) t = Math.max(0, g);
      }
      return { start: Math.min(duration - 0.02, t), duration: dur, velocity: Math.min(1, 0.35 + 0.65 * (env[i]! / mx)) };
    });
  };

  return {
    kick: make(pickPeaks(kickEnv, hop, 0.14, 3.2), kickEnv, 0.12),
    snare: make(pickPeaks(snareEnv, hop, 0.14, 3.0).filter(notKick), snareEnv, 0.14),
    hats: make(pickPeaks(hatEnv, hop, 0.05, 2.6), hatEnv, 0.055),
  };
}
