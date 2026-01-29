#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path


def find_iff_chunk(data: bytes, tag: bytes) -> bytes | None:
    if len(data) < 12 or data[0:4] != b"FORM":
        return None
    pos = 12
    while pos + 8 <= len(data):
        chunk_tag = data[pos:pos + 4]
        size = int.from_bytes(data[pos + 4:pos + 8], "big")
        pos += 8
        if pos + size > len(data):
            break
        chunk = data[pos:pos + size]
        if chunk_tag == tag:
            return chunk
        pos += size + (size % 2)
    return None


def parse_emc_text_strings(data: bytes) -> list[str]:
    text = find_iff_chunk(data, b"TEXT")
    if text is None:
        return []

    offsets: list[int] = []
    min_offset = len(text)
    entries = 0
    for i in range(0, len(text) - 1, 2):
        off = (text[i] << 8) | text[i + 1]
        offsets.append(off)
        entries += 1
        if off and off < min_offset:
            min_offset = off
        # Stop once we've reached the start of the string blob.
        if entries * 2 >= min_offset:
            break

    if min_offset == 0 or min_offset == len(text):
        return []

    strings: list[str] = []
    for i in range(entries):
        off = offsets[i]
        if off == 0:
            strings.append("")
            continue
        end = text.find(b"\x00", off)
        if end == -1:
            end = len(text)
        raw = text[off:end]
        value = raw.decode("latin-1", errors="ignore").replace("\r", " ").strip()
        strings.append(value)
    return strings


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract EMC TEXT chunk strings to JSON")
    parser.add_argument("src", type=Path, help="Path to .EMC")
    parser.add_argument("dst", type=Path, help="Output JSON file")
    args = parser.parse_args()

    data = args.src.read_bytes()
    strings = parse_emc_text_strings(data)
    payload = {
        "format": "kyra-emc-text",
        "source": args.src.name,
        "strings": strings
    }
    args.dst.parent.mkdir(parents=True, exist_ok=True)
    args.dst.write_text(json.dumps(payload, ensure_ascii=True), encoding="utf-8")
    print(f"Wrote {args.dst} ({len(strings)} strings)")


if __name__ == "__main__":
    main()
