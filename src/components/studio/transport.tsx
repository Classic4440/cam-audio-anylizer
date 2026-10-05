import { Pause, Play, Square, Volume2, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { formatBars, formatClock } from "@/lib/audio/format";
import type { AnalysisResult } from "@/lib/audio/types";

export function Transport({
  analysis,
  playing,
  currentTime,
  volume,
  pxPerSec,
  onPlayPause,
  onStop,
  onSeek,
  onVolume,
  onZoom,
  onClose,
}: {
  analysis: AnalysisResult;
  playing: boolean;
  currentTime: number;
  volume: number;
  pxPerSec: number;
  onPlayPause: () => void;
  onStop: () => void;
  onSeek: (t: number) => void;
  onVolume: (v: number) => void;
  onZoom: (px: number) => void;
  onClose: () => void;
}) {
  const progress = analysis.duration > 0 ? currentTime / analysis.duration : 0;
  const chord =
    analysis.chords.find((c) => currentTime >= c.start && currentTime < c.start + c.duration)?.name ??
    "—";

  return (
    <div className="flex flex-col gap-3 border-b border-border bg-background px-4 py-3 md:px-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="icon"
            aria-label={playing ? "Pause" : "Play"}
            onClick={onPlayPause}
          >
            {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
          </Button>
          <Button type="button" size="icon" variant="secondary" aria-label="Stop" onClick={onStop}>
            <Square className="size-3 fill-current" />
          </Button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate font-display text-sm font-semibold tracking-tight text-foreground">
              {analysis.fileName}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
            >
              New track
            </button>
          </div>
          <button
            type="button"
            className="mt-2 block h-1.5 w-full overflow-hidden rounded-full bg-muted"
            aria-label="Seek"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              const p = (e.clientX - rect.left) / rect.width;
              onSeek(p * analysis.duration);
            }}
          >
            <span
              className="block h-full rounded-full bg-primary"
              style={{ width: `${Math.min(100, progress * 100)}%` }}
            />
          </button>
        </div>

        <div className="flex items-center gap-4 font-mono text-xs tabular-nums text-muted-foreground">
          <span className="text-foreground">{formatBars(currentTime, analysis.bpm, analysis.beatOffset)}</span>
          <span>
            {formatClock(currentTime)} / {formatClock(analysis.duration)}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <Stat label="BPM" value={analysis.bpm.toFixed(analysis.bpm % 1 ? 1 : 0)} />
          <Stat label="Key" value={analysis.key} />
          <Stat label="Chord" value={chord} />
          <Stat label="Grid" value={`${analysis.timeSignature[0]}/${analysis.timeSignature[1]}`} />
        </dl>

        <div className="ml-auto flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Volume2 className="size-3.5 text-muted-foreground" />
            <Slider
              className="w-24"
              min={0}
              max={1}
              step={0.01}
              value={[volume]}
              onValueChange={(v) => onVolume(v[0] ?? 0)}
              aria-label="Volume"
            />
          </div>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Zoom out"
              onClick={() => onZoom(Math.max(24, pxPerSec / 1.25))}
            >
              <ZoomOut className="size-4" />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Zoom in"
              onClick={() => onZoom(Math.min(280, pxPerSec * 1.25))}
            >
              <ZoomIn className="size-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="font-mono text-foreground">{value}</dd>
    </div>
  );
}
