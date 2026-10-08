import { FFT, hann } from "./fft2.ts";

export const FFT_SIZE = 2048;
export const HOP = 512;
export const N_BANDS = 40;

export interface Spectrogram {
  sr: number;
  hopTime: number;
  frames: number;
  /** Log-compressed band magnitudes, [frame][band]. Used for onsets. */
  bands: Float32Array[];
  /** Linear band magnitudes, [frame][band]. Used for envelopes and lane detection. */
  lin: Float32Array[];
  /** Band centre frequencies in Hz. */
  centers: Float32Array;
  /** Band lower edges (length N_BANDS+1). */
  edges: Float32Array;
  rms: Float32Array;
}

export function makeBandEdges(sr: number, nBands = N_BANDS): Float32Array {
  const fmin = 30;
  const fmax = Math.min(sr / 2 - 100, 10500);
  const edges = new Float32Array(nBands + 1);
  for (let i = 0; i <= nBands; i++) edges[i] = fmin * (fmax / fmin) ** (i / nBands);
  return edges;
}

/** Index of the first band whose lower edge is >= hz. */
export function bandAt(edges: Float32Array, hz: number): number {
  for (let i = 0; i < edges.length; i++) if (edges[i]! >= hz) return i;
  return edges.length - 1;
}

export function bandLogSpectrogram(
  mono: Float32Array,
  sr: number,
  onProgress?: (frac: number) => void,
): Spectrogram {
  const fft = new FFT(FFT_SIZE);
  const win = hann(FFT_SIZE);
  const frames = Math.max(1, Math.floor((mono.length - FFT_SIZE) / HOP) + 1);
  const edges = makeBandEdges(sr);
  const centers = new Float32Array(N_BANDS);
  for (let b = 0; b < N_BANDS; b++) centers[b] = Math.sqrt(edges[b]! * edges[b + 1]!);
  const binHz = sr / FFT_SIZE;
  const lo = new Int32Array(N_BANDS);
  const hi = new Int32Array(N_BANDS);
  for (let b = 0; b < N_BANDS; b++) {
    lo[b] = Math.max(1, Math.floor(edges[b]! / binHz));
    hi[b] = Math.max(lo[b]! + 1, Math.ceil(edges[b + 1]! / binHz));
  }
  const re = new Float32Array(FFT_SIZE);
  const im = new Float32Array(FFT_SIZE);
  const norm = 4 / FFT_SIZE;
  const bands: Float32Array[] = new Array(frames);
  const lin: Float32Array[] = new Array(frames);
  const rms = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    const off = f * HOP;
    let e = 0;
    for (let i = 0; i < FFT_SIZE; i++) {
      const v = mono[off + i] ?? 0;
      re[i] = v * win[i]!;
      im[i] = 0;
      e += v * v;
    }
    rms[f] = Math.sqrt(e / FFT_SIZE);
    fft.forward(re, im);
    const l = new Float32Array(N_BANDS);
    const g = new Float32Array(N_BANDS);
    for (let b = 0; b < N_BANDS; b++) {
      let s = 0;
      for (let k = lo[b]!; k < hi[b]!; k++) s += re[k]! * re[k]! + im[k]! * im[k]!;
      const m = Math.sqrt(s / (hi[b]! - lo[b]!)) * norm;
      l[b] = m;
      g[b] = Math.log1p(1000 * m);
    }
    lin[f] = l;
    bands[f] = g;
    if (onProgress && f % 400 === 0) onProgress(f / frames);
  }
  return { sr, hopTime: HOP / sr, frames, bands, lin, centers, edges, rms };
}
