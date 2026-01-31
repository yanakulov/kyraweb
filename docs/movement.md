# Movement and walkmask

**Language:** English | [Русский](movement.ru.md)

## Original logic (ScummVM / Kyrandia LoK)

- Walkability and layers come from `.MSC` (mask 320x144).
- The actor layer is chosen from `drawLayerTable` in `.DAT` by Y coordinate.
- Occlusion (overdraw) is resolved by comparing mask layer vs actor layer.

## Implementation in this project

Formats:
- Mask: `extractor/msc_to_json.py` -> `public/assets/masks/<SCENE>.json`
- Scene metadata: `public/assets/scenes/dat/<SCENE>.json`

Logic:
- A point is blocked if `(mask & 0x80) != 0`
- If `maskLayer > actorLayer`, draw the background over the actor
- `actorLayer` comes from `drawLayerTable` (scene JSON)
- Movement and pathing: `src/engine/game.ts`
- Step speed: use the DOS tick `1000/60` ms and delays in ticks as in ScummVM

Speeds (LoK / ScummVM, `timer_lok.cpp`):
- slowest → 11 ticks
- slow → 9 ticks
- fast → 6 ticks
- fastest → 3 ticks

Each tick equals one pixel step, so speed ≈ `60 / ticks` px/s.

Debug:
- The right panel can show mask and per-pixel info (x/y, mask, layer, blocked, actor).
