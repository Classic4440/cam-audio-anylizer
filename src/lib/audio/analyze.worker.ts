import { analyzePcm, type PcmInput } from "./analysis-core.ts";

/** Runs the whole analysis off the main thread so the UI stays responsive. */
interface Scope {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent<{ id: number; input: PcmInput }>) => void) | null;
}
const scope = self as unknown as Scope;

scope.onmessage = (e) => {
  const { id, input } = e.data;
  let last = 0;
  try {
    const result = analyzePcm(input, (pct, label) => {
      const now = Date.now();
      if (pct >= 100 || now - last > 80) {
        last = now;
        scope.postMessage({ id, type: "progress", pct, label });
      }
    });
    scope.postMessage({ id, type: "done", result });
  } catch (err) {
    scope.postMessage({ id, type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
