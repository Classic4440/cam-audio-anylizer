import type {
  AnalysisResult,
  ChordEvent,
  Clip,
  LaneId,
  LoadedProject,
  SectionMarker,
  StemBuffers,
} from "./types";

export const DEMO_BPM = 120;
export const DEMO_BARS = 16;
export const DEMO_SR = 44100;
export const DEMO_NAME = "Studio Demo — House";

const BEAT = 60 / DEMO_BPM;
const BAR = BEAT * 4;
const DURATION = DEMO_BARS * BAR;

type Quality = ChordEvent["quality"];

interface ChordSpec {
  bar: number;
  name: string;
  root: number;
  quality: Quality;
  freqs: number[];
}

const CHORD_MAP: ChordSpec[] = [
  { bar: 0, name: "Am", root: 9, quality: "min", freqs: [220.0, 261.63, 329.63] },
  { bar: 1, name: "Am", root: 9, quality: "min", freqs: [220.0, 261.63, 329.63] },
  { bar: 2, name: "Am", root: 9, quality: "min", freqs: [220.0, 261.63, 329.63] },
  { bar: 3, name: "Am", root: 9, quality: "min", freqs: [220.0, 261.63, 329.63] },
  { bar: 4, name: "Am", root: 9, quality: "min", freqs: [220.0, 261.63, 329.63] },
  { bar: 5, name: "F", root: 5, quality: "maj", freqs: [174.61, 220.0, 261.63] },
  { bar: 6, name: "C", root: 0, quality: "maj", freqs: [130.81, 164.81, 196.0] },
  { bar: 7, name: "G", root: 7, quality: "maj", freqs: [196.0, 246.94, 293.66] },
  { bar: 8, name: "Am", root: 9, quality: "min", freqs: [220.0, 261.63, 329.63] },
  { bar: 9, name: "F", root: 5, quality: "maj", freqs: [174.61, 220.0, 261.63] },
  { bar: 10, name: "C", root: 0, quality: "maj", freqs: [130.81, 164.81, 196.0] },
  { bar: 11, name: "G", root: 7, quality: "maj", freqs: [196.0, 246.94, 293.66] },
  { bar: 12, name: "C", root: 0, quality: "maj", freqs: [130.81, 164.81, 196.0] },
  { bar: 13, name: "G", root: 7, quality: "maj", freqs: [196.0, 246.94, 293.66] },
  { bar: 14, name: "Am", root: 9, quality: "min", freqs: [220.0, 261.63, 329.63] },
  { bar: 15, name: "F", root: 5, quality: "maj", freqs: [174.61, 220.0, 261.63] },
];

const BASS_ROOT: Record<string, number> = {
  Am: 55.0,
  F: 43.65,
  C: 65.41,
  G: 49.0,
};

function panGains(pan: number): [number, number] {
  const a = ((pan + 1) * Math.PI) / 4;
  return [Math.cos(a), Math.sin(a)];
}

function addMono(
  l: Float32Array,
  r: Float32Array,
  i0: number,
  s: number,
  pan: number,
): void {
  if (i0 < 0 || i0 >= l.length) return;
  const [gl, gr] = panGains(pan);
  l[i0] = (l[i0] ?? 0) + s * gl;
  r[i0] = (r[i0] ?? 0) + s * gr;
}

function writeKick(l: Float32Array, r: Float32Array, sr: number, t0: number, vel: number): void {
  const n = Math.floor(0.42 * sr);
  const i0 = Math.floor(t0 * sr);
  let phase = 0;
  for (let i = 0; i < n && i0 + i < l.length; i++) {
    const t = i / sr;
    const freq = 46 + 130 * Math.exp(-t * 20);
    const amp = Math.exp(-t * 6.5) * vel;
    const click = Math.exp(-t * 90) * Math.sin(2 * Math.PI * 1800 * t) * 0.22 * vel;
    const s = Math.sin(phase) * amp * 0.95 + click;
    phase += (2 * Math.PI * freq) / sr;
    addMono(l, r, i0 + i, s, 0);
  }
}

function writeSnare(l: Float32Array, r: Float32Array, sr: number, t0: number, vel: number): void {
  const n = Math.floor(0.28 * sr);
  const i0 = Math.floor(t0 * sr);
  let seed = (Math.floor(t0 * 1000) * 1103515245 + 12345) >>> 0;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff * 2 - 1;
  };
  let phase = 0;
  for (let i = 0; i < n && i0 + i < l.length; i++) {
    const t = i / sr;
    const noise = rand() * Math.exp(-t * 16);
    const body = Math.sin(phase) * Math.exp(-t * 10);
    phase += (2 * Math.PI * 190) / sr;
    const s = (noise * 0.55 + body * 0.4) * vel * 0.7;
    addMono(l, r, i0 + i, s, 0.04);
  }
}

