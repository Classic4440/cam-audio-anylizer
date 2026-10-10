import test from "node:test";
import assert from "node:assert/strict";
import {
  editorHasAudio,
  exportEditorFile,
  getEditor,
  loadIntoEditor,
  pauseEditor,
  readEditorBuffer,
  type AudioBufferLike,
  type EditorWindow,
} from "../src/lib/editor/bridge.ts";

function buf(frames: number, channels = 2, rate = 44100): AudioBufferLike {
  const data = Array.from({ length: channels }, (_, c) =>
    Float32Array.from({ length: frames }, (_, i) => (c === 0 ? 0.5 : -0.25) * (i % 2 ? 1 : -1)),
  );
  return { numberOfChannels: channels, sampleRate: rate, getChannelData: (c) => data[c]! };
}

function fakeWin(editor: unknown): EditorWindow {
  return { PKAudioEditor: editor } as unknown as EditorWindow;
}

const file = () => new File([new Uint8Array(8)], "x.wav", { type: "audio/wav" });

test("getEditor needs a booted engine and tolerates missing windows", () => {
  assert.equal(getEditor(null), null);
  assert.equal(getEditor(fakeWin(undefined)), null);
  assert.equal(getEditor(fakeWin({})), null);
  assert.notEqual(getEditor(fakeWin({ engine: {} })), null);
});

test("loadIntoEditor uses engine.LoadFile in single-track mode", () => {
  const seen: File[] = [];
  const win = fakeWin({ engine: { LoadFile: (i: { files: File[] }) => seen.push(...i.files) } });
  assert.equal(loadIntoEditor(win, file()), true);
  assert.equal(seen.length, 1);
});

test("loadIntoEditor puts the file on an empty track in multitrack mode", () => {
  const seen: File[] = [];
  const win = fakeWin({
    engine: { LoadFile: () => assert.fail("must not use single-track load") },
    multitrack: { IsOn: () => true, AddFilesAuto: (f: File[]) => (seen.push(...f), true) },
  });
  assert.equal(loadIntoEditor(win, file()), true);
  assert.equal(seen.length, 1);
});

test("loadIntoEditor reports failure instead of throwing", () => {
  assert.equal(loadIntoEditor(null, file()), false);
  assert.equal(loadIntoEditor(fakeWin({ engine: {} }), file()), false);
  const boom = fakeWin({ engine: { LoadFile: () => { throw new Error("nope"); } } });
  assert.equal(loadIntoEditor(boom, file()), false);
});

test("editorHasAudio follows the engine buffer or the multitrack clips", () => {
  const empty = fakeWin({ engine: { is_ready: false, wavesurfer: { backend: {} } } });
  assert.equal(editorHasAudio(empty), false);
  const loaded = fakeWin({ engine: { is_ready: true, wavesurfer: { backend: { buffer: buf(10) } } } });
  assert.equal(editorHasAudio(loaded), true);
  const mtEmpty = fakeWin({ engine: {}, multitrack: { IsOn: () => true, HasClips: () => false } });
  assert.equal(editorHasAudio(mtEmpty), false);
  const mtFull = fakeWin({ engine: {}, multitrack: { IsOn: () => true, HasClips: () => true } });
  assert.equal(editorHasAudio(mtFull), true);
});

test("readEditorBuffer prefers the multitrack mixdown when multitrack is on", async () => {
  const mix = buf(100);
  const win = fakeWin({
    engine: { is_ready: true, wavesurfer: { backend: { buffer: buf(5) } } },
    multitrack: { IsOn: () => true, MixdownAsync: (_s: unknown, done: (b: AudioBufferLike) => void) => setTimeout(() => done(mix), 1) },
  });
  assert.equal(await readEditorBuffer(win), mix);
});

test("readEditorBuffer returns the single-track buffer, and null when not ready", async () => {
  const b = buf(50);
  assert.equal(await readEditorBuffer(fakeWin({ engine: { is_ready: true, wavesurfer: { backend: { buffer: b } } } })), b);
  assert.equal(await readEditorBuffer(fakeWin({ engine: { is_ready: false, wavesurfer: { backend: { buffer: b } } } })), null);
  assert.equal(await readEditorBuffer(null), null);
});

test("exportEditorFile produces a valid 24-bit stereo WAV with the buffer's samples", async () => {
  const b = buf(64, 2, 48000);
  const f = await exportEditorFile(fakeWin({ engine: { is_ready: true, wavesurfer: { backend: { buffer: b } } } }), "My edit");
  assert.ok(f);
  assert.equal(f.name, "My edit.wav");
  assert.equal(f.type, "audio/wav");
  const dv = new DataView(await f.arrayBuffer());
  const tag = (o: number) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  assert.equal(tag(0), "RIFF");
  assert.equal(tag(8), "WAVE");
  assert.equal(dv.getUint16(22, true), 2); // channels
  assert.equal(dv.getUint32(24, true), 48000); // sample rate
  assert.equal(dv.getUint16(34, true), 24); // bit depth
  assert.equal(dv.getUint32(40, true), 64 * 2 * 3); // data bytes
  // first frame: L = -0.5, R = +0.25 (i = 0 is "even" so sign is negative for ch0 and positive for ch1)
  const s24 = (o: number) => { const v = dv.getUint8(o) | (dv.getUint8(o + 1) << 8) | (dv.getUint8(o + 2) << 16); return (v << 8) >> 8; };
  assert.ok(Math.abs(s24(44) / 0x800000 - -0.5) < 1e-3);
  assert.ok(Math.abs(s24(47) / 0x800000 - 0.25) < 1e-3);
});

test("exportEditorFile returns null for nothing or an empty buffer", async () => {
  assert.equal(await exportEditorFile(null), null);
  const empty = fakeWin({ engine: { is_ready: true, wavesurfer: { backend: { buffer: buf(0) } } } });
  assert.equal(await exportEditorFile(empty), null);
});

test("pauseEditor pauses via the multitrack when it is on, else via the RequestPause event", () => {
  const calls: string[] = [];
  pauseEditor(fakeWin({ engine: {}, multitrack: { IsOn: () => true, Pause: () => calls.push("mt") } }));
  pauseEditor(fakeWin({ engine: {}, fireEvent: (n: string) => calls.push(n) }));
  pauseEditor(null);
  assert.deepEqual(calls, ["mt", "RequestPause"]);
});
