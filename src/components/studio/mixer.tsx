import { LANE_META, LANE_ORDER, type LaneId } from "@/lib/audio/types";
import { cn } from "@/lib/utils";

export function Mixer({
  levels,
  muted,
  solo,
  onToggleMute,
  onToggleSolo,
}: {
  levels: Record<LaneId, number>;
  muted: Set<LaneId>;
  solo: Set<LaneId>;
  onToggleMute: (id: LaneId) => void;
  onToggleSolo: (id: LaneId) => void;
}) {
  return (
    <aside className="hidden w-44 shrink-0 flex-col border-r border-border bg-card lg:flex">
      <div className="border-b border-border px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        Mixer
      </div>
      <div className="grid flex-1 grid-cols-6 gap-1 px-2 py-3">
        {LANE_ORDER.map((id) => {
          const meta = LANE_META[id];
          const level = levels[id] ?? 0;
          const isMuted = muted.has(id);
          const isSolo = solo.has(id);
          return (
            <div key={id} className="flex min-h-0 flex-col items-center gap-2">
              <div className="relative flex min-h-24 w-3 flex-1 overflow-hidden rounded-full bg-muted">
                <span
                  className="absolute bottom-0 left-0 right-0 rounded-full"
                  style={{
                    height: `${Math.min(100, level * 140)}%`,
                    background: `var(${meta.colorVar})`,
                    opacity: isMuted ? 0.25 : 1,
                  }}
                />
              </div>
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  aria-label={`Mute ${meta.label}`}
                  onClick={() => onToggleMute(id)}
                  className={cn(
                    "size-6 rounded-sm text-xs font-medium",
                    isMuted ? "bg-foreground text-background" : "bg-secondary text-muted-foreground",
                  )}
                >
                  M
                </button>
                <button
                  type="button"
                  aria-label={`Solo ${meta.label}`}
                  onClick={() => onToggleSolo(id)}
                  className={cn(
                    "size-6 rounded-sm text-xs font-medium",
                    isSolo ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
                  )}
                >
                  S
                </button>
              </div>
              <span
                className="text-xs font-medium"
                style={{ color: `var(${meta.colorVar})` }}
              >
                {meta.short}
              </span>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
