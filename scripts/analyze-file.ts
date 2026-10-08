/**
 * Analyse a real audio file from the command line and print what LANES reads.
 *   node --experimental-strip-types scripts/analyze-file.ts path/to/song.mp3
 * Handy for checking accuracy on tracks whose BPM/key you already know.
 */
import { readFileSync } from "node:fs";
import { OfflineAudioContext } from "node-web-audio-api";
import { analyzePcm } from "../src/lib/audio/analysis-core.ts";

const path = process.argv[2];
if (!path) {
  console.error("usage: analyze-file.ts <audio file>");
  process.exit(1);
}
const data = readFileSync(path);
const ctx = new OfflineAudioContext(2, 1, 44100);
const buf = await ctx.decodeAudioData(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer);
const channels = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
const t0 = Date.now();
const a = analyzePcm({ channels, sampleRate: buf.sampleRate, fileName: path.split("/").pop() ?? path });
console.log(`file        ${a.fileName}  (${a.duration.toFixed(1)}s, analysed in ${((Date.now() - t0) / 1000).toFixed(1)}s)`);
console.log(`tempo       ${a.bpm} BPM   confidence ${((a.bpmConfidence ?? 0) * 100).toFixed(0)}%   alternatives ${a.bpmCandidates?.join(", ")}`);
console.log(`first beat  ${a.beatOffset.toFixed(3)}s   time signature ${a.timeSignature.join("/")}`);
console.log(`key         ${a.key}   confidence ${((a.keyConfidence ?? 0) * 100).toFixed(0)}%   alternatives ${a.keyCandidates?.slice(1).map((k) => k.key).join(", ")}`);
console.log(`tuning      ${a.tuningCents} cents`);
console.log(`lanes       kick ${a.lanes.kick.length}  snare ${a.lanes.snare.length}  hats ${a.lanes.hats.length}  bass notes ${a.lanes.bass.length}  vocal regions ${a.lanes.vocals.length}`);
console.log(`sections    ${a.sections.map((s) => `${s.name}@${s.start.toFixed(0)}s`).join("  ")}`);
console.log(`chords      ${a.chords.slice(0, 24).map((c) => c.name).join(" ")}${a.chords.length > 24 ? " …" : ""}`);
