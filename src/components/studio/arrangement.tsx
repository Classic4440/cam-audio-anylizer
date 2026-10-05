import { useCallback, useEffect, useRef, type PointerEvent } from "react";
import { LANE_META, LANE_ORDER, type AnalysisResult, type LaneId } from "@/lib/audio/types";
import { cn } from "@/lib/utils";

const HEADER_W = 112;
const RULER_H = 28;
const MASTER_H = 58;
const LANE_H = 52;
const CHORD_H = 58;

function laneHeight(id: LaneId): number {
  return id === "chords" ? CHORD_H : LANE_H;
}

export function arrangementHeight(): number {
  return RULER_H + MASTER_H + LANE_ORDER.reduce((s, id) => s + laneHeight(id), 0);
}

function readColor(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawWaveform(
  ctx: CanvasRenderingContext2D,
  min: Float32Array,
  max: Float32Array,
  originX: number,
  y: number,
  totalW: number,
  h: number,
  color: string,
  duration: number,
): void {
  const n = min.length;
  const mid = y + h / 2;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const px = originX + ((i + 0.5) / n) * totalW;
    const hi = (max[i] ?? 0) * (h * 0.46);
    if (i === 0) ctx.moveTo(px, mid - hi);
    else ctx.lineTo(px, mid - hi);
  }
  for (let i = n - 1; i >= 0; i--) {
    const px = originX + ((i + 0.5) / n) * totalW;
    const lo = (min[i] ?? 0) * (h * 0.46);
    ctx.lineTo(px, mid - lo);
  }
  ctx.closePath();
  ctx.fill();
}

