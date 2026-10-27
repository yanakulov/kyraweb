# Original opening: DOS CD

## Evidence

- Reference engine: ScummVM `engines/kyra/engine/kyra_lok.cpp`, `scene_lok.cpp`, `script/script.cpp`, `script_lok.cpp`, `graphics/animator_lok.cpp`, `engine/timer_lok.cpp` and `text/text_lok.cpp` ([upstream](https://github.com/scummvm/scummvm/tree/master/engines/kyra)). Original installation and downloaded reference sources remain local.
- New games set flag `0xEF` and start in room **5**, filename **TRUNK**. Starting directly in GEMCUT omitted the climb.
- TRUNK function 3 walks Brandon from `(320,108)` to `(264,108)`, plays **DROPUP.WSA** at `(232,8)`, sets flag 52 and enters room 1, **GEM**.
- GEM function 2 consumes flag 52 and plays **LIFTUP.WSA** at `(192,56)`. Brandon reappears at `(208,110)`, facing 5. Function 3 says “I always love doing that!” and walks toward the doorway at `(192,88)`.
- GEMCUT's south entrance is `(160,128)` from the final 12 bytes of its DAT. Function 3 walks to `(164,118)`, faces 3 and says “Grandfather!” / “What happened to you?!?”.
- GEMCUT function 1 intercepts the first south-exit attempt for the tree conversation. Its **29** lines come from EMC TEXT; speech uses both `characterSays` and `customPrintTalkString`. The latter has separate WSA frame commands while text remains visible.
- The tree uses **FACE.WSA**, **FACE2.WSA**, **BRANTREE.WSA**, and **TOUCH.WSA**. Completion sets flag **53**, so the full conversation only happens once per new game. A direct tap on the upper trunk also initiates this same conversation in the web version.
- Standard Brandon speech draws body **16** and head **17 + head-table entry**, at **11 ticks** per head update. Head sprites must not replace the body. Tree dialogue has its own original WSA poses instead.

## Import and playback

`extractor/emc.mjs` executes the original EMC stack instructions offline. `extractor/opening.mjs` traces only the supported opening/tree paths and fails on unhandled host operations. This is a compiled scene sequence, not a claim that every game EMC opcode or room is implemented.

The importer reads PAK and APK containers. Original palettes, WSA frame indices/positions, frame waits, text and voice IDs are retained. VOC PCM block lengths supply CD speech durations and the percentage-based WSA speech synchronization; audio is not shipped. Random mouth delays use the midpoint of the original requested interval for repeatable playback. Scene handoffs follow the original room sequence. The first forest region is now navigable as documented below; later regions remain unimplemented.

Runtime `RoomScript` holds input until scripted walks and frame/text waits finish. Stopping a game clears speech and cancels its animation frame. Game frames cap large elapsed-time jumps so background-tab suspension cannot consume the opening in one update. Scene drawing is clipped to `(8,8)..(312,136)`, preserving the frame and lower HUD.

## Verification

- Node tests cover int16 EMC calls, VOC continuation durations, frame/voice/walk ordering, cancellation, original room order and all referenced WSA indices.
- `tests/browser/opening.html` runs the real engine through the opening and every tree line, tests input locking and one-time completion, and captures the poses for visual inspection.
- Existing GPU/Canvas, intro, walkmask, movement and drop regressions remain required.
- The CI cap is a regression budget for the implemented slice, not a limit or promise for the complete game.

## Forest region navigation

- DOS IDs **0–16**, with N/E/S/W links from `k1RoomListDOS` and `k1RoomFilenamesDOS`, form the first forest region. BROKEN (7) connects east to CAVE (9); its west link to 24 remains closed.
- DAT `0x15` contains the north/south exit heights; its final 12 bytes contain the four entrance coordinates. Coordinates snap to the original 4×2 walk grid.
- EMC `setSpecialExitList` describes GEM's doorway and the Temple entrances. Script `blockInWalkableRegion` / `blockOutWalkableRegion` use inclusive corner coordinates, not width/height ([ScummVM source](https://github.com/scummvm/scummvm/blob/master/engines/kyra/script/script_v1.cpp)).
- GEM's descent: walk to `(216,107)`, LIFTDOWN at `(192,56)` with 5-tick frames, set flag 51, enter TRUNK. TRUNK's entry consumes flag 51, plays DROPDOWN at `(232,8)` with 6-tick frames and restores Brandon at `(280,116)`, facing 3.
- Returning up: TRUNK walks to `(264,108)`, plays DROPUP at `(232,8)` / 6 ticks, then GEM plays LIFTUP at `(192,56)` / 5 ticks and restores `(208,110)`, facing 5.
- FORESTA.CPS uses compression 3; all region MSCs are LCW 320×144 masks. Each background's local colors still come from DAT `0x17`.
- BROKEN requests scale `(56,192,92,256)` and its initial NEEDSAW1 frame at `(200,47)`. HEALER requests BRINENTR frame 0 at `(8,56)`. Initial stills are retained; NPC quest logic is not fabricated.
- Room snapshots preserve inventory, held/loose items, letter/saw overlays and tree completion through navigation. See [world documentation](docs/world.md) for scope, importer and browser verification.
