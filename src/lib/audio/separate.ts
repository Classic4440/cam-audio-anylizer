import { FFT } from "./dsp/fft2.ts";

/**
 * Model-free 4-stem separation: drums / bass / vocals / other.
 *
 *  1. STFT (sine window, 50% overlap => perfect reconstruction).
 *  2. Harmonic/percussive separation by median filtering (Fitzgerald 2010):
 *     harmonic = median across time, percussive = median across frequency,
 *     combined into soft Wiener masks.
 *  3. The harmonic part is divided by register and stereo position:
 *       bass   = harmonic below ~200 Hz
 *       vocals = harmonic, centre-panned, 200 Hz – 9 kHz
 *       other  = everything else (wide/side harmonic content, air)
 *
 * The four masks always sum to exactly 1, so the stems add back up to the original
 * mix. This is signal processing, not a neural network: expect usable drum/bass
 * isolation and a "centre vocal" stem, not studio-grade vocal extraction. The
 * StemSeparator interface lets a model-based separator replace it later.
 */

export const STEM_NAMES = ["drums", "bass", "vocals", "other"] as const;
export type StemName = (typeof STEM_NAMES)[number];
export type StemSet = Record<StemName, Float32Array[]>;

export interface StemSeparator {
  readonly id: string;
  separate(channels: Float32Array[], sampleRate: number, onProgress?: (pct: number) => void): Promise<StemSet> | StemSet;
}

const N = 2048;
const H = N / 2;
const B = N / 2 + 1;
const TIME_RADIUS = 4; // 9 frames ≈ 0.2 s
const FREQ_RADIUS = 8; // 17 bins, scaled with sample rate below
const DILATE = 3;
const LOW_HZ = 200;
const LOW_TIME_RADIUS = 8; // 0.4 s: longer than a kick, shorter than a held bass note
const CORE_SECONDS = 14;
const MARGIN_SECONDS = 1.2;

function sineWindow(): Float32Array {
  const w = new Float32Array(N);
  for (let i = 0; i < N; i++) w[i] = Math.sin((Math.PI * (i + 0.5)) / N);
  return w;
}

/** Sliding median over a strided sequence using a sorted window. */
function slidingMedian(
  src: Float32Array,
  base: number,
  stride: number,
  n: number,
  radius: number,
  dst: Float32Array,
): void {
  const w = radius * 2 + 1;
  const win = new Float32Array(w + 1);
  let size = 0;
  const insert = (v: number) => {
    let i = size;
    while (i > 0 && win[i - 1]! > v) {
      win[i] = win[i - 1]!;
      i--;
    }
    win[i] = v;
    size++;
  };
  const remove = (v: number) => {
    let i = 0;
    while (i < size && win[i]! !== v) i++;
    for (; i < size - 1; i++) win[i] = win[i + 1]!;
    size--;
  };
  for (let i = 0; i < Math.min(n, radius + 1); i++) insert(src[base + i * stride]!);
  for (let i = 0; i < n; i++) {
    dst[base + i * stride] = win[size >> 1]!;
    const add = i + radius + 1;
    const drop = i - radius;
    if (add < n) insert(src[base + add * stride]!);
    if (drop >= 0) remove(src[base + drop * stride]!);
  }
}

/** Smooth register masks, as functions of bin frequency. */
function registerMasks(sr: number): { bass: Float32Array; vocal: Float32Array } {
  const bass = new Float32Array(B);
  const vocal = new Float32Array(B);
  const ramp = (f: number, a: number, b: number) => {
    if (f <= a) return 0;
    if (f >= b) return 1;
    return 0.5 - 0.5 * Math.cos((Math.PI * (f - a)) / (b - a));
  };
  for (let k = 0; k < B; k++) {
    const f = (k * sr) / N;
    bass[k] = 1 - ramp(f, 110, 240);
    vocal[k] = ramp(f, 140, 320) * (1 - ramp(f, 8000, 12000));
  }
  return { bass, vocal };
}

interface Block {
  /** [stem][channel] */
  out: Float32Array[][];
}

