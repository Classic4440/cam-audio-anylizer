import test from "node:test";
import assert from "node:assert/strict";
import { ProjectStore } from "../src/lib/daw/store.ts";
import * as ops from "../src/lib/daw/ops.ts";
import { snapTime, hitTestClip, layoutRows, formatPosition, projectEnd } from "../src/lib/daw/timeline-math.ts";
import type { Project, AudioClip } from "../src/lib/daw/types.ts";

function makeProject(): Project {
  const clip: AudioClip = {
    kind: "audio", id: "c1", trackId: "t1", name: "Mix", start: 0, duration: 10,
    assetId: "a1", offset: 0, gain: 1, fadeIn: 0, fadeOut: 0,
  };
  return {
    id: "p1", name: "Test", createdAt: 0, updatedAt: 0, bpm: 120, beatOffset: 0.1,
    beatsPerBar: 4, beatUnit: 4, key: "A minor", keyMode: "minor",
    bpmConfidence: 1, keyConfidence: 1,
    corrections: { bpm: false, key: false, downbeat: false },
    assets: { a1: { id: "a1", name: "song", mime: "audio/wav", size: 1, duration: 10, sampleRate: 44100, channels: 2, role: "source", createdAt: 0 } },
    tracks: [
      { id: "t1", name: "Mix", kind: "audio", color: "x", volume: 1, pan: 0, mute: false, solo: false, armed: false, clips: [clip] },
      { id: "t2", name: "Other", kind: "audio", color: "x", volume: 1, pan: 0, mute: false, solo: false, armed: false, clips: [] },
      { id: "t3", name: "Kick", kind: "analysis", color: "x", volume: 1, pan: 0, mute: false, solo: false, armed: false,
        clips: [{ kind: "event", id: "e1", trackId: "t3", name: "hit", start: 1, duration: 0.1, velocity: 1 }] },
    ],
    markers: [], masterVolume: 1, snap: "1",
  };
}

test("snap anchors on beatOffset", () => {
  const p = makeProject();
  assert.ok(Math.abs(snapTime(0.62, p) - 0.6) < 1e-9); // beat=0.5, offset 0.1 -> grid 0.1,0.6,1.1
  assert.equal(snapTime(0.62, { ...p, snap: "off" }), 0.62);
  assert.ok(Math.abs(snapTime(1.9, { ...p, snap: "bar" }) - 2.1) < 1e-9);
});

test("move clamps at 0 and is a no-op for zero delta", () => {
  const p = makeProject();
  assert.equal(ops.moveClips(p, ["c1"], 0), p);
  const m = ops.moveClips(p, ["c1"], -5);
  assert.equal(m.tracks[0]!.clips[0]!.start, 0);
  const m2 = ops.moveClips(p, ["c1"], 3);
  assert.equal(m2.tracks[0]!.clips[0]!.start, 3);
});

test("move between compatible tracks only", () => {
  const p = makeProject();
  const ok = ops.moveClips(p, ["c1"], 0, "t2");
  assert.equal(ok.tracks[1]!.clips.length, 1);
  assert.equal(ok.tracks[1]!.clips[0]!.trackId, "t2");
  assert.equal(ok.tracks[0]!.clips.length, 0);
  const bad = ops.moveClips(p, ["c1"], 0, "t3"); // audio onto event track: refused
  assert.equal(bad, p);
});

test("resize left trims into source and adjusts offset", () => {
  const p = makeProject();
  const r = ops.resizeClip(p, "c1", "left", 2);
  const c = r.tracks[0]!.clips[0] as AudioClip;
  assert.equal(c.start, 2); assert.equal(c.offset, 2); assert.equal(c.duration, 8);
  // cannot extend left of the source start
  const r2 = ops.resizeClip(r, "c1", "left", -5);
  const c2 = r2.tracks[0]!.clips[0] as AudioClip;
  assert.equal(c2.start, 0); assert.equal(c2.offset, 0);
});

