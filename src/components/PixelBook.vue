<template>
  <canvas ref="canvas" class="pixel-book" width="640" height="360" tabindex="0" role="dialog" aria-modal="true"
    :aria-label="canvasLabel" @pointermove="move" @pointerleave="leave" @pointerdown="press"
    @pointerup="release" @pointercancel="release" @keydown="key" @paste="paste" @wheel.prevent="scroll" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { locale, setLocale, t } from '../i18n';
import { withBase } from '../engine/core/assets';
import { ROOM_ART } from '../engine/core/constants';
import type { ControlMode, Vec2 } from '../engine/core/types';
import type { MusicPlayer, MusicState } from '../engine/audio/music';
import { AUTOSAVE_SLOT, type SaveRecord } from '../engine/gameplay/saveStorage';
import { devHighlights, devIntroScenes, devVariants, type DevScene } from '../engine/gameplay/devScenes';
import { prologue } from './prologue';
import { WIDTH, HEIGHT, SPREAD, COVER, ILLUSTRATION, RUBRIC, FOIL, INK, MUTED, loadBookArt, loadChapterFrame, printPicture, cropFrame, bookmarkPalette, surface,
  clamp, ease, mix, pixels, frame, text, sparkle, desk, bookShadow, turnLeaf, type Art, type Rect } from './pixelBookPaint';

type WalkSpeed = 'slowest' | 'slow' | 'fast' | 'fastest';
type Page = 'main' | 'story' | 'save' | 'load' | 'settings' | 'sound' | 'dev' | 'help' | 'setup';
type Slot = { index: number; error?: string | null } & Partial<SaveRecord>;
const props = defineProps<{
  options: boolean; mainMenu: boolean; gameOver: boolean; canSave: boolean; busy: boolean; returning: boolean; message: string;
  initialView: 'main' | 'load' | 'dev'; setup: boolean; latestSave: boolean; location: string;
  snapshot?: HTMLCanvasElement; gameCanvas?: HTMLCanvasElement; focus?: Vec2; openingReady: boolean; portrait: boolean;
  filmBounds?: Rect;
  slots: Slot[]; devScene: DevScene | null; devFinished: boolean;
  walkSpeed: WalkSpeed; controlMode: ControlMode; fullscreenAvailable: boolean; isFullscreen: boolean;
  music: MusicPlayer; musicState?: MusicState;
}>();
const emit = defineEmits<{
  begin: []; ready: []; open: []; resume: []; returned: []; prologue: []; continue: []; finishSetup: [ControlMode];
  start: []; save: [number, string]; load: [number]; control: [ControlMode]; speed: [WalkSpeed]; fullscreen: [];
  leave: ['intro' | 'menu']; devRun: [DevScene]; leaveDev: [];
}>();

const canvas = ref<HTMLCanvasElement>();
const canvasLabel = ref('');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const pages: Page[] = ['main', 'story', 'save', 'load', 'settings', 'sound', 'dev'];
const initial = props.options ? props.initialView : props.setup ? 'setup' : 'story';
let page: Page = initial, selectedMode = props.controlMode, chapter = 0, devPage = 0, query = '', saveName = '';
let selectedSlot: Slot | undefined, confirmLeave: 'intro' | 'menu' | null = null, editing: 'query' | 'save' | null = null;
let art: Art | undefined, ctx: CanvasRenderingContext2D, left: CanvasRenderingContext2D, outgoing: CanvasRenderingContext2D;
let bookmarks: HTMLCanvasElement[] = [];
const bookmarkOffsets = pages.map(() => 0);
let mountTime = 0, coverAt: number | null = null, finishAt: number | null = null, turnAt: number | null = null, storyAt = 0;
let pendingEnter = false, openingStarted = false, closing = false, wasReturning = false, direction = true, ready = false, renderFrame = 0, alive = true;
let time = 0, hover = '', focus = '', lastHover = -Infinity, dragging: Hit | undefined, revealAll = false, loadFailed = false;
let touch = false, keyboardLanguage = locale.value;
let choosingDevice = false, devicePage = 0, canvasSize: ResizeObserver;
let transitionFrame: HTMLCanvasElement | undefined;
let hits: Hit[] = [];
type Hit = { id: string; label: string; area: Rect; action: (x: number) => void; level?: number };
const thumbs = new Map<string, HTMLImageElement>();
const chapters = new Map<number, HTMLCanvasElement | null>();
const prints = new WeakMap<HTMLCanvasElement | HTMLImageElement, HTMLCanvasElement>();
let rooms: { id: number; name: string; title: string }[] | undefined;
let roomFetchFailed = false, roomLoading = false;
const tr = (en: string, ru: string) => locale.value === 'ru' ? ru : en;
const speedValues: WalkSpeed[] = ['slowest', 'slow', 'fast', 'fastest'];
const speedLabels = ['Slowest', 'Slow', 'Fast', 'Fastest'];
const textFont = 'Georgia, serif';
const LEFT = 137, RIGHT = 338, PAGE_W = 165, PAGE_TOP = 117, FOOT = 273;
const LEFT_CENTER = LEFT + PAGE_W / 2, RIGHT_CENTER = RIGHT + PAGE_W / 2;
const mainTitle = () => props.gameOver ? t("It didn't happen that way!") : tr('The Journey', 'Путешествие');
const names = () => ({ main: mainTitle(), story: tr('The Chronicles', 'Летопись'), save: t('Save your story'),
  load: t('Saved chapters'), settings: t('Settings'), sound: t('Sound settings'), dev: 'Dev Menu', help: t('How to play'), setup: t('Choose your controls') });

