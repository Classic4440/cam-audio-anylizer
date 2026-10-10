import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { bandLogSpectrogram } from "../src/lib/audio/dsp/spectral.ts";
import { onsetStrength } from "../src/lib/audio/dsp/tempo.ts";
import { normalizePeak } from "../src/lib/audio/dsp/util.ts";
function readWav(path: string) { const b = readFileSync(path); let p = 12; while (p < b.length - 8) { const id = b.toString("ascii", p, p + 4); const sz = b.readUInt32LE(p + 4); if (id === "data") { const n = Math.floor(Math.min(sz, b.length - p - 8) / 2); const x = new Float32Array(n); for (let i = 0; i < n; i++) x[i] = b.readInt16LE(p + 8 + i * 2) / 32768; return x; } p += 8 + sz + (sz & 1); } throw new Error("x"); }
const dir = "/home/claude/wav";
for (const f of readdirSync(dir)) {
  const x = normalizePeak(readWav(`${dir}/${f}`));
  const spec = bandLogSpectrogram(x, 22050);
  const env = onsetStrength(spec.bands, spec.hopTime);
  writeFileSync(`/home/claude/bench/env_${f.replace(/\.wav$/, "")}.json`, JSON.stringify({ hop: spec.hopTime, env: Array.from(env) }));
}
