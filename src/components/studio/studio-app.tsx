import { AlertTriangle, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getController } from "@/lib/daw/controller";
import * as ops from "@/lib/daw/ops";
import { projectEnd } from "@/lib/daw/timeline-math";
import { AnalysisSide } from "./analysis-side";
import { IdleScreen } from "./idle-screen";
import { ProjectBar } from "./project-bar";
import { ProjectsDialog } from "./projects-dialog";
import { Spectrum } from "./spectrum";
import { Timeline } from "./timeline";
import { Transport } from "./transport";
import { useControllerState, usePlayhead, useProjectState } from "./use-studio";

export function StudioApp() {
  const controller = getController();
  const cs = useControllerState(controller);
  const ps = useProjectState(controller);
  const { time, playing } = usePlayhead(controller);
  const [dialog, setDialog] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => {
    void controller.init();
  }, [controller]);

  const onFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      const first = list[0];
      if (!first) return;
      if (controller.store.getState().project) void controller.addAudioFile(first, controller.engine.currentTime());
      else void controller.importFile(first);
    },
    [controller],
  );

  const togglePlay = useCallback(async () => {
    const e = controller.engine;
    if (e.playing) e.pause();
    else await e.play();
  }, [controller]);

  const project = ps.project;
  const busy = cs.busy !== null;

  const root = (children: React.ReactNode) => (
    <div
      className="relative flex min-h-dvh flex-col bg-background text-foreground"
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        dragDepth.current++;
        setDragging(true);
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files);
      }}
    >
      {children}
      {dragging ? (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center border-2 border-dashed border-primary bg-background/80 text-sm text-foreground">
          Drop audio to {project ? "add it as a track" : "analyse it"}
        </div>
      ) : null}
      <ProjectsDialog controller={controller} open={dialog} onClose={() => setDialog(false)} />
    </div>
  );

  if (!cs.ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-sm text-muted-foreground" role="status">
        Loading studio…
      </div>
    );
  }

  const banners = (
    <>
      {cs.busy ? (
        <div className="border-b border-border bg-card px-4 py-2" role="status" aria-live="polite">
          <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
            <span>{cs.busy.label}</span>
            {cs.busy.pct !== null ? <span className="font-mono tabular-nums">{Math.round(cs.busy.pct)}%</span> : null}
          </div>
          <Progress value={cs.busy.pct ?? 8} className={cs.busy.pct === null ? "animate-pulse" : ""} />
        </div>
      ) : null}
      {cs.error ? <Banner tone="error" text={cs.error} onClose={() => controller.dismissError()} /> : null}
      {cs.notice ? <Banner tone="info" text={cs.notice} onClose={() => controller.dismissError()} /> : null}
      {cs.saveError ? <Banner tone="error" text={`Could not save: ${cs.saveError}`} /> : null}
      {cs.missing.length ? (
        <div className="flex flex-wrap items-center gap-3 border-b border-border bg-destructive/10 px-4 py-2 text-xs">
          <AlertTriangle className="size-4 shrink-0 text-destructive" />
          <span className="text-foreground">Audio missing for this project. Choose the original file to relink it:</span>
          {cs.missing.map((m) => (
            <label key={m.id} className="cursor-pointer rounded-md bg-secondary px-2 py-1 text-foreground hover:bg-accent">
              {m.name}
              <input
                type="file"
                accept="audio/*"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void controller.relinkAsset(m.id, f);
                  e.target.value = "";
                }}
              />
            </label>
          ))}
        </div>
      ) : null}
    </>
  );

  if (!project) {
    return root(
      <>
        {banners}
        <IdleScreen
          busy={busy}
          onFiles={(f) => void controller.importFile(Array.from(f)[0]!)}
          onDemo={() => void controller.loadDemo()}
          onBlank={() => void controller.newBlankProject()}
          onOpenProjects={() => setDialog(true)}
          recent={cs.projects}
          onOpenRecent={(id) => void controller.openProject(id)}
        />
      </>,
    );
  }

  const duration = projectEnd(project);
  return root(
    <>
      <ProjectBar controller={controller} onOpen={() => setDialog(true)} />
      {banners}
      <div className="flex items-stretch border-b border-border">
        <div className="min-w-0 flex-1">
          <Transport
            project={project}
            playing={playing}
            currentTime={time}
            duration={duration}
            onPlayPause={() => void togglePlay()}
            onStop={() => {
              controller.engine.stop();
            }}
            onSeek={(t) => controller.engine.seek(t)}
            onMasterVolume={(v) => controller.store.commit((p) => ops.setMasterVolume(p, v))}
            onBpm={(b) => controller.store.commit((p) => ops.setBpm(p, b))}
            onKey={(k, m) => controller.store.commit((p) => ops.setKey(p, k, m))}
            onDownbeat={() => controller.store.commit((p) => ops.setDownbeat(p, controller.engine.currentTime()))}
          />
        </div>
        <div className="hidden w-56 shrink-0 border-l border-border md:block">
          <Spectrum active={playing} />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <Timeline controller={controller} />
        <AnalysisSide controller={controller} currentTime={time} />
      </div>
    </>,
  );
}

function Banner({ tone, text, onClose }: { tone: "error" | "info"; text: string; onClose?: () => void }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={"flex items-center gap-3 border-b border-border px-4 py-2 text-xs " + (tone === "error" ? "bg-destructive/10 text-foreground" : "bg-card text-muted-foreground")}>
      {tone === "error" ? <AlertTriangle className="size-4 shrink-0 text-destructive" /> : null}
      <span className="flex-1">{text}</span>
      {onClose ? (
        <Button type="button" size="icon-sm" variant="ghost" aria-label="Dismiss" onClick={onClose}>
          <X className="size-4" />
        </Button>
      ) : null}
    </div>
  );
}
