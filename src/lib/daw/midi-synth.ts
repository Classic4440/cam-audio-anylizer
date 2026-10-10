import type { PatchId } from "../audio/dsp/tone.ts";
import type { Project, Track } from "./types.ts";

/**
 * Built-in synth so MIDI tracks are audible without downloads.
 *
 *  - Drum tracks play one-shots cut from the analysed track when the track has a `kit`
 *    (see `extractKit`); any piece without a sample falls back to a synthesised hit.
 *    Pitch 36 -> kick, 37-40 -> snare, others -> hat.
 *  - `keys` tracks use one of six instruments (`track.patch`), filtered by `track.brightness`.
 *  - `bass` tracks use a saw + sub oscillator with a filter envelope.
 */

type TrackGains = ReadonlyMap<string, { gain: GainNode }>;
type Buffers = ReadonlyMap<string, AudioBuffer>;
type Src = AudioScheduledSourceNode;

export const DEFAULT_PATCH: PatchId = "piano";
export const DEFAULT_BRIGHTNESS = 0.6;

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.4);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < len; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    d[i] = (s / 4294967296) * 2 - 1;
  }
  return buf;
}

export function drumPiece(pitch: number): "kick" | "snare" | "hats" {
  return pitch <= 36 ? "kick" : pitch <= 40 ? "snare" : "hats";
}

export function scheduleMidiTracks(
  ctx: BaseAudioContext,
  gains: TrackGains,
  project: Project,
  from: number,
  startAt: number,
  only?: ReadonlySet<string>,
  buffers?: Buffers,
): AudioScheduledSourceNode[] {
  const out: Src[] = [];
  let noise: AudioBuffer | null = null;
  for (const track of project.tracks) {
    if (track.kind !== "midi") continue;
    if (only && !only.has(track.id)) continue;
    const dest = gains.get(track.id)?.gain;
    if (!dest) continue;
    for (const c of track.clips) {
      if (c.kind !== "event" || c.pitch === undefined) continue;
      const end = c.start + c.duration;
      if (end <= from) continue;
      const t0 = startAt + Math.max(0, c.start - from);
      const dur = Math.max(0.03, end - Math.max(c.start, from));
      const vel = Math.max(0.05, Math.min(1, c.velocity));
      if (track.synth === "drums") {
        noise ??= noiseBuffer(ctx);
        out.push(...drumHit(ctx, dest, track, c.pitch, t0, vel, noise, buffers));
      } else {
        out.push(...pitched(ctx, dest, track, c.pitch, t0, dur, vel));
      }
    }
  }
  return out;
}

/* ------------------------------- pitched ------------------------------- */

const hz = (pitch: number) => 440 * 2 ** ((pitch - 69) / 12);
/** Filter cutoff for a 0..1 brightness setting (about 400 Hz .. 12.8 kHz). */
export const cutoffFor = (brightness: number) => 400 * 2 ** (Math.max(0, Math.min(1, brightness)) * 5);

function pitched(
  ctx: BaseAudioContext,
  dest: AudioNode,
  track: Pick<Track, "synth" | "patch" | "brightness">,
  pitch: number,
  t0: number,
  dur: number,
  vel: number,
): Src[] {
  if (track.synth === "bass") return bassVoice(ctx, dest, hz(pitch), t0, dur, vel);
  return keysVoice(ctx, dest, track.patch ?? DEFAULT_PATCH, track.brightness ?? DEFAULT_BRIGHTNESS, hz(pitch), t0, dur, vel);
}

function bassVoice(ctx: BaseAudioContext, dest: AudioNode, f: number, t0: number, dur: number, vel: number): Src[] {
  const saw = ctx.createOscillator();
  saw.type = "sawtooth";
  saw.frequency.setValueAtTime(f, t0);
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.setValueAtTime(f / 2 >= 25 ? f / 2 : f, t0);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.setValueAtTime(1.2, t0);
  lp.frequency.setValueAtTime(1400, t0);
  lp.frequency.exponentialRampToValueAtTime(380, t0 + 0.18);
  const g = ctx.createGain();
  const peak = 0.5 * vel;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.006);
  g.gain.setValueAtTime(peak, t0 + Math.max(0.01, dur - 0.06));
  g.gain.linearRampToValueAtTime(0, t0 + dur + 0.01);
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.9, t0);
  saw.connect(lp);
  sub.connect(sg);
  sg.connect(lp);
  lp.connect(g);
  g.connect(dest);
  for (const o of [saw, sub]) {
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
  return [saw, sub];
}

