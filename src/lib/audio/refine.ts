import { regionsFromEnvelope } from "./analysis-core.ts";
import { detectBassNotes } from "./dsp/bass.ts";
import { detectDrums } from "./dsp/drums.ts";
import { bandLogSpectrogram, FFT_SIZE } from "./dsp/spectral.ts";
import { normalizePeak, resample, toMono } from "./dsp/util.ts";
import type { Clip } from "./types.ts";

export type RefinedLanes = Record<"kick" | "snare" | "hats" | "bass" | "vocals", Clip[]>;

const SR = 22050;

/**
 * Re-detect the lane events on separated stems. Drum hits are read from the drum
 * stem only (no bass notes masquerading as kicks), bass notes from the bass stem,
 * and vocal activity from the vocal stem's loudness.
 */
export function refineLanesFromStems(
  stems: { drums: Float32Array[]; bass: Float32Array[]; vocals: Float32Array[] },
  sampleRate: number,
  duration: number,
  grid: { period: number; offset: number },
): RefinedLanes {
  const prep = (ch: Float32Array[]) => normalizePeak(resample(toMono(ch), sampleRate, SR));
  const sr = Math.abs(sampleRate - SR) < 1 ? sampleRate : SR;
  const drums = prep(stems.drums);
  const spec = bandLogSpectrogram(drums, sr);
  const hits = detectDrums(spec, duration, FFT_SIZE / 2 / sr, grid);
  const bass = detectBassNotes(prep(stems.bass), sr, duration);

  const vox = toMono(stems.vocals);
  const rate = 40;
  const win = Math.max(1, Math.floor(sampleRate / rate));
  const n = Math.ceil(vox.length / win);
  const env = new Float32Array(n);
  let mx = 1e-9;
  for (let i = 0; i < n; i++) {
    let s = 0;
    const a = i * win;
    const b = Math.min(vox.length, a + win);
    for (let j = a; j < b; j++) s += vox[j]! * vox[j]!;
    env[i] = Math.sqrt(s / Math.max(1, b - a));
    if (env[i]! > mx) mx = env[i]!;
  }
  for (let i = 0; i < n; i++) env[i]! /= mx;
  const vocals = mx > 0.003 ? regionsFromEnvelope(env, rate, duration, 0.25, 0.25) : [];
  return { kick: hits.kick, snare: hits.snare, hats: hits.hats, bass, vocals };
}
