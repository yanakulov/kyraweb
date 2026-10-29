"""Fit generated Russian sprite edits to the original game's sizes and palettes."""
import argparse
from pathlib import Path

from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("options", type=Path, help="Generated МЕНЮ button crop")
parser.add_argument("story", type=Path, help="Generated Russian Malcolm title card")
args = parser.parse_args()
assets = Path(__file__).resolve().parent.parent / "public" / "assets"

for source, original, target, size in [
    (args.options, "interface/HUD/main15.png", "interface/HUD/options-ru.png", (54, 30)),
    (args.story, "intro/text.png", "intro/text-ru.png", (320, 200)),
]:
    palette = Image.open(assets / original)
    assert palette.mode == "P", "Expected an original indexed palette"
    sprite = Image.open(source).convert("RGB").resize(size, Image.Resampling.NEAREST)
    sprite = sprite.quantize(palette=palette, dither=Image.Dither.NONE)
    sprite.save(assets / target, optimize=True)
    print(f"{target}: {size[0]}x{size[1]}, {(assets / target).stat().st_size} bytes")
