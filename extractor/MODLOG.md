# Localized raster sprites

The Russian variants were edited with the built-in imagegen tool, then fitted once
with nearest-neighbour sampling and snapped to their original indexed palettes,
without dithering. No original English asset is overwritten.

| Asset | Native dimensions | Placement / alpha | Reference |
| --- | --- | --- | --- |
| `public/assets/interface/HUD/options-ru.png` | 54 × 30 | Opaque patch at (9, 163), no rotation | `main15.png`, crop (9, 163, 63, 193) |
| `public/assets/intro/text-ru.png` | 320 × 200 | Full opaque frame at (0, 0); original playback fade | `intro/text.png` |

Both use hard pixel edges and the respective original 256-entry palette. The
button retains its blue sapphire, dark engraved letters and surrounding stone;
the intro retains the purple plaque, gold lettering and vine ornaments.

## Generation prompts

- **Button:** “Text-localization edit. Replace OPTIONS with МЕНЮ, preserving the
  original 54×30 logical pixel grid, faceted cobalt sapphire, dark engraved
  lettering, stone corners and silhouette. No antialiasing, padding or extra
  ornament. The letter Н has two vertical stems and a horizontal crossbar.”
- **Intro:** “Text-localization edit of the original 320×200 title card. Preserve
  black canvas, purple plaque, gold outline and symmetrical vine filigree. Use
  golden DOS bitmap serif lettering with a dark shadow. Four centered lines:
  Злой шут Малколм вырвался / на свободу. Теперь в его власти / источник всей магии /
  этой земли. Hard pixels, no new text or ornaments.”

## Conversion

Requires Pillow, as do the other PNG extraction tools:

```sh
python extractor/localized_sprites.py path/to/generated-button.png path/to/generated-story.png
```

Review at native size and integer zoom in the running game. Russian/English
selection happens in the canvas renderer; there is no HTML text cover-up.
