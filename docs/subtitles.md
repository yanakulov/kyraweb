# Subtitles (Intro)

## Original (Kyrandia / ScummVM)
- The intro sequences are scripted. Each sequence step can emit text via dedicated opcodes.
- There are two text modes:
  - **Centered text** (letter text): rendered at the bottom area (y≈180 on a 320x200 screen), centered horizontally.
  - **Talk text**: rendered at explicit coordinates (x/y) from the sequence data. The y coordinate acts as a bottom anchor.
- Timing is defined in sequence ticks (1 tick ≈ 1/60 sec). Text appears at specific ticks and stays until the next text event or the sequence ends.

## This project
- Subtitles are mapped 1:1 from the original sequence timing into milliseconds.
- Text is stored separately in `src/engine/intro/introText.json`.
- Timing/position data lives in `src/engine/intro/subtitles.ts` and is attached to intro steps in `src/engine/intro/steps.ts`.
- Rendering is done by a DOM overlay component (`src/components/SubtitleOverlay.vue`) placed above the canvas.
- The intro player emits the active subtitle lines via `onSubtitleChange`, so the overlay can update without drawing text onto the canvas.

## Notes
- Colors are per-line to match the original (e.g., letter text uses warm beige).
- The overlay uses pixel-friendly settings; if a bitmap font is introduced later, it can be rendered here without affecting the canvas.
