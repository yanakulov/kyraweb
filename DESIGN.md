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
  folio-ink: "#38200d"
  folio-focus: "#82511d"
  folio-fallback: "#d1b885"
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
  folio:
    fontFamily: "Georgia, Times New Roman, serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.4
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

The user's preferred material reference is the earlier coarse, aged table: horizontal boards, visible knots and scars. Match it with rich oxblood leather, worn gilding and brass patina so the book feels tactile and antique.

**Key Characteristics:**
- Original cover art and pixel game scenes, with a physical Blender-modeled book as the entrance.
- Warm candlelight, cool moonlight, parchment lettering and deep green controls.
- Camera motion links the game to its book; a restrained living candle gives the visible table atmosphere.

## Colors

Gold marks actionable edges and emphasis. Paper carries primary text; muted carries supporting labels. Ink and backdrop hold the dark page, while stone and panel separate controls from the wood. Edge is the subdued brass border. Preserve the generated art's purple and emerald jewels rather than recoloring the original game's palette.

## Typography

The bundled Kyrandia font serves game buttons and small control labels. Georgia supplies chapter text, help prose and the book menu: 16px body, 19px main choices and a 26px small-caps heading in dark brown ink. The generated `kyrandia-title.webp` supplies the Kallak menu wordmark inside the stage, avoiding a separate page heading.

## Layout

The opening table fills the viewport. Its book stays framed as the cover opens, including on portrait screens. The invitation sits above the bottom safe area and fades when opening begins. The camera and letterbox converge on the game area's 8:5 framing.

The game page is centered with a maximum width of 1280px and also follows `calc((100svh - 8px) * 1.6)` to fit the available height. The stage retains its 8:5 ratio against a quiet dark backdrop, without a second decorative frame. Fullscreen uses the available 8:5 area.

In gameplay, Options fills the viewport with the open book. The left page carries scrollable controls; the right page carries the captured game frame, treated as ink on parchment while pulled back. Portrait framing favors the control page. Controls become interactive once the pullback finishes, and the underlying game stays inert and paused. If WebGL fails, a centered parchment panel retains the same controls.

At 600px, the Kallak help and settings overlays stack and ornamental menu copy disappears; these introductory overlays remain constrained to the stage. Safe-area padding and pinch zoom remain intact.

Keep displayed touch targets at least 44px. The folio uses 50px-high buttons, 46px inputs/selects and 52px inventory rows before projection. Its focus outline is 2px brown with a −2px offset. The original in-stage controls retain their pale-gold 2px outline with a 4px offset.

## Elevation & Depth

The original game artwork supplies the frame and HUD; introductory dialogs dim the stage behind a deep green panel. The gameplay Options menu instead sits on the left parchment page, with fine brown rules and transparent buttons. Blender supplies beveled, smoothly shaded book and table geometry, with embossed original cover detail, a page block, hinged cover, spine and brass fittings. The spine stays fixed to the back board below the page surface. The candle stands behind the book on its right, outside the cover's opening arc.

The aged walnut map includes its own board seams and covers one solid tabletop. Preserve its coarse grain, knots and wear instead of adding a second set of geometric seams.

Warm candlelight and cool moonlight separate the book from the table. Half-resolution GTAO supplies contact depth (radius 0.22, thickness 0.12, blend intensity 0.65); restrained bloom uses threshold 2.8, strength 0.12 and radius 0.25. Film grading and a soft vignette shape the 3D scene. AO, bloom and grading fade away between 55% and 95% of the zoom; the final frame renders directly with the original image's exact pixel colors.

The visible candle bends and changes height gently while its emissive glow and point light vary together. Settled book views render at up to 30fps; camera transitions use the display refresh rate. Hidden documents suspend rendering and transition clocks. Reduced motion freezes the candle, removes mouse parallax and bypasses opening/return motion; rendering stops after the static view settles.

## Shapes

Controls and panels have square corners. Borders are thin, layered and material-colored. The book uses physical thickness and softly beveled edges rather than a flat illustration or stacked sharp boxes. Its detailed 3D materials coexist with the original pixel game scenes; the canvas and pixel decorations retain nearest-style rendering.

