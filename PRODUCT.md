# Kyrandia Web

A browser reimagining of The Legend of Kyrandia, Book One of Fables & Fiends. The experience serves players who want the original adventure's scenes, dialogue, animation and point-and-click interaction on desktop and touch screens.

## Product commitments

- Preserve the original game's pixel art, story, scene geometry and gameplay behavior. New presentation surrounds the game rather than obscuring its viewport.
- Present Book One as a tangible leather book on a wooden desk. Opening its cover begins the game presentation.
- Keep the intro sequence explicit: Westwood, the AkulaFlow studio card, then Kallak's animated menu. Starting the game continues the original opening.
- Make the main action clear at every stage: Open the book, Start game, then explore. Help and settings remain reachable without introducing unrelated marketing sections.
- Desktop uses the original cursor. Touch uses a persistent cursor guided by swipes, with a tap to interact. Dialogue taps skip the current line. Preserve pinch zoom and usable inventory targets.
- Keep download size measured. Original graphics use indexed scene packs; new interface illustrations use compressed WebP. Three.js is confined to the book presentation.

## Authority and scope

The user's direction is old Kyrandia: restrained fantasy materials, gems, pixel graphics, a softer illustrated title and a real three-dimensional opening book. The implemented references are `src/App.vue`, `src/styles.css`, `src/components/FantasyBook.vue` and `src/engine/intro/steps.ts`. `DESIGN.md` documents their visual system.

Original game credit remains Westwood Studios (1992); web remake credit remains Yan Akulov. The AkulaFlow mark is a new studio presentation based on the local brand reference at `../akula-flow/public/brand/identity.png`.
