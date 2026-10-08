import { analyzePcm, type AnalyzeProgress, type PcmInput } from "./analysis-core.ts";
import type { AnalysisResult } from "./types.ts";

export type { AnalyzeProgress };
export { ANALYSIS_VERSION } from "./analysis-core.ts";

type WorkerMsg =
  | { id: number; type: "progress"; pct: number; label: string }
  | { id: number; type: "done"; result: AnalysisResult }
  | { id: number; type: "error"; message: string };

let nextId = 1;

function runInWorker(input: PcmInput, onProgress?: AnalyzeProgress): Promise<AnalysisResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./analyze.worker.ts", import.meta.url), { type: "module" });
    const id = nextId++;
    const fail = (e: unknown) => {
      worker.terminate();
      reject(e instanceof Error ? e : new Error(String(e)));
    };
    worker.onerror = (ev) => fail(new Error(ev.message || "analysis worker crashed"));
    worker.onmessage = (ev: MessageEvent<WorkerMsg>) => {
      const m = ev.data;
      if (m.id !== id) return;
      if (m.type === "progress") onProgress?.(m.pct, m.label);
      else if (m.type === "done") {
        worker.terminate();
        resolve(m.result);
      } else fail(new Error(m.message));
    };
    // Transfer the copied channel data instead of cloning it a second time.
    worker.postMessage({ id, input }, input.channels.map((c) => c.buffer));
  });
}

/**
 * Analyse decoded audio. Runs in a Web Worker; falls back to the main thread only
 * if workers are unavailable, so analysis never silently fails.
 */
export async function analyzeAudioBuffer(
  buffer: AudioBuffer,
  fileName: string,
  onProgress?: AnalyzeProgress,
): Promise<AnalysisResult> {
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) channels.push(buffer.getChannelData(c).slice());
  const input: PcmInput = { channels, sampleRate: buffer.sampleRate, fileName };
  if (typeof Worker !== "undefined") {
    try {
      return await runInWorker(input, onProgress);
    } catch (err) {
      console.warn("Analysis worker failed, falling back to the main thread:", err);
      input.channels = [];
      for (let c = 0; c < buffer.numberOfChannels; c++) input.channels.push(buffer.getChannelData(c));
    }
  }
  await new Promise((r) => setTimeout(r, 0));
  return analyzePcm(input, onProgress);
}

export function emptyEnvelopes(n: number): AnalysisResult["envelopes"] {
  const z = new Float32Array(n);
  return { master: z, kick: z, snare: z, hats: z, bass: z, vocals: z, chords: z };
}
