#!/usr/bin/env python3
from __future__ import annotations

import argparse
import struct
from pathlib import Path
from typing import List, Optional, Tuple

from PIL import Image


def read_le16(data: bytes, pos: int) -> int:
    return data[pos] | (data[pos + 1] << 8)


def read_le32(data: bytes, pos: int) -> int:
    return data[pos] | (data[pos + 1] << 8) | (data[pos + 2] << 16) | (data[pos + 3] << 24)


def decode_frame4(src: bytes, size: int) -> bytearray:
    dst = bytearray(size)
    dst_pos = 0
    src_pos = 0
    dst_end = size

    while True:
        count = dst_end - dst_pos
        if count == 0:
            break
        code = src[src_pos]
        src_pos += 1

        if not (code & 0x80):
            length = min(count, (code >> 4) + 3)
            offs = ((code & 0x0F) << 8) | src[src_pos]
            src_pos += 1
            from_pos = dst_pos - offs
            for _ in range(length):
                dst[dst_pos] = dst[from_pos]
                dst_pos += 1
                from_pos += 1
        elif code & 0x40:
            length = (code & 0x3F) + 3
            if code == 0xFE:
                length = read_le16(src, src_pos)
                src_pos += 2
                if length > count:
                    length = count
                val = src[src_pos]
                src_pos += 1
                dst[dst_pos:dst_pos + length] = bytes([val]) * length
                dst_pos += length
            else:
                if code == 0xFF:
                    length = read_le16(src, src_pos)
                    src_pos += 2
                offs = read_le16(src, src_pos)
                src_pos += 2
                if length > count:
                    length = count
                from_pos = offs
                for _ in range(length):
                    dst[dst_pos] = dst[from_pos]
                    dst_pos += 1
                    from_pos += 1
        elif code != 0x80:
            length = min(count, code & 0x3F)
            dst[dst_pos:dst_pos + length] = src[src_pos:src_pos + length]
            src_pos += length
            dst_pos += length
        else:
            break

    return dst


def decode_frame_delta(dst: bytearray, src: bytes, no_xor: bool = False) -> None:
    pos = 0
    dst_pos = 0
    dst_len = len(dst)
    while pos < len(src):
        code = src[pos]
        pos += 1
        if code == 0:
            if pos + 2 > len(src):
                break
            length = src[pos]
            pos += 1
            val = src[pos]
            pos += 1
            end = min(dst_pos + length, dst_len)
            if no_xor:
                for i in range(dst_pos, end):
                    dst[i] = val
            else:
                for i in range(dst_pos, end):
                    dst[i] ^= val
            dst_pos = end
        elif code & 0x80:
            code -= 0x80
            if code != 0:
                dst_pos += code
            else:
                if pos + 2 > len(src):
                    break
                subcode = read_le16(src, pos)
                pos += 2
                if subcode == 0:
                    break
                if subcode & 0x8000:
                    subcode -= 0x8000
                    if subcode & 0x4000:
                        length = subcode - 0x4000
                        val = src[pos]
                        pos += 1
                        end = min(dst_pos + length, dst_len)
                        if no_xor:
                            for i in range(dst_pos, end):
                                dst[i] = val
                        else:
                            for i in range(dst_pos, end):
                                dst[i] ^= val
                        dst_pos = end
                    else:
                        end = min(dst_pos + subcode, dst_len)
                        if no_xor:
                            dst[dst_pos:end] = src[pos:pos + (end - dst_pos)]
                        else:
                            for i in range(dst_pos, end):
                                dst[i] ^= src[pos + (i - dst_pos)]
                        pos += end - dst_pos
                        dst_pos = end
                else:
                    dst_pos += subcode
        else:
            end = min(dst_pos + code, dst_len)
            if no_xor:
                dst[dst_pos:end] = src[pos:pos + (end - dst_pos)]
            else:
                for i in range(dst_pos, end):
                    dst[i] ^= src[pos + (i - dst_pos)]
            pos += end - dst_pos
            dst_pos = end


