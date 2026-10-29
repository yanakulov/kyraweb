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

Old leather, wood, aged gold and emerald fittings make the browser feel part of Kyrandia. A Blender-modeled book carries a cleaned version of the supplied original cover composition embossed into leather, with only The Legend of Kyrandia title retained. Controls read as ink printed on its pages. The original 320 × 200 game fills the stage once the camera enters the book, with no external masthead, toolbar or footer.

The user's preferred material reference is the earlier coarse, aged table: horizontal boards, visible knots and scars. Match it with rich oxblood leather, worn gilding and brass patina so the book feels tactile and antique.

**Key Characteristics:**
- Original cover composition and pixel game scenes, with a physical Blender-modeled book as the entrance.
- Dim surroundings, warm candlelight, a subtle emerald cursor glow and dark ink on aged parchment.
- Camera motion links the game to its book; a restrained living candle gives the visible table atmosphere.

## Colors

Gold marks actionable edges and emphasis. Paper carries primary text; muted carries supporting labels. Ink and backdrop hold the dark page, while stone and panel separate controls from the wood. Edge is the subdued brass border. Preserve the generated art's purple and emerald jewels rather than recoloring the original game's palette.

## Typography

The bundled Kyrandia font serves game buttons and small control labels and includes Cyrillic. Georgia supplies chapter text, help prose and the book menu: 16px body, 19px main choices and a 25px small-caps heading in dark brown ink. Main menu branding is a restrained book frontispiece; no separate page wordmark surrounds the game.

## Layout

The opening table fills the viewport. Its book stays framed as the cover opens, including on portrait screens. The invitation sits above the bottom safe area and fades when opening begins. The camera and letterbox converge on the game area's 8:5 framing.

The game page is centered with a maximum width of 1280px and also follows `calc((100svh - 8px) * 1.6)` to fit the available height. The stage retains its 8:5 ratio against a quiet dark backdrop, without a second decorative frame. Fullscreen uses the available 8:5 area.

In gameplay, Options fills the viewport with the open book. The left page carries scrollable controls; the right page carries the top 320 × 136 pixels of the captured game frame, preserving the location and characters without the HUD. A soft tonal wash supports recognizable shapes beneath restrained contours and hatching. The complete 320 × 200 frame returns during the color transition into gameplay. Portrait framing favors the control page. Controls become interactive once the pullback finishes, and the underlying game stays inert and paused. If WebGL fails, a centered parchment panel retains the same controls.

Kallak's intro frame pulls back into the same book presentation for Start Journey, Load game, Settings and How to play. Settings use two aligned fields with labels above their controls. Long Russian text can wrap and the page scrolls independently. Safe-area padding and pinch zoom remain intact.

Keep displayed touch targets at least 44px. The folio uses 50px main choices and 44px buttons, inputs and custom dropdown rows before projection. Its focus outline is 2px brown with a −2px offset. The original in-stage controls retain their pale-gold 2px outline with a 4px offset. Inventory is available through the original HUD, not a second book page.

## Elevation & Depth

The original game artwork supplies the frame and HUD. Main menu, Options, help and settings all sit on the left parchment page, with fine brown rules and transparent buttons. Blender supplies beveled, smoothly shaded book and table geometry, with embossed cover detail, a page block, hinged cover, spine and brass fittings. The spine stays fixed to the back board below the page surface. The candle stands behind the book on its right, outside the cover's opening arc.

The aged walnut map includes its own board seams and covers one solid tabletop. Preserve its coarse grain, knots and wear instead of adding a second set of geometric seams.

Low ambient light leaves the table dim; the warm candle supplies the main illumination. A subtle emerald light follows the cursor locally across the book. Half-resolution GTAO supplies contact depth (radius 0.22, thickness 0.12, blend intensity 0.65); restrained bloom uses threshold 2.8, strength 0.12 and radius 0.25. Film grading and a soft vignette shape the 3D scene. AO, bloom and grading fade away between 55% and 95% of the zoom; the final frame renders directly with the original image's exact pixel colors.