function keysVoice(
  ctx: BaseAudioContext,
  dest: AudioNode,
  patch: PatchId,
  brightness: number,
  f: number,
  t0: number,
  dur: number,
  vel: number,
): Src[] {
  const nodes: Src[] = [];
  const nyq = ctx.sampleRate / 2 - 500;
  const cutoff = Math.min(nyq, cutoffFor(brightness));
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(cutoff, t0);
  const master = ctx.createGain();
  lp.connect(master);
  master.connect(dest);
  const noteOff = t0 + Math.max(0.02, dur);
  const stopAt = (rel: number) => noteOff + rel + 0.05;

  /** Oscillator that is started immediately (stop() before start() throws in Web Audio). */
  const osc = (type: OscillatorType, freq: number, stop: number, detune = 0) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    o.detune.setValueAtTime(detune, t0);
    o.start(t0);
    o.stop(stop);
    nodes.push(o);
    return o;
  };
  /** Gain envelope: attack, optional exponential decay to a sustain fraction, then release at note-off. */
  const env = (peak: number, attack: number, decayTau: number, sustain: number, release: number) => {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + attack);
    if (decayTau > 0) g.gain.setTargetAtTime(peak * sustain, t0 + attack, decayTau);
    g.gain.setTargetAtTime(0.0001, Math.max(noteOff, t0 + attack + 0.01), release / 4);
    return g;
  };

  switch (patch) {
    case "piano": {
      // Additive: higher partials die faster, partials slightly stretched like real strings.
      const decay = Math.max(0.5, 2.6 - Math.log2(f / 110) * 0.45);
      const release = 0.18;
      for (let k = 1; k <= 7; k++) {
        const pf = f * k * Math.sqrt(1 + 0.0004 * k * k);
        if (pf > nyq) break;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime((0.34 / k ** 1.15) * vel, t0 + 0.004);
        g.gain.setTargetAtTime(0.0001, t0 + 0.004, decay / (1 + (k - 1) * 0.7) / 3);
        g.gain.setTargetAtTime(0.0001, noteOff, release / 4);
        osc("sine", pf, stopAt(release)).connect(g);
        g.connect(lp);
      }
      // Hammer thump.
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(0.08 * vel, t0);
      tg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
      osc("triangle", f * 2, t0 + 0.06).connect(tg);
      tg.connect(lp);
      break;
    }
    case "epiano": {
      // Two-operator FM: a sine carrier whose modulation index decays like a struck tine.
      const g = env(0.3 * vel, 0.004, 0.9, 0.35, 0.22);
      const car = osc("sine", f, stopAt(0.22));
      const mod = osc("sine", f, stopAt(0.22));
      const index = f * (2.2 + 2.5 * vel);
      const modGain = ctx.createGain();
      modGain.gain.setValueAtTime(index, t0);
      modGain.gain.setTargetAtTime(index * 0.12, t0, 0.35);
      mod.connect(modGain);
      modGain.connect(car.frequency);
      car.connect(g);
      g.connect(lp);
      if (f * 14 < nyq) {
        const bg = ctx.createGain();
        bg.gain.setValueAtTime(0.05 * vel, t0);
        bg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.07);
        osc("sine", f * 14, t0 + 0.1).connect(bg);
        bg.connect(lp);
      }
      break;
    }
    case "organ": {
      const g = env(0.17 * vel, 0.012, 0, 1, 0.07);
      for (const [mult, amp] of [[1, 0.8], [2, 0.7], [3, 0.5], [4, 0.35], [6, 0.18], [8, 0.12]] as const) {
        if (f * mult > nyq) break;
        const ag = ctx.createGain();
        ag.gain.setValueAtTime(amp, t0);
        osc("sine", f * mult, stopAt(0.07)).connect(ag);
        ag.connect(g);
      }
      g.connect(lp);
      break;
    }
    case "pad": {
      const g = env(0.14 * vel, 0.22, 0, 1, 0.6);
      for (const d of [-8, 0, 8]) osc(d === 0 ? "triangle" : "sawtooth", f, stopAt(0.6), d).connect(g);
      g.connect(lp);
      lp.frequency.setValueAtTime(cutoff * 0.35, t0);
      lp.frequency.linearRampToValueAtTime(Math.min(nyq, cutoff * 0.8), t0 + 0.6);
      break;
    }
    case "strings": {
      const g = env(0.12 * vel, 0.16, 0, 1, 0.38);
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(6, t0);
      osc("sine", 5.4, stopAt(0.38)).connect(lfoGain);
      for (const d of [-13, -4, 5, 14]) {
        const o = osc("sawtooth", f, stopAt(0.38), d);
        lfoGain.connect(o.detune);
        o.connect(g);
      }
      g.connect(lp);
      lp.frequency.setValueAtTime(cutoff * 0.7, t0);
      break;
    }
    case "pluck": {
      const g = env(0.2 * vel, 0.003, 0.22, 0.04, 0.1);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.45, t0);
      osc("sawtooth", f, stopAt(0.1)).connect(g);
      osc("square", f, stopAt(0.1), 6).connect(og);
      og.connect(g);
      g.connect(lp);
      lp.frequency.setValueAtTime(Math.min(nyq, cutoff * 3), t0);
      lp.frequency.setTargetAtTime(cutoff * 0.35, t0, 0.12);
      break;
    }
  }
  return nodes;
}