function add(id: string, label: string, area: Rect, action: Hit['action'], level?: number) {
  hits.push({ id, label, area, action, level });
}
function row(id: string, label: string, y: number, action: () => void, opts: { x?: number; w?: number; disabled?: boolean; marked?: boolean } = {}) {
  const x = opts.x ?? LEFT, w = opts.w ?? PAGE_W;
  const hot = !opts.disabled && (hover === id || focus === id);
  if (hot || opts.marked) {
    left.fillStyle = hot ? '#9b6b3f55' : '#a2744750';
    left.fillRect(x, y - 10, w, 21);
    left.fillStyle = hot ? '#80502c' : '#9c7048';
    left.fillRect(x, y - 10, 2, 21);
  }
  left.fillStyle = '#87623b66';
  left.fillRect(x, y + 11, w, 1);
  left.fillStyle = opts.disabled ? '#806b51' : RUBRIC;
  left.fillRect(x + 7, y - 1, 3, 3);
  text(left, label, x + 17, y, 12, opts.disabled ? '#76624b' : INK, 'left', textFont, w - 21);
  if (!opts.disabled) add(id, label, { x, y: y - 11, w, h: 23 }, action);
}
function heading(title: string, kicker: string, x = LEFT_CENTER) {
  text(left, kicker, x, 77, 8, MUTED, 'center', textFont, PAGE_W);
  text(left, title, x, 94, 21, RUBRIC, 'center', textFont, PAGE_W);
  left.fillStyle = '#ab794d8a';
  left.fillRect(x - 67, 106, 134, 1);
}
function lines(value: string, x: number, y: number, width: number, size = 13, limit = Infinity, drop = false, bottom = 285, color = INK) {
  let wrapped: string[];
  for (;;) {
    left.font = `${size}px ${textFont}`;
    wrapped = [];
    let line = '';
    for (const word of value.split(/\s+/)) {
      const candidate = line ? line + ' ' + word : word;
      if (line && left.measureText(candidate).width > width - (drop && !wrapped.length ? 12 : 0)) { wrapped.push(line); line = word; }
      else line = candidate;
    }
    if (line) wrapped.push(line);
    if (y + (wrapped.length - 1) * (size + 3) + size / 2 <= bottom || size <= 9) break;
    size -= .5;
  }
  let written = 0;
  for (const [index, content] of wrapped.entries()) {
    const visible = content.slice(0, Math.max(0, limit - written));
    if (drop && index === 0 && visible) {
      text(left, visible[0], x, y - 1, 22, '#8d3227', 'left', textFont);
      text(left, visible.slice(1), x + 17, y, size, color, 'left', textFont, width - 17);
    } else text(left, visible, x, y + index * (size + 3), size, color, 'left', textFont, width);
    written += content.length + 1;
  }
}
function flip(next: Page, change?: () => void) {
  if (next === page && !change) return;
  if (turnAt !== null) return;
  outgoing.clearRect(0, 0, WIDTH, HEIGHT);
  outgoing.drawImage(left.canvas, 0, 0, WIDTH, HEIGHT);
  direction = pages.indexOf(next) >= pages.indexOf(page);
  if (page === 'sound' && next !== 'sound') props.music.stopPreview();
  page = next;
  editing = null; focus = ''; hover = ''; selectedSlot = undefined; confirmLeave = null;
  choosingDevice = false;
  change?.();
  storyAt = time; revealAll = false;
  turnAt = reduced.matches ? null : time;
  props.music.bookSound('page');
  if (page === 'dev') void loadRooms();
  if (page === 'story') readChapter();
}
function readChapter() {
  const index = chapter;
  if (chapters.has(index)) return;
  chapters.set(index, null);
  void loadChapterFrame(index).then(image => chapters.set(index, image), () => {});
}
async function loadRooms() {
  if (rooms || roomLoading) return;
  roomLoading = true; roomFetchFailed = false;
  try {
    const response = await fetch(withBase('assets/world/world.json'));
    if (!response.ok) throw new Error('Scene list unavailable');
    rooms = (await response.json()).rooms;
  } catch { roomFetchFailed = true; }
  finally { roomLoading = false; }
}