def load_palette(palette_path: Optional[Path]) -> Optional[List[int]]:
    if not palette_path:
        return None
    palette_bytes = palette_path.read_bytes()
    palette: List[int] = []
    for i in range(0, min(len(palette_bytes), 768), 3):
        r = palette_bytes[i]
        g = palette_bytes[i + 1]
        b = palette_bytes[i + 2]
        if r <= 63 and g <= 63 and b <= 63:
            r *= 4
            g *= 4
            b *= 4
        palette.extend([r, g, b])
    return palette


def parse_wsa(data: bytes, use_flags: bool) -> Optional[Tuple[int, int, int, int, int, List[int], bytes, int]]:
    if len(data) < 14:
        return None
    pos = 0
    num_frames = read_le16(data, pos); pos += 2
    width = read_le16(data, pos); pos += 2
    height = read_le16(data, pos); pos += 2
    delta_size = read_le16(data, pos); pos += 2
    flags = 0
    if use_flags:
        flags = read_le16(data, pos); pos += 2

    frame_data_offs = read_le32(data, pos); pos += 4
    first_frame = True
    if frame_data_offs == 0:
        first_frame = False
        frame_data_offs = read_le32(data, pos)
        pos += 4

    offsets: List[int] = [0]
    for _ in range(num_frames + 1):
        off = read_le32(data, pos)
        pos += 4
        offsets.append(off)

    if frame_data_offs != 0:
        offsets = [off - frame_data_offs if off else 0 for off in offsets]

    offs_pal = 0x300 if (flags & 1) else 0
    pos += offs_pal

    if pos > len(data):
        return None

    frame_data = data[pos:]
    for off in offsets:
        if off and off > len(frame_data):
            return None

    return num_frames, width, height, delta_size, flags, offsets, frame_data, (1 if first_frame else 0)


def decode_wsa_frames(
    src: Path,
    palette_path: Optional[Path],
    out_dir: Path,
    transparent_index: Optional[int]
) -> None:
    data = src.read_bytes()
    parsed = parse_wsa(data, use_flags=False)
    if parsed is None:
        parsed = parse_wsa(data, use_flags=True)
    if parsed is None:
        raise ValueError("Unsupported or corrupt WSA file")

    num_frames, width, height, delta_size, _flags, offsets, frame_data, first_frame = parsed

    palette = load_palette(palette_path)
    frame = bytearray(width * height)
    delta = bytearray(delta_size)

    if first_frame:
        delta[:] = decode_frame4(frame_data, delta_size)
        decode_frame_delta(frame, delta, no_xor=False)
        write_frame(out_dir, 0, width, height, frame, palette, transparent_index)
        start_index = 1
    else:
        start_index = 0

    for i in range(start_index, num_frames):
        off = offsets[i]
        if off == 0:
            continue
        delta[:] = decode_frame4(frame_data[off:], delta_size)
        decode_frame_delta(frame, delta, no_xor=False)
        write_frame(out_dir, i, width, height, frame, palette, transparent_index)


def write_frame(
    out_dir: Path,
    index: int,
    width: int,
    height: int,
    pixels: bytearray,
    palette: Optional[List[int]],
    transparent_index: Optional[int]
) -> None:
    img = Image.frombytes("P", (width, height), bytes(pixels))
    if palette:
        img.putpalette(palette + [0] * (768 - len(palette)))
    rgba = img.convert("RGBA")
    if transparent_index is not None and transparent_index >= 0:
        mask = Image.frombytes("L", (width, height), bytes(pixels))
        alpha = mask.point(lambda v: 0 if v == transparent_index else 255)
        rgba.putalpha(alpha)
    out_dir.mkdir(parents=True, exist_ok=True)
    rgba.save(out_dir / f"{index:04d}.png")


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert Kyra .WSA to PNG frames")
    parser.add_argument("src", help="Path to .WSA")
    parser.add_argument("dst_dir", help="Output directory for frames")
    parser.add_argument("--palette", type=str, default=None, help="Optional .COL palette")
    parser.add_argument("--transparent-index", type=int, default=0, help="Palette index to treat as transparent")
    args = parser.parse_args()

    palette_path = Path(args.palette) if args.palette else None
    transparent_index = args.transparent_index if args.transparent_index is not None else None
    decode_wsa_frames(Path(args.src), palette_path, Path(args.dst_dir), transparent_index)
    print(f"Wrote frames to {args.dst_dir}")


if __name__ == "__main__":
    main()
