import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { WorldSave } from '../src/engine/core/types';
import { readSaveSlots, writeSaveSlot, validateWorldSave } from '../src/engine/gameplay/saveStorage';

const png = `data:image/png;base64,${readFileSync('public/assets/intro/logo_bg.png').toString('base64')}`;
function state(): WorldSave {
  return {
    version: 1, currentRoom: 7,
    rooms: { 7: { pos: { x: 216, y: 109 }, facing: 5, walkDelayTicks: 6, inventorySlots: ['saw', ...Array(9).fill(null)],
      itemInHand: 'ruby', treeSpoken: true, sceneItems: [{ id: 'item-106', x: 100, y: 120 }],
      overlays: [{ id: 'saw', shape: 8, x: 24, y: 30, flags: 0, offsetX: 1, offsetY: 2, active: false, pickable: true }],
      runtime: { clockMs: 4512.5, sceneTicks: 270, sceneAccumulatorMs: 12.5, actorVisible: true, actorShape: null, hasAmulet: true,
        sceneAnims: [{ visible: true, sprite: -1, x: 12, y: 30, defaultX: 12, defaultY: 30, flipX: false, play: true, ip: 4, nextRun: 4600.5, lastRefresh: 4500, loopsLeft: 1, loopStart: 2 }],
        npcs: [{ character: 2, x: 224, y: 94, facing: 5, shape: 88, room: 7, visible: false }], heldNpcPoses: [],
        masks: [{ x: 10, y: 20, w: 4, h: 5, blocked: false }], shapes: [{ shape: 1, x: 12, y: 70, flags: 0 }],
        noDrop: [{ x: 0, y: 100, w: 20, h: 30 }], layers: [{ clip: 'tag-0', index: 0, x: 14, y: 20, permanent: false }], palette: Array(768).fill(63) }
    } },
    quest: { flags: [0, 1, 511], files: { 7: 'BRIDGE' }, phasing: false, vase: -1,
      merith: { x: -16, y: 126, facing: 3, shape: 41, room: -1 }, herman: { x: 224, y: 94, facing: 5, shape: 88, room: 7 } },
    settings: { atmosphere: true, walkSpeed: 'fast', animStepInterval: 1 }
  };
}
const payload = () => ({ name: ' Bridge repaired ', location: 'The bridge', thumbnail: png, state: state() });
function memoryStorage(t: TestContext) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'), entries = new Map<string, string>();
  const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value); } };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage });
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else Reflect.deleteProperty(globalThis, 'localStorage'); });
  return { entries, storage };
}

test('three manual saves round-trip complete world state and return independent copies', t => {
  const { entries } = memoryStorage(t);
  assert.deepEqual(readSaveSlots(), [0, 1, 2].map(index => ({ index, save: null, error: null })));
  const input = payload(), saved = writeSaveSlot(0, input);
  assert.equal(saved.name, 'Bridge repaired');
  assert.equal(new Date(saved.savedAt).toISOString(), saved.savedAt);
  assert.deepEqual(saved.state, input.state);
  input.state.quest.flags.push(15); saved.state.rooms[7].pos.x = 10;
  assert.equal(readSaveSlots()[0].save!.state.rooms[7].pos.x, 216);
  assert.deepEqual(readSaveSlots()[0].save!.state.quest.flags, [0, 1, 511]);
  writeSaveSlot(2, { ...payload(), name: 'Forest' });
  assert.deepEqual([...entries.keys()], ['kyrandia.save.1', 'kyrandia.save.3']);
  assert.equal(readSaveSlots()[1].save, null);
});

test('a damaged or unsupported slot remains intact while other slots can load and save', t => {
  const { entries } = memoryStorage(t);
  const good = writeSaveSlot(0, payload()), firstBytes = entries.get('kyrandia.save.1');
  for (const raw of ['{bad json', JSON.stringify({ ...good, version: 2 }), JSON.stringify({ ...good, state: { ...good.state, version: 2 } }), 'x'.repeat(1_000_001)]) {
    entries.set('kyrandia.save.2', raw);
    const slots = readSaveSlots();
    assert.equal(slots[0].save!.name, good.name); assert.ok(slots[1].error); assert.equal(slots[1].save, null);
    writeSaveSlot(2, payload());
    assert.equal(entries.get('kyrandia.save.2'), raw);
    assert.equal(entries.get('kyrandia.save.1'), firstBytes);
  }
});

