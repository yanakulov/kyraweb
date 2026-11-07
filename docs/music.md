# Original DOS CD music

For the additional TinySoundFont/SF2 renderer, optional GeneralUser GS bank, import
workflow and hardware-emulation limitations, see [SoundFont setup](soundfonts.ru.md).
It is a distinct sample synthesizer with approximate MT-32-to-GM mapping, not
an emulator of named Yamaha/Kawai/Casio/Creative devices. Munt remains available.

The GOG DOS CD release contains synthesized music (`DAT/XMI.PAK` for Roland,
`DAT/ADL.PAK` for AdLib), not Red Book CD audio tracks. This implementation plays
the original XMIDI through **Munt / libmt32emu**, not GM instrument substitution,
oscillator approximations or recordings.

## Setup

### Automatic local setup

On this machine, the compatible pair is installed in ignored `.local/mt32/` as
`MT32_CONTROL.ROM` and `MT32_PCM.ROM`. `npm run dev` and `npm run preview` discover
it automatically on localhost: no import dialog is needed. Music defaults on for
this local pair unless the player explicitly saved Music off. Click Open the book
to satisfy normal browser autoplay policy. A first click before ROM discovery
finishes warms one AudioContext and resumes setup when the files arrive.

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

Without a local pair, music defaults off until configured. The saved device/volume choice is independent
of walking speed and chapter saves. In-game Options/loading pause music; Test music
temporarily auditions the title without advancing the game. Hidden tabs suspend
audio. Closing the settings stops the test. Disabling music closes the device.

## Import original resources

```powershell
npm run assets:music -- "C:\Program Files\GOG Galaxy\Games\Legend of Kyrandia"
```

`extractor/music.mjs` accepts the installation or DAT directory. All ten XMI files
are preserved losslessly as gzip, with original byte lengths/SHA-256 in
`public/assets/music/manifest.json`. Files are loaded lazily; the source archive
is not downloaded by the music player.

## Playback

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

Music is connected to the implemented intro/opening and first forest EMC scripts.
This is not a complete Miles driver or a complete Kyra audio implementation.
Speech/VOC playback, AdLib/Sound Blaster and other sound cards are
not yet implemented. Later-world XMI files are imported, but later-world gameplay
is not added. Saves restart a room-appropriate cue; they do not restore the exact
sample or all original score history. Intro cue boundaries follow the existing
web scene cuts, not a newly reconstructed sample-perfect DOS CD timeline.

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
off. Music fades affect only the music source. No new audio downloads were needed:
the original XMI packs already included these tracks.

Tests cover native-part assignment, protection, source cleanup, sample ordering,
three-slot saturation, independent levels, game input callbacks, DAT operands
without audio, and one-shot drops at 30/60/144 Hz. With the private ROM pair,
pickup/drop and music plus two effects produce nonzero WASM PCM. Chromium's real
AudioWorklet also verified the original pickup SFX with music off (RMS 0.01390).
