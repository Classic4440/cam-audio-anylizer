import { bandAt, bandLogSpectrogram } from "./spectral.ts";
import { normalizePeak, percentile, resample } from "./util.ts";

/**
 * Chord rhythm ("comping"): when in the track the chords are actually struck, so the MIDI chords can
 * re-hit with the same rhythm instead of holding for the whole chord.
 */

const ANALYSIS_SR = 22050;

export interface Strike {
  time: number;
  /** Relative onset strength, about 0..1 of the strongest strike. */
  strength: number;
}

/**
 * Analysis frames are 2048 samples long, so a flux peak shows up before the note's true attack
 * (measured about 60 ms early on synthetic stabs). Shift detections to compensate.
 */
const LATENCY = 0.058;

/**
 * Find chord-instrument onsets in `audio` (ideally the "other" stem). Only 130 Hz - 2 kHz is
 * looked at, where chords live, so kicks and hats count for much less.
 *
 * Uses spectral flux against a max-filtered previous frame, with no global detrending, so a stab
 * that lands on top of a still-ringing one (a quarter note later) is still found.
 */
export function detectStrikes(audio: Float32Array, sampleRate: number): Strike[] {
  const mono = normalizePeak(resample(audio, sampleRate, ANALYSIS_SR));
  const spec = bandLogSpectrogram(mono, ANALYSIS_SR);
  const lo = bandAt(spec.edges, 130);
  const hi = Math.max(lo + 3, bandAt(spec.edges, 2000));
  const hop = spec.hopTime;
  const n = spec.bands.length;
  const env = new Float32Array(n);
  for (let f = 1; f < n; f++) {
    const cur = spec.bands[f]!;
    const prev = spec.bands[f - 1]!;
    let sum = 0;
    for (let b = lo; b < hi; b++) {
      const ref = Math.max(prev[Math.max(lo, b - 1)]!, prev[b]!, prev[Math.min(hi - 1, b + 1)]!);
      const d = cur[b]! - ref;
      if (d > 0) sum += d;
    }
    env[f] = sum / (hi - lo);
  }
  const radius = Math.max(1, Math.round(0.05 / hop));
  // Threshold relative to the loud strikes of the whole track, so quiet noise never counts.
  const floor = Math.max(1e-4, percentile(env, 97) * 0.22);
  const peaks: Strike[] = [];
  let top = 0;
  for (let i = radius; i < n - radius; i++) {
    const v = env[i]!;
    if (v < floor) continue;
    let isMax = true;
    for (let j = i - radius; j <= i + radius; j++) {
      if (env[j]! > v || (env[j]! === v && j < i)) {
        isMax = false;
        break;
      }
    }
    if (!isMax) continue;
    peaks.push({ time: i * hop + LATENCY, strength: v });
    if (v > top) top = v;
  }
  if (top > 0) for (const p of peaks) p.strength /= top;
  return peaks;
}

export interface CompOptions {
  /** Grid step in seconds (e.g. a 16th note). Strikes within 35% of a step are snapped to it. */
  gridSec?: number;
  gridOffset?: number;
  /** Strikes closer than this to an excluded time (drum hits when working from the full mix) are ignored. */
  exclude?: number[];
  excludeWindow?: number;
  /** Shortest allowed time between two hits of the same chord. */
  minGap?: number;
}

export interface ChordHit {
  start: number;
  duration: number;
}

/**
 * Split one chord span into hits. Always starts with a hit at the chord start; each detected strike
 * inside the span adds another. A chord with no strikes inside (a held pad) stays one long hit.
 */
export function rhythmForChord(start: number, end: number, strikes: Strike[], opts: CompOptions = {}): ChordHit[] {
  const minGap = opts.minGap ?? 0.14;
  const window = opts.excludeWindow ?? 0.04;
  const exclude = opts.exclude ?? [];
  const snap = (t: number) => {
    if (!opts.gridSec) return t;
    const off = opts.gridOffset ?? 0;
    const k = Math.round((t - off) / opts.gridSec);
    const g = off + k * opts.gridSec;
    return Math.abs(g - t) <= opts.gridSec * 0.35 ? g : t;
  };
  const inside = strikes
    .filter((s) => s.time > start + minGap && s.time < end - minGap * 0.6)
    .filter((s) => !exclude.some((x) => Math.abs(x - s.time) < window))
    .map((s) => ({ time: snap(s.time), strength: s.strength }))
    .sort((a, b) => a.time - b.time);
  // Keep the stronger of any two strikes that are too close together.
  const kept: Strike[] = [];
  for (const s of inside) {
    const last = kept[kept.length - 1];
    if (last && s.time - last.time < minGap) {
      if (s.strength > last.strength) kept[kept.length - 1] = s;
    } else if (s.time - start >= minGap) {
      kept.push(s);
    }
  }
  const starts = [start, ...kept.map((k) => k.time)];
  return starts.map((s, i) => {
    const next = i + 1 < starts.length ? starts[i + 1]! : end;
    // Leave a tiny gap before a re-strike so the new hit is audible; the last hit runs to the chord end.
    const dur = i + 1 < starts.length ? Math.max(0.05, next - s - 0.02) : Math.max(0.05, next - s);
    return { start: s, duration: dur };
  });
}
