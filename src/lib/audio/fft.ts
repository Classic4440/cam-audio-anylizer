/** In-place radix-2 FFT. `re`/`im` length must be a power of two. */
export function fftRadix2(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  let j = 0;
  for (let i = 0; i < n; i++) {
    if (i < j) {
      const tr = re[i]!;
      const ti = im[i]!;
      re[i] = re[j]!;
      im[i] = im[j]!;
      re[j] = tr;
      im[j] = ti;
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) {
      j -= m;
      m >>= 1;
    }
    j += m;
  }

  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const step = (-2 * Math.PI) / size;
    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < half; k++) {
        const angle = step * k;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);
        const even = i + k;
        const odd = even + half;
        const or_ = re[odd]!;
        const oi = im[odd]!;
        const tr = wr * or_ - wi * oi;
        const ti = wr * oi + wi * or_;
        re[odd] = re[even]! - tr;
        im[odd] = im[even]! - ti;
        re[even] += tr;
        im[even] += ti;
      }
    }
  }
}

export function makeHann(size: number): Float32Array {
  const w = new Float32Array(size);
  if (size <= 1) return w;
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

export function binHz(bin: number, sampleRate: number, fftSize: number): number {
  return (bin * sampleRate) / fftSize;
}

export function hzBin(hz: number, sampleRate: number, fftSize: number): number {
  return Math.round((hz * fftSize) / sampleRate);
}
