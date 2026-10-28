# First forest region

The first forest region supports the original CD quest chain through the repaired bridge: Brynn’s note and enchanted rose, healing the willow, Merith’s chase and marble, the altar and amulet, and Herman’s saw and bridge repair. Room 24, CAVEB, is the landing beyond the bridge; its later-world west exit remains unavailable. Save files, later regions and audio are still outside this slice.

| ID | Original resource | Location |
| --- | --- | --- |
| 0 | GEMCUT | Brandon's home |
| 1 | GEM | Outside the home / upper lift |
| 2 | HEALER | Inside the Temple |
| 3 | EXTHEAL | Temple exterior |
| 4 | SICKWIL / WILLOW | Rotting / healed tree |
| 5 | TRUNK | Lower lift |
| 6 | ALTAR | Forest altar |
| 7 | BROKEN / BRIDGE | Broken / repaired bridge |
| 8 | SORROW | Pool of Sorrow |
| 9 | CAVE | Cavern entrance |
| 10 | FNORTH | Dark forest |
| 11 | FORESTB | Dark forest |
| 12 | FORESTA | Dark forest |
| 13 | XEDGE / XEDGEC | Herman’s work site |
| 14 | ZROCK | Southern cliff |
| 15 | NWCLIFB | Tall cliff |
| 16 | FGOWEST | Dark forest |
| 24 | CAVEB | Beyond the repaired bridge |

Click the scene edges, doorways or lift to leave. An exit changes the desktop cursor's direction. Brandon walks to a reachable approach before the scene changes. The first attempt to leave home plays the original tree conversation, including when carrying an item. Returning home preserves its completion state.

## Original data

```powershell
npm run assets:world -- "C:\path\to\Legend of Kyrandia\DAT"
```

`extractor/world.mjs` imports CPS backgrounds, MSC walk/priority masks and DAT animation/entrance metadata. It reads N/E/S/W connectivity from the DOS room table and traces EMC initialization for scene titles, initial scene shapes, special doorway rectangles, mask changes and actor scale. Unknown quest operations are outside this navigation importer. FORESTA uses original compression type 3 (RLE); the other backgrounds use LCW. Scene-local palette entries 228–247 remain intact. Initial WSA stills for Brynn's entrance and Herman are composited from original frames.

Every room has a gzip indexed pack with its background and mask. Lift rooms also include DROPUP/DROPDOWN or LIFTUP/LIFTDOWN, using the original positions, frame order and 5/6-tick waits. `world.json` stores room metadata and source/output hashes. No raw PAK, APK, CPS, MSC, DAT, EMC or speech archives are published.

The original west connection to room 24 opens only after the quest scripts select BRIDGE. Giving Herman the saw alone is insufficient; obtaining the amulet and his progress at the work site determine when repair completes. Brandon's depth scale at the bridge follows the original integer 192→256 interpolation between y=56 and y=92.

## State and loading

Only the current room is rendered. While loading an exit, input waits and the next room's pack is decoded once; the previous renderer is released after a successful transition. Room snapshots keep loose items and overlay changes; inventory and the held item are shared across the region. These are in-memory snapshots, not save files. Reloading or choosing Menu starts a new game.

Failed transitions keep the current room and inventory and allow another click to retry. Stopping a world or restarting the intro aborts pending fetches; an old load cannot reset the new game's canvas. Per-run callback ownership prevents an old room's cleanup from clearing the next room's subtitles or sequence state.

## Verification

Node tests check approach routes across all room exits, RLE decoding and depth scale. `tests/browser/world.html` drives the actual renderer through all 17 rooms and back, including both lift directions. It checks held items, inventory, picked overlays, dropped items, tree completion, the closed bridge, a deliberately failed transition/retry and cancellation during loading. Its gallery captures the original scenes for visual inspection.

The complete build is about 2.6 MB. The 2,700,000-byte CI cap is a regression budget for this slice, not a full-game size target.

## Quest scripts

Run `npm run assets:world -- "C:\path\to\DAT"` followed by `npm run assets:forest -- "C:\path\to\DAT"` to rebuild the original data. The forest importer retains EMC code and strings, WSA frames, DAT sprites and VOC-derived durations. Runtime conditions read the current inventory and flags; playback applies changes at the corresponding action, so inspecting a script cannot prematurely consume an item.

Brynn displays the original NOTEENG bitmap and waits for Continue. The home vase can store and return an item. Clicking the gap in the broken bridge plays Herman’s warning and waits for another scene click: retreat avoids the crossing; insisting plays the original fatal animation and offers a new game. No save or resurrection mechanic is invented.

`tests/browser/forest.html` traverses the full quest with actual input, captures key scenes, and crosses the repaired bridge in both directions. A separate button tests the warning, retreat and fatal crossing on a fresh game. Node tests cover both quest orders, the original frame/palette hashes, all 14,144 sampled hotspot/item combinations, DAT operand lengths/loops, and confirmation cancellation.

## Pointer and touch controls

Hover over an exit to see its directional arrow. Exits keeps all available arrows visible; this starts enabled on a coarse-pointer device. Arrow buttons trigger the same doorway/edge action as clicking the scene, including the first tree conversation before leaving home.

Inventory opens a larger five-by-two grid that shares the original HUD slots. Select a carried item, tap its destination in the scene, or tap an empty slot to put it away. Clicking during dialogue dismisses only the current line's speech wait; scripted animation and walking continue, and confirmation choices remain explicit. In the intro, a click advances to the end of the current subtitle without skipping the rest of the cutscene.

`tests/browser/controls.html` runs the actual Vue application with visible clock controls for repeatable UI checks. `tests/browser/opening.html` checks the home prop pixels and the tree/actor draw order as well as the full conversation. Touch-specific browser gestures still require verification on physical hardware.
