"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Progress } from "@/components/ui/progress";
import { analyzeAudioBuffer } from "@/lib/audio/analyze";
import { renderDemoProject } from "@/lib/audio/demo";
import { getEngine } from "@/lib/audio/engine";
import type { AnalysisResult, LaneId, StemBuffers } from "@/lib/audio/types";
import { LANE_ORDER } from "@/lib/audio/types";
import { AnalysisSide } from "./analysis-side";
import { Arrangement } from "./arrangement";
import { IdleScreen } from "./idle-screen";
import { Mixer } from "./mixer";
import { Spectrum } from "./spectrum";
import { Transport } from "./transport";

type Status = "idle" | "working" | "ready";

const MAX_BYTES = 48 * 1024 * 1024;
const MAX_DURATION = 8 * 60;

const zeroLevels = (): Record<LaneId, number> => ({
  kick: 0,
  snare: 0,
  hats: 0,
  bass: 0,
  vocals: 0,
  chords: 0,
});

export function StudioApp() {
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState("Working");
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.9);
  const [pxPerSec, setPxPerSec] = useState(72);
  const [muted, setMuted] = useState<Set<LaneId>>(new Set());
  const [solo, setSolo] = useState<Set<LaneId>>(new Set());
  const [levels, setLevels] = useState<Record<LaneId, number>>(zeroLevels);
  const [dragging, setDragging] = useState(false);
  const timeRef = useRef(0);

  const loadProject = useCallback(
    (mix: AudioBuffer, next: AnalysisResult, stems: StemBuffers | null) => {
      const engine = getEngine();
      engine.load(mix, next, stems);
      engine.setVolume(volume);
      engine.onEnded = () => {
        setPlaying(false);
        setCurrentTime(next.duration);
        timeRef.current = next.duration;
      };
      setAnalysis(next);
      setCurrentTime(0);
      timeRef.current = 0;
      setPlaying(false);
      setMuted(new Set());
      setSolo(new Set());
      setStatus("ready");
      const fit = typeof window !== "undefined" ? Math.max(36, (window.innerWidth - 320) / Math.max(8, next.duration) ) : 72;
      setPxPerSec(Math.min(110, Math.max(40, fit)));
    },
    [volume],
  );

  const runDemo = useCallback(async () => {
    setStatus("working");
    setProgress(8);
    setProgressLabel("Rendering studio demo");
    try {
      const engine = getEngine();
      await engine.unlock();
      setProgress(40);
      const project = await renderDemoProject(engine.ctx!);
      setProgress(90);
      setProgressLabel("Writing playlist");
      loadProject(project.mix, project.analysis, project.stems);
    } catch (err) {
      console.error(err);
      toast.error("Could not render the demo.");
      setStatus("idle");
    }
  }, [loadProject]);

  const runFile = useCallback(
    async (file: File) => {
      if (file.size > MAX_BYTES) {
        toast.error("That file is too large. Try one under 48 MB.");
        return;
      }
      setStatus("working");
      setProgress(2);
      setProgressLabel("Decoding audio");
      try {
        const engine = getEngine();
        const ctx = await engine.unlock();
        const raw = await file.arrayBuffer();
        const mix = await ctx.decodeAudioData(raw.slice(0));
        if (mix.duration > MAX_DURATION) {
          toast.error("Keep it under 8 minutes for a clean read.");
          setStatus("idle");
          return;
        }
        if (mix.duration < 1.2) {
          toast.error("Need a little more audio than that.");
          setStatus("idle");
          return;
        }
        const next = await analyzeAudioBuffer(mix, file.name.replace(/\.[^.]+$/, ""), (pct, label) => {
          setProgress(pct);
          setProgressLabel(label);
        });
        loadProject(mix, next, null);
      } catch (err) {
        console.error(err);
        toast.error("Could not decode that audio. Try WAV, MP3, or M4A.");
        setStatus("idle");
      }
    },
    [loadProject],
  );

  const onFiles = useCallback(
    (files: FileList | File[]) => {
      const file = files[0];
      if (!file) return;
      void runFile(file);
    },
    [runFile],
  );

  const togglePlay = useCallback(async () => {
    const engine = getEngine();
    if (!analysis) return;
    if (engine.playing) {
      engine.pause();
      setPlaying(false);
      const t = engine.currentTime();
      timeRef.current = t;
      setCurrentTime(t);
      return;
    }
    if (engine.currentTime() >= analysis.duration - 0.05) engine.seek(0);
    await engine.play();
    setPlaying(true);
  }, [analysis]);

  const stop = useCallback(() => {
    const engine = getEngine();
    engine.stop();
    setPlaying(false);
    timeRef.current = 0;
    setCurrentTime(0);
  }, []);

  const seek = useCallback((t: number) => {
    getEngine().seek(t);
    timeRef.current = t;
    setCurrentTime(t);
  }, []);

  const onVolume = useCallback((v: number) => {
    setVolume(v);
    getEngine().setVolume(v);
  }, []);

  const toggleMute = useCallback((id: LaneId) => {
    setMuted((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      getEngine().setMute(id, next.has(id));
      return next;
    });
  }, []);

  const toggleSolo = useCallback((id: LaneId) => {
    setSolo((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      getEngine().setSolo(id, next.has(id));
      return next;
    });
  }, []);

  const closeSession = useCallback(() => {
    getEngine().stop();
    setAnalysis(null);
    setPlaying(false);
    setStatus("idle");
    setCurrentTime(0);
  }, []);

  useEffect(() => {
    let raf = 0;
    let lastUi = 0;
    const tick = (now: number) => {
      const engine = getEngine();
      if (engine.playing) {
        const t = engine.currentTime();
        timeRef.current = t;
        if (now - lastUi > 50) {
          lastUi = now;
          setCurrentTime(t);
          const next = zeroLevels();
          for (const id of LANE_ORDER) next[id] = engine.getLaneLevel(id);
          setLevels(next);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.code === "Space") {
        e.preventDefault();
        if (status === "ready") void togglePlay();
      } else if (e.code === "Home" || e.key === "0") {
        if (status === "ready") stop();
      } else if (e.code === "ArrowRight" && analysis) {
        seek(Math.min(analysis.duration, timeRef.current + (60 / analysis.bpm)));
      } else if (e.code === "ArrowLeft" && analysis) {
        seek(Math.max(0, timeRef.current - (60 / analysis.bpm)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [status, togglePlay, stop, analysis, seek]);

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      if (![...e.dataTransfer?.types ?? []].includes("Files")) return;
      e.preventDefault();
      setDragging(true);
    };
    const onDragLeave = (e: DragEvent) => {
      if (e.target === document.documentElement) setDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer?.files?.length) onFiles(e.dataTransfer.files);
    };
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [onFiles]);

  return (
    <TooltipProvider delayDuration={250}>
      {status === "idle" ? (
        <IdleScreen onFiles={onFiles} onDemo={runDemo} busy={false} />
      ) : status === "working" ? (
        <WorkingScreen progress={progress} label={progressLabel} />
      ) : analysis ? (
        <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-background">
          <Transport
            analysis={analysis}
            playing={playing}
            currentTime={currentTime}
            volume={volume}
            pxPerSec={pxPerSec}
            onPlayPause={() => void togglePlay()}
            onStop={stop}
            onSeek={seek}
            onVolume={onVolume}
            onZoom={setPxPerSec}
            onClose={closeSession}
          />
          <div className="flex min-h-0 flex-1">
            <Mixer
              levels={levels}
              muted={muted}
              solo={solo}
              onToggleMute={toggleMute}
              onToggleSolo={toggleSolo}
            />
            <Arrangement
              analysis={analysis}
              pxPerSec={pxPerSec}
              currentTime={currentTime}
              playing={playing}
              muted={muted}
              solo={solo}
              onSeek={seek}
              onToggleMute={toggleMute}
              onToggleSolo={toggleSolo}
            />
            <AnalysisSide analysis={analysis} currentTime={currentTime} />
          </div>
          <Spectrum active={playing} />
        </div>
      ) : (
        <IdleScreen onFiles={onFiles} onDemo={runDemo} busy={false} />
      )}

      {dragging ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80">
          <p className="rounded-lg border border-border bg-card px-6 py-4 font-display text-lg text-foreground">
            Drop to analyze
          </p>
        </div>
      ) : null}
    </TooltipProvider>
  );
}

function WorkingScreen({ progress, label }: { progress: number; label: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background px-6">
      <p className="font-display text-sm font-semibold tracking-tight text-muted-foreground">LANES</p>
      <h1 className="mt-6 font-display text-2xl font-semibold tracking-tight text-foreground">{label}</h1>
      <div className="mt-8 w-full max-w-sm">
        <Progress value={progress} />
        <p className="mt-3 font-mono text-xs tabular-nums text-muted-foreground">{Math.round(progress)}%</p>
      </div>
      <div className="relative mt-12 h-24 w-full max-w-lg overflow-hidden rounded-lg border border-border bg-card">
        <div className="absolute inset-y-0 w-px bg-playhead scan-line" />
        <div className="flex h-full flex-col justify-center gap-2 px-4">
          {["Kick", "Hats", "Bass", "Chords"].map((name, i) => (
            <div key={name} className="flex items-center gap-3">
              <span className="w-12 text-xs text-muted-foreground">{name}</span>
              <span
                className="h-2 flex-1 rounded-sm bg-muted"
                style={{ opacity: 0.4 + i * 0.12 }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
