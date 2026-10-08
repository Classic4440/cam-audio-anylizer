import { z } from "zod";
import { PROJECT_FORMAT_VERSION, type Project } from "./types.ts";

/**
 * Versioned, JSON-safe project file. Audio bytes are NOT included; assets are
 * referenced by id and live in the browser (IndexedDB). Unknown fields are ignored
 * so files written by a newer build still open.
 */

const clip = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("audio"),
    id: z.string(),
    trackId: z.string(),
    name: z.string(),
    start: z.number().min(0),
    duration: z.number().positive(),
    assetId: z.string(),
    offset: z.number().min(0),
    gain: z.number().min(0).max(8),
    fadeIn: z.number().min(0),
    fadeOut: z.number().min(0),
  }),
  z.object({
    kind: z.literal("event"),
    id: z.string(),
    trackId: z.string(),
    name: z.string(),
    start: z.number().min(0),
    duration: z.number().positive(),
    velocity: z.number(),
    pitch: z.number().optional(),
    chord: z.object({ root: z.number(), quality: z.string() }).optional(),
  }),
]);

const track = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["audio", "analysis", "chords", "midi"]),
  color: z.string(),
  lane: z.enum(["kick", "snare", "hats", "bass", "vocals", "chords"]).optional(),
  synth: z.enum(["drums", "bass", "keys"]).optional(),
  volume: z.number().min(0).max(1.5),
  pan: z.number().min(-1).max(1),
  mute: z.boolean(),
  solo: z.boolean(),
  armed: z.boolean(),
  clips: z.array(clip),
});

const asset = z.object({
  id: z.string(),
  name: z.string(),
  mime: z.string(),
  size: z.number(),
  duration: z.number(),
  sampleRate: z.number(),
  channels: z.number(),
  role: z.enum(["source", "stem", "import", "bounce"]),
  createdAt: z.number(),
});

const projectCore = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  bpm: z.number().min(30).max(300),
  beatOffset: z.number(),
  beatsPerBar: z.number().int().min(1).max(16),
  beatUnit: z.number().int(),
  key: z.string(),
  keyMode: z.enum(["major", "minor"]),
  bpmConfidence: z.number().default(0),
  keyConfidence: z.number().default(0),
  corrections: z
    .object({ bpm: z.boolean(), key: z.boolean(), downbeat: z.boolean() })
    .default({ bpm: false, key: false, downbeat: false }),
  masterVolume: z.number().default(1),
  snap: z.enum(["off", "1/4", "1/2", "1", "bar"]).default("1"),
});

const marker = z.object({
  id: z.string(),
  time: z.number(),
  duration: z.number(),
  name: z.string(),
});

const fileSchema = z.object({
  version: z.number().int().min(1),
  app: z.string().optional(),
  project: projectCore,
  assets: z.array(asset),
  tracks: z.array(track),
  markers: z.array(marker).default([]),
  analysis: z.unknown().optional(),
});

/** Typed arrays survive JSON as {"$f32":[...]} and are revived on read. */
function replacer(_k: string, v: unknown): unknown {
  if (v instanceof Float32Array) {
    return { $f32: Array.from(v, (x) => Math.round(x * 1e4) / 1e4) };
  }
  return v;
}
function reviver(_k: string, v: unknown): unknown {
  if (v && typeof v === "object" && "$f32" in (v as object)) {
    return Float32Array.from((v as { $f32: number[] }).$f32);
  }
  return v;
}

export function serializeProject(project: Project, analysis?: unknown): string {
  const { assets, tracks, markers, ...core } = project;
  return JSON.stringify(
    {
      version: PROJECT_FORMAT_VERSION,
      app: "lanes",
      project: core,
      assets: Object.values(assets),
      tracks,
      markers,
      analysis,
    },
    replacer,
    1,
  );
}

export interface ParsedProject {
  project: Project;
  analysis: unknown;
  /** True when the file was written by a newer version of the app. */
  fromNewerVersion: boolean;
}

export function parseProject(text: string): ParsedProject {
  let raw: unknown;
  try {
    raw = JSON.parse(text, reviver);
  } catch {
    throw new Error("That file is not valid JSON.");
  }
  const parsed = fileSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(`Not a LANES project: ${first?.path.join(".") ?? ""} ${first?.message ?? ""}`.trim());
  }
  const f = migrate(parsed.data);
  const assets: Project["assets"] = {};
  for (const a of f.assets) assets[a.id] = a;
  const trackIds = new Set(f.tracks.map((t) => t.id));
  for (const t of f.tracks) {
    for (const c of t.clips) {
      if (c.trackId !== t.id || !trackIds.has(c.trackId)) c.trackId = t.id;
    }
  }
  const project: Project = { ...f.project, assets, tracks: f.tracks, markers: f.markers };
  return {
    project,
    analysis: f.analysis,
    fromNewerVersion: f.version > PROJECT_FORMAT_VERSION,
  };
}

/** Upgrade older file versions in place. v1 is current, so this is the seam for later versions. */
function migrate<T extends { version: number }>(f: T): T {
  return f;
}
