import type { StemSet } from "./separate.ts";

export interface SeparationResult {
  stems: StemSet;
  sampleRate: number;
}

type Msg =
  | { id: number; type: "progress"; pct: number }
  | { id: number; type: "done"; stems: StemSet }
  | { id: number; type: "error"; message: string };

let nextId = 1;

/** Run stem separation in a worker (main-thread fallback if workers are unavailable). */
export async function separateAudioBuffer(
  buffer: AudioBuffer,
  onProgress?: (pct: number) => void,
): Promise<SeparationResult> {
  const channels: Float32Array[] = [];
  for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) channels.push(buffer.getChannelData(c).slice());
  const sampleRate = buffer.sampleRate;
  if (typeof Worker !== "undefined") {
    try {
      const stems = await new Promise<StemSet>((resolve, reject) => {
        const worker = new Worker(new URL("./separate.worker.ts", import.meta.url), { type: "module" });
        const id = nextId++;
        worker.onerror = (e) => {
          worker.terminate();
          reject(new Error(e.message || "separation worker crashed"));
        };
        worker.onmessage = (ev: MessageEvent<Msg>) => {
          const m = ev.data;
          if (m.id !== id) return;
          if (m.type === "progress") onProgress?.(m.pct);
          else if (m.type === "done") {
            worker.terminate();
            resolve(m.stems);
          } else {
            worker.terminate();
            reject(new Error(m.message));
          }
        };
        worker.postMessage({ id, channels, sampleRate }, channels.map((c) => c.buffer));
      });
      return { stems, sampleRate };
    } catch (err) {
      console.warn("Separation worker failed, using the main thread:", err);
    }
  }
  const { separateStems } = await import("./separate.ts");
  await new Promise((r) => setTimeout(r, 0));
  const fresh = [];
  for (let c = 0; c < Math.min(2, buffer.numberOfChannels); c++) fresh.push(buffer.getChannelData(c));
  return { stems: separateStems(fresh, sampleRate, onProgress), sampleRate };
}
