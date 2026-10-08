import type { ChordEvent } from "../types.ts";
import { NOTE_NAMES, type ChromaData } from "./chroma.ts";
import { clamp01, cosine, median, pearson } from "./util.ts";

type Quality = ChordEvent["quality"];

/* ----------------------------------- key ---------------------------------- */

const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const TP_MAJOR = [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0];
const TP_MINOR = [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0];

function rotate(a: number[], k: number): number[] {
  return a.map((_, i) => a[(i - k + 12) % 12]!);
}

export interface KeyResult {
  root: number;
  mode: "major" | "minor";
  key: string;
  confidence: number;
  candidates: { key: string; score: number }[];
}

export function aggregateChroma(data: ChromaData, bassWeight = 0.5): Float32Array {
  const total = new Float32Array(12);
  const med = median(data.level) || 1;
  for (let f = 0; f < data.chroma.length; f++) {
    const c = data.chroma[f]!;
    const b = data.bass[f]!;
    const wt = Math.min(1, data.level[f]! / (0.5 * med));
    let sc = 0;
    let sb = 0;
    for (let i = 0; i < 12; i++) {
      sc += c[i]!;
      sb += b[i]!;
    }
    if (sc < 1e-6) continue;
    for (let i = 0; i < 12; i++) {
      total[i]! += (c[i]! / sc) * wt;
      if (sb > 1e-6) total[i]! += (b[i]! / sb) * wt * bassWeight;
    }
  }
  return total;
}

export function detectKey(data: ChromaData): KeyResult {
  const agg = aggregateChroma(data);
  const scored: { root: number; mode: "major" | "minor"; s: number }[] = [];
  for (let r = 0; r < 12; r++) {
    const maj = (pearson(agg, rotate(KK_MAJOR, r)) + pearson(agg, rotate(TP_MAJOR, r))) / 2;
    const min = (pearson(agg, rotate(KK_MINOR, r)) + pearson(agg, rotate(TP_MINOR, r))) / 2;
    scored.push({ root: r, mode: "major", s: maj }, { root: r, mode: "minor", s: min });
  }
  scored.sort((a, b) => b.s - a.s);
  const best = scored[0]!;
  const second = scored[1]!;
  const name = (x: { root: number; mode: string }) => `${NOTE_NAMES[x.root]} ${x.mode}`;
  const confidence = clamp01(((best.s - second.s) / 0.1) * 0.5 + clamp01((best.s - 0.4) / 0.4) * 0.5);
  return {
    root: best.root,
    mode: best.mode,
    key: name(best),
    confidence,
    candidates: scored.slice(0, 4).map((x) => ({ key: name(x), score: x.s })),
  };
}

/* --------------------------------- chords --------------------------------- */

const TEMPLATES: { q: Quality; iv: number[]; w: number[]; penalty: number }[] = [
  { q: "maj", iv: [0, 4, 7], w: [1, 0.9, 0.8], penalty: 0 },
  { q: "min", iv: [0, 3, 7], w: [1, 0.9, 0.8], penalty: 0 },
  { q: "7", iv: [0, 4, 7, 10], w: [1, 0.85, 0.75, 0.6], penalty: 0.05 },
  { q: "maj7", iv: [0, 4, 7, 11], w: [1, 0.85, 0.75, 0.6], penalty: 0.05 },
  { q: "min7", iv: [0, 3, 7, 10], w: [1, 0.85, 0.75, 0.6], penalty: 0.05 },
  { q: "sus", iv: [0, 5, 7], w: [1, 0.85, 0.8], penalty: 0.06 },
  { q: "dim", iv: [0, 3, 6], w: [1, 0.85, 0.8], penalty: 0.08 },
];

const STATES: { root: number; q: Quality; vec: Float32Array; penalty: number }[] = [];
for (const t of TEMPLATES) {
  for (let r = 0; r < 12; r++) {
    const v = new Float32Array(12);
    t.iv.forEach((iv, i) => (v[(r + iv) % 12] = t.w[i]!));
    STATES.push({ root: r, q: t.q, vec: v, penalty: t.penalty });
  }
}

export function chordName(root: number, q: Quality): string {
  const n = NOTE_NAMES[root] ?? "C";
  switch (q) {
    case "maj":
      return n;
    case "min":
      return `${n}m`;
    case "7":
      return `${n}7`;
    case "maj7":
      return `${n}maj7`;
    case "min7":
      return `${n}m7`;
    case "sus":
      return `${n}sus`;
    case "dim":
      return `${n}dim`;
  }
}

const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MINOR_SCALE = [0, 2, 3, 5, 7, 8, 10];

/**
 * Beat-synchronous chord recognition: per-beat chroma is matched against chord
 * templates, then a Viterbi pass with a switching cost removes flicker. A
 * no-chord state absorbs silence and unpitched passages.
 */