function startCover() {
  if (coverAt !== null || props.busy || !art) return;
  coverAt = time;
  storyAt = time + 490;
  readChapter();
  if (!openingStarted) { openingStarted = true; emit('begin'); }
}
function enter() {
  pendingEnter = true;
  if (coverAt === null) { coverAt = time; props.music.bookSound('cover'); }
  props.music.stopPreview();
}
defineExpose({ openBook: enter });
function story() {
  const entry = prologue[locale.value][chapter];
  heading(entry.title, tr('CHRONICLES OF KYRANDIA', 'ЛЕТОПИСИ КИРАНДИИ'));
  const ink = revealAll || reduced.matches ? Infinity : Math.floor(Math.max(0, time - storyAt) / 10);
  lines(entry.text, LEFT, PAGE_TOP + 7, PAGE_W, 12, ink, true, 230);
  if (chapter > 0) row('previous', tr('‹ Back', '‹ Назад'), 247, () => flip('story', () => chapter--), { w: 68 });
  text(left, ['I', 'II', 'III', 'IV'][chapter], LEFT_CENTER, 247, 9, MUTED, 'center');
  if (ink < entry.text.length || chapter < 3) {
    row('next', ink < entry.text.length ? tr('Reveal', 'Проявить') : tr('Next ›', 'Дальше ›'), 247, () => {
      if (ink < entry.text.length) revealAll = true;
      else flip('story', () => chapter++);
    }, { x: LEFT + 98, w: 67 });
  }
  row('enter', props.options ? tr('Return to the journey', 'Назад к путешествию') : tr('Enter the legend', 'Перейти к легенде'), FOOT, () => {
    if (props.options) flip('main');
    else { emit('prologue'); enter(); }
  });
}
function main() {
  heading(mainTitle(), t('Fables & Fiends · Book One'));
  const options: [string, string, () => void, boolean?][] = [];
  if (props.devScene) {
    if (!props.devFinished && !props.gameOver) options.push(['resume', 'Resume', () => emit('resume')]);
    options.push(['replay', 'Replay test scene', () => emit('devRun', props.devScene!)], ['leave-dev', 'Return to the story', () => emit('leaveDev')]);
  } else if (props.gameOver) {
    options.push(['autosave', 'Continue from autosave', () => emit('load', AUTOSAVE_SLOT), !props.slots.some(slot => slot.index === AUTOSAVE_SLOT && slot.savedAt)],
      ['new', 'Start a new journey', () => emit('leave', 'menu')]);
  } else if (props.mainMenu) options.push(['start', 'Start Journey', () => emit('start')]);
  else options.push(['resume', 'Resume', () => emit('resume')], ['save', 'Save game', () => flip('save'), !props.canSave]);
  options.push(['load', 'Load game', () => flip('load'), !props.slots.some(slot => slot.savedAt || slot.error)],
    ['settings', 'Settings', () => flip('settings')], ['help', 'How to play', () => flip('help')]);
  options.forEach(([id, label, action, disabled], index) => row(id, t(label), 123 + index * 27, action, { disabled }));
}
function select<T extends string>(id: string, label: string, values: readonly T[], labels: string[], value: T, y: number, set: (value: T) => void, disabled = false) {
  const index = Math.max(0, values.indexOf(value));
  text(left, label, LEFT, y - 12, 9, MUTED);
  row(id, labels[index] + '   ›', y + 2, () => set(values[(index + 1) % values.length]), { disabled });
}
function settings() {
  heading(t('Settings'), tr('THE SCRIBE’S DESK', 'СТОЛ ПИСЦА'));
  if (confirmLeave) {
    lines(t('Leave this adventure? Unsaved progress will be lost.'), LEFT, 125, PAGE_W, 13);
    row('leave-confirm', t('Continue'), 211, () => emit('leave', confirmLeave!));
    row('leave-cancel', t('Stay here'), 242, () => confirmLeave = null);
    return;
  }
  select('language', t('Language'), ['en', 'ru'], ['English', 'Русский'], locale.value, 126, setLocale);
  select('speed', t('Walk speed'), speedValues, speedLabels.map(t), props.walkSpeed, 165, value => emit('speed', value));
  select('controls', t('Controls'), ['modern', 'classic'], [t('Modern'), t('Classic')], props.controlMode, 204, value => emit('control', value));
  if (props.fullscreenAvailable) row('fullscreen', t(props.isFullscreen ? 'Exit full screen' : 'Full screen'), 242, () => emit('fullscreen'));
  row('replay-intro', tr('Replay intro', 'Заставка'), FOOT, () => props.mainMenu ? emit('leave', 'intro') : confirmLeave = 'intro', { w: 84 });
  if (!props.mainMenu) row('menu', t('Main menu'), FOOT, () => confirmLeave = 'menu', { x: LEFT + 89, w: 76 });
}
function slider(id: string, label: string, enabled: boolean, value: number, y: number, toggle: () => void, update: (value: number) => void) {
  row(id, (enabled ? '◆  ' : '◇  ') + label, y, toggle);
  const area = { x: LEFT + 7, y: y + 15, w: 123, h: 15 };
  left.fillStyle = '#100b0d'; left.fillRect(area.x, area.y + 5, area.w, 5);
  left.fillStyle = enabled ? '#b77a45' : '#61504a'; left.fillRect(area.x, area.y + 6, Math.round(area.w * value), 3);
  const focused = focus === id + '-level' || hover === id + '-level';
  sparkle(left, area.x + Math.round(area.w * value), area.y + 7, focused ? 4 : 3, RUBRIC);
  text(left, Math.round(value * 100) + '%', LEFT + 136, area.y + 7, 9, MUTED);
  add(id + '-level', label + ' ' + Math.round(value * 100) + '%', area, x => update(clamp((x - area.x) / area.w)), value);
}
async function importAudio(rom: boolean) {
  const picker = document.createElement('input');
  picker.type = 'file'; picker.accept = rom ? '.rom,.bin' : '.sf2'; picker.multiple = rom;
  picker.onchange = () => {
    const files = [...picker.files ?? []];
    if (rom && files.length) void props.music.importRoms(files);
    else if (files[0]) void props.music.importSoundFont(files[0]);
  };
  picker.click();
}
function sound() {
  const state = props.musicState;
  if (!state) return;
  heading(t('Sound settings'), props.setup ? tr('THE FIRST LEAF  ·  II', 'ПЕРВЫЙ ЛИСТ  ·  II') : tr('MUSIC, EFFECTS & VOICES', 'МУЗЫКА, ЭФФЕКТЫ И ГОЛОСА'));
  const devices = [{ id: 'adlib', label: 'AdLib (OPL2)' }, { id: 'mt32', label: 'Roland MT-32 / CM-32L' },
    ...state.banks.map(bank => ({ id: 'sf2:' + bank.id, label: bank.name }))];
  const active = devices.find(device => device.id === state.renderer);
  if (choosingDevice) {
    devices.slice(devicePage * 5, devicePage * 5 + 5).forEach((device, i) => {
      row('device-' + device.id, device.label, 125 + i * 24, () => {
        choosingDevice = false;
        void props.music.selectRenderer(device.id);
      }, { marked: active === device, disabled: state.busy });
    });
    row('close-devices', tr('Back', 'Назад'), FOOT, () => choosingDevice = false, { w: 70 });
    if (devicePage) row('devices-prev', '‹', 273, () => devicePage--, { x: LEFT + 74, w: 35 });
    if ((devicePage + 1) * 5 < devices.length) row('devices-next', '›', 273, () => devicePage++, { x: LEFT + 117, w: 48 });
  } else {
    row('device', (active?.label ?? 'AdLib') + '  ▾', 125, () => { choosingDevice = true; devicePage = 0; }, { disabled: state.busy });
    slider('music', t('Music'), state.enabled, state.volume, 153, () => props.music.setEnabled(!state.enabled), value => props.music.setVolume(value));
    slider('effects', t('Sound effects'), state.sfxEnabled, state.sfxVolume, 192, () => props.music.setSfxEnabled(!state.sfxEnabled), value => props.music.setSfxVolume(value));
    slider('voice', t('CD voices (English)'), state.voiceEnabled, state.voiceVolume, 231, () => props.music.setVoiceEnabled(!state.voiceEnabled), value => props.music.setVoiceVolume(value));
    row('test-audio', t(state.previewing ? 'Stop test' : 'Test audio mix'), FOOT, () => props.music.preview(true), { disabled: state.busy || !state.available });
  }
  heading(tr('Sound banks', 'Банки звука'), tr('THE SOUND OF KYRANDIA', 'ЗВУК КИРАНДИИ'), RIGHT_CENTER);
  const description = state.renderer === 'mt32'
    ? tr('Choose the matching Control and PCM ROMs for your Roland MT-32 or CM-32L.', 'Выберите пару ROM Control и PCM от одной модели Roland MT-32 или CM-32L.')
    : state.renderer === 'adlib'
      ? tr('Original DOS sound. You can also load Roland ROMs or your own SF2 bank.', 'Звук DOS. Здесь же можно загрузить ROM Roland или свой банк SF2.')
      : tr('Your SoundFont plays through the General MIDI mapping.', 'SoundFont воспроизводится через раскладку General MIDI.');
  lines(description, RIGHT, 120, PAGE_W, 12, Infinity, false, 163);
  row('roms', tr('Import MT-32 ROMs', 'Загрузить ROM MT-32'), 178, () => void importAudio(true), { x: RIGHT, disabled: state.busy });
  row('soundfont', tr('Import SoundFont (.sf2)', 'Загрузить SoundFont (.sf2)'), 202, () => void importAudio(false), { x: RIGHT, disabled: state.busy });
  if (props.setup) {
    row('back-setup', tr('‹ Back', '‹ Назад'), FOOT, () => flip('setup'), { x: RIGHT, w: 66 });
    row('finish-setup', t('Continue'), FOOT, () => { props.music.stopPreview(); emit('finishSetup', selectedMode); flip('story'); },
      { x: RIGHT + 71, w: 94, disabled: state.busy || state.renderer === 'mt32' && !state.available });
  } else if (state.renderer === 'mt32' && state.available && state.source !== 'local') {
    row('remove-roms', t('Remove ROMs'), FOOT, () => void props.music.forgetRoms(), { x: RIGHT, disabled: state.busy });
  }
  const message = state.soundFontProgress !== undefined ? t('Loading SoundFont…') + ' ' + state.soundFontProgress + '%' : t(state.message);
  if (message) lines(message, RIGHT, 226, PAGE_W, 11, Infinity, false, 254, RUBRIC);
}
function setup() {
  heading(t('Controls'), tr('FIRST START  ·  I / II', 'ПЕРВЫЙ ЗАПУСК  ·  I / II'));
  row('modern', t('Modern'), 128, () => selectedMode = 'modern', { marked: selectedMode === 'modern' });
  row('classic', t('Classic'), 154, () => selectedMode = 'classic', { marked: selectedMode === 'classic' });
  lines(tr('You can switch modes later in the book settings.', 'Режим можно сменить в настройках книги.'), LEFT, 192, PAGE_W, 12);
  row('setup-next', tr('Sound settings ›', 'Далее: звук ›'), FOOT, () => flip('sound'));
}
function saveLoad() {
  heading(t(page === 'save' ? 'Save your story' : 'Saved chapters'), tr('THE BOOKMARKS YOU LEFT', 'ВАШИ ЗАКЛАДКИ'));
  if (selectedSlot) {
    lines(t('Replace this saved chapter?'), LEFT, 135, PAGE_W, 14);
    row('overwrite', t('Replace'), 212, () => { emit('save', selectedSlot!.index, saveName.trim() || t('Chapter ' + (selectedSlot!.index + 1))); selectedSlot = undefined; });
    row('cancel', t('Keep it'), 242, () => { selectedSlot = undefined; });
    return;
  }
  if (page === 'save') row('save-name', (editing === 'save' ? '› ' : '') + (saveName || t('Chapter name')) + (editing === 'save' ? '▏' : ''), 122, () => editing = 'save');
  const slots = props.slots.filter(slot => slot.index !== AUTOSAVE_SLOT || page === 'load' && (slot.savedAt || slot.error));
  slots.forEach((slot, index) => {
    const name = t(slot.name || (slot.index === AUTOSAVE_SLOT ? 'Autosave' : 'Chapter ' + (slot.index + 1)));
    row('slot-' + slot.index, name, 153 + index * 32, () => {
      if (page === 'load') emit('load', slot.index);
      else if (slot.savedAt || slot.error) { selectedSlot = slot; }
      else emit('save', slot.index, saveName.trim() || name);
    }, { disabled: page === 'load' ? !slot.savedAt || !!slot.error : !props.canSave });
    text(left, t(slot.error || (slot.savedAt ? slot.location || '' : 'Empty page')), LEFT + 16, 166 + index * 32, 9, MUTED, 'left', textFont, PAGE_W - 20);
  });
  if (!slots.length) lines(t('This page has no saved chapter.'), LEFT, 135, PAGE_W);
}
function dev() {
  heading('Dev Menu', tr('THE ROYAL ARCHIVE', 'КОРОЛЕВСКИЙ АРХИВ'));
  row('query', (query || t('Find a scene')) + (editing === 'query' ? '▏' : ''), 119, () => editing = 'query');
  const needle = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const scenes = [
    ...devHighlights.map(scene => ({ scene, detail: '#' + scene.room.room })),
    ...devIntroScenes.map(scene => ({ scene, detail: scene.intro })),
    ...devVariants.map(scene => ({ scene, detail: '#' + scene.room.room + ' ' + scene.room.resource })),
    ...((rooms ?? []).map(room => ({ scene: { label: room.title, room: { room: room.id } }, detail: '#' + room.id + ' ' + room.name }))),
  ].filter(({ scene, detail }) => needle.every(word => [t(scene.label), scene.label, detail].join(' ').toLocaleLowerCase().includes(word)));
  const count = Math.max(1, Math.ceil(scenes.length / 5));
  devPage = Math.max(0, Math.min(devPage, count - 1));
  scenes.slice(devPage * 5, devPage * 5 + 5).forEach(({ scene, detail }, index) => {
    const y = 145 + index * 23;
    row('scene-' + (devPage * 5 + index), t(scene.label), y, () => emit('devRun', scene), { w: 132 });
    text(left, detail.startsWith('#') ? detail.split(' ')[0] : '', LEFT + PAGE_W, y, 8, MUTED, 'right', 'monospace', 30);
  });
  if (!scenes.length) text(left, t('No matching scenes.'), LEFT, 150, 11, INK);
  if (roomFetchFailed) row('retry-scenes', t('Retry scene list'), 259, () => void loadRooms());
  if (roomLoading) text(left, t('Loading scene list…'), LEFT, 264, 9, MUTED);
  row('dev-prev', '‹', 268, () => devPage--, { w: 45, disabled: devPage === 0 });
  text(left, (devPage + 1) + ' / ' + count, LEFT_CENTER, 268, 10, MUTED, 'center');
  row('dev-next', '›', 268, () => devPage++, { x: LEFT + 121, w: 44, disabled: devPage + 1 >= count });
}
function help() {
  heading(t('How to play'), tr('A TRAVELLER’S GUIDE', 'ПАМЯТКА ПУТНИКУ'));
  lines(t('Click to walk. Move the cursor to an exit to reveal its arrow.'), LEFT, 124, PAGE_W, 12, Infinity, false, 168);
  lines(t('Click people to talk or objects to take them. Choose an inventory item, then click where to use it.'), LEFT, 176, PAGE_W, 12, Infinity, false, 225);
  lines(t(props.controlMode === 'modern' ? 'Right-click or press I to open the inventory. On touch screens, press and hold. Menu opens the book.' : 'Options returns you to this book and pauses the adventure.'), LEFT, 232, PAGE_W, 11);
}
function drawKeyboard() {
  heading(tr('Write here', 'Пишите здесь'), tr('THE SCRIBE’S QUILL', 'ПЕРО ПИСЦА'), RIGHT_CENTER);
  const rows = keyboardLanguage === 'ru'
    ? ['1234567890#', 'йцукенгшщзх', 'фывапролджэ', 'ячсмитьбюё-']
    : ['1234567890#', 'qwertyuiop-', 'asdfghjkl', 'zxcvbnm'];
  rows.forEach((letters, index) => {
    const start = Math.round(RIGHT_CENTER - letters.length * 7.5);
    Array.from(letters).forEach((letter, column) => {
      const area = { x: start + column * 15, y: 125 + index * 24, w: 14, h: 21 };
      left.fillStyle = '#4b3329';
      left.fillRect(area.x, area.y, area.w, area.h);
      text(left, letter, area.x + 7, area.y + 10, 10, FOIL, 'center', textFont, 14);
      add('letter-' + letter, letter, area, () => insert(letter));
    });
  });
  const commands: [string, string, () => void][] = [
    ['alphabet', keyboardLanguage === 'ru' ? 'ABC' : 'АБВ', () => keyboardLanguage = keyboardLanguage === 'ru' ? 'en' : 'ru'],
    ['space', tr('Space', 'Пробел'), () => insert(' ')],
    ['backspace', '⌫', erase],
    ['done', '✓', () => editing = null],
  ];
  commands.forEach(([id, label, action], index) => {
    const area = { x: RIGHT + index * 41, y: 227, w: 40, h: 24 };
    left.fillStyle = '#634331';
    left.fillRect(area.x, area.y, area.w, area.h);
    text(left, label, area.x + 20, area.y + 12, 10, FOIL, 'center', textFont, 37);
    add('keyboard-' + id, label, area, action);
  });
}
function picture() {
  if (page === 'sound') return;
  if (touch && editing) { drawKeyboard(); return; }
  if (page === 'setup') {
    const modern = selectedMode === 'modern', image = art![selectedMode];
    const title = t(modern ? 'Modern' : 'Classic');
    heading(title, tr('PREVIEW', 'ПРИМЕР'), RIGHT_CENTER);
    const w = PAGE_W - 4, h = Math.round(w * image.height / image.width);
    const r = { x: RIGHT + 2, y: 170 - Math.round(h / 2), w, h };
    frame(left, r);
    pixels(left, image, r);
    lines(modern
      ? tr('Full scene. Open the circular inventory with right-click, I, or a long press.', 'Вся сцена видна целиком. Инвентарь: ПКМ, клавиша I или долгое касание.')
      : tr('The original panel shows your inventory and menu below the scene.', 'Инвентарь и меню находятся под сценой, как в оригинальной игре.'), RIGHT, 234, PAGE_W, 12);
    return;
  }
  const slot = props.slots.find(slot => 'slot-' + slot.index === (hover || focus));
  if (slot?.thumbnail && !thumbs.has(slot.thumbnail)) { const image = new Image(); image.src = slot.thumbnail; thumbs.set(slot.thumbnail, image); }
  const thumb = slot?.thumbnail && thumbs.get(slot.thumbnail);
  const saved = thumb && thumb.complete && thumb.naturalWidth ? thumb : undefined;
  const entering = !props.options && pendingEnter ? transitionFrame : undefined;
  const image = entering ?? (page === 'story' ? chapters.get(chapter) : saved ?? props.snapshot ?? chapters.get(0));
  const label = entering ? t('The Legend of Kyrandia') : page === 'story' ? prologue[locale.value][chapter].title
    : slot?.location ? t(slot.location) : props.location ? t(props.location) : t('The Legend of Kyrandia');
  text(left, t('Book One'), RIGHT_CENTER, 81, 11, RUBRIC, 'center');
  if (image) {
    const r = page === 'story'
      ? { ...ILLUSTRATION, y: 132, h: Math.round(ILLUSTRATION.w * image.height / image.width) }
      : ILLUSTRATION;
    let print = prints.get(image);
    if (!print) {
      const source = image === saved && image.width === 320 && image.height === 200 ? cropFrame(image, ROOM_ART) : image;
      print = printPicture(source, r.w, r.h, image === props.snapshot ? props.focus : undefined);
      prints.set(image, print);
    }
    pixels(left, print, r);
  }
  text(left, label, RIGHT_CENTER, 252, 13, RUBRIC, 'center', textFont, PAGE_W);
  if (props.devScene) text(left, t(props.devScene.label), RIGHT_CENTER, 271, 10, MUTED, 'center', textFont, PAGE_W);
}
function paintPages() {
  left.clearRect(0, 0, WIDTH, HEIGHT);
  pixels(left, art!.spread, SPREAD);
  const available = props.options ? pages : props.setup ? [] : ['story', 'sound'] as const;
  const labels: Record<string, string> = {
    main: tr('Path', 'Путь'), story: tr('Story', 'Пролог'), save: tr('Save', 'Перо'), load: tr('Load', 'Главы'),
    settings: tr('Game', 'Игра'), sound: tr('Sound', 'Звук'), dev: 'Dev',
  };
  available.forEach((id, index) => {
    const y = 69 + index * 29;
    const hot = hover === 'tab-' + id || focus === 'tab-' + id, active = id === page;
    const sprite = pages.indexOf(id);
    const target = active ? 9 : hot ? 5 : 0;
    bookmarkOffsets[sprite] = reduced.matches ? target : bookmarkOffsets[sprite] + (target - bookmarkOffsets[sprite]) * .45;
    const x = 502 + Math.round(bookmarkOffsets[sprite]);
    pixels(left, bookmarks[sprite], { x, y, w: 41, h: 23 });
    text(left, labels[id], x + 19, y + 11, 10, hot || active ? '#fff1bd' : FOIL, 'center', textFont, 31);
    add('tab-' + id, names()[id], { x: 502, y, w: 50, h: 24 }, () => flip(id));
  });
  ({ main, story, settings, sound, setup, save: saveLoad, load: saveLoad, dev, help })[page]();
  picture();
  if (props.message) {
    left.fillStyle = '#301b17'; left.fillRect(111, 312, 418, 18);
    text(left, t(props.message), 320, 321, 10, FOIL, 'center', textFont, 407);
  }
}

