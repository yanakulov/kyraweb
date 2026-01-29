#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import struct
from typing import Dict, List, Optional, Tuple


def read_u32_be(b: bytes) -> int:
    return struct.unpack(">I", b)[0]


def sign8(v: int) -> int:
    v &= 0xFF
    return v - 0x100 if v & 0x80 else v


def sign16(v: int) -> int:
    v &= 0xFFFF
    return v - 0x10000 if v & 0x8000 else v


def parse_emc_chunks(path: str) -> Dict[str, bytes]:
    with open(path, "rb") as f:
        header = f.read(12)
        if len(header) < 12 or header[0:4] != b"FORM":
            raise ValueError("Not an IFF FORM file")
        # size = read_u32_be(header[4:8])  # unreliable for EMC2
        form_type = header[8:12]
        if form_type != b"EMC2":
            raise ValueError(f"Unexpected FORM type: {form_type!r}")

        chunks: Dict[str, bytes] = {}
        while True:
            chunk_header = f.read(8)
            if len(chunk_header) < 8:
                break
            tag = chunk_header[0:4].decode("ascii", "replace")
            size = read_u32_be(chunk_header[4:8])
            data = f.read(size)
            if len(data) < size:
                break
            # Pad to even size
            if size & 1:
                f.read(1)
            chunks[tag] = data
    return chunks


def to_u16_list_be(data: bytes) -> List[int]:
    if len(data) % 2 != 0:
        data = data[: len(data) - 1]
    return [struct.unpack(">H", data[i : i + 2])[0] for i in range(0, len(data), 2)]


class EMCState:
    STACK_SIZE = 100

    def __init__(self, data: List[int], ordr: List[int]) -> None:
        self.data = data
        self.ordr = ordr
        self.ip: Optional[int] = None
        self.ret_value = 0
        self.bp = self.STACK_SIZE + 1
        self.sp = self.STACK_SIZE - 1
        self.regs = [0] * 30
        self.stack = [0] * self.STACK_SIZE
        self.stack[self.STACK_SIZE - 1] = 0

    def stack_pos(self, offset: int) -> int:
        idx = self.sp + offset
        if 0 <= idx < self.STACK_SIZE:
            return self.stack[idx]
        return 0

    def stack_get(self, idx: int) -> int:
        if 0 <= idx < self.STACK_SIZE:
            return self.stack[idx]
        return 0

    def stack_set(self, idx: int, value: int) -> None:
        if 0 <= idx < self.STACK_SIZE:
            self.stack[idx] = value


SYS_DRAW_SCENE_ANIM_SHAPE = 0x03
SYS_DRAW_ANIM_SHAPE = 0x0D
SYS_DRAW_ITEM_SHAPE = 0x62
SYS_DROP_ITEM_IN_SCENE = 0x0C
SYS_ITEM_APPEARS_ON_GROUND = 0x7C


