export function toMono(channels: Float32Array[]): Float32Array {
  const first = channels[0];
  if (!first) return new Float32Array(0);
  if (channels.length === 1) return Float32Array.from(first);
  const n = first.length;
  const out = new Float32Array(n);
  for (const ch of channels) for (let i = 0; i < n; i++) out[i]! += ch[i] ?? 0;
  const inv = 1 / channels.length;
  for (let i = 0; i < n; i++) out[i]! *= inv;
  return out;
}

/** RBJ biquad lowpass, run forward over `x` (zero-phase not needed for analysis). */
export function lowpass(x: Float32Array, fc: number, sr: number, q = Math.SQRT1_2): Float32Array {
  const w0 = (2 * Math.PI * fc) / sr;
  const cosw = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const a0 = 1 + alpha;
  const b0 = (1 - cosw) / 2 / a0;
  const b1 = (1 - cosw) / a0;
  const b2 = b0;
  const a1 = (-2 * cosw) / a0;
  const a2 = (1 - alpha) / a0;
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i]!;
    const yi = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    y[i] = yi;
    x2 = x1;
    x1 = xi;
    y2 = y1;
    y1 = yi;
  }
  return y;
}

/** Anti-aliased resample: 4th-order Butterworth lowpass then linear interpolation. */
export function resample(x: Float32Array, from: number, to: number): Float32Array {
  if (Math.abs(from - to) < 1) return x;
  let src = x;
  if (to < from) {
    const fc = to * 0.45;
    src = lowpass(lowpass(x, fc, from, 0.5412), fc, from, 1.3066);
  }
  const ratio = from / to;
  const n = Math.max(1, Math.floor(src.length / ratio));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = i * ratio;
    const a = Math.floor(p);
    const f = p - a;
    out[i] = (src[a] ?? 0) * (1 - f) + (src[Math.min(src.length - 1, a + 1)] ?? 0) * f;
  }
  return out;
}

export function normalizePeak(x: Float32Array): Float32Array {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]!));
  if (m < 1e-9) return x;
  const out = new Float32Array(x.length);
  const g = 1 / m;
  for (let i = 0; i < x.length; i++) out[i] = x[i]! * g;
  return out;
}

export function median(a: ArrayLike<number>): number {
  const n = a.length;
  if (!n) return 0;
  const s = Float64Array.from(a).sort();
  return n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

export function percentile(a: ArrayLike<number>, p: number): number {
  const n = a.length;
  if (!n) return 0;
  const s = Float64Array.from(a).sort();
  return s[Math.min(n - 1, Math.max(0, Math.floor(p * (n - 1))))]!;
}

export function movingAverage(x: Float32Array, radius: number): Float32Array {
  const n = x.length;
  const out = new Float32Array(n);
  const pre = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) pre[i + 1] = pre[i]! + x[i]!;
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - radius);
    const b = Math.min(n, i + radius + 1);
    out[i] = (pre[b]! - pre[a]!) / (b - a);
  }
  return out;
}

/** Running median over a centered window (odd width). */
export function movingMedian(x: Float32Array, radius: number): Float32Array {
  const n = x.length;
  const out = new Float32Array(n);
  const win: number[] = [];
  for (let i = 0; i < n; i++) {
    win.length = 0;
    for (let j = Math.max(0, i - radius); j <= Math.min(n - 1, i + radius); j++) win.push(x[j]!);
    win.sort((a, b) => a - b);
    out[i] = win[win.length >> 1]!;
  }
  return out;
}

export function std(x: ArrayLike<number>): number {
  const n = x.length;
  if (n < 2) return 0;
  let m = 0;
  for (let i = 0; i < n; i++) m += x[i]!;
  m /= n;
  let v = 0;
  for (let i = 0; i < n; i++) v += (x[i]! - m) ** 2;
  return Math.sqrt(v / n);
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const midiToHz = (m: number): number => 440 * 2 ** ((m - 69) / 12);
export const hzToMidi = (f: number): number => 69 + 12 * Math.log2(f / 440);

/** Cosine similarity of two vectors. */
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let d = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na < 1e-12 || nb < 1e-12 ? 0 : d / Math.sqrt(na * nb);
}

export function pearson(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= n;
  mb /= n;
  let d = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    d += (a[i]! - ma) * (b[i]! - mb);
    va += (a[i]! - ma) ** 2;
    vb += (b[i]! - mb) ** 2;
  }
  return va < 1e-12 || vb < 1e-12 ? 0 : d / Math.sqrt(va * vb);
}
