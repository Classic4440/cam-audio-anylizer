import test from "node:test";
import assert from "node:assert/strict";
import { AudioBuffer, OfflineAudioContext } from "node-web-audio-api";
import { renderProject, planClip, audibleTrackIds } from "../src/lib/daw/mixer-graph.ts";
import type { Project, AudioClip } from "../src/lib/daw/types.ts";

const SR = 8000;
function dc(seconds: number, v: number) {
  const b = new AudioBuffer({ length: Math.round(seconds * SR), sampleRate: SR, numberOfChannels: 1 });
  b.getChannelData(0).fill(v);
  return b;
}
function clip(over: Partial<AudioClip>): AudioClip {
  return { kind: "audio", id: "c", trackId: "t1", name: "c", start: 0, duration: 1, assetId: "a", offset: 0, gain: 1, fadeIn: 0, fadeOut: 0, ...over };
}
function proj(tracks: Project["tracks"]): Project {
  return {
    id: "p", name: "p", createdAt: 0, updatedAt: 0, bpm: 120, beatOffset: 0, beatsPerBar: 4, beatUnit: 4, key: "C major", keyMode: "major",
    bpmConfidence: 1, keyConfidence: 1, corrections: { bpm: false, key: false, downbeat: false },
    assets: {}, tracks, markers: [], masterVolume: 1, snap: "off",
  };
}
const trk = (id: string, clips: AudioClip[], extra: Partial<Project["tracks"][0]> = {}) => ({
  id, name: id, kind: "audio" as const, color: "x", volume: 1, pan: 0, mute: false, solo: false, armed: false, clips: clips.map((c) => ({ ...c, trackId: id })), ...extra,
});
const rms = (ch: Float32Array, t0: number, t1: number) => {
  let s = 0; const a = Math.floor(t0 * SR), b = Math.floor(t1 * SR);
  for (let i = a; i < b; i++) s += ch[i]! * ch[i]!;
  return Math.sqrt(s / (b - a));
};
const render = (p: Project, bufs: Map<string, any>, o = {}) => renderProject(p, bufs as never, OfflineAudioContext as never, { sampleRate: SR, ...o });

test("clip plays at its timeline position using the right source offset", async () => {
  const buf = new AudioBuffer({ length: 4 * SR, sampleRate: SR, numberOfChannels: 1 });
  const d = buf.getChannelData(0);
  d.fill(0.2, 0, 2 * SR); d.fill(0.8, 2 * SR); // source: 0.2 for 2s then 0.8
  const p = proj([trk("t1", [clip({ start: 1, offset: 1.5, duration: 2 })])]); // plays source 1.5..3.5 at t=1..3
  const out = (await render(p, new Map([["a", buf]]), { to: 4 })).getChannelData(0);
  assert.ok(rms(out, 0, 0.9) < 1e-4, "silent before the clip");
  assert.ok(Math.abs(out[Math.floor(1.2 * SR)]! - 0.2 * Math.SQRT1_2) < 0.02, "source 0.2 region (center pan = -3dB)");
  assert.ok(Math.abs(out[Math.floor(2.0 * SR)]! - 0.8 * Math.SQRT1_2) < 0.02, "source switches to 0.8 at source t=2 -> timeline t=1.5+... ");
  assert.ok(rms(out, 3.1, 3.9) < 1e-4, "silent after the clip");
});

test("starting playback mid-clip (seek) lands on the right source sample", async () => {
  const buf = new AudioBuffer({ length: 4 * SR, sampleRate: SR, numberOfChannels: 1 });
  buf.getChannelData(0).fill(0.2, 0, 2 * SR); buf.getChannelData(0).fill(0.8, 2 * SR);
  const p = proj([trk("t1", [clip({ start: 0, offset: 0, duration: 4 })])]);
  const out = (await render(p, new Map([["a", buf]]), { from: 2.5, to: 3.5 })).getChannelData(0);
  assert.ok(Math.abs(out[Math.floor(0.5 * SR)]! - 0.8 * Math.SQRT1_2) < 0.02);
});

