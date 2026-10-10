# AudioMass inside LANES

This folder is an unmodified copy of AudioMass (MIT, (c) 2018-present Pantelis Kalogiros,
https://github.com/pkalogiros/audiomass) with only these changes:

- `index.html`: removed the standalone-site metadata (web manifest, og/twitter tags,
  apple-touch-icon) and retitled it. The scripts it loads are unchanged.
- `ui.js`: the "About" menu item opens https://audiomass.co/about.html instead of `/about.html`
  (which would resolve against the LANES site root).
- Not copied: the marketing page (`about.html`, `about/`), the Go/Python dev servers, the
  appcache/service-worker files, the `*-final`/`*-cache` HTML variants, the prebuilt CSS, and the
  `eq.html` / `sp.html` / `mix.html` dev pages.

LANES loads `/audiomass/index.html` in an iframe (see `src/components/editor/`) and talks to it
through `window.PKAudioEditor`. To upgrade AudioMass, re-copy upstream's `src/` over this folder
and re-apply the two edits above.

Licenses: `LICENSE` and `THIRD_PARTY_NOTICES.md` in this folder must stay with the code.
