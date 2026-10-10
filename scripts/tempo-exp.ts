import { readFileSync, readdirSync } from "node:fs";
import { renderSong } from "../tests/synth.ts";
import { bandLogSpectrogram } from "../src/lib/audio/dsp/spectral.ts";
import { onsetStrength } from "../src/lib/audio/dsp/tempo.ts";
const TRUTH: Record<string, number> = { FE_N: 148, ByStanders: 144, Hollywood: 170.1, Merch: 77.5, Choppa: 102.7, beibs: 119, We_Paid: 135, Therapy: 144, "2040": 150, No_Love: 154.1, Late_Checkout: 120.2, Girls_Want: 87.3, HOTEL: 128, Commercial: 121, STAYING: 130 };
function acOf(env: Float32Array, hop: number, maxSec: number) {
  const n = env.length, minLag = 2, maxLag = Math.ceil(maxSec / hop), win = Math.min(n, Math.round(12 / hop)), step = Math.round(5 / hop);
  const ac = new Float64Array(maxLag + 2); let totalW = 0;
  for (let s = 0; s + win <= n || s === 0; s += step) {
    const seg = env.subarray(s, Math.min(n, s + win)); const len = seg.length; let mean = 0;
    for (let i = 0; i < len; i++) mean += seg[i]!; mean /= len; let e0 = 0;
    for (let i = 0; i < len; i++) e0 += (seg[i]! - mean) ** 2;
    if (e0 < 1e-6) { if (s + win >= n) break; continue; }
    const top = Math.min(maxLag + 1, len - 2);
    for (let lag = minLag; lag <= top; lag++) { let d = 0; for (let i = 0; i + lag < len; i++) d += (seg[i]! - mean) * (seg[i + lag]! - mean); ac[lag]! += (d / e0) * (len / (len - lag)) * e0; }
    totalW += e0; if (s + win >= n) break;
  }
  for (let l = 0; l < ac.length; l++) ac[l]! /= totalW; return ac;
}
const prior = (b: number, c = 120, s = 0.7) => Math.exp(-0.5 * (Math.log2(b / c) / s) ** 2);
type Variant = (at: (l: number) => number, bpm: number, hop: number) => number;
const V: Record<string, Variant> = {
  orig: (at, b, h) => { const l = 60 / b / h; return (at(l) + 0.3 * at(l * 2)) * prior(b); },
  bar: (at, b, h) => { const l = 60 / b / h; return (at(l) + 0.3 * at(l * 2) + 0.5 * at(l * 4)) * prior(b); },
  bar2: (at, b, h) => { const l = 60 / b / h; return (at(l) + 0.5 * at(l * 2) + 0.5 * at(l * 4) + 0.3 * at(l * 8)) * prior(b); },
  nodot: (at, b, h) => { const l = 60 / b / h; return (at(l) + 0.3 * at(l * 2) + 0.5 * at(l * 4) - 0.3 * Math.max(0, at(l * 3))) * prior(b); },
  bar_p100: (at, b, h) => { const l = 60 / b / h; return (at(l) + 0.3 * at(l * 2) + 0.5 * at(l * 4)) * prior(b, 110, 0.9); },
};
const ok = (est: number, t: number, oct: boolean) => [1, ...(oct ? [0.5, 2] : [])].some((m) => Math.abs(est / (t * m) - 1) < 0.04);
const rows: { name: string; t: number; ac: Float64Array; hop: number }[] = [];
for (const f of readdirSync("/home/claude/bench").filter((f) => f.startsWith("env_"))) {
  const key = Object.keys(TRUTH).find((k) => f.includes(k)); if (!key) continue;
  const j = JSON.parse(readFileSync(`/home/claude/bench/${f}`, "utf8"));
  rows.push({ name: key, t: TRUTH[key]!, ac: acOf(Float32Array.from(j.env), j.hop, 8), hop: j.hop });
}

const SYN = [70, 85, 100, 110, 124, 128, 140, 150, 174];
const synRows: { name: string; t: number; ac: Float64Array; hop: number }[] = [];
for (const bpm of SYN) {
  const sg = renderSong({ bpm, bars: Math.max(12, Math.round(40 / (240 / bpm))), lead: 1.3, drums: "backbeat", hats: true, noise: 0.01, chords: [{ root: 9, quality: "min" }, { root: 5, quality: "maj" }], bassline: true });
  const spec = bandLogSpectrogram(sg.audio, sg.sr); const env = onsetStrength(spec.bands, spec.hopTime);
  synRows.push({ name: "syn" + bpm, t: bpm, ac: acOf(env, spec.hopTime, 8), hop: spec.hopTime });
}
const res: { k: string; strict: number; oct: number; out: string; syn: number }[] = [];
for (const w2 of [0.3, 0.6, 1]) for (const w4 of [0.3, 0.6, 1, 1.5]) for (const w8 of [0, 0.3, 0.6, 1]) for (const c of [100, 110, 120, 125, 130]) for (const sg of [0.7, 1.0]) {
  const fn: Variant = (at, b, h) => { const l = 60 / b / h; return (at(l) + w2 * at(l * 2) + w4 * at(l * 4) + w8 * at(l * 8)) * prior(b, c, sg); };
  let strict = 0, oct = 0; const out: string[] = [];
  for (const r of rows) {
    const at = (l: number) => { const a = Math.floor(l), fr = l - a; return (r.ac[a] ?? 0) * (1 - fr) + (r.ac[a + 1] ?? 0) * fr; };
    let best = -1, bb = 0;
    for (let b = 45; b <= 210; b += 0.25) { const sc = fn(at, b, r.hop); if (sc > best) { best = sc; bb = b; } }
    if (ok(bb, r.t, false)) strict++; if (ok(bb, r.t, true)) oct++;
    out.push(`${r.name}:${bb.toFixed(0)}${ok(bb, r.t, false) ? "✓" : ok(bb, r.t, true) ? "~" : "✗"}`);
  }
  let syn = 0;
  for (const r of synRows) {
    const at = (l: number) => { const a = Math.floor(l), fr = l - a; return (r.ac[a] ?? 0) * (1 - fr) + (r.ac[a + 1] ?? 0) * fr; };
    let best = -1, bb = 0;
    for (let b = 45; b <= 210; b += 0.25) { const sc = fn(at, b, r.hop); if (sc > best) { best = sc; bb = b; } }
    if (ok(bb, r.t, false)) syn++;
  }
  res.push({ syn, k: `w2=${w2} w4=${w4} w8=${w8} c=${c} sg=${sg}`, strict, oct, out: out.join(" ") });
}
res.sort((a, b) => b.syn - a.syn || b.oct - a.oct || b.strict - a.strict);
console.log("combos", res.length, "histogram oct:", JSON.stringify(res.reduce((h: Record<number, number>, r) => ((h[r.oct] = (h[r.oct] ?? 0) + 1), h), {})));
for (const r of res.slice(0, 10)) console.log(`syn ${r.syn}/9`, r.oct, r.strict, r.k, "|", r.out);
