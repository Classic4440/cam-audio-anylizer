import test from "node:test";
import assert from "node:assert/strict";
import { detectStrikes, rhythmForChord } from "../src/lib/audio/dsp/comping.ts";

const SR = 22050;
const BAR = 2; // 120 bpm, 4/4
const BARS = 8;

function chordAudio(pattern: number[] | "pad", kicksAt: number[] = []) {
  const x = new Float32Array(SR * BAR * BARS);
  const freqs = [261.6, 329.6, 392];
  const add = (t0: number, len: number, env: (t: number) => number, gain = 0.2) => {
    const a = Math.floor(t0 * SR);
    for (let i = 0; i < len * SR && a + i < x.length; i++) {
      const t = i / SR;
      let v = 0;
      for (const f of freqs) v += Math.sin(2 * Math.PI * f * t);
      x[a + i]! += gain * env(t) * v;
    }
  };
  for (let b = 0; b < BARS; b++) {
    if (pattern === "pad") add(b * BAR, BAR, (t) => Math.min(1, t / 0.15) * Math.min(1, (BAR - t) / 0.1));
    else for (const p of pattern) add(b * BAR + p, 0.6, (t) => Math.exp(-t * 9));
  }
  for (const k of kicksAt) {
    const a = Math.floor(k * SR);
    for (let i = 0; i < SR * 0.2 && a + i < x.length; i++) x[a + i]! += 0.7 * Math.sin(2 * Math.PI * 55 * (i / SR)) * Math.exp(-(i / SR) * 18);
  }
  return x;
}

const STABS = [0, 0.75, 1.0, 1.75];

test("stab rhythm is recovered: 4 hits per bar, on the grid", () => {
  const strikes = detectStrikes(chordAudio(STABS), SR);
  let total = 0;
  for (let b = 1; b < BARS - 1; b++) {
    const hits = rhythmForChord(b * BAR, (b + 1) * BAR, strikes, { gridSec: 0.125, gridOffset: 0 });
    total += hits.length;
    assert.equal(hits.length, 4, `bar ${b}: ${hits.map((h) => h.start.toFixed(2)).join(",")}`);
    const want = STABS.map((s) => b * BAR + s);
    hits.forEach((h, i) => assert.ok(Math.abs(h.start - want[i]!) < 0.04, `bar ${b} hit ${i}: ${h.start} vs ${want[i]}`));
  }
  assert.equal(total, 4 * (BARS - 2));
});

test("a held pad stays one hit per chord", () => {
  const strikes = detectStrikes(chordAudio("pad"), SR);
  for (let b = 1; b < BARS - 1; b++) {
    assert.equal(rhythmForChord(b * BAR, (b + 1) * BAR, strikes).length, 1);
  }
});

test("hits tile the chord: each starts after the last, none run past the end", () => {
  const strikes = detectStrikes(chordAudio(STABS), SR);
  const hits = rhythmForChord(2 * BAR, 3 * BAR, strikes);
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i]!.start >= hits[i - 1]!.start + hits[i - 1]!.duration - 1e-9);
  const last = hits[hits.length - 1]!;
  assert.ok(last.start + last.duration <= 3 * BAR + 1e-9);
});

test("strikes at drum-hit times are ignored when excluded", () => {
  const s = [{ time: 0.75, strength: 1 }, { time: 1.0, strength: 1 }, { time: 1.5, strength: 1 }];
  assert.equal(rhythmForChord(0, 2, s).length, 4);
  assert.equal(rhythmForChord(0, 2, s, { exclude: [0.75, 1.5] }).length, 2);
});

test("strikes closer than the minimum gap collapse to the stronger one", () => {
  const s = [{ time: 1.0, strength: 0.4 }, { time: 1.06, strength: 0.9 }];
  const hits = rhythmForChord(0, 2, s);
  assert.equal(hits.length, 2);
  assert.ok(Math.abs(hits[1]!.start - 1.06) < 1e-9);
});

test("a kick under a pad does not create chord hits when its time is excluded", () => {
  const kicks = [0.5, 1.0, 1.5];
  const strikes = detectStrikes(chordAudio("pad", kicks.map((k) => k + BAR * 2)), SR);
  const raw = rhythmForChord(BAR * 2, BAR * 3, strikes).length;
  const cleaned = rhythmForChord(BAR * 2, BAR * 3, strikes, { exclude: kicks.map((k) => k + BAR * 2) }).length;
  assert.ok(cleaned <= raw);
  assert.equal(cleaned, 1);
});
