import { LANE_META, LANE_ORDER, type AnalysisResult } from "@/lib/audio/types";

export function AnalysisSide({
  analysis,
  currentTime,
}: {
  analysis: AnalysisResult;
  currentTime: number;
}) {
  const chord = analysis.chords.find(
    (c) => currentTime >= c.start && currentTime < c.start + c.duration - 0.0001,
  );
  const section = analysis.sections.find(
    (s) => currentTime >= s.start && currentTime < s.start + s.duration - 0.0001,
  );

  return (
    <aside className="hidden w-56 shrink-0 flex-col overflow-auto border-l border-border bg-card md:flex">
      <div className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Reading
      </div>
      <div className="flex flex-col gap-5 px-4 py-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Now</p>
          <p className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground">
            {chord?.name ?? "—"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{section?.name ?? "Arrangement"}</p>
        </div>

        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
            Progression
          </p>
          <ol className="flex flex-wrap gap-1">
            {analysis.chords.slice(0, 16).map((c, i) => {
              const on = currentTime >= c.start && currentTime < c.start + c.duration;
              return (
                <li
                  key={`${c.start}-${i}`}
                  className={
                    on
                      ? "rounded-sm bg-primary px-1.5 py-0.5 font-mono text-xs text-primary-foreground"
                      : "rounded-sm bg-secondary px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
                  }
                >
                  {c.name}
                </li>
              );
            })}
          </ol>
        </div>

        <div>
          <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Hits</p>
          <ul className="flex flex-col gap-1.5 text-xs">
            {LANE_ORDER.map((id) => (
              <li key={id} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: `var(${LANE_META[id].colorVar})` }}
                  />
                  {LANE_META[id].label}
                </span>
                <span className="font-mono tabular-nums text-foreground">
                  {analysis.lanes[id].length}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          {analysis.source === "demo"
            ? "True separated layers from the studio demo. Mute and solo like a mixer."
            : "Layers are read from frequency, transients, and harmony in your file. Solo a lane to hear that band."}
        </p>
      </div>
    </aside>
  );
}
