import { lowpass } from "./util.ts";

/**
 * Makes MIDI playback resemble the analysed track:
 *  - `extractKit` cuts real kick / snare / hat one-shots out of the audio at the detected hit times.
 *  - `describeTone` measures brightness, attack and sustain of the harmonic material, and
 *    `pickPatch` maps that to one of the built-in instruments.
 * Pure functions on Float32Array so they run in Node tests and in workers.
 */

export type KitPiece = "kick" | "snare" | "hats";
export type PatchId = "piano" | "epiano" | "organ" | "pad" | "strings" | "pluck";

export const PATCHES: { id: PatchId; label: string }[] = [
  { id: "piano", label: "Piano" },
  { id: "epiano", label: "Electric piano" },
  { id: "organ", label: "Organ" },
  { id: "pad", label: "Warm pad" },
  { id: "strings", label: "Strings" },
  { id: "pluck", label: "Pluck" },
];

const WINDOW_SEC: Record<KitPiece, number> = { kick: 0.4, snare: 0.28, hats: 0.14 };
const PRE_SEC = 0.004;
const MAX_HITS_AVERAGED = 8;

function highpass(x: Float32Array, fc: number, sr: number): Float32Array {
  const lp = lowpass(x, fc, sr);
  const y = new Float32Array(x.length);
  for (let i = 0; i < x.length; i++) y[i] = x[i]! - lp[i]!;
  return y;
}

/** Keep only the band a drum piece lives in, so bass / chords bleeding into the hit are reduced. */
function bandFor(piece: KitPiece, x: Float32Array, sr: number): Float32Array {
  if (piece === "kick") return lowpass(lowpass(x, 400, sr), 400, sr);
  if (piece === "hats") return highpass(highpass(x, 5000, sr), 5000, sr);
  return highpass(lowpass(x, 9000, sr), 120, sr);
}

function rms(x: Float32Array, a: number, b: number): number {
  let s = 0;
  const lo = Math.max(0, a);
  const hi = Math.min(x.length, b);
  for (let i = lo; i < hi; i++) s += x[i]! * x[i]!;
  return Math.sqrt(s / Math.max(1, hi - lo));
}

export interface KitSample {
  piece: KitPiece;
  data: Float32Array;
  sampleRate: number;
  /** How many hits were averaged to build this one-shot. */
  hits: number;
}

/**
 * Build one one-shot per piece. For each piece the cleanest hits (little energy right before
 * the hit and no following hit inside the window) are time-aligned on their peak and averaged,
 * which keeps what the hits share (the drum) and cancels what they do not (melody, vocals).
 */
export function extractKit(
  audio: Float32Array,
  sampleRate: number,
  times: Partial<Record<KitPiece, number[]>>,
): KitSample[] {
  const out: KitSample[] = [];
  for (const piece of ["kick", "snare", "hats"] as const) {
    const hitTimes = [...(times[piece] ?? [])].sort((a, b) => a - b);
    if (hitTimes.length < 2) continue;
    const band = bandFor(piece, audio, sampleRate);
    const win = Math.floor(WINDOW_SEC[piece] * sampleRate);
    const pre = Math.floor(PRE_SEC * sampleRate);
    const search = Math.floor(0.012 * sampleRate);

    interface Cand { start: number; score: number; level: number }
    const cands: Cand[] = [];
    for (let k = 0; k < hitTimes.length; k++) {
      const centre = Math.floor(hitTimes[k]! * sampleRate);
      // Snap to the loudest sample close to the detected onset.
      let peak = centre;
      let pv = 0;
      for (let i = Math.max(0, centre - search); i < Math.min(band.length, centre + search); i++) {
        const v = Math.abs(band[i]!);
        if (v > pv) { pv = v; peak = i; }
      }
      const start = peak - pre;
      if (start < 0 || start + win > band.length || pv < 1e-4) continue;
      const nextGap = k + 1 < hitTimes.length ? (hitTimes[k + 1]! - hitTimes[k]!) * sampleRate : Infinity;
      const level = rms(band, peak, peak + Math.floor(0.03 * sampleRate));
      const before = rms(band, peak - Math.floor(0.05 * sampleRate), peak - pre);
      const tail = rms(band, peak + Math.floor(win * 0.5), peak + win);
      // Clean = loud attack, quiet before, no neighbour hit crashing into the tail.
      let score = level / (before + level * 0.15 + 1e-6);
      if (nextGap < win) score *= 0.4 * (nextGap / win);
      score *= 1 / (1 + tail / (level + 1e-6));
      cands.push({ start, score, level });
    }
    if (cands.length < 2) continue;
    cands.sort((a, b) => b.score - a.score);
    const chosen = cands.slice(0, Math.min(MAX_HITS_AVERAGED, cands.length));

    const sum = new Float32Array(win);
    for (const c of chosen) {
      // Normalise each hit so one very loud hit does not dominate the average.
      const g = 1 / (c.level + 1e-6);
      for (let i = 0; i < win; i++) sum[i]! += band[c.start + i]! * g;
    }
    let peak = 0;
    for (let i = 0; i < win; i++) peak = Math.max(peak, Math.abs(sum[i]!));
    if (peak < 1e-9) continue;
    const norm = 0.9 / peak;
    // Short fade in (click guard) and a fade out over the last 30% so the tail does not stop abruptly.
    const fadeIn = Math.floor(0.0015 * sampleRate);
    const fadeStart = Math.floor(win * 0.7);
    for (let i = 0; i < win; i++) {
      let g = norm;
      if (i < fadeIn) g *= i / fadeIn;
      if (i > fadeStart) g *= 1 - (i - fadeStart) / (win - fadeStart);
      sum[i]! *= g;
    }
    out.push({ piece, data: sum, sampleRate, hits: chosen.length });
  }
  return out;
}

