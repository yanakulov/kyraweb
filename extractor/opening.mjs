import { parseEmc, runEmc } from './emc.mjs';
import { readPak } from './indexed_resources.mjs';

// Only durations are exported: the CD's uncompressed speech stays in the installation.
export function vocDuration(bytes) {
  const b = Buffer.from(bytes);
  if (b.toString('ascii', 0, 19) !== 'Creative Voice File') throw new Error('Invalid VOC');
  let p = b.readUInt16LE(20), rate = 0, ms = 0;
  while (p < b.length && b[p]) {
    const type = b[p++], size = b.readUIntLE(p, 3); p += 3;
    if (p + size > b.length) throw new Error('Truncated VOC');
    if (type === 1) {
      if (b[p + 1] !== 0) throw new Error('Unsupported compressed VOC');
      rate = 1_000_000 / (256 - b[p]); ms += (size - 2) * 1000 / rate;
    } else if (type === 2 && rate) ms += size * 1000 / rate;
    else throw new Error(`Unsupported VOC block ${type}`);
    p += size;
  }
  return Math.round(ms);
}

export function buildOpening(resources) {
  const get = n => { const b = resources.get(n); if (!b) throw new Error(`Missing opening resource ${n}`); return b; };
  const flags = new Set([239, 243, 253]);
  let actor = { x: 320, y: 108, facing: 6 }, scene = 'TRUNK', voice = 0, voiceElapsed = 0;
  const slots = new Map(), calls = new Set();
  const voices = Object.fromEntries(['GEM', 'GEMCUT'].map(n => [n, readPak(get(`${n}.VRM`))]));
  const lengths = {};
  function duration(id) {
    const key = `${scene}:${id}`;
    return lengths[key] ??= vocDuration(voices[scene].get(`${String(id).padStart(3, '0')}.VOC`));
  }
  function trace(name, fn, registers = {}) {
    scene = name;
    const actions = [], program = parseEmc(get(`${name}.EMC`));
    const emit = action => actions.push(action);
    const wait = ms => { if (ms > 0) { emit({ op: 'wait', ms }); voiceElapsed += ms; } };
    const frame = (slot, index, x, y, ms) => { emit({ op: 'frame', clip: slots.get(slot), index, x, y, ms }); voiceElapsed += ms; };
    runEmc(program, fn, (id, a, strings) => {
      calls.add(id);
      switch (id) {
        case 0x04: return +flags.has(a[0]);
        case 0x05: flags.add(a[0]); return 0;
        case 0x06: flags.delete(a[0]); return 0;
        case 0x38: return actor.x;
        case 0x39: return actor.y;
        case 0x5a: return actor.facing;
        case 0x70: return 6;
        case 0x7a: return 0;
        case 0x3d: return Math.floor((a[0] + a[1]) / 2);
        case 0x0b:
          actor.x = a[0] & ~3; actor.y = a[1] & ~1;
          emit({ op: 'walk', x: actor.x, y: actor.y }); return 0;
        case 0x3a:
          actor.facing = a[1]; emit({ op: 'face', facing: a[1], shape: a[2] }); return 0;
        case 0x30:
          actor = { x: a[0] & ~3, y: a[1] & ~1, facing: a[2] };
          emit({ op: 'actor', ...actor, visible: true }); return 0;
        case 0x31: emit({ op: 'visible', visible: false }); return 0;
        case 0x29: slots.set(a[1], strings[a[0]].replace('.WSA', '').toLowerCase()); return 0;
        case 0x2a: emit({ op: 'close', clip: slots.get(a[0]) }); slots.delete(a[0]); return 0;
        case 0x2b: {
          emit({ op: 'visible', visible: false });
          emit({ op: 'movie', clip: slots.get(a[3]), x: a[0], y: a[1], ticks: a[2] }); return 0;
        }
        case 0x2c: frame(a[4], a[0], a[1], a[2], a[3] * 1000 / 60); return 0;
        case 0x40: {
          const count = Math.abs(a[1] - a[0]) + 1, repeat = Math.max(1, a[6]);
          const time = duration(voice) * Math.abs(a[7]) / 100 - (a[7] < 0 ? voiceElapsed : 0);
          const ticks = a[7] ? Math.floor(Math.max(0, time) / (count * repeat) / (1000 / 60)) : a[4];
          for (let r = 0; r < repeat; r++) for (let i = 0; i < count; i++)
            frame(a[5], a[0] + i * Math.sign(a[1] - a[0]), a[2], a[3], ticks * 1000 / 60);
          return 0;
        }
        case 0x01: case 0x34: {
          voice = a[0]; voiceElapsed = 0;
          const custom = id === 0x34;
          emit({ op: 'say', text: strings[a[1]], voiceId: voice, ms: duration(voice),
            x: custom ? a[2] : actor.x, y: custom ? a[3] : actor.y - 56,
            color: custom ? a[4] : 15, blocking: !custom });
          if (!custom) voiceElapsed = duration(voice);
          return 0;
        }
        case 0x35: emit({ op: 'clearText' }); return 0;
        case 0x8b: emit({ op: 'message', text: strings[a[1]] }); return 0;
        case 0x02: wait(a[0] * 1000 / 60); return 0;
        case 0x21:
          if (a[0] < 0) wait(-a[0] * 1000 / 60);
          else emit({ op: 'waitVoice' });
          return 0;
        case 0x10: case 0x11: emit({ op: 'ambient', index: a[0], enabled: id === 0x10 }); return 0;
        case 0x3b: emit({ op: 'commit', x: a[0], y: a[1], w: a[2], h: a[3] }); return 0;
        // State/configuration, cursor, music and sound commands don't draw frames.
        case 0x09: case 0x17: case 0x18: case 0x26: case 0x2d: case 0x2e:
        case 0x36: case 0x37: return 0;
        default: throw new Error(`Unsupported opening syscall 0x${id.toString(16)}`);
      }
    }, registers);
    return actions;
  }
  const opening = [{ op: 'scene', name: 'trunk', ...actor, visible: true }, ...trace('TRUNK', 3, { 7: 1, 4: -1 })];
  opening.push({ op: 'scene', name: 'gem', x: 208, y: 110, facing: 5, visible: false },
    ...trace('GEM', 2, { 7: 0, 4: -1 }), ...trace('GEM', 3, { 7: 0, 4: -1 }));
  const dat = Buffer.from(get('GEMCUT.DAT'));
  actor = { x: dat.readUInt16LE(dat.length - 6) & ~3, y: dat[dat.length - 4] & ~1, facing: 0 };
  opening.push({ op: 'scene', name: 'room', ...actor, visible: true }, ...trace('GEMCUT', 3, { 7: 0, 4: -1 }));
  const tree = trace('GEMCUT', 1, { 1: 150, 2: 130, 4: -1 });
  if (!flags.has(53)) throw new Error('Tree conversation did not complete');
  return { source: 'Kyrandia 1 DOS CD EMC2', opening, tree, voiceDurations: lengths,
    syscalls: [...calls].sort((a, b) => a - b) };
}
