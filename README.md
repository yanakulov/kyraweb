# KyraWeb

![The Legend of Kyrandia](public/assets/interface/kyrandia-title.webp)

[Play](https://lok.akulaflow.ru/) · [Engine wiki (Russian)](https://lok.akulaflow.ru/howitworks/) · [Русский README](README.ru.md)

KyraWeb brings the first *Legend of Kyrandia* to the browser. The adventure is playable from the opening lift to the original CD ending and credits. The game uses Westwood’s art, animation, scripts and sound data. **WebKyr** is the TypeScript engine that runs them.

## Playing

Open the pixel-art book to start. On your first visit, pick a control mode and sound settings. The book also holds the prologue, language settings, three manual save slots and an autosave. Saves stay in this browser.

| | Desktop | Touchscreen |
|---|---|---|
| Move and interact | Point and click | Swipe to move the cursor, then tap to act |
| Open the radial inventory in modern mode | Right-click | Tap with two fingers |
| Skip the current line | Click during dialogue | Tap during dialogue |

Classic mode shows the original inventory bar and its **Options** button. Modern mode gives the scene the space taken by that bar and puts **Menu** in the radial inventory. In either mode, Menu opens the book. Text is available in English and Russian. The original CD voices are in English.

The book’s **Dev Menu** opens individual rooms, scene variants, and story checkpoints in a separate session. The optional 3D book is available at [`?book=3d`](https://lok.akulaflow.ru/?book=3d).

## Audio

- **AdLib (OPL2)** is the default. The original score is synthesized in the browser using a Westwood-compatible driver and Nuked OPL3. No extra files are needed.
- **Roland MT-32 / CM-32L** uses Munt for music and effects. Import a compatible pair of Control and PCM ROMs. The browser keeps them locally.
- **SoundFont** uses TinySoundFont with an approximate MT-32 to General MIDI mapping. Select the downloadable GeneralUser GS bank or import an `.sf2` file.

Music, effects, and voices have separate volume controls. [Audio internals and ROM setup](docs/music.md)

## Local development

Use Node.js 20 and npm.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite, normally [localhost:5173/kyraweb/](http://localhost:5173/kyraweb/). The repository includes the prepared assets. Rebuilding the packs from the original resources requires a local DOS CD installation, such as the GOG edition.

```sh
npm test
npm run typecheck
npm run build
npm run check:size
```

## Engine notes

- [Interactive wiki](https://lok.akulaflow.ru/howitworks/) covers palette changes, depth masks, frame deltas, sound, and build sizes.
- [Resource packs](docs/resources.md) and [import tools](extractor/README.md) describe how the original data is converted for the browser.
- [Rooms and scripts](docs/world.md), [movement](docs/movement.md), [animation](docs/animations.md), and [subtitles](docs/subtitles.md) document the game runtime.

Original game © 1992 Westwood Studios. Browser remake by [Yan Akulov and AkulaFlow](https://akulaflow.ru/lab/kyraweb).
