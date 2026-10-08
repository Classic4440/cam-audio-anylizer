/** Deterministic synthetic music for DSP tests (Node only). */
export function rng(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export interface ChordSpec { root: number; quality: "maj" | "min" | "7" | "maj7" | "min7" | "sus" | "dim" }
const INTERVALS: Record<ChordSpec["quality"], number[]> = {
  maj: [0, 4, 7], min: [0, 3, 7], "7": [0, 4, 7, 10], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], sus: [0, 5, 7], dim: [0, 3, 6],
};

export interface SynthOpts {
  bpm: number; bars: number; sr?: number; lead?: number;
  chords?: ChordSpec[]; // one per bar (cycled)
  bassline?: boolean; drums?: "four" | "backbeat" | "none"; hats?: boolean; chordLevel?: number;
  tuningCents?: number; noise?: number; seed?: number; beatsPerBar?: number;
  barGain?: (bar: number) => number; // loudness per bar
  swing?: number;
}

export function renderSong(o: SynthOpts): { audio: Float32Array; sr: number; beatSec: number; barSec: number; bassNotes: { t: number; midi: number }[] } {
  const sr = o.sr ?? 22050;
  const bpb = o.beatsPerBar ?? 4;
  const beat = 60 / o.bpm;
  const lead = o.lead ?? 0;
  const total = Math.ceil((lead + o.bars * bpb * beat + 0.5) * sr);
  const x = new Float32Array(total);
  const r = rng(o.seed ?? 7);
  const tune = 2 ** ((o.tuningCents ?? 0) / 1200);
  const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12) * tune;
  const add = (t0: number, dur: number, fn: (t: number) => number, gain = 1) => {
    const a = Math.max(0, Math.floor(t0 * sr));
    const b = Math.min(total, Math.floor((t0 + dur) * sr));
    for (let i = a; i < b; i++) x[i]! += fn((i - a) / sr) * gain;
  };
  const bassNotes: { t: number; midi: number }[] = [];
  for (let bar = 0; bar < o.bars; bar++) {
    const bg = o.barGain?.(bar) ?? 1;
    const barT = lead + bar * bpb * beat;
    const ch = o.chords?.[bar % (o.chords?.length ?? 1)];
    if (ch) {
      for (const iv of INTERVALS[ch.quality]) {
        const midi = 60 + ((ch.root + iv) % 12) + (ch.root + iv >= 12 ? 0 : 0);
        const f = hz(midi);
        add(barT, bpb * beat, (t) => {
          let s = 0;
          for (let h = 1; h <= 5; h++) s += Math.sin(2 * Math.PI * f * h * t) / h;
          return s * Math.min(1, t * 40) * Math.exp(-t * 0.6);
        }, (o.chordLevel ?? 0.12) * bg);
      }
    }
    if (o.bassline && ch) {
      const midi = 36 + ch.root; // C2..B2
      for (let b = 0; b < bpb; b++) {
        const tt = barT + b * beat;
        bassNotes.push({ t: tt, midi });
        const f = hz(midi);
        add(tt, beat * 0.9, (t) => (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(4 * Math.PI * f * t)) * Math.min(1, t * 80) * Math.exp(-t * 2), 0.35 * bg);
      }
    }
    for (let b = 0; b < bpb; b++) {
      const tt = barT + b * beat;
      const kickHere = o.drums === "four" || (o.drums === "backbeat" && (b === 0 || (bpb === 4 && b === 2)));
      if (kickHere) add(tt, 0.2, (t) => Math.sin(2 * Math.PI * (45 * t + 75 * (1 - Math.exp(-t * 40)) / 40 * 1 + 0)) * Math.exp(-t * 18), 0.9 * bg);
      if (o.drums === "backbeat" && bpb === 4 && (b === 1 || b === 3)) {
        add(tt, 0.15, () => (r() * 2 - 1) * 0.5, 0.7 * bg);
        add(tt, 0.15, (t) => Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t * 30), 0.5 * bg);
      }
      if (o.drums === "four" && b % 2 === 1) add(tt, 0.12, (t) => (r() * 2 - 1) * Math.exp(-t * 35), 0.5 * bg);
      if (o.hats) {
        for (let h = 0; h < 2; h++) {
          const off = h === 1 ? beat / 2 + (o.swing ?? 0) * beat * 0.3 : 0;
          add(tt + off, 0.05, (t) => {
            const n = r() * 2 - 1;
            return n * Math.exp(-t * 90);
          }, 0.22 * bg);
        }
      }
    }
  }
  if (o.noise) for (let i = 0; i < total; i++) x[i]! += (r() * 2 - 1) * o.noise;
  return { audio: x, sr, beatSec: beat, barSec: beat * bpb, bassNotes };
}
