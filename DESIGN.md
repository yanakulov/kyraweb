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

Old leather, wood, aged gold and emerald fittings make the browser feel part of Kyrandia. Generated illustrations carry material detail; readable controls and generous game framing carry the interface. The original 320 × 200 game remains the focal point once the book opens.

**Key Characteristics:**
- Pixel illustrations and original game sprites, with a physical 3D book as the entrance.
- Warm shadows, parchment lettering and deep green controls.
- Motion for opening the story and acknowledging input, not perpetual decoration.

## Colors

Gold marks actionable edges and emphasis. Paper carries primary text; muted carries supporting labels. Ink and backdrop hold the dark page, while stone and panel separate controls from the wood. Edge is the subdued brass border. Preserve the generated art's purple and emerald jewels rather than recoloring the original game's palette.

## Typography

The bundled Kyrandia font serves buttons and small control labels. Georgia supplies the edition title, help prose and readable instructions. The generated `kyrandia-title.webp` supplies the masthead and Kallak menu wordmark, avoiding oversized raster enlargement. The desktop masthead image is 240px wide, falling to 154px below 600px and 130px below 360px.

## Layout

The page is centered with a maximum width of 1080px. After opening, its width also follows `calc((100svh - 260px) * 1.6)` so the game and toolbar fit the available height. The game stage retains its 8:5 ratio; the outer frame has 10px padding, reduced to 4px on mobile.

At 600px, help becomes one column, settings stack, toolbar actions share available width and the ornamental menu copy disappears. At 360px, horizontal page padding becomes 10px. Short landscape screens below 500px hide the masthead and credits to prioritize gameplay. Safe-area padding and pinch zoom remain intact.

Buttons, selects and summary rows have a minimum 44px height. Inventory cells are at least 44px wide and 48px high. Focus uses a 2px pale-gold outline with a 4px offset.

## Elevation & Depth

The frame combines inset dark and brass strokes with a `0 20px 60px #0008` ambient shadow. Buttons use inset strokes rather than rounded card elevation. The book is actual Three.js geometry: page block, hinged cover, spine, brass fittings, candle and gems, lit against a textured desk. It renders on demand when loading, resizing, opening or following mouse movement; it does not run an idle animation loop.

## Shapes

Controls and panels have square corners. Borders are thin, layered and material-colored. The book's volume and faceted gems supply dimensional silhouettes. The game canvas and pixel decorations use nearest-style rendering; the generated title is displayed at a controlled size.

## Components

- **Book:** one clear Open the book action, also available by clicking the book surface. The cover opens over 1450ms and hands off to the intro. Reduced motion bypasses the opening and mouse parallax. An image fallback remains available when WebGL or texture loading fails.
- **Kallak menu:** a generated emerald-and-gold panel in the lower 32% of the stage. Start game is primary; How to play and Settings are secondary. Decorative text is removed on small screens.
- **Intro:** Westwood is followed by the AkulaFlow card inside the canvas sequence, then Kallak. The studio mark is not a webpage overlay.
- **Buttons:** green beveled fill, parchment labels, brass outline; lighter hover, darker pressed state and visible keyboard focus. Disabled controls lower opacity.
- **Help/settings:** deep green bordered panels with an explicit Close action. Developer controls remain inside a disclosure.
- **Inventory:** five columns of labeled slots, with a live description of the held item. During sequences or loading, interaction is disabled.

Generated interface assets live in `public/assets/interface/`:

| File | Selected dimensions | Use |
|---|---:|---|
| `book-cover.webp` | 512 × 768 | Leather cover art and fallback |
| `desk.webp` | 768 × 512 | Table texture and page atmosphere |
| `kyrandia-title.webp` | 600 × 200 | Updated illustrated wordmark |
| `akulaflow-studio.webp` | 320 × 200 | Studio card in the intro |
| `menu-panel.webp` | 640 × 213 | Kallak menu and jewel accents |

Provenance: **Generated with built-in ImageGen for this task, 29Oct2026**. Shipping assets are compressed WebP. AkulaFlow brand reference: `../akula-flow/public/brand/identity.png`. Original game packs and sprites retain their existing provenance.

## Do's and Don'ts

- Do keep the game view unobscured and the next action visible.
- Do preserve the original cursor, pixel density and scene framing.
- Do check the book, menu, help and settings at desktop and narrow mobile sizes.
- Do retain reduced-motion and WebGL-fallback paths.
- Don't replace generated material art with generic gradients or decorative cards.
- Don't add continuous book rendering, oversized downloads or ornamental controls without a functional reason.
