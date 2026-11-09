import type { WorldSave } from '../core/types';
import { INVISIBILITY_MS, isWorldRoomId } from '../core/constants';

export type SaveRecord = {
  version: 1; name: string; location: string; savedAt: string; thumbnail: string; state: WorldSave;
};
export type SaveSlot = { index: number; save: SaveRecord | null; error: string | null };

const SLOT_COUNT = 3, MAX_RECORD_LENGTH = 1_000_000, MAX_THUMBNAIL_LENGTH = 400_000;
export const AUTOSAVE_SLOT = SLOT_COUNT;
const AUTOSAVE_KEY = 'kyrandia.autosave';
const forestFiles = new Set('GEMCUT HEALER SICKWIL ALTAR BROKEN BRIDGE SORROW TRUNK FNORTH FGOWEST WILLOW FORESTB FORESTA XEDGE XEDGEC CAVEB NWCLIFB ALGAE FOUNTN'.split(' '));
const itemNames = new Set('letter ruby saw apple appleEaten rose silverRose marble teardrop'.split(' '));
function slotKey(index: number) {
  if (!Number.isInteger(index) || index < 0 || index >= SLOT_COUNT) throw new Error('Choose one of the three save slots.');
  return `kyrandia.save.${index + 1}`;
}

function invalid(path: string): never { throw new Error(`Invalid save data (${path}). Choose another slot or save again.`); }
function object(value: unknown, path: string, fields?: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return invalid(path);
  if (fields && Object.keys(value).some(key => !fields.split(' ').includes(key))) return invalid(path);
  return value as Record<string, unknown>;
}
function number(value: unknown, path: string, min: number, max: number, integer = true): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) return invalid(path);
  return value;
}
function boolean(value: unknown, path: string) { if (typeof value !== 'boolean') invalid(path); }
function list(value: unknown, path: string, max: number, check: (value: unknown, path: string) => void) {
  if (!Array.isArray(value) || value.length > max) return invalid(path);
  for (let i = 0; i < value.length; i++) check(value[i], `${path}[${i}]`);
}
function roomId(value: unknown, path: string, absent = false) {
  if (!(typeof value === 'number' && (isWorldRoomId(value) || (absent && value === -1)))) invalid(path);
}
function item(value: unknown, path: string) {
  if (value === null) return;
  if (typeof value !== 'string' || !(itemNames.has(value) || (/^item-(0|[1-9]\d{0,2})$/.test(value) && Number(value.slice(5)) <= 106))) invalid(path);
}
function sceneItem(value: unknown, path: string) {
  const entry = object(value, path, 'id x y');
  coordinates(entry, path);
  item(entry.id, path);
  if (entry.id === null) invalid(path);
}
function coordinates(value: Record<string, unknown>, path: string) {
  number(value.x, `${path}.x`, -1024, 1024, false); number(value.y, `${path}.y`, -1024, 1024, false);
}
function npc(value: unknown, path: string, visible = false) {
  const data = object(value, path, `x y facing shape room${visible ? ' character visible' : ''}`);
  coordinates(data, path); number(data.facing, path, 0, 7); number(data.shape, path, -1, 65535); roomId(data.room, path, true);
  if (visible) { number(data.character, path, 0, 2); boolean(data.visible, path); }
}
function rectangle(value: unknown, path: string, mask = false) {
  const data = object(value, path, `x y w h${mask ? ' blocked' : ''}`);
  coordinates(data, path); number(data.w, path, 0, 2048); number(data.h, path, 0, 2048);
  if (mask) boolean(data.blocked, path);
}
function runtime(value: unknown, path: string) {
  const data = object(value, path, 'clockMs sceneTicks sceneAccumulatorMs actorVisible actorShape hasAmulet sceneAnims npcs heldNpcPoses masks shapes noDrop layers palette');
  for (const key of ['clockMs', 'sceneTicks', 'sceneAccumulatorMs']) number(data[key], `${path}.${key}`, 0, 1e12, key === 'sceneTicks');
  boolean(data.actorVisible, path); boolean(data.hasAmulet, path);
  if (data.actorShape !== null) number(data.actorShape, path, 0, 65535);
  list(data.sceneAnims, `${path}.sceneAnims`, 64, (value, path) => {
    const anim = object(value, path, 'visible sprite x y renderX renderY defaultX defaultY flipX play ip nextRun lastRefresh loopsLeft loopStart');
    coordinates(anim, path);
    for (const key of ['defaultX', 'defaultY']) number(anim[key], path, -1024, 1024, false);
    for (const key of ['renderX', 'renderY']) if (anim[key] !== undefined) number(anim[key], path, -1024, 1024, false);
    for (const key of ['visible', 'flipX', 'play']) boolean(anim[key], path);
    number(anim.sprite, path, -1, 65535);
    for (const key of ['ip', 'loopsLeft', 'loopStart']) number(anim[key], path, 0, 65535);
    for (const key of ['nextRun', 'lastRefresh']) number(anim[key], path, 0, 1e12, false);
  });
  for (const key of ['npcs', 'heldNpcPoses']) list(data[key], `${path}.${key}`, 3, (value, path) => npc(value, path, true));
  list(data.masks, `${path}.masks`, 512, (value, path) => rectangle(value, path, true));
  list(data.noDrop, `${path}.noDrop`, 128, rectangle);
  list(data.shapes, `${path}.shapes`, 512, (value, path) => {
    const shape = object(value, path, 'shape x y flags'); coordinates(shape, path);
    number(shape.shape, path, 0, 65535); number(shape.flags, path, 0, 65535);
  });
  list(data.layers, `${path}.layers`, 64, (value, path) => {
    const layer = object(value, path, 'clip index x y permanent'); coordinates(layer, path);
    if (typeof layer.clip !== 'string' || !/^[-a-zA-Z0-9_]{1,64}$/.test(layer.clip)) invalid(path);
    number(layer.index, path, 0, 65535); boolean(layer.permanent, path);
  });
  if (data.palette !== undefined) {
    list(data.palette, `${path}.palette`, 768, (value, path) => number(value, path, 0, 255));
    if ((data.palette as unknown[]).length !== 768) invalid(`${path}.palette`);
  }
}

