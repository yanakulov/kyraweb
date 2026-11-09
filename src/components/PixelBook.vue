<template>
  <canvas ref="canvas" class="pixel-book" width="640" height="360" tabindex="0" role="dialog" aria-modal="true"
    :aria-label="canvasLabel" @pointermove="move" @pointerleave="leave" @pointerdown="press"
    @pointerup="release" @pointercancel="release" @keydown="key" @paste="paste" @wheel.prevent="scroll" />
  <canvas v-show="showCredit" ref="credit" class="book-studio-credit" :width="STUDIO_MARK.w" :height="STUDIO_MARK.h"
    :style="creditStyle" role="img" aria-label="AkulaFlow" />
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
import { roomFrameFocus } from './bookTransition';
import { WIDTH, HEIGHT, SPREAD, COVER, ILLUSTRATION, CHAPTER_FOCUS, RUBRIC, FOIL, INK, MUTED,
  loadBookArt, loadChapterFrame, printPicture, cropFrame, bookmarkPalette, coverBoard, surface, photoBounds, buttonPlate,
  clamp, ease, mix, pixels, frame, text, sparkle, desk, bookShadow, spreadLight, turnLeaf, type Art, type Rect } from './pixelBookPaint';

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
  start: []; save: [number, string]; load: [number]; delete: [number]; control: [ControlMode]; speed: [WalkSpeed]; fullscreen: [];
  leave: ['intro' | 'menu']; devRun: [DevScene]; leaveDev: [];
}>();

const canvas = ref<HTMLCanvasElement>();
const credit = ref<HTMLCanvasElement>();
const showCredit = ref(false);
const creditStyle = ref({ top: '0px', width: '0px' });
const STUDIO_MARK = { x: 13, y: 74, w: 300, h: 54 };
const CREDIT_TOP = 342;
const canvasLabel = ref('');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const pages: Page[] = ['main', 'story', 'save', 'load', 'settings', 'sound', 'dev'];
const initial = props.options ? props.initialView : props.setup ? 'setup' : 'story';
let page: Page = initial, selectedMode = props.controlMode, chapter = 0, devPage = 0, query = '', saveName = '';
let selectedSlot: number | undefined, chapterAction: 'replace' | 'delete' | null = null;
let confirmLeave: 'intro' | 'menu' | null = null, editing: 'query' | 'save' | null = null;
let art: Art | undefined, coverFace: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D, left: CanvasRenderingContext2D, outgoing: CanvasRenderingContext2D;
let bookmarks: HTMLCanvasElement[] = [];
const bookmarkOffsets = pages.map(() => 0);
let mountTime = 0, coverAt: number | null = null, finishAt: number | null = null, turnAt: number | null = null, storyAt = 0;
let pendingEnter = false, openingStarted = false, closing = false, wasReturning = false, direction = true, ready = false, renderFrame = 0, alive = true;
let time = 0, hover = '', focus = '', lastHover = -Infinity, dragging: Hit | undefined, revealAll = false, loadFailed = false;
let noticeMessage = '', noticeAt = 0;
let touch = false, keyboardLanguage = locale.value;
let choosingDevice = false, devicePage = 0, canvasSize: ResizeObserver;
let view: Rect = { x: 0, y: 0, w: WIDTH, h: HEIGHT };
let book = SPREAD;
let transitionFrame: HTMLCanvasElement | undefined;
let hits: Hit[] = [];
type Hit = { id: string; label: string; area: Rect; action: (x: number) => void; level?: number };
const thumbs = new Map<string, HTMLImageElement>();
const chapters = new Map<number, HTMLCanvasElement | null>();
const prints = new WeakMap<HTMLCanvasElement | HTMLImageElement, { canvas: HTMLCanvasElement; x?: number; y?: number }>();
let visiblePrint: HTMLCanvasElement | undefined, previousPrint: HTMLCanvasElement | undefined, printAt = 0;
let rooms: { id: number; name: string; title: string }[] | undefined;
let roomFetchFailed = false, roomLoading = false;
const tr = (en: string, ru: string) => locale.value === 'ru' ? ru : en;
const speedValues: WalkSpeed[] = ['slowest', 'slow', 'fast', 'fastest'];
const speedLabels = ['Slowest', 'Slow', 'Fast', 'Fastest'];
const textFont = 'Georgia, serif';
const menuFont = 'Kyrandia, Georgia, serif', titleFont = '"Cormorant Garamond", Georgia, serif';
const LEFT = 113, RIGHT = 339, PAGE_W = 192, PAGE_TOP = 108, FOOT = 273;
const LEFT_CENTER = LEFT + PAGE_W / 2, RIGHT_CENTER = RIGHT + PAGE_W / 2;
const mainTitle = () => props.gameOver ? t("It didn't happen that way!") : tr('The Journey', 'Путешествие');
const names = () => ({ main: mainTitle(), story: tr('The Chronicles', 'Летопись'), save: t('Save your story'),
  load: t('Saved chapters'), settings: t('Settings'), sound: t('Sound settings'), dev: 'Dev Menu', help: t('How to play'), setup: t('Choose your controls') });
const pageY = (y: number) => Math.round(book.y + (y - SPREAD.y) * book.h / SPREAD.h);
const illustration = () => ({ ...ILLUSTRATION, y: pageY(ILLUSTRATION.y), h: pageY(ILLUSTRATION.y + ILLUSTRATION.h) - pageY(ILLUSTRATION.y) });