test("resize right cannot exceed source length; min duration enforced", () => {
  const p = makeProject();
  const shrink = ops.resizeClip(p, "c1", "right", 4);
  assert.equal(shrink.tracks[0]!.clips[0]!.duration, 4);
  const grow = ops.resizeClip(shrink, "c1", "right", 99);
  assert.equal(grow.tracks[0]!.clips[0]!.duration, 10);
  const tiny = ops.resizeClip(p, "c1", "right", 0);
  assert.ok(tiny.tracks[0]!.clips[0]!.duration >= ops.MIN_CLIP_SECONDS);
});

test("split produces two contiguous clips with correct source offsets", () => {
  const p = makeProject();
  const { project, ids } = ops.splitClip(p, "c1", 4);
  assert.equal(ids.length, 2);
  const [a, b] = project.tracks[0]!.clips as AudioClip[];
  assert.equal(a!.duration, 4); assert.equal(b!.start, 4); assert.equal(b!.offset, 4); assert.equal(b!.duration, 6);
  assert.equal(a!.start + a!.duration, b!.start);
  assert.equal(ops.splitClip(p, "c1", 0).project, p); // at edge: no-op
  assert.equal(ops.splitClip(p, "c1", 99).project, p);
});

test("duplicate lands after the original; delete removes", () => {
  const p = makeProject();
  const { project, ids } = ops.duplicateClips(p, ["c1"]);
  assert.equal(project.tracks[0]!.clips.length, 2);
  assert.equal(project.tracks[0]!.clips.find((c) => c.id === ids[0])!.start, 10);
  const d = ops.deleteClips(project, ids);
  assert.equal(d.tracks[0]!.clips.length, 1);
  assert.equal(ops.deleteClips(p, ["nope"]), p);
});

test("fades are clamped so they never exceed the clip", () => {
  const p = makeProject();
  const f = ops.setClipFades(p, "c1", 8, 8);
  const c = f.tracks[0]!.clips[0] as AudioClip;
  assert.ok(c.fadeIn + c.fadeOut <= c.duration + 1e-9);
  // trimming a faded clip keeps fades inside
  const t = ops.resizeClip(f, "c1", "right", 3);
  const tc = t.tracks[0]!.clips[0] as AudioClip;
  assert.ok(tc.fadeIn + tc.fadeOut <= tc.duration + 1e-9);
});

test("track mix params clamp", () => {
  const p = makeProject();
  const u = ops.updateTrack(p, "t1", { volume: 9, pan: -3, mute: true });
  assert.equal(u.tracks[0]!.volume, 1.5); assert.equal(u.tracks[0]!.pan, -1); assert.equal(u.tracks[0]!.mute, true);
  assert.equal(ops.updateTrack(p, "t1", { volume: 1 }), p);
});

test("bpm/key corrections are flagged", () => {
  const p = ops.setBpm(makeProject(), 64.123);
  assert.equal(p.bpm, 64.12); assert.equal(p.corrections.bpm, true);
  assert.equal(ops.setBpm(p, 1000).bpm, 300);
});

test("store: undo/redo, gestures collapse to one step, no-op edits record nothing", () => {
  const s = new ProjectStore();
  s.open(makeProject());
  s.commit((p) => ops.moveClips(p, ["c1"], 0)); // no-op
  assert.equal(s.getState().canUndo, false);
  s.commit((p) => ops.moveClips(p, ["c1"], 2));
  assert.equal(s.getState().project!.tracks[0]!.clips[0]!.start, 2);
  s.beginGesture();
  for (const d of [0.5, 1.5, 3]) s.updateGesture((b) => ops.moveClips(b, ["c1"], d));
  s.endGesture();
  assert.equal(s.getState().project!.tracks[0]!.clips[0]!.start, 5); // base 2 + 3, not accumulated
  s.undo(); // one undo reverts the whole drag
  assert.equal(s.getState().project!.tracks[0]!.clips[0]!.start, 2);
  s.undo();
  assert.equal(s.getState().project!.tracks[0]!.clips[0]!.start, 0);
  assert.equal(s.getState().canUndo, false);
  s.redo(); s.redo();
  assert.equal(s.getState().project!.tracks[0]!.clips[0]!.start, 5);
  assert.equal(s.getState().canRedo, false);
});

