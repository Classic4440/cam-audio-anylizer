import test from "node:test";
import assert from "node:assert/strict";
import { convertLanesToMidi } from "../src/lib/daw/factory.ts";
import type { EventClip, Project, Track } from "../src/lib/daw/types.ts";

const base = { color: "x", volume: 1, pan: 0, mute: false, solo: false, armed: false };
const chordClip = (id: string, start: number, root: number, quality: string): EventClip => ({
  kind: "event", id, trackId: "ch", name: "chord", start, duration: 2, velocity: 1, chord: { root, quality },
} as EventClip);

function project(): Project {
  const chords: Track = { ...base, id: "ch", name: "Chords", kind: "chords", lane: "chords", clips: [chordClip("a", 0, 0, "maj"), chordClip("b", 2, 7, "maj"), chordClip("c", 4, 9, "min")] };
  return {
    id: "p", name: "t", createdAt: 0, updatedAt: 0, bpm: 120, beatOffset: 0, beatsPerBar: 4, beatUnit: 4,
    key: "C major", keyMode: "major", bpmConfidence: 1, keyConfidence: 1,
    corrections: { bpm: false, key: false, downbeat: false }, assets: {}, tracks: [chords], markers: [], masterVolume: 1, snap: "1",
  } as Project;
}

const keys = (p: Project) => p.tracks.find((t) => t.synth === "keys")!;
const pcs = (notes: EventClip[]) => [...new Set(notes.map((n) => (n.pitch ?? 0) % 12))].sort((a, b) => a - b);

test("chords convert to a keys track with the chosen instrument and brightness", () => {
  const p = convertLanesToMidi(project(), { patch: "epiano", brightness: 0.8 });
  const k = keys(p);
  assert.equal(k.patch, "epiano");
  assert.equal(k.brightness, 0.8);
  const defaults = keys(convertLanesToMidi(project()));
  assert.equal(defaults.patch, "piano");
});

test("each chord is voiced with its own notes and neighbouring chords stay close", () => {
  const notes = keys(convertLanesToMidi(project())).clips as EventClip[];
  const at = (t: number) => notes.filter((n) => Math.abs(n.start - t) < 1e-9);
  assert.deepEqual(pcs(at(0)), [0, 4, 7]); // C
  assert.deepEqual(pcs(at(2)), [2, 7, 11]); // G
  assert.deepEqual(pcs(at(4)), [0, 4, 9]); // Am
  const mean = (ns: EventClip[]) => ns.reduce((s, n) => s + (n.pitch ?? 0), 0) / ns.length;
  assert.ok(Math.abs(mean(at(0)) - mean(at(2))) < 6);
  assert.ok(Math.abs(mean(at(2)) - mean(at(4))) < 6);
});

test("strikes re-hit the chord; no strikes keeps one held chord", () => {
  const held = keys(convertLanesToMidi(project())).clips.length;
  const strikes = [{ time: 0.75, strength: 1 }, { time: 1.25, strength: 1 }, { time: 2.5, strength: 1 }];
  const hit = keys(convertLanesToMidi(project(), { strikes })).clips as EventClip[];
  assert.ok(hit.length > held, `${hit.length} vs ${held}`);
  // First chord (0..2 s) has hits at 0, 0.75, 1.25 -> three starts, each covering the whole voicing.
  const starts = [...new Set(hit.filter((n) => n.start < 2).map((n) => n.start))].sort((a, b) => a - b);
  assert.equal(starts.length, 3);
  assert.ok(Math.abs(starts[1]! - 0.75) < 0.07 && Math.abs(starts[2]! - 1.25) < 0.07);
  // Nothing runs past its chord.
  assert.ok(hit.every((n) => n.start + n.duration <= (n.start < 2 ? 2 : n.start < 4 ? 4 : 6) + 1e-9));
});

test("an empty strike list leaves chords held, and a drum kit is attached to the drum track", () => {
  const held = keys(convertLanesToMidi(project())).clips.length;
  assert.equal(keys(convertLanesToMidi(project(), { strikes: [] })).clips.length, held);
  const kit = { kick: "asset-k", snare: "asset-s" };
  const withKit = convertLanesToMidi(project(), { kit });
  assert.deepEqual(withKit.tracks.find((t) => t.synth === "drums")!.kit, kit);
  assert.equal(convertLanesToMidi(project()).tracks.find((t) => t.synth === "drums")!.kit, undefined);
});
