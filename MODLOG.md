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

# First forest quests — 2026-10-29

- Runtime EMC host operations play the first-forest CD scripts against shared flags, inventory and NPC state. Text, voice lengths and WSA frame commands come from the installed GOG resources; speech audio remains unshipped.
- Home note pickup must set flag 242 before Brynn accepts it. Brynn’s note is the original NOTEENG bitmap. Rose 16 becomes silver rose 19; teardrop 52 heals room 4 to WILLOW; WILLOW function 2 launches Merith’s chase.
- Corrected room-table mistakes from the navigation slice: room 10 uses FNORTH (filename 84), room 16 uses FGOWEST (86), and FORESTA’s path to room 13 is south. FORESTB uses the original 17-column background/mask restoration. These are required for flags 66 → 67 → 68 → 69 → 83 and the marble scene.
- Merith leaves marble 43. The altar consumes it, then silver rose 19, and plays AMULET.WSA. Herman accepts saw 44, sets flag 56 and leaves; XEDGE sets 8. The altar or FORESTA applies the original repair conditions (amulet 45 plus saw/work progress), selects BRIDGE and XEDGEC, and sets flag 7. The bridge opens room 24 and permits a return trip.
- DAT state distinguishes stopping the script from hiding its last sprite. Fixed FF90/FF91 operand length, coordinate updates, loops, random delays, actor commands, and internal visibility. Permanent WSA backgrounds draw before active sprites, preserving Brynn’s head and Herman’s sawing animation.
- Palette effects use the DOS special palette tables from ScummVM lok_dos.h (GPL-3.0-or-later); the pixel path remains indexed. NPC walking uses the existing LoK pathfinder and original movement delays.
- The bridge warning suspends at the original input instruction. Confirmation replays only VM computation from an isolated snapshot, discards already-played actions, and branches on the real click. The fatal BALANCE2 sequence stops input and allows a new game. AGILE requests frame 17 despite having 17 frames; like [ScummVM displayFrame](https://github.com/scummvm/scummvm/blob/master/engines/kyra/graphics/wsamovie.cpp), this retains the prior image and advances only the requested wait.
- Source and frame hashes live in tests/fixtures/forest-pixels.json.gz, outside the published build. forest.json.gz contains only runtime metadata. The loader accepts compressed bytes and transparent HTTP decompression.
- UI uses a quiet pixel stone border, small gems, original logo and touch-sized controls. No image smoothing or generated replacement art is applied to the game.
- This is a bounded first-region implementation, not a complete Kyra engine. Later quest opcodes, full audio, later-world navigation and saves are not covered.

# Rendering and touch controls — 2026-10-29

- Home EMC shapes are restricted to the home background while the opening temporarily renders TRUNK/GEM. Foreground occlusion now composites current room decorations rather than restoring a bare CPS over the note and saw; decoration changes invalidate the cache.
- FACE/FACE2 are opaque room patches and render behind Brandon. Their foreground portions use the original priority mask. The opening browser fixture checks prop pixels outside/inside home and the tree/actor draw order.
- Kallak hand overlays use the sequence's original x coordinates and y minus 8, matching the movie viewport's shift from 16 to 8. Removed the unrelated -57 x offset.
- Clicking a room dialogue dismisses its current voice wait without cancelling movies, movement, choices or quest effects. Intro clicks advance only the active subtitle; they do nothing during silent scenes or the menu.
- Exit arrows follow actual room portals, appear on pointer hover/focus, and can be kept visible with Exits. Coarse-pointer devices start with arrows shown. A separate Inventory panel offers 48px controls and uses the same original slots and item state.
- Canvas pointer input keeps pinch zoom while preventing one-finger page panning during aiming; controls have touch feedback and no long-press text selection. Code and the 390px layout were checked; physical Safari/Chrome touch behaviour still needs a real phone.
- Validation: 41 Node tests, typecheck, build/size check, full opening with all 29 tree lines, complete forest quest browser run, and application-level inventory store/take, exit and dialogue-click checks.
