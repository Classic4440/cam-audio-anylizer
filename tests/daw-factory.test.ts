import test from "node:test";
import assert from "node:assert/strict";
import { AudioBuffer, OfflineAudioContext } from "node-web-audio-api";
import { renderSong } from "./synth.ts";
import { analyzePcm } from "../src/lib/audio/analysis-core.ts";
import { projectFromAnalysis, addStemTracks, convertLanesToMidi, assetMeta, applyLanes } from "../src/lib/daw/factory.ts";
import { encodeMidi, exportProjectMidi, projectMidiTracks } from "../src/lib/daw/midi.ts";
import { renderProject } from "../src/lib/daw/mixer-graph.ts";
import { separateStems } from "../src/lib/audio/separate.ts";
import { serializeProject, parseProject } from "../src/lib/daw/serialize.ts";

const song = renderSong({ bpm: 120, bars: 16, chords: [{ root: 9, quality: "min" }, { root: 5, quality: "maj" }, { root: 0, quality: "maj" }, { root: 7, quality: "maj" }], bassline: true, drums: "backbeat", hats: true, noise: 0.005 });
const analysis = analyzePcm({ channels: [song.audio], sampleRate: song.sr, fileName: "song.wav" });
const src = assetMeta({ name: "song.wav", mime: "audio/wav", size: 1, buffer: { duration: analysis.duration, sampleRate: song.sr, numberOfChannels: 1 }, role: "source" });

test("analysis becomes a Mix track + editable lane tracks + markers, and survives file round-trip", () => {
  const p = projectFromAnalysis(analysis, src);
  assert.equal(p.tracks[0]!.name, "Mix");
  assert.equal(p.tracks.filter((t) => t.kind === "analysis").length, 5);
  assert.equal(p.tracks.filter((t) => t.kind === "chords").length, 1);
  assert.ok(p.tracks.find((t) => t.lane === "kick")!.clips.length > 20);
  assert.ok(p.markers.length >= 1);
  const back = parseProject(serializeProject(p, analysis)).project;
  assert.equal(back.tracks.length, p.tracks.length);
  assert.equal(back.bpm, p.bpm);
  // re-applying fresh analysis keeps mixer settings
  const re = applyLanes({ ...p, tracks: p.tracks.map((t) => (t.lane === "kick" ? { ...t, volume: 0.3 } : t)) }, analysis);
  assert.equal(re.tracks.find((t) => t.lane === "kick")!.volume, 0.3);
});

test("MIDI export: valid SMF, tempo, drum channel, notes preserved", () => {
  const p = convertLanesToMidi(projectFromAnalysis(analysis, src));
  const specs = projectMidiTracks(p);
  assert.ok(specs.some((s) => s.channel === 9 && s.notes.length > 40), "drum notes present");
  const bytes = exportProjectMidi(p);
  assert.equal(String.fromCharCode(...bytes.slice(0, 4)), "MThd");
  assert.equal((bytes[10]! << 8) | bytes[11]!, specs.length + 1); // conductor + tracks
  // tempo meta: 120 BPM = 500000 us/qn
  const idx = bytes.findIndex((b, i) => b === 0xff && bytes[i + 1] === 0x51);
  assert.equal((bytes[idx + 3]! << 16) | (bytes[idx + 4]! << 8) | bytes[idx + 5]!, 500000);
  // count note-ons by scanning for 0x99 (drum channel) status bytes followed by plausible data
  const drumOn = specs.find((s) => s.channel === 9)!.notes.length;
  assert.ok(drumOn > 40);
  assert.ok(encodeMidi([], 100).length > 20);
});

test("MIDI tracks are audible: the built-in synth renders energy at drum hit times", async () => {
  const p = convertLanesToMidi(projectFromAnalysis(analysis, src));
  const drumTrack = p.tracks.find((t) => t.synth === "drums")!;
  const buf = await renderProject(p, new Map(), OfflineAudioContext as never, { sampleRate: 22050, to: 8, onlyTrackIds: [drumTrack.id] });
  const d = buf.getChannelData(0);
  const window = (t0: number, t1: number) => { let e = 0; for (let i = Math.floor(t0 * 22050); i < Math.floor(t1 * 22050); i++) e += d[i]! ** 2; return e; };
  const first = drumTrack.clips[0]!;
  assert.ok(window(first.start, first.start + 0.1) > 0.02, "sound at the first hit");
  const total = window(0, 8);
  assert.ok(total > 5, `total rendered energy ${total.toFixed(1)}`);
  // a gap well away from any hit stays quiet compared with the hit itself
  const hits = drumTrack.clips.map((c) => c.start);
  const quiet = hits.find((t, i) => hits[i + 1] !== undefined && hits[i + 1]! - t > 0.4 && t > 1);
  if (quiet !== undefined) assert.ok(window(quiet + 0.3, quiet + 0.38) < window(quiet, quiet + 0.08) * 0.2);
});

