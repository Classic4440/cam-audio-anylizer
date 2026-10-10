/**
 * Batch-run the analyser on pre-decoded mono WAV files (16-bit PCM) and dump JSON.
 *   node --experimental-strip-types scripts/bench-tracks.ts out.json a.wav b.wav ...
 */
import { readFileSync, writeFileSync } from "node:fs";
import { analyzePcm } from "../src/lib/audio/analysis-core.ts";

function readWav(path: string): { x: Float32Array; sr: number } {
  const b = readFileSync(path);
  const sr = b.readUInt32LE(24);
  let p = 12;
  while (p < b.length - 8) {
    const id = b.toString("ascii", p, p + 4);
    const sz = b.readUInt32LE(p + 4);
    if (id === "data") {
      const n = Math.floor(Math.min(sz, b.length - p - 8) / 2);
      const x = new Float32Array(n);
      for (let i = 0; i < n; i++) x[i] = b.readInt16LE(p + 8 + i * 2) / 32768;
      return { x, sr };
    }
    p += 8 + sz + (sz & 1);
  }
  throw new Error("no data chunk");
}
const [out, ...files] = process.argv.slice(2);
const res: Record<string, unknown> = {};
for (const f of files) {
  const { x, sr } = readWav(f);
  const name = f.split("/").pop()!.replace(/\.wav$/, "");
  const t0 = Date.now();
  const a = analyzePcm({ channels: [x], sampleRate: sr, fileName: name });
  res[name] = {
    bpm: a.bpm, conf: a.bpmConfidence, cands: a.bpmCandidates, key: a.key, keyConf: a.keyConfidence,
    keyCands: a.keyCandidates?.map((k) => k.key), tuning: a.tuningCents, ts: a.timeSignature.join("/"), secs: (Date.now() - t0) / 1000,
  };
  console.error(name.slice(0, 40), a.bpm, a.key, ((Date.now() - t0) / 1000).toFixed(1) + "s");
}
writeFileSync(out!, JSON.stringify(res, null, 1));
