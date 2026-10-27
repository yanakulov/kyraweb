# Movement and walkmask

**Language:** English | [Русский](movement.ru.md)

Movement uses the LoK 4×2 pixel grid and eight path directions. Targets are rounded down to that grid before pathfinding, so fractional browser clicks cannot cause overshoot or oscillation. The pathfinder follows the original octant selection, traces both sides of an obstacle, selects the shorter detour and simplifies backtracking. Routes are limited to 150 steps. Source: ScummVM `engines/kyra/engine/scene_v1.cpp` (GPL-3.0-or-later; license in `LICENSES/GPL-3.0.txt`).

Passability comes from `public/assets/masks/<SCENE>.json`: bit 0x80 blocks walking. The default-scale LoK foot span is checked at each waypoint, including the mask's actual bounds. The actor turns with each path segment. Movement advances on a timer independently of rendering: 11/9/6/3 ticks for the existing slowest/slow/fast/fastest options, with a 60 Hz tick. One step moves 4 pixels horizontally, 2 vertically, or both. It is not a one-pixel step.

Brandon's walking shapes are 8–14 sideways, 29–34 south and 35–40 north, resolved by `shapeIndex` in the atlas. Walking animation advances each movement step by default; stopping uses shape 7. Foreground images are cached per actor layer instead of reading the canvas pixels on every frame.

Drops use a separate 16-pixel footprint, floor layers, occupied positions and the original 12-item scene capacity. Falling starts at 2 pixels per tick, accelerates by 1 and has at most one bounce, following `items_lok.cpp`. The reserved landing position is used exactly. Failed drops keep the held item; clicking a scene item while holding another exchanges them. Pending drops block input so a second click cannot interfere with an unfinished drop.

The current implementation covers GEMCUT at default actor scale. Scene-specific no-drop rectangles, original per-item height data, exits and script-driven scene transitions still need their original scene data; the current drop clearance uses the 16-pixel inventory icon. This is not a complete replacement for the Kyrandia script engine.

Run `npm test`, `npm run typecheck`, and `npm run build`. Regression tests include the real GEMCUT mask, shallow/diagonal routes, obstacles, blocked targets, animation frame IDs, retargeting, inventory exchange and equal walking/drop timing at 30/60/144 Hz.