function add(id: string, label: string, area: Rect, action: Hit['action'], level?: number) {
  hits.push({ id, label, area, action, level });
}
function row(id: string, label: string, baseline: number, action: () => void, opts: {
  x?: number; w?: number; disabled?: boolean; marked?: boolean; primary?: boolean; compact?: boolean; wrap?: boolean;
  kind?: 'field' | 'select' | 'choice' | 'toggle' | 'entry'; hint?: string; danger?: boolean;
} = {}) {
  const y = pageY(baseline);
  const x = opts.x ?? LEFT, w = opts.w ?? PAGE_W;
  const hot = !opts.disabled && (hover === id || focus === id);
  const { kind, hint } = opts;
  const area = { x, y: y - 11, w, h: hint ? 29 : 22 };
  if (!kind) {
    buttonPlate(left, area, hot, opts.primary ? 'green' : opts.danger ? 'red' : 'leather', opts.disabled);
    if (!opts.compact) sparkle(left, x + 8, y, hot || opts.primary ? 2 : 1, opts.disabled ? '#766452' : '#bc8d52');
  } else {
    const field = kind === 'field' || kind === 'select';
    left.fillStyle = field ? hot ? '#2d2016' : '#211510' : hot || opts.marked ? '#89644034' : '#0000';
    left.fillRect(x, area.y, w, area.h);
    left.fillStyle = hot ? '#d8ac6c' : '#96704d83';
    left.fillRect(x, area.y + area.h - 1, w, 1);
    if (field) left.fillRect(x, area.y, w, 1);
    if (kind === 'field') {
      text(left, id === 'query' ? '⌕' : '✎', x + 8, y, 12, RUBRIC, 'center', 'Segoe UI Symbol, serif', 14);
    } else if (kind === 'select') {
      left.fillStyle = '#7b583e';
      left.fillRect(x + w - 21, y - 7, 1, 14);
      text(left, '›', x + w - 11, y, 16, RUBRIC, 'center', textFont, 14);
    } else if (kind === 'choice' || kind === 'toggle') {
      left.strokeStyle = hot ? FOIL : '#b38758';
      if (kind === 'choice') {
        left.beginPath();
        left.arc(x + 9.5, y, 4.5, 0, Math.PI * 2);
        left.stroke();
      } else left.strokeRect(x + 4.5, y - 4.5, 9, 9);
      if (opts.marked) sparkle(left, x + 9, y, 3, '#c99856');
    } else if (!opts.disabled) {
      text(left, '›', x + 8, y, 13, RUBRIC, 'center', textFont, 14);
    }
  }
  const color = opts.disabled ? '#947d68' : hot || opts.primary ? '#ffe7af' : INK;
  const font = opts.wrap || hint || kind === 'field' || kind === 'entry' || kind === 'select' || label.length === 1 ? textFont : menuFont;
  const inset = kind === 'select' ? 8 : 17;
  const labelWidth = w - inset - (kind === 'select' ? 24 : kind === 'choice' && hint ? 18 : 5);
  left.font = `9.5px ${font}`;
  if (opts.wrap && left.measureText(label).width > labelWidth) {
    left.save();
    left.beginPath();
    left.rect(x + inset, y - 11, labelWidth, 22);
    left.clip();
    lines(label, x + inset, baseline - 6, labelWidth, 9.5, Infinity, false, baseline + 11, color);
    left.restore();
  } else {
    text(left, label, opts.compact ? x + w / 2 : x + inset, hint ? y - 2 : y, opts.compact ? 10 : hint ? 12 : 11, color,
      opts.compact ? 'center' : 'left', font, opts.compact ? w - 5 : labelWidth);
  }
  if (hint) text(left, hint, x + inset, y + 10, 9, MUTED, 'left', textFont, labelWidth);
  if (!opts.disabled) add(id, label, area, action);
}
function heading(title: string, kicker: string, x = LEFT_CENTER) {
  text(left, kicker, x, pageY(69), 8, MUTED, 'center', textFont, PAGE_W);
  text(left, title, x, pageY(87), 24, RUBRIC, 'center', titleFont, PAGE_W, 700);
  left.fillStyle = '#ab794d8a';
  left.fillRect(x - 65, pageY(100), 130, 1);
  sparkle(left, x, pageY(100), 2, '#b5844f');
}
function lines(value: string, x: number, y: number, width: number, size = 13, limit = Infinity, drop = false, bottom = 285, color = INK) {
  y = pageY(y);
  bottom = pageY(bottom);
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
      left.font = `700 22px ${titleFont}`;
      const inset = Math.ceil(left.measureText(visible[0]).width) + 1;
      text(left, visible[0], x, y - 1, 22, '#e89770', 'left', titleFont, width, 700);
      text(left, visible.slice(1), x + inset, y, size, color, 'left', textFont, width - inset);
    } else text(left, visible, x, y + index * (size + 3), size, color, 'left', textFont, width);
    written += content.length + 1;
  }
}
function flip(next: Page, change?: () => void, forward = pages.indexOf(next) >= pages.indexOf(page)) {
  if (next === page && !change) return;
  if (turnAt !== null) return;
  outgoing.clearRect(view.x, view.y, view.w, view.h);
  outgoing.drawImage(left.canvas, view.x, view.y, view.w, view.h);
  direction = forward;
  if (page === 'sound' && next !== 'sound') props.music.stopPreview();
  page = next;
  visiblePrint = previousPrint = undefined;
  editing = null; focus = ''; hover = ''; selectedSlot = undefined; chapterAction = null; confirmLeave = null;
  choosingDevice = false;
  change?.();
  storyAt = time; revealAll = false;
  turnAt = reduced.matches ? null : time;
  props.music.bookSound('page');
  if (page === 'dev') void loadRooms();
  if (page === 'story') readChapter();
}
function readChapter(index = chapter) {
  if (index >= prologue.en.length) return;
  if (chapters.has(index)) return;
  chapters.set(index, null);
  void loadChapterFrame(index).then(image => chapters.set(index, image), () => chapters.delete(index));
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
  readChapter(chapter + 1);
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
  lines(entry.text, LEFT + 5, PAGE_TOP + 9, PAGE_W - 7, 12, ink, true, 230);
  if (chapter > 0) row('previous', tr('‹ Back', '‹ Назад'), 243, () => flip('story', () => chapter--, false), { w: 65, compact: true });
  text(left, ['I', 'II', 'III', 'IV'][chapter], LEFT_CENTER, pageY(243), 9, MUTED, 'center');
  if (ink < entry.text.length || chapter < 3) {
    row('next', ink < entry.text.length ? tr('Reveal', 'Весь текст') : tr('Next ›', 'Далее ›'), 243, () => {
      if (ink < entry.text.length) revealAll = true;
      else flip('story', () => { chapter++; readChapter(chapter + 1); });
    }, { x: LEFT + PAGE_W - 83, w: 83, compact: true });
  }
  row('enter', props.options ? tr('Return to the journey', 'Назад к путешествию') : tr('Enter the legend', 'Перейти к легенде'), FOOT, () => {
    if (props.options) flip('main');
    else { emit('prologue'); enter(); }
  }, { primary: true });
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
  options.forEach(([id, label, action, disabled], index) => {
    row(id, t(label), 125 + index * 26, action, { disabled, primary: index === 0 });
  });
}
function select<T extends string>(id: string, label: string, values: readonly T[], labels: string[], value: T, y: number, set: (value: T) => void, disabled = false) {
  const index = Math.max(0, values.indexOf(value));
  text(left, label, LEFT, pageY(y - 12), 9, MUTED);
  row(id, labels[index], y + 2, () => set(values[(index + 1) % values.length]), { kind: 'select', disabled });
}
function settings() {
  heading(t('Settings'), tr('THE SCRIBE’S DESK', 'СТОЛ ПИСЦА'));
  if (confirmLeave) {
    lines(t('Leave this adventure? Unsaved progress will be lost.'), LEFT, 125, PAGE_W, 13);
    row('leave-confirm', t('Continue'), 211, () => emit('leave', confirmLeave!), { danger: true });
    row('leave-cancel', t('Stay here'), 242, () => confirmLeave = null);
    return;
  }
  select('language', t('Language'), ['en', 'ru'], ['English', 'Русский'], locale.value, 126, setLocale);
  select('speed', t('Walk speed'), speedValues, speedLabels.map(t), props.walkSpeed, 165, value => emit('speed', value));
  select('controls', t('Controls'), ['modern', 'classic'], [t('Modern'), t('Classic')], props.controlMode, 204, value => emit('control', value));
  if (props.fullscreenAvailable) row('fullscreen', t(props.isFullscreen ? 'Exit full screen' : 'Full screen'), 236,
    () => emit('fullscreen'), { primary: !props.isFullscreen, compact: true });
  row('replay-intro', tr('Intro', 'Заставка'), 264, () => props.mainMenu ? emit('leave', 'intro') : confirmLeave = 'intro',
    { x: LEFT + 4, w: props.mainMenu ? PAGE_W - 8 : 88, compact: true });
  if (!props.mainMenu) row('menu', tr('Menu', 'В меню'), 264, () => confirmLeave = 'menu',
    { x: LEFT + 98, w: 90, compact: true, danger: true });
}
function slider(id: string, label: string, enabled: boolean, value: number, y: number, toggle: () => void, update: (value: number) => void) {
  row(id, label, y, toggle, { kind: 'toggle', marked: enabled });
  const area = { x: LEFT + 7, y: pageY(y + 15), w: 137, h: 15 };
  left.fillStyle = '#100b0d'; left.fillRect(area.x, area.y + 5, area.w, 5);
  left.fillStyle = enabled ? '#b77a45' : '#61504a'; left.fillRect(area.x, area.y + 6, Math.round(area.w * value), 3);
  const focused = focus === id + '-level' || hover === id + '-level';
  sparkle(left, area.x + Math.round(area.w * value), area.y + 7, focused ? 4 : 3, RUBRIC);
  text(left, Math.round(value * 100) + '%', LEFT + 150, area.y + 7, 9, MUTED);
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
      }, { kind: 'choice', marked: active === device, disabled: state.busy });
    });
    row('close-devices', tr('Back', 'Назад'), FOOT, () => choosingDevice = false, { w: 70 });
    if (devicePage) row('devices-prev', '‹', 273, () => devicePage--, { x: LEFT + 74, w: 35 });
    if ((devicePage + 1) * 5 < devices.length) row('devices-next', '›', 273, () => devicePage++, { x: LEFT + 114, w: 38 });
  } else {
    row('device', active?.label ?? 'AdLib', 123, () => { choosingDevice = true; devicePage = 0; }, { kind: 'select', disabled: state.busy });
    slider('music', t('Music'), state.enabled, state.volume, 153, () => props.music.setEnabled(!state.enabled), value => props.music.setVolume(value));
    slider('effects', tr('Effects', 'Эффекты'), state.sfxEnabled, state.sfxVolume, 192, () => props.music.setSfxEnabled(!state.sfxEnabled), value => props.music.setSfxVolume(value));
    slider('voice', tr('CD voices (EN)', 'Голоса CD (EN)'), state.voiceEnabled, state.voiceVolume, 231, () => props.music.setVoiceEnabled(!state.voiceEnabled), value => props.music.setVoiceVolume(value));
    row('test-audio', state.previewing ? t('Stop test') : tr('Test audio', 'Проверить звук'), FOOT, () => props.music.preview(true), { disabled: state.busy || !state.available });
  }
  heading(tr('Sound banks', 'Банки звука'), tr('THE SOUND OF KYRANDIA', 'ЗВУК КИРАНДИИ'), RIGHT_CENTER);
  const description = state.renderer === 'mt32'
    ? tr('Choose the matching Control and PCM ROMs for your Roland MT-32 or CM-32L.', 'Выберите пару ROM Control и PCM от одной модели Roland MT-32 или CM-32L.')
    : state.renderer === 'adlib'
      ? tr('Original DOS sound. You can also load Roland ROMs or your own SF2 bank.', 'Звук DOS. Здесь же можно загрузить ROM Roland или свой банк SF2.')
      : tr('Your SoundFont plays through the General MIDI mapping.', 'SoundFont воспроизводится через раскладку General MIDI.');
  lines(description, RIGHT + 3, 119, PAGE_W - 5, 12, Infinity, false, 164);
  row('roms', tr('Import MT-32 ROMs', 'Импорт ROM MT-32'), 178, () => void importAudio(true), { x: RIGHT, disabled: state.busy });
  row('soundfont', tr('Import SF2', 'Импорт SF2'), 202, () => void importAudio(false), { x: RIGHT, disabled: state.busy });
  if (props.setup) {
    row('back-setup', tr('‹ Back', '‹ Назад'), FOOT, () => flip('setup'), { x: RIGHT, w: 70, compact: true });
    row('finish-setup', t('Continue'), FOOT, () => { props.music.stopPreview(); emit('finishSetup', selectedMode); flip('story'); },
      { x: RIGHT + 74, w: 100, primary: true, compact: true, disabled: state.busy || state.renderer === 'mt32' && !state.available });
  } else if (state.renderer === 'mt32' && state.available && state.source !== 'local') {
    row('remove-roms', t('Remove ROMs'), FOOT, () => void props.music.forgetRoms(), { x: RIGHT, disabled: state.busy });
  }
  const message = state.soundFontProgress !== undefined ? t('Loading SoundFont…') + ' ' + state.soundFontProgress + '%' : t(state.message);
  if (message) lines(message, RIGHT, 226, PAGE_W, 11, Infinity, false, 254, RUBRIC);
}
function setup() {
  heading(t('Controls'), tr('FIRST START  ·  I / II', 'ПЕРВЫЙ ЗАПУСК  ·  I / II'));
  row('modern', t('Modern'), 128, () => selectedMode = 'modern', { kind: 'choice', marked: selectedMode === 'modern' });
  row('classic', t('Classic'), 154, () => selectedMode = 'classic', { kind: 'choice', marked: selectedMode === 'classic' });
  lines(tr('You can switch modes later in the book settings.', 'Режим можно сменить в настройках книги.'), LEFT, 192, PAGE_W, 12);
  row('setup-next', tr('Sound settings ›', 'Далее: звук ›'), FOOT, () => flip('sound'), { primary: true });
}
function saveLoad() {
  const saving = page === 'save';
  heading(t(saving ? 'Save your story' : 'Saved chapters'), tr('THE BOOKMARKS YOU LEFT', 'ВАШИ ЗАКЛАДКИ'));
  const slot = props.slots.find(slot => slot.index === selectedSlot);
  const occupied = !!(slot?.savedAt || slot?.error);
  const save = (slot: Slot) => {
    noticeAt = time;
    emit('save', slot.index, saveName.trim() || slot.name || t('Chapter ' + (slot.index + 1)));
  };
  if (chapterAction && slot) {
    const deleting = chapterAction === 'delete';
    lines(t(deleting ? 'Delete this saved chapter?' : 'Replace this saved chapter?'), LEFT, 131, PAGE_W, 14);
    lines(slot.name || t('Chapter ' + (slot.index + 1)), LEFT, 157, PAGE_W, 12, Infinity, false, 192, RUBRIC);
    row('confirm-chapter', t(deleting ? 'Delete' : 'Replace'), 212, () => {
      if (deleting) {
        noticeAt = time;
        emit('delete', slot.index);
      } else save(slot);
      chapterAction = null;
    }, { danger: true });
    row('cancel', t('Keep it'), 242, () => chapterAction = null);
    return;
  }
  if (saving) row('save-name', (saveName || (editing === 'save' ? '' : t('Chapter name'))) + (editing === 'save' ? '▏' : ''), 122,
    () => editing = 'save', { kind: 'field' });
  const slots = props.slots.filter(slot => slot.index !== AUTOSAVE_SLOT || !saving && (slot.savedAt || slot.error));
  slots.forEach((slot, index) => {
    const name = slot.name || t(slot.index === AUTOSAVE_SLOT ? 'Autosave' : 'Chapter ' + (slot.index + 1));
    const hint = slot.error ? t(slot.error) : slot.savedAt ? t(slot.location || '') : tr('Empty slot', 'Пустой слот');
    const baseline = (saving ? 151 : 125) + index * 32;
    row('slot-' + slot.index, slot.index === AUTOSAVE_SLOT ? t(name) : name, baseline, () => {
      if (saving) selectedSlot = slot.index;
      else emit('load', slot.index);
    }, { kind: saving ? 'choice' : 'entry', disabled: !saving && (!slot.savedAt || !!slot.error),
      marked: saving && selectedSlot === slot.index, hint });
    if (saving) {
      const y = pageY(baseline);
      left.strokeStyle = slot.savedAt || slot.error ? '#c69c62' : '#886a51';
      left.strokeRect(LEFT + PAGE_W - 12.5, y - 5.5, 6, 9);
      if (slot.savedAt || slot.error) {
        left.fillStyle = '#b48754';
        left.fillRect(LEFT + PAGE_W - 11, y - 4, 3, 6);
      }
    }
  });
  if (!slots.length) lines(t('This page has no saved chapter.'), LEFT, 135, PAGE_W);
  if (saving) {
    row('save-selected', t('Save'), 264, () => {
      if (occupied) chapterAction = 'replace';
      else if (slot) save(slot);
    }, { x: LEFT + 4, w: 88, compact: true, primary: true, disabled: !slot || !props.canSave });
    row('delete-selected', t('Delete'), 264, () => chapterAction = 'delete',
      { x: LEFT + 98, w: 90, compact: true, danger: true, disabled: !occupied });
  }
}
function dev() {
  heading('Dev Menu', tr('THE ROYAL ARCHIVE', 'КОРОЛЕВСКИЙ АРХИВ'));
  row('query', (query || (editing === 'query' ? '' : t('Find a scene'))) + (editing === 'query' ? '▏' : ''), 119,
    () => editing = 'query', { kind: 'field' });
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
    row('scene-' + (devPage * 5 + index), t(scene.label), y, () => emit('devRun', scene), { w: PAGE_W - 29, kind: 'entry', wrap: true });
    text(left, detail.startsWith('#') ? detail.split(' ')[0] : '', LEFT + PAGE_W, pageY(y), 8, MUTED, 'right', 'monospace', 28);
  });
  if (!scenes.length) text(left, t('No matching scenes.'), LEFT, pageY(150), 11, INK);
  if (roomFetchFailed) row('retry-scenes', t('Retry scene list'), 259, () => void loadRooms());
  if (roomLoading) text(left, t('Loading scene list…'), LEFT, pageY(264), 9, MUTED);
  if (devPage > 0) devFade(134, 141);
  if (devPage + 1 < count) devFade(251, 243);
  row('dev-prev', '‹', 265, () => devPage--, { x: LEFT + 5, w: 44, compact: true, disabled: devPage === 0 });
  text(left, (devPage + 1) + ' / ' + count, LEFT_CENTER, pageY(265), 10, MUTED, 'center');
  row('dev-next', '›', 265, () => devPage++, { x: LEFT + PAGE_W - 49, w: 44, compact: true, disabled: devPage + 1 >= count });
}
function devFade(edge: number, inside: number) {
  const outer = pageY(edge), inner = pageY(inside);
  const fade = left.createLinearGradient(0, outer, 0, inner);
  fade.addColorStop(0, '#251710a8');
  fade.addColorStop(1, '#25171000');
  left.fillStyle = fade;
  left.fillRect(LEFT, Math.min(inner, outer), PAGE_W, Math.abs(inner - outer));
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
    const start = Math.round(RIGHT_CENTER - letters.length * 7);
    Array.from(letters).forEach((letter, column) => {
      const area = { x: start + column * 14, y: pageY(125 + index * 24), w: 13, h: 21 };
      buttonPlate(left, area, hover === 'letter-' + letter || focus === 'letter-' + letter, 'leather');
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
    const area = { x: RIGHT + index * 38, y: pageY(227), w: 37, h: 24 };
    buttonPlate(left, area, hover === 'keyboard-' + id || focus === 'keyboard-' + id, id === 'done' ? 'green' : 'leather');
    text(left, label, area.x + 18, area.y + 12, 10, FOIL, 'center', textFont, 35);
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
    const { x, w } = ILLUSTRATION, h = Math.round(w * image.height / image.width);
    const r = { x, y: pageY(168) - Math.round(h / 2), w, h };
    let print = prints.get(image)?.canvas;
    if (!print) {
      print = printPicture(image, r.w, r.h);
      prints.set(image, { canvas: print });
    }
    pixels(left, print, r);
    lines(modern
      ? tr('Full scene. Inventory: right-click, I, or a long press.', 'Вся сцена на экране. Инвентарь: ПКМ, I или долгое касание.')
      : tr('The original inventory and menu sit below the scene.', 'Инвентарь и меню под сценой, как в оригинале.'), RIGHT + 3, 228, PAGE_W - 5, 12, Infinity, false, 268);
    return;
  }
  const activeSlot = hover.startsWith('slot-') ? hover : focus;
  const slot = props.slots.find(slot => 'slot-' + slot.index === activeSlot)
    ?? props.slots.find(slot => slot.index === selectedSlot);
  if (slot?.thumbnail && !thumbs.has(slot.thumbnail)) { const image = new Image(); image.src = slot.thumbnail; thumbs.set(slot.thumbnail, image); }
  const thumb = slot?.thumbnail && thumbs.get(slot.thumbnail);
  const saved = thumb && thumb.complete && thumb.naturalWidth ? thumb : undefined;
  const entering = !props.options && pendingEnter ? transitionFrame : undefined;
  const image = entering ?? (page === 'story' ? chapters.get(chapter) : saved ?? props.snapshot ?? chapters.get(0));
  if (image) {
    const r = illustration();
    const savedPosition = saved && slot?.state?.rooms[slot.state.currentRoom]?.pos;
    const focus = savedPosition ? roomFrameFocus(savedPosition)
      : image === props.snapshot || entering ? props.focus
      : page === 'story' ? CHAPTER_FOCUS[chapter] : undefined;
    let print = prints.get(image);
    if (!print || print.canvas.height !== r.h || print.x !== focus?.x || print.y !== focus?.y) {
      const source = image === saved && image.width === 320 && image.height === 200 ? cropFrame(image, ROOM_ART) : image;
      print = { canvas: printPicture(source, r.w, r.h, focus), x: focus?.x, y: focus?.y };
      prints.set(image, print);
    }
    if ((page === 'save' || page === 'load') && !reduced.matches) {
      if (visiblePrint !== print.canvas) {
        previousPrint = visiblePrint;
        visiblePrint = print.canvas;
        printAt = time;
      }
      const progress = ease((time - printAt) / 150);
      if (previousPrint && progress < 1) {
        left.globalAlpha = 1 - progress;
        pixels(left, previousPrint, r);
        left.globalAlpha = progress;
      } else previousPrint = undefined;
    }
    pixels(left, print.canvas, r);
    left.globalAlpha = 1;
  }
  const caption = page === 'story' ? t('Book One') : t((saved && slot?.location) || props.location || 'The Legend of Kyrandia');
  const detail = page !== 'story' && props.devScene ? t(props.devScene.label) : '';
  left.font = `700 14px ${titleFont}`;
  const w = Math.min(PAGE_W - 14, Math.max(82, Math.ceil(left.measureText(caption).width) + 22, detail ? 164 : 0));
  const center = Math.round(ILLUSTRATION.x + ILLUSTRATION.w / 2);
  const x = Math.round(center - w / 2);
  const y = pageY(250) - (detail ? 15 : 10), h = detail ? 31 : 21;
  left.fillStyle = '#2a1914ef';
  left.fillRect(x, y, w, h);
  left.strokeStyle = '#b5824f';
  left.strokeRect(x + .5, y + .5, w - 1, h - 1);
  text(left, caption, center, y + 10, 14, FOIL, 'center', titleFont, w - 12, 700);
  if (detail) text(left, detail, center, y + 22, 10, INK, 'center', textFont, w - 12);
}
function paintPages() {
  left.clearRect(view.x, view.y, view.w, view.h);
  pixels(left, art!.spread, book);
  spreadLight(left, reduced.matches ? 0 : time, book);
  const available = props.options ? pages : props.setup ? [] : ['story', 'sound'] as const;
  const labels: Record<string, string> = {
    main: tr('Path', 'Путь'), story: tr('Story', 'Пролог'), save: tr('Save', 'Перо'), load: tr('Load', 'Главы'),
    settings: tr('Game', 'Игра'), sound: tr('Sound', 'Звук'), dev: 'Dev',
  };
  const edge = book.x + book.w, paperEdge = edge - 28;
  available.forEach((id, index) => {
    const y = pageY(84 + index * 27);
    const hot = hover === 'tab-' + id || focus === 'tab-' + id, active = id === page;
    const sprite = pages.indexOf(id);
    const target = active ? 9 : hot ? 5 : 0;
    bookmarkOffsets[sprite] = reduced.matches ? target : bookmarkOffsets[sprite] + (target - bookmarkOffsets[sprite]) * .45;
    const overhang = 32 + Math.round(bookmarkOffsets[sprite]);
    // The root disappears under the paper lip; only the leather beyond it can extend.
    left.fillStyle = '#150c09a6';
    left.fillRect(paperEdge - 4, y + 2, edge + overhang - paperEdge + 5, 21);
    left.save();
    left.beginPath();
    left.rect(paperEdge, y - 1, edge + overhang - paperEdge, 24);
    left.clip();
    pixels(left, bookmarks[sprite], { x: paperEdge - 8, y, w: edge + overhang - paperEdge + 8, h: 23 });
    left.restore();
    left.fillStyle = '#58351a';
    left.fillRect(paperEdge - 3, y + 1, 4, 20);
    left.fillStyle = '#e1ae6f';
    left.fillRect(paperEdge - 3, y + 1, 1, 20);
    text(left, labels[id], (paperEdge + edge + overhang) / 2, y + 11, 10, hot || active ? '#fff1bd' : FOIL,
      'center', textFont, edge + overhang - paperEdge - 12);
    add('tab-' + id, names()[id], { x: paperEdge, y, w: edge + overhang - paperEdge, h: 23 }, () => flip(id));
  });
  ({ main, story, settings, sound, setup, save: saveLoad, load: saveLoad, dev, help })[page]();
  picture();
}

function coverImage(r: Rect) {
  pixels(ctx, coverFace, r);
}
function notice() {
  if (noticeMessage !== props.message) {
    noticeMessage = props.message;
    noticeAt = time;
  }
  if (!noticeMessage) return;
  const duration = time - noticeAt;
  const appears = reduced.matches ? 1 : 1 - (1 - clamp(duration / 190)) ** 3;
  const expires = noticeMessage.endsWith(' saved.') || noticeMessage === 'Chapter deleted.';
  const alpha = expires ? Math.min(appears, 1 - clamp((duration - 4000) / (reduced.matches ? 1 : 180))) : appears;
  if (alpha <= 0) return;
  const label = t(noticeMessage);
  ctx.font = '700 11px Georgia, serif';
  const w = Math.min(392, Math.max(144, Math.ceil(ctx.measureText(label).width) + 50));
  const x = Math.round((WIDTH - w) / 2), h = 21;
  const y = Math.round(Math.min(book.y + book.h + 3, view.y + view.h - h - 3) + (1 - appears) * 6);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#160b09aa';
  ctx.fillRect(x + 2, y + 3, w, h);
  const paper = ctx.createLinearGradient(0, y, 0, y + h);
  paper.addColorStop(0, '#d0a66a');
  paper.addColorStop(1, '#a37648');
  ctx.fillStyle = paper;
  ctx.fillRect(x, y + 2, w, h - 4);
  ctx.fillRect(x + 3, y, w - 6, h);
  ctx.strokeStyle = '#744a2f';
  ctx.strokeRect(x + 4.5, y + 3.5, w - 9, h - 7);
  ctx.fillStyle = '#642a22';
  ctx.beginPath();
  ctx.arc(x + 14, y + 10.5, 6, 0, Math.PI * 2);
  ctx.fill();
  sparkle(ctx, x + 14, y + 10, 2, '#ab6145');
  ctx.font = '700 11px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#351d12';
  ctx.fillText(label, x + (w + 19) / 2, y + 10.5, w - 35);
  ctx.restore();
}
function coverButton(id: string, label: string, area: Rect, action: () => void, primary = false) {
  const { x, y, w, h } = area;
  const hot = !props.busy && (hover === id || focus === id);
  buttonPlate(ctx, area, hot, primary ? 'green' : 'leather', props.busy);
  sparkle(ctx, x + 11, y + h / 2, hot ? 2 : 1, '#bd8c50');
  text(ctx, label, x + w / 2 + 4, y + h / 2, 11, props.busy ? MUTED : hot ? '#ffedbe' : FOIL, 'center', menuFont, w - 28);
  if (!props.busy) add(id, label, area, action);
}
function cover() {
  bookShadow(ctx, { x: COVER.x + 7, y: COVER.y + 4, w: COVER.w - 15, h: COVER.h - 13 });
  coverImage(COVER);
  if (!reduced.matches && time % 3800 < 300) sparkle(ctx, 331, 231, 2, '#a9e1a1');
  const resume = props.latestSave && !props.setup;
  coverButton('cover', t('Open the book'), { x: resume ? 150 : 230, y: 292, w: resume ? 163 : 180, h: 27 }, startCover, true);
  if (resume) {
    coverButton('continue', t('Continue journey'), { x: 327, y: 292, w: 163, h: 27 }, () => emit('continue'));
  }
  text(ctx, t('Original tale © 1992 Westwood Studios'), 320, 331, 10, '#d3af84', 'center', textFont, 335);
  if (props.message || props.busy) {
    text(ctx, t(props.message || 'Opening your saved chapter…'), 514, 272, 10, FOIL, 'center', textFont, 220);
  }
}
function openCover(progress: number) {
  if (progress >= 1) {
    bookShadow(ctx, book);
    ctx.drawImage(left.canvas, view.x, view.y, view.w, view.h);
    return;
  }
  const p = ease(progress);
  const angle = p * Math.PI;
  const hinge = Math.round(COVER.x + (WIDTH / 2 - COVER.x) * p);
  const half = Math.round(COVER.w + (book.w / 2 - COVER.w) * p);
  const y = Math.round(COVER.y + (book.y - COVER.y) * p);
  const h = Math.round(COVER.h + (book.h - COVER.h) * p);
  const w = Math.max(2, Math.round(half * Math.abs(Math.cos(angle))));
  const lift = Math.sin(angle) * 13;
  const front = p < .5;
  const leftEdge = hinge - (front ? 0 : w);
  bookShadow(ctx, { x: leftEdge, y, w: hinge + half - leftEdge, h });
  const spread = art!.spread;
  const board = front ? coverFace : spread;
  const sourceWidth = front ? board.width : board.width / 2;
  // The page block stays down. The free edge of the cover lifts more than the hinge.
  ctx.globalAlpha = clamp(p * 16);
  ctx.drawImage(spread, spread.width / 2, 0, spread.width / 2, spread.height, hinge, y, half, h);
  ctx.globalAlpha = 1;
  const strips = Math.min(40, w);
  for (let i = 0; i < strips; i++) {
    const a = i / strips, b = (i + 1) / strips;
    const start = Math.round(w * a), end = Math.round(w * b);
    const rise = Math.round(lift * b);
    ctx.drawImage(board, sourceWidth * (front ? a : 1 - b), 0, sourceWidth / strips, board.height,
      front ? hinge + start : hinge - end, y - rise, end - start, h + rise);
  }
  if (p > .84) {
    ctx.globalAlpha = clamp((p - .84) / .16);
    ctx.drawImage(left.canvas, view.x, view.y, view.w, view.h);
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
  const viewport = photoBounds(source, view, undefined, true);
  const p = ease(progress);
  if (p > .8) {
    ctx.fillStyle = 'rgba(0,0,0,' + clamp((p - .8) / .2) + ')';
    ctx.fillRect(view.x - 1, view.y - 1, view.w + 2, view.h + 2);
  }
  const print = illustration();
  const pageFrame = photoBounds(source, print, props.focus);
  const clip = mix(print, viewport, p);
  ctx.save();
  ctx.beginPath();
  ctx.rect(clip.x, clip.y, clip.w, clip.h);
  ctx.clip();
  ctx.globalAlpha = clamp(p / .18);
  pixels(ctx, source, mix(pageFrame, viewport, p));
  ctx.restore();
}
function paint(now: number) {
  renderFrame = requestAnimationFrame(paint);
  if (now - time < 31) return;
  time = now;
  hits = [];
  if (!art) {
    ctx.fillStyle = '#200f11'; ctx.fillRect(view.x - 1, view.y - 1, view.w + 2, view.h + 2);
    text(ctx, t(loadFailed ? 'Try again' : 'Preparing your story…'), 320, 177, 13, FOIL, 'center');
    if (loadFailed) add('retry', t('Try again'), { x: 220, y: 151, w: 200, h: 52 }, () => void prepare());
    return;
  }
  const motion = reduced.matches ? 0 : time;
  const openProgress = props.options ? 1 : coverAt === null ? 0 : reduced.matches ? 1 : clamp((time - coverAt) / 490);
  desk(ctx, art, motion, view, openProgress);
  showCredit.value = !props.options && coverAt === null && !props.portrait;
  if (props.portrait) {
    const panel = { x: 139, y: 96, w: 362, h: 168 };
    frame(ctx, panel, true);
    text(ctx, t('Turn your device'), 320, 139, 25, FOIL, 'center', textFont, 325);
    text(ctx, t('Kyrandia plays best in landscape and full screen.'), 320, 179, 13, FOIL, 'center', textFont, 330);
    if (props.fullscreenAvailable) {
      const label = t(props.isFullscreen ? 'Exit full screen' : 'Full screen');
      const area = { x: 220, y: 204, w: 200, h: 36 };
      coverButton('rotate-fullscreen', label, area, () => emit('fullscreen'), true);
    }
    return;
  }
  if (!props.options && coverAt === null) {
    cover();
    return;
  }
  paintPages();
  openCover(openProgress);
  if (turnAt !== null) {
    const p = clamp((time - turnAt) / 340);
    if (p < 1) turnLeaf(ctx, outgoing.canvas, left.canvas, ease(p), direction, book, view);
    else turnAt = null;
  }
  if (openProgress === 1) notice();
  if (props.options && !ready) {
    const progress = reduced.matches ? 1 : clamp((time - mountTime) / 365);
    transitionFrame ??= liveScene();
    if (progress < 1 && transitionFrame) sceneZoom(1 - progress, transitionFrame);
    else { ready = true; emit('ready'); }
  }
  if (!props.options && pendingEnter && !props.openingReady && openProgress === 1) {
    text(ctx, t('Preparing your story…'), RIGHT_CENTER, pageY(276), 10, RUBRIC, 'center');
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
    const [loaded] = await Promise.all([loadBookArt(), document.fonts.load('11px Kyrandia'),
      document.fonts.load(`700 24px ${titleFont}`, 'Kyrandia Кирандия')]);
    if (!alive) return;
    coverFace = coverBoard(loaded);
    const studio = credit.value?.getContext('2d');
    const { x, y, w, h } = STUDIO_MARK;
    studio?.drawImage(loaded.studio, x, y, w, h, 0, 0, w, h);
    bookmarks = bookmarkPalette(loaded.bookmark);
    art = loaded;
    mountTime = performance.now();
    if (page === 'dev') void loadRooms();
  } catch { loadFailed = true; }
}
onMounted(() => {
  function resize() {
    const target = canvas.value!;
    const scale = Math.min(target.clientWidth / WIDTH, target.clientHeight / HEIGHT);
    if (!scale) return;
    const w = target.clientWidth / scale, h = target.clientHeight / scale;
    view = { x: (WIDTH - w) / 2, y: (HEIGHT - h) / 2, w, h };
    const creditTop = (CREDIT_TOP - view.y) * scale;
    creditStyle.value = {
      top: `${Math.round(creditTop)}px`,
      width: `${Math.floor(Math.min(STUDIO_MARK.w, Math.max(0, target.clientHeight - creditTop - 5) * STUDIO_MARK.w / STUDIO_MARK.h))}px`,
    };
    const extra = Math.min(65, Math.max(0, h - HEIGHT) * .78);
    book = { ...SPREAD, y: SPREAD.y - extra / 2, h: SPREAD.h + extra };
    ctx = surface(target, view);
    left = surface(left?.canvas, view);
    outgoing = surface(outgoing?.canvas, view);
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
    else if (chapterAction) chapterAction = null;
    else if (confirmLeave) confirmLeave = null;
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
@font-face {
  font-family: "Cormorant Garamond";
  src: url("/assets/interface/pixel-book/cormorant-garamond-bold.woff2") format("woff2");
  font-weight: 700;
  font-style: normal;
  font-display: swap;
}

.pixel-book {
  position: fixed;
  z-index: 20;
  inset: 0;
  width: 100%;
  height: 100%;
  background: #160d0e;
  image-rendering: pixelated;
  cursor: url('/assets/cursors/book-pointer.svg') 2 2, auto;
  touch-action: none;
  outline: none;
}
.book-studio-credit {
  position: fixed;
  left: 50%;
  z-index: 21;
  transform: translateX(-50%);
  height: auto;
  max-width: calc(100% - 24px);
  image-rendering: auto;
  pointer-events: none;
}
</style>
