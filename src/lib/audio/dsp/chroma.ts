import { FFT, hann } from "./fft2.ts";

export const CHROMA_FFT = 8192;
export const CHROMA_HOP = 2048;
export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export interface ChromaData {
  /** Frame centre times, seconds. */
  times: Float32Array;
  chroma: Float32Array[];
  /** Same, restricted to bass register (40–260 Hz) for root evidence. */
  bass: Float32Array[];
  /** Detected deviation of the recording from A=440, in semitone fractions (−0.5..0.5). */
  tuning: number;
  /** Sum of peak weights per frame (a loudness proxy). */
  level: Float32Array;
}

interface FramePeaks {
  m: Float32Array;
  w: Float32Array;
}

/**
 * Tuning-aware chroma from sparse spectral peaks. Peaks are located with parabolic
 * interpolation (so bins ~2.7 Hz wide still resolve a semitone at 100 Hz), the
 * recording's tuning offset is estimated from the peak deviations, and each peak
 * votes for its pitch class with sqrt-compressed magnitude.
 */
export function computeChroma(
  mono: Float32Array,
  sr: number,
  onProgress?: (frac: number) => void,
): ChromaData {
  const fft = new FFT(CHROMA_FFT);
  const win = hann(CHROMA_FFT);
  const frames = Math.max(1, Math.floor((mono.length - CHROMA_FFT) / CHROMA_HOP) + 1);
  const re = new Float32Array(CHROMA_FFT);
  const im = new Float32Array(CHROMA_FFT);
  const mag = new Float32Array(CHROMA_FFT / 2);
  const binHz = sr / CHROMA_FFT;
  const kLo = Math.max(2, Math.floor(50 / binHz));
  const kHi = Math.min(CHROMA_FFT / 2 - 2, Math.ceil(2100 / binHz));
  const times = new Float32Array(frames);
  const level = new Float32Array(frames);
  const peaks: FramePeaks[] = new Array(frames);
  let sx = 0;
  let sy = 0;

  for (let f = 0; f < frames; f++) {
    const off = f * CHROMA_HOP;
    for (let i = 0; i < CHROMA_FFT; i++) {
      re[i] = (mono[off + i] ?? 0) * win[i]!;
      im[i] = 0;
    }
    fft.forward(re, im);
    let mx = 0;
    for (let k = kLo - 1; k <= kHi + 1; k++) {
      const v = Math.hypot(re[k]!, im[k]!);
      mag[k] = v;
      if (k >= kLo && k <= kHi && v > mx) mx = v;
    }
    times[f] = (off + CHROMA_FFT / 2) / sr;
    const ms: number[] = [];
    const ws: number[] = [];
    const thr = mx * 0.06;
    for (let k = kLo; k <= kHi; k++) {
      const v = mag[k]!;
      if (v < thr || v <= mag[k - 1]! || v < mag[k + 1]!) continue;
      const a = Math.log(mag[k - 1]! + 1e-9);
      const b = Math.log(v + 1e-9);
      const c = Math.log(mag[k + 1]! + 1e-9);
      const den = a - 2 * b + c;
      const delta = Math.abs(den) < 1e-9 ? 0 : (0.5 * (a - c)) / den;
      const hz = (k + delta) * binHz;
      const midi = 69 + 12 * Math.log2(hz / 440);
      const w = Math.sqrt(v / (mx + 1e-9));
      ms.push(midi);
      ws.push(w);
      if (hz >= 90 && hz <= 1600) {
        sx += w * Math.cos(2 * Math.PI * midi);
        sy += w * Math.sin(2 * Math.PI * midi);
      }
    }
    peaks[f] = { m: Float32Array.from(ms), w: Float32Array.from(ws) };
    if (onProgress && f % 200 === 0) onProgress(f / frames);
  }

  const tuning = Math.atan2(sy, sx) / (2 * Math.PI); // semitone-fraction offset of the whole recording
  const chroma: Float32Array[] = new Array(frames);
  const bass: Float32Array[] = new Array(frames);
  for (let f = 0; f < frames; f++) {
    const c = new Float32Array(12);
    const b = new Float32Array(12);
    const { m, w } = peaks[f]!;
    let lv = 0;
    for (let i = 0; i < m.length; i++) {
      const adj = m[i]! - tuning;
      const pc = (((Math.round(adj) % 12) + 12) % 12) as number;
      const hz = 440 * 2 ** ((m[i]! - 69) / 12);
      c[pc]! += w[i]!;
      lv += w[i]!;
      if (hz >= 40 && hz <= 260) b[pc]! += w[i]!;
    }
    chroma[f] = c;
    bass[f] = b;
    level[f] = lv;
  }
  return { times, chroma, bass, tuning, level };
}
