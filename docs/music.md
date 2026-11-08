# Original DOS CD music

**AdLib (OPL2)** is the default music device. Open the book to allow browser
audio. The original Westwood music programs from `DAT/ADL.PAK` run at 72 Hz
through AdPlug's driver and Nuked OPL3 in OPL2-compatible mode. Banks load as
needed. This device needs neither a Roland ROM nor a SoundFont.

The default levels are 50% music, 25% effects, and 60% voices. Existing volume
and mute preferences are preserved.

For the additional TinySoundFont/SF2 renderer, optional GeneralUser GS bank, import
workflow and hardware-emulation limitations, see [SoundFont setup](soundfonts.ru.md).
It is a distinct sample synthesizer with approximate MT-32-to-GM mapping, not
an emulator of named Yamaha/Kawai/Casio/Creative devices. Munt remains available.

The **Roland MT-32 / CM-32L** device uses **Munt / libmt32emu** to synthesize
the original XMIDI from `DAT/XMI.PAK` in real time.

## Roland setup

### Automatic local setup

On this machine, the compatible pair is installed in ignored `.local/mt32/` as
`MT32_CONTROL.ROM` and `MT32_PCM.ROM`. `npm run dev` and `npm run preview` discover
it automatically on localhost. Select **Roland MT-32 / CM-32L** in Settings
to use the pair. A saved Roland choice falls back to AdLib if its ROMs are missing.

The Vite plugin serves only fixed filenames to loopback, same-origin clients;
remote/LAN and cross-origin requests are rejected. Direct `.local/` filesystem
serving is blocked. No firmware is copied to `public/`, `dist/` or Git, nor fetched
from GitHub at runtime. Public/static deployments still use manual local import.
The firmware source's redistribution permission is not established; this local
setup is not permission to include it in a published build.

### Manual import (including public deployments)

Open the book's **Settings**, import two files together: your matching MT-32 or
CM-32L **Control ROM** (64/128 KiB) and **PCM ROM** (512/1024 KiB). Munt validates
their contents and compatibility. Filename changes do not make invalid ROMs valid.
These ROMs are not part of the GOG installation. Obtain/use your own authorized
copies. No firmware is included or automatically downloaded.

Import enables music. Use **Test music**, the device selector and volume slider.
ROMs stay in IndexedDB on this browser/device; they are never uploaded or embedded
in saved chapters. **Remove ROMs** deletes the stored pair. Blocked storage permits
session-only playback with a warning. Invalid replacement imports preserve the
previous working device and ROM pair. An initial user gesture is required by
browser autoplay rules. HTTPS or localhost and AudioWorklet/WebAssembly are required.

The saved device and volume choices are independent of walking speed and chapter
saves. In-game Options and loading pause music. Test music
temporarily auditions the title without advancing the game. Hidden tabs suspend
audio. Closing the settings stops the test. Disabling music closes the device.

## Import original resources

```powershell
npm run assets:music -- "C:\Program Files\GOG Galaxy\Games\Legend of Kyrandia"
```

`extractor/music.mjs` accepts the installation or DAT directory. It preserves
all ten XMI and ten ADL banks as gzip with original byte lengths and SHA-256
hashes in `public/assets/music/manifest.json`. The game loads each bank on demand.

## Playback

- `adlib-worklet.ts`, `adlib.ts`: the Westwood driver runs the selected ADL track
  through OPL2-compatible synthesis. The music gain and fades run in the worklet.
- `src/engine/audio/xmidi.ts`: bounded IFF parsing, additive delays, VLQ note
  durations, 120-Hz timing, explicit note release and four-deep FOR/NEXT loops.
  A zero-time loop has a finite execution budget and stops with an error.
- `mt32-worklet.ts`, `mt32.ts`: Munt renders stereo at the AudioContext sample
  rate inside an AudioWorklet, subdividing render quanta at event boundaries.
  INTRO track 0 programs the original timbres before the requested score starts.
  This silent initialization is rendered at up to 32x speed instead of introducing
  fourteen seconds of silence. Ready is reported after timbre setup completes.
- `miles.ts`: Roland SysEx/checksums and Miles controllers, pitch-bend reset and
  note cleanup. `midiSources.ts` adds Miles channel locking/protection and restores
  a music part's controllers when an effect releases its borrowed channel.
