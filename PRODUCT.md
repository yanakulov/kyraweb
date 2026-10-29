# Kyrandia Web

A browser reimagining of The Legend of Kyrandia, Book One of Fables & Fiends. The experience serves players who want the original adventure's scenes, dialogue, animation and point-and-click interaction on desktop and touch screens.

## Product commitments

- Preserve the original game's pixel art, story, scene geometry and gameplay behavior. Keep the interface inside the game stage, with no external masthead, toolbar or footer.
- Present Book One as a Blender-modeled leather book on a fullscreen wooden desk. Emboss the user-supplied original Kyrandia retail cover into its leather; do not replace the original composition with invented cover art.
- Opening the cover reveals the original intro landscape in monochrome. Its color returns before the camera enters the picture. Keep the book visible until the intro's first frame is ready, then continue with Westwood and the AkulaFlow studio mark over that same landscape. The remaining original intro leads to Kallak's animated menu.
- Make the main action clear at every stage: Open the book, Start game, then explore. The original HUD Options button opens settings, help, fullscreen and inventory within the stage. Credits belong inside Options.
- Desktop uses the original cursor. Touch uses a persistent cursor guided by swipes, with a tap to interact. Dialogue taps skip the current line. Preserve pinch zoom and usable inventory targets.
- Keep download size measured. Original graphics use indexed scene packs; new interface illustrations use compressed WebP. Three.js is confined to the book presentation.

## Authority and scope

The user's direction is old Kyrandia: restrained fantasy materials, gems, pixel graphics, a softer illustrated title and a real three-dimensional opening book. The implemented references are `src/App.vue`, `src/styles.css`, `src/components/FantasyBook.vue`, `src/components/bookTransition.ts` and `src/engine/intro/steps.ts`. The Blender source recipe is `extractor/model_storybook.py`; the browser loads `public/assets/interface/storybook.glb.gz`. The editable `.blend` remains in ignored `.reference/`. `DESIGN.md` documents the visual system.

Original game credit remains Westwood Studios (1992); web remake credit remains Yan Akulov. The AkulaFlow mark is a new studio presentation based on the local brand reference at `../akula-flow/public/brand/identity.png`.
