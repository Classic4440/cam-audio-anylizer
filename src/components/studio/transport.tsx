import { Pause, Play, Square, Volume2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { formatClock } from "@/lib/audio/format";
import { formatPosition } from "@/lib/daw/timeline-math";
import type { Project } from "@/lib/daw/types";

const NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const KEYS = NOTES.flatMap((n) => [`${n} major`, `${n} minor`]);

export function Transport({
  project,
  playing,
  currentTime,
  duration,
  onPlayPause,
  onStop,
  onSeek,
  onMasterVolume,
  onBpm,
  onKey,
  onDownbeat,
}: {
  project: Project;
  playing: boolean;
  currentTime: number;
  duration: number;
  onPlayPause: () => void;
  onStop: () => void;
  onSeek: (t: number) => void;
  onMasterVolume: (v: number) => void;
  onBpm: (bpm: number) => void;
  onKey: (key: string, mode: "major" | "minor") => void;
  onDownbeat: () => void;
}) {
  const [bpmText, setBpmText] = useState(String(project.bpm));
  useEffect(() => setBpmText(String(project.bpm)), [project.bpm]);
  const progress = duration > 0 ? currentTime / duration : 0;
  const commitBpm = () => {
    const v = Number(bpmText);
    if (Number.isFinite(v) && v >= 30 && v <= 300) onBpm(v);
    else setBpmText(String(project.bpm));
  };

  return (
    <div className="flex flex-col gap-2 border-b border-border bg-background px-3 py-2.5 md:px-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          <Button type="button" size="icon" aria-label={playing ? "Pause (Space)" : "Play (Space)"} onClick={onPlayPause}>
            {playing ? <Pause className="size-4 fill-current" /> : <Play className="size-4 fill-current" />}
          </Button>
          <Button type="button" size="icon" variant="secondary" aria-label="Stop" onClick={onStop}>
            <Square className="size-3 fill-current" />
          </Button>
        </div>
        <div className="min-w-[8rem] flex-1">
          <button
            type="button"
            className="block h-1.5 w-full overflow-hidden rounded-full bg-muted"
            aria-label="Seek"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              onSeek(((e.clientX - r.left) / r.width) * duration);
            }}
          >
            <span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, progress * 100)}%` }} />
          </button>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs tabular-nums text-muted-foreground">
          <span className="text-foreground">{formatPosition(currentTime, project.bpm, project.beatOffset, project.beatsPerBar)}</span>
          <span>
            {formatClock(currentTime)} / {formatClock(duration)}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div className="flex items-center gap-1.5">
          <label htmlFor="bpm" className="uppercase tracking-wider text-muted-foreground">BPM</label>
          <input
            id="bpm"
            inputMode="decimal"
            value={bpmText}
            onChange={(e) => setBpmText(e.target.value)}
            onBlur={commitBpm}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="w-16 rounded-md border border-border bg-card px-1.5 py-1 text-center font-mono text-foreground outline-none focus:border-primary"
          />
          <Button type="button" size="sm" variant="ghost" className="h-7 px-1.5 text-xs" title="Half time" onClick={() => onBpm(project.bpm / 2)}>÷2</Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-1.5 text-xs" title="Double time" onClick={() => onBpm(project.bpm * 2)}>×2</Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-1.5 text-xs" title="Make the playhead position the first beat of a bar" onClick={onDownbeat}>Set 1 here</Button>
          {project.bpmConfidence > 0 ? <Confidence value={project.bpmConfidence} corrected={project.corrections.bpm} /> : null}
        </div>
        <div className="flex items-center gap-1.5">
          <label htmlFor="key" className="uppercase tracking-wider text-muted-foreground">Key</label>
          <select
            id="key"
            value={project.key}
            onChange={(e) => onKey(e.target.value, e.target.value.endsWith("minor") ? "minor" : "major")}
            className="rounded-md border border-border bg-card px-1.5 py-1 font-mono text-foreground"
          >
            {!KEYS.includes(project.key) ? <option value={project.key}>{project.key}</option> : null}
            {KEYS.map((k) => (
              <option key={k} value={k}>{k}</option>
            ))}
          </select>
          {project.keyConfidence > 0 ? <Confidence value={project.keyConfidence} corrected={project.corrections.key} /> : null}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="uppercase tracking-wider text-muted-foreground">Grid</span>
          <span className="font-mono text-foreground">{project.beatsPerBar}/{project.beatUnit}</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Volume2 className="size-3.5 text-muted-foreground" />
          <Slider className="w-24" min={0} max={1.5} step={0.01} value={[project.masterVolume]} onValueChange={(v) => onMasterVolume(v[0] ?? 1)} aria-label="Master volume" />
        </div>
      </div>
    </div>
  );
}

function Confidence({ value, corrected }: { value: number; corrected: boolean }) {
  if (corrected) return <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">edited</span>;
  const label = value >= 0.7 ? "sure" : value >= 0.4 ? "likely" : "unsure";
  return (
    <span
      title={`Detection confidence ${(value * 100).toFixed(0)}%`}
      className={"rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-wider " + (value >= 0.7 ? "bg-secondary text-muted-foreground" : "bg-destructive/20 text-destructive")}
    >
      {label}
    </span>
  );
}
