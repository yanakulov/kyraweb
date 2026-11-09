<template>
  <canvas ref="canvas" class="pixel-book" width="640" height="360" tabindex="0" role="dialog" aria-modal="true"
    :aria-label="canvasLabel" @pointermove="move" @pointerleave="leave" @pointerdown="press"
    @pointerup="release" @pointercancel="release" @keydown="key" @paste="paste" @wheel.prevent="scroll" />
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { locale, setLocale, t } from '../i18n';
import { withBase } from '../engine/core/assets';
import type { ControlMode, Vec2 } from '../engine/core/types';
import type { MusicPlayer, MusicState } from '../engine/audio/music';
import { AUTOSAVE_SLOT, type SaveRecord } from '../engine/gameplay/saveStorage';
import { devHighlights, devIntroScenes, devVariants, type DevScene } from '../engine/gameplay/devScenes';
import { prologue } from './prologue';
import { WIDTH, HEIGHT, SPREAD, COVER, ILLUSTRATION, GOLD, INK, MUTED, loadBookArt, bookmarkPalette, surface,
  clamp, ease, mix, pixels, photo, frame, text, sparkle, desk, bookShadow, turnLeaf, type Art, type Rect } from './pixelBookPaint';

type WalkSpeed = 'slowest' | 'slow' | 'fast' | 'fastest';
type Page = 'main' | 'story' | 'save' | 'load' | 'settings' | 'sound' | 'dev' | 'help' | 'setup';
type Slot = { index: number; error?: string | null } & Partial<SaveRecord>;
const props = defineProps<{
  options: boolean; mainMenu: boolean; gameOver: boolean; canSave: boolean; busy: boolean; returning: boolean; message: string;
  initialView: 'main' | 'load' | 'dev'; setup: boolean; latestSave: boolean; seenPrologue: boolean; location: string;
  snapshot?: HTMLCanvasElement; gameCanvas?: HTMLCanvasElement; focus?: Vec2; openingReady: boolean; portrait: boolean;
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
let hits: Hit[] = [];
type Hit = { id: string; label: string; area: Rect; action: (x: number) => void; level?: number };
const thumbs = new Map<string, HTMLImageElement>();
let rooms: { id: number; name: string; title: string }[] | undefined;
let roomFetchFailed = false, roomLoading = false;
const tr = (en: string, ru: string) => locale.value === 'ru' ? ru : en;
const speedValues: WalkSpeed[] = ['slowest', 'slow', 'fast', 'fastest'];
const speedLabels = ['Slowest', 'Slow', 'Fast', 'Fastest'];
const textFont = 'Georgia, serif';
const titleFont = 'Germanica, Georgia, serif';
const mainTitle = () => props.gameOver ? t("It didn't happen that way!") : tr('The Journey', 'Путешествие');
const names = () => ({ main: mainTitle(), story: tr('The Chronicles', 'Летопись'), save: t('Save your story'),
  load: t('Saved chapters'), settings: t('Settings'), sound: t('Sound settings'), dev: 'Dev Menu', help: t('How to play'), setup: t('Choose your controls') });

function add(id: string, label: string, area: Rect, action: Hit['action'], level?: number) {
  hits.push({ id, label, area, action, level });
}
function row(id: string, label: string, y: number, action: () => void, opts: { x?: number; w?: number; disabled?: boolean; marked?: boolean; font?: string } = {}) {
  const x = opts.x ?? 113, w = opts.w ?? 181;
  const hot = !opts.disabled && (hover === id || focus === id);
  if (hot || opts.marked) {
    left.fillStyle = hot ? '#66402f' : '#49372c';
    left.fillRect(x, y - 10, w, 21);
    left.fillStyle = hot ? '#d0a364' : '#8a663b';
    left.fillRect(x, y - 10, 2, 21);
  }
  left.fillStyle = '#87623b66';
  left.fillRect(x, y + 11, w, 1);
  sparkle(left, x + 8, y, hot ? 2 : 1, opts.disabled ? '#685444' : '#af854d');
  text(left, label, x + 17, y, 11, opts.disabled ? '#8a7362' : hot ? '#fff1bc' : INK, 'left', opts.font, w - 21);
  if (!opts.disabled) add(id, label, { x, y: y - 11, w, h: 23 }, action);
}
function heading(title: string, kicker: string, x = 204) {
  text(left, kicker, x, 66, 8, MUTED, 'center', textFont, 195);
  text(left, title, x, 85, 24, GOLD, 'center', titleFont, 192);
  left.fillStyle = '#ab794d8a';
  left.fillRect(x - 67, 101, 134, 1);
  sparkle(left, x, 101, 3, '#9c7040');
}
function lines(value: string, x: number, y: number, width: number, size = 13, limit = Infinity, drop = false) {
  left.font = `${size}px ${textFont}`;
  const wrapped: string[] = [];
  let line = '';
  for (const word of value.split(/\s+/)) {
    const candidate = line ? line + ' ' + word : word;
    if (line && left.measureText(candidate).width > width - (drop && !wrapped.length ? 10 : 0)) { wrapped.push(line); line = word; }
    else line = candidate;
  }
  if (line) wrapped.push(line);
  let written = 0;
  for (const [index, content] of wrapped.entries()) {
    const visible = content.slice(0, Math.max(0, limit - written));
    if (drop && index === 0 && visible) {
      text(left, visible[0], x, y + 1, 25, '#f09a6e', 'left', titleFont);
      text(left, visible.slice(1), x + 16, y, size, INK, 'left', textFont, width - 16);
    } else text(left, visible, x, y + index * (size + 4), size, INK, 'left', textFont, width);
    written += content.length + 1;
  }
}
function flip(next: Page, change?: () => void) {
  if (next === page && !change) return;
  if (turnAt !== null) return;
  outgoing.clearRect(0, 0, WIDTH, HEIGHT);
  outgoing.drawImage(left.canvas, 0, 0);
  direction = pages.indexOf(next) >= pages.indexOf(page);
  if (page === 'sound' && next !== 'sound') props.music.stopPreview();
  page = next;
  editing = null; focus = ''; hover = ''; selectedSlot = undefined; confirmLeave = null;
  change?.();
  storyAt = time; revealAll = false;
  turnAt = reduced.matches ? null : time;
  props.music.bookSound('page');
  if (page === 'dev') void loadRooms();
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
  storyAt = time + 550;
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
  const show = props.options || !props.seenPrologue;
  heading(show ? entry.title : t('Book One'), tr('FROM THE CHRONICLES OF KYRANDIA', 'ИЗ ЛЕТОПИСЕЙ КИРАНДИИ'));
  if (show) {
    const ink = revealAll || reduced.matches ? Infinity : Math.floor(Math.max(0, time - storyAt) / 16);
    lines(entry.text, 116, 121, 173, 12, ink, true);
    if (chapter > 0) row('previous', tr('‹  Previous', '‹  Назад'), 243, () => flip('story', () => chapter--), { w: 81 });
    row('next', ink < entry.text.length ? tr('Reveal', 'Проявить') : tr('Next page  ›', 'Дальше  ›'), 243, () => {
      if (ink < entry.text.length) revealAll = true;
      else if (chapter < 3) flip('story', () => chapter++);
    }, { x: 210, w: 83, disabled: chapter === 3 && ink >= entry.text.length });
  } else lines(tr('The kingdom is waiting. The next page belongs to you.', 'Королевство ждёт. Следующая страница за вами.'), 116, 142, 173, 14);
  row('enter', props.options ? tr('Return to the journey', 'Назад к путешествию') : tr('Enter the legend', 'Перейти к легенде'), 269, () => {
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
  text(left, label, 114, y - 12, 9, MUTED);
  row(id, labels[index] + '   ›', y + 2, () => set(values[(index + 1) % values.length]), { disabled });
}
function settings() {
  heading(t('Settings'), tr('THE SCRIBE’S DESK', 'СТОЛ ПИСЦА'));
  if (confirmLeave) {
    lines(t('Leave this adventure? Unsaved progress will be lost.'), 116, 125, 173, 13);
    row('leave-confirm', t('Continue'), 211, () => emit('leave', confirmLeave!));
    row('leave-cancel', t('Stay here'), 242, () => confirmLeave = null);
    return;
  }
  select('language', t('Language'), ['en', 'ru'], ['English', 'Русский'], locale.value, 126, setLocale);
  select('speed', t('Walk speed'), speedValues, speedLabels.map(t), props.walkSpeed, 165, value => emit('speed', value));
  select('controls', t('Controls'), ['modern', 'classic'], [t('Modern'), t('Classic')], props.controlMode, 204, value => emit('control', value));
  if (props.fullscreenAvailable) row('fullscreen', t(props.isFullscreen ? 'Exit full screen' : 'Full screen'), 242, () => emit('fullscreen'));
  row('replay-intro', t('Replay intro'), 268, () => props.mainMenu ? emit('leave', 'intro') : confirmLeave = 'intro', { w: 106, font: textFont });
  if (!props.mainMenu) row('menu', t('Main menu'), 268, () => confirmLeave = 'menu', { x: 221, w: 73, font: textFont });
}
function slider(id: string, label: string, enabled: boolean, value: number, y: number, toggle: () => void, update: (value: number) => void) {
  row(id, (enabled ? '◆  ' : '◇  ') + label, y, toggle);
  const area = { x: 119, y: y + 16, w: 142, h: 15 };
  left.fillStyle = '#100b0d'; left.fillRect(area.x, area.y + 5, area.w, 5);
  left.fillStyle = enabled ? '#b77a45' : '#61504a'; left.fillRect(area.x, area.y + 6, Math.round(area.w * value), 3);
  const focused = focus === id + '-level' || hover === id + '-level';
  sparkle(left, area.x + Math.round(area.w * value), area.y + 7, focused ? 4 : 3, GOLD);
  text(left, Math.round(value * 100) + '%', 271, area.y + 7, 9, MUTED);
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
  const devices = ['adlib', 'mt32', ...state.banks.map(bank => 'sf2:' + bank.id)];
  select('device', t('Music device'), devices, ['AdLib (OPL2)', 'Roland MT-32 / CM-32L', ...state.banks.map(bank => 'SF2 · ' + bank.name)],
    state.renderer, 119, value => void props.music.selectRenderer(value), state.busy);
  slider('music', t('Music'), state.enabled, state.volume, 151, () => props.music.setEnabled(!state.enabled), value => props.music.setVolume(value));
  slider('effects', t('Sound effects'), state.sfxEnabled, state.sfxVolume, 192, () => props.music.setSfxEnabled(!state.sfxEnabled), value => props.music.setSfxVolume(value));
  slider('voice', t('CD voices (English)'), state.voiceEnabled, state.voiceVolume, 233, () => props.music.setVoiceEnabled(!state.voiceEnabled), value => props.music.setVoiceVolume(value));
  row('test-audio', t(state.previewing ? 'Stop test' : 'Test audio mix'), 271, () => props.music.preview(true), { disabled: state.busy || !state.available });
  heading(tr('The Instrument', 'Инструмент'), tr('THE SOUND OF KYRANDIA', 'ЗВУК КИРАНДИИ'), 434);
  lines(t(state.renderer === 'mt32' ? 'Choose your own matching MT-32 or CM-32L Control and PCM ROMs. Files stay in this browser and are never uploaded.'
    : state.renderer === 'adlib' ? 'Original DOS AdLib music. No ROM or SoundFont required.' : 'SoundFont mode uses approximate MT-32 to GM instrument mapping.'), 347, 122, 173, 13);
  if (state.renderer === 'mt32') {
    row('roms', t(state.available ? 'Replace ROM pair' : 'Import ROM pair'), 197, () => void importAudio(true), { x: 344, disabled: state.busy });
    if (state.available && state.source !== 'local') row('remove-roms', t('Remove ROMs'), 221, () => void props.music.forgetRoms(), { x: 344, disabled: state.busy });
  }
  if (!props.setup) row('soundfont', t('Add SoundFont bank (.sf2)'), 250, () => void importAudio(false), { x: 344, disabled: state.busy });
  if (props.setup) {
    row('back-setup', t('Previous page'), 242, () => flip('setup'), { x: 344 });
    row('finish-setup', t('Continue'), 269, () => { props.music.stopPreview(); emit('finishSetup', selectedMode); flip('story'); },
      { x: 344, disabled: state.busy || state.renderer === 'mt32' && !state.available });
  }
  const message = state.soundFontProgress !== undefined ? t('Loading SoundFont…') + ' ' + state.soundFontProgress + '%' : t(state.message);
  if (message) text(left, message, 347, 235, 9, GOLD, 'left', undefined, 176);
}
function setup() {
  heading(t('Choose your controls'), tr('THE FIRST LEAF  ·  I', 'ПЕРВЫЙ ЛИСТ  ·  I'));
  lines(t('Choose how you want to explore Kyrandia. You can change this later in the book.'), 116, 125, 174, 13);
  row('modern', t('Modern'), 193, () => selectedMode = 'modern', { marked: selectedMode === 'modern' });
  row('classic', t('Classic'), 220, () => selectedMode = 'classic', { marked: selectedMode === 'classic' });
  row('setup-next', t('Next page'), 269, () => flip('sound'));
}
function saveLoad() {
  heading(t(page === 'save' ? 'Save your story' : 'Saved chapters'), tr('THE BOOKMARKS YOU LEFT', 'ВАШИ ЗАКЛАДКИ'));
  if (selectedSlot) {
    lines(t('Replace this saved chapter?'), 116, 135, 176, 14);
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
    text(left, t(slot.error || (slot.savedAt ? slot.location || '' : 'Empty page')), 130, 166 + index * 32, 8, MUTED, 'left', textFont, 159);
  });
  if (!slots.length) lines(t('This page has no saved chapter.'), 116, 135, 175);
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
    row('scene-' + (devPage * 5 + index), t(scene.label), y, () => emit('devRun', scene), { w: 150, font: textFont });
    text(left, detail.startsWith('#') ? detail.split(' ')[0] : '', 294, y, 7, MUTED, 'right', 'monospace', 30);
  });
  if (!scenes.length) text(left, t('No matching scenes.'), 116, 150, 11, INK);
  if (roomFetchFailed) row('retry-scenes', t('Retry scene list'), 259, () => void loadRooms());
  if (roomLoading) text(left, t('Loading scene list…'), 116, 264, 9, MUTED);
  row('dev-prev', '‹', 268, () => devPage--, { w: 45, disabled: devPage === 0 });
  text(left, (devPage + 1) + ' / ' + count, 204, 268, 10, MUTED, 'center');
  row('dev-next', '›', 268, () => devPage++, { x: 250, w: 44, disabled: devPage + 1 >= count });
}
function help() {
  heading(t('How to play'), tr('A TRAVELLER’S GUIDE', 'ПАМЯТКА ПУТНИКУ'));
  lines(t('Click to walk. Move the cursor to an exit to reveal its arrow.'), 116, 124, 177);
  lines(t('Click people to talk or objects to take them. Choose an inventory item, then click where to use it.'), 116, 181, 177);
  lines(t(props.controlMode === 'modern' ? 'Right-click or press I to open the inventory. On touch screens, press and hold. Menu opens the book.' : 'Options returns you to this book and pauses the adventure.'), 116, 245, 177, 11);
}
function drawKeyboard() {
  heading(tr('Write here', 'Пишите здесь'), tr('THE SCRIBE’S QUILL', 'ПЕРО ПИСЦА'), 434);
  const rows = keyboardLanguage === 'ru'
    ? ['1234567890#', 'йцукенгшщзх', 'фывапролджэ', 'ячсмитьбюё-']
    : ['1234567890#', 'qwertyuiop-', 'asdfghjkl', 'zxcvbnm'];
  rows.forEach((letters, index) => {
    const start = Math.round(434 - letters.length * 8);
    Array.from(letters).forEach((letter, column) => {
      const area = { x: start + column * 16, y: 125 + index * 24, w: 15, h: 21 };
      left.fillStyle = '#4b3329';
      left.fillRect(area.x, area.y, area.w, area.h);
      text(left, letter, area.x + 7, area.y + 10, 10, GOLD, 'center', textFont, 14);
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
    const area = { x: 347 + index * 44, y: 227, w: 43, h: 24 };
    left.fillStyle = '#634331';
    left.fillRect(area.x, area.y, area.w, area.h);
    text(left, label, area.x + 21, area.y + 12, 10, GOLD, 'center', textFont, 39);
    add('keyboard-' + id, label, area, action);
  });
}
function picture() {
  if (page === 'sound') return;
  if (touch && editing) { drawKeyboard(); return; }
  const slot = props.slots.find(slot => 'slot-' + slot.index === (hover || focus));
  if (slot?.thumbnail && !thumbs.has(slot.thumbnail)) { const image = new Image(); image.src = slot.thumbnail; thumbs.set(slot.thumbnail, image); }
  const thumb = slot?.thumbnail && thumbs.get(slot.thumbnail);
  const image = page === 'setup' ? art![selectedMode] : thumb && thumb.complete && thumb.naturalWidth ? thumb : props.snapshot || art!.miniature;
  const label = page === 'setup' ? t(selectedMode === 'modern' ? 'Modern' : 'Classic')
    : slot?.location ? t(slot.location) : props.options && props.location ? t(props.location) : t('The Legend of Kyrandia');
  text(left, tr('✦  ·  BOOK ONE  ·  ✦', '✦  ·  КНИГА ПЕРВАЯ  ·  ✦'), 434, 71, 9, GOLD, 'center', textFont);
  frame(left, ILLUSTRATION, true);
  photo(left, image, ILLUSTRATION, image === props.snapshot ? props.focus : undefined, page === 'setup');
  text(left, label, 435, 256, 13, GOLD, 'center', titleFont, 180);
  if (page === 'setup') lines(t(selectedMode === 'modern' ? 'Full scene with a circular inventory.' : 'Original inventory bar beneath the scene.'), 345, 271, 178, 10);
  else if (props.devScene) text(left, t(props.devScene.label), 435, 270, 10, MUTED, 'center', textFont, 175);
  else text(left, tr('Fables & Fiends', 'Сказки и демоны'), 435, 271, 11, MUTED, 'center', textFont);
}
function paintPages() {
  left.clearRect(0, 0, WIDTH, HEIGHT);
  pixels(left, art!.spread, SPREAD);
  const available = props.options ? pages : props.setup ? [] : ['story', 'sound'] as const;
  const labels: Record<string, string> = {
    main: tr('Path', 'Путь'), story: tr('Tale', 'Сказ'), save: tr('Save', 'Перо'), load: tr('Load', 'Главы'),
    settings: tr('Game', 'Игра'), sound: tr('Sound', 'Звук'), dev: 'Dev',
  };
  available.forEach((id, index) => {
    const y = 69 + index * 29;
    const hot = hover === 'tab-' + id || focus === 'tab-' + id, active = id === page;
    const sprite = pages.indexOf(id);
    const target = active ? 11 : hot ? 5 : 0;
    bookmarkOffsets[sprite] = reduced.matches ? target : bookmarkOffsets[sprite] + (target - bookmarkOffsets[sprite]) * .45;
    const x = 558 + Math.round(bookmarkOffsets[sprite]);
    pixels(left, bookmarks[sprite], { x, y, w: 59, h: 24 });
    left.fillStyle = '#220e1266'; left.fillRect(x + 2, y + 4, 8, 16);
    sparkle(left, x + 14, y + 12, active ? 2 : 1, GOLD);
    text(left, labels[id], x + 19, y + 12, 11, hot || active ? '#fff1bd' : INK, 'left', textFont, 34);
    add('tab-' + id, names()[id], { x: 568, y, w: 63, h: 24 }, () => flip(id));
  });
  ({ main, story, settings, sound, setup, save: saveLoad, load: saveLoad, dev, help })[page]();
  picture();
  if (props.message) {
    left.fillStyle = '#200f12'; left.fillRect(106, 294, 426, 16);
    text(left, t(props.message), 319, 301, 10, GOLD, 'center', undefined, 415);
  }
}

function coverImage(r: Rect) {
  bookShadow(ctx, r);
  pixels(ctx, art!.cover, r);
  if (r.w > 30) {
    pixels(ctx, art!.title, { x: r.x + r.w * .18, y: r.y + r.h * .093, w: r.w * .70, h: r.h * .17 });
    if (r.w > 190 && !reduced.matches) {
      const phase = (time % 3200) / 3200;
      if (phase < .17) sparkle(ctx, Math.round(r.x + r.w * .545), Math.round(r.y + r.h * .795), 2 + Math.round(Math.sin(phase / .17 * Math.PI) * 3), '#8bdc9e');
    }
  }
}
function cover() {
  coverImage(COVER);
  const open = { x: COVER.x + 16, y: COVER.y + 11, w: COVER.w - 25, h: COVER.h - 13 };
  const label = t('Open the book');
  add('cover', label, open, startCover);
  const hot = hover === 'cover' || focus === 'cover';
  ctx.fillStyle = '#280f10cf'; ctx.fillRect(254, 293, 146, 17);
  text(ctx, label, 327, 302, 11, hot ? '#ffe6a2' : GOLD, 'center', undefined, 140);
  if (hot) {
    sparkle(ctx, 260, 302, 2, GOLD);
    sparkle(ctx, 393, 302, 2, GOLD);
  }
  if (props.latestSave && !props.setup) {
    const r = { x: 454, y: 273, w: 156, h: 28 };
    frame(ctx, r, hover === 'continue' || focus === 'continue');
    text(ctx, t('Continue journey'), 532, 287, 11, GOLD, 'center');
    add('continue', t('Continue journey'), r, () => emit('continue'));
  }
  pixels(ctx, art!.studio, { x: 582, y: 316, w: 43, h: 27 });
  text(ctx, t('Original tale © 1992 Westwood Studios'), 16, 346, 8, '#c49c72', 'left', textFont, 270);
  if (props.message || props.busy) text(ctx, t(props.message || 'Opening your saved chapter…'), 320, 350, 8, GOLD, 'center', undefined, 415);
}
function openCover(progress: number) {
  if (progress >= 1) {
    bookShadow(ctx, SPREAD);
    ctx.drawImage(left.canvas, 0, 0);
    return;
  }
  const p = ease(progress);
  const angle = p * Math.PI;
  const hinge = Math.round(COVER.x + (316 - COVER.x) * p);
  const openingWidth = Math.round(SPREAD.w * .5 * p);
  bookShadow(ctx, mix(COVER, SPREAD, p));
  ctx.save();
  ctx.beginPath();
  ctx.rect(hinge - openingWidth, SPREAD.y, Math.max(0, 2 * openingWidth), SPREAD.h);
  ctx.clip();
  ctx.globalAlpha = clamp(p * 2);
  ctx.drawImage(left.canvas, 0, 0);
  ctx.restore();
  const w = Math.max(2, Math.round(COVER.w * Math.abs(Math.cos(angle))));
  const top = COVER.y - Math.round(Math.sin(angle) * 6);
  if (p < .5) coverImage({ x: hinge, y: top, w, h: COVER.h });
  else {
    ctx.drawImage(art!.spread, 0, 0, 274, 310, hinge - w, top, w, 310);
    ctx.fillStyle = 'rgba(221,159,91,' + Math.sin(angle) * .24 + ')';
    ctx.fillRect(hinge - w, top + 11, w, 279);
  }
}
function sceneZoom(progress: number, source: HTMLCanvasElement) {
  const viewport = source.width / source.height > WIDTH / HEIGHT
    ? { x: 0, y: Math.round((HEIGHT - WIDTH * source.height / source.width) / 2), w: WIDTH, h: Math.round(WIDTH * source.height / source.width) }
    : { x: Math.round((WIDTH - HEIGHT * source.width / source.height) / 2), y: 0, w: Math.round(HEIGHT * source.width / source.height), h: HEIGHT };
  const p = ease(progress);
  if (p > .8) {
    ctx.fillStyle = 'rgba(12,8,9,' + clamp((p - .8) / .2) + ')';
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }
  const r = mix(ILLUSTRATION, viewport, p);
  if (p < .88) frame(ctx, r, true);
  photo(ctx, source, r, props.focus);
}
function paint(now: number) {
  renderFrame = requestAnimationFrame(paint);
  if (now - time < 31) return;
  time = now;
  hits = [];
  if (!art) {
    ctx.fillStyle = '#200f11'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    text(ctx, t(loadFailed ? 'Try again' : 'Preparing your story…'), 320, 177, 13, GOLD, 'center');
    if (loadFailed) add('retry', t('Try again'), { x: 220, y: 151, w: 200, h: 52 }, () => void prepare());
    return;
  }
  const motion = reduced.matches ? 0 : time;
  desk(ctx, art, motion);
  if (props.portrait) {
    const panel = { x: 139, y: 96, w: 362, h: 168 };
    frame(ctx, panel, true);
    text(ctx, t('Turn your device'), 320, 139, 25, GOLD, 'center', titleFont, 325);
    text(ctx, t('Kyrandia plays best in landscape and full screen.'), 320, 179, 13, INK, 'center', textFont, 330);
    if (props.fullscreenAvailable) {
      const label = t(props.isFullscreen ? 'Exit full screen' : 'Full screen');
      const area = { x: 220, y: 204, w: 200, h: 36 };
      frame(ctx, area, hover === 'rotate-fullscreen' || focus === 'rotate-fullscreen');
      text(ctx, label, 320, 222, 13, GOLD, 'center');
      add('rotate-fullscreen', label, area, () => emit('fullscreen'));
    }
    return;
  }
  const openProgress = props.options ? 1 : coverAt === null ? 0 : reduced.matches ? 1 : clamp((time - coverAt) / 550);
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
    const progress = reduced.matches ? 1 : clamp((time - mountTime) / 420);
    if (progress < 1 && props.snapshot) sceneZoom(1 - progress, props.snapshot);
    else { ready = true; emit('ready'); }
  }
  if (!props.options && pendingEnter && !props.openingReady && openProgress === 1) {
    text(ctx, t('Preparing your story…'), 434, 278, 10, GOLD, 'center');
  }
  if (!props.options && pendingEnter && openProgress === 1 && props.openingReady && finishAt === null) finishAt = time;
  if (props.options && props.returning && !wasReturning) finishAt = time;
  wasReturning = props.returning;
  if (finishAt !== null && !closing) {
    const progress = reduced.matches ? 1 : clamp((time - finishAt) / 420);
    const source = props.snapshot ?? props.gameCanvas;
    if (source) sceneZoom(progress, source);
    if (progress === 1) { closing = true; props.options ? emit('returned') : emit('open'); }
  }
  if (openProgress < 1 || props.options && !ready || turnAt !== null || pendingEnter || props.returning || props.busy) hits = [];
  if (!canvasLabel.value) canvasLabel.value = names()[page];
}
async function prepare() {
  loadFailed = false;
  try {
    const [loaded] = await Promise.all([loadBookArt(), document.fonts.load('11px Kyrandia'), document.fonts.load('24px Germanica')]);
    if (!alive) return;
    bookmarks = bookmarkPalette(loaded.bookmark);
    art = loaded;
    mountTime = performance.now();
    if (page === 'dev') void loadRooms();
  } catch { loadFailed = true; }
}
onMounted(() => {
  ctx = canvas.value!.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  left = surface(); outgoing = surface();
  canvasLabel.value = t('Fables and Fiends, Book One');
  canvas.value!.focus({ preventScroll: true });
  renderFrame = requestAnimationFrame(paint);
  void prepare();
});
onBeforeUnmount(() => {
  alive = false;
  cancelAnimationFrame(renderFrame);
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
  image-rendering: pixelated;
  cursor: url('/assets/cursors/book-pointer.svg') 2 2, auto;
  touch-action: none;
  outline: none;
}
</style>