function processBlock(chs: Float32Array[], m: number, sr: number, fft: FFT, win: Float32Array): Block {
  const nCh = chs.length;
  const stereo = nCh >= 2;
  const padded = m + 2 * N;
  const F = Math.ceil((padded - N) / H) + 1;
  const reX: Float32Array[] = [];
  const imX: Float32Array[] = [];
  const re = new Float32Array(N);
  const im = new Float32Array(N);

  for (let c = 0; c < nCh; c++) {
    const R = new Float32Array(F * B);
    const I = new Float32Array(F * B);
    const x = chs[c]!;
    for (let f = 0; f < F; f++) {
      const start = f * H - N; // position in the unpadded block
      for (let i = 0; i < N; i++) {
        const p = start + i;
        re[i] = p >= 0 && p < m ? x[p]! * win[i]! : 0;
        im[i] = 0;
      }
      fft.forward(re, im);
      const o = f * B;
      for (let k = 0; k < B; k++) {
        R[o + k] = re[k]!;
        I[o + k] = im[k]!;
      }
    }
    reX.push(R);
    imX.push(I);
  }

  // Mono magnitude for HPSS.
  const mag = new Float32Array(F * B);
  for (let i = 0; i < mag.length; i++) {
    let s = 0;
    for (let c = 0; c < nCh; c++) s += Math.hypot(reX[c]![i]!, imX[c]![i]!);
    mag[i] = s / nCh;
  }
  const harm = new Float32Array(F * B);
  const perc = new Float32Array(F * B);
  // Gliding/vibrato partials move between bins; dilating over a few bins before the
  // time-median keeps them classified as harmonic instead of "vertical" transients.
  const dil = new Float32Array(F * B);
  for (let f = 0; f < F; f++) {
    const o = f * B;
    for (let k = 0; k < B; k++) {
      let mx = 0;
      for (let d = -DILATE; d <= DILATE; d++) {
        const v = mag[o + Math.min(B - 1, Math.max(0, k + d))]!;
        if (v > mx) mx = v;
      }
      dil[o + k] = mx;
    }
  }
  for (let k = 0; k < B; k++) slidingMedian(dil, k, B, F, TIME_RADIUS, harm);
  const freqRadius = Math.max(4, Math.round((FREQ_RADIUS * 44100) / sr));
  for (let f = 0; f < F; f++) slidingMedian(mag, f * B, 1, B, freqRadius, perc);
  // Low end: a kick is a short, narrow-band thump, so frequency-median can't see it.
  // Treat sustained energy (bass notes) as the baseline and the excess as transient.
  const kLow = Math.round(LOW_HZ / (sr / N));
  const lowHarm = new Float32Array(F * B);
  for (let k = 0; k <= kLow; k++) slidingMedian(mag, k, B, F, LOW_TIME_RADIUS, lowHarm);
  for (let f = 0; f < F; f++) {
    const o = f * B;
    for (let k = 0; k <= kLow; k++) {
      harm[o + k] = lowHarm[o + k]!;
      perc[o + k] = Math.max(0, mag[o + k]! - lowHarm[o + k]!);
    }
  }

  const { bass: bassMask, vocal: vocalMask } = registerMasks(sr);
  const outs: Float32Array[][] = STEM_NAMES.map(() => Array.from({ length: nCh }, () => new Float32Array(padded + N)));

  const mk = new Float32Array(4); // drums, bass, vocals, other
  const yr = new Float32Array(N);
  const yi = new Float32Array(N);
  for (let f = 0; f < F; f++) {
    const o = f * B;
    // Per-bin masks for this frame (shared by all channels).
    const masks = new Float32Array(4 * B);
    for (let k = 0; k < B; k++) {
      const h = harm[o + k]!;
      const p = perc[o + k]!;
      const h2 = h * h;
      const p2 = p * p;
      // When neither estimate explains the bin, default to harmonic rather than a coin flip.
      const m = mag[o + k]!;
      const mp = p2 / (h2 + p2 + 0.0225 * m * m + 1e-12);
      const mh = 1 - mp;
      let center = 1;
      if (stereo) {
        const sr_ = reX[0]![o + k]! + reX[1]![o + k]!;
        const si_ = imX[0]![o + k]! + imX[1]![o + k]!;
        const dr_ = reX[0]![o + k]! - reX[1]![o + k]!;
        const di_ = imX[0]![o + k]! - imX[1]![o + k]!;
        const mid = sr_ * sr_ + si_ * si_;
        const side = dr_ * dr_ + di_ * di_;
        const c = mid / (mid + side + 1e-12);
        const t = Math.max(0, (c - 0.5) * 2);
        center = t * t;
      }
      const mb = mh * bassMask[k]!;
      const mv = mh * (1 - bassMask[k]!) * vocalMask[k]! * center;
      mk[0] = mp;
      mk[1] = mb;
      mk[2] = mv;
      mk[3] = Math.max(0, 1 - mp - mb - mv);
      for (let s = 0; s < 4; s++) masks[s * B + k] = mk[s]!;
    }
    for (let s = 0; s < 4; s++) {
      for (let c = 0; c < nCh; c++) {
        for (let k = 0; k < B; k++) {
          const g = masks[s * B + k]!;
          yr[k] = reX[c]![o + k]! * g;
          yi[k] = imX[c]![o + k]! * g;
        }
        for (let k = 1; k < N / 2; k++) {
          yr[N - k] = yr[k]!;
          yi[N - k] = -yi[k]!;
        }
        fft.inverse(yr, yi);
        const acc = outs[s]![c]!;
        const start = f * H;
        for (let i = 0; i < N; i++) acc[start + i]! += yr[i]! * win[i]!;
      }
    }
  }
  // Trim the zero padding back off.
  const trimmed = outs.map((chans) => chans.map((a) => a.slice(N, N + m)));
  return { out: trimmed };
}

export function separateStems(
  channels: Float32Array[],
  sampleRate: number,
  onProgress?: (pct: number) => void,
): StemSet {
  const nCh = Math.min(2, channels.length);
  const use = channels.slice(0, nCh);
  const n = use[0]?.length ?? 0;
  const result = {} as StemSet;
  for (const s of STEM_NAMES) result[s] = Array.from({ length: nCh }, () => new Float32Array(n));
  const fft = new FFT(N);
  const win = sineWindow();
  const core = Math.round(CORE_SECONDS * sampleRate);
  const margin = Math.round(MARGIN_SECONDS * sampleRate);
  const segments = Math.max(1, Math.ceil(n / core));
  for (let seg = 0; seg < segments; seg++) {
    const cs = seg * core;
    const ce = Math.min(n, cs + core);
    const a = Math.max(0, cs - margin);
    const b = Math.min(n, ce + margin);
    const block = use.map((c) => c.subarray(a, b));
    const { out } = processBlock(block, b - a, sampleRate, fft, win);
    STEM_NAMES.forEach((name, s) => {
      for (let c = 0; c < nCh; c++) result[name][c]!.set(out[s]![c]!.subarray(cs - a, ce - a), cs);
    });
    onProgress?.(((seg + 1) / segments) * 100);
  }
  return result;
}

export const dspSeparator: StemSeparator = {
  id: "dsp-hpss-v1",
  separate: separateStems,
};
