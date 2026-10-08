/** Minimal RIFF/WAVE encoder (PCM 16/24-bit or 32-bit float). Pure, so it is testable and worker-safe. */
export function encodeWav(
  channels: Float32Array[],
  sampleRate: number,
  bits: 16 | 24 | 32 = 16,
): Uint8Array {
  const nCh = Math.max(1, channels.length);
  const length = channels[0]?.length ?? 0;
  const bytes = bits / 8;
  const dataSize = length * nCh * bytes;
  const out = new Uint8Array(44 + dataSize);
  const dv = new DataView(out.buffer);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  dv.setUint32(4, 36 + dataSize, true);
  str(8, "WAVE");
  str(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, bits === 32 ? 3 : 1, true);
  dv.setUint16(22, nCh, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * nCh * bytes, true);
  dv.setUint16(32, nCh * bytes, true);
  dv.setUint16(34, bits, true);
  str(36, "data");
  dv.setUint32(40, dataSize, true);

  let o = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < nCh; c++) {
      const raw = channels[c]?.[i] ?? 0;
      if (bits === 32) {
        dv.setFloat32(o, raw, true);
      } else {
        const x = raw > 1 ? 1 : raw < -1 ? -1 : raw;
        if (bits === 16) {
          dv.setInt16(o, Math.round(x < 0 ? x * 0x8000 : x * 0x7fff), true);
        } else {
          const v = Math.round(x < 0 ? x * 0x800000 : x * 0x7fffff);
          dv.setUint8(o, v & 0xff);
          dv.setUint8(o + 1, (v >> 8) & 0xff);
          dv.setUint8(o + 2, (v >> 16) & 0xff);
        }
      }
      o += bytes;
    }
  }
  return out;
}

export function channelsOf(buf: {
  numberOfChannels: number;
  getChannelData(c: number): Float32Array;
}): Float32Array[] {
  const out: Float32Array[] = [];
  for (let c = 0; c < buf.numberOfChannels; c++) out.push(buf.getChannelData(c));
  return out;
}
