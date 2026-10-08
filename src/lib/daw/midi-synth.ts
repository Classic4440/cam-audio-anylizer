import type { Project, Track } from "./types.ts";

/**
 * Tiny built-in synth so MIDI tracks are audible without samples or downloads.
 * Drum tracks map pitch 36 -> kick, 37-40 -> snare, others -> hat.
 */

type TrackGains = ReadonlyMap<string, { gain: GainNode }>;

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

export function scheduleMidiTracks(
  ctx: BaseAudioContext,
  gains: TrackGains,
  project: Project,
  from: number,
  startAt: number,
  only?: ReadonlySet<string>,
): AudioScheduledSourceNode[] {
  const out: AudioScheduledSourceNode[] = [];
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
        out.push(...drumHit(ctx, dest, c.pitch, t0, vel, noise));
      } else {
        out.push(...pitched(ctx, dest, track, c.pitch, t0, dur, vel));
      }
    }
  }
  return out;
}

function pitched(
  ctx: BaseAudioContext,
  dest: AudioNode,
  track: Track,
  pitch: number,
  t0: number,
  dur: number,
  vel: number,
): AudioScheduledSourceNode[] {
  const f = 440 * 2 ** ((pitch - 69) / 12);
  const bass = track.synth === "bass";
  const osc = ctx.createOscillator();
  osc.type = bass ? "sawtooth" : "triangle";
  osc.frequency.setValueAtTime(f, t0);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(bass ? 700 : 3000, t0);
  const g = ctx.createGain();
  const peak = (bass ? 0.5 : 0.22) * vel;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(peak, t0 + 0.008);
  g.gain.setValueAtTime(peak, t0 + Math.max(0.01, dur - 0.04));
  g.gain.linearRampToValueAtTime(0, t0 + dur);
  osc.connect(lp);
  lp.connect(g);
  g.connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
  return [osc];
}

function drumHit(
  ctx: BaseAudioContext,
  dest: AudioNode,
  pitch: number,
  t0: number,
  vel: number,
  noise: AudioBuffer,
): AudioScheduledSourceNode[] {
  const nodes: AudioScheduledSourceNode[] = [];
  if (pitch <= 36) {
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
  if (pitch <= 40) {
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
  synth: Track["synth"],
  pitch: number,
  velocity = 0.8,
): void {
  const g = ctx.createGain();
  g.connect(dest);
  const t0 = ctx.currentTime + 0.005;
  if (synth === "drums") drumHit(ctx, g, pitch, t0, velocity, noiseBuffer(ctx));
  else pitched(ctx, g, { synth } as Track, pitch, t0, 0.35, velocity);
  setTimeout(() => g.disconnect(), 800);
}
