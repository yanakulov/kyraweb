#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

OP_BODY_START = 0xFF81
OP_BODY_UNK = 0xFF82
OP_BODY_END = 0xFF83
OP_SPRITE_DEFS = 0xFF84
OP_SPRITE_DEFS_END = 0xFF85
OP_ANIM_START = 0xFF86
OP_ANIM_END = 0xFF87


def decode_scene_dat(path: Path) -> dict:
    data = path.read_bytes()
    if len(data) < 0x15:
        raise ValueError(f"Scene dat too small: {path}")
    draw_layer_table = list(data[0x0D:0x15])
    sprite_defs, anims = parse_scene_body(data)
    return {
        "format": "kyra-scene-meta",
        "scene": path.stem.upper(),
        "drawLayerTable": draw_layer_table,
        "spriteDefs": sprite_defs,
        "anims": anims
    }


def parse_scene_body(data: bytes) -> tuple[list[dict], list[dict]]:
    if len(data) <= 0x6D:
        return [], []

    pos = 0x6B
    length = int.from_bytes(data[pos:pos + 2], "little")
    pos += 2
    end = min(pos + length, len(data))

    sprite_defs: list[dict] = []
    anims: list[dict] = []

    while pos + 2 <= end:
        code = int.from_bytes(data[pos:pos + 2], "little")
        if code == OP_BODY_END:
            pos += 2
            break
        if code in (OP_BODY_START, OP_BODY_UNK):
            pos += 2
            continue
        if code == OP_SPRITE_DEFS:
            pos += 2
            while pos + 2 <= end:
                sprite_num = int.from_bytes(data[pos:pos + 2], "little")
                if sprite_num == OP_SPRITE_DEFS_END:
                    pos += 2
                    break
                x = int.from_bytes(data[pos + 2:pos + 4], "little") * 8
                y = int.from_bytes(data[pos + 4:pos + 6], "little")
                w = int.from_bytes(data[pos + 6:pos + 8], "little") * 8
                h = int.from_bytes(data[pos + 8:pos + 10], "little")
                sprite_defs.append({
                    "id": sprite_num,
                    "x": x,
                    "y": y,
                    "w": w,
                    "h": h
                })
                pos += 10
            continue
        if code == OP_ANIM_START:
            anim, new_pos = parse_anim_block(data, pos, end)
            anims.append(anim)
            pos = new_pos
            continue
        pos += 2

    return sprite_defs, anims


def parse_anim_block(data: bytes, start: int, end: int) -> tuple[dict, int]:
    # Based on Sprites::setupSceneAnims
    p = start + 4
    def read16_pad() -> int:
        nonlocal p
        v = int.from_bytes(data[p:p + 2], "little")
        p += 4
        return v

    disable = read16_pad()
    unk2 = read16_pad()
    draw_y = read16_pad()
    p += 4  # skip sceneUnk2
    default_x = read16_pad()
    default_y = read16_pad()
    width = data[p - 4]
    p += 4
    height = data[p - 4]
    p += 4
    sprite = read16_pad()
    flip_x = read16_pad()
    width2 = data[p - 4]
    p += 4
    height2 = data[p - 4]
    p += 4
    unk1 = read16_pad()
    play = int.from_bytes(data[p:p + 2], "little")
    p += 2

    script_start = p
    script: list[int] = []
    while p + 2 <= end:
        v = int.from_bytes(data[p:p + 2], "little")
        script.append(v)
        p += 2
        if v == OP_ANIM_END:
            break

    anim = {
        "disable": disable != 0,
        "unk2": unk2,
        "drawY": draw_y,
        "defaultX": default_x,
        "defaultY": default_y,
        "width": width,
        "height": height,
        "sprite": sprite,
        "flipX": flip_x != 0,
        "width2": width2,
        "height2": height2,
        "unk1": unk1 != 0,
        "play": play != 0,
        "script": script
    }

    return anim, p


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert Kyra .DAT scene metadata to JSON")
    parser.add_argument("src", help="Path to .DAT")
    parser.add_argument("dst", help="Output JSON file")
    args = parser.parse_args()

    src = Path(args.src)
    dst = Path(args.dst)
    payload = decode_scene_dat(src)
    dst.parent.mkdir(parents=True, exist_ok=True)
    dst.write_text(json.dumps(payload, ensure_ascii=True), encoding="utf-8")
    print(f"Wrote {dst}")


if __name__ == "__main__":
    main()
