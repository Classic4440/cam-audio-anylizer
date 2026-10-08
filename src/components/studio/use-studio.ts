import { useEffect, useState, useSyncExternalStore } from "react";
import type { Controller } from "@/lib/daw/controller";

export function useControllerState(c: Controller) {
  return useSyncExternalStore(c.subscribe, c.getState, c.getState);
}

export function useProjectState(c: Controller) {
  return useSyncExternalStore(c.store.subscribe, c.store.getState, c.store.getState);
}

/** Playhead time + playing flag, sampled each animation frame (re-renders only when they change visibly). */
export function usePlayhead(c: Controller): { time: number; playing: boolean } {
  const [s, setS] = useState({ time: 0, playing: false });
  useEffect(() => {
    let raf = 0;
    let lastT = -1;
    let lastP = false;
    const tick = () => {
      const e = c.engine;
      e.pollEnded();
      const t = e.currentTime();
      const p = e.playing;
      if (p !== lastP || Math.abs(t - lastT) > 0.03) {
        lastT = t;
        lastP = p;
        setS({ time: t, playing: p });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [c]);
  return s;
}

export function formatSaved(at: number | null, dirty: boolean): string {
  if (dirty) return "Saving…";
  if (!at) return "Not saved yet";
  return `Saved ${new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}