function writeHat(
  l: Float32Array,
  r: Float32Array,
  sr: number,
  t0: number,
  vel: number,
  open: boolean,
): void {
  const n = Math.floor((open ? 0.22 : 0.055) * sr);
  const i0 = Math.floor(t0 * sr);
  let seed = (Math.floor(t0 * 10000) * 214013 + 2531011) >>> 0;
  let hp = 0;
  const decay = open ? 9 : 38;
  for (let i = 0; i < n && i0 + i < l.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const white = seed / 0xffffffff * 2 - 1;
    hp = hp * 0.35 + white * 0.65;
    const air = white - hp;
    const t = i / sr;
    const s = air * Math.exp(-t * decay) * vel * (open ? 0.28 : 0.2);
    addMono(l, r, i0 + i, s, 0.28);
  }
}

function writeBass(
  l: Float32Array,
  r: Float32Array,
  sr: number,
  t0: number,
  dur: number,
  freq: number,
  vel: number,
): void {
  const n = Math.floor(dur * sr);
  const i0 = Math.floor(t0 * sr);
  let phase1 = 0;
  let phase2 = 0;
  for (let i = 0; i < n && i0 + i < l.length; i++) {
    const t = i / sr;
    const env =
      Math.min(1, t / 0.01) * Math.exp(-t * 3.2) * (1 - Math.max(0, (t - (dur - 0.04)) / 0.04));
    const s1 = Math.sin(phase1);
    const s2 = Math.sin(phase2);
    // soft square via tanh of sine
    const s = (Math.tanh(s1 * 1.8) * 0.7 + s2 * 0.3) * env * vel * 0.48;
    phase1 += (2 * Math.PI * freq) / sr;
    phase2 += (2 * Math.PI * freq * 2.005) / sr;
    addMono(l, r, i0 + i, s, -0.02);
  }
}

function writeChord(
  l: Float32Array,
  r: Float32Array,
  sr: number,
  t0: number,
  dur: number,
  freqs: number[],
  vel: number,
): void {
  const n = Math.floor(dur * sr);
  const i0 = Math.floor(t0 * sr);
  const phases = freqs.map(() => 0);
  for (let i = 0; i < n && i0 + i < l.length; i++) {
    const t = i / sr;
    const attack = Math.min(1, t / 0.08);
    const release = t > dur - 0.12 ? Math.max(0, (dur - t) / 0.12) : 1;
    const env = attack * release * vel;
    let s = 0;
    for (let k = 0; k < freqs.length; k++) {
      const f = freqs[k]!;
      s += Math.sin(phases[k]!) / freqs.length;
      s += Math.sin(phases[k]! * 2) * 0.12 / freqs.length;
      phases[k] = (phases[k] ?? 0) + (2 * Math.PI * f * (1 + k * 0.0015)) / sr;
    }
    addMono(l, r, i0 + i, s * env * 0.32, -0.18);
  }
}

function writeLead(
  l: Float32Array,
  r: Float32Array,
  sr: number,
  t0: number,
  dur: number,
  freq: number,
  vel: number,
): void {
  const n = Math.floor(dur * sr);
  const i0 = Math.floor(t0 * sr);
  let phase = 0;
  for (let i = 0; i < n && i0 + i < l.length; i++) {
    const t = i / sr;
    const attack = Math.min(1, t / 0.012);
    const release = t > dur - 0.05 ? Math.max(0, (dur - t) / 0.05) : 1;
    const vib = 1 + 0.006 * Math.sin(2 * Math.PI * 5.2 * t);
    const env = attack * release * vel;
    const tri = 1 - 4 * Math.abs(Math.round(phase / (2 * Math.PI)) - phase / (2 * Math.PI) - 0.25);
    const s = (Math.sin(phase) * 0.55 + tri * 0.45) * env * 0.22;
    phase += (2 * Math.PI * freq * vib) / sr;
    addMono(l, r, i0 + i, s, 0.16);
  }
}

function toBuffer(ctx: AudioContext, l: Float32Array, r: Float32Array): AudioBuffer {
  const b = ctx.createBuffer(2, l.length, DEMO_SR);
  b.getChannelData(0).set(l);
  b.getChannelData(1).set(r);
  return b;
}

function mixInto(dstL: Float32Array, dstR: Float32Array, srcL: Float32Array, srcR: Float32Array): void {
  for (let i = 0; i < dstL.length; i++) {
    dstL[i] = (dstL[i] ?? 0) + (srcL[i] ?? 0);
    dstR[i] = (dstR[i] ?? 0) + (srcR[i] ?? 0);
  }
}

