import { Copy, Magnet, Plus, Scissors, Trash2, ZoomIn, ZoomOut } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { Controller } from "@/lib/daw/controller";
import * as ops from "@/lib/daw/ops";
import { peaksRange } from "@/lib/daw/peaks";
import {
  beatSeconds,
  clipEnd,
  clipsInRect,
  hitTestClip,
  layoutRows,
  midiLayout,
  pitchToY,
  projectEnd,
  rowAt,
  snapStep,
  snapTime,
  timeToX,
  xToTime,
  yToPitch,
  type TrackRow,
} from "@/lib/daw/timeline-math";
import { SNAP_MODES, type SnapMode, type Track } from "@/lib/daw/types";
import { TrackHeader } from "./track-header";
import { useControllerState, useProjectState } from "./use-studio";

const HEADER_W = 184;
const RULER_H = 52;
const MIN_PX = 8;
const MAX_PX = 600;
const PITCH_DRAG_PX = 7;

const rowHeight = (t: Track): number => (t.kind === "audio" ? 84 : t.kind === "midi" ? 120 : 44);

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

type Drag =
  | { kind: "scrub" }
  | {
      kind: "clip";
      mode: "move" | "left" | "right";
      anchorId: string;
      ids: string[];
      startX: number;
      startY: number;
      anchorStart: number;
      anchorTrackId: string;
      started: boolean;
      wasSelected: boolean;
      shift: boolean;
    }
  | { kind: "marquee"; x0: number; y0: number; x1: number; y1: number; base: string[] };

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
}