The visible candle bends and changes height gently while its emissive glow and point light vary together. Settled book views render at up to 30fps; camera transitions use the display refresh rate. Hidden documents suspend rendering and transition clocks. Reduced motion freezes the candle, removes mouse parallax and bypasses opening/return motion; rendering stops after the static view settles.

## Shapes

Controls and panels have square corners. Borders are thin, layered and material-colored. The book uses physical thickness and softly beveled edges rather than a flat illustration or stacked sharp boxes. Its detailed 3D materials coexist with the original pixel game scenes; the canvas and pixel decorations retain nearest-style rendering.

## Components

- **Book:** one clear Open the book action, also available by clicking the book surface. The 8.9-second motion sequence opens the hinge at 0–2.2 seconds, draws ink at 1.8–4.2 seconds, washes in color at 4.5–6.2 seconds and zooms into the picture at 6.5–8.9 seconds. On a first visit, the book holds at the ink spread for the prologue, then continues when the reader enters the legend or skips it. The page begins bare; a soft tonal wash, contours, sparse hatching and a small gold drawing trace appear on its physical, lit parchment. The source is `assets/intro/logo_bg.png`, interpreted as ink rather than a grayscale photo on a flat plane. Only the final camera approach blends into the unlit original game frame. The completed book view remains visible until `onFirstFrame` confirms that the intro has drawn. Reduced motion bypasses camera movement and mouse parallax but leaves the prologue available. The embossed-cover image remains the fallback when WebGL or model loading fails.
- **Kallak menu:** the camera pulls back from Kallak into the open book. Start Journey is primary, followed by Load game, Settings and How to play. The same parchment menu and input patterns serve this stage and gameplay Options.
- **Intro:** the book picture, Westwood and the transparent AkulaFlow mark share the original `assets/intro/logo_bg.png` landscape. Westwood and AkulaFlow retain their reveal and fade inside the canvas sequence; the remaining original intro leads to Kallak.
- **Buttons:** the opening invitation retains its green beveled fill and brass outline. Book menu actions use dark ink on transparent parchment with subtle hover tint, a 2px label shift and a 1px pressed movement. A short ink-appearance transition introduces each page. Keyboard focus remains visible; disabled controls lower opacity. Reduced motion removes these decorative movements.
- **Options:** the HUD button immediately pauses the game, then pulls the captured scene back onto the right book page over 1.4 seconds. The left page offers Resume, Save game, Load game, Settings and How to play. Settings includes language, walking speed, window dust, fullscreen, main menu, replay intro, The story so far and credits. Resume or Escape zooms back over 1.2 seconds, beginning at the current zoom if dismissed early; the engine resumes only after the handoff, without advancing by elapsed menu time. Focus stays in the menu and returns to its launcher.
- **Book dropdowns:** Language and Walk speed use `BookSelect.vue`, with a parchment list, a selected gem mark and a small unfold transition. Arrow keys, Home/End, Enter/Space, Escape and Tab work with the list; an outside click closes it. Escape closes an open dropdown before dismissing Options. The list opens upward when the page has insufficient space below. Do not substitute an unstyled native select.
- **Cursor:** the original game pointer remains visible over HUD Options and shares the canvas touch handlers. The book uses a magical pointer and a restrained local glow; controls inherit that cursor instead of switching to the operating-system hand or arrow.
- **Saved chapters:** three manual slots show name, location, local date/time and a pixel thumbnail. Replacing an occupied or damaged slot requires confirmation. Saves retain the full world state, not just the current picture; saving is unavailable during unfinished scripted actions, transitions or drops. Continue journey on the closed book opens the newest valid save through its captured scene; Load game chooses a slot. Invalid slots display their own errors without hiding usable slots, and storage failures preserve existing saves. Saves remain local to this browser/device.
- **Inventory:** use the original game HUD only; there is no duplicate Inventory item in the book menu.

