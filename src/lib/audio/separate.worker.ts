import { separateStems } from "./separate.ts";

interface Scope {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent<{ id: number; channels: Float32Array[]; sampleRate: number }>) => void) | null;
}
const scope = self as unknown as Scope;

scope.onmessage = (e) => {
  const { id, channels, sampleRate } = e.data;
  let last = 0;
  try {
    const stems = separateStems(channels, sampleRate, (pct) => {
      const now = Date.now();
      if (pct >= 100 || now - last > 100) {
        last = now;
        scope.postMessage({ id, type: "progress", pct });
      }
    });
    scope.postMessage({ id, type: "done", stems });
  } catch (err) {
    scope.postMessage({ id, type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
