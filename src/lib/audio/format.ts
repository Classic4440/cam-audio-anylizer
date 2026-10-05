export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.floor((seconds % 1) * 100);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

export function formatBars(
  seconds: number,
  bpm: number,
  offset = 0,
  beatsPerBar = 4,
): string {
  const beats = Math.max(0, (seconds - offset) * (bpm / 60));
  const bar = Math.floor(beats / beatsPerBar) + 1;
  const beat = Math.floor(beats % beatsPerBar) + 1;
  const tick = Math.floor((beats * 4) % 4) + 1;
  return `${bar}.${beat}.${tick}`;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}
