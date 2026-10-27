# Browser interface

KyraWeb preserves the original Kyrandia scenes, logo and pixel font. The browser controls support the existing Vue canvas game; they are not a replacement visual identity. Keep original game assets authoritative when extending the interface.

## Scene geometry

- The canvas has a logical resolution of **320 × 200**. Its responsive stage keeps an **8:5** aspect ratio and uses pixelated rendering. Pointer coordinates and subtitles scale against this logical space.
- In `src/engine/intro/player.ts`, eligible intro steps mask the bottom UI area from **y = 136** through the bottom of the canvas. Keep the existing `NO_UI_OVERLAY` exceptions. The Kallak menu starts at **68%** of the stage height, matching `136 / 200`; changing either value independently creates a visible seam.
- The original logo at `/assets/interface/HUD/game-logo.png` uses stage-relative positioning: **left 6.25%, top 26%, width 50%**. Preserve these proportions across viewport sizes.
- The main container is at most **976px** wide. Below **600px**, frame padding shrinks, toolbar actions occupy their own row, and settings fields stack. Short landscape viewports (height at most **500px**) hide the masthead, credits and hint to give the scene room.

## Controls and states

The Kallak writing scene loops while its menu is displayed. **Start game** dismisses the menu and exits that loop so the intro can continue. The button is disabled during dismissal. The logo and menu fade together over **400ms**, quantized into 12 steps; `prefers-reduced-motion: reduce` makes that dismissal immediate. This preference applies to the menu dismissal, not the original game's entire animation timeline.

Clicking or tapping the scene does not skip the intro. After it finishes, the original TRUNK → GEM → GEMCUT opening plays: Brandon uses the lift, enters his home and discovers Kallak. Movement and item input are locked during these sequences. The upper trunk can be tapped to start the original tree conversation; the first south-exit attempt also starts it. All 29 lines and original WSA animation commands finish before control returns. Dialogue appears through the same pixel-font subtitle overlay used by the intro.

During gameplay, a click interacts with an item or sets a walking target. **Menu** restarts at the Kallak writing menu; **Replay intro** restarts the intro from its beginning. Neither control is a pause/resume action.

The first forest region supports walking through scene edges, doors and the lift. Hovering an exit changes the cursor direction; tapping the same region works on phones. The hint names the current location. Transitions wait until Brandon reaches the approach point, retain inventory and room state, and report loading/retry status outside the game image. See [world.md](world.md) for the current boundary at the broken bridge.

Browser controls and settings sit below the scene. Settings exposes walk speed and replay; a collapsed **Developer tools** disclosure contains the walk mask, layer information, intro scene selector, walk animation interval and mask opacity. Keep these controls outside the scene rather than covering original artwork.

Settings also includes **Window dust**, a subtle optional pixel effect in Kallak's room and writing scene. Reduced motion disables it. While scene resources load, the hint reports loading and the intro timeline waits. Resource storage and renderer details are documented in [resources.md](resources.md).

Fullscreen is shown only when `document.fullscreenEnabled` is true. It targets the application container, follows `fullscreenchange`, and hides the control if a request fails. Fullscreen keeps controls available and hides the credits. A resource-loading failure displays an alert and **Try again**, which restarts the intro; this also covers failures after playback has begun.

## Styling and accessibility

`src/styles.css` owns the shared palette: dark ink and stone surfaces, muted purple edges, gold controls and pale text. The bundled `/assets/font/kyrandia.otf` is the primary typeface. Retain square corners, pixel imagery and beveled button borders; use the existing CSS variables instead of introducing another palette.

Buttons and selects have at least **44px** height. The start button scales its type and height with the stage, with a 44px minimum. Keyboard focus has a visible outline; hover styling is limited to hover-capable devices. Settings reports its expanded state, the game hint uses a polite live region, and load errors use an alert. Preserve safe-area padding and the `viewport-fit=cover` viewport setting.

## Verification

The interface refinement was checked with **14 passing automated tests**, `npm run typecheck`, `npm run build`, and browser viewport checks at 1280×900, 390×844, 319×720 and 844×390. These checks are a snapshot, not a guarantee for subsequent changes.

The subsequent indexed-renderer update passed **21 automated tests**, typecheck and build. The implementing agent also verified the rendering browser fixture, the real application's HTTP 503/retry recovery, and updated viewport captures at widths of 1280, 390 and 319 pixels.

For future interface edits, check desktop, narrow portrait and short landscape layouts; verify the y=136 menu boundary, logo placement, usable start button, settings outside the canvas, reduced-motion dismissal and fullscreen availability. Exercise intro replay, menu return and startup retry when changing their handlers.
