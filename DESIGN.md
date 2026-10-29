---
name: Kyrandia - Fables & Fiends
description: A leather-bound fantasy adventure with original pixel scenes and jewel-set controls.
colors:
  gold: "#d8bc7b"
  paper: "#e7dcba"
  muted: "#b9ad92"
  backdrop: "#100e0b"
  ink: "#15140f"
  stone: "#162a25"
  edge: "#786447"
  panel: "#14231d"
typography:
  controls:
    fontFamily: "Kyrandia, Georgia, serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
  body:
    fontFamily: "Georgia, serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  edition:
    fontFamily: "Georgia, serif"
    fontSize: "22px"
    fontWeight: 400
rounded:
  square: "0px"
spacing:
  small: "8px"
  medium: "16px"
  large: "24px"
components:
  button:
    textColor: "{colors.paper}"
    rounded: "{rounded.square}"
    typography: "{typography.controls}"
    padding: "10px 20px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.paper}"
    rounded: "{rounded.square}"
    padding: "24px"
---

# Design System: Kyrandia - Fables & Fiends

## Overview

**Creative North Star: "The book on Kallak's desk"**

Old leather, wood, aged gold and emerald fittings make the browser feel part of Kyrandia. A Blender-modeled book carries the original retail cover embossed into leather; generated interface art supplies the surrounding fantasy controls. The original 320 × 200 game fills the stage once the camera enters the book, with no external masthead, toolbar or footer.

**Key Characteristics:**
- Original cover art and pixel game scenes, with a physical Blender-modeled book as the entrance.
- Warm candlelight, cool moonlight, parchment lettering and deep green controls.
- Motion for opening the story and acknowledging input, not perpetual decoration.

## Colors

Gold marks actionable edges and emphasis. Paper carries primary text; muted carries supporting labels. Ink and backdrop hold the dark page, while stone and panel separate controls from the wood. Edge is the subdued brass border. Preserve the generated art's purple and emerald jewels rather than recoloring the original game's palette.

## Typography

The bundled Kyrandia font serves buttons and small control labels. Georgia supplies chapter text, help prose and readable instructions. The generated `kyrandia-title.webp` supplies the Kallak menu wordmark inside the stage, avoiding a separate page heading.

## Layout

The opening table fills the viewport. Its book stays framed as the cover opens, including on portrait screens. The invitation sits above the bottom safe area and fades when opening begins. The camera and letterbox converge on the game area's 8:5 framing.

The game page is centered with a maximum width of 1280px and also follows `calc((100svh - 8px) * 1.6)` to fit the available height. The stage retains its 8:5 ratio against a quiet dark backdrop, without a second decorative frame. Fullscreen uses the available 8:5 area.

At 600px, help becomes one column, settings stack, Options actions share available width and the ornamental menu copy disappears. Settings, help and inventory are scrollable overlays constrained to the stage; their headings remain visible while scrolling. Safe-area padding and pinch zoom remain intact.

Buttons, selects and summary rows have a minimum 44px height. Inventory cells are at least 44px wide and 48px high. Focus uses a 2px pale-gold outline with a 4px offset.

## Elevation & Depth

The original game artwork supplies the frame and HUD; open dialogs dim the stage behind a deep green panel. Buttons use inset strokes rather than rounded card elevation. Blender supplies beveled, smoothly shaded book and table geometry, with embossed original cover detail, a page block, hinged cover, spine and brass fittings. The spine stays fixed to the back board below the page surface. The candle stands behind the book on its right, outside the cover's opening arc.

Warm candlelight and cool moonlight separate the book from the table. Half-resolution GTAO supplies contact depth (radius 0.22, thickness 0.12, blend intensity 0.65); restrained bloom uses threshold 2.8, strength 0.12 and radius 0.25. Film grading and a soft vignette shape the 3D scene. AO, bloom and grading fade away between 55% and 95% of the zoom; the final frame renders directly with the original landscape's exact pixel colors. Three.js renders on demand when loading, resizing, opening or following mouse movement, with no idle animation loop.

