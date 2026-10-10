import { computeChroma, type ChromaData } from "./chroma.ts";
import { bandAt, bandLogSpectrogram } from "./spectral.ts";
import { cosine, movingAverage, normalizePeak, pearson, resample } from "./util.ts";

/**
 * How closely does a rebuilt (MIDI-rendered) part sound like the original? Scores are 0..100 where
 * 0 means "no better than a mismatched pairing of the same two signals" and 100 is identical.
 * Both signals must start at the same time (the rebuild is rendered from the same timeline); each
 * carries its own sample rate.
 */

const SR = 22050;
export type MatchLane = "kick" | "snare" | "hats" | "bass" | "chords";

const BAND_HZ: Record<"kick" | "snare" | "hats", [number, number]> = {
  kick: [35, 130],
  snare: [130, 2000],
  hats: [6500, 10500],
};

const prep = (x: Float32Array, sr: number) => normalizePeak(resample(x, sr, SR));

function rmsOf(x: Float32Array): number {
  let s = 0;
  for (let i = 0; i < x.length; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / Math.max(1, x.length));
}

/**
 * Onset envelope of one frequency band: rises in the band's linear energy. Linear (not log) so that
 * a quiet broadband transient (a snare's noise) does not register as a hit in the kick's band.
 */
function bandOnsets(x: Float32Array, lo: number, hi: number): Float32Array {
  const spec = bandLogSpectrogram(x, SR);
  const a = bandAt(spec.edges, lo);
  const b = Math.max(a + 1, bandAt(spec.edges, hi));
  const e = new Float32Array(spec.lin.length);
  for (let f = 0; f < e.length; f++) {
    let s = 0;
    for (let k = a; k < b; k++) s += spec.lin[f]![k]!;
    e[f] = s;
  }
  const env = new Float32Array(e.length);
  for (let f = 1; f < env.length; f++) env[f] = Math.max(0, e[f]! - e[f - 1]!);
  return movingAverage(env, 2);
}

function clampScore(v: number): number {
  return Math.max(0, Math.min(100, v * 100));
}

/** Rhythm match for one drum piece: correlation of the two onset envelopes in that piece's band. */
export function drumMatch(original: Float32Array, originalRate: number, rebuilt: Float32Array, rebuiltRate: number, piece: "kick" | "snare" | "hats"): number {
  const o = prep(original, originalRate);
  const r = prep(rebuilt, rebuiltRate);
  if (rmsOf(rebuilt) < 1e-5) return 0;
  const [lo, hi] = BAND_HZ[piece];
  const eo = bandOnsets(o, lo, hi);
  const er = bandOnsets(r, lo, hi);
  const n = Math.min(eo.length, er.length);
  return clampScore(pearson(eo.subarray(0, n), er.subarray(0, n)));
}

/** Mean frame cosine over frames where the original has content, minus the same measure for a shifted pairing. */
function chromaAgreement(a: Float32Array[], b: Float32Array[], level: Float32Array): number {
  const n = Math.min(a.length, b.length);
  if (n < 4) return 0;
  const sorted = Array.from(level.subarray(0, n)).sort((x, y) => x - y);
  const gate = sorted[Math.floor(n * 0.4)] ?? 0;
  const mean = (shift: number) => {
    let s = 0;
    let c = 0;
    for (let f = 0; f < n; f++) {
      if (level[f]! <= gate) continue;
      s += cosine(a[f]!, b[(f + shift) % n]!);
      c++;
    }
    return c ? s / c : 0;
  };
  const real = mean(0);
  const chance = mean(Math.max(2, Math.floor(n / 3)));
  return Math.max(0, (real - chance) / Math.max(1e-6, 1 - chance));
}

/** Harmony match: how closely the pitch-class content of the rebuilt chords follows the original's. */
export function chordMatch(original: Float32Array, originalRate: number, rebuilt: Float32Array, rebuiltRate: number): number {
  if (rmsOf(rebuilt) < 1e-5) return 0;
  const co: ChromaData = computeChroma(prep(original, originalRate), SR);
  const cr: ChromaData = computeChroma(prep(rebuilt, rebuiltRate), SR);
  return clampScore(chromaAgreement(co.chroma, cr.chroma, co.level));
}

/** Bass match: 60% bass-register pitch classes, 40% the loudness shape of the bass band. */
export function bassMatch(original: Float32Array, originalRate: number, rebuilt: Float32Array, rebuiltRate: number): number {
  if (rmsOf(rebuilt) < 1e-5) return 0;
  const o = prep(original, originalRate);
  const r = prep(rebuilt, rebuiltRate);
  const co = computeChroma(o, SR);
  const cr = computeChroma(r, SR);
  const pitch = chromaAgreement(co.bass, cr.bass, co.level);
  const so = bandLogSpectrogram(o, SR);
  const sr2 = bandLogSpectrogram(r, SR);
  const a = bandAt(so.edges, 35);
  const b = Math.max(a + 1, bandAt(so.edges, 260));
  const n = Math.min(so.lin.length, sr2.lin.length);
  const eo = new Float32Array(n);
  const er = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    for (let k = a; k < b; k++) {
      eo[f]! += so.lin[f]![k]!;
      er[f]! += sr2.lin[f]![k]!;
    }
  }
  const shape = Math.max(0, pearson(movingAverage(eo, 3), movingAverage(er, 3)));
  return clampScore(0.6 * pitch + 0.4 * shape);
}
