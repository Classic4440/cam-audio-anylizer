import test from "node:test";
import assert from "node:assert/strict";
import { describeTone, extractKit, pickPatch, brightnessFrom } from "../src/lib/audio/dsp/tone.ts";
import { voiceChord, CHORD_INTERVALS } from "../src/lib/daw/voicing.ts";
import { rng } from "./synth.ts";

const SR = 22050;

function kickShape(t: number): number {
  const f = 45 + 90 * Math.exp(-t * 30);
  return Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 11);
}

/** 16 s of: a distinctive kick on every beat, a sustained chord bed, and some noise. */
function kickLoop() {
  const x = new Float32Array(SR * 16);
  const r = rng(3);
  const times: number[] = [];
  for (let b = 0; b < 30; b++) times.push(0.25 + b * 0.5);
  for (const t0 of times) {
    const a = Math.floor(t0 * SR);
    for (let i = 0; i < SR * 0.4 && a + i < x.length; i++) x[a + i]! += 0.8 * kickShape(i / SR);
  }
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    x[i]! += 0.12 * (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 277 * t) + Math.sin(2 * Math.PI * 330 * t));
    x[i]! += 0.02 * (r() * 2 - 1);
  }
  return { x, times };
}

test("extracted kick matches the real kick, not the chord bed under it", () => {
  const { x, times } = kickLoop();
  const kit = extractKit(x, SR, { kick: times });
  const kick = kit.find((k) => k.piece === "kick");
  assert.ok(kick, "no kick extracted");
  assert.ok(kick.hits >= 4);
  // Compare to the true kick shape (low band) after aligning on the peak.
  const ref = new Float32Array(kick.data.length);
  for (let i = 0; i < ref.length; i++) ref[i] = kickShape(Math.max(0, i / SR - 0.004));
  let best = -1;
  for (let lag = -60; lag <= 60; lag++) {
    let dot = 0, na = 0, nb = 0;
    for (let i = 200; i < 3000; i++) {
      const a = kick.data[i]!, b = ref[i + lag] ?? 0;
      dot += a * b; na += a * a; nb += b * b;
    }
    best = Math.max(best, dot / Math.sqrt(na * nb + 1e-12));
  }
  assert.ok(best > 0.8, `kick correlation ${best.toFixed(2)}`);
  // Sample is normalised and fades to silence.
  const peak = Math.max(...Array.from(kick.data, Math.abs));
  assert.ok(peak > 0.8 && peak <= 1);
  assert.ok(Math.abs(kick.data[kick.data.length - 1]!) < 0.01);
});

test("a piece with fewer than two hits is skipped", () => {
  const { x } = kickLoop();
  assert.equal(extractKit(x, SR, { snare: [1] }).length, 0);
});

function notes(kind: "pluck" | "pad", bright: number) {
  const x = new Float32Array(SR * 20);
  for (let n = 0; n < 40; n++) {
    const t0 = n * 0.5;
    const a = Math.floor(t0 * SR);
    const len = Math.floor(0.5 * SR);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const env = kind === "pluck" ? Math.exp(-t * 14) : Math.min(1, t / 0.2) * (t < 0.4 ? 1 : Math.max(0, 1 - (t - 0.4) / 0.1));
      let v = 0;
      for (let h = 1; h <= 6; h++) v += Math.sin(2 * Math.PI * 261.6 * h * t) / h ** (2 - bright);
      x[a + i]! += 0.15 * env * v;
    }
  }
  return x;
}

test("percussive tone picks a plucked/piano sound, sustained tone picks a pad-like sound", () => {
  const pl = describeTone(notes("pluck", 0.5), SR);
  const pd = describeTone(notes("pad", 0.2), SR);
  assert.ok(pl.attack < pd.attack, `attack ${pl.attack} vs ${pd.attack}`);
  assert.ok(pl.sustain < pd.sustain, `sustain ${pl.sustain} vs ${pd.sustain}`);
  assert.ok(["pluck", "piano", "epiano"].includes(pickPatch(pl)), pickPatch(pl));
  assert.ok(["pad", "strings", "organ"].includes(pickPatch(pd)), pickPatch(pd));
});

test("brighter material gives a higher centroid and brightness setting", () => {
  const dull = describeTone(notes("pad", 0.0), SR);
  const bright = describeTone(notes("pad", 1.0), SR);
  assert.ok(bright.centroid > dull.centroid);
  assert.ok(brightnessFrom(bright) >= brightnessFrom(dull));
});

test("voicing contains the right pitch classes and stays in range", () => {
  for (const q of Object.keys(CHORD_INTERVALS)) {
    for (let root = 0; root < 12; root++) {
      const v = voiceChord(null, root, q);
      assert.deepEqual(
        [...new Set(v.map((n) => ((n % 12) + 12) % 12))].sort((a, b) => a - b),
        [...new Set(CHORD_INTERVALS[q]!.map((i) => (root + i) % 12))].sort((a, b) => a - b),
        `${root}${q}`,
      );
      assert.ok(v.every((n) => n >= 52 && n <= 76));
    }
  }
});

test("voice leading moves less than root-position blocks across a I-V-vi-IV progression", () => {
  const prog: [number, string][] = [[0, "maj"], [7, "maj"], [9, "min"], [5, "maj"]];
  let prev: number[] | null = null;
  let led = 0;
  for (const [r, q] of prog) {
    const v = voiceChord(prev, r, q);
    if (prev) led += Math.abs(v.reduce((a, b) => a + b, 0) - prev.reduce((a, b) => a + b, 0));
    prev = v;
  }
  let blocks = 0;
  let pb: number[] | null = null;
  for (const [r, q] of prog) {
    const v = CHORD_INTERVALS[q]!.map((i) => 60 + r + i);
    if (pb) blocks += Math.abs(v.reduce((a, b) => a + b, 0) - pb.reduce((a, b) => a + b, 0));
    pb = v;
  }
  assert.ok(led < blocks, `led ${led} vs blocks ${blocks}`);
});