## Shapes

Controls and panels have square corners. Borders are thin, layered and material-colored. The book uses physical thickness and softly beveled edges rather than a flat illustration or stacked sharp boxes. Its detailed 3D materials coexist with the original pixel game scenes; the canvas and pixel decorations retain nearest-style rendering.

## Components

- **Book:** one clear Open the book action, also available by clicking the book surface. The 8.9-second sequence opens the hinge at 0–2.2 seconds, traces contours at 1.8–4.2 seconds, washes in color at 4.5–6.2 seconds and zooms into the picture at 6.5–8.9 seconds. The page begins bare; contours, sparse hatching and a small gold drawing trace appear on its physical, lit parchment. The source is exactly `assets/intro/logo_bg.png`, interpreted as ink rather than a grayscale photo on a flat plane. Only the final camera approach blends into the unlit original game frame. The completed book view remains visible until `onFirstFrame` confirms that the intro has drawn. Reduced motion bypasses the opening and mouse parallax. The embossed-cover image remains the fallback when WebGL or model loading fails.
- **Kallak menu:** a generated emerald-and-gold panel in the lower 32% of the stage. Start game is primary; How to play and Settings are secondary. Decorative text is removed on small screens.
- **Intro:** the book picture, Westwood and the transparent AkulaFlow mark share the original `assets/intro/logo_bg.png` landscape. Westwood and AkulaFlow retain their reveal and fade inside the canvas sequence; the remaining original intro leads to Kallak.
- **Buttons:** green beveled fill, parchment labels, brass outline; lighter hover, darker pressed state and visible keyboard focus. Disabled controls lower opacity.
- **Options/help:** the original HUD Options button opens deep green bordered dialogs inside the stage. Options contains settings, inventory, help, fullscreen, main menu and credits; developer controls remain inside a disclosure. Close or Resume and Escape dismiss a dialog; keyboard focus stays within it and returns to its launcher.
- **Inventory:** an internal overlay with five columns of labeled slots and a live description of the held item. Choosing a slot returns to the game. During sequences or loading, interaction is disabled.

Interface assets live in `public/assets/interface/`:

| File | Use and provenance |
|---|---|
| `storybook.glb.gz` | Blender-modeled scene exported by `extractor/model_storybook.py`; editable `.blend` retained in ignored `.reference/` |
| `book-cover.webp` | Original user-supplied Kyrandia retail cover treated as embossed leather, also used for the fallback |
| `kyrandia-title.webp` | Generated illustrated wordmark |
| `akulaflow-studio.webp` | Generated transparent studio mark over the original intro landscape |
| `menu-panel.webp` | Generated Kallak menu inside the stage |

Generated art provenance: **Generated with built-in ImageGen for this task, 29Oct2026**. Raster interface assets ship as compressed WebP. This attribution does not apply to the original retail cover or `public/assets/intro/logo_bg.png`; those remain original game artwork. AkulaFlow brand reference: `../akula-flow/public/brand/identity.png`. Original game packs and sprites retain their existing provenance.

Measure the complete production build and packed book model separately after changes; neither has a fixed size promise.

## Do's and Don'ts

- Do keep the game view unobscured outside explicitly opened dialogs and the next action visible.
- Do keep controls and credits inside the game presentation.
- Do preserve the original cursor, pixel density and scene framing.
- Do check the book, menu, help and settings at desktop and narrow mobile sizes.
- Do retain reduced-motion and WebGL-fallback paths.
- Do preserve the supplied original cover composition and the original landscape through the book-to-intro handoff.
- Do draw the illustration into the physical parchment and remove scene effects before the final original game frame.
- Do keep props outside the cover's hinge arc.
- Don't replace generated material art with generic gradients or decorative cards.
- Don't add continuous book rendering, oversized downloads or ornamental controls without a functional reason.
