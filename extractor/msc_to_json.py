#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import json
import struct
from typing import List


def decode_ega_get_code(src: bytes, pos: int, nib: int) -> tuple[int, int]:
    # Returns (code, new_pos, new_nib)
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


def decode_frame4(src: bytes, dst_size: int) -> bytearray:
    dst = bytearray(dst_size)
    dst_pos = 0
    src_pos = 0
    dst_end = dst_size

    while True:
        count = dst_end - dst_pos
        if count == 0:
            break

        code = src[src_pos]
        src_pos += 1

        if not (code & 0x80):
            length = min(count, (code >> 4) + 3)
            offs = ((code & 0xF) << 8) | src[src_pos]
            src_pos += 1
            ref = dst_pos - offs
            for _ in range(length):
                dst[dst_pos] = dst[ref]
                dst_pos += 1
                ref += 1
        elif code & 0x40:
            length = (code & 0x3F) + 3
            if code == 0xFE:
                length = struct.unpack_from("<H", src, src_pos)[0]
                src_pos += 2
                if length > count:
                    length = count
                val = src[src_pos]
                src_pos += 1
                dst[dst_pos:dst_pos + length] = bytes([val]) * length
                dst_pos += length
            else:
                if code == 0xFF:
                    length = struct.unpack_from("<H", src, src_pos)[0]
                    src_pos += 2
                offs = struct.unpack_from("<H", src, src_pos)[0]
                src_pos += 2
                if length > count:
                    length = count
                ref = offs
                for _ in range(length):
                    dst[dst_pos] = dst[ref]
                    dst_pos += 1
                    ref += 1
        elif code != 0x80:
            length = min(count, code & 0x3F)
            dst[dst_pos:dst_pos + length] = src[src_pos:src_pos + length]
            dst_pos += length
            src_pos += length
        else:
            break

    return dst


def decode_msc(path: str) -> dict:
    with open(path, "rb") as f:
        raw = f.read()

    comp_type = raw[2]
    img_size = struct.unpack_from("<I", raw, 4)[0]
    pal_size = struct.unpack_from("<H", raw, 8)[0]
    src_ptr = 10 + pal_size
    src = raw[src_ptr:]

    if comp_type == 0:
        pixels = bytearray(src[:img_size])
    elif comp_type == 1:
        pixels = decode_frame1(src, img_size)
    elif comp_type == 3:
        pixels = decode_frame3(src, img_size, is_amiga=False)
    elif comp_type == 4:
        pixels = decode_frame4(src, img_size)
    else:
        raise ValueError(f"Unsupported compression type: {comp_type}")

    # MSC in DOS is 320x144 (mask for the playfield)
    width = 320
    height = img_size // width

    return {
        "format": "kyra-msc",
        "width": width,
        "height": height,
        "compType": comp_type,
        "imgSize": img_size,
        "palSize": pal_size,
        "rawBase64": base64.b64encode(raw).decode("ascii"),
        "pixels": list(pixels)
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Decode Kyra MSC to JSON")
    parser.add_argument("src", help="Path to MSC file")
    parser.add_argument("dst", help="Output JSON file")
    args = parser.parse_args()

    payload = decode_msc(args.src)
    with open(args.dst, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=True)

    print(f"Wrote {args.dst} ({payload['width']}x{payload['height']})")


if __name__ == "__main__":
    main()
