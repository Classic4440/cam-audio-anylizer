# Tempo detection notes (hip-hop / trap tuning)

## Problem
Trap grooves (3-3-2 kick patterns, triplet hi-hats) produce a strong autocorrelation peak at the
dotted-eighth / triplet pulse, which sits 4:3 or 3:2 away from the real beat. The old picker
sometimes chose it (FE!N read 99 BPM instead of 74/148; No Bystanders 99 instead of ~144).

## Change (src/lib/audio/dsp/tempo.ts)
- Autocorrelation now reaches 8 s (was ~1.3 s) so bar-level repetition can be measured.
- Candidate score = ac(1 beat) + 0.3*ac(2 beats) + 0.3*ac(4 beats) + 1.0*ac(8 beats), times a
  log-normal prior (centre 120 BPM, width widened from 0.7 to 1.0 octave).
  A true beat is supported by its bar and two-bar repetition; a dotted pulse is not.

## Evidence
Reference values came from Mixxx's analyser (user-supplied screenshot) plus a few published values.
Mixxx is another algorithm, not ground truth. Octave (half/double) answers count as agreeing.

| Track | Reference | Old | New |
|---|---|---|---|
| 2040 | 150 | 150 | 150 |
| No Love | 154.1 | 103.25 | 154.25 |
| Choppa | 102.7 | 103 | 103 |
| Merch Madness | 77.5 | 155 | 155 (double time) |
| Went Hollywood | 170.1 | 112.5 | 84.85 (half time) |
| Therapy Session | 144.0 | 95.75 | 144 |
| FE!N | 74 / 148 | 99.25 | 148 |
| No Bystanders | 144 (published) | 99.25 | 147 |
| We Paid | 135.0 | 136 | 135 |
| beibs in the trap | 119.0 | 119 | 119 |

Old: 5/10 within an octave. New: 10/10.

## Caveats
- Weights were tuned on these 10 tracks plus 5 "agreement anchors" and the repo's 9 synthetic tempo
  tests, so expect some overfit. Many nearby weight settings scored the same, which is reassuring.
- Late Checkout moved 120 -> 90. Two earlier analysers said 120; no published BPM found. Unresolved.
- Half/double time is still a convention call (Merch Madness 77.5 vs 155). `bpmCandidates` lists both.
- Key detection was NOT changed. Three tracks are a fifth off Mixxx (Choppa, We Paid, Therapy Session).
  Raising bass weight, or adding YIN bass-note evidence, did not fix them reliably (scripts/key-exp.ts).

## Repro
    node --experimental-strip-types scripts/bench-tracks.ts out.json wav/*.wav
    node --experimental-strip-types scripts/tempo-exp.ts   # weight search