test("store: selection pruned when a clip disappears", () => {
  const s = new ProjectStore();
  s.open(makeProject());
  s.select(["c1", "e1"]);
  s.commit((p) => ops.deleteClips(p, ["e1"]));
  assert.deepEqual(s.getState().selection, ["c1"]);
  s.undo();
  assert.deepEqual(s.getState().selection, ["c1"]); // undo does not resurrect selection
});

test("hit testing: zones, shrinking edges on tiny clips, overlap order", () => {
  const p = makeProject();
  const rows = layoutRows(p.tracks, () => 50);
  const v = { pxPerSec: 100, scrollX: 0 };
  assert.equal(hitTestClip(rows, 500, 20, v)?.zone, "body");
  assert.equal(hitTestClip(rows, 2, 20, v)?.zone, "left");
  assert.equal(hitTestClip(rows, 998, 20, v)?.zone, "right");
  assert.equal(hitTestClip(rows, 500, 70, v), null); // empty track
  const tiny = hitTestClip(rows, 101, 120, v); // event clip 1.0s..1.1s = 100..110px
  assert.equal(tiny?.clipId, "e1");
  assert.equal(tiny?.zone, "left"); // 1px in, edge shrinks to ~3px (w/3)
  assert.equal(hitTestClip(rows, 105, 120, v)?.zone, "body");
});

test("position formatting and project end", () => {
  assert.equal(formatPosition(0.1, 120, 0.1), "1.1.1");
  assert.equal(formatPosition(0.1 + 2.0, 120, 0.1), "2.1.1"); // 4 beats later
  assert.equal(projectEnd(makeProject()), 10);
});

import { midiLayout, pitchToY, yToPitch } from "../src/lib/daw/timeline-math.ts";
test("piano-roll layout maps pitch<->y consistently and keeps a minimum span", () => {
  const p = makeProject();
  const track = { ...p.tracks[2]!, kind: "midi" as const, clips: [60, 64, 67].map((pitch, i) => ({ kind: "event" as const, id: "n" + i, trackId: "t3", name: "n", start: i, duration: 0.5, velocity: 1, pitch })) };
  const l = midiLayout(track, 100, 112);
  assert.ok(l.hi - l.lo >= 11);
  for (const pitch of [60, 64, 67]) assert.equal(yToPitch(l, pitchToY(l, pitch) + l.h / 2), pitch);
  assert.ok(pitchToY(l, 67) < pitchToY(l, 60), "higher pitch is higher on screen");
  const empty = midiLayout({ ...track, clips: [] }, 0, 100);
  assert.ok(empty.lo < empty.hi);
});
test("transpose and add-event ops", () => {
  const p = makeProject();
  const t = ops.transposeClips(p, ["e1"], 12);
  assert.equal(t, p, "unpitched event is not transposed");
  const a = ops.addEventClip(p, { trackId: "t3", start: 2, duration: 0.25, pitch: 60 });
  assert.equal(a.ids.length, 1);
  const up = ops.transposeClips(a.project, a.ids, 7);
  assert.equal((up.tracks[2]!.clips.find((c) => c.id === a.ids[0])! as { pitch: number }).pitch, 67);
  assert.equal((ops.transposeClips(up, a.ids, 999).tracks[2]!.clips.find((c) => c.id === a.ids[0])! as { pitch: number }).pitch, 127);
  assert.equal(ops.addEventClip(p, { trackId: "t1", start: 0, duration: 1 }).ids.length, 0, "events cannot go on audio tracks");
});