export interface ToneProfile {
  /** Spectral centroid in Hz of the harmonic material (higher = brighter). */
  centroid: number;
  /** Seconds for note-like events to reach their peak (small = percussive attack). */
  attack: number;
  /** 0..1, how much of the peak level remains 250 ms later (1 = sustained / organ-like). */
  sustain: number;
}

/** Short real DFT magnitude via a naive Goertzel bank; cheap enough for a few hundred frames. */
function centroidOf(frame: Float32Array, sr: number): number {
  const n = frame.length;
  const bins = 48;
  const fMin = 120;
  const fMax = Math.min(8000, sr / 2 - 100);
  let num = 0;
  let den = 0;
  for (let b = 0; b < bins; b++) {
    const f = fMin * (fMax / fMin) ** (b / (bins - 1));
    const w = (2 * Math.PI * f) / sr;
    const coeff = 2 * Math.cos(w);
    let s1 = 0;
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
      const s0 = frame[i]! * hann + coeff * s1 - s2;
      s2 = s1;
      s1 = s0;
    }
    const mag = Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2));
    num += f * mag;
    den += mag;
  }
  return den > 1e-9 ? num / den : 1000;
}

/** Measure the tone of `audio` (ideally the "other" stem, otherwise the full mix). */
export function describeTone(audio: Float32Array, sampleRate: number, maxSeconds = 90): ToneProfile {
  const total = Math.min(audio.length, Math.floor(maxSeconds * sampleRate));
  // Brightness: average centroid over loud frames.
  const frameLen = 2048;
  const hop = Math.max(frameLen, Math.floor(total / 160));
  let cSum = 0;
  let cW = 0;
  for (let p = 0; p + frameLen <= total; p += hop) {
    const fr = audio.subarray(p, p + frameLen);
    const e = rms(fr, 0, frameLen);
    if (e < 0.004) continue;
    cSum += centroidOf(fr, sampleRate) * e;
    cW += e;
  }
  const centroid = cW > 0 ? cSum / cW : 1200;

  // Envelope at 100 Hz for attack / sustain.
  const eHop = Math.floor(sampleRate / 100);
  const env: number[] = [];
  for (let p = 0; p + eHop <= total; p += eHop) env.push(rms(audio, p, p + eHop));
  let atkSum = 0;
  let atkN = 0;
  let susSum = 0;
  let susN = 0;
  const peakEnv = Math.max(...env, 1e-9);
  for (let i = 2; i < env.length - 30; i++) {
    const v = env[i]!;
    // An onset: a clear rise over the preceding frames and a local loudness worth measuring.
    if (v < peakEnv * 0.2 || v < env[i - 1]! * 1.15 || env[i - 1]! > env[i - 2]! * 1.15) continue;
    let top = v;
    let topAt = i;
    for (let j = i; j < Math.min(env.length, i + 25); j++) {
      if (env[j]! > top) { top = env[j]!; topAt = j; }
    }
    atkSum += (topAt - i + 1) / 100;
    atkN++;
    susSum += Math.min(1, env[Math.min(env.length - 1, topAt + 25)]! / (top + 1e-9));
    susN++;
    i += 12;
  }
  return {
    centroid,
    attack: atkN ? atkSum / atkN : 0.05,
    sustain: susN ? susSum / susN : 0.6,
  };
}

/** Choose the built-in instrument whose character is closest to the measured tone. */
export function pickPatch(t: ToneProfile): PatchId {
  const percussive = t.attack < 0.04;
  const sustained = t.sustain > 0.7;
  if (percussive && !sustained) return t.centroid > 1800 ? "pluck" : "piano";
  if (percussive) return t.centroid > 1500 ? "epiano" : "piano";
  if (sustained) return t.centroid > 2200 ? "organ" : t.attack > 0.1 ? "strings" : "pad";
  return t.centroid > 1500 ? "epiano" : "pad";
}

/** Map the measured centroid to a 0..1 brightness setting for the synth's filter. */
export function brightnessFrom(t: ToneProfile): number {
  const oct = Math.log2(Math.max(200, Math.min(6000, t.centroid)) / 200) / Math.log2(30);
  return Math.max(0.1, Math.min(1, oct));
}
