# First forest region

The first 17 DOS rooms are connected for exploration, up to the ruined bridge. This is navigation and persistent room state; the remaining NPC conversations, quests, bridge repair and areas beyond the bridge are not implemented here.

| ID | Original resource | Location |
| --- | --- | --- |
| 0 | GEMCUT | Brandon's home |
| 1 | GEM | Outside the home / upper lift |
| 2 | HEALER | Inside the Temple |
| 3 | EXTHEAL | Temple exterior |
| 4 | SICKWIL | Rotting tree |
| 5 | TRUNK | Lower lift |
| 6 | ALTAR | Forest altar |
| 7 | BROKEN | Ruined bridge in the cavern |
| 8 | SORROW | Pool of Sorrow |
| 9 | CAVE | Cavern entrance |
| 10 | XEDGEC | Rocky outcropping |
| 11 | FORESTB | Dark forest |
| 12 | FORESTA | Dark forest |
| 13 | XEDGE | Rocky outcropping |
| 14 | ZROCK | Southern cliff |
| 15 | NWCLIFB | Tall cliff |
| 16 | FSOUTH | Dark forest |

Click the scene edges, doorways or lift to leave. An exit changes the desktop cursor's direction. Brandon walks to a reachable approach before the scene changes. The first attempt to leave home plays the original tree conversation, including when carrying an item. Returning home preserves its completion state.

## Original data

```powershell
npm run assets:world -- "C:\path\to\Legend of Kyrandia\DAT"
```

`extractor/world.mjs` imports CPS backgrounds, MSC walk/priority masks and DAT animation/entrance metadata. It reads N/E/S/W connectivity from the DOS room table and traces EMC initialization for scene titles, initial scene shapes, special doorway rectangles, mask changes and actor scale. Unknown quest operations are outside this navigation importer. FORESTA uses original compression type 3 (RLE); the other backgrounds use LCW. Scene-local palette entries 228–247 remain intact. Initial WSA stills for Brynn's entrance and Herman are composited from original frames.

Every room has a gzip indexed pack with its background and mask. Lift rooms also include DROPUP/DROPDOWN or LIFTUP/LIFTDOWN, using the original positions, frame order and 5/6-tick waits. `world.json` stores room metadata and source/output hashes. No raw PAK, APK, CPS, MSC, DAT, EMC or speech archives are published.

The broken bridge's original west connection leads to room 24. This connection stays unavailable in this stage; no repaired bridge or invented crossing is introduced. Brandon's depth scale at the bridge follows the original integer 192→256 interpolation between y=56 and y=92.

## State and loading

Only the current room is rendered. While loading an exit, input waits and the next room's pack is decoded once; the previous renderer is released after a successful transition. Room snapshots keep loose items and overlay changes; inventory and the held item are shared across the region. These are in-memory snapshots, not save files. Reloading or choosing Menu starts a new game.

Failed transitions keep the current room and inventory and allow another click to retry. Stopping a world or restarting the intro aborts pending fetches; an old load cannot reset the new game's canvas. Per-run callback ownership prevents an old room's cleanup from clearing the next room's subtitles or sequence state.

## Verification

Node tests check approach routes across all room exits, RLE decoding and depth scale. `tests/browser/world.html` drives the actual renderer through all 17 rooms and back, including both lift directions. It checks held items, inventory, picked overlays, dropped items, tree completion, the closed bridge, a deliberately failed transition/retry and cancellation during loading. Its gallery captures the original scenes for visual inspection.

The current complete build is about 1.67 MB. CI's 2,000,000-byte cap is a regression budget for this slice, not a size limit for the complete game.
