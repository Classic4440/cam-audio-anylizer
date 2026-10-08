import { useEffect, useRef } from "react";
import { getTimelineEngine } from "@/lib/daw/timeline-engine";

export function Spectrum({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const bins = new Uint8Array(512);
    let raf = 0;

    const tick = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      if (active) getTimelineEngine().getMasterSpectrum(bins);
      else bins.fill(0);

      const n = 96;
      const gap = 2;
      const barW = Math.max(2, (w - gap * (n - 1)) / n);
      const step = Math.max(1, Math.floor(bins.length / n));
      for (let i = 0; i < n; i++) {
        let v = 0;
        for (let k = 0; k < step; k++) v += bins[i * step + k] ?? 0;
        v /= step * 255;
        const bh = Math.max(2, v * h * 0.92);
        const x = i * (barW + gap);
        ctx.fillStyle = "color-mix(in oklab, var(--color-primary) 70%, transparent)";
        ctx.fillRect(x, h - bh, barW, bh);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);

  return (
    <div className="h-16 border-t border-border bg-background px-4 py-2 md:h-20 md:px-6">
      <canvas ref={canvasRef} className="h-full w-full" />
    </div>
  );
}
