# Compact graphics resources

The browser keeps the original palette indices. The importer reads a local Kyrandia CD installation, decodes Westwood CPS/WSA data, and emits lossless `KYR1` scene packs. Original PAK/CPS/WSA files stay outside Git. No GOG client, account or installation is needed to run the built web game.

```powershell
npm run assets:build -- "C:\path\to\Legend of Kyrandia\DAT"
npm test
npm run typecheck
npm run build
npm run check:size
```

Generated packs and their provenance manifest live in `public/assets/packs/`. The manifest records source hashes, dimensions and output sizes, without local installation paths. Existing Python tools remain useful for inspecting original resources; PNG frame exports are no longer shipped.

## Storage and loading

A pack contains a `KYR1` header, little-endian UTF-8 manifest length, manifest and binary payload, compressed with gzip. Each clip has dimensions, a 256-color RGB palette, transparency index and frame offsets. Keyframes store one byte per pixel. Intermediate frames store ordered XOR runs; a keyframe is present at least every 64 frames. The reader validates dimensions, palette, offsets and delta bounds. One indexed frame buffer is reused for playback and backwards seeks.

The shipped intro uses seven animation packs for 684 frames. A separate room pack shares the original GEMCUT data between the background, scene shapes and foreground masks, and includes the English HUD. GEMCUT.DAT supplies scene colors 228–247. Original palette numbering is preserved; no color quantization is performed. Animation clips use transparent index zero; the room background is opaque. HUD composition also treats every black palette entry as transparent, because its black compositing key occurs at more than one index.

Intro playback loads the current scene and preloads its successor. A looping menu does not preload the following cutscene. Loading pauses the script clock, so slow connections do not consume dialogue time. Completed scenes release their images, indexed buffers and GPU resources; stopping cancels pending image and pack loads. The browser can cache unchanged pack URLs.

## Rendering

WebGL2 performs exact palette lookup using an `R8UI` index texture and a 256-entry RGBA palette. Nearest-neighbor sampling and disabled dithering preserve pixel values. Indexed layers compose with existing Canvas actors, inventory and DOM subtitles. This is an incremental renderer migration, not a rewrite of the entire engine in WebGL.

Canvas 2D provides an equivalent fallback when WebGL2 is unavailable or its context is lost. Palette changes work on both paths. Kallak's background, HUD and foreground masks are built directly from indexed data; they do not depend on Canvas pixel readback. This also avoids interference from browsers that modify readback data for fingerprint protection. The user's reported black speckles were not reproduced in the in-app browser; removing that dependency addresses a possible browser-specific cause rather than claiming a confirmed diagnosis.

The optional **Window dust** effect draws twelve faint logical-pixel motes. It does not alter the simulation clock, masks or input. It is disabled when reduced motion is requested.

## Verification and budget

`tests/fixtures/intro-pixels.json` records visible RGBA hashes from the previous lossless PNG exports. Tests check every migrated frame and backwards seeks against those hashes, plus malformed packs, original compression operations and asynchronous playback. Browser checks at `tests/browser/rendering.html` compare GPU/2D pixels, palette replacement, context loss and room rendering with Canvas readback forbidden, then load all nine intro steps. `tests/browser/recovery.html` deliberately fails the first pack request with HTTP 503 so the real application's error and **Try again** recovery can be checked.

The production build currently has a **1,400,000-byte regression budget**, including code and all public resources. CI checks it after building. This budget covers the current intro, lift opening and playable room; it is not a limit for the complete game. Expand it with measured content additions. Source/decompiler metadata for unimplemented rooms stays under `extracted_files/`, outside the published build. Sound and voice will need their own budgets.

## Original game opening

`opening.kyr.gz` adds TRUNK and GEM backgrounds and six original WSA clips for the lift and tree conversation, retaining their scene palettes and opaque rectangular compositing. `opening.json` contains scene actions compiled from the installed CD's EMC scripts. PAK and APK files are both read locally. PCM VOC durations are read for the original percentage-based speech animation timing; the voice archives themselves are not published.

`RoomScript` advances the extracted frame commands, speech and waits on one clock, and waits for scripted walks to arrive. Standard Brandon speech combines the headless body with original head sprites; the tree conversation uses its own WSA poses. Direct input cannot replace these sequences. `tests/browser/opening.html` verifies the complete opening and all 29 tree lines using the actual game renderer. See [MODLOG.md](../MODLOG.md) for source functions, flags, coordinates and current implementation boundaries.