class EMCExtractor:
    def __init__(self, data: List[int], ordr: List[int]) -> None:
        self.data = data
        self.ordr = ordr
        self.scene_shapes: List[Dict[str, int]] = []
        self.scene_anim_shapes: List[Dict[str, int]] = []
        self.item_shapes: List[Dict[str, int]] = []
        self.drop_items: List[Dict[str, int]] = []
        self.ground_items: List[Dict[str, int]] = []

    def run_function(self, fn_index: int, step_limit: int = 20000) -> None:
        state = EMCState(self.data, self.ordr)
        if fn_index < 0 or fn_index >= len(self.ordr):
            return
        start = self.ordr[fn_index]
        if start == 0xFFFF:
            return
        state.ip = start

        steps = 0
        while state.ip is not None:
            if steps > step_limit:
                break
            steps += 1

            if state.ip < 0 or state.ip >= len(self.data):
                break

            code_u = self.data[state.ip] & 0xFFFF
            state.ip += 1

            opcode = (code_u >> 8) & 0x1F

            if code_u & 0x8000:
                opcode = 0
                param = code_u & 0x7FFF
            elif code_u & 0x4000:
                param = sign8(code_u & 0xFF)
            elif code_u & 0x2000:
                if state.ip >= len(self.data):
                    break
                param = sign16(self.data[state.ip])
                state.ip += 1
            else:
                param = 0

            if opcode == 0:  # jmp
                state.ip = param
            elif opcode == 1:  # setRetValue
                state.ret_value = param
            elif opcode == 2:  # pushRetOrPos
                if param == 0:
                    state.sp -= 1
                    state.stack_set(state.sp, state.ret_value)
                elif param == 1:
                    state.sp -= 1
                    state.stack_set(state.sp, state.ip + 1)
                    state.sp -= 1
                    state.stack_set(state.sp, state.bp)
                    state.bp = state.sp + 2
                else:
                    state.ip = None
            elif opcode == 3:  # push
                state.sp -= 1
                state.stack_set(state.sp, param)
            elif opcode == 4:  # push
                state.sp -= 1
                state.stack_set(state.sp, param)
            elif opcode == 5:  # pushReg
                state.sp -= 1
                state.stack_set(state.sp, state.regs[param])
            elif opcode == 6:  # pushBPNeg
                idx = (-(param + 2)) + state.bp
                state.sp -= 1
                state.stack_set(state.sp, state.stack_get(idx))
            elif opcode == 7:  # pushBPAdd
                idx = (param - 1) + state.bp
                state.sp -= 1
                state.stack_set(state.sp, state.stack_get(idx))
            elif opcode == 8:  # popRetOrPos
                if param == 0:
                    state.ret_value = state.stack_get(state.sp)
                    state.sp += 1
                elif param == 1:
                    if state.sp >= EMCState.STACK_SIZE - 1:
                        state.ip = None
                    else:
                        state.bp = state.stack_get(state.sp)
                        state.sp += 1
                        addr = state.stack_get(state.sp)
                        state.sp += 1
                        state.ip = addr
                else:
                    state.ip = None
            elif opcode == 9:  # popReg
                state.regs[param] = state.stack_get(state.sp)
                state.sp += 1
            elif opcode == 10:  # popBPNeg
                idx = (-(param + 2)) + state.bp
                value = state.stack_get(state.sp)
                state.sp += 1
                state.stack_set(idx, value)
            elif opcode == 11:  # popBPAdd
                idx = (param - 1) + state.bp
                value = state.stack_get(state.sp)
                state.sp += 1
                state.stack_set(idx, value)
            elif opcode == 12:  # addSP
                state.sp += param
            elif opcode == 13:  # subSP
                state.sp -= param
            elif opcode == 14:  # sysCall
                self.on_syscall(fn_index, state, param & 0xFF)
                state.ret_value = 0
            elif opcode == 15:  # ifNotJmp
                cond = state.stack_get(state.sp)
                state.sp += 1
                if not cond:
                    state.ip = param & 0x7FFF
            elif opcode == 16:  # negate
                value = state.stack_get(state.sp)
                if param == 0:
                    state.stack_set(state.sp, 0 if value else 1)
                elif param == 1:
                    state.stack_set(state.sp, -value)
                elif param == 2:
                    state.stack_set(state.sp, ~value)
                else:
                    state.ip = None
            elif opcode == 17:  # eval
                val1 = state.stack_get(state.sp)
                state.sp += 1
                val2 = state.stack_get(state.sp)
                state.sp += 1

                if param == 0:
                    ret = 1 if (val2 and val1) else 0
                elif param == 1:
                    ret = 1 if (val2 or val1) else 0
                elif param == 2:
                    ret = 1 if (val1 == val2) else 0
                elif param == 3:
                    ret = 1 if (val1 != val2) else 0
                elif param == 4:
                    ret = 1 if (val1 > val2) else 0
                elif param == 5:
                    ret = 1 if (val1 >= val2) else 0
                elif param == 6:
                    ret = 1 if (val1 < val2) else 0
                elif param == 7:
                    ret = 1 if (val1 <= val2) else 0
                elif param == 8:
                    ret = val1 + val2
                elif param == 9:
                    ret = val2 - val1
                elif param == 10:
                    ret = val1 * val2
                elif param == 11:
                    ret = int(val2 / val1) if val1 else 0
                elif param == 12:
                    ret = val2 >> val1
                elif param == 13:
                    ret = val2 << val1
                elif param == 14:
                    ret = val1 & val2
                elif param == 15:
                    ret = val1 | val2
                elif param == 16:
                    ret = val2 % val1 if val1 else 0
                elif param == 17:
                    ret = val1 ^ val2
                else:
                    state.ip = None
                    continue

                state.sp -= 1
                state.stack_set(state.sp, ret)
            elif opcode == 18:  # setRetAndJmp
                if state.sp >= EMCState.STACK_SIZE - 1:
                    state.ip = None
                else:
                    state.ret_value = state.stack_get(state.sp)
                    state.sp += 1
                    temp = state.stack_get(state.sp)
                    state.sp += 1
                    state.stack_set(EMCState.STACK_SIZE - 1, 0)
                    state.ip = temp
            else:
                state.ip = None

    def on_syscall(self, fn_index: int, state: EMCState, syscall_id: int) -> None:
        if syscall_id == SYS_DRAW_SCENE_ANIM_SHAPE:
            self.scene_anim_shapes.append(
                {
                    "func": fn_index,
                    "shape": state.stack_pos(0),
                    "x": state.stack_pos(1),
                    "y": state.stack_pos(2),
                    "flags": state.stack_pos(3),
                    "page": state.stack_pos(4),
                }
            )
            return
        if syscall_id == SYS_DRAW_ANIM_SHAPE:
            self.scene_shapes.append(
                {
                    "func": fn_index,
                    "shape": state.stack_pos(0),
                    "x": state.stack_pos(1),
                    "y": state.stack_pos(2),
                    "flags": state.stack_pos(3),
                }
            )
        elif syscall_id == SYS_DRAW_ITEM_SHAPE:
            self.item_shapes.append(
                {
                    "func": fn_index,
                    "item": state.stack_pos(0),
                    "x": state.stack_pos(1),
                    "y": state.stack_pos(2),
                    "flags": state.stack_pos(3),
                    "onlyHidPage": state.stack_pos(4),
                }
            )
        elif syscall_id == SYS_DROP_ITEM_IN_SCENE:
            self.drop_items.append(
                {
                    "func": fn_index,
                    "item": state.stack_pos(0),
                    "x": state.stack_pos(1),
                    "y": state.stack_pos(2),
                }
            )
        elif syscall_id == SYS_ITEM_APPEARS_ON_GROUND:
            self.ground_items.append(
                {
                    "func": fn_index,
                    "item": state.stack_pos(0),
                    "x": state.stack_pos(1),
                    "y": state.stack_pos(2),
                }
            )


def extract_emc(path: str) -> Dict[str, object]:
    chunks = parse_emc_chunks(path)
    if "ORDR" not in chunks or "DATA" not in chunks:
        raise ValueError("Missing ORDR/DATA chunks")

    ordr = to_u16_list_be(chunks["ORDR"])
    data = to_u16_list_be(chunks["DATA"])

    extractor = EMCExtractor(data, ordr)
    for fn_index, offset in enumerate(ordr):
        if offset != 0xFFFF:
            extractor.run_function(fn_index)

    return {
        "file": os.path.basename(path),
        "sceneShapes": extractor.scene_shapes,
        "sceneAnimShapes": extractor.scene_anim_shapes,
        "itemShapes": extractor.item_shapes,
        "dropItems": extractor.drop_items,
        "groundItems": extractor.ground_items,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract EMC draw calls to JSON")
    parser.add_argument("src", help="Path to .EMC file")
    parser.add_argument("dst", help="Output JSON path")
    args = parser.parse_args()

    result = extract_emc(args.src)

    os.makedirs(os.path.dirname(args.dst), exist_ok=True)
    with open(args.dst, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2)

    print(f"Wrote {args.dst}")


if __name__ == "__main__":
    main()