export function Timeline({ controller }: { controller: Controller }) {
  const { store, engine } = controller;
  const ps = useProjectState(controller);
  const cs = useControllerState(controller);
  const project = ps.project!;
  const selection = ps.selection;

  const [pxPerSec, setPxPerSec] = useState(64);
  const [viewW, setViewW] = useState(800);
  const [rename, setRename] = useState<{ id: string; x: number; y: number; value: string } | null>(null);
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const drawQueued = useRef(false);

  const rows = useMemo(() => layoutRows(project.tracks, rowHeight, RULER_H), [project.tracks]);
  const totalH = rows.length ? rows[rows.length - 1]!.top + rows[rows.length - 1]!.height : RULER_H;
  const endTime = projectEnd(project);
  const totalW = Math.max(viewW, (endTime + 6) * pxPerSec + 120);

  // Latest values for event handlers / draw without re-binding.
  const live = useRef({ project, selection, rows, pxPerSec, viewW, totalH, peaksVersion: cs.peaksVersion });
  live.current = { project, selection, rows, pxPerSec, viewW, totalH, peaksVersion: cs.peaksVersion };

  const viewport = () => ({ pxPerSec: live.current.pxPerSec, scrollX: scrollerRef.current?.scrollLeft ?? 0 });

  /* ------------------------------ drawing ------------------------------ */

  const draw = useCallback(() => {
    drawQueued.current = false;
    const canvas = canvasRef.current;
    const scroller = scrollerRef.current;
    if (!canvas || !scroller) return;
    const { project: p, selection: sel, rows: rws, pxPerSec: pps, viewW: W, totalH: H } = live.current;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.floor(W * dpr) || canvas.height !== Math.floor(H * dpr)) {
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const v = { pxPerSec: pps, scrollX: scroller.scrollLeft };
    const t0 = xToTime(0, v);
    const t1 = xToTime(W, v);

    const cache = new Map<string, string>();
    const color = (c: string): string => {
      let r = cache.get(c);
      if (r) return r;
      const m = /var\((--[\w-]+)\)/.exec(c);
      r = (m ? cssVar(m[1]!) : c) || "#c5c8ce";
      cache.set(c, r);
      return r;
    };
    const bg = cssVar("--color-background") || "#0e0e12";
    const card = cssVar("--color-card") || "#14141a";
    const grid = cssVar("--color-gridline") || "#1e1e26";
    const fg = cssVar("--color-foreground") || "#e8e4dc";
    const muted = cssVar("--color-muted-foreground") || "#8a8a94";
    const accent = cssVar("--color-primary") || "#c5c8ce";
    const sel_ = new Set(sel);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // Row backgrounds
    rws.forEach((r, i) => {
      ctx.fillStyle = i % 2 ? bg : card;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(0, r.top, W, r.height);
      ctx.globalAlpha = 1;
      ctx.fillStyle = grid;
      ctx.fillRect(0, r.top + r.height - 1, W, 1);
    });

    // Beat / bar grid
    const beat = beatSeconds(p.bpm);
    const bar = beat * p.beatsPerBar;
    const beatPx = beat * pps;
    const barPx = bar * pps;
    const firstBeat = Math.floor((t0 - p.beatOffset) / beat) - 1;
    const lastBeat = Math.ceil((t1 - p.beatOffset) / beat) + 1;
    for (let b = firstBeat; b <= lastBeat; b++) {
      const t = p.beatOffset + b * beat;
      const x = Math.round(timeToX(t, v)) + 0.5;
      const isBar = ((b % p.beatsPerBar) + p.beatsPerBar) % p.beatsPerBar === 0;
      if (!isBar && beatPx < 9) continue;
      if (isBar && barPx < 10 && Math.round(b / p.beatsPerBar) % 4 !== 0) continue;
      ctx.strokeStyle = grid;
      ctx.globalAlpha = isBar ? 1 : 0.55;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, RULER_H);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Clips
    for (const r of rws) {
      const track = r.track;
      const dim = track.mute ? 0.4 : 1;
      const base = color(track.color);
      const lay = track.kind === "midi" ? midiLayout(track, r.top, r.height) : null;
      if (lay) {
        ctx.strokeStyle = grid;
        for (let pch = lay.lo; pch <= lay.hi; pch++) {
          const isC = pch % 12 === 0;
          if (!isC && lay.h < 7) continue;
          ctx.globalAlpha = isC ? 0.9 : 0.35;
          const y = Math.round(pitchToY(lay, pch) + lay.h) + 0.5;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(W, y);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      for (const c of track.clips) {
        if (clipEnd(c) < t0 || c.start > t1) continue;
        const x0 = timeToX(c.start, v);
        const x1 = timeToX(clipEnd(c), v);
        const w = Math.max(c.kind === "event" ? 3 : 2, x1 - x0);
        const selected = sel_.has(c.id);
        ctx.globalAlpha = dim;
        if (c.kind === "audio") {
          const y = r.top + 4;
          const h = r.height - 9;
          ctx.fillStyle = base;
          ctx.globalAlpha = 0.16 * dim;
          ctx.fillRect(x0, y, w, h);
          ctx.globalAlpha = dim;
          // Waveform
          const peaks = controller.getPeaks(c.assetId);
          const xa = Math.max(0, x0);
          const xb = Math.min(W, x0 + w);
          if (peaks && xb > xa) {
            const bins = Math.max(1, Math.ceil(xb - xa));
            const s0 = c.offset + (xToTime(xa, v) - c.start);
            const s1 = c.offset + (xToTime(xb, v) - c.start);
            const { min, max } = peaksRange(peaks, s0, s1, bins);
            const mid = y + h / 2;
            const amp = (h / 2 - 2) * Math.min(2, c.gain);
            ctx.fillStyle = base;
            for (let i = 0; i < bins; i++) {
              const top = mid + Math.max(-1, min[i]!) * amp;
              const bot = mid + Math.min(1, max[i]!) * amp;
              ctx.fillRect(xa + i, Math.min(top, bot - 1), 1, Math.max(1, bot - top));
            }
          }
          // Fades
          ctx.strokeStyle = fg;
          ctx.globalAlpha = 0.7 * dim;
          ctx.lineWidth = 1;
          if (c.fadeIn > 0) {
            ctx.beginPath();
            ctx.moveTo(x0, y + h);
            ctx.lineTo(x0 + c.fadeIn * pps, y);
            ctx.stroke();
          }
          if (c.fadeOut > 0) {
            ctx.beginPath();
            ctx.moveTo(x1 - c.fadeOut * pps, y);
            ctx.lineTo(x1, y + h);
            ctx.stroke();
          }
          ctx.globalAlpha = dim;
          ctx.strokeStyle = selected ? accent : base;
          ctx.lineWidth = selected ? 2 : 1;
          ctx.strokeRect(x0 + 0.5, y + 0.5, w - 1, h - 1);
          // Title
          if (w > 36) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(Math.max(x0, 0), y, w, 16);
            ctx.clip();
            ctx.fillStyle = fg;
            ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
            ctx.fillText(c.name, Math.max(x0, 0) + 6, y + 12);
            ctx.restore();
          }
        } else if (lay && c.pitch !== undefined) {
          const y = pitchToY(lay, c.pitch);
          ctx.fillStyle = base;
          ctx.fillRect(x0, y + 0.5, w, Math.max(2, lay.h - 1));
          if (selected) {
            ctx.strokeStyle = fg;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(x0 - 0.5, y, w + 1, Math.max(3, lay.h));
          }
        } else {
          const y = r.top + 6;
          const h = r.height - 13;
          ctx.fillStyle = base;
          ctx.globalAlpha = (track.kind === "chords" ? 0.9 : 0.5 + 0.5 * c.velocity) * dim;
          ctx.fillRect(x0, y, w, h);
          ctx.globalAlpha = dim;
          if (selected) {
            ctx.strokeStyle = fg;
            ctx.lineWidth = 2;
            ctx.strokeRect(x0 + 1, y + 1, w - 2, h - 2);
          }
          if (track.kind === "chords" && w > 22) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(x0, y, w, h);
            ctx.clip();
            ctx.fillStyle = bg;
            ctx.font = "600 12px ui-sans-serif, system-ui, sans-serif";
            ctx.fillText(c.name, x0 + 6, y + h / 2 + 4);
            ctx.restore();
          }
        }
        ctx.globalAlpha = 1;
      }
    }

    // Ruler
    ctx.fillStyle = card;
    ctx.fillRect(0, 0, W, RULER_H);
    ctx.fillStyle = grid;
    ctx.fillRect(0, RULER_H - 1, W, 1);
    ctx.font = "10px ui-monospace, monospace";
    ctx.fillStyle = muted;
    ctx.textBaseline = "alphabetic";
    // Time labels
    const steps = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const tStep = steps.find((s) => s * pps >= 80) ?? 300;
    for (let t = Math.floor(t0 / tStep) * tStep; t <= t1; t += tStep) {
      const x = Math.round(timeToX(t, v)) + 0.5;
      ctx.fillStyle = grid;
      ctx.fillRect(x, 0, 1, 14);
      ctx.fillStyle = muted;
      const m = Math.floor(t / 60);
      const s = t - m * 60;
      ctx.fillText(`${m}:${s < 10 ? "0" : ""}${tStep < 1 ? s.toFixed(2) : s.toFixed(0)}`, x + 3, 11);
    }
    // Bar numbers
    const barEvery = [1, 2, 4, 8, 16, 32].find((n) => barPx * n >= 44) ?? 32;
    const firstBar = Math.floor((t0 - p.beatOffset) / bar) - 1;
    const lastBar = Math.ceil((t1 - p.beatOffset) / bar) + 1;
    for (let b = firstBar; b <= lastBar; b++) {
      if (b % barEvery !== 0) continue;
      const x = Math.round(timeToX(p.beatOffset + b * bar, v)) + 0.5;
      ctx.fillStyle = muted;
      ctx.fillRect(x, 17, 1, 11);
      ctx.fillText(String(b + 1), x + 3, 26);
    }
    // Section markers
    for (const m of p.markers) {
      if (m.time + m.duration < t0 || m.time > t1) continue;
      const x0 = timeToX(m.time, v);
      const w = Math.max(2, m.duration * pps - 2);
      ctx.fillStyle = accent;
      ctx.globalAlpha = 0.22;
      ctx.fillRect(x0, 31, w, 18);
      ctx.globalAlpha = 1;
      ctx.fillStyle = accent;
      ctx.fillRect(x0, 31, 2, 18);
      if (w > 30) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x0, 31, w, 18);
        ctx.clip();
        ctx.fillStyle = fg;
        ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
        ctx.fillText(m.name, x0 + 6, 44);
        ctx.restore();
      }
    }
  }, [controller]);

  const queueDraw = useCallback(() => {
    if (drawQueued.current) return;
    drawQueued.current = true;
    requestAnimationFrame(draw);
  }, [draw]);

  useEffect(queueDraw, [project, selection, pxPerSec, viewW, rows, cs.peaksVersion, queueDraw]);

  // Resize + scroll
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(Math.max(200, Math.floor(el.clientWidth))));
    ro.observe(el);
    setViewW(Math.max(200, Math.floor(el.clientWidth)));
    el.addEventListener("scroll", queueDraw, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", queueDraw);
    };
  }, [queueDraw]);

  // Playhead + follow
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const el = scrollerRef.current;
      const ph = playheadRef.current;
      if (el && ph) {
        const t = engine.currentTime();
        const v = { pxPerSec: live.current.pxPerSec, scrollX: el.scrollLeft };
        const x = timeToX(t, v);
        ph.style.transform = `translateX(${x}px)`;
        ph.style.opacity = x < -2 || x > live.current.viewW + 2 ? "0" : "1";
        if (engine.playing && (x > live.current.viewW * 0.92 || x < 0)) {
          el.scrollLeft = Math.max(0, t * v.pxPerSec - live.current.viewW * 0.1);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  /* ------------------------------- zoom -------------------------------- */

  const zoomTo = useCallback((next: number, anchorX?: number) => {
    const el = scrollerRef.current;
    const clamped = Math.min(MAX_PX, Math.max(MIN_PX, next));
    if (el) {
      const ax = anchorX ?? live.current.viewW / 2;
      const tAnchor = (el.scrollLeft + ax) / live.current.pxPerSec;
      requestAnimationFrame(() => {
        el.scrollLeft = Math.max(0, tAnchor * clamped - ax);
      });
    }
    setPxPerSec(clamped);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomTo(live.current.pxPerSec * Math.exp(-e.deltaY * 0.0025), e.clientX - rect.left);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomTo]);

  /* ------------------------------ actions ------------------------------ */

  const selectedIds = () => store.getState().selection;

  const doSplit = useCallback(() => {
    const t = engine.currentTime();
    store.commit(
      (p) => {
        const sel = store.getState().selection;
        const ids = sel.length
          ? sel
          : p.tracks.flatMap((tr) => tr.clips.filter((c) => c.start < t && clipEnd(c) > t).map((c) => c.id));
        return ops.splitClipsAt(p, ids, t).project;
      },
    );
  }, [engine, store]);

  const doDuplicate = useCallback(() => {
    store.commit((p) => ops.duplicateClips(p, selectedIds()).project, {
      select: (n) => {
        // select the copies: newest ids are those not present before
        const before = new Set(store.getState().project?.tracks.flatMap((t) => t.clips.map((c) => c.id)));
        return n.tracks.flatMap((t) => t.clips.filter((c) => !before.has(c.id)).map((c) => c.id));
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  const doDelete = useCallback(() => {
    const ids = selectedIds();
    if (ids.length) store.commit((p) => ops.deleteClips(p, ids));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store]);

  const doTranspose = useCallback(
    (n: number) => {
      const ids = selectedIds();
      if (!ids.length) return;
      store.commit((p) => ops.transposeClips(p, ids, n));
      const p = store.getState().project;
      const found = p && ops.findClip(p, ids[0]!);
      if (found && found.clip.kind === "event" && found.clip.pitch !== undefined) {
        void engine.preview(found.track.synth, found.clip.pitch);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, engine],
  );

  const doNudge = useCallback(
    (dir: -1 | 1) => {
      const p = store.getState().project;
      if (!p) return;
      const step = snapStep(p.snap, p.bpm, p.beatsPerBar) || beatSeconds(p.bpm) / 4;
      const ids = selectedIds();
      if (ids.length) store.commit((q) => ops.moveClips(q, ids, dir * step));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store],
  );

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === "z") {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
      } else if (mod && k === "y") {
        e.preventDefault();
        store.redo();
      } else if (mod && k === "d") {
        e.preventDefault();
        doDuplicate();
      } else if (mod && k === "a") {
        e.preventDefault();
        store.select(store.getState().project?.tracks.flatMap((t) => t.clips.map((c) => c.id)) ?? []);
      } else if (mod && k === "s") {
        e.preventDefault();
        void controller.saveNow();
      } else if (!mod && k === " ") {
        e.preventDefault();
        if (engine.playing) engine.pause();
        else void engine.play();
      } else if (!mod && (k === "delete" || k === "backspace")) {
        e.preventDefault();
        doDelete();
      } else if (!mod && k === "s") {
        doSplit();
      } else if (!mod && k === "escape") {
        store.select([]);
      } else if (!mod && k === "arrowleft") {
        e.preventDefault();
        doNudge(-1);
      } else if (!mod && k === "arrowright") {
        e.preventDefault();
        doNudge(1);
      } else if (!mod && k === "arrowup") {
        e.preventDefault();
        doTranspose(e.shiftKey ? 12 : 1);
      } else if (!mod && k === "arrowdown") {
        e.preventDefault();
        doTranspose(e.shiftKey ? -12 : -1);
      } else if (!mod && (k === "=" || k === "+")) {
        zoomTo(live.current.pxPerSec * 1.25);
      } else if (!mod && k === "-") {
        zoomTo(live.current.pxPerSec / 1.25);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [controller, engine, store, doDelete, doDuplicate, doNudge, doSplit, doTranspose, zoomTo]);

  /* ------------------------------ pointer ------------------------------ */

  const local = (e: { clientX: number; clientY: number }) => {
    const r = wrapRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 || rename) return;
    const { x, y } = local(e);
    const v = viewport();
    wrapRef.current!.setPointerCapture(e.pointerId);
    if (y < RULER_H) {
      engine.seek(Math.max(0, xToTime(x, v)));
      dragRef.current = { kind: "scrub" };
      return;
    }
    const hit = hitTestClip(live.current.rows, x, y, v);
    if (!hit) {
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      dragRef.current = { kind: "marquee", x0: x, y0: y, x1: x, y1: y, base: additive ? selectedIds() : [] };
      if (!additive) store.select([]);
      return;
    }
    const toggle = e.shiftKey || e.metaKey || e.ctrlKey;
    const wasSelected = selectedIds().includes(hit.clipId);
    if (toggle) store.select([hit.clipId], "toggle");
    else if (!wasSelected) store.select([hit.clipId]);
    const ids = selectedIds();
    if (!ids.includes(hit.clipId)) return; // toggled off
    const found = ops.findClip(live.current.project, hit.clipId)!;
    if (found.clip.kind === "event" && found.clip.pitch !== undefined && found.track.kind === "midi") {
      void engine.preview(found.track.synth, found.clip.pitch, found.clip.velocity);
    }
    dragRef.current = {
      kind: "clip",
      mode: hit.zone === "body" ? "move" : hit.zone,
      anchorId: hit.clipId,
      ids,
      startX: x,
      startY: y,
      anchorStart: found.clip.start,
      anchorTrackId: found.track.id,
      started: false,
      wasSelected,
      shift: toggle,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const { x, y } = local(e);
    const v = viewport();
    const d = dragRef.current;
    if (!d) {
      const hit = y >= RULER_H ? hitTestClip(live.current.rows, x, y, v) : null;
      wrapRef.current!.style.cursor = !hit ? (y < RULER_H ? "pointer" : "default") : hit.zone === "body" ? "grab" : "ew-resize";
      return;
    }
    const p = live.current.project;
    if (d.kind === "scrub") {
      engine.seek(Math.max(0, xToTime(x, v)));
    } else if (d.kind === "marquee") {
      d.x1 = x;
      d.y1 = y;
      setMarquee({ x: Math.min(d.x0, x), y: Math.min(d.y0, y), w: Math.abs(x - d.x0), h: Math.abs(y - d.y0) });
      const ids = clipsInRect(live.current.rows, xToTime(d.x0, v), xToTime(x, v), d.y0, y);
      store.select([...new Set([...d.base, ...ids])]);
    } else {
      if (!d.started) {
        if (Math.abs(x - d.startX) < 3 && Math.abs(y - d.startY) < 3) return;
        d.started = true;
        store.beginGesture();
        wrapRef.current!.style.cursor = d.mode === "move" ? "grabbing" : "ew-resize";
      }
      if (d.mode === "move") {
        const raw = d.anchorStart + (x - d.startX) / v.pxPerSec;
        const dt = snapTime(Math.max(0, raw), p) - d.anchorStart;
        const row = rowAt(live.current.rows, y);
        const target = row && row.track.id !== d.anchorTrackId ? row.track.id : undefined;
        let semis = 0;
        const anchorRow = live.current.rows.find((r) => r.track.id === d.anchorTrackId);
        if (anchorRow?.track.kind === "midi" && (!row || row.track.id === d.anchorTrackId)) {
          semis = Math.round(-(y - d.startY) / PITCH_DRAG_PX);
        }
        store.updateGesture((base) => {
          let n = ops.moveClips(base, d.ids, dt, target);
          if (semis) n = ops.transposeClips(n, d.ids, semis);
          return n;
        });
      } else {
        const time = snapTime(xToTime(x, v), p);
        store.updateGesture((base) => ops.resizeClip(base, d.anchorId, d.mode as "left" | "right", time));
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setMarquee(null);
    try {
      wrapRef.current?.releasePointerCapture(e.pointerId);
    } catch {
      /* not captured */
    }
    if (!d) return;
    if (d.kind === "clip") {
      if (d.started) store.endGesture();
      else if (!d.shift && d.wasSelected && d.ids.length > 1) store.select([d.anchorId]);
      if (wrapRef.current) wrapRef.current.style.cursor = "default";
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const { x, y } = local(e);
    if (y < RULER_H) return;
    const v = viewport();
    const hit = hitTestClip(live.current.rows, x, y, v);
    if (hit) {
      const f = ops.findClip(live.current.project, hit.clipId);
      if (f) setRename({ id: hit.clipId, x, y, value: f.clip.name });
      return;
    }
    const row = rowAt(live.current.rows, y);
    if (!row || row.track.kind === "audio" || row.track.kind === "chords") return;
    const p = live.current.project;
    const t = Math.max(0, snapTime(xToTime(x, v), p));
    const step = snapStep(p.snap, p.bpm, p.beatsPerBar) || beatSeconds(p.bpm) / 4;
    let pitch: number | undefined;
    if (row.track.kind === "midi") pitch = yToPitch(midiLayout(row.track, row.top, row.height), y);
    else if (row.track.lane === "bass") pitch = undefined;
    const dur = row.track.kind === "midi" ? Math.max(step, beatSeconds(p.bpm) / 2) : 0.1;
    store.commit((q) => ops.addEventClip(q, { trackId: row.track.id, start: t, duration: dur, pitch }).project, {
      select: (n) => {
        const tr = n.tracks.find((tt) => tt.id === row.track.id);
        const added = tr?.clips.find((c) => c.start === t && !live.current.project.tracks.find((o) => o.id === tr.id)?.clips.some((o) => o.id === c.id));
        return added ? [added.id] : null;
      },
    });
    if (pitch !== undefined) void engine.preview(row.track.synth, pitch);
  };

  /* ------------------------------- render ------------------------------ */

  const hasSelection = selection.length > 0;
  const midiSelected = selection.some((id) => {
    const f = ops.findClip(project, id);
    return f?.clip.kind === "event" && f.clip.pitch !== undefined;
  });
  const addFileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-background px-3 py-1.5">
        <Tool label="Split at playhead (S)" onClick={doSplit} icon={<Scissors className="size-4" />} text="Split" />
        <Tool label="Duplicate (Ctrl+D)" onClick={doDuplicate} disabled={!hasSelection} icon={<Copy className="size-4" />} text="Duplicate" />
        <Tool label="Delete (Del)" onClick={doDelete} disabled={!hasSelection} icon={<Trash2 className="size-4" />} text="Delete" />
        {midiSelected ? (
          <div className="flex items-center gap-1" aria-label="Transpose selected notes">
            <Button type="button" size="icon-sm" variant="ghost" aria-label="Down a semitone" onClick={() => doTranspose(-1)}>-1</Button>
            <Button type="button" size="icon-sm" variant="ghost" aria-label="Up a semitone" onClick={() => doTranspose(1)}>+1</Button>
            <Button type="button" size="icon-sm" variant="ghost" aria-label="Down an octave" onClick={() => doTranspose(-12)}>-8va</Button>
            <Button type="button" size="icon-sm" variant="ghost" aria-label="Up an octave" onClick={() => doTranspose(12)}>+8va</Button>
          </div>
        ) : null}
        <span className="mx-1 h-5 w-px bg-border" />
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Magnet className="size-4" />
          <span className="sr-only">Snap</span>
          <select
            value={project.snap}
            onChange={(e) => store.commit((p) => ops.setSnap(p, e.target.value as SnapMode))}
            className="rounded-md border border-border bg-background px-1.5 py-1 text-xs text-foreground"
          >
            {SNAP_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <span className="mx-1 h-5 w-px bg-border" />
        <Tool label="Add audio track from a file" onClick={() => addFileRef.current?.click()} icon={<Plus className="size-4" />} text="Audio" />
        <Tool
          label="Add an empty MIDI track"
          onClick={() => store.commit((p) => ops.addTrack(p, { name: `MIDI ${p.tracks.filter((t) => t.kind === "midi").length + 1}`, kind: "midi", color: "var(--lane-chords)" }).project)}
          icon={<Plus className="size-4" />}
          text="MIDI"
        />
        <input
          ref={addFileRef}
          type="file"
          accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void controller.addAudioFile(f, engine.currentTime());
            e.target.value = "";
          }}
        />
        <div className="ml-auto flex items-center gap-1">
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Zoom out" onClick={() => zoomTo(pxPerSec / 1.25)}>
            <ZoomOut className="size-4" />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Zoom in" onClick={() => zoomTo(pxPerSec * 1.25)}>
            <ZoomIn className="size-4" />
          </Button>
        </div>
      </div>

      {/* tracks */}
      <div className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-background">
        <div className="flex" style={{ height: totalH }}>
          <div className="sticky left-0 z-20 shrink-0 border-r border-border bg-card" style={{ width: HEADER_W }}>
            <div className="flex items-end border-b border-border px-3 pb-1.5 text-[10px] uppercase tracking-wider text-muted-foreground" style={{ height: RULER_H }}>
              {project.tracks.length} tracks
            </div>
            {project.tracks.map((t) => (
              <TrackHeader key={t.id} track={t} height={rowHeight(t)} controller={controller} />
            ))}
          </div>
          <div ref={scrollerRef} className="relative min-w-0 flex-1 overflow-x-auto overflow-y-hidden" style={{ height: totalH }}>
            <div className="pointer-events-none absolute left-0 top-0 h-px" style={{ width: totalW }} />
            <div
              ref={wrapRef}
              className="sticky left-0 top-0 touch-none select-none"
              style={{ width: viewW, height: totalH }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onDoubleClick={onDoubleClick}
            >
              <canvas ref={canvasRef} className="absolute left-0 top-0" style={{ width: viewW, height: totalH }} aria-label="Arrangement timeline" />
              <div ref={playheadRef} className="pointer-events-none absolute top-0 z-10 w-0.5 bg-playhead will-change-transform" style={{ height: totalH, left: -1 }} />
              {marquee ? (
                <div
                  className="pointer-events-none absolute border border-primary bg-primary/10"
                  style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
                />
              ) : null}
              {rename ? (
                <input
                  autoFocus
                  value={rename.value}
                  maxLength={80}
                  onChange={(e) => setRename({ ...rename, value: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      store.commit((p) => ops.renameClip(p, rename.id, rename.value));
                      setRename(null);
                    }
                    if (e.key === "Escape") setRename(null);
                    e.stopPropagation();
                  }}
                  onBlur={() => setRename(null)}
                  onPointerDown={(e) => e.stopPropagation()}
                  className="absolute z-20 w-44 rounded-md border border-primary bg-card px-2 py-1 text-xs text-foreground shadow-lg outline-none"
                  style={{ left: Math.min(rename.x, viewW - 190), top: rename.y }}
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Tool({ label, text, icon, onClick, disabled }: { label: string; text: string; icon: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <Button type="button" size="sm" variant="ghost" title={label} aria-label={label} disabled={disabled} onClick={onClick} className="h-8 gap-1.5 px-2 text-xs">
      {icon}
      {text}
    </Button>
  );
}

export type { TrackRow };
