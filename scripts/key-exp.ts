import { readFileSync, readdirSync } from "node:fs";
import { computeChroma, NOTE_NAMES } from "../src/lib/audio/dsp/chroma.ts";
import { aggregateChroma } from "../src/lib/audio/dsp/key-chords.ts";
import { detectBassNotes } from "../src/lib/audio/dsp/bass.ts";
import { normalizePeak } from "../src/lib/audio/dsp/util.ts";
function readWav(path: string) { const b = readFileSync(path); let p = 12; while (p < b.length - 8) { const id = b.toString("ascii", p, p + 4); const sz = b.readUInt32LE(p + 4); if (id === "data") { const n = Math.floor(Math.min(sz, b.length - p - 8) / 2); const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = b.readInt16LE(p + 8 + i * 2) / 32768; return x; } p += 8 + sz + (sz & 1); } throw new Error("x"); }
// truth as [root pitch class, mode]
const N = (n: string) => NOTE_NAMES.indexOf(n as never);
const TRUTH: Record<string, [string, "major" | "minor"]> = { Merch: ["E", "minor"], Hollywood: ["A#", "major"], Choppa: ["D#", "minor"], beibs: ["D", "minor"], We_Paid: ["C#", "minor"], Therapy: ["D", "minor"], No_Love: ["E", "minor"], FE_N: ["D#", "minor"], ByStanders: ["C#", "major"] };
const rel = (r: number, m: string) => (m === "major" ? [r, (r + 9) % 12] : [r, (r + 3) % 12]); // tonic or relative
const data: { k: string; chroma: ReturnType<typeof computeChroma>; hist: Float64Array }[] = [];
for (const f of readdirSync("/home/claude/wav")) { const k = Object.keys(TRUTH).find((k) => f.includes(k)); if (!k) continue; const x = normalizePeak(readWav(`/home/claude/wav/${f}`)); const bn = detectBassNotes(x, 22050, x.length / 22050); const hist = new Float64Array(12); for (const c of bn) if (c.pitch !== undefined) hist[((Math.round(c.pitch) % 12) + 12) % 12]! += c.duration * (c.velocity || 1); data.push({ k, chroma: computeChroma(x, 22050), hist }); }
import { pearson } from "../src/lib/audio/dsp/util.ts";
const KK_MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const KK_MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const TP_MAJOR = [5.0, 2.0, 3.5, 2.0, 4.5, 4.0, 2.0, 4.5, 2.0, 3.5, 1.5, 4.0];
const TP_MINOR = [5.0, 2.0, 3.5, 4.5, 2.0, 4.0, 2.0, 4.5, 3.5, 2.0, 1.5, 4.0];
const rot = (a: number[], k: number) => a.map((_, i) => a[(i - k + 12) % 12]!);
for (const wb of [0, 0.5, 1, 2, 4, 8]) {
  let exact = 0, relOk = 0; const out: string[] = [];
  for (const d of data) {
    const agg = aggregateChroma(d.chroma, 0.5); const tot = agg.reduce((a, b) => a + b, 0); const hs = d.hist.reduce((a, b) => a + b, 0) || 1;
    const v = Array.from(agg, (a, i) => a + (wb * tot * d.hist[i]!) / hs / 2);
    let best = -9, br = 0, bm = "major";
    for (let r = 0; r < 12; r++) for (const [m, ka, kb] of [["major", KK_MAJOR, TP_MAJOR], ["minor", KK_MINOR, TP_MINOR]] as const) { const sc = (pearson(v, rot([...ka], r)) + pearson(v, rot([...kb], r))) / 2; if (sc > best) { best = sc; br = r; bm = m; } }
    const [tn, tm] = TRUTH[d.k]!; const t = N(tn); const e = br === t && bm === tm; const ro = rel(t, tm).includes(br) && (br === t ? bm === tm : bm !== tm);
    if (e) exact++; if (e || ro) relOk++; out.push(`${d.k}:${NOTE_NAMES[br]} ${bm}${e ? "✓" : ro ? "~" : "✗"}`);
  }
  console.log(`bassNotes ${wb}`.padEnd(13), `exact ${exact}/${data.length} +relative ${relOk}/${data.length}`, out.join(" "));
}