export function Arrangement({
  analysis,
  pxPerSec,
  currentTime,
  playing,
  muted,
  solo,
  onSeek,
  onToggleMute,
  onToggleSolo,
}: {
  analysis: AnalysisResult;
  pxPerSec: number;
  currentTime: number;
  playing: boolean;
  muted: Set<LaneId>;
  solo: Set<LaneId>;
  onSeek: (t: number) => void;
  onToggleMute: (id: LaneId) => void;
  onToggleSolo: (id: LaneId) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const timeRef = useRef(currentTime);
  timeRef.current = currentTime;

  const width = Math.max(640, analysis.duration * pxPerSec + 48);
  const height = arrangementHeight();

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const scroller = scrollerRef.current;
    if (!canvas || !scroller) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const viewW = scroller.clientWidth;
    canvas.width = Math.floor(viewW * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${viewW}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const scroll = scroller.scrollLeft;
    const tStart = Math.max(0, (scroll - 16) / pxPerSec);
    const tEnd = (scroll + viewW + 16) / pxPerSec;

    const bg = readColor("--color-card", "#121216");
    const alt = readColor("--color-background", "#0a0a0c");
    const grid = readColor("--color-gridline", "#1e1e26");
    const fg = readColor("--color-foreground", "#ececef");
    const mutedFg = readColor("--color-muted-foreground", "#8b8b94");
    const border = readColor("--color-border", "#2a2a32");

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, viewW, height);

    const beat = 60 / analysis.bpm;
    const bar = beat * 4;
    const xOf = (t: number) => t * pxPerSec - scroll;

    const firstBeat = Math.floor(tStart / beat) * beat;
    for (let t = firstBeat; t <= tEnd + beat; t += beat) {
      const x = xOf(t);
      const isBar = Math.abs((t / bar) - Math.round(t / bar)) < 1e-6;
      ctx.strokeStyle = isBar ? border : grid;
      ctx.globalAlpha = isBar ? 0.85 : 0.5;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + 0.5, 0);
      ctx.lineTo(Math.round(x) + 0.5, height);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = alt;
    ctx.fillRect(0, 0, viewW, RULER_H);
    ctx.strokeStyle = border;
    ctx.beginPath();
    ctx.moveTo(0, RULER_H - 0.5);
    ctx.lineTo(viewW, RULER_H - 0.5);
    ctx.stroke();

    ctx.font = "500 11px 'IBM Plex Mono', ui-monospace, monospace";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const firstBar = Math.floor(tStart / bar);
    for (let b = firstBar; b * bar <= tEnd + bar; b++) {
      const t = b * bar;
      const x = xOf(t);
      if (x < -40 || x > viewW) continue;
      ctx.fillStyle = mutedFg;
      ctx.fillText(String(b + 1), x + 6, RULER_H / 2 + 5);
    }
    ctx.font = "600 9px 'IBM Plex Sans', sans-serif";
    ctx.fillStyle = fg;
    for (const sec of analysis.sections) {
      const x = xOf(sec.start);
      if (x < -90 || x > viewW) continue;
      ctx.fillText(sec.name.toUpperCase(), x + 6, 9);
    }

    let y = RULER_H;
    ctx.fillStyle = alt;
    ctx.fillRect(0, y, viewW, MASTER_H);
    drawWaveform(
      ctx,
      analysis.waveform.min,
      analysis.waveform.max,
      xOf(0),
      y + 6,
      analysis.duration * pxPerSec,
      MASTER_H - 12,
      `${fg}8f`,
      analysis.duration,
    );
    ctx.strokeStyle = border;
    ctx.beginPath();
    ctx.moveTo(0, y + MASTER_H - 0.5);
    ctx.lineTo(viewW, y + MASTER_H - 0.5);
    ctx.stroke();
    y += MASTER_H;

    const laneColors: Record<LaneId, string> = {
      kick: readColor("--lane-kick", "#c4a07a"),
      snare: readColor("--lane-snare", "#c48474"),
      hats: readColor("--lane-hats", "#8aaf96"),
      bass: readColor("--lane-bass", "#5d8a8a"),
      vocals: readColor("--lane-vocals", "#7a8eaa"),
      chords: readColor("--lane-chords", "#9a8e7a"),
    };

    LANE_ORDER.forEach((id, index) => {
      const h = laneHeight(id);
      const dim = muted.has(id) || (solo.size > 0 && !solo.has(id));
      ctx.globalAlpha = 1;
      ctx.fillStyle = index % 2 === 0 ? bg : alt;
      ctx.fillRect(0, y, viewW, h);

      const env = analysis.envelopes[id];
      const color = laneColors[id];
      const now = timeRef.current;

      if ((id === "bass" || id === "vocals" || id === "chords") && env && env.length) {
        ctx.globalAlpha = dim ? 0.16 : 0.2;
        ctx.fillStyle = color;
        ctx.beginPath();
        const mid = y + h / 2;
        ctx.moveTo(xOf(0), mid);
        for (let i = 0; i < env.length; i++) {
          const t = (i / Math.max(1, env.length - 1)) * analysis.duration;
          ctx.lineTo(xOf(t), mid - (env[i] ?? 0) * (h * 0.4));
        }
        for (let i = env.length - 1; i >= 0; i--) {
          const t = (i / Math.max(1, env.length - 1)) * analysis.duration;
          ctx.lineTo(xOf(t), mid + (env[i] ?? 0) * (h * 0.4));
        }
        ctx.closePath();
        ctx.fill();
      }

      ctx.font =
        id === "chords"
          ? "600 13px Syne, sans-serif"
          : "500 10px 'IBM Plex Sans', sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";

      for (const clip of analysis.lanes[id]) {
        if (clip.start + clip.duration < tStart || clip.start > tEnd) continue;
        const x = xOf(clip.start);
        const w = Math.max(id === "hats" ? 2 : 5, clip.duration * pxPerSec - 1.5);
        const pad = id === "chords" ? 10 : id === "hats" ? 16 : 11;
        const active = now >= clip.start && now < clip.start + clip.duration;
        ctx.fillStyle = color;
        ctx.globalAlpha = dim ? 0.28 : active ? 0.98 : 0.52 + clip.velocity * 0.38;
        roundRect(ctx, x, y + pad, w, h - pad * 2, id === "hats" ? 1 : 3);
        ctx.fill();
        if (clip.label && w > 24) {
          ctx.globalAlpha = dim ? 0.45 : 0.95;
          ctx.fillStyle = alt;
          ctx.fillText(clip.label, x + 7, y + h / 2);
        }
      }

      ctx.globalAlpha = 1;
      ctx.strokeStyle = border;
      ctx.beginPath();
      ctx.moveTo(0, y + h - 0.5);
      ctx.lineTo(viewW, y + h - 0.5);
      ctx.stroke();
      y += h;
    });
  }, [analysis, pxPerSec, muted, solo, height]);

  useEffect(() => {
    draw();
  }, [draw, currentTime]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onScroll = () => draw();
    scroller.addEventListener("scroll", onScroll, { passive: true });
    const ro = new ResizeObserver(() => draw());
    ro.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", onScroll);
      ro.disconnect();
    };
  }, [draw]);

  useEffect(() => {
    const scroller = scrollerRef.current;
    const playhead = playheadRef.current;
    if (!scroller || !playhead) return;
    if (playing) followRef.current = true;
    const onWheel = () => {
      followRef.current = false;
    };
    scroller.addEventListener("wheel", onWheel, { passive: true });
    let raf = 0;
    const tick = () => {
      const t = timeRef.current;
      const x = t * pxPerSec;
      playhead.style.transform = `translateX(${x}px)`;
      if (playing && followRef.current) {
        const left = scroller.scrollLeft;
        const view = scroller.clientWidth;
        const margin = Math.max(80, view * 0.3);
        if (x > left + view - margin) scroller.scrollLeft = x - view * 0.35;
        else if (x < left + 8) scroller.scrollLeft = Math.max(0, x - 24);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      scroller.removeEventListener("wheel", onWheel);
    };
  }, [pxPerSec, playing]);

  const onPointer = (e: PointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const rect = scroller.getBoundingClientRect();
    const x = scroller.scrollLeft + (e.clientX - rect.left);
    onSeek(Math.max(0, Math.min(analysis.duration, x / pxPerSec)));
    followRef.current = true;
  };

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
      <div
        className="z-20 flex shrink-0 flex-col border-r border-border bg-background"
        style={{ width: HEADER_W }}
      >
        <div
          className="flex items-center px-3 text-xs font-medium uppercase tracking-wider text-muted-foreground"
          style={{ height: RULER_H }}
        >
          Playlist
        </div>
        <div
          className="flex items-center gap-2 border-t border-border px-3"
          style={{ height: MASTER_H }}
        >
          <span className="size-2 rounded-full bg-foreground/70" />
          <span className="text-xs font-medium text-foreground">Master</span>
        </div>
        {LANE_ORDER.map((id) => {
          const meta = LANE_META[id];
          const isMuted = muted.has(id);
          const isSolo = solo.has(id);
          return (
            <div
              key={id}
              className="flex items-center gap-1 border-t border-border px-2"
              style={{ height: laneHeight(id) }}
            >
              <span
                className="size-2.5 shrink-0 rounded-sm"
                style={{ background: `var(${meta.colorVar})` }}
              />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
                {meta.label}
              </span>
              <button
                type="button"
                aria-label={`Mute ${meta.label}`}
                aria-pressed={isMuted}
                onClick={() => onToggleMute(id)}
                className={cn(
                  "flex size-11 items-center justify-center rounded-sm text-xs font-medium md:size-8",
                  isMuted
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                M
              </button>
              <button
                type="button"
                aria-label={`Solo ${meta.label}`}
                aria-pressed={isSolo}
                onClick={() => onToggleSolo(id)}
                className={cn(
                  "flex size-11 items-center justify-center rounded-sm text-xs font-medium md:size-8",
                  isSolo
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                S
              </button>
            </div>
          );
        })}
      </div>

      <div
        ref={scrollerRef}
        className="min-h-0 min-w-0 flex-1 overflow-auto"
        onPointerDown={() => {
          followRef.current = true;
        }}
      >
        <div
          className="relative cursor-text"
          style={{ width, height }}
          onPointerDown={onPointer}
        >
          <canvas ref={canvasRef} className="sticky left-0 top-0" />
          <div
            ref={playheadRef}
            className="pointer-events-none absolute top-0 z-10 w-px bg-playhead"
            style={{ height, left: 0, willChange: "transform" }}
          >
            <span className="absolute -left-1.5 top-0 size-0 border-x-4 border-t-8 border-x-transparent border-t-playhead" />
          </div>
        </div>
      </div>
    </div>
  );
}