/** Shared storage/engine boundary: reject incomplete state before changing a live game. */
export function validateWorldSave(value: unknown): WorldSave {
  const data = object(value, 'state', 'version currentRoom rooms quest settings');
  if (data.version !== 1) throw new Error('Unsupported game save version. Update the game or choose another slot.');
  roomId(data.currentRoom, 'currentRoom');
  const rooms = object(data.rooms, 'rooms');
  for (const [key, value] of Object.entries(rooms)) {
    roomId(Number(key), `rooms.${key}`); if (String(Number(key)) !== key) invalid('room ID');
    const room = object(value, `rooms.${key}`, 'pos facing walkDelayTicks wispMs invisibleMs inventorySlots itemInHand sceneItems overlays treeSpoken gemPlacementChecked runtime');
    coordinates(object(room.pos, 'position', 'x y'), 'position');
    if (room.facing !== undefined) number(room.facing, 'facing', 0, 7);
    if (room.walkDelayTicks !== undefined) number(room.walkDelayTicks, 'walkDelayTicks', 1, 60);
    if (room.wispMs !== undefined) number(room.wispMs, 'wispMs', 0, 300_000, false);
    if (room.invisibleMs !== undefined) number(room.invisibleMs, 'invisibleMs', 0, INVISIBILITY_MS, false);
    if (room.gemPlacementChecked !== undefined) boolean(room.gemPlacementChecked, 'gemPlacementChecked');
    list(room.inventorySlots, 'inventory', 10, item); item(room.itemInHand, 'held item'); boolean(room.treeSpoken, 'treeSpoken');
    list(room.sceneItems, 'sceneItems', 256, sceneItem);
    list(room.overlays, 'overlays', 256, (value, path) => {
      const entry = object(value, path, 'id shape x y flags offsetX offsetY replaceShape replaceX replaceY active pickable');
      coordinates(entry, path); item(entry.id, path); if (entry.id === null) invalid(path);
      number(entry.shape, path, 0, 65535); number(entry.flags, path, 0, 65535);
      for (const key of ['offsetX', 'offsetY']) number(entry[key], path, -1024, 1024, false);
      if (entry.replaceShape !== undefined) number(entry.replaceShape, path, 0, 65535);
      for (const key of ['replaceX', 'replaceY']) if (entry[key] !== undefined) number(entry[key], path, -1024, 1024, false);
      boolean(entry.active, path); boolean(entry.pickable, path);
    });
    runtime(room.runtime, `rooms.${key}.runtime`);
  }
  if (!Object.prototype.hasOwnProperty.call(rooms, String(data.currentRoom))) invalid('current room snapshot');
  const quest = object(data.quest, 'quest', 'flags files phasing vase vaseInitialized merith herman birthstones scatteredGems poison cauldron crystals foyerItems pendingItems');
  if (quest.vaseInitialized !== undefined) boolean(quest.vaseInitialized, 'quest.vaseInitialized');
  list(quest.flags, 'quest.flags', 512, (value, path) => number(value, path, 0, 511));
  if (quest.birthstones !== undefined) {
    const stones = quest.birthstones;
    if (!Array.isArray(stones) || stones.length !== 4 || stones[0] !== 12 || stones[3] !== 6) invalid('quest.birthstones');
    number(stones[1], 'second birthstone', 0, 3);
    number(stones[2], 'third birthstone', 7, 11);
  }
  if (quest.scatteredGems !== undefined) for (const [key, gems] of Object.entries(object(quest.scatteredGems, 'quest.scatteredGems'))) {
    roomId(Number(key), 'gem room');
    if (String(Number(key)) !== key) invalid('gem room');
    list(gems, 'scattered gems', 256, (value, path) => number(value, path, 0, 12));
  }
  if (quest.poison !== undefined) number(quest.poison, 'quest.poison', 0, 2);
  if (quest.cauldron !== undefined) number(quest.cauldron, 'quest.cauldron', 0, 9);
  if (quest.crystals !== undefined) {
    if (!Array.isArray(quest.crystals) || quest.crystals.length !== 2) invalid('quest.crystals');
    list(quest.crystals, 'quest.crystals', 2, (value, path) => {
      if (value !== -1) number(value, path, 60, 65);
    });
  }
  if (quest.pendingItems !== undefined) for (const [key, items] of Object.entries(object(quest.pendingItems, 'quest.pendingItems'))) {
    roomId(Number(key), 'offscene item room');
    if (String(Number(key)) !== key) invalid('offscene item room');
    list(items, 'offscene items', 256, sceneItem);
  }
  if (quest.foyerItems !== undefined) {
    if (!Array.isArray(quest.foyerItems) || quest.foyerItems.length !== 3 ||
        quest.foyerItems.some(item => ![-1, 24, 103, 104].includes(item))) invalid('quest.foyerItems');
  }
  const files = object(quest.files, 'quest.files');
  for (const [key, value] of Object.entries(files)) {
    roomId(Number(key), 'quest room'); if (String(Number(key)) !== key || typeof value !== 'string' || !forestFiles.has(value)) invalid('quest scene file');
  }
  boolean(quest.phasing, 'phasing'); number(quest.vase, 'vase', -1, 106); npc(quest.merith, 'merith'); npc(quest.herman, 'herman');
  const settings = object(data.settings, 'settings', 'atmosphere walkSpeed animStepInterval');
  boolean(settings.atmosphere, 'atmosphere'); number(settings.animStepInterval, 'animation interval', 1, 8);
  if (!['slowest', 'slow', 'fast', 'fastest'].includes(settings.walkSpeed as string)) invalid('walk speed');
  if (JSON.stringify(data).length > MAX_RECORD_LENGTH - MAX_THUMBNAIL_LENGTH) throw new Error('The game save is too large. Existing saves have not changed.');
  return structuredClone(data) as WorldSave;
}

