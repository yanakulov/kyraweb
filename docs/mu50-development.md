# Yamaha MU50 hardware-emulation work

Status: **build/integration in progress, not an available sound renderer**.
No MU50 item is added to Settings until the actual emulator and its audio/MIDI
bridge work. SF2 playback is not used as a placeholder or called MU50 emulation.

## Hardware basis

MAME `src/mame/yamaha/ymmu50.cpp`, BSD-3-Clause, R. Belmont and Olivier Galibert:
https://github.com/mamedev/mame/blob/master/src/mame/yamaha/ymmu50.cpp

- H8/3003 CPU, 10 MHz; serial MIDI into SCI1 at the original MIDI baud rate.
- Yamaha SWP00 sample synthesizer and effects.
- One 512-KiB BIOS, two 2-MiB sample ROMs, device RAM/NVRAM.

The required software is the device firmware, not GM samples, an SF2 bank or
Roland MT-32 ROMs. `extractor/mu50/roms.mjs` records original MAME SHA-1/size
metadata for BIOS versions 1.05/1.04/1.02 and the two sample chips. It contains no
firmware bytes. Check a local directory with:

```powershell
node extractor/mu50/check_roms.mjs "path-to-your-MU50-ROMs"
```

## Portable Windows build environment

The user approved a separate dependency/build directory on D:, because the
system drive has little free space. The app repository stays where it is.
All SDKs, source checkouts, downloads and large temporary files stay in the
explicitly supplied build directory. Existing unrecognized directories are refused.

```powershell
node extractor/mu50/setup.mjs "D:\KyraWeb-build"
```

The setup creates an ownership/stage manifest and prepares portable w64devkit,
Python, Emscripten 6.0.2 and a sparse MAME checkout. It does not install a system
Linux distribution, require admin access, move the project or modify existing
renderers. Large sample banks and firmware stay outside the public build.

Upstream build instructions:
https://docs.mamedev.org/initialsetup/compilingmame.html#compiling-emscripten

Next stages are the single-driver MU50 WASM build, a MIDI-input/PCM bridge, firmware
boot validation and comparison of real output before exposing the renderer in-game.
A downloaded SDK/source checkout alone is not a completed MU50 emulator.

After setup, the dedicated build command is:

```powershell
npm run mu50:build -- "D:\KyraWeb-build" 2
```

It obtains portable CMake/Ninja, prepares SDL3 ports, injects the bounded virtual
MIDI provider and builds only the MU50 driver. The provider accepts bytes through
`kyra_mu50_midi_byte`, reports queue size and allows clearing the input queue.
Those bytes are read by MAME's MIDI-in device and serialized into the H8 SCI1;
there is no substitute synthesizer in that bridge. Modified upstream files are
checked before writing, and existing unrelated modifications are refused.

MAME artifacts and the exact checkout revision remain in the external build
directory. A successful compiler exit without an actual `.wasm` artifact is not
accepted. This command does not silently copy an untested module into the app.

Kyrandia's MIDI score itself targets MT-32, not Yamaha XG. Even a real MU50
emulator will need an explicitly described MT-32-to-GM/XG arrangement mapping;
faithful device emulation does not recreate Roland-specific custom timbres.
