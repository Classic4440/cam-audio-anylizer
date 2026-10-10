# cam-audio-anylizer

## Studio + AudioMass editor

The top bar switches between the **Studio** (analysis + arrangement) and the **Editor**, which is
[AudioMass](https://github.com/pkalogiros/audiomass) (MIT) embedded from `public/audiomass/`.

- Studio → Editor: **Edit mix** in the project bar bounces the mix and opens it in the editor.
- Editor → Studio: **Analyse in Studio** (new project) or **Add as track** (open project).
- Code: `src/components/editor/`, `src/components/app-nav.tsx`, `src/lib/editor/`. See `public/audiomass/LANES-NOTES.md`
  for the changes made to the vendored copy.