test("clip gain, track volume, master volume and fades", async () => {
  const buf = dc(2, 1);
  const p = proj([trk("t1", [clip({ duration: 2, gain: 0.5, fadeIn: 1 })], { volume: 0.5 })]);
  p.masterVolume = 1;
  const out = (await render(p, new Map([["a", buf]]), { to: 2 })).getChannelData(0);
  const full = 0.5 * 0.5 * Math.SQRT1_2; // clip gain * track vol * center pan
  assert.ok(Math.abs(out[Math.floor(1.5 * SR)]! - full) < 0.01, "full level after fade-in");
  assert.ok(Math.abs(out[Math.floor(0.5 * SR)]! - full * 0.5) < 0.02, "half level halfway through fade-in");
  assert.ok(out[2]! < full * 0.1, "starts near silence");
});

test("fade-out reaches silence at the clip end", async () => {
  const p = proj([trk("t1", [clip({ duration: 2, fadeOut: 1 })])]);
  const out = (await render(p, new Map([["a", dc(2, 1)]]), { to: 2 })).getChannelData(0);
  assert.ok(out[Math.floor(0.5 * SR)]! > 0.6);
  assert.ok(Math.abs(out[Math.floor(1.5 * SR)]! - 0.5 * Math.SQRT1_2) < 0.03);
  assert.ok(out[2 * SR - 4]! < 0.02);
});

test("mute and solo", async () => {
  const bufs = new Map([["a", dc(1, 0.5)], ["b", dc(1, 0.25)]]);
  const a = trk("t1", [clip({ assetId: "a" })]);
  const b = trk("t2", [clip({ assetId: "b" })]);
  const lvl = async (p: Project) => (await render(p, bufs, { to: 1 })).getChannelData(0)[SR / 2]!;
  const both = await lvl(proj([a, b]));
  assert.ok(Math.abs(both - 0.75 * Math.SQRT1_2) < 0.02);
  assert.ok(Math.abs((await lvl(proj([{ ...a, mute: true }, b]))) - 0.25 * Math.SQRT1_2) < 0.02);
  assert.ok(Math.abs((await lvl(proj([{ ...a, solo: true }, b]))) - 0.5 * Math.SQRT1_2) < 0.02);
  assert.ok(Math.abs((await lvl(proj([{ ...a, solo: true, mute: true }, b]))) - 0) < 0.01, "muted beats solo");
  assert.deepEqual([...audibleTrackIds([{ ...a, solo: true } as never, b as never])], ["t1"]);
});

test("pan sends audio left/right", async () => {
  const p = proj([trk("t1", [clip({})], { pan: -1 })]);
  const buf = (await render(p, new Map([["a", dc(1, 0.5)]]), { to: 1 }));
  assert.ok(buf.getChannelData(0)[SR / 2]! > 0.45);
  assert.ok(Math.abs(buf.getChannelData(1)[SR / 2]!) < 0.01);
});

test("stem export renders only the chosen track regardless of mute/solo", async () => {
  const bufs = new Map([["a", dc(1, 0.5)], ["b", dc(1, 0.25)]]);
  const p = proj([trk("t1", [clip({ assetId: "a" })], { mute: true }), trk("t2", [clip({ assetId: "b" })])]);
  const only1 = (await render(p, bufs, { to: 1, onlyTrackIds: ["t1"] })).getChannelData(0)[SR / 2]!;
  assert.ok(Math.abs(only1 - 0.5 * Math.SQRT1_2) < 0.02);
});

test("planClip math", () => {
  const c = clip({ start: 2, offset: 1, duration: 4, fadeIn: 1, fadeOut: 1 });
  assert.equal(planClip(c, 10), null);
  const mid = planClip(c, 4)!; // 2s into the clip
  assert.equal(mid.when, 0); assert.equal(mid.offset, 3); assert.equal(mid.duration, 2);
  assert.equal(mid.startGain, 0);
  const early = planClip(c, 0)!;
  assert.equal(early.when, 2); assert.equal(early.offset, 1);
  const inFade = planClip(c, 2.5)!; // 0.5s into a 1s fade-in
  assert.equal(inFade.startGain, 0.5);
});
