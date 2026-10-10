import test from "node:test";
import assert from "node:assert/strict";
import {
  sendToEditor,
  sendToStudio,
  subscribeEditorInbox,
  takeForEditor,
  takeForStudio,
} from "../src/lib/editor/handoff.ts";

const wav = (name: string) => new File([new Uint8Array(4)], name, { type: "audio/wav" });

test("a file waits for the editor until it is taken, and is taken only once", () => {
  assert.equal(takeForEditor(), null);
  const f = wav("mix.wav");
  sendToEditor(f);
  assert.equal(takeForEditor(), f);
  assert.equal(takeForEditor(), null);
});

test("a running editor host is woken when a file arrives, and can unsubscribe", () => {
  let wakes = 0;
  const off = subscribeEditorInbox(() => wakes++);
  sendToEditor(wav("a.wav"));
  assert.equal(wakes, 1);
  off();
  sendToEditor(wav("b.wav"));
  assert.equal(wakes, 1);
  takeForEditor();
});

test("a newer file replaces an untaken one", () => {
  sendToEditor(wav("old.wav"));
  const next = wav("new.wav");
  sendToEditor(next);
  assert.equal(takeForEditor(), next);
});

test("studio deliveries keep their intake mode and clear after being taken", () => {
  assert.equal(takeForStudio(), null);
  const f = wav("edit.wav");
  sendToStudio(f, "track");
  const got = takeForStudio();
  assert.deepEqual(got && { name: got.file.name, mode: got.mode }, { name: "edit.wav", mode: "track" });
  assert.equal(takeForStudio(), null);
});
