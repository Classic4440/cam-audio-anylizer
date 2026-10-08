# LANES v2

LANES is now an editable, saved-in-your-browser studio instead of a read-only analyser.

## What changed

**Projects (saved locally, nothing uploaded).** Everything lives in your browser's IndexedDB: the project, the original audio, the analysis and a waveform cache. Refreshing the page reopens the last project. New, Open, Save (Ctrl+S, plus autosave), Save as, Rename, Delete, and a `.lanes.json` project file (edits + analysis, no audio; missing audio can be relinked).

**Timeline.** Time and bar rulers, zoom (buttons, `+`/`-`, Ctrl+wheel), playhead you can click/drag, per-track rows with mute/solo/volume/pan/meters. Clips: click to select, shift-click or drag a box to multi-select, drag to move (also between compatible tracks), drag edges to trim, `S` split at the playhead, `Ctrl+D` duplicate, `Del` delete, double-click to rename, arrows to nudge, full undo/redo. Snap: off, 1/4, 1/2, 1 beat, 1 bar, anchored on the (editable) BPM and first beat.

**Playback.** One engine drives the playhead and the audio. The same graph is used to export, so a bounce matches what you hear.

**Better analysis** (runs in a Web Worker). Log-band onset detection, tempo with a prior and octave handling, dynamic-programming beat tracking with a fitted grid, tuning-aware chroma, key from two profile sets, beat-synchronous chords with Viterbi smoothing (maj/min/7/maj7/min7/sus/dim), 3-vs-4 meter and downbeat from accents plus chord changes, drum hits with bleed rejection, YIN bass notes, bar-level section segmentation. Confidence is shown, alternatives are one click away, and BPM/key/first-beat can all be corrected by hand (a re-analyse keeps your corrections).

**Stems.** "Separate stems" splits the mix into drums / bass / vocals / other (model-free: harmonic/percussive separation + register + stereo position). The four stems add back to the original, the mix is muted, and the lanes are re-read from the stems. Import your own stems with "Audio" or by dropping files.

**MIDI.** "Convert to MIDI tracks" turns the detected drums, bass line and chords into editable, audible MIDI tracks (double-click to add a note, drag vertically to change pitch, arrows to transpose).

**Export.** Mix WAV, one WAV per audio track, selected clips only, `.mid`, project file.

## Deploying to Cloudflare Workers

The repo builds for Vercel by default. Cloudflare builds are detected automatically (`WORKERS_CI` / `CF_PAGES`), or run:

```
npm ci
npm run deploy:cf       # builds with NITRO_PRESET=cloudflare_module, then wrangler deploy
```

The Worker name is pinned to `cam-audio-anylizer` so it updates the existing site. In the Cloudflare dashboard (Workers Builds) use build command `npm run build:cf` and deploy command `npx wrangler deploy --config .output/server/wrangler.json`.

## Testing

```
npm test                                   # 59 tests
npx tsc --noEmit
node --experimental-strip-types scripts/analyze-file.ts song.mp3    # analyse a real file
```

Tests cover edit operations and undo/redo, IndexedDB persistence across a simulated reload, project-file round trip, the real Web Audio graph rendered offline (clip positions, offsets, fades, mute/solo, pan, stem export), MIDI export, DSP accuracy on synthetic music, and stem separation.

Measured on synthetic tracks (old analyser -> new): tempo exact on 25/42 -> 41/42; key 7/24 -> 24/24; chord accuracy 64% -> 100%; kick F-score 81% -> ~99%; snare precision 29% -> 100%.

## Known limits (please read)

- **Not yet clicked through in a real browser.** The environment this was built in has no browser. The interaction logic is covered by tests and the app builds, type-checks and server-renders, but expect to find rough edges in the canvas UI on first use.
- **Accuracy numbers are from synthetic music.** Real recordings are harder. Use `scripts/analyze-file.ts` on tracks whose BPM/key you know and send the results back so the thresholds can be tuned.
- **Stems are signal-processing, not a neural network.** Drums and bass isolate reasonably; "vocals" is the centre-panned mid-range harmonic content, so on mono tracks it also contains other mid-range instruments. A model-based separator can be plugged in through the `StemSeparator` interface in `src/lib/audio/separate.ts`.
- Detected lanes (kick/snare/...) are visual and silent until converted to MIDI.
- Looping, effects/plug-ins, tempo-changing grids, a velocity lane and a full piano-roll window are not implemented.
- The project file does not embed audio.
- Auth/PGlite scaffolding from the original template is untouched but unused by the studio.
