import { Trash2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import type { Controller } from "@/lib/daw/controller";
import { formatClock } from "@/lib/audio/format";
import { useControllerState } from "./use-studio";

export function ProjectsDialog({ controller, open, onClose }: { controller: Controller; open: boolean; onClose: () => void }) {
  const cs = useControllerState(controller);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!open) return;
    void controller.refreshProjects();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, controller, onClose]);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[10vh]" onPointerDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="Projects" className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-display text-base font-semibold">Projects</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <ul className="max-h-[50vh] overflow-auto">
          {cs.projects.length === 0 ? <li className="px-4 py-8 text-center text-sm text-muted-foreground">No saved projects yet.</li> : null}
          {cs.projects.map((p) => (
            <li key={p.id} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0">
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => {
                  onClose();
                  void controller.openProject(p.id);
                }}
              >
                <span className="block truncate text-sm font-medium text-foreground">{p.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatClock(p.duration).slice(0, 5)} · {p.tracks} tracks · {new Date(p.updatedAt).toLocaleString()}
                </span>
              </button>
              <button
                type="button"
                aria-label={`Delete ${p.name}`}
                className="text-muted-foreground hover:text-destructive"
                onClick={() => {
                  if (window.confirm(`Delete "${p.name}" and its audio from this browser? This cannot be undone.`)) void controller.deleteProject(p.id);
                }}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
          <Button type="button" size="sm" variant="secondary" onClick={() => fileRef.current?.click()}>
            Import project file
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                onClose();
                void controller.importProjectFile(f);
              }
              e.target.value = "";
            }}
          />
          <p className="text-xs text-muted-foreground">Everything is stored in this browser.</p>
        </div>
      </div>
    </div>
  );
}
