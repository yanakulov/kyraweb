// SPDX-License-Identifier: GPL-3.0-or-later
// Kyra 1 EMC2 bytecode, following ScummVM engines/kyra/script/script.cpp.
// Values in the original VM's stack/registers are int16.
export function parseEmc(bytes) {
  const b = Buffer.from(bytes);
  if (b.toString('ascii', 0, 4) !== 'FORM' || b.toString('ascii', 8, 12) !== 'EMC2') throw new Error('Invalid EMC2');
  const chunks = {};
  for (let p = 12; p + 8 <= b.length;) {
    const tag = b.toString('ascii', p, p + 4), size = b.readUInt32BE(p + 4);
    if (p + 8 + size > b.length) throw new Error('Truncated EMC chunk');
    chunks[tag] = b.subarray(p + 8, p + 8 + size);
    p += 8 + size + (size & 1);
  }
  const words = b => Array.from({ length: b.length / 2 }, (_, i) => b.readUInt16BE(i * 2));
  if (!chunks.ORDR || !chunks.DATA) throw new Error('Missing EMC code');
  const text = chunks.TEXT;
  const strings = text ? Array.from({ length: text.readUInt16BE(0) / 2 }, (_, i) => {
    const start = text.readUInt16BE(i * 2), end = text.indexOf(0, start);
    return text.toString('latin1', start, end < 0 ? text.length : end);
  }) : [];
  return { order: words(chunks.ORDR), code: words(chunks.DATA), strings };
}

const int16 = v => (v << 16) >> 16;
export function runEmc(program, fn, syscall, registers = {}, limit = 100000) {
  let ip = program.order[fn], sp = 99, bp = 101, ret = 0, steps = 0;
  const stack = new Int16Array(100), regs = new Int16Array(30);
  for (const [key, value] of Object.entries(registers)) regs[Number(key)] = value;
  if (ip === undefined || ip === 65535) throw new Error(`Missing EMC function ${fn}`);
  const read = i => { if (i < 0 || i >= 100) throw new Error(`EMC stack read ${i}`); return stack[i]; };
  const push = v => { if (--sp < 0) throw new Error('EMC stack overflow'); stack[sp] = v; };
  const pop = () => { const v = read(sp); sp++; return v; };
  while (ip !== null) {
    if (++steps > limit) throw new Error('EMC instruction limit');
    if (ip < 0 || ip >= program.code.length) throw new Error(`EMC invalid address ${ip}`);
    const word = program.code[ip++];
    let op = (word >> 8) & 31, p = 0;
    if (word & 0x8000) { op = 0; p = word & 0x7fff; }
    else if (word & 0x4000) p = (word << 24) >> 24;
    else if (word & 0x2000) p = int16(program.code[ip++]);
    switch (op) {
      case 0: ip = p; break;
      case 1: ret = p; break;
      case 2:
        if (p === 0) push(ret);
        else if (p === 1) { push(ip + 1); push(bp); bp = sp + 2; }
        else throw new Error('EMC invalid call');
        break;
      case 3: case 4: push(p); break;
      case 5: push(regs[p]); break;
      case 6: push(read(bp - p - 2)); break;
      case 7: push(read(bp + p - 1)); break;
      case 8:
        if (p === 0) ret = pop();
        else if (p === 1) { if (sp >= 99) ip = null; else { bp = pop(); ip = pop(); } }
        else throw new Error('EMC invalid return');
        break;
      case 9: regs[p] = pop(); break;
      case 10: { const v = pop(); stack[bp - p - 2] = v; break; }
      case 11: { const v = pop(); stack[bp + p - 1] = v; break; }
      case 12: sp += p; break;
      case 13: sp -= p; break;
      case 14: ret = int16(syscall(p & 255, Array.from(stack.subarray(sp)), program.strings, regs) ?? 0); break;
      case 15: if (!pop()) ip = p & 0x7fff; break;
      case 16: stack[sp] = p === 0 ? +!read(sp) : p === 1 ? -read(sp) : ~read(sp); break;
      case 17: {
        const a = pop(), b = pop();
        const operations = [() => +(!!b && !!a), () => +(!!b || !!a), () => +(a === b), () => +(a !== b),
          () => +(a > b), () => +(a >= b), () => +(a < b), () => +(a <= b), () => a + b, () => b - a,
          () => a * b, () => Math.trunc(b / a), () => b >> a, () => b << a, () => a & b, () => a | b,
          () => b % a, () => a ^ b];
        if (!operations[p]) throw new Error(`EMC invalid expression ${p}`);
        push(operations[p]()); break;
      }
      case 18:
        if (sp >= 99) ip = null;
        else { ret = pop(); ip = pop(); stack[99] = 0; }
        break;
      default: throw new Error(`Unknown EMC opcode ${op}`);
    }
  }
  return { regs: Array.from(regs), ret, steps };
}
