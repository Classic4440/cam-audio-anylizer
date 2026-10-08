import test from "node:test";
import assert from "node:assert/strict";
import { renderSong } from "./synth.ts";
import { FFT, hann } from "../src/lib/audio/dsp/fft2.ts";
import { estimateTempo, onsetStrength, trackBeats, fitGrid } from "../src/lib/audio/dsp/tempo.ts";

test("FFT matches a naive DFT and inverts exactly", () => {
  const n = 64; const fft = new FFT(n);
  const re = new Float32Array(n), im = new Float32Array(n);
  for (let i = 0; i < n; i++) re[i] = Math.sin(i * 0.7) + 0.3 * Math.cos(i * 2.1);
  const orig = Float32Array.from(re);
  const nr = new Float64Array(n), ni = new Float64Array(n);
  for (let k = 0; k < n; k++) for (let t = 0; t < n; t++) { nr[k]! += orig[t]! * Math.cos((2 * Math.PI * k * t) / n); ni[k]! -= orig[t]! * Math.sin((2 * Math.PI * k * t) / n); }
  fft.forward(re, im);
  for (let k = 0; k < n; k++) { assert.ok(Math.abs(re[k]! - nr[k]!) < 1e-3); assert.ok(Math.abs(im[k]! - ni[k]!) < 1e-3); }
  fft.inverse(re, im);
  for (let i = 0; i < n; i++) assert.ok(Math.abs(re[i]! - orig[i]!) < 1e-4);
  assert.equal(hann(8)[0], 0);
});

/** Band-log spectrogram helper identical in spirit to the analyzer's. */
import { bandLogSpectrogram } from "../src/lib/audio/dsp/spectral.ts";

for (const bpm of [70, 85, 100, 110, 124, 128, 140, 150, 174]) {
  test(`tempo ${bpm} BPM, with 1.3s of leading silence and light noise`, () => {
    const s = renderSong({ bpm, bars: Math.max(12, Math.round(40 / (240 / bpm))), lead: 1.3, drums: "backbeat", hats: true, noise: 0.01, chords: [{ root: 9, quality: "min" }, { root: 5, quality: "maj" }], bassline: true });
    const spec = bandLogSpectrogram(s.audio, s.sr);
    const env = onsetStrength(spec.bands, spec.hopTime);
    const est = estimateTempo(env, spec.hopTime);
    const beats = trackBeats(env, spec.hopTime, est.bpm);
    const fit = fitGrid(beats)!;
    const fitted = 60 / fit.period;
    assert.ok(Math.abs(fitted - bpm) < 0.5, `fitted ${fitted.toFixed(2)} vs ${bpm} (est ${est.bpm})`);
    // grid lines up with the true beat positions (lead 1.3s) within 30ms
    const phase = ((fit.offset + 1024 / s.sr - 1.3) % (60 / bpm) + 60 / bpm) % (60 / bpm);
    const dist = Math.min(phase, 60 / bpm - phase);
    assert.ok(dist < 0.03, `beat phase error ${(dist * 1000).toFixed(0)}ms`);
    assert.ok(fit.rms < 0.02);
  });
}
