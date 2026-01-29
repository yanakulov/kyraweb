#!/usr/bin/env python3
from __future__ import annotations

import argparse
import os
import re
import struct
from typing import List, Tuple


def _sanitize_name(name: str, index: int) -> str:
    # Allow only safe filename characters
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("._")
    if not cleaned:
        cleaned = f"entry_{index:03d}.bin"
    return cleaned


def _looks_printable(name_bytes: bytes) -> bool:
    return all(32 <= b <= 126 for b in name_bytes)


def parse_directory(data: bytes) -> List[Tuple[str, int]]:
    if len(data) < 4:
        raise ValueError("PAK too small")

    first_off = struct.unpack_from("<I", data, 0)[0]
    pos = 0
    entries: List[Tuple[str, int]] = []

    while pos < first_off:
        if pos + 4 > len(data):
            break
        off = struct.unpack_from("<I", data, pos)[0]
        pos += 4

        name_bytes = bytearray()
        while pos < len(data):
            b = data[pos]
            pos += 1
            if b == 0:
                break
            name_bytes.append(b)
        if not name_bytes:
            continue
        if not _looks_printable(name_bytes):
            # stop parsing if the directory is corrupted/misaligned
            break
        name = name_bytes.decode("ascii", errors="ignore").strip()
        if name:
            entries.append((name, off))

    return entries


def extract_pak(src: str, dst: str) -> None:
    with open(src, "rb") as f:
        data = f.read()

    entries = parse_directory(data)
    if not entries:
        raise ValueError("No entries found in PAK")

    entries = sorted(entries, key=lambda x: x[1])
    os.makedirs(dst, exist_ok=True)

    for i, (name, off) in enumerate(entries):
        next_off = entries[i + 1][1] if i + 1 < len(entries) else len(data)
        size = max(0, next_off - off)
        safe_name = _sanitize_name(name, i)
        out_path = os.path.join(dst, safe_name)
        with open(out_path, "wb") as out:
            out.write(data[off:off + size])

    print(f"Extracted {len(entries)} files to {dst}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract Kyra MSC.PAK files")
    parser.add_argument("src", help="Path to MSC.PAK")
    parser.add_argument("dst", help="Output directory")
    args = parser.parse_args()

    extract_pak(args.src, args.dst)


if __name__ == "__main__":
    main()
