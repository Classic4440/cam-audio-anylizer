import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Controller } from "@/lib/daw/controller";
import * as ops from "@/lib/daw/ops";
import { PATCHES, type PatchId } from "@/lib/audio/dsp/tone";
import type { Track } from "@/lib/daw/types";

const KIND_LABEL: Record<Track["kind"], string> = { audio: "Audio", analysis: "Detected", chords: "Chords", midi: "MIDI" };

export function TrackHeader({ track, height, controller }: { track: Track; height: number; controller: Controller }) {
  const { store, engine } = controller;
  const meterRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(track.name);

  useEffect(() => setName(track.name), [track.name]);

  useEffect(() => {
    if (track.kind !== "audio" && track.kind !== "midi") return;
    let raf = 0;
    let level = 0;
    const tick = () => {
      const target = engine.playing ? engine.trackLevel(track.id) : 0;
      level = Math.max(target, level * 0.88);
      if (meterRef.current) meterRef.current.style.transform = `scaleX(${Math.min(1, level * 1.4)})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine, track.id, track.kind]);

  const patch = (p: ops.TrackPatch) => store.commit((proj) => ops.updateTrack(proj, track.id, p));
  const mixable = track.kind === "audio" || track.kind === "midi";

  return (
    <div
      className="group relative flex flex-col justify-center gap-1 border-b border-border px-2.5 py-1"
      style={{ height }}
    >
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: track.color }} />
      <div className="flex items-center gap-1.5 pl-1.5">
        {editing ? (
          <input
            autoFocus
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              setEditing(false);
              if (name.trim() && name !== track.name) patch({ name });
              else setName(track.name);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") {
                setName(track.name);
                setEditing(false);
              }
            }}
            className="min-w-0 flex-1 rounded-sm border border-border bg-background px-1 text-xs text-foreground outline-none focus:border-primary"
          />
        ) : (
          <button
            type="button"
            title="Double-click to rename"
            onDoubleClick={() => setEditing(true)}
            className="min-w-0 flex-1 truncate text-left text-xs font-medium text-foreground"
          >
            {track.name}
          </button>
        )}
        {mixable ? (
          <>
            <Toggle label="M" title="Mute" on={track.mute} tone="mute" onClick={() => patch({ mute: !track.mute })} />
            <Toggle label="S" title="Solo" on={track.solo} tone="solo" onClick={() => patch({ solo: !track.solo })} />
          </>
        ) : null}
        <button
          type="button"
          aria-label={`Delete track ${track.name}`}
          title="Delete track"
          onClick={() => {
            if (track.clips.length === 0 || window.confirm(`Delete track "${track.name}" and its ${track.clips.length} clips?`)) {
              store.commit((p) => ops.removeTrack(p, track.id));
            }
          }}
          className="text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      {mixable && height >= 60 ? (
        <div className="flex items-center gap-2 pl-1.5">
          <input
            type="range"
            min={0}
            max={1.5}
            step={0.01}
            value={track.volume}
            aria-label={`${track.name} volume`}
            onChange={(e) => patch({ volume: Number(e.target.value) })}
            onDoubleClick={() => patch({ volume: 1 })}
            className="h-1 min-w-0 flex-1 accent-[var(--color-primary)]"
          />
          <input
            type="range"
            min={-1}
            max={1}
            step={0.01}
            value={track.pan}
            aria-label={`${track.name} pan`}
            title="Pan (double-click to centre)"
            onChange={(e) => patch({ pan: Number(e.target.value) })}
            onDoubleClick={() => patch({ pan: 0 })}
            className="h-1 w-12 accent-[var(--color-primary)]"
          />
        </div>
      ) : null}
      {track.kind === "midi" && track.synth === "keys" && height >= 100 ? (
        <div className="flex items-center gap-2 pl-1.5">
          <select
            aria-label={`${track.name} instrument`}
            value={track.patch ?? "piano"}
            onChange={(e) => patch({ patch: e.target.value as PatchId })}
            className="h-6 min-w-0 flex-1 rounded-sm border border-border bg-background px-1 text-[11px] text-foreground outline-none focus:border-primary"
          >
            {PATCHES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={track.brightness ?? 0.6}
            aria-label={`${track.name} brightness`}
            title="Brightness (double-click to reset)"
            onChange={(e) => patch({ brightness: Number(e.target.value) })}
            onDoubleClick={() => patch({ brightness: 0.6 })}
            className="h-1 w-12 accent-[var(--color-primary)]"
          />
        </div>
      ) : null}
      {track.kind === "midi" && track.synth === "drums" && height >= 100 ? (
        <p className="pl-1.5 text-[10px] text-muted-foreground" title="Kick, snare and hat sounds were cut from the original track">
          {track.kit && Object.keys(track.kit).length ? "Sounds cut from your track" : "Built-in drum sounds"}
        </p>
      ) : null}
      <div className="flex items-center gap-2 pl-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{KIND_LABEL[track.kind]}</span>
        {mixable ? (
          <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
            <div ref={meterRef} className="h-full origin-left rounded-full bg-primary" style={{ transform: "scaleX(0)" }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Toggle({ label, title, on, tone, onClick }: { label: string; title: string; on: boolean; tone: "mute" | "solo"; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={on}
      onClick={onClick}
      className={
        "size-5 rounded-sm text-[10px] font-semibold " +
        (on
          ? tone === "solo"
            ? "bg-primary text-primary-foreground"
            : "bg-destructive text-white"
          : "bg-secondary text-muted-foreground hover:text-foreground")
      }
    >
      {label}
    </button>
  );
}
