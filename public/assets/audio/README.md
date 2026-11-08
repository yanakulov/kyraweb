# Audio synthesizers

Munt / libmt32emu, LGPL-2.1-or-later; WebAssembly bridge © 2026 not-hanjo-mei,
LGPL-3.0-or-later. The combined module is distributed under LGPL-3.0-or-later.
See COPYING.LESSER.txt and COPYING.GPL3.txt (and Munt's COPYING.txt).

`mt32emu.js` and the unmodified `mt32emu.wasm` are from
https://github.com/not-hanjo-mei/mt32-web/tree/f33e5f3045d42737373ddebea2661b56661ebeb9 .
`mt32-source.tar.gz` is the complete corresponding source from that revision.
It includes Munt's authors, licenses, C bridge and `tools/build-mt32emu.ps1`.
Use Emscripten 3.1.73+ to rebuild. The only loader modification is an appended
`export default createMt32EmuModule` for bundling into the AudioWorklet.
The separate WASM file may be replaced with a compatible modified build.
`extractor/vendor_mt32.mjs` restores the pinned files and verifies Git blob hashes.

ROM files are not included, downloaded or uploaded. Users provide their own
compatible MT-32 or CM-32L Control and PCM ROM pair locally in Settings.

## AdLib

`adlib.wasm` uses AdPlug's Westwood ADL driver and Nuked OPL3 in OPL2-compatible
mode. The driver runs the original DOS AdLib music programs at 72 Hz. The
emulator and driver are licensed under LGPL 2.1 or later. The source, license
and build instructions are included in `adlib-source.tar.gz`.

## TinySoundFont

`tsf.js` and `tsf.wasm` are from the same pinned mt32-web revision above.
TinySoundFont is Copyright (C) Bernhard Schelling, MIT (TinySoundFont-LICENSE.txt).
The C WebAssembly bridge is Copyright (C) 2026 not-hanjo-mei, LGPL-3.0-or-later.
Complete source and `tools/build-tsf.ps1` are included in mt32-source.tar.gz.
The loader's only modification is an appended ESM export. Restore the files with
`node extractor/vendor_soundfont.mjs`.

## GeneralUser GS

GeneralUser GS 2.0.3 by S. Christian Collins is available in Settings as an
optional 32 MB SoundFont. It is fetched only after selecting the bank.
The unmodified bank and [license](soundfonts/LICENSE.txt) come from
https://github.com/mrbumpy409/GeneralUser-GS/tree/684543d5e5efaef08d02be50dcda8d552478fa60
(Git blob `298b552d2e9d1307e03e5c5c99d2c046aaed9ec3`).
The [author's site](https://www.schristiancollins.com/generaluser) has more details.
SoundFont playback uses the bank's samples with an approximate GM arrangement.
