import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import * as db from "../src/lib/daw/persistence.ts";
import { serializeProject, parseProject } from "../src/lib/daw/serialize.ts";
import { computePeaks, peaksRange } from "../src/lib/daw/peaks.ts";
import { encodeWav } from "../src/lib/daw/wav.ts";
import type { Project } from "../src/lib/daw/types.ts";

function proj(id = "p1"): Project {
  return {
    id, name: "Song", createdAt: 1, updatedAt: 1, bpm: 128, beatOffset: 0.2, beatsPerBar: 4, beatUnit: 4,
    key: "A minor", keyMode: "minor", bpmConfidence: 0.8, keyConfidence: 0.6,
    corrections: { bpm: false, key: false, downbeat: false },
    assets: { a1: { id: "a1", name: "song.wav", mime: "audio/wav", size: 4, duration: 5, sampleRate: 44100, channels: 2, role: "source", createdAt: 1 } },
    tracks: [{ id: "t1", name: "Mix", kind: "audio", color: "c", volume: 1, pan: 0, mute: false, solo: false, armed: false,
      clips: [{ kind: "audio", id: "c1", trackId: "t1", name: "Mix", start: 0, duration: 5, assetId: "a1", offset: 0, gain: 1, fadeIn: 0, fadeOut: 0 }] }],
    markers: [{ id: "m1", time: 0, duration: 5, name: "Intro" }], masterVolume: 1, snap: "1",
  };
}

test("project, audio blob, analysis (typed arrays) and peaks survive a 'refresh' (new connection)", async () => {
  const p = proj();
  const analysis = { bpm: 128, waveform: { min: new Float32Array([-0.5, -0.25]), max: new Float32Array([0.5, 0.25]) } };
  await db.saveAsset("p1", "a1", new Blob([new Uint8Array([1, 2, 3, 4])], { type: "audio/wav" }), "song.wav");
  await db.savePeaks("p1", "a1", computePeaks([new Float32Array(1000).fill(0.5)], 1000, 100));
  await db.saveProject(p, analysis);

  db.resetDbConnection(); // simulate page reload: reopen the database from scratch
  const loaded = await db.loadProject("p1");
  assert.ok(loaded);
  assert.equal(loaded!.project.tracks[0]!.clips[0]!.id, "c1");
  const a = loaded!.analysis as typeof analysis;
  assert.ok(a.waveform.max instanceof Float32Array);
  assert.deepEqual([...a.waveform.max], [0.5, 0.25]);
  const blob = await db.loadAsset("p1", "a1");
  assert.deepEqual([...new Uint8Array(await blob!.arrayBuffer())], [1, 2, 3, 4]);
  const pk = await db.loadPeaks("p1", "a1");
  assert.equal(pk!.min.length, 10);
  assert.deepEqual(await db.missingAssets(p), []);
});

test("list, save-as copy, rename and delete", async () => {
  const copy = { ...proj("p2"), name: "Song copy" };
  await db.copyProjectData("p1", copy);
  let list = await db.listProjects();
  assert.deepEqual(list.map((x) => x.id).sort(), ["p1", "p2"]);
  assert.ok(await db.loadAsset("p2", "a1"));
  assert.equal(list.find((x) => x.id === "p2")!.name, "Song copy");
  await db.deleteProject("p1");
  list = await db.listProjects();
  assert.deepEqual(list.map((x) => x.id), ["p2"]);
  assert.equal(await db.loadAsset("p1", "a1"), null); // audio removed with the project
  assert.ok(await db.loadAsset("p2", "a1"));          // copy unaffected
  assert.equal(await db.loadProject("p1"), null);
});

test("missing audio is reported for projects without stored assets", async () => {
  assert.deepEqual(await db.missingAssets(proj("ghost")), ["a1"]);
});

test("project file round-trips, revives typed arrays, ignores unknown fields", () => {
  const p = proj();
  const text = serializeProject(p, { waveform: { min: new Float32Array([-1, 0.5]) } });
  const back = parseProject(text);
  assert.equal(back.project.bpm, 128);
  assert.equal(back.project.tracks[0]!.clips.length, 1);
  assert.ok((back.analysis as { waveform: { min: Float32Array } }).waveform.min instanceof Float32Array);
  const withExtra = JSON.parse(text);
  withExtra.version = 7; withExtra.newThing = { x: 1 }; withExtra.project.futureField = true;
  const r = parseProject(JSON.stringify(withExtra));
  assert.equal(r.fromNewerVersion, true);
  assert.throws(() => parseProject("{nope"), /valid JSON/);
  assert.throws(() => parseProject(JSON.stringify({ version: 1, project: {} })), /Not a LANES project/);
  assert.throws(() => parseProject(JSON.stringify({ ...JSON.parse(text), project: { ...JSON.parse(text).project, bpm: 9000 } })), /Not a LANES project/);
});

test("peaks reduce correctly and range aggregation preserves extremes", () => {
  const sr = 1000;
  const x = new Float32Array(sr * 2);
  x[1500] = 0.9; x[200] = -0.7;
  const pk = computePeaks([x], sr, 50);
  assert.equal(pk.min.length, 40);
  const r = peaksRange(pk, 0, 2, 4); // 4 columns of 0.5s
  assert.ok(Math.abs(r.max[3]! - 0.9) < 1e-6);
  assert.ok(Math.abs(r.min[0]! + 0.7) < 1e-6);
  assert.equal(r.max[0], 0);
});

test("wav encoder writes a valid header and exact 16-bit samples", () => {
  const w = encodeWav([new Float32Array([0, 1, -1, 0.5]), new Float32Array([0, 0, 0, 0])], 48000, 16);
  const dv = new DataView(w.buffer);
  assert.equal(String.fromCharCode(...w.slice(0, 4)), "RIFF");
  assert.equal(dv.getUint16(22, true), 2);
  assert.equal(dv.getUint32(24, true), 48000);
  assert.equal(dv.getUint32(40, true), 4 * 2 * 2);
  assert.equal(dv.getInt16(44 + 4, true), 32767);   // frame1 L = +1
  assert.equal(dv.getInt16(44 + 8, true), -32768);  // frame2 L = -1
  const f32 = encodeWav([new Float32Array([0.25])], 44100, 32);
  assert.equal(new DataView(f32.buffer).getFloat32(44, true), 0.25);
});
