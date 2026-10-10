import test from "node:test";
import assert from "node:assert/strict";
import { bassMatch, chordMatch, drumMatch } from "../src/lib/audio/dsp/match.ts";
import { renderSong, type ChordSpec } from "./synth.ts";

const maj = (r: number): ChordSpec => ({ root: r % 12, quality: "maj" });
const min = (r: number): ChordSpec => ({ root: r % 12, quality: "min" });
const PROG_A = [maj(0), maj(5), maj(7), min(9)];
const PROG_B = [min(2), maj(10), maj(3), maj(9)];
const base = { bpm: 110, bars: 16 };

test("chord match: same progression scores high, a different one scores far lower", () => {
  const orig = renderSong({ ...base, chords: PROG_A, seed: 1 });
  const same = renderSong({ ...base, chords: PROG_A, seed: 9 });
  const other = renderSong({ ...base, chords: PROG_B, seed: 9 });
  const good = chordMatch(orig.audio, orig.sr, same.audio, same.sr);
  const bad = chordMatch(orig.audio, orig.sr, other.audio, other.sr);
  assert.ok(good > 60, `same progression ${good.toFixed(0)}`);
  assert.ok(bad < good * 0.6, `different progression ${bad.toFixed(0)} vs ${good.toFixed(0)}`);
});

test("drum match: same pattern high, different pattern lower, silence zero", () => {
  const orig = renderSong({ ...base, drums: "backbeat", hats: true, seed: 1 });
  const same = renderSong({ ...base, drums: "backbeat", hats: true, seed: 5 });
  const diff = renderSong({ ...base, drums: "four", hats: false, seed: 5 });
  const silent = new Float32Array(orig.audio.length);
  for (const piece of ["kick", "snare", "hats"] as const) {
    const g = drumMatch(orig.audio, orig.sr, same.audio, same.sr, piece);
    assert.ok(g > 55, `${piece} same pattern ${g.toFixed(0)}`);
    assert.equal(drumMatch(orig.audio, orig.sr, silent, orig.sr, piece), 0);
  }
  const kickSame = drumMatch(orig.audio, orig.sr, same.audio, same.sr, "kick");
  const kickDiff = drumMatch(orig.audio, orig.sr, diff.audio, diff.sr, "kick");
  assert.ok(kickDiff < kickSame - 15, `kick different ${kickDiff.toFixed(0)} vs ${kickSame.toFixed(0)}`);
  // A rebuild at the wrong tempo drifts out of time with the original: every piece should score far lower.
  const drifting = renderSong({ ...base, bpm: 97, drums: "backbeat", hats: true, seed: 5 });
  for (const piece of ["kick", "snare", "hats"] as const) {
    const same_ = drumMatch(orig.audio, orig.sr, same.audio, same.sr, piece);
    const drift = drumMatch(orig.audio, orig.sr, drifting.audio, drifting.sr, piece);
    assert.ok(drift < same_ - 30, `${piece} wrong tempo ${drift.toFixed(0)} vs ${same_.toFixed(0)}`);
  }
});

test("bass match: same bass line high, a different line lower", () => {
  const orig = renderSong({ ...base, chords: PROG_A, bassline: true, seed: 1 });
  const same = renderSong({ ...base, chords: PROG_A, bassline: true, seed: 4 });
  const other = renderSong({ ...base, chords: PROG_B, bassline: true, seed: 4 });
  const good = bassMatch(orig.audio, orig.sr, same.audio, same.sr);
  const bad = bassMatch(orig.audio, orig.sr, other.audio, other.sr);
  assert.ok(good > 60, `same bass ${good.toFixed(0)}`);
  assert.ok(bad < good * 0.7, `different bass ${bad.toFixed(0)} vs ${good.toFixed(0)}`);
});

test("scores stay inside 0..100", () => {
  const a = renderSong({ ...base, chords: PROG_A, bassline: true, drums: "four", seed: 2 });
  const b = renderSong({ ...base, chords: PROG_B, bassline: true, drums: "backbeat", seed: 3 });
  for (const v of [chordMatch(a.audio, a.sr, b.audio, b.sr), bassMatch(a.audio, a.sr, b.audio, b.sr), drumMatch(a.audio, a.sr, b.audio, b.sr, "snare")]) {
    assert.ok(v >= 0 && v <= 100, String(v));
  }
});

test("signals with different sample rates are compared correctly", () => {
  const orig = renderSong({ ...base, chords: PROG_A, seed: 1 });
  const same = renderSong({ ...base, chords: PROG_A, seed: 9 });
  // Decimate the rebuild to half the rate (simple 2:1 average) and tell the scorer its true rate.
  const half = new Float32Array(Math.floor(same.audio.length / 2));
  for (let i = 0; i < half.length; i++) half[i] = (same.audio[2 * i]! + same.audio[2 * i + 1]!) / 2;
  const full = chordMatch(orig.audio, orig.sr, same.audio, same.sr);
  const mixed = chordMatch(orig.audio, orig.sr, half, same.sr / 2);
  assert.ok(Math.abs(full - mixed) < 15, `${full.toFixed(0)} vs ${mixed.toFixed(0)}`);
});
