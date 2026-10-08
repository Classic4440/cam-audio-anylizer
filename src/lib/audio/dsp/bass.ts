import type { Clip } from "../types.ts";
import { lowpass, median, resample } from "./util.ts";

/**
 * Monophonic bass note tracking with YIN. The signal is lowpassed and decimated
 * so a short window still spans several periods of a 40 Hz fundamental.
 */

const SR = 2756.25;
const WIN = 384; // ~139 ms
const HOP = 64; // ~23 ms
const TAU_MIN = Math.floor(SR / 260);
const TAU_MAX = Math.ceil(SR / 38);

interface Frame {
  t: number;
  midi: number;
  voiced: boolean;
  level: number;
}

function yin(x: Float32Array, off: number): { f0: number; ap: number } {
  const d = new Float32Array(TAU_MAX + 1);
  for (let tau = 1; tau <= TAU_MAX; tau++) {
    let s = 0;
    for (let i = 0; i < WIN - TAU_MAX; i++) {
      const diff = (x[off + i] ?? 0) - (x[off + i + tau] ?? 0);
      s += diff * diff;
    }
    d[tau] = s;
  }
  let run = 0;
  const cm = new Float32Array(TAU_MAX + 1);
  cm[0] = 1;
  for (let tau = 1; tau <= TAU_MAX; tau++) {
    run += d[tau]!;
    cm[tau] = run > 0 ? (d[tau]! * tau) / run : 1;
  }
  let tau = -1;
  for (let t = TAU_MIN; t < TAU_MAX; t++) {
    if (cm[t]! < 0.15) {
      while (t + 1 < TAU_MAX && cm[t + 1]! < cm[t]!) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return { f0: 0, ap: 1 };
  const a = cm[tau - 1] ?? cm[tau]!;
  const b = cm[tau]!;
  const c = cm[tau + 1] ?? b;
  const den = a - 2 * b + c;
  const shift = Math.abs(den) < 1e-9 ? 0 : (0.5 * (a - c)) / den;
  return { f0: SR / (tau + shift), ap: b };
}

export function detectBassNotes(mono: Float32Array, sr: number, duration: number): Clip[] {
  const low = lowpass(lowpass(mono, 300, sr, 0.5412), 300, sr, 1.3066);
  const x = resample(low, sr, SR);
  const frames: Frame[] = [];
  for (let off = 0; off + WIN <= x.length; off += HOP) {
    let e = 0;
    for (let i = 0; i < WIN; i++) e += x[off + i]! * x[off + i]!;
    const level = Math.sqrt(e / WIN);
    const { f0, ap } = yin(x, off);
    const voiced = f0 > 0 && ap < 0.15 && level > 0.01;
    frames.push({
      t: (off + WIN / 2) / SR,
      midi: voiced ? 69 + 12 * Math.log2(f0 / 440) : 0,
      voiced,
      level,
    });
  }
  const notes: Clip[] = [];
  let cur: Frame[] = [];
  const flush = () => {
    if (cur.length >= 3) {
      const midi = Math.round(median(cur.map((f) => f.midi)));
      const start = Math.max(0, cur[0]!.t - (WIN / 2) / SR + 0.02);
      const end = Math.min(duration, cur[cur.length - 1]!.t + HOP / SR);
      const lvl = Math.max(...cur.map((f) => f.level));
      if (end - start >= 0.06) notes.push({ start, duration: end - start, velocity: Math.min(1, 0.3 + lvl * 2), pitch: midi });
    }
    cur = [];
  };
  for (const f of frames) {
    if (!f.voiced) {
      flush();
      continue;
    }
    const last = cur[cur.length - 1];
    if (last && Math.abs(f.midi - median(cur.map((c) => c.midi))) > 0.8) flush();
    cur.push(f);
  }
  flush();
  return notes;
}
