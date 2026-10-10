import { analyzeAudioBuffer, ANALYSIS_VERSION } from "../audio/analyze.ts";
import { renderDemoProject } from "../audio/demo.ts";
import { refineLanesFromStems } from "../audio/refine.ts";
import { separateAudioBuffer } from "../audio/separate-client.ts";
import { STEM_NAMES } from "../audio/separate.ts";
import type { AnalysisResult, LaneId } from "../audio/types.ts";
import { detectStrikes } from "../audio/dsp/comping.ts";
import { brightnessFrom, describeTone, extractKit, pickPatch, type KitPiece } from "../audio/dsp/tone.ts";
import { toMono } from "../audio/dsp/util.ts";
import { addStemTracks, applyLanes, assetMeta, blankProject, convertLanesToMidi, eventClips, projectFromAnalysis, STEM_LABEL } from "./factory.ts";
import { newId } from "./ids.ts";
import { exportProjectMidi } from "./midi.ts";
import { renderProject } from "./mixer-graph.ts";
import * as ops from "./ops.ts";
import { computePeaks, type Peaks } from "./peaks.ts";
import * as db from "./persistence.ts";
import { parseProject, serializeProject } from "./serialize.ts";
import { ProjectStore } from "./store.ts";
import { getTimelineEngine, type TimelineEngine } from "./timeline-engine.ts";
import { projectEnd } from "./timeline-math.ts";
import type { AssetMeta, Project, Track } from "./types.ts";
import { channelsOf, encodeWav } from "./wav.ts";

const MAX_BYTES = 150 * 1024 * 1024;
const MAX_SECONDS = 15 * 60;

export interface Busy {
  label: string;
  pct: number | null;
}

export interface ControllerState {
  ready: boolean;
  busy: Busy | null;
  error: string | null;
  notice: string | null;
  analysis: AnalysisResult | null;
  /** Assets referenced by the project whose audio is not stored locally. */
  missing: { id: string; name: string }[];
  peaksVersion: number;
  projects: db.ProjectSummary[];
  saveError: string | null;
}

type Listener = () => void;

export class Controller {
  readonly store = new ProjectStore();
  readonly engine: TimelineEngine = getTimelineEngine();
  private peaks = new Map<string, Peaks>();
  private listeners = new Set<Listener>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> = Promise.resolve();
  private lastRevision = -1;
  private state: ControllerState = {
    ready: false,
    busy: null,
    error: null,
    notice: null,
    analysis: null,
    missing: [],
    peaksVersion: 0,
    projects: [],
    saveError: null,
  };

  constructor() {
    this.store.subscribe(() => {
      const s = this.store.getState();
      this.engine.setProject(s.project);
      if (s.project && s.revision !== this.lastRevision && s.dirty) this.scheduleSave();
      this.lastRevision = s.revision;
    });
  }

  /* --------------------------- observable state -------------------------- */

  getState = (): ControllerState => this.state;
  subscribe = (l: Listener): (() => void) => {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  };
  private set(patch: Partial<ControllerState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }
  getPeaks = (assetId: string): Peaks | undefined => this.peaks.get(assetId);
  dismissError(): void {
    this.set({ error: null, notice: null });
  }

  private async run<T>(label: string, fn: (progress: (pct: number | null, label?: string) => void) => Promise<T>): Promise<T | undefined> {
    this.set({ busy: { label, pct: null }, error: null, notice: null });
    try {
      return await fn((pct, l) => this.set({ busy: { label: l ?? label, pct } }));
    } catch (err) {
      console.error(err);
      this.set({ error: err instanceof Error ? err.message : String(err) });
      return undefined;
    } finally {
      this.set({ busy: null });
    }
  }

  /* -------------------------------- startup ------------------------------ */