function softClip(l: Float32Array, r: Float32Array): void {
  for (let i = 0; i < l.length; i++) {
    l[i] = Math.tanh((l[i] ?? 0) * 0.95);
    r[i] = Math.tanh((r[i] ?? 0) * 0.95);
  }
}

function peaksFrom(l: Float32Array, r: Float32Array, bins = 2400): { min: Float32Array; max: Float32Array } {
  const n = bins;
  const min = new Float32Array(n);
  const max = new Float32Array(n);
  const step = l.length / n;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * step);
    const b = Math.min(l.length, Math.floor((i + 1) * step));
    let lo = 0;
    let hi = 0;
    for (let j = a; j < b; j++) {
      const v = ((l[j] ?? 0) + (r[j] ?? 0)) * 0.5;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    min[i] = lo;
    max[i] = hi;
  }
  return { min, max };
}

function envFrom(l: Float32Array, r: Float32Array, rate: number): Float32Array {
  const n = Math.ceil(DURATION * rate);
  const out = new Float32Array(n);
  const win = Math.max(1, Math.floor(DEMO_SR / rate));
  let peak = 1e-9;
  for (let i = 0; i < n; i++) {
    const a = i * win;
    let s = 0;
    for (let j = 0; j < win && a + j < l.length; j++) {
      const v = ((l[a + j] ?? 0) + (r[a + j] ?? 0)) * 0.5;
      s += v * v;
    }
    const rms = Math.sqrt(s / win);
    out[i] = rms;
    if (rms > peak) peak = rms;
  }
  for (let i = 0; i < n; i++) out[i] = (out[i] ?? 0) / peak;
  return out;
}