export function detectChords(
  data: ChromaData,
  beats: number[],
  key: { root: number; mode: "major" | "minor" },
  duration: number,
): ChordEvent[] {
  if (data.chroma.length === 0) return [];
  let edges = beats.length >= 2 ? beats.slice() : [];
  if (edges.length < 2) {
    for (let t = 0; t < duration; t += 0.5) edges.push(t);
  }
  if (edges[0]! > 0.05) edges.unshift(0);
  if (edges[edges.length - 1]! < duration - 0.05) edges.push(duration);
  // Very fast tempos: analyse pairs of beats so each segment spans >= ~0.35 s.
  const dense: number[] = [edges[0]!];
  for (let i = 1; i < edges.length; i++) {
    if (edges[i]! - dense[dense.length - 1]! >= 0.35 || i === edges.length - 1) dense.push(edges[i]!);
  }
  edges = dense;

  const scale = new Set((key.mode === "major" ? MAJOR_SCALE : MINOR_SCALE).map((x) => (x + key.root) % 12));
  const T = edges.length - 1;
  const S = STATES.length;
  const N = S; // index of the no-chord state
  const emit: Float32Array[] = new Array(T);
  const segLevel = new Float32Array(T);
  const medLevel = median(data.level) || 1;

  let fi = 0;
  for (let s = 0; s < T; s++) {
    const t0 = edges[s]!;
    const t1 = edges[s + 1]!;
    const c = new Float32Array(12);
    const b = new Float32Array(12);
    let n = 0;
    let lv = 0;
    while (fi > 0 && data.times[fi - 1]! >= t0) fi--;
    for (let f = fi; f < data.times.length; f++) {
      const tf = data.times[f]!;
      if (tf < t0) {
        fi = f + 1;
        continue;
      }
      if (tf >= t1) break;
      let sc = 0;
      let sb = 0;
      for (let i = 0; i < 12; i++) {
        sc += data.chroma[f]![i]!;
        sb += data.bass[f]![i]!;
      }
      if (sc > 1e-6) for (let i = 0; i < 12; i++) c[i]! += data.chroma[f]![i]! / sc;
      if (sb > 1e-6) for (let i = 0; i < 12; i++) b[i]! += data.bass[f]![i]! / sb;
      lv += data.level[f]!;
      n++;
    }
    if (n === 0) {
      // Segment shorter than a frame hop: borrow the nearest frame.
      let best = 0;
      let bd = Infinity;
      const mid = (t0 + t1) / 2;
      for (let f = 0; f < data.times.length; f++) {
        const d = Math.abs(data.times[f]! - mid);
        if (d < bd) {
          bd = d;
          best = f;
        }
      }
      let sc = 0;
      for (let i = 0; i < 12; i++) sc += data.chroma[best]![i]!;
      if (sc > 1e-6) for (let i = 0; i < 12; i++) c[i] = data.chroma[best]![i]! / sc;
      lv = data.level[best]!;
      n = 1;
    }
    segLevel[s] = lv / n;
    let bsum = 0;
    for (let i = 0; i < 12; i++) bsum += b[i]!;
    const e = new Float32Array(S + 1);
    for (let k = 0; k < S; k++) {
      const st = STATES[k]!;
      let sc = cosine(c, st.vec) - st.penalty;
      if (bsum > 1e-6) sc += 0.25 * (b[st.root]! / bsum);
      if (scale.has(st.root)) sc += 0.02;
      e[k] = 8 * sc;
    }
    e[N] = 8 * 0.5;
    if (segLevel[s]! < 0.15 * medLevel) e[N] = e[N]! + 6;
    emit[s] = e;
  }

  const SWITCH = 1.6;
  const NOCHORD_SWITCH = 1.2;
  let prev = Float64Array.from(emit[0]!);
  const back: Int16Array[] = [new Int16Array(S + 1).fill(-1)];
  for (let t = 1; t < T; t++) {
    const cur = new Float64Array(S + 1);
    const bp = new Int16Array(S + 1);
    let gBest = -Infinity;
    let gIdx = 0;
    for (let k = 0; k <= S; k++) {
      if (prev[k]! > gBest) {
        gBest = prev[k]!;
        gIdx = k;
      }
    }
    for (let k = 0; k <= S; k++) {
      const stay = prev[k]!;
      const cost = k === N || gIdx === N ? NOCHORD_SWITCH : SWITCH;
      const move = gBest - cost;
      if (stay >= move) {
        cur[k] = stay + emit[t]![k]!;
        bp[k] = k;
      } else {
        cur[k] = move + emit[t]![k]!;
        bp[k] = gIdx;
      }
    }
    back.push(bp);
    prev = cur;
  }
  let state = 0;
  let top = -Infinity;
  for (let k = 0; k <= S; k++) {
    if (prev[k]! > top) {
      top = prev[k]!;
      state = k;
    }
  }
  const path = new Int16Array(T);
  for (let t = T - 1; t >= 0; t--) {
    path[t] = state;
    state = back[t]![state] ?? state;
  }

  const out: ChordEvent[] = [];
  for (let t = 0; t < T; t++) {
    const k = path[t]!;
    if (k === N) continue;
    const st = STATES[k]!;
    const start = edges[t]!;
    const end = edges[t + 1]!;
    const last = out[out.length - 1];
    if (last && last.root === st.root && last.quality === st.q && Math.abs(last.start + last.duration - start) < 1e-6) {
      last.duration = end - last.start;
    } else {
      out.push({ start, duration: end - start, name: chordName(st.root, st.q), root: st.root, quality: st.q });
    }
  }
  return out;
}