  async init(): Promise<void> {
    if (this.state.ready) return;
    try {
      await this.refreshProjects();
      const last = db.getLastProjectId();
      if (last) await this.openProject(last, true);
    } catch (err) {
      console.error(err);
      this.set({ error: err instanceof Error ? err.message : String(err) });
    } finally {
      this.set({ ready: true });
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") void this.saveNow();
      });
      window.addEventListener("pagehide", () => void this.saveNow());
    }
  }

  async refreshProjects(): Promise<void> {
    try {
      this.set({ projects: await db.listProjects() });
    } catch (err) {
      this.set({ projects: [], saveError: err instanceof Error ? err.message : String(err) });
    }
  }

  /* ------------------------------ persistence ---------------------------- */

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.saveNow(), 1200);
  }

  /** Save the open project now (also called by autosave). */
  saveNow(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.saving = this.saving.then(async () => {
      const { project, dirty } = this.store.getState();
      if (!project || !dirty) return;
      try {
        const at = await db.saveProject(project, this.state.analysis ?? undefined);
        this.store.markSaved(at);
        if (this.state.saveError) this.set({ saveError: null });
        void this.refreshProjects();
      } catch (err) {
        this.set({ saveError: err instanceof Error ? err.message : String(err) });
      }
    });
    return this.saving;
  }

  private async persistNew(project: Project, analysis: AnalysisResult | null): Promise<void> {
    const at = await db.saveProject(project, analysis ?? undefined);
    this.store.open(project, { savedAt: at });
    await this.refreshProjects();
  }

  /* ------------------------------- decoding ------------------------------ */

  private async decode(blob: Blob): Promise<AudioBuffer> {
    const ctx = this.engine.ensure();
    const data = await blob.arrayBuffer();
    try {
      return await ctx.decodeAudioData(data);
    } catch {
      throw new Error("This file could not be decoded as audio. Try WAV, MP3, M4A, OGG or FLAC.");
    }
  }

  private checkFile(file: File): void {
    if (file.size > MAX_BYTES) throw new Error("That file is over 150 MB. Export a shorter or compressed version.");
    if (file.type && !file.type.startsWith("audio/") && !/\.(mp3|wav|ogg|m4a|aac|flac|opus|webm)$/i.test(file.name)) {
      throw new Error("That does not look like an audio file.");
    }
  }

  private async registerBuffer(projectId: string, asset: AssetMeta, buffer: AudioBuffer, blob: Blob): Promise<void> {
    await db.saveAsset(projectId, asset.id, blob, asset.name);
    this.engine.setBuffer(asset.id, buffer);
    const peaks = computePeaks(channelsOf(buffer), buffer.sampleRate);
    this.peaks.set(asset.id, peaks);
    await db.savePeaks(projectId, asset.id, peaks).catch(() => undefined);
    this.set({ peaksVersion: this.state.peaksVersion + 1 });
  }

  /* ----------------------------- project actions ------------------------- */

  /** Import an audio file as a new analysed project. */
  async importFile(file: File): Promise<void> {
    await this.run("Decoding audio", async (progress) => {
      this.checkFile(file);
      await this.flush();
      const buffer = await this.decode(file);
      if (buffer.duration > MAX_SECONDS) throw new Error("Tracks longer than 15 minutes are not supported yet.");
      progress(0, "Analysing");
      const analysis = await analyzeAudioBuffer(buffer, file.name, (pct, label) => progress(pct, label));
      const asset = assetMeta({ name: file.name, mime: file.type || "audio/*", size: file.size, buffer, role: "source" });
      const project = projectFromAnalysis(analysis, asset);
      this.resetRuntime(project.id);
      await this.registerBuffer(project.id, asset, buffer, file);
      this.set({ analysis, missing: [] });
      db.setLastProjectId(project.id);
      await this.persistNew(project, analysis);
    });
  }

  async loadDemo(): Promise<void> {
    await this.run("Rendering demo", async () => {
      await this.flush();
      const ctx = this.engine.ensure();
      const demo = await renderDemoProject(ctx);
      const toBlob = (b: AudioBuffer) => new Blob([encodeWav(channelsOf(b), b.sampleRate, 16) as BlobPart], { type: "audio/wav" });
      const mixBlob = toBlob(demo.mix);
      const mixAsset = assetMeta({ name: "studio-demo.wav", mime: "audio/wav", size: mixBlob.size, buffer: demo.mix, role: "source" });
      let project = projectFromAnalysis(demo.analysis, mixAsset, "Studio Demo");
      this.resetRuntime(project.id);
      await this.registerBuffer(project.id, mixAsset, demo.mix, mixBlob);
      const stemList: { stem: keyof typeof STEM_LABEL; asset: AssetMeta }[] = [];
      if (demo.stems) {
        const map: Record<string, keyof typeof STEM_LABEL> = { kick: "drums", bass: "bass", vocals: "vocals", chords: "other" };
        for (const [lane, buf] of Object.entries(demo.stems) as [LaneId, AudioBuffer][]) {
          if (!buf || !(lane in map)) continue;
          const blob = toBlob(buf);
          const asset = assetMeta({ name: `${lane}.wav`, mime: "audio/wav", size: blob.size, buffer: buf, role: "stem" });
          await this.registerBuffer(project.id, asset, buf, blob);
          stemList.push({ stem: map[lane]!, asset });
        }
      }
      // The demo ships true per-instrument layers: expose them as solo-able tracks.
      if (stemList.length) project = addStemTracks(project, stemList);
      this.set({ analysis: demo.analysis, missing: [] });
      db.setLastProjectId(project.id);
      await this.persistNew(project, demo.analysis);
    });
  }

  async newBlankProject(): Promise<void> {
    await this.run("Creating project", async () => {
      await this.flush();
      const project = blankProject();
      this.resetRuntime(project.id);
      this.set({ analysis: null, missing: [] });
      db.setLastProjectId(project.id);
      await this.persistNew(project, null);
    });
  }

  /** Close the open project and return to the start screen. */
  async closeProject(): Promise<void> {
    await this.flush();
    this.engine.stop();
    this.store.close();
    this.set({ analysis: null, missing: [] });
    db.setLastProjectId(null);
    await this.refreshProjects();
  }

  private resetRuntime(_projectId: string): void {
    this.engine.stop();
    this.engine.dropBuffers(new Set());
    this.peaks.clear();
    this.set({ peaksVersion: this.state.peaksVersion + 1 });
  }

  private async flush(): Promise<void> {
    await this.saveNow();
  }

  async openProject(id: string, quiet = false): Promise<void> {
    const work = async () => {
      await this.flush();
      const loaded = await db.loadProject(id);
      if (!loaded) throw new Error("That project no longer exists.");
      const { project } = loaded;
      this.resetRuntime(project.id);
      const missing: { id: string; name: string }[] = [];
      for (const asset of Object.values(project.assets)) {
        const blob = await db.loadAsset(project.id, asset.id);
        if (!blob) {
          missing.push({ id: asset.id, name: asset.name });
          continue;
        }
        const buffer = await this.decode(blob);
        this.engine.setBuffer(asset.id, buffer);
        let peaks = await db.loadPeaks(project.id, asset.id);
        if (!peaks) {
          peaks = computePeaks(channelsOf(buffer), buffer.sampleRate);
          void db.savePeaks(project.id, asset.id, peaks).catch(() => undefined);
        }
        this.peaks.set(asset.id, peaks);
      }
      this.set({ analysis: (loaded.analysis as AnalysisResult | undefined) ?? null, missing, peaksVersion: this.state.peaksVersion + 1 });
      db.setLastProjectId(project.id);
      this.store.open(project, { savedAt: project.updatedAt });
    };
    if (quiet) await work();
    else await this.run("Opening project", work);
  }

  async deleteProject(id: string): Promise<void> {
    await this.run("Deleting project", async () => {
      const open = this.store.getState().project?.id === id;
      await db.deleteProject(id);
      if (open) {
        this.engine.stop();
        this.store.close();
        this.set({ analysis: null, missing: [] });
      }
      await this.refreshProjects();
    });
  }

  renameProject(name: string): void {
    this.store.commit((p) => ops.renameProject(p, name));
  }

  async saveAs(name: string): Promise<void> {
    await this.run("Saving copy", async () => {
      const cur = this.store.getState().project;
      if (!cur) return;
      await this.flush();
      const copy: Project = { ...cur, id: newId("proj"), name: name.trim() || `${cur.name} copy`, createdAt: Date.now() };
      await db.copyProjectData(cur.id, copy, this.state.analysis ?? undefined);
      this.store.open(copy, { savedAt: Date.now() });
      db.setLastProjectId(copy.id);
      await this.refreshProjects();
    });
  }

  /* -------------------------------- editing ------------------------------ */

  /** Add another audio file to the open project as its own track. */
  async addAudioFile(file: File, at = 0): Promise<void> {
    await this.run("Importing audio", async () => {
      const project = this.store.getState().project;
      if (!project) throw new Error("Open or create a project first.");
      this.checkFile(file);
      const buffer = await this.decode(file);
      const asset = assetMeta({ name: file.name, mime: file.type || "audio/*", size: file.size, buffer, role: "import" });
      await this.registerBuffer(project.id, asset, buffer, file);
      this.store.commit((p) => {
        let n: Project = { ...p, assets: { ...p.assets, [asset.id]: asset } };
        const t = ops.addTrack(n, { name: file.name.replace(/\.[^.]+$/, ""), kind: "audio", color: "var(--foreground)" });
        n = t.project;
        return ops.addAudioClip(n, { trackId: t.ids[0]!, assetId: asset.id, start: at }).project;
      });
    });
  }

  async relinkAsset(assetId: string, file: File): Promise<void> {
    await this.run("Relinking audio", async () => {
      const project = this.store.getState().project;
      if (!project) return;
      const buffer = await this.decode(file);
      const asset = project.assets[assetId];
      if (!asset) return;
      await this.registerBuffer(project.id, asset, buffer, file);
      this.set({ missing: this.state.missing.filter((m) => m.id !== assetId) });
    });
  }

  private sourceAsset(): AssetMeta | null {
    const p = this.store.getState().project;
    if (!p) return null;
    return Object.values(p.assets).find((a) => a.role === "source") ?? null;
  }

  /** Buffer of the audio on the first audio track named like `stemName` ("Drums"), if stems exist. */
  private stemBuffer(project: Project, stemName: string): AudioBuffer | undefined {
    const t = project.tracks.find((x) => x.kind === "audio" && x.name === `${stemName} (stem)`);
    const clip = t?.clips.find((c) => c.kind === "audio");
    return clip && clip.kind === "audio" ? this.engine.getBuffer(clip.assetId) : undefined;
  }

  /**
   * Convert detected lanes to MIDI tracks that sound like the analysed track:
   * drum hits are cut from the track itself, and the chord instrument is chosen from the track's tone.
   * Falls back to the built-in sounds when there is no audio to learn from.
   */
  async convertToMidi(): Promise<void> {
    await this.run("Building MIDI from the track", async (progress) => {
      const project = this.store.getState().project;
      if (!project) return;
      const src = this.sourceAsset();
      const mix = src ? this.engine.getBuffer(src.id) : undefined;
      const drumsBuf = this.stemBuffer(project, "Drums") ?? mix;
      const otherBuf = this.stemBuffer(project, "Other") ?? mix;
      const ctx = this.engine.ensure();

      const newAssets: AssetMeta[] = [];
      const kit: NonNullable<Track["kit"]> = {};
      if (drumsBuf) {
        progress(20, "Cutting drum hits from the track");
        const times: Partial<Record<KitPiece, number[]>> = {};
        for (const piece of ["kick", "snare", "hats"] as const) {
          const lane = project.tracks.find((t) => t.lane === piece);
          times[piece] = (lane?.clips ?? []).filter((c) => c.kind === "event").map((c) => c.start);
        }
        const samples = extractKit(toMono(channelsOf(drumsBuf)), drumsBuf.sampleRate, times);
        for (const s of samples) {
          const buf = ctx.createBuffer(1, s.data.length, s.sampleRate);
          buf.copyToChannel(s.data as Float32Array<ArrayBuffer>, 0);
          const blob = new Blob([encodeWav([s.data], s.sampleRate, 16) as BlobPart], { type: "audio/wav" });
          const asset = assetMeta({ name: `${s.piece} (from track).wav`, mime: "audio/wav", size: blob.size, buffer: buf, role: "sample" });
          await this.registerBuffer(project.id, asset, buf, blob);
          newAssets.push(asset);
          kit[s.piece] = asset.id;
        }
      }
      let patch: ReturnType<typeof pickPatch> | undefined;
      let brightness: number | undefined;
      let strikes: ReturnType<typeof detectStrikes> | undefined;
      let excludeStrikes: number[] | undefined;
      if (otherBuf) {
        progress(60, "Matching the chord sound");
        const monoOther = toMono(channelsOf(otherBuf));
        const tone = describeTone(monoOther, otherBuf.sampleRate);
        patch = pickPatch(tone);
        brightness = brightnessFrom(tone);
        progress(80, "Finding the chord rhythm");
        strikes = detectStrikes(monoOther, otherBuf.sampleRate);
        // From the full mix, kicks and snares also look like onsets; ignore those.
        if (otherBuf === mix) {
          excludeStrikes = project.tracks
            .filter((t) => t.lane === "kick" || t.lane === "snare")
            .flatMap((t) => t.clips.filter((c) => c.kind === "event").map((c) => c.start));
        }
      }
      this.store.commit((p) => {
        const withAssets = { ...p, assets: { ...p.assets, ...Object.fromEntries(newAssets.map((a) => [a.id, a])) } };
        return convertLanesToMidi(withAssets, { kit, patch, brightness, strikes, excludeStrikes });
      });
      const parts = [Object.keys(kit).length ? `${Object.keys(kit).length} drum sounds cut from your track` : null, patch ? `chords set to ${patch}${strikes ? " with the track\u2019s rhythm" : ""}` : null].filter(Boolean);
      this.set({ notice: parts.length ? `MIDI added: ${parts.join(", ")}. You can change the instrument on the Chords track.` : "MIDI tracks added with the built-in sounds." });
    });
  }

  /** Split the source mix into drums / bass / vocals / other stems and re-read the lanes from them. */
  async separateStems(): Promise<void> {
    await this.run("Separating stems", async (progress) => {
      const project = this.store.getState().project;
      const src = this.sourceAsset();
      const buffer = src ? this.engine.getBuffer(src.id) : undefined;
      if (!project || !src || !buffer) throw new Error("Import a track first, then separate its stems.");
      if (project.tracks.some((t) => t.name.endsWith("(stem)") && t.name.startsWith("Drums"))) {
        throw new Error("This project already has stems.");
      }
      const { stems, sampleRate } = await separateAudioBuffer(buffer, (pct) => progress(pct));
      const ctx = this.engine.ensure();
      const made: { stem: keyof typeof STEM_LABEL; asset: AssetMeta }[] = [];
      for (const stem of STEM_NAMES) {
        const ch = stems[stem];
        const buf = ctx.createBuffer(ch.length, ch[0]!.length, sampleRate);
        ch.forEach((c, i) => buf.copyToChannel(c as Float32Array<ArrayBuffer>, i));
        const blob = new Blob([encodeWav(ch, sampleRate, 16) as BlobPart], { type: "audio/wav" });
        const asset = assetMeta({ name: `${src.name.replace(/\.[^.]+$/, "")} - ${stem}.wav`, mime: "audio/wav", size: blob.size, buffer: buf, role: "stem" });
        await this.registerBuffer(project.id, asset, buf, blob);
        made.push({ stem, asset });
      }
      progress(null, "Reading lanes from stems");
      const refined = refineLanesFromStems(
        { drums: stems.drums, bass: stems.bass, vocals: stems.vocals },
        sampleRate,
        buffer.duration,
        { period: 60 / project.bpm, offset: project.beatOffset },
      );
      this.store.commit((p) => {
        let n = addStemTracks(p, made);
        n = {
          ...n,
          tracks: n.tracks.map((t) => {
            const lane = t.lane;
            if (!lane || lane === "chords") return t;
            return { ...t, clips: eventClips(t.id, lane, refined[lane]) };
          }),
        };
        return n;
      });
      this.set({ notice: "Stems added. The original mix is muted; the four stems add back up to it." });
    });
  }

  /** Re-run analysis with the current algorithms, keeping BPM/key you corrected by hand. */
  async reanalyze(): Promise<void> {
    await this.run("Re-analysing", async (progress) => {
      const project = this.store.getState().project;
      const src = this.sourceAsset();
      const buffer = src ? this.engine.getBuffer(src.id) : undefined;
      if (!project || !src || !buffer) throw new Error("There is no source track to analyse.");
      const analysis = await analyzeAudioBuffer(buffer, src.name, (pct, label) => progress(pct, label));
      this.set({ analysis });
      this.store.commit((p) => {
        let n = applyLanes(p, analysis);
        if (!p.corrections.bpm) n = { ...n, bpm: analysis.bpm, bpmConfidence: analysis.bpmConfidence ?? 0 };
        if (!p.corrections.downbeat) n = { ...n, beatOffset: analysis.beatOffset, beatsPerBar: analysis.timeSignature[0] };
        if (!p.corrections.key) n = { ...n, key: analysis.key, keyMode: analysis.keyMode, keyConfidence: analysis.keyConfidence ?? 0 };
        return { ...n, markers: analysis.sections.map((s) => ({ id: newId("mk"), time: s.start, duration: s.duration, name: s.name })) };
      });
    });
  }

  needsReanalysis(): boolean {
    const a = this.state.analysis;
    return !!a && a.source === "file" && (a.analysisVersion ?? 1) < ANALYSIS_VERSION;
  }

  /* -------------------------------- export ------------------------------- */

  private renderOpts() {
    return { sampleRate: this.engine.ctx?.sampleRate ?? 44100 };
  }

  private download(data: Blob, filename: string): void {
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename.replace(/[^\w.\- ]+/g, "_");
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  exportProjectFile(): void {
    const p = this.store.getState().project;
    if (!p) return;
    this.download(new Blob([serializeProject(p, this.state.analysis ?? undefined)], { type: "application/json" }), `${p.name}.lanes.json`);
  }

  exportMidiFile(): void {
    const p = this.store.getState().project;
    if (!p) return;
    this.download(new Blob([exportProjectMidi(p) as BlobPart], { type: "audio/midi" }), `${p.name}.mid`);
  }

  async exportMixWav(): Promise<void> {
    await this.run("Bouncing mix", async () => {
      const p = this.store.getState().project;
      if (!p) return;
      const buf = await renderProject(p, this.engine.buffersMap(), OfflineAudioContext, this.renderOpts());
      this.download(new Blob([encodeWav(channelsOf(buf), buf.sampleRate, 24) as BlobPart], { type: "audio/wav" }), `${p.name}.wav`);
    });
  }

  /** One WAV per audio track, regardless of mute/solo. */
  async exportTrackWavs(): Promise<void> {
    await this.run("Exporting tracks", async (progress) => {
      const p = this.store.getState().project;
      if (!p) return;
      const audio = p.tracks.filter((t) => t.kind === "audio" && t.clips.length > 0);
      let i = 0;
      for (const t of audio) {
        const buf = await renderProject(p, this.engine.buffersMap(), OfflineAudioContext, { ...this.renderOpts(), onlyTrackIds: [t.id], to: projectEnd(p) });
        this.download(new Blob([encodeWav(channelsOf(buf), buf.sampleRate, 24) as BlobPart], { type: "audio/wav" }), `${p.name} - ${t.name}.wav`);
        progress((++i / audio.length) * 100);
        await new Promise((r) => setTimeout(r, 250));
      }
    });
  }

  /** Bounce only the selected clips (exactly their time range) to a WAV. */
  async exportSelectionWav(): Promise<void> {
    await this.run("Exporting selection", async () => {
      const { project: p, selection } = this.store.getState();
      if (!p || selection.length === 0) throw new Error("Select one or more clips first.");
      const sel = new Set(selection);
      const tracks = p.tracks.map((t) => ({ ...t, mute: false, solo: false, clips: t.clips.filter((c) => sel.has(c.id)) }));
      const clips = tracks.flatMap((t) => t.clips);
      if (!clips.length) throw new Error("Select one or more clips first.");
      const from = Math.min(...clips.map((c) => c.start));
      const to = Math.max(...clips.map((c) => c.start + c.duration));
      const buf = await renderProject({ ...p, tracks }, this.engine.buffersMap(), OfflineAudioContext, { ...this.renderOpts(), from, to });
      this.download(new Blob([encodeWav(channelsOf(buf), buf.sampleRate, 24) as BlobPart], { type: "audio/wav" }), `${p.name} - selection.wav`);
    });
  }

  /** Open a .lanes.json project file (audio is not inside it; missing assets can be relinked). */
  async importProjectFile(file: File): Promise<void> {
    await this.run("Opening project file", async () => {
      await this.flush();
      const parsed = parseProject(await file.text());
      const project: Project = { ...parsed.project, id: newId("proj"), name: parsed.project.name };
      this.resetRuntime(project.id);
      const analysis = (parsed.analysis as AnalysisResult | undefined) ?? null;
      const missing = Object.values(project.assets).map((a) => ({ id: a.id, name: a.name }));
      this.set({ analysis, missing });
      db.setLastProjectId(project.id);
      await this.persistNew(project, analysis);
      if (parsed.fromNewerVersion) this.set({ notice: "This project was saved by a newer version of LANES; some details may be ignored." });
    });
  }
}

let instance: Controller | null = null;
export function getController(): Controller {
  if (!instance) instance = new Controller();
  return instance;
}