Interface assets live in `public/assets/interface/`:

| File | Use and provenance |
|---|---|
| `storybook.glb.gz` | Blender-modeled scene exported by `extractor/model_storybook.py`; editable `.blend` retained in ignored `.reference/` |
| `book-cover.webp` | Blender-rendered fallback of the cleaned original cover composition embossed into leather |
| `akulaflow-studio.webp` | Generated transparent studio mark over the original intro landscape |

Generated art provenance: **Generated or edited with built-in ImageGen for this task, 29Oct2026**. Raster interface assets ship as compressed WebP. `extractor/materials/cover-illustration.png` is an ImageGen edit of the user-supplied original cover: it retains the composition and The Legend of Kyrandia title while removing the retail logos, rating and edition labels. Blender turns that edited illustration into bronze and leather relief; it is not a pixel-identical copy of the supplied scan. The original `public/assets/intro/logo_bg.png`, game packs and sprites retain their existing provenance. AkulaFlow brand reference: `../akula-flow/public/brand/identity.png`. The unused generated menu panel and wordmark are retained as `extractor/materials/legacy-menu-panel.webp` and `extractor/materials/legacy-title.webp`, outside runtime downloads.

Blender material source `extractor/materials/aged-walnut.webp` restores the earlier generated `desk.webp` from commit `d675c1e` (Git blob `f3a77cada10d35981cae7d3aaec9335241801eb2`). Its texture is embedded in `storybook.glb.gz`, with no duplicate runtime image download.

Measure the complete production build and packed book model separately after changes; neither has a fixed size promise.

## Language and prehistory

`src/i18n.ts` selects English or Russian from a saved browser preference, falling back to the browser language on a first visit. The book's Language field changes text immediately. `src/locales/ru-game.json` translates 428 existing dialogue strings from the intro, opening, forest and NPC data; UI, location, item and status labels are translated separately. Original engine strings and script timing remain unchanged. Unknown text falls back to its original wording. The Russian text is a translation for this remake, not a claim to reproduce an official localized edition. The original bitmap intro text and readable letter receive Russian overlays.

`src/components/prologue.ts` contains an authored four-page retelling in English and Russian, not a recovered original script. It introduces the Kyragem, the Mystics, Kallak, Brandon and Malcolm without revealing Book Three's solution. The first visit pauses on the illustrated spread for this text; readers can reveal a paragraph, turn pages or skip directly into the legend. Completion is remembered locally, and The story so far in Settings allows rereading. Reduced motion shows text without the typewriter effect.

The prehistory draws on the [original manual's history of Kyrandia](https://www.mocagh.org/miscgame/kyrandia-manual.pdf) and the [official hint book's account of Malcolm's eighteen-year confinement](https://www.mocagh.org/miscgame/kyrandia-hintbook.pdf). Its wording treats the royal murders as an accusation, leaving room for the later perspective described in [Malcolm's Revenge](https://www.gog.com/en/game/legend_of_kyrandia_malcolms_revenge), without disclosing that game's answer.

## Do's and Don'ts

- Do keep the game view unobscured outside explicitly opened dialogs and the next action visible.
- Do keep controls and credits inside the game presentation.
- Do preserve the original cursor, pixel density and scene framing.
- Do check the book, menu, help and settings at desktop and narrow mobile sizes.
- Do retain reduced-motion and WebGL-fallback paths.
- Do preserve the supplied original cover composition, remove its retail labels except the title, and keep the original landscape through the book-to-intro handoff.
- Do check English and Russian wrapping, keyboard dropdown operation and readable ink illustrations without the HUD.
- Do draw the illustration into the physical parchment and remove scene effects before the final original game frame.
- Do keep props outside the cover's hinge arc.
- Don't replace generated material art with generic gradients or decorative cards.
- Don't render the candle while hidden or under reduced motion, advance game clocks behind Options, or replace the captured scene with a generic book illustration.
- Don't add oversized downloads or ornamental controls without a functional reason.
