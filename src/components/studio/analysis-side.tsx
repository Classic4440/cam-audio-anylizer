import { AudioWaveform, Music2, RefreshCw, SplitSquareHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Controller } from "@/lib/daw/controller";
import { convertLanesToMidi } from "@/lib/daw/factory";
import * as ops from "@/lib/daw/ops";
import { useControllerState, useProjectState } from "./use-studio";

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

        <div className="flex flex-col gap-2">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Tools</p>
          <Button type="button" size="sm" variant="secondary" className="justify-start" disabled={busy || hasStems || !canAnalyse && !Object.values(project.assets).some((x) => x.role === "source")} onClick={() => void controller.separateStems()}>
            <SplitSquareHorizontal className="size-4" />
            {hasStems ? "Stems added" : "Separate stems"}
          </Button>
          <Button type="button" size="sm" variant="secondary" className="justify-start" disabled={busy || hasMidi} onClick={() => controller.store.commit((p) => convertLanesToMidi(p))}>
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
