import { readFileSync, readdirSync } from "node:fs";
import { estimateTempo } from "../src/lib/audio/dsp/tempo.ts";
for (const f of readdirSync("/home/claude/bench").filter((f) => f.startsWith("env_")).sort()) {
  const j = JSON.parse(readFileSync(`/home/claude/bench/${f}`, "utf8"));
  const t = estimateTempo(Float32Array.from(j.env), j.hop);
  console.log(f.slice(4, 44).padEnd(40), t.bpm.toFixed(2).padStart(7), t.confidence.toFixed(2), t.candidates.map((c) => c.bpm.toFixed(0)).join(","));
}
