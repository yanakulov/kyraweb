#!/usr/bin/env python3
from __future__ import annotations

import argparse
import struct
from pathlib import Path
from typing import List, Optional, Tuple

from PIL import Image


def decode_ega_get_code(src: bytes, pos: int, nib: int) -> tuple[int, int, int]:
    res = struct.unpack_from(">H", src, pos)[0]
    if (nib + 1) & 1:
        res >>= 4
        return res & 0xFFF, pos + 1, nib + 1
    return res & 0xFFF, pos + 2, nib + 1


def decode_frame1(src: bytes, size: int) -> bytearray:
    dst = bytearray(size)
    dst_end = size

    patterns: List[tuple[int, int]] = []
    num_patterns = 0
    nib = 0
    pos = 0

    code, pos, nib = decode_ega_get_code(src, pos, nib)
    last = code & 0xFF

    dst_pos = 0
    dst_prev = 0
    count = 1
    count_prev = 1

    dst[dst_pos] = last
    dst_pos += 1

    while dst_pos < dst_end:
        code, pos, nib = decode_ega_get_code(src, pos, nib)
        cmd = (code >> 8) & 0xFF

        if cmd:
            cmd -= 1
            code = (cmd << 8) | (code & 0xFF)
            tmp_dst = dst_pos

            if code < num_patterns:
                src_pos = patterns[code][0]
                count_prev = patterns[code][1]
                last = dst[src_pos]
                for _ in range(count_prev):
                    dst[dst_pos] = dst[src_pos]
                    dst_pos += 1
                    src_pos += 1
            else:
                src_pos = dst_prev
                count = count_prev
                for _ in range(count_prev):
                    dst[dst_pos] = dst[src_pos]
                    dst_pos += 1
                    src_pos += 1
                dst[dst_pos] = last
                dst_pos += 1
                count_prev += 1

            if num_patterns < 3840:
                patterns.append((dst_prev, count + 1))
                num_patterns += 1

            dst_prev = tmp_dst
            count = count_prev
        else:
            last = code & 0xFF
            dst[dst_pos] = last
            dst_pos += 1

            if num_patterns < 3840:
                patterns.append((dst_prev, count + 1))
                num_patterns += 1

            dst_prev = dst_pos - 1
            count = 1
            count_prev = 1

    return dst


def decode_frame3(src: bytes, size: int, is_amiga: bool = False) -> bytearray:
    dst = bytearray(size)
    dst_pos = 0
    src_pos = 0
    dst_end = size

    while dst_pos < dst_end:
        code = struct.unpack_from("b", src, src_pos)[0]
        src_pos += 1
        if code == 0:
            if is_amiga:
                sz = struct.unpack_from("<H", src, src_pos)[0]
            else:
                sz = struct.unpack_from(">H", src, src_pos)[0]
            src_pos += 2
            val = src[src_pos]
            src_pos += 1
            dst[dst_pos:dst_pos + sz] = bytes([val]) * sz
            dst_pos += sz
        elif code < 0:
            val = src[src_pos]
            src_pos += 1
            dst[dst_pos:dst_pos - code] = bytes([val]) * (-code)
            dst_pos -= code
        else:
            dst[dst_pos:dst_pos + code] = src[src_pos:src_pos + code]
            dst_pos += code
            src_pos += code

    return dst


def decode_frame4(src: bytes, size: int) -> bytearray:
    dst = bytearray(size)
    dst_pos = 0
    src_pos = 0
    dst_end = size

    def read_le16(pos: int) -> int:
        return src[pos] | (src[pos + 1] << 8)

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
                length = read_le16(src_pos)
                src_pos += 2
                if length > count:
                    length = count
                val = src[src_pos]
                src_pos += 1
                dst[dst_pos:dst_pos + length] = bytes([val]) * length
                dst_pos += length
            else:
                if code == 0xFF:
                    length = read_le16(src_pos)
                    src_pos += 2
                offs = read_le16(src_pos)
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


def decode_cps(path: Path, width: Optional[int], height: Optional[int], palette_path: Optional[Path]) -> tuple[int, int, bytearray, Optional[List[int]]]:
    data = path.read_bytes()
    if len(data) < 10:
        raise ValueError("CPS too small")

    comp_type = data[2]
    img_size = struct.unpack_from("<I", data, 4)[0]
    pal_size = struct.unpack_from("<H", data, 8)[0]

    if img_size == 64000 and (width is None or height is None):
        width = 320
        height = 200

    if width is None or height is None:
        raise ValueError("Width/height must be provided for CPS decode")

    src_ptr = 10 + pal_size
    payload = data[src_ptr:src_ptr + img_size + 16]
    out_size = width * height
    decode_size = out_size if out_size != img_size else img_size

    if comp_type == 0:
        pixels = bytearray(payload[:decode_size])
    elif comp_type == 1:
        pixels = decode_frame1(payload, decode_size)
    elif comp_type == 3:
        pixels = decode_frame3(payload, decode_size, is_amiga=False)
    elif comp_type == 4:
        pixels = decode_frame4(payload, decode_size)
    else:
        raise ValueError(f"Unsupported CPS compression: {comp_type}")

    palette: Optional[List[int]] = None
    if pal_size:
        palette = load_palette_bytes(data[10:10 + pal_size])
    elif palette_path:
        palette = load_palette(palette_path)

    return width, height, pixels, palette


def load_palette_bytes(palette_bytes: bytes) -> List[int]:
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


def write_png(dst: Path, width: int, height: int, pixels: bytearray, palette: Optional[List[int]]) -> None:
    img = Image.frombytes("P", (width, height), bytes(pixels))
    if palette:
        img.putpalette(palette + [0] * (768 - len(palette)))
    img = img.convert("RGBA")
    dst.parent.mkdir(parents=True, exist_ok=True)
    img.save(dst)


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert Kyra .CPS to PNG")
    parser.add_argument("src", help="Path to .CPS")
    parser.add_argument("dst", help="Output PNG file")
    parser.add_argument("--width", type=int, default=None)
    parser.add_argument("--height", type=int, default=None)
    parser.add_argument("--palette", type=str, default=None, help="Optional .COL palette")
    args = parser.parse_args()

    palette_path = Path(args.palette) if args.palette else None
    w, h, pixels, palette = decode_cps(Path(args.src), args.width, args.height, palette_path)
    write_png(Path(args.dst), w, h, pixels, palette)
    print(f"Wrote {args.dst}")


if __name__ == "__main__":
    main()
