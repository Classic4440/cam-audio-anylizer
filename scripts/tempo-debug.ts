import { readFileSync } from "node:fs";
import { estimateTempo } from "../src/lib/audio/dsp/tempo.ts";
for (const n of process.argv.slice(2)) {
  const j = JSON.parse(readFileSync(`/home/claude/bench/env_${n}.json`, "utf8"));
  const t = estimateTempo(Float32Array.from(j.env), j.hop);
  console.log(n.slice(0,30).padEnd(30), "->", t.bpm, t.candidates.map((c) => `${c.bpm.toFixed(1)}:${c.score.toFixed(3)}`).join("  "));
}
