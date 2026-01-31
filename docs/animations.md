# Scene animations

**Language:** English | [Русский](animations.ru.md)

## Original logic (ScummVM / Kyrandia LoK)

In the original game, room animations are described in scene `.DAT` files:
- `spriteDefs` define rectangles inside the background image. These rectangles are the animation frames (e.g. the lamp flame).
- `anims` are small scripts with opcodes (`FF88`, `FF8A`, `FF8B`, etc.) that change frames and set delays.
- Rendering happens on top of the background, before characters.

Source in ScummVM: `engines/kyra/engine/sprites.cpp`.

## Implementation in this project

We convert `.DAT` to JSON and execute the same scripts at runtime:

- Scene JSON: `public/assets/scenes/dat/<SCENE>.json`
- Converter: `extractor/dat_to_json.py` and batch `extractor/dat_batch_to_json.py`
- Runtime: `src/engine/game.ts` (scene anim updates + drawing)

Supported opcodes:
- `FF88` / `FF8D` — choose frame and position (normal / mirrored)
- `FF8A` — delay (ticks)
- `FF8B` — jump to start of script
- `FF90` / `FF91` — choose frame by default X/Y (normal / mirrored)
- `FF92..FF95` — change default X/Y
- `FF96` — stop another animation
- `FFA7` — start another animation

Tick length: `1000 / 60` ms (DOS timing), matches ScummVM logic for LoK.

## Regenerating JSON

```
python extractor/dat_batch_to_json.py d:\GitHub\kyraweb\extracted_files\dat_pak d:\GitHub\kyraweb\public\assets\scenes\dat
```