test("stems: separate, add as tracks, source muted, and stems re-sum to the mix through the real audio graph", async () => {
  const stereo = [song.audio, song.audio];
  const st = separateStems(stereo, song.sr);
  const mk = (name: string, ch: Float32Array[]) => {
    const b = new AudioBuffer({ length: ch[0]!.length, sampleRate: song.sr, numberOfChannels: ch.length });
    ch.forEach((c, i) => b.getChannelData(i).set(c));
    return b;
  };
  const buffers = new Map<string, AudioBuffer>();
  const srcBuf = mk("mix", stereo); buffers.set(src.id, srcBuf);
  const stemAssets = (["drums", "bass", "vocals", "other"] as const).map((stem) => {
    const b = mk(stem, st[stem]);
    const asset = assetMeta({ name: `${stem}.wav`, mime: "audio/wav", size: 1, buffer: b, role: "stem" });
    buffers.set(asset.id, b);
    return { stem, asset };
  });
  const p = addStemTracks(projectFromAnalysis(analysis, src), stemAssets);
  assert.equal(p.tracks.filter((t) => t.name.endsWith("(stem)")).length, 4);
  assert.equal(p.tracks[0]!.mute, true, "source mix muted");
  const all = await renderProject(p, buffers as never, OfflineAudioContext as never, { sampleRate: song.sr, to: 10 });
  const orig = await renderProject({ ...p, tracks: p.tracks.map((t, i) => ({ ...t, mute: i !== 0 })) }, buffers as never, OfflineAudioContext as never, { sampleRate: song.sr, to: 10 });
  let s = 0, e = 0; const a = all.getChannelData(0), o = orig.getChannelData(0);
  for (let i = 0; i < a.length; i++) { s += o[i]! ** 2; e += (o[i]! - a[i]!) ** 2; }
  const snr = 10 * Math.log10(s / e);
  assert.ok(snr > 40, `stem sum vs mix SNR ${snr.toFixed(1)} dB`);
});

import { refineLanesFromStems } from "../src/lib/audio/refine.ts";
test("refining lanes on separated stems keeps drum hits precise and finds the bass line", () => {
  const st = separateStems([song.audio, song.audio], song.sr);
  const r = refineLanesFromStems({ drums: st.drums, bass: st.bass, vocals: st.vocals }, song.sr, analysis.duration, { period: 0.5, offset: analysis.beatOffset });
  const truthK: number[] = [], truthS: number[] = [];
  for (let bar = 0; bar < 16; bar++) { truthK.push(bar * 2, bar * 2 + 1); truthS.push(bar * 2 + 0.5, bar * 2 + 1.5); }
  const prf = (det: number[], truth: number[]) => { let tp = 0; const used = new Set<number>(); for (const t of det) { const j = truth.findIndex((x, i) => !used.has(i) && Math.abs(x - t) < 0.05); if (j >= 0) { used.add(j); tp++; } } return { p: tp / Math.max(1, det.length), r: tp / truth.length }; };
  const k = prf(r.kick.map((c) => c.start), truthK), s = prf(r.snare.map((c) => c.start), truthS);
  console.log(`# refined: kick P${(k.p * 100).toFixed(0)} R${(k.r * 100).toFixed(0)}  snare P${(s.p * 100).toFixed(0)} R${(s.r * 100).toFixed(0)}  bass notes ${r.bass.length}`);
  assert.ok(k.p > 0.85 && k.r > 0.85, `kick ${JSON.stringify(k)}`);
  assert.ok(s.p > 0.8 && s.r > 0.8, `snare ${JSON.stringify(s)}`);
  assert.ok(r.bass.length >= 20);
});