- `cues.ts`, original EMC `0x18`, `WorldRoom.entryMusic` and `opening.json` select
  the original scores. Intro sections start INTRO tracks 2/3/4/5. The extra
  AkulaFlow logo continues the preceding music rather than adding an invented cue.

Reference semantics: ScummVM `audio/midiparser_xmidi.cpp`, `audio/miles_midi.cpp`,
`engines/kyra/sound/sound_pc_midi.cpp`, `sound.cpp`, `resource/staticres.cpp` and
`devtools/create_kyradat/resources/lok_dos.h` (GPL-3.0-or-later).

## Scope and verification

Music is connected to the intro and the implemented rooms through the original
EMC commands. Saves restart a room-appropriate cue. Intro cue boundaries follow
the web scene cuts. Original English CD speech loads separately by scene.

`npm test` checks every track and source hash (1120 sequences), timing, loops,
note release, Miles messages, original mappings, ROM input bounds and the real
Munt WASM rejection of fabricated ROMs. `tests/browser/audio.html` exercises real
AudioWorklet/WASM loading, invalid-ROM cleanup and an optional local-ROM signal
test. With the local compatible pair, the real title score produced peak 0.4212
and RMS 0.1075 over eight seconds in a direct WASM render. Chromium's live
AudioWorklet/AudioContext path produced nonzero output after 613 ms from activation.
This verifies actual PCM output, not an audible comparison against physical
Roland hardware. No physical-hardware comparison has been performed.

## Emulator licensing and rebuilding

`public/assets/audio/README.md` documents the pinned build and provenance. Munt
is LGPL-2.1-or-later; the WebAssembly C bridge is LGPL-3.0-or-later. The complete
corresponding source, build recipe, authors and license texts ship alongside the
separate replaceable WASM in `mt32-source.tar.gz`. The loader's only source change
is an appended ESM export. Restore the pinned artifacts with
`node extractor/vendor_mt32.mjs`; rebuild with Emscripten using the included recipe.
AdPlug and Nuked OPL3 are LGPL-2.1-or-later. Rebuild the AdLib module with Zig
using the source and instructions in `adlib-source.tar.gz`.

The size check measures the whole distribution, optional source archive and book
model separately. Shipping LGPL source does not mean fetching it during gameplay.

## Sound effects

Original SFX are XMIDI tracks in the same XMI files, not generic browser beeps.
`midiPlayback.ts` merges music and up to three effect sequences on the same sample
clock, rendering the synth once. A fourth simultaneous effect is dropped like in
the original MIDI backend. CC110 maps effect channels 10–12 onto native MT-32
parts 1–8; CC111 protects music parts. A borrowed part's current notes can be
lost, as on the original finite-part device, but the score keeps advancing and
its controllers/program/pitch are restored when the effect finishes.

Implemented triggers: EMC `0x17`, DAT `FFB0`/probabilistic `FFB4`, intro sequence
cues, taking/exchanging/storing items, rejected drops, bounce and landing. Cues
follow game/intro time. Menus freeze them, demo loops suppress intro effects,
and skipped intervals do not burst old sounds. Bank/scene transitions cancel
obsolete effects and pending requests.

Effects have independent enabled/volume controls in Settings and work with music
off. Music fades affect only the music source. With a Roland ROM pair selected,
Munt renders the original tracks live using the timbres uploaded by `INTRO` track 0.
With a SoundFont or without a ROM pair, a compact CM-32L recording of the same
effects plays independently of the music bank. It loads after the first audio
gesture. `extractor/render_sfx.ts` builds it from the game's XMIDI tracks using
Munt, a locally supplied CM-32L ROM pair and FFmpeg. The recorded bank contains
rendered effects and cue offsets. Firmware stays local.

Tests cover native-part assignment, protection, source cleanup, sample ordering,
three-slot saturation, independent levels, game input callbacks, DAT operands
without audio, and one-shot drops at 30/60/144 Hz. With the private ROM pair,
pickup/drop and music plus two effects produce nonzero WASM PCM. Chromium's real
AudioWorklet also verified the original pickup SFX with music off (RMS 0.01390).