export async function renderDemoProject(ctx: AudioContext): Promise<LoadedProject> {
  const n = Math.floor(DURATION * DEMO_SR);
  const mk = () => [new Float32Array(n), new Float32Array(n)] as const;
  const [kickL, kickR] = mk();
  const [snareL, snareR] = mk();
  const [hatL, hatR] = mk();
  const [bassL, bassR] = mk();
  const [chordL, chordR] = mk();
  const [voxL, voxR] = mk();

  const kicks: Clip[] = [];
  const snares: Clip[] = [];
  const hats: Clip[] = [];
  const bassClips: Clip[] = [];
  const voxClips: Clip[] = [];

  for (let bar = 0; bar < DEMO_BARS; bar++) {
    const tBar = bar * BAR;
    const inIntro = bar < 4;
    const inGroove = bar >= 4 && bar < 12;
    const inBreak = bar >= 12;
    const sixteenths = inGroove && bar >= 8;

    if (!inBreak) {
      for (let b = 0; b < 4; b++) {
        const t = tBar + b * BEAT;
        const vel = inIntro ? 0.72 : b === 0 ? 1 : 0.9;
        writeKick(kickL, kickR, DEMO_SR, t, vel);
        kicks.push({ start: t, duration: 0.14, velocity: vel });
      }
      if (inGroove && bar >= 8) {
        const pickup = tBar + 4 * BEAT - 0.125;
        writeKick(kickL, kickR, DEMO_SR, pickup, 0.55);
        kicks.push({ start: pickup, duration: 0.1, velocity: 0.55 });
      }
    }

    if (inGroove || inBreak) {
      for (const beat of inBreak ? [3] : [1, 3]) {
        const t = tBar + beat * BEAT;
        const vel = inBreak ? 0.55 : 0.92;
        writeSnare(snareL, snareR, DEMO_SR, t, vel);
        snares.push({ start: t, duration: 0.16, velocity: vel });
      }
    }

    const hatStep = sixteenths ? BEAT / 4 : BEAT / 2;
    const hatCount = sixteenths ? 16 : 8;
    for (let h = 0; h < hatCount; h++) {
      const t = tBar + h * hatStep;
      const open = !sixteenths && h % 2 === 1 && (inGroove || inBreak);
      const vel = h % 2 === 0 ? 0.7 : 0.42;
      writeHat(hatL, hatR, DEMO_SR, t, inIntro ? vel * 0.7 : vel, open);
      hats.push({ start: t, duration: open ? 0.18 : 0.05, velocity: vel, label: open ? "OH" : undefined });
    }

    const spec = CHORD_MAP[bar]!;
    writeChord(chordL, chordR, DEMO_SR, tBar, BAR * 0.98, spec.freqs, inIntro ? 0.45 : inBreak ? 0.95 : 0.75);

    if (!inIntro) {
      const root = BASS_ROOT[spec.name] ?? 55;
      const pattern: { at: number; mul: number; dur: number }[] = inBreak
        ? [
            { at: 0, mul: 1, dur: BEAT * 1.5 },
            { at: 2, mul: 1.5, dur: BEAT },
          ]
        : [
            { at: 0, mul: 1, dur: BEAT * 0.7 },
            { at: 0.75, mul: 1, dur: BEAT * 0.35 },
            { at: 1.5, mul: 1.5, dur: BEAT * 0.4 },
            { at: 2, mul: 1, dur: BEAT * 0.7 },
            { at: 3.0, mul: 2, dur: BEAT * 0.4 },
            { at: 3.5, mul: 1.5, dur: BEAT * 0.4 },
          ];
      for (const p of pattern) {
        const t = tBar + p.at * BEAT;
        writeBass(bassL, bassR, DEMO_SR, t, p.dur, root * p.mul, 0.9);
        bassClips.push({ start: t, duration: p.dur, velocity: 0.9, label: spec.name[0] });
      }
    }

    if (inGroove || inBreak) {
      const melody: [number, number][] =
        spec.name === "Am"
          ? [
              [0, 440],
              [1, 523.25],
              [2, 659.25],
              [3, 523.25],
            ]
          : spec.name === "F"
            ? [
                [0, 349.23],
                [1, 440],
                [2.5, 523.25],
                [3, 440],
              ]
            : spec.name === "C"
              ? [
                  [0.5, 523.25],
                  [1.5, 659.25],
                  [2.5, 783.99],
                  [3.5, 659.25],
                ]
              : [
                  [0, 392],
                  [1, 493.88],
                  [2, 587.33],
                  [3.5, 493.88],
                ];
      for (const [beat, freq] of melody) {
        const t = tBar + beat * BEAT;
        const dur = BEAT * 0.7;
        writeLead(voxL, voxR, DEMO_SR, t, dur, freq, inBreak ? 1 : 0.85);
        voxClips.push({ start: t, duration: dur, velocity: 0.85 });
      }
    }
  }

  const [mixL, mixR] = mk();
  mixInto(mixL, mixR, kickL, kickR);
  mixInto(mixL, mixR, snareL, snareR);
  mixInto(mixL, mixR, hatL, hatR);
  mixInto(mixL, mixR, bassL, bassR);
  mixInto(mixL, mixR, chordL, chordR);
  mixInto(mixL, mixR, voxL, voxR);
  softClip(mixL, mixR);

  const mix = toBuffer(ctx, mixL, mixR);
  const stems: StemBuffers = {
    kick: toBuffer(ctx, kickL, kickR),
    snare: toBuffer(ctx, snareL, snareR),
    hats: toBuffer(ctx, hatL, hatR),
    bass: toBuffer(ctx, bassL, bassR),
    vocals: toBuffer(ctx, voxL, voxR),
    chords: toBuffer(ctx, chordL, chordR),
  };

  const beats: number[] = [];
  const downbeats: number[] = [];
  for (let i = 0; i < DEMO_BARS * 4; i++) {
    const t = i * BEAT;
    beats.push(t);
    if (i % 4 === 0) downbeats.push(t);
  }

  const chords: ChordEvent[] = CHORD_MAP.map((c) => ({
    start: c.bar * BAR,
    duration: BAR,
    name: c.name,
    root: c.root,
    quality: c.quality,
  }));

  const chordClips: Clip[] = chords.map((c) => ({
    start: c.start,
    duration: c.duration,
    velocity: 0.88,
    label: c.name,
    pitch: 60 + c.root,
  }));

  const sections: SectionMarker[] = [
    { start: 0, duration: 4 * BAR, name: "Intro" },
    { start: 4 * BAR, duration: 4 * BAR, name: "Groove" },
    { start: 8 * BAR, duration: 4 * BAR, name: "Drop" },
    { start: 12 * BAR, duration: 4 * BAR, name: "Break" },
  ];

  const envRate = 40;
  const lanes: Record<LaneId, Clip[]> = {
    kick: kicks,
    snare: snares,
    hats,
    bass: bassClips,
    vocals: voxClips,
    chords: chordClips,
  };

  const analysis: AnalysisResult = {
    duration: DURATION,
    sampleRate: DEMO_SR,
    bpm: DEMO_BPM,
    beatOffset: 0,
    timeSignature: [4, 4],
    key: "A minor",
    keyMode: "minor",
    waveform: peaksFrom(mixL, mixR),
    beats,
    downbeats,
    lanes,
    envelopes: {
      master: envFrom(mixL, mixR, envRate),
      kick: envFrom(kickL, kickR, envRate),
      snare: envFrom(snareL, snareR, envRate),
      hats: envFrom(hatL, hatR, envRate),
      bass: envFrom(bassL, bassR, envRate),
      vocals: envFrom(voxL, voxR, envRate),
      chords: envFrom(chordL, chordR, envRate),
    },
    envelopeRate: envRate,
    chords,
    sections,
    energy: envFrom(mixL, mixR, envRate),
    source: "demo",
    fileName: DEMO_NAME,
  };

  return { mix, stems, analysis };
}