function coverImage(r: Rect) {
  pixels(ctx, art!.cover, r);
}
function cover() {
  bookShadow(ctx, { x: COVER.x + 7, y: COVER.y + 7, w: COVER.w - 15, h: COVER.h - 24 });
  coverImage(COVER);
  const open = { x: COVER.x + 16, y: COVER.y + 11, w: COVER.w - 25, h: COVER.h - 13 };
  const label = t('Open the book');
  add('cover', label, open, startCover);
  const hot = hover === 'cover' || focus === 'cover';
  ctx.fillStyle = '#352118df'; ctx.fillRect(251, 276, 138, 17);
  text(ctx, label, 320, 284, 12, hot ? '#ffe6ae' : FOIL, 'center', textFont, 132);
  if (props.latestSave && !props.setup) {
    const r = { x: 449, y: 270, w: 134, h: 26 };
    frame(ctx, r, hover === 'continue' || focus === 'continue');
    text(ctx, t('Continue journey'), 516, 283, 12, FOIL, 'center', textFont, 125);
    add('continue', t('Continue journey'), r, () => emit('continue'));
  }
  pixels(ctx, art!.studio, { x: 577, y: 316, w: 48, h: 30 });
  text(ctx, t('Original tale © 1992 Westwood Studios'), 320, 346, 10, '#d3af84', 'center', textFont, 335);
  if (props.message || props.busy) text(ctx, t(props.message || 'Opening your saved chapter…'), 320, 325, 11, FOIL, 'center', textFont, 415);
}
function openCover(progress: number) {
  if (progress >= 1) {
    bookShadow(ctx, SPREAD);
    ctx.drawImage(left.canvas, 0, 0, WIDTH, HEIGHT);
    return;
  }
  const p = ease(progress);
  const angle = p * Math.PI;
  const hinge = Math.round(COVER.x + (WIDTH / 2 - COVER.x) * p);
  const half = SPREAD.w / 2, { y, h } = SPREAD;
  const w = Math.max(2, Math.round(COVER.w * Math.abs(Math.cos(angle))));
  const lift = Math.round(Math.sin(angle) * 6);
  const leftEdge = hinge - (p >= .5 ? w : 0);
  bookShadow(ctx, { x: leftEdge, y, w: hinge + half - leftEdge, h });
  // The right block lies flat while the cover turns around the spine.
  ctx.drawImage(art!.spread, half, 0, half, h, hinge, y, half, h);
  if (p < .5) coverImage({ x: hinge, y: y - lift, w, h: h + lift });
  else {
    ctx.drawImage(art!.spread, 0, 0, half, h, hinge - w, y - lift, w, h + lift);
  }
  if (p > .84) {
    ctx.globalAlpha = clamp((p - .84) / .16);
    ctx.drawImage(left.canvas, 0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;
  }
}
function liveScene() {
  const image = props.gameCanvas ?? props.snapshot;
  const bounds = props.filmBounds ?? (props.controlMode === 'modern' ? ROOM_ART : undefined);
  return image && bounds && image.width >= bounds.x + bounds.w && image.height >= bounds.y + bounds.h
    ? cropFrame(image, bounds) : image;
}
function sceneZoom(progress: number, source: HTMLCanvasElement) {
  const viewport = source.width / source.height > WIDTH / HEIGHT
    ? { x: 0, y: Math.round((HEIGHT - WIDTH * source.height / source.width) / 2), w: WIDTH, h: Math.round(WIDTH * source.height / source.width) }
    : { x: Math.round((WIDTH - HEIGHT * source.width / source.height) / 2), y: 0, w: Math.round(HEIGHT * source.width / source.height), h: HEIGHT };
  const p = ease(progress);
  if (p > .8) {
    ctx.fillStyle = 'rgba(0,0,0,' + clamp((p - .8) / .2) + ')';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  const scale = Math.min(ILLUSTRATION.w / source.width, ILLUSTRATION.h / source.height);
  const w = source.width * scale, h = source.height * scale;
  const pageFrame = { x: RIGHT_CENTER - w / 2, y: ILLUSTRATION.y + (ILLUSTRATION.h - h) / 2, w, h };
  ctx.globalAlpha = clamp(p / .18);
  pixels(ctx, source, mix(pageFrame, viewport, p));
  ctx.globalAlpha = 1;
}
function paint(now: number) {
  renderFrame = requestAnimationFrame(paint);
  if (now - time < 31) return;
  time = now;
  hits = [];
  if (!art) {
    ctx.fillStyle = '#200f11'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    text(ctx, t(loadFailed ? 'Try again' : 'Preparing your story…'), 320, 177, 13, FOIL, 'center');
    if (loadFailed) add('retry', t('Try again'), { x: 220, y: 151, w: 200, h: 52 }, () => void prepare());
    return;
  }
  const motion = reduced.matches ? 0 : time;
  desk(ctx, art, motion);
  if (props.portrait) {
    const panel = { x: 139, y: 96, w: 362, h: 168 };
    frame(ctx, panel, true);
    text(ctx, t('Turn your device'), 320, 139, 25, FOIL, 'center', textFont, 325);
    text(ctx, t('Kyrandia plays best in landscape and full screen.'), 320, 179, 13, FOIL, 'center', textFont, 330);
    if (props.fullscreenAvailable) {
      const label = t(props.isFullscreen ? 'Exit full screen' : 'Full screen');
      const area = { x: 220, y: 204, w: 200, h: 36 };
      frame(ctx, area, hover === 'rotate-fullscreen' || focus === 'rotate-fullscreen');
      text(ctx, label, 320, 222, 13, FOIL, 'center');
      add('rotate-fullscreen', label, area, () => emit('fullscreen'));
    }
    return;
  }
  const openProgress = props.options ? 1 : coverAt === null ? 0 : reduced.matches ? 1 : clamp((time - coverAt) / 490);
  if (!props.options && coverAt === null) {
    cover();
    return;
  }
  paintPages();
  openCover(openProgress);
  if (turnAt !== null) {
    const p = clamp((time - turnAt) / 340);
    if (p < 1) turnLeaf(ctx, outgoing.canvas, left.canvas, ease(p), direction);
    else turnAt = null;
  }
  if (props.options && !ready) {
    const progress = reduced.matches ? 1 : clamp((time - mountTime) / 365);
    transitionFrame ??= liveScene();
    if (progress < 1 && transitionFrame) sceneZoom(1 - progress, transitionFrame);
    else { ready = true; emit('ready'); }
  }
  if (!props.options && pendingEnter && !props.openingReady && openProgress === 1) {
    text(ctx, t('Preparing your story…'), RIGHT_CENTER, 276, 10, RUBRIC, 'center');
  }
  if (!props.options && pendingEnter && openProgress === 1 && props.openingReady && finishAt === null
    || props.options && props.returning && !wasReturning) {
    finishAt = time;
    transitionFrame = liveScene();
  }
  wasReturning = props.returning;
  if (finishAt !== null && !closing) {
    const progress = reduced.matches ? 1 : clamp((time - finishAt) / 365);
    if (transitionFrame) sceneZoom(progress, transitionFrame);
    if (progress === 1) { closing = true; props.options ? emit('returned') : emit('open'); }
  }
  if (openProgress < 1 || props.options && !ready || turnAt !== null || pendingEnter || props.returning || props.busy) hits = [];
  if (!canvasLabel.value) canvasLabel.value = names()[page];
}
async function prepare() {
  loadFailed = false;
  try {
    const loaded = await loadBookArt();
    if (!alive) return;
    bookmarks = bookmarkPalette(loaded.bookmark);
    art = loaded;
    mountTime = performance.now();
    if (page === 'dev') void loadRooms();
  } catch { loadFailed = true; }
}
onMounted(() => {
  function resize() {
    const target = canvas.value!;
    const scale = Math.max(1, Math.min(3, devicePixelRatio * Math.min(target.clientWidth / WIDTH, target.clientHeight / HEIGHT)));
    if (ctx && target.width === Math.round(WIDTH * scale)) return;
    ctx = surface(scale, target);
    left = surface(scale); outgoing = surface(scale);
    turnAt = null;
  }
  resize();
  canvasSize = new ResizeObserver(resize);
  canvasSize.observe(canvas.value!);
  canvasLabel.value = t('Fables and Fiends, Book One');
  canvas.value!.focus({ preventScroll: true });
  renderFrame = requestAnimationFrame(paint);
  void prepare();
});
onBeforeUnmount(() => {
  alive = false;
  cancelAnimationFrame(renderFrame);
  canvasSize.disconnect();
  props.music.stopPreview();
});

function point(event: PointerEvent) {
  const bounds = canvas.value!.getBoundingClientRect();
  const scale = Math.min(bounds.width / WIDTH, bounds.height / HEIGHT);
  return {
    x: (event.clientX - bounds.left - (bounds.width - WIDTH * scale) / 2) / scale,
    y: (event.clientY - bounds.top - (bounds.height - HEIGHT * scale) / 2) / scale,
  };
}
function at(x: number, y: number) {
  return hits.find(({ area }) => x >= area.x && x < area.x + area.w && y >= area.y && y < area.y + area.h);
}
function move(event: PointerEvent) {
  const { x, y } = point(event);
  if (dragging) dragging.action(x);
  const hit = at(x, y);
  const id = hit?.id ?? '';
  if (id !== hover && hit && event.pointerType === 'mouse' && time - lastHover > 90) {
    props.music.bookSound('hover');
    lastHover = time;
  }
  hover = id;
}
function leave() { hover = ''; }
function press(event: PointerEvent) {
  if (event.button !== 0) return;
  const { x, y } = point(event), hit = at(x, y);
  if (!hit) { editing = null; return; }
  touch = event.pointerType !== 'mouse';
  canvas.value?.focus({ preventScroll: true });
  focus = '';
  if (hit.id !== 'query' && hit.id !== 'save-name' && !hit.id.startsWith('letter-') && !hit.id.startsWith('keyboard-')) editing = null;
  if (hit.level !== undefined) { dragging = hit; canvas.value?.setPointerCapture(event.pointerId); }
  props.music.bookSound('click');
  hit.action(x);
}
function release() { dragging = undefined; }
function scroll(event: WheelEvent) { if (page === 'dev' && hits.length) devPage += Math.sign(event.deltaY); }
function insert(value: string) {
  if (editing === 'query') { query = (query + value).slice(0, 48); devPage = 0; }
  else if (editing === 'save') saveName = (saveName + value).slice(0, 48);
}
function erase() {
  if (editing === 'query') { query = query.slice(0, -1); devPage = 0; }
  else if (editing === 'save') saveName = saveName.slice(0, -1);
}
function paste(event: ClipboardEvent) { if (editing) { event.preventDefault(); insert(event.clipboardData?.getData('text').replace(/[\r\n]+/g, ' ') ?? ''); } }
function key(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (editing) editing = null;
    else if (choosingDevice) choosingDevice = false;
    else if (props.options && !props.mainMenu && !props.gameOver && !props.devFinished && hits.length) emit('resume');
    else if (props.options && hits.length) flip('main');
    else return;
    event.preventDefault(); event.stopPropagation();
    return;
  }
  if (editing && !event.ctrlKey && !event.metaKey && !event.altKey) {
    if (event.key === 'Backspace') erase();
    else if (event.key === 'Enter') editing = null;
    else if (event.key.length === 1) insert(event.key);
    else return;
    event.preventDefault();
    return;
  }
  const focused = hits.find(hit => hit.id === focus);
  if (focused?.level !== undefined && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    event.preventDefault();
    const amount = event.key === 'ArrowLeft' ? -.05 : .05;
    focused.action(focused.area.x + focused.area.w * clamp(focused.level + amount));
  } else if (event.key === 'Tab' && hits.length) {
    event.preventDefault();
    const index = hits.findIndex(hit => hit.id === focus);
    const next = hits[(index < 0 ? event.shiftKey ? hits.length - 1 : 0 : (index + (event.shiftKey ? -1 : 1) + hits.length) % hits.length)];
    focus = next.id;
    canvasLabel.value = next.label;
  } else if (event.key === 'Enter' || event.key === ' ') {
    const hit = focused ?? (focus ? undefined : hits[0]);
    if (!hit) return;
    event.preventDefault();
    if (hit.level !== undefined) return;
    props.music.bookSound('click');
    hit.action(hit.area.x + hit.area.w / 2);
  } else if (page === 'dev' && hits.length && (event.key === 'PageUp' || event.key === 'PageDown')) {
    event.preventDefault();
    devPage += event.key === 'PageUp' ? -1 : 1;
  }
}
</script>

<style scoped>
.pixel-book {
  position: fixed;
  z-index: 20;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #160d0e;
  cursor: url('/assets/cursors/book-pointer.svg') 2 2, auto;
  touch-action: none;
  outline: none;
}
</style>
