/** Reduced waveform: min/max per bucket of source samples. Cheap to store, cache and draw. */
export interface Peaks {
  samplesPerBucket: number;
  sampleRate: number;
  duration: number;
  min: Float32Array;
  max: Float32Array;
}

export function computePeaks(
  channels: Float32Array[],
  sampleRate: number,
  samplesPerBucket = 128,
): Peaks {
  const length = channels[0]?.length ?? 0;
  const n = Math.max(1, Math.ceil(length / samplesPerBucket));
  const min = new Float32Array(n);
  const max = new Float32Array(n);
  for (let b = 0; b < n; b++) {
    const a = b * samplesPerBucket;
    const e = Math.min(length, a + samplesPerBucket);
    let lo = 0;
    let hi = 0;
    for (const ch of channels) {
      for (let i = a; i < e; i++) {
        const v = ch[i] ?? 0;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    min[b] = lo;
    max[b] = hi;
  }
  return { samplesPerBucket, sampleRate, duration: length / sampleRate, min, max };
}

/** Aggregate the peaks between source times [t0,t1] into `bins` columns. */
export function peaksRange(
  p: Peaks,
  t0: number,
  t1: number,
  bins: number,
): { min: Float32Array; max: Float32Array } {
  const min = new Float32Array(bins);
  const max = new Float32Array(bins);
  const bucketsPerSec = p.sampleRate / p.samplesPerBucket;
  const span = Math.max(1e-9, t1 - t0);
  for (let i = 0; i < bins; i++) {
    const a = Math.floor((t0 + (i / bins) * span) * bucketsPerSec);
    const b = Math.max(a + 1, Math.ceil((t0 + ((i + 1) / bins) * span) * bucketsPerSec));
    let lo = 0;
    let hi = 0;
    for (let k = Math.max(0, a); k < b && k < p.min.length; k++) {
      const l = p.min[k]!;
      const h = p.max[k]!;
      if (l < lo) lo = l;
      if (h > hi) hi = h;
    }
    min[i] = lo;
    max[i] = hi;
  }
  return { min, max };
}