test('state validation rejects malformed nested runtime, quest and inventory before writing', t => {
  const { entries } = memoryStorage(t);
  writeSaveSlot(0, payload()); const previous = entries.get('kyrandia.save.1');
  const invalidStates: ((save: WorldSave) => void)[] = [
    save => { save.currentRoom = 17; },
    save => { save.currentRoom = 0; },
    save => { save.rooms[7].pos.x = NaN; },
    save => { save.rooms[7].itemInHand = 'item-107'; },
    save => { save.rooms[7].inventorySlots.push('ruby'); },
    save => { delete save.rooms[7].runtime; },
    save => { save.rooms[7].runtime!.layers[0].clip = '../script'; },
    save => { save.rooms[7].runtime!.sceneAnims[0].ip = -1; },
    save => { Object.assign(save.rooms[7].runtime!.sceneAnims[0], { script: [1, 2] }); },
    save => { save.rooms[7].runtime!.masks[0].w = 2049; },
    save => { save.rooms[7].runtime!.palette = [1, 2, 3]; },
    save => { save.quest.flags.push(512); },
    save => { save.quest.files[7] = '../BROKEN'; },
    save => { save.settings.walkSpeed = 'teleport' as 'fast'; }
  ];
  for (const change of invalidStates) {
    const input = payload(); change(input.state);
    assert.throws(() => writeSaveSlot(0, input), /Invalid save/);
    assert.equal(entries.get('kyrandia.save.1'), previous);
  }
  const input = state(), checked = validateWorldSave(input);
  checked.rooms[7].runtime!.masks[0].blocked = true;
  assert.equal(input.rooms[7].runtime!.masks[0].blocked, false);
});

test('metadata and thumbnails have bounded formats and dimensions', t => {
  const { entries } = memoryStorage(t);
  writeSaveSlot(0, payload()); const previous = entries.get('kyrandia.save.1');
  const oversizedPng = Buffer.from(png.split(',')[1], 'base64'); oversizedPng.writeUInt32BE(321, 16);
  for (const change of [{ name: ' ' }, { name: 'x'.repeat(65) }, { location: 'x'.repeat(121) },
    { thumbnail: 'data:image/svg+xml;base64,AAAA' }, { thumbnail: 'data:image/png;base64,AAAA' },
    { thumbnail: `data:image/png;base64,${'A'.repeat(400_000)}` },
    { thumbnail: `data:image/png;base64,${oversizedPng.toString('base64')}` }]) {
    assert.throws(() => writeSaveSlot(0, { ...payload(), ...change }), /Invalid save/);
    assert.equal(entries.get('kyrandia.save.1'), previous);
  }
  for (const index of [-1, 3, .5, NaN]) assert.throws(() => writeSaveSlot(index, payload()), /three save slots/);
  const record = JSON.parse(previous!); record.savedAt = 'yesterday'; entries.set('kyrandia.save.2', JSON.stringify(record));
  assert.match(readSaveSlots()[1].error!, /save date/);
  const webp = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
  assert.equal(writeSaveSlot(2, { ...payload(), thumbnail: webp }).thumbnail, webp);
});

test('unavailable, blocked and full storage report failure without changing existing entries', t => {
  const { entries, storage } = memoryStorage(t);
  writeSaveSlot(0, payload()); writeSaveSlot(1, payload()); const previous = [...entries];
  storage.setItem = () => { throw Object.assign(new Error('full'), { name: 'QuotaExceededError' }); };
  assert.throws(() => writeSaveSlot(0, payload()), /storage is full.*existing saves have not changed/i);
  assert.deepEqual([...entries], previous);
  storage.setItem = () => { throw Object.assign(new Error('blocked'), { name: 'SecurityError' }); };
  assert.throws(() => writeSaveSlot(0, payload()), /Allow storage/);
  storage.getItem = () => { throw new Error('blocked'); };
  assert.throws(readSaveSlots, /could not be read/);
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('disabled'); } });
  assert.throws(readSaveSlots, /storage is unavailable/);
  assert.throws(() => writeSaveSlot(0, payload()), /storage is unavailable/);
  assert.deepEqual([...entries], previous);
});
