// DOS CD finale, using the original indexed art and SeqPlayer timing.
// SPDX-License-Identifier: GPL-3.0-or-later
import { decodeCps, decodeFrame4, decodeWsa, readGameResources, readPak } from './indexed_resources.mjs';
import { reunionLines, reunionSequence } from './materials/reunion-dos-cd.mjs';
import { vocDuration } from './opening.mjs';

function beadFrames(bytes, palette) {
  const data = Buffer.from(decodeFrame4(bytes.subarray(10 + bytes.readUInt16LE(8)), bytes.readUInt32LE(4)));
  const width = 16, height = 9;
  const frames = Array.from({ length: data.readUInt16LE(0) }, (_, i) => {
    const at = data.readUInt32LE(2 + 4 * i) + 2;
    const flags = data.readUInt16LE(at), w = data.readUInt16LE(at + 3), h = data[at + 2];
    const colors = flags & 1 ? data.subarray(at + 10, at + 26) : null;
    const stream = data.subarray(at + (colors ? 26 : 10));
    const codes = flags & 2 ? stream : decodeFrame4(stream, data.readUInt16LE(at + 8));
    const pixels = new Uint8Array(width * height);
    for (let p = 0, d = 0; d < w * h;) {
      const pixel = codes[p++];
      if (pixel === undefined) throw new Error('Truncated BEAD shape');
      if (pixel) { pixels[Math.floor(d / w) * width + d % w] = colors ? colors[pixel] : pixel; d++; }
      else { const skip = codes[p++]; if (!skip) throw new Error('Invalid BEAD shape'); d += skip; }
    }
    return pixels;
  });
  return { width, height, frames, palette, transparentIndex: 0 };
}

function creditAtlas(credits, font, palette) {
  const width = 320, lineHeight = 10, lines = credits.toString('latin1').split('\0')[0].split('\r');
  if (!lines.at(-1)) lines.pop();
  const height = lines.length * lineHeight;
  const pixels = new Uint8Array(width * height);
  const offsets = font.readUInt16LE(6), widths = font.readUInt16LE(8), heights = font.readUInt16LE(12);
  lines.forEach((line, row) => {
    for (let text of line.split('\x05')) {
      const alignment = text.charCodeAt(0);
      text = text.replace(/^[\x03\x04]?[\x01\x02]?/, '');
      const glyphs = Array.from(text, char => char.charCodeAt(0));
      const textWidth = glyphs.reduce((sum, code) => sum + font[widths + code] - 1, 0);
      let x = alignment === 3 ? 157 - textWidth : alignment === 4 ? 161 : Math.floor((width - textWidth) / 2) + 1;
      for (const code of glyphs) {
        const w = font[widths + code], start = font.readUInt16LE(offsets + code * 2);
        const top = font[heights + code * 2], rows = font[heights + code * 2 + 1];
        if (start) for (let y = 0; y < rows; y++) for (let col = 0; col < w; col++) {
          const pair = font[start + y * Math.ceil(w / 2) + (col >> 1)];
          const pen = col & 1 ? pair >> 4 : pair & 15;
          if (pen && x + col >= 0 && x + col < width)
            pixels[(row * lineHeight + top + y) * width + x + col] = pen === 1 ? 15 : pen === 2 ? 12 : 0;
        }
        x += w - 1;
      }
    }
  });
  return { width, height, frames: [pixels], palette, transparentIndex: 0 };
}

function reunionActions(voices) {
  const bytes = Buffer.from(reunionSequence, 'base64');
  const sizes = [3, 2, 6, 2, 2, 5, 3, 3, 3, 1, 1, 2, 4, 4, 2, 2, 2, 1, 2, 6, 1, 1, 1, 1, 3, 2, 9, 2, 2, 1, 1, 1, 1, 1, 2, 1, 2, 1];
  const actions = [], loops = new Map();
  let ip = 0, frame = 0, voiceId = 0, elapsed = 0, displayed = -1;
  const ticks = n => n * 1000 / 60;
  const emit = action => {
    if (elapsed) actions.push({ op: 'wait', ms: elapsed });
    actions.push(action);
    elapsed = 0;
  };
  while (ip < bytes.length) {
    const op = bytes[ip], p = bytes.subarray(ip + 1, ip + sizes[op]);
    ip += sizes[op];
    switch (op) {
      case 0: case 1: case 14: case 22: case 29: case 32: case 33: case 35: case 36: break;
      case 2: frame = p[1]; break;
      case 3: frame++; break;
      case 8:
        if (frame !== displayed) {
          emit({ op: 'frame', clip: 'end-reunion', index: frame, x: 80, y: 34, ms: 0 });
          displayed = frame;
        }
        elapsed += ticks(p.readUInt16LE(0));
        break;
      case 6: case 7: elapsed += ticks(p.readUInt16LE(0)); break;
      case 11: loops.set(p[0], { ip, remaining: undefined }); break;
      case 12: case 13: {
        const loop = loops.get(p[0]);
        loop.remaining ??= p.readUInt16LE(1);
        if (loop.remaining-- > 0) ip = loop.ip;
        break;
      }
      case 17: emit({ op: 'shade', opacity: 1, ms: 500 }); break;
      case 19:
        emit({ op: 'say', voiceId, voiceBank: 'REUNION', text: reunionLines[p[0] - 32],
          x: p.readUInt16LE(1), y: p[3], color: p[4], blocking: false,
          ms: vocDuration(voices.get(`${String(voiceId).padStart(3, '0')}.VOC`)) });
        break;
      case 20: emit({ op: 'clearText' }); break;
      case 23: emit({ op: 'shade', opacity: 0, ms: 500 }); break;
      case 27: elapsed += ticks(3); emit({ op: 'sfx', track: p[0] }); break;
      case 34: voiceId = p[0]; break;
      default: throw new Error(`Unsupported reunion opcode ${op}`);
    }
    elapsed += 8;
  }
  return actions;
}

export async function importFinale(root, palette) {
  const names = ['FINALA.WSA', 'FINALB.WSA', 'FINALC.WSA', 'FINALD.WSA', 'BEAD.CPS',
    'GEMHEAL.CPS', 'REUNION.CPS', 'REUNION.WSA', 'CHALET.CPS', 'CREDITS.TXT', '8FAT.FNT', 'INTRO.VRM', 'PALETTE.COL'];
  const resources = await readGameResources(root, names);
  const get = name => {
    const data = resources.get(name);
    if (!data) throw new Error(`Missing finale resource ${name}`);
    return Buffer.from(data);
  };
  const bitmap = name => {
    const { pixels, ...image } = decodeCps(get(name), get('PALETTE.COL'));
    return { ...image, frames: [pixels], transparentIndex: -1 };
  };
  const movie = (name, palette) => ({ ...decodeWsa(get(name)), palette, transparentIndex: -1 });
  const heal = bitmap('GEMHEAL.CPS'), reunion = bitmap('REUNION.CPS'), chalet = bitmap('CHALET.CPS');
  const clips = {
    finala: movie('FINALA.WSA', palette), finalb: movie('FINALB.WSA', palette), finalc: movie('FINALC.WSA', palette),
    bead: beadFrames(get('BEAD.CPS'), palette), 'end-heal': heal, 'end-finald': movie('FINALD.WSA', heal.palette),
    'end-home': reunion, 'end-reunion': movie('REUNION.WSA', reunion.palette), 'end-chalet': chalet,
    'end-credits': creditAtlas(get('CREDITS.TXT'), get('8FAT.FNT'), chalet.palette)
  };
  return { clips, reunion: reunionActions(readPak(get('INTRO.VRM'))) };
}
