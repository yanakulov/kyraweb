# Kyrandia Web

A browser reimagining of The Legend of Kyrandia, Book One of Fables & Fiends. The experience serves players who want the original adventure's scenes, dialogue, animation and point-and-click interaction on desktop and touch screens.

## Product commitments

- Preserve the original game's pixel art, story, scene geometry and gameplay behavior. Keep controls within the adventure and its book, with no external masthead, toolbar or footer.
- Present Book One as a tactile antique book on a fullscreen aged wooden desk: coarse horizontal boards, knots and scars, rich oxblood leather and worn gilding with patina. Emboss the user-supplied original Kyrandia retail cover into its leather; do not replace the original composition with invented cover art.
- Opening the cover reveals bare parchment. Contours of the original intro landscape draw themselves into the lit paper, with sparse hatching and a small gold trace, before a color wash brings the illustration to life and the camera enters it. Keep the book visible until the intro's first frame is ready, then continue with Westwood and the AkulaFlow studio mark over that same landscape. The remaining original intro leads to Kallak's animated menu.
- Make the main action clear at every stage: Open the book, Start game, then explore. The original HUD Options button pauses the adventure and pulls the current frame back into a fullscreen book spread: controls on the left, the captured scene on the right. Resume returns through that same frame before the game clock restarts. Credits belong inside Options.
- Offer three named manual save slots in this browser and on this device, each with location, time and a scene thumbnail. Save the full world state, including visited rooms, inventory, quest flags, NPCs, scene animation state and gameplay settings. Continue journey opens the latest valid save; Load game allows a specific chapter. Confirm replacement, report damaged slots or blocked/full storage, and preserve existing data when an operation fails.
- Let the visible book's candle and light move together at up to 30 rendered frames per second, with full refresh during camera transitions. Stop rendering while the document is hidden; reduced motion uses a static candle and bypasses book transitions.
- Desktop uses the original cursor. Touch uses a persistent cursor guided by swipes, with a tap to interact. Dialogue taps skip the current line. Preserve pinch zoom and usable inventory targets.
- Keep download size measured. Original graphics use indexed scene packs; new interface illustrations use compressed WebP. Three.js is confined to the book presentation. Measure the complete production build and packed book model separately after changes; neither has a fixed size promise.

## Authority and scope

The user's direction is old Kyrandia: restrained fantasy materials, gems, pixel graphics, a softer illustrated title and a real three-dimensional opening book. The implemented references are `src/App.vue`, `src/styles.css`, `src/components/FantasyBook.vue`, `src/components/BookMenu.vue`, `src/components/storybookInk.ts`, `src/components/bookTransition.ts`, `src/engine/gameplay/saveStorage.ts` and `src/engine/intro/steps.ts`. The Blender source recipe is `extractor/model_storybook.py`; the browser loads `public/assets/interface/storybook.glb.gz`. The editable `.blend` remains in ignored `.reference/`. `DESIGN.md` documents the visual system.

The user's preferred aged desk texture is restored from the earlier generated `desk.webp` into `extractor/materials/aged-walnut.webp`. Blender embeds it in the GLB; it is not a separate runtime download.

Original game credit remains Westwood Studios (1992); web remake credit remains Yan Akulov. The AkulaFlow mark is a new studio presentation based on the local brand reference at `../akula-flow/public/brand/identity.png`.