function thumbnail(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_THUMBNAIL_LENGTH) invalid('thumbnail size');
  const match = /^data:image\/(png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) return invalid('thumbnail format');
  const bytes = atob(match[2]), byte = (i: number) => bytes.charCodeAt(i);
  const u16 = (i: number) => byte(i) + byte(i + 1) * 256;
  const u24 = (i: number) => u16(i) + byte(i + 2) * 65536;
  let width = 0, height = 0;
  if (match[1] === 'png' && bytes.length >= 33 && bytes.startsWith('\x89PNG\r\n\x1a\n') && bytes.slice(12, 16) === 'IHDR') {
    const u32 = (i: number) => byte(i) * 16777216 + byte(i + 1) * 65536 + byte(i + 2) * 256 + byte(i + 3);
    width = u32(16); height = u32(20);
  } else if (match[1] === 'webp' && bytes.length >= 30 && bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP') {
    const chunk = bytes.slice(12, 16);
    if (chunk === 'VP8X') { width = u24(24) + 1; height = u24(27) + 1; }
    else if (chunk === 'VP8 ' && bytes.slice(23, 26) === '\x9d\x01\x2a') { width = u16(26) & 16383; height = u16(28) & 16383; }
    else if (chunk === 'VP8L' && byte(20) === 47) { const bits = u24(21) + byte(24) * 16777216; width = (bits & 16383) + 1; height = ((bits >>> 14) & 16383) + 1; }
  }
  if (!(width > 0 && height > 0 && width <= 320 && height <= 200)) invalid('thumbnail dimensions (maximum 320 × 200)');
  return value;
}
function label(value: unknown, path: string, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f]/.test(value)) return invalid(path);
  return value.trim();
}
function saveRecord(value: unknown): SaveRecord {
  const record = object(value, 'record', 'version name location savedAt thumbnail state');
  if (record.version !== 1) throw new Error('Unsupported save version. Update the game or choose another slot.');
  if (typeof record.savedAt !== 'string' || !Number.isFinite(Date.parse(record.savedAt)) || new Date(record.savedAt).toISOString() !== record.savedAt) invalid('save date');
  return { version: 1, name: label(record.name, 'save name', 64), location: label(record.location, 'location', 120), savedAt: record.savedAt,
    thumbnail: thumbnail(record.thumbnail), state: validateWorldSave(record.state) };
}
function storage(): Storage {
  try { if (globalThis.localStorage) return globalThis.localStorage; } catch { /* Site storage can be blocked. */ }
  throw new Error('Browser storage is unavailable. Allow storage for this site to use saved games.');
}

