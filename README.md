# KyraWeb

![Original game logo](https://upload.wikimedia.org/wikipedia/commons/6/6d/The_Legend_of_Kyrandia_Series_-_Logo.png?20210417191824)

![CURRENT STAGE](https://img.shields.io/badge/CURRENT%20STAGE-Working%20with%20subtitles-green?style=for-the-badge)

**Language:** English | [Русский](README.ru.md)

---

**KyraWeb** is an independent web remake of *The Legend of Kyrandia* (Westwood Studios, 1992). The project recreates the original game logic and presentation using modern web tech (Vue 3 + Vite), while relying on the original game data for accuracy.

## Current status

- Playable intro with timing, fades, and scene-level animation control
- Kalak’s Place (GEMCUT) scene with walkmask, walk logic, and sprite layering
- Scene overlays (items on the desk, saw/letter replacement)
- Inventory, item pickup/drop with bounce
- Debug panel (mask, layer, walk speed, animation steps)
- Intro demo loop on the writing scene with interactive UI overlay

## Planned

- Credits system (in-game titles)
- Expand scene library and scripts
- More original UI/menus
- Save/load and configuration

## Documentation

**English (default):**
- Scene animations: `docs/animations.md`
- Movement & walkmask: `docs/movement.md`

**Русская версия:**
- Анимации сцены: `docs/animations.ru.md`
- Передвижение и walk-mask: `docs/movement.ru.md`

## Extractor tools

The `extractor/` folder contains scripts used to convert original resources into JSON or PNG for the web engine. These are **required only locally** and should not be committed with original game data.

Summary of available scripts (see `extractor/README.md`):

- `msc_unpack.py` — unpack `MSC.PAK`
- `msc_to_json.py` — decode a single `.MSC` to JSON (walkmask)
- `cps_to_json.py` — decode `.CPS` to JSON (pixels + palette)
- `dat_to_json.py` / `dat_batch_to_json.py` — decode `.DAT` scene metadata
- `emc_to_json.py` — extract scene animation commands
- `emc_text_to_json.py` — extract text strings from `.EMC`
- `wsa_to_png.py` — decode `.WSA` animations to PNG frames

## Font

The in-game UI uses the **Kyrandia** font located at:

```
public/assets/font/kyrandia.otf
```

Font author (reference):

```
https://fontstruct.com/fontstructions/show/1132362/kyrandia_2
```
