/** Chord voicing with voice leading. Pure, so it is unit-tested without audio. */

export const CHORD_INTERVALS: Record<string, number[]> = {
  maj: [0, 4, 7],
  min: [0, 3, 7],
  "7": [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  min7: [0, 3, 7, 10],
  sus: [0, 5, 7],
  dim: [0, 3, 6],
};

const LOW = 52; // E3
const HIGH = 76; // E5
const CENTRE = 62;

/** All inversions of the chord, each shifted by octaves so its notes land inside LOW..HIGH. */
function candidates(root: number, quality: string): number[][] {
  const base = CHORD_INTERVALS[quality] ?? CHORD_INTERVALS.maj!;
  const out: number[][] = [];
  for (let inv = 0; inv < base.length; inv++) {
    const tones = base.map((iv, i) => root + iv + (i < inv ? 12 : 0)).sort((a, b) => a - b);
    for (let shift = -48; shift <= 60; shift += 12) {
      const v = tones.map((n) => n + shift);
      if (v[0]! >= LOW && v[v.length - 1]! <= HIGH) out.push(v);
    }
  }
  return out;
}

/**
 * Pick the voicing closest to the previous chord (smallest total movement), so a progression
 * moves smoothly instead of jumping between root-position blocks. With no previous chord, pick
 * the voicing centred on middle of the keyboard.
 */
export function voiceChord(prev: number[] | null, root: number, quality: string): number[] {
  const cands = candidates(((root % 12) + 12) % 12, quality);
  if (!cands.length) return (CHORD_INTERVALS[quality] ?? CHORD_INTERVALS.maj!).map((i) => 60 + root + i);
  let best = cands[0]!;
  let bestCost = Infinity;
  for (const v of cands) {
    const mean = v.reduce((a, b) => a + b, 0) / v.length;
    let cost: number;
    if (prev && prev.length) {
      cost = 0;
      // Match each new note to the nearest previous note, plus a penalty for changing the thickness.
      for (const n of v) cost += Math.min(...prev.map((p) => Math.abs(p - n)));
      cost += Math.abs(v.length - prev.length) * 2;
      cost += Math.abs(mean - CENTRE) * 0.15;
    } else {
      cost = Math.abs(mean - CENTRE);
    }
    if (cost < bestCost) {
      bestCost = cost;
      best = v;
    }
  }
  return best;
}