function readSlot(store: Storage, key: string, index: number): SaveSlot {
  let raw: string | null;
  try { raw = store.getItem(key); }
  catch { throw new Error('Saved games could not be read. Allow storage for this site and try again.'); }
  if (raw === null) return { index, save: null, error: null };
  try {
    if (raw.length > MAX_RECORD_LENGTH) throw new Error('This save is too large to load. Choose another slot.');
    return { index, save: saveRecord(JSON.parse(raw)), error: null };
  } catch (error) {
    return { index, save: null, error: error instanceof SyntaxError ? 'This save is damaged. Choose another slot or save again.' : error instanceof Error ? error.message : 'This save could not be loaded.' };
  }
}

export function readSaveSlots(): SaveSlot[] {
  const store = storage();
  return Array.from({ length: SLOT_COUNT }, (_, index) => readSlot(store, slotKey(index), index));
}

export function readAutosave(): SaveSlot { return readSlot(storage(), AUTOSAVE_KEY, AUTOSAVE_SLOT); }

function writeRecord(key: string, value: Pick<SaveRecord, 'name' | 'location' | 'thumbnail' | 'state'>): SaveRecord {
  const save = saveRecord({ ...value, version: 1, savedAt: new Date().toISOString() });
  const encoded = JSON.stringify(save);
  if (encoded.length > MAX_RECORD_LENGTH) throw new Error('The save is too large. Existing saves have not changed.');
  const store = storage();
  try { store.setItem(key, encoded); }
  catch (error) {
    const name = error instanceof Error ? error.name : '';
    throw new Error(name === 'QuotaExceededError' || name === 'NS_ERROR_DOM_QUOTA_REACHED'
      ? 'Browser storage is full. Free space for this site and try again; existing saves have not changed.'
      : 'The game could not be saved. Allow storage for this site and try again; existing saves have not changed.');
  }
  return save;
}

export function writeSaveSlot(index: number, value: Pick<SaveRecord, 'name' | 'location' | 'thumbnail' | 'state'>): SaveRecord {
  return writeRecord(slotKey(index), value);
}

export function deleteSaveSlot(index: number) {
  const key = slotKey(index);
  const store = storage();
  try { store.removeItem(key); }
  catch { throw new Error('The chapter could not be deleted.'); }
}

export function writeAutosave(value: Pick<SaveRecord, 'location' | 'thumbnail' | 'state'>): SaveRecord {
  return writeRecord(AUTOSAVE_KEY, { ...value, name: 'Autosave' });
}
