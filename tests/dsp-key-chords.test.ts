import test from "node:test";
import assert from "node:assert/strict";
import { renderSong, type ChordSpec } from "./synth.ts";
import { computeChroma, NOTE_NAMES } from "../src/lib/audio/dsp/chroma.ts";
import { detectKey, detectChords } from "../src/lib/audio/dsp/key-chords.ts";

const maj = (r: number): ChordSpec => ({ root: r % 12, quality: "maj" });
const min = (r: number): ChordSpec => ({ root: r % 12, quality: "min" });

test("key detection across all 24 keys, with drums, bass and a 35-cent detune", () => {
  let right = 0, total = 0; const misses: string[] = [];
  for (let root = 0; root < 12; root++) {
    for (const mode of ["major", "minor"] as const) {
      const prog = mode === "major"
        ? [maj(root), maj(root + 5), maj(root + 7), maj(root)]            // I IV V I
        : [min(root), min(root + 5), maj(root + 7), min(root)];            // i iv V i
      const s = renderSong({ bpm: 112, bars: 16, chords: prog, bassline: true, drums: "backbeat", hats: true, tuningCents: root % 2 ? 35 : -25, noise: 0.01, seed: root + 3 });
      const data = computeChroma(s.audio, s.sr);
      const k = detectKey(data);
      total++;
      if (k.root === root && k.mode === mode) right++; else misses.push(`${NOTE_NAMES[root]} ${mode} -> ${k.key}`);
    }
  }
  assert.ok(right >= 22, `only ${right}/${total}; misses: ${misses.join("; ")}`);
});

test("tuning offset is recovered", () => {
  const s = renderSong({ bpm: 100, bars: 8, chords: [min(9), maj(5)], tuningCents: 40 });
  const d = computeChroma(s.audio, s.sr);
  assert.ok(Math.abs(d.tuning - 0.4) < 0.1, `tuning ${d.tuning}`);
});

test("chords: Am F C G at 120 BPM with drums and bass, per-beat accuracy", () => {
  const prog = [min(9), maj(5), maj(0), maj(7)];
  const s = renderSong({ bpm: 120, bars: 16, chords: prog, bassline: true, drums: "backbeat", hats: true, noise: 0.01 });
  const data = computeChroma(s.audio, s.sr);
  const beats: number[] = []; for (let t = 0; t < 16 * 2; t += 0.5) beats.push(t);
  const ev = detectChords(data, beats, { root: 0, mode: "major" }, 32);
  let ok = 0, n = 0;
  for (let bar = 0; bar < 16; bar++) {
    for (let b = 0; b < 4; b++) {
      const t = bar * 2 + b * 0.5 + 0.25; n++;
      const c = ev.find((e) => t >= e.start && t < e.start + e.duration);
      const truth = prog[bar % 4]!;
      if (c && c.root === truth.root && c.quality === truth.quality) ok++;
    }
  }
  assert.ok(ok / n >= 0.9, `chord accuracy ${(ok / n * 100).toFixed(0)}%: ${ev.slice(0, 8).map((e) => e.name).join(" ")}`);
  assert.ok(ev.length <= 22, `flicker: ${ev.length} chord events for 16 bars`);
});

test("chords: 7th and minor-7th qualities are distinguished", () => {
  const prog: ChordSpec[] = [{ root: 7, quality: "7" }, { root: 0, quality: "maj7" }, { root: 2, quality: "min7" }, { root: 9, quality: "min" }];
  const s = renderSong({ bpm: 90, bars: 12, chords: prog, chordLevel: 0.15 });
  const data = computeChroma(s.audio, s.sr);
  const beats: number[] = []; for (let t = 0; t < 12 * 4 * (60 / 90); t += 60 / 90) beats.push(t);
  const ev = detectChords(data, beats, { root: 0, mode: "major" }, 12 * 4 * (60 / 90));
  const names = new Set(ev.map((e) => e.name));
  for (const want of ["G7", "Cmaj7", "Dm7", "Am"]) assert.ok(names.has(want), `missing ${want}; got ${[...names].join(" ")}`);
});