/* -------------------------------- drums -------------------------------- */

function drumHit(
  ctx: BaseAudioContext,
  dest: AudioNode,
  track: Pick<Track, "kit">,
  pitch: number,
  t0: number,
  vel: number,
  noise: AudioBuffer,
  buffers?: Buffers,
): Src[] {
  const piece = drumPiece(pitch);
  const sampleId = track.kit?.[piece];
  const sample = sampleId ? buffers?.get(sampleId) : undefined;
  if (sample) {
    const src = ctx.createBufferSource();
    src.buffer = sample;
    const g = ctx.createGain();
    // The loudest hits of a track keep their level; softer ones drop off.
    g.gain.setValueAtTime(Math.min(1, 0.35 + 0.65 * vel) * (piece === "hats" ? 0.7 : 1), t0);
    src.connect(g);
    g.connect(dest);
    src.start(t0);
    return [src];
  }
  return synthDrum(ctx, dest, piece, t0, vel, noise);
}

function synthDrum(ctx: BaseAudioContext, dest: AudioNode, piece: "kick" | "snare" | "hats", t0: number, vel: number, noise: AudioBuffer): Src[] {
  const nodes: Src[] = [];
  if (piece === "kick") {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(130, t0);
    o.frequency.exponentialRampToValueAtTime(42, t0 + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.9 * vel, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.28);
    o.connect(g);
    g.connect(dest);
    o.start(t0);
    o.stop(t0 + 0.3);
    nodes.push(o);
    return nodes;
  }
  const n = ctx.createBufferSource();
  n.buffer = noise;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  const g = ctx.createGain();
  if (piece === "snare") {
    hp.frequency.setValueAtTime(900, t0);
    g.gain.setValueAtTime(0.55 * vel, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.16);
    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(190, t0);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.35 * vel, t0);
    og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.1);
    o.connect(og);
    og.connect(dest);
    o.start(t0);
    o.stop(t0 + 0.12);
    nodes.push(o);
  } else {
    hp.frequency.setValueAtTime(7000, t0);
    g.gain.setValueAtTime(0.25 * vel, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.05);
  }
  n.connect(hp);
  hp.connect(g);
  g.connect(dest);
  n.start(t0, 0, 0.2);
  nodes.push(n);
  return nodes;
}

/** One-shot audition of a note (used when drawing or moving MIDI notes). */
export function previewNote(
  ctx: BaseAudioContext,
  dest: AudioNode,
  track: Pick<Track, "synth" | "patch" | "brightness" | "kit"> | undefined,
  pitch: number,
  velocity = 0.8,
  buffers?: Buffers,
): void {
  const g = ctx.createGain();
  g.connect(dest);
  const t0 = ctx.currentTime + 0.005;
  const t = track ?? {};
  if (t.synth === "drums") drumHit(ctx, g, t, pitch, t0, velocity, noiseBuffer(ctx), buffers);
  else pitched(ctx, g, t, pitch, t0, 0.5, velocity);
  setTimeout(() => g.disconnect(), 1500);
}
