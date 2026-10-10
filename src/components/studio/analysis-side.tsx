import { AudioWaveform, Gauge, Music2, RefreshCw, SplitSquareHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Controller } from "@/lib/daw/controller";
import * as ops from "@/lib/daw/ops";
import { useControllerState, useProjectState } from "./use-studio";

const SCORE_ROWS = [
  { key: "kick", label: "Kick" },
  { key: "snare", label: "Snare" },
  { key: "hats", label: "Hats" },
  { key: "bass", label: "Bass" },
  { key: "chords", label: "Chords" },
] as const;

export function AnalysisSide({ controller, currentTime }: { controller: Controller; currentTime: number }) {
  const ps = useProjectState(controller);
  const cs = useControllerState(controller);
  const project = ps.project!;
  const chordsTrack = project.tracks.find((t) => t.kind === "chords");
  const chord = chordsTrack?.clips.find((c) => currentTime >= c.start && currentTime < c.start + c.duration - 1e-4);
  const section = project.markers.find((m) => currentTime >= m.time && currentTime < m.time + m.duration - 1e-4);
  const a = cs.analysis;
  const hasStems = project.tracks.some((t) => t.name.endsWith("(stem)"));
  const hasMidi = project.tracks.some((t) => t.kind === "midi");
  const canAnalyse = a?.source === "file" && Object.values(project.assets).some((x) => x.role === "source");
  const busy = cs.busy !== null;
  const mode = ops.listenMode(project);
  const match = cs.match;

  return (
    <aside className="hidden w-64 shrink-0 flex-col overflow-auto border-l border-border bg-card lg:flex">
      <div className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Reading</div>
      <div className="flex flex-col gap-5 px-4 py-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Now</p>
          <p className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground">{chord?.name ?? "—"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{section?.name ?? "Arrangement"}</p>
        </div>

        {chordsTrack && chordsTrack.clips.length ? (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Progression</p>
            <ol className="flex flex-wrap gap-1">
              {chordsTrack.clips.slice(0, 16).map((c) => {
                const on = currentTime >= c.start && currentTime < c.start + c.duration;
                return (
                  <li key={c.id} className={on ? "rounded-sm bg-primary px-1.5 py-0.5 font-mono text-xs text-primary-foreground" : "rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-xs text-muted-foreground"}>
                    {c.name}
                  </li>
                );
              })}
            </ol>
          </div>
        ) : null}

        {a?.bpmCandidates?.length ? (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Tempo wrong?</p>
            <div className="flex flex-wrap gap-1">
              {a.bpmCandidates.map((b) => (
                <button key={b} type="button" onClick={() => controller.store.commit((p) => ops.setBpm(p, b))} className="rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-xs text-muted-foreground hover:text-foreground">
                  {b}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {a?.keyCandidates?.length ? (
          <div>
            <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Other keys</p>
            <div className="flex flex-wrap gap-1">
              {a.keyCandidates.slice(0, 4).map((k) => (
                <button key={k.key} type="button" onClick={() => controller.store.commit((p) => ops.setKey(p, k.key, k.key.endsWith("minor") ? "minor" : "major"))} className="rounded-sm bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground hover:text-foreground">
                  {k.key}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {hasMidi ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Compare</p>
            <div role="group" aria-label="Listen to" className="grid grid-cols-2 gap-1 rounded-md bg-secondary p-1">
              {(["original", "rebuild"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => controller.setListenMode(m)}
                  className={mode === m ? "rounded-sm bg-primary px-2 py-1 text-xs font-medium text-primary-foreground" : "rounded-sm px-2 py-1 text-xs text-muted-foreground hover:text-foreground"}
                >
                  {m === "original" ? "Original" : "Rebuild"}
                </button>
              ))}
            </div>
            <Button type="button" size="sm" variant="secondary" className="justify-start" disabled={busy} onClick={() => void controller.scoreRebuild()}>
              <Gauge className="size-4" />
              {match ? "Score again" : "Score the rebuild"}
            </Button>
            {match ? (
              <div className="flex flex-col gap-1.5">
                {SCORE_ROWS.map(({ key, label }) => {
                  const v = match[key];
                  if (v === null) return null;
                  return (
                    <div key={key} className="flex items-center gap-2 text-xs">
                      <span className="w-12 text-muted-foreground">{label}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-secondary" role="meter" aria-label={`${label} match`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)}>
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(v)}%` }} />
                      </div>
                      <span className="w-7 text-right font-mono text-foreground">{Math.round(v)}</span>
                    </div>
                  );
                })}
                <p className="text-[11px] leading-snug text-muted-foreground">
                  Rhythm and harmony closeness to the original, first {Math.round(match.seconds)} s. 0 means no better than chance.
                  {match.againstMix ? " Some parts were compared with the full mix, which is less exact; separate stems for a fairer score." : ""}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Tools</p>
          <Button type="button" size="sm" variant="secondary" className="justify-start" disabled={busy || hasStems || !canAnalyse && !Object.values(project.assets).some((x) => x.role === "source")} onClick={() => void controller.separateStems()}>
            <SplitSquareHorizontal className="size-4" />
            {hasStems ? "Stems added" : "Separate stems"}
          </Button>
          <Button type="button" size="sm" variant="secondary" className="justify-start" disabled={busy || hasMidi} onClick={() => void controller.convertToMidi()}>
            <Music2 className="size-4" />
            {hasMidi ? "MIDI tracks added" : "Convert to MIDI tracks"}
          </Button>
          <Button type="button" size="sm" variant="ghost" className="justify-start" disabled={busy || !canAnalyse} onClick={() => void controller.reanalyze()}>
            <RefreshCw className="size-4" />
            {controller.needsReanalysis() ? "Re-analyse (improved engine)" : "Re-analyse"}
          </Button>
        </div>

        <p className="flex gap-2 text-xs leading-relaxed text-muted-foreground">
          <AudioWaveform className="mt-0.5 size-3.5 shrink-0" />
          <span>
            Double-click a track to add a note or hit. Drag clips to move, drag their edges to trim, press S to split at the playhead. Detected lanes are silent; convert them to MIDI to hear and edit them.
          </span>
        </p>
      </div>
    </aside>
  );
}
