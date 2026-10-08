import test from "node:test";
import assert from "node:assert/strict";
import { renderSong } from "./synth.ts";
import { separateStems } from "../src/lib/audio/separate.ts";

const sdr = (truth: Float32Array, est: Float32Array) => {
  let s = 0, e = 0;
  for (let i = 0; i < truth.length; i++) { s += truth[i]! ** 2; e += (truth[i]! - est[i]!) ** 2; }
  return 10 * Math.log10(s / Math.max(1e-12, e));
};
const energy = (x: Float32Array) => { let s = 0; for (const v of x) s += v * v; return s; };

function build() {
  const sr = 44100, bpm = 120, bars = 10;
  const drums = renderSong({ bpm, bars, sr, drums: "backbeat", hats: true, seed: 3 }).audio;
  const bass = renderSong({ bpm, bars, sr, chords: [{ root: 9, quality: "min" }, { root: 5, quality: "maj" }], bassline: true, chordLevel: 0, seed: 4 }).audio;
  const pad = renderSong({ bpm, bars, sr, chords: [{ root: 9, quality: "min" }, { root: 5, quality: "maj" }], chordLevel: 0.2, seed: 5 }).audio;
  const n = Math.min(drums.length, bass.length, pad.length);
  // vocal-ish: centre-panned gliding tone with harmonics
  const vox = new Float32Array(n);
  for (let i = 0; i < n; i++) { const t = i / sr; const ph = 2 * Math.PI * (600 * t - (120 / (2 * Math.PI * 0.7)) * Math.cos(2 * Math.PI * 0.7 * t)); vox[i] = 0.18 * (Math.sin(ph) + 0.4 * Math.sin(2 * ph)); }
  const L = new Float32Array(n), R = new Float32Array(n);
  const padL = new Float32Array(n), padR = new Float32Array(n);
  for (let i = 0; i < n; i++) { padL[i] = pad[i]! * 1.0; padR[i] = pad[i]! * 0.15; } // pad panned hard left
  for (let i = 0; i < n; i++) { L[i] = drums[i]! + bass[i]! + padL[i]! + vox[i]!; R[i] = drums[i]! + bass[i]! + padR[i]! + vox[i]!; }
  return { sr, n, L, R, drums: drums.slice(0, n), bass: bass.slice(0, n), pad, vox };
}

test("stems sum back to the original mix (masks are complementary)", () => {
  const t = build();
  const st = separateStems([t.L, t.R], t.sr);
  const sum = new Float32Array(t.n);
  for (const name of ["drums", "bass", "vocals", "other"] as const) for (let i = 0; i < t.n; i++) sum[i]! += st[name][0]![i]!;
  const snr = sdr(t.L, sum);
  assert.ok(snr > 60, `reconstruction SNR ${snr.toFixed(1)} dB`);
});

test("drums go to the drum stem, bass to the bass stem, centre tone to vocals", () => {
  const t = build();
  const st = separateStems([t.L, t.R], t.sr);
  const dS = sdr(t.drums, st.drums[0]!), bS = sdr(t.bass, st.bass[0]!), vS = sdr(t.vox, st.vocals[0]!);
  console.log(`# SDR  drums ${dS.toFixed(1)} dB   bass ${bS.toFixed(1)} dB   vocals(centre) ${vS.toFixed(1)} dB`);
  // Where the true source lives, its stem should hold most of the energy.
  assert.ok(energy(st.drums[0]!) > energy(st.bass[0]!) * 0.2);
  assert.ok(dS > 3, `drums SDR ${dS.toFixed(1)}`);
  assert.ok(bS > 5, `bass SDR ${bS.toFixed(1)}`);
  assert.ok(vS > 2, `vocals SDR ${vS.toFixed(1)}`);
  // Leakage: the hard-left pad must stay out of the vocal (centre) stem.
  assert.ok(energy(st.vocals[0]!) < energy(t.vox) * 3, "vocal stem should not swallow the pad");
});

test("mono input keeps one channel and still reconstructs", () => {
  const t = build();
  const mono = new Float32Array(t.n); for (let i = 0; i < t.n; i++) mono[i] = (t.L[i]! + t.R[i]!) / 2;
  const st = separateStems([mono], t.sr);
  assert.equal(st.drums.length, 1);
  const sum = new Float32Array(t.n);
  for (const name of ["drums", "bass", "vocals", "other"] as const) for (let i = 0; i < t.n; i++) sum[i]! += st[name][0]![i]!;
  assert.ok(sdr(mono, sum) > 60);
});

test("processing speed", () => {
  const t = build();
  const t0 = Date.now();
  separateStems([t.L, t.R], t.sr);
  console.log(`# separation: ${((Date.now() - t0) / 1000).toFixed(1)}s for ${(t.n / t.sr).toFixed(0)}s of stereo audio`);
});