## Components

- **Book:** one clear Open the book action, also available by clicking the book surface. The 8.9-second sequence opens the hinge at 0–2.2 seconds, traces contours at 1.8–4.2 seconds, washes in color at 4.5–6.2 seconds and zooms into the picture at 6.5–8.9 seconds. The page begins bare; contours, sparse hatching and a small gold drawing trace appear on its physical, lit parchment. The source is exactly `assets/intro/logo_bg.png`, interpreted as ink rather than a grayscale photo on a flat plane. Only the final camera approach blends into the unlit original game frame. The completed book view remains visible until `onFirstFrame` confirms that the intro has drawn. Reduced motion bypasses the opening and mouse parallax. The embossed-cover image remains the fallback when WebGL or model loading fails.
- **Kallak menu:** a generated emerald-and-gold panel in the lower 32% of the stage. Start game is primary; Load game appears when a valid save exists, alongside How to play and Settings. Decorative text is removed on small screens.
- **Intro:** the book picture, Westwood and the transparent AkulaFlow mark share the original `assets/intro/logo_bg.png` landscape. Westwood and AkulaFlow retain their reveal and fade inside the canvas sequence; the remaining original intro leads to Kallak.
- **Buttons:** green beveled fill, parchment labels, brass outline; lighter hover, darker pressed state and visible keyboard focus. Disabled controls lower opacity.
- **Options:** the HUD button immediately pauses the game, then pulls the exact captured frame back onto the right book page over 1.4 seconds. The left page offers Resume, Save game, Load game, Inventory, Settings and How to play. Settings includes fullscreen, main menu, replay intro and credits. Resume or Escape zooms back over 1.2 seconds, beginning at the current zoom if dismissed early; the engine resumes only after the handoff, without advancing by elapsed menu time. Focus stays in the menu and returns to its launcher. Kallak's introductory settings/help retain their smaller stage overlays.
- **Saved chapters:** three manual slots show name, location, local date/time and a pixel thumbnail. Replacing an occupied or damaged slot requires confirmation. Saves retain the full world state, not just the current picture; saving is unavailable during unfinished scripted actions, transitions or drops. Continue journey on the closed book opens the newest valid save through its captured scene; Load game chooses a slot. Invalid slots display their own errors without hiding usable slots, and storage failures preserve existing saves. Saves remain local to this browser/device.
- **Inventory:** the book page has five columns of labeled slots and the held item's name. Choosing a slot returns through the captured frame before applying the inventory interaction. During sequences or loading, interaction is disabled.

Interface assets live in `public/assets/interface/`:

| File | Use and provenance |
|---|---|
| `storybook.glb.gz` | Blender-modeled scene exported by `extractor/model_storybook.py`; editable `.blend` retained in ignored `.reference/` |
| `book-cover.webp` | Original user-supplied Kyrandia retail cover treated as embossed leather, also used for the fallback |
| `kyrandia-title.webp` | Generated illustrated wordmark |
| `akulaflow-studio.webp` | Generated transparent studio mark over the original intro landscape |
| `menu-panel.webp` | Generated Kallak menu inside the stage |

Generated art provenance: **Generated with built-in ImageGen for this task, 29Oct2026**. Raster interface assets ship as compressed WebP. This attribution does not apply to the original retail cover or `public/assets/intro/logo_bg.png`; those remain original game artwork. AkulaFlow brand reference: `../akula-flow/public/brand/identity.png`. Original game packs and sprites retain their existing provenance.

Blender material source `extractor/materials/aged-walnut.webp` restores the earlier generated `desk.webp` from commit `d675c1e` (Git blob `f3a77cada10d35981cae7d3aaec9335241801eb2`). Its texture is embedded in `storybook.glb.gz`, with no duplicate runtime image download.

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
- Don't render the candle while hidden or under reduced motion, advance game clocks behind Options, or replace the captured scene with a generic book illustration.
- Don't add oversized downloads or ornamental controls without a functional reason.
