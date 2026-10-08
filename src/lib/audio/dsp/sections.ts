import type { SectionMarker } from "../types.ts";
import type { ChromaData } from "./chroma.ts";
import type { Spectrogram } from "./spectral.ts";
import { cosine, median } from "./util.ts";

/**
 * Structure segmentation: one feature vector per bar (timbre via band energies,
 * harmony via chroma, loudness), a self-similarity matrix, and a checkerboard-kernel
 * novelty curve whose peaks become section boundaries. Boundaries are snapped to
 * bar lines and prefer phrase-length (4/8-bar) spacing.
 */

function barFeatures(
  spec: Spectrogram,
  chroma: ChromaData,
  barStarts: number[],
  duration: number,
): { feats: Float32Array[]; loud: number[] } {
  const nb = spec.lin[0]?.length ?? 0;
  const groups = 8;
  const feats: Float32Array[] = [];
  const loud: number[] = [];
  for (let i = 0; i < barStarts.length; i++) {
    const t0 = barStarts[i]!;
    const t1 = barStarts[i + 1] ?? duration;
    const f0 = Math.max(0, Math.floor(t0 / spec.hopTime));
    const f1 = Math.min(spec.frames, Math.max(f0 + 1, Math.floor(t1 / spec.hopTime)));
    const v = new Float32Array(groups + 12);
    let r = 0;
    for (let f = f0; f < f1; f++) {
      const row = spec.lin[f]!;
      for (let b = 0; b < nb; b++) v[Math.min(groups - 1, Math.floor((b / nb) * groups))]! += row[b]!;
      r += spec.rms[f] ?? 0;
    }
    const n = f1 - f0;
    for (let g = 0; g < groups; g++) v[g] = Math.log1p((v[g]! / n) * 50);
    let cn = 0;
    for (let k = 0; k < chroma.times.length; k++) {
      const tc = chroma.times[k]!;
      if (tc < t0 || tc >= t1) continue;
      let s = 0;
      for (let p = 0; p < 12; p++) s += chroma.chroma[k]![p]!;
      if (s > 1e-6) for (let p = 0; p < 12; p++) v[groups + p]! += chroma.chroma[k]![p]! / s;
      cn++;
    }
    if (cn) for (let p = 0; p < 12; p++) v[groups + p]! /= cn;
    feats.push(v);
    loud.push(r / n);
  }
  return { feats, loud };
}

export function detectSections(
  spec: Spectrogram,
  chroma: ChromaData,
  barStarts: number[],
  duration: number,
): SectionMarker[] {
  const nBars = barStarts.length;
  if (nBars < 4) return [{ start: 0, duration, name: "Song" }];
  const { feats, loud } = barFeatures(spec, chroma, barStarts, duration);

  // Standardise each feature dimension so loud bands don't swamp chroma.
  const dim = feats[0]!.length;
  for (let d = 0; d < dim; d++) {
    let m = 0;
    for (const f of feats) m += f[d]!;
    m /= nBars;
    let v = 0;
    for (const f of feats) v += (f[d]! - m) ** 2;
    const s = Math.sqrt(v / nBars) + 1e-6;
    for (const f of feats) f[d] = (f[d]! - m) / s;
  }

  const L = Math.min(4, Math.floor(nBars / 2));
  const novelty = new Float32Array(nBars);
  for (let i = L; i <= nBars - L; i++) {
    let within = 0;
    let across = 0;
    for (let a = 0; a < L; a++) {
      for (let b = 0; b < L; b++) {
        within += cosine(feats[i - 1 - a]!, feats[i - 1 - b]!) + cosine(feats[i + a]!, feats[i + b]!);
        across += 2 * cosine(feats[i - 1 - a]!, feats[i + b]!);
      }
    }
    novelty[i] = (within - across) / (2 * L * L);
  }
  const nm = median(Array.from(novelty).filter((x) => x > 0)) || 0.1;
  const thr = Math.max(0.35, nm * 1.6);

  const cuts: number[] = [];
  for (let i = L; i <= nBars - L; i++) {
    const x = novelty[i]!;
    if (x < thr) continue;
    let isPeak = true;
    for (let d = -2; d <= 2; d++) if (d !== 0 && (novelty[i + d] ?? 0) > x) isPeak = false;
    if (!isPeak) continue;
    // Prefer phrase boundaries: nudge a cut within ±1 bar onto a multiple of 4 from the start.
    let best = i;
    for (const c of [i - 1, i + 1]) {
      if (c > 0 && c % 4 === 0 && i % 4 !== 0 && (novelty[c] ?? 0) > x * 0.8) best = c;
    }
    const last = cuts[cuts.length - 1];
    if (last === undefined || best - last >= 3) cuts.push(best);
  }

  const bounds = [0, ...cuts, nBars];
  const energy = loud;
  const secs: { a: number; b: number; e: number }[] = [];
  for (let i = 0; i < bounds.length - 1; i++) {
    const a = bounds[i]!;
    const b = bounds[i + 1]!;
    let e = 0;
    for (let k = a; k < b; k++) e += energy[k]!;
    secs.push({ a, b, e: e / (b - a) });
  }
  const med = median(secs.map((s) => s.e)) || 1;
  const out: SectionMarker[] = [];
  secs.forEach((s, i) => {
    let name = "Verse";
    if (i === 0 && s.e <= med * 1.05) name = "Intro";
    else if (i === secs.length - 1 && secs.length > 2 && s.e <= med * 1.05) name = "Outro";
    else if (s.e > med * 1.18) name = "Drop";
    else if (s.e < med * 0.75) name = "Break";
    const start = i === 0 ? 0 : barStarts[s.a]!;
    const end = i === secs.length - 1 ? duration : barStarts[s.b]!;
    out.push({ start, duration: end - start, name });
  });
  return out;
}
