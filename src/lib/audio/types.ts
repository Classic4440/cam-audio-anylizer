export type LaneId = "kick" | "snare" | "hats" | "bass" | "vocals" | "chords";

export const LANE_ORDER: LaneId[] = [
  "kick",
  "snare",
  "hats",
  "bass",
  "vocals",
  "chords",
];

export const LANE_META: Record<
  LaneId,
  { label: string; short: string; colorVar: string }
> = {
  kick: { label: "Kick", short: "KK", colorVar: "--lane-kick" },
  snare: { label: "Snare", short: "SN", colorVar: "--lane-snare" },
  hats: { label: "Hats", short: "HH", colorVar: "--lane-hats" },
  bass: { label: "Bass", short: "BS", colorVar: "--lane-bass" },
  vocals: { label: "Vocals", short: "VX", colorVar: "--lane-vocals" },
  chords: { label: "Chords", short: "CH", colorVar: "--lane-chords" },
};

export interface Clip {
  start: number;
  duration: number;
  velocity: number;
  label?: string;
  pitch?: number;
}

export interface ChordEvent {
  start: number;
  duration: number;
  name: string;
  root: number;
  quality: "maj" | "min" | "7" | "maj7" | "min7" | "sus" | "dim";
}

export interface SectionMarker {
  start: number;
  duration: number;
  name: string;
}

export interface AnalysisResult {
  duration: number;
  sampleRate: number;
  bpm: number;
  beatOffset: number;
  timeSignature: [number, number];
  key: string;
  keyMode: "major" | "minor";
  waveform: { min: Float32Array; max: Float32Array };
  beats: number[];
  downbeats: number[];
  lanes: Record<LaneId, Clip[]>;
  envelopes: Record<LaneId | "master", Float32Array>;
  envelopeRate: number;
  chords: ChordEvent[];
  sections: SectionMarker[];
  energy: Float32Array;
  source: "demo" | "file";
  fileName: string;
  /** 0..1, how sure the tempo estimate is (beat-grid regularity + periodicity strength). */
  bpmConfidence?: number;
  /** 0..1, margin of the winning key over the runner-up. */
  keyConfidence?: number;
  /** Alternative tempos worth trying (e.g. half/double time). */
  bpmCandidates?: number[];
  keyCandidates?: { key: string; score: number }[];
  /** Recording's deviation from A=440, in cents. */
  tuningCents?: number;
  /** Bumps when the algorithms change so saved projects can be re-analysed. */
  analysisVersion?: number;
}

export type StemBuffers = Partial<Record<LaneId, AudioBuffer>>;

export interface LoadedProject {
  mix: AudioBuffer;
  stems: StemBuffers | null;
  analysis: AnalysisResult;
}
