<template>
  <main class="app" :class="{ 'book-is-closed': !bookOpened, 'is-modern': gameViewHeight === ROOM_VIEW_HEIGHT, 'is-cinematic': cinematicPlane }" ref="appRef" @pointerdown.capture="music.unlock()" @keydown.capture="music.unlock()" @pointerover.capture="menuHover" @click.capture="menuClick">
    <FantasyBook v-if="!bookOpened" ref="openingBook" :game-canvas="canvasRef ?? undefined" :opening-frame-ready="openingFrameReady || !!openingSnapshot || !!gameError" :snapshot="openingSnapshot ?? undefined" :frame-focus="bookFocus" :prologue="openingPrologue && !openingSnapshot" :inert="bookBusy" @begin="beginOpening" @ready="openingReadingReady = true" @open="openBook">
      <BookPrologue v-if="openingPrologue && !openingSnapshot" :ready="openingReadingReady" :show-story="!prologueSeen" @page-turn="music.bookSound('page')" @continue="finishPrologue">
        <template #audio><MusicSettings v-if="musicState" :player="music" :state="musicState" /></template>
      </BookPrologue>
      <template #invitation><button v-if="latestSave" class="book-continue" type="button" :disabled="bookBusy" @click.stop="continueJourney">{{ t('Continue journey') }}</button><p v-if="bookBusy || bookMessage" class="book-status" role="status">{{ t(bookBusy ? 'Opening your saved chapter…' : bookMessage) }}</p></template>
    </FantasyBook>
    <FirstRunLetter v-if="firstRun && musicState" :player="music" :state="musicState" :mode="controlMode" @finish="finishSetup" />
    <FantasyBook v-if="bookSnapshot" mode="options" :game-canvas="canvasRef ?? undefined" :snapshot="bookSnapshot" :frame-focus="bookFocus" :returning="bookReturning" @ready="bookOptionsReady" @resume="finishBookResume">
      <BookPrologue v-if="readingHistory" :ready="bookReady" returning @page-turn="music.bookSound('page')" @continue="readingHistory = false" />
      <BookMenu v-else :gameplay="!introActive" :main-menu="kallakMenu" :game-over="gameOver" :can-save="canSave" :busy="bookBusy || !bookReady || bookReturning" :message="bookMessage" :slots="bookSlots" :initial-view="bookInitialView"
        v-model:walk-speed="walkSpeed" :control-mode="controlMode" @update:control-mode="setControlMode" :fullscreen-available="fullscreenAvailable" :is-fullscreen="isFullscreen" :music-player="music" :music-state="musicState"
        @start-journey="startJourney" @page-turn="music.bookSound('page')" @read-prologue="readingHistory = true; music.bookSound('page')" @resume="resumeBook" @save="saveChapter" @load="loadChapter" @fullscreen="toggleFullscreen" @main-menu="leaveBook('menu')" @replay-intro="leaveBook('intro')" />
    </FantasyBook>
    <div class="game-frame" :class="{ 'is-concealed': !bookOpened && !openingFrameReady && !openingSnapshot && !gameError }" :aria-hidden="!bookOpened" :inert="!bookOpened || !!bookSnapshot">
      <canvas ref="sceneBackdrop" class="scene-backdrop" :width="ROOM_ART.w" :height="ROOM_ART.h" aria-hidden="true"></canvas>
      <div class="stage" :class="{ 'cursor-controlled': customCursor }" :aria-busy="loading"
        @pointerenter="handleMove" @pointermove="handleMove" @pointerleave="leaveStage"
        @pointerdown="handlePointerDown" @pointerup="handlePointerUp" @pointercancel="cancelGesture" @contextmenu.prevent="handleContextMenu">
        <div class="scene-plane" :style="cinematicPlane">
        <SubtitleOverlay :lines="subtitleLines" :scale="subtitleScale" :scale-y="subtitleScaleY" :alpha="subtitleAlpha" :visible="subtitleVisible" />
        <canvas ref="canvasRef" width="320" height="200" :aria-label="t('Kyrandia game scene')" @click="handleClick"></canvas>
        <canvas ref="statusTextCanvas" class="status-text" aria-hidden="true" hidden></canvas>
        <canvas ref="inventoryCanvas" class="radial-surface" aria-hidden="true" hidden></canvas>
        <canvas ref="inventoryTooltip" class="inventory-tooltip" aria-hidden="true" hidden></canvas>
        <div v-if="customCursor && (pointerInStage || touchPointer) && (cursorExit || !heldItem)" class="game-cursor" :style="cursorStyle" aria-hidden="true">
          <img :src="`${baseUrl}assets/cursors/${cursorExit ?? 'pointer'}.svg`" alt="" />
        </div>
        <div v-if="noteVisible && locale === 'ru'" class="translated-letter" :style="{ transform: `scale(${subtitleScale}, ${subtitleScaleY})` }"><p>{{ t('Dear Brynn:') }}</p><p>{{ t('Malcolm has broken free. Soon he will come for me. Please help Brandon. Direct him toward the Amulet. Use the lavender rose to key the spells.') }}</p><p>{{ t("Darm and Zanthia should be able to help. Be careful, he'll try to get all of us.") }}</p><p>— {{ t('Kallak') }}</p></div>
        <button v-if="controlMode === 'classic' && !introActive && !gameError && !sequenceActive && !loading" class="hud-options" :style="optionsStyle" type="button" :aria-label="t('Options')" @click="activateOptions"><span class="sr-only">{{ t('Options') }}</span></button>
        </div>
        <button v-if="awaitingContinue" class="pixel-button continue-button" type="button" @click="game?.handleClick({ x: 160, y: 100 })">{{ t('Continue') }}</button>
        <div v-if="gameError" class="game-error" role="alert"><p>{{ t(gameError) }}</p><button class="pixel-button" type="button" @click="boot">{{ t('Try again') }}</button><button v-if="latestSave" class="pixel-button" type="button" @click="showBookOptions('load')">{{ t('Load game') }}</button></div>
        <p class="sr-only" role="status">{{ gameHint }}</p>
        <p v-if="navigationError" class="scene-notice" role="status">{{ t(navigationError) }}</p>
      </div>
    </div>
    <dialog v-if="mobilePortrait" ref="rotationDialog" class="rotation-dialog" aria-labelledby="rotation-title" aria-describedby="rotation-help" @cancel.prevent>
      <svg class="rotation-icon" aria-hidden="true" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="5" y="5" width="15" height="26" rx="2" />
        <rect x="17" y="32" width="26" height="13" rx="2" />
        <path d="M26 8c8 1 14 8 14 16m-5-4 5 5 5-5" />
      </svg>
      <h1 id="rotation-title">{{ t('Turn your device') }}</h1>
      <p id="rotation-help">{{ t('Kyrandia plays best in landscape and full screen.') }}</p>
      <button v-if="fullscreenAvailable" type="button" class="pixel-button" @click="toggleFullscreen">
        {{ t(isFullscreen ? 'Exit full screen' : 'Full screen') }}
      </button>
      <p v-else class="rotation-note">{{ t('Full screen is unavailable in this browser.') }}</p>
    </dialog>
  </main>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
const FantasyBook = defineAsyncComponent(() => import('./components/FantasyBook.vue'));
import BookMenu from './components/BookMenu.vue';
import BookPrologue from './components/BookPrologue.vue';
import FirstRunLetter from './components/FirstRunLetter.vue';
import MusicSettings from './components/MusicSettings.vue';
import { locale, t } from './i18n';
import { MusicPlayer, type MusicState } from './engine/audio/music';
const musicState = shallowRef<MusicState>();
const music = new MusicPlayer(state => { musicState.value = state; });
musicState.value = { ...music.state };
function menuControl(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  const control = target.closest('button, [role="option"], a[href], summary, label');
  return control?.closest('.fantasy-book, .setup-letter') && !control.matches(':disabled,[aria-disabled="true"]') ? control : null;
}
let lastMenuHover = -Infinity;
function menuHover(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return;
  const control = menuControl(event.target), now = performance.now();
  if (!control || control === menuControl(event.relatedTarget) || now - lastMenuHover < 90) return;
  lastMenuHover = now;
  music.bookSound('hover');
}
function menuClick(event: MouseEvent) {
  const control = menuControl(event.target);
  if (control && (!control.matches('label') || event.target instanceof HTMLInputElement)) music.bookSound('click');
}
import { AUTOSAVE_SLOT, readAutosave, readSaveSlots, writeAutosave, writeSaveSlot, type SaveRecord, type SaveSlot } from './engine/gameplay/saveStorage';
const bookOpened = ref(false);
function hasReadPrologue() { try { return localStorage.getItem('kyrandia.prologueSeen') === '1'; } catch { return false; } }
const prologueSeen = hasReadPrologue();
const openingPrologue = ref(true), openingReadingReady = ref(false), readingHistory = ref(false), kallakMenu = ref(false), noteVisible = ref(false);
function finishPrologue() { try { localStorage.setItem('kyrandia.prologueSeen', '1'); } catch { /* Reading remains available without storage. */ } music.bookSound('enter'); openingPrologue.value = false; }
const openingBook = ref<{ openBook: () => void } | null>(null);
const openingSnapshot = shallowRef<HTMLCanvasElement | null>(null), bookSnapshot = shallowRef<HTMLCanvasElement | null>(null);
const bookFocus = shallowRef<Vec2>();
const controlPreference = 'kyrandia.controlMode';
function savedControlMode(): ControlMode | null {
  try { const value = localStorage.getItem(controlPreference); return value === 'classic' || value === 'modern' ? value : null; }
  catch { return null; }
}
const savedMode = savedControlMode();
const firstRun = ref(savedMode === null);
const controlMode = ref<ControlMode>(savedMode ?? 'modern');
const gameViewHeight = ref(LOGICAL_HEIGHT);
function setControlMode(mode: ControlMode) {
  controlMode.value = mode;
  try { localStorage.setItem(controlPreference, mode); } catch { /* Use the selection for this visit. */ }
  game?.setControlMode(mode);
  syncControls();
  if (bookSnapshot.value) bookSnapshot.value = captureBookFrame();
}
async function finishSetup(mode: ControlMode) {
  setControlMode(mode);
  firstRun.value = false;
  await nextTick();
  if (!latestSave.value) openingBook.value?.openBook();
}
const bookReturning = ref(false), bookReady = ref(false), bookBusy = ref(false), canSave = ref(false), gameOver = ref(false);
const bookMessage = ref(''), bookInitialView = ref<'main' | 'load'>('main');
const saveSlots = shallowRef<SaveSlot[]>([]);
const latestSave = computed(() => saveSlots.value.filter(slot => slot.save).sort((a,b) => b.save!.savedAt.localeCompare(a.save!.savedAt))[0]);
const bookSlots = computed(() => saveSlots.value.map(slot => ({ index: slot.index, ...slot.save, error: slot.error })));
let afterBookResume: (() => void) | null = null;
let openingStarted = false, openingFinished = false;
const openingFrameReady = ref(false);
function beginOpening() {
  prepareOpening();
  music.bookSound('cover');
}
function prepareOpening() {
  if (openingStarted || openingSnapshot.value) return;
  openingStarted = true; void boot();
}
function openBook() {
  openingFinished = true; bookBusy.value = false;
  if (openingSnapshot.value && game) {
    bookOpened.value = true; openingSnapshot.value = null; game.setPaused(mobilePortrait.value); syncControls();
  } else if (openingFrameReady.value || gameError.value) {
    bookOpened.value = true; intro?.setPaused(mobilePortrait.value);
  } else prepareOpening();
}
function closePanels() { if (readingHistory.value) { readingHistory.value = false; return; } if (!kallakMenu.value) resumeBook(); }
function showSettings() { showBookOptions(); }
function activateOptions(event: MouseEvent) { if (event.detail === 0 || !touchPointer.value) showSettings(); }
import { mapPointerToCanvas, startGame } from "./engine/gameplay/game";
import { HUD_OPTIONS_RECT, LOGICAL_HEIGHT, LOGICAL_WIDTH, ROOM_ART, ROOM_VIEW_HEIGHT } from "./engine/core/constants";
import { buildIntroSteps, introArtBounds, playIntro, type IntroPlayback } from "./engine/intro";
import { gemCutScene } from "./engine/scenes/gemCut";
import SubtitleOverlay from "./components/SubtitleOverlay.vue";
import { exitCursor } from "./engine/gameplay/navigation";
import type { ControlMode, RoomPortal, InventoryItemId, Vec2 } from "./engine/core/types";
const portals = ref<RoomPortal[]>([]);
const cursor = ref<Vec2>({ x: 160, y: 100 });
const pointerInStage = ref(false);
const customCursor = computed(() => !introActive.value && !gameError.value && !overlayOpen.value);
const cursorExit = computed(() => sequenceActive.value || loading.value || controlMode.value === 'classic' && isOptionsPoint(cursor.value) ? undefined : exitCursor(portals.value, cursor.value));
const baseUrl = import.meta.env.BASE_URL;
const cursorShape = computed(() => ({
  pointer: {x:1,y:1,w:8,h:10}, north: {x:5,y:1,w:16,h:9},
  east: {x:7,y:5,w:16,h:11}, south: {x:5,y:7,w:16,h:9}, west: {x:1,y:5,w:16,h:11},
  blocked: {x:4,y:4,w:16,h:10}
})[cursorExit.value ?? 'pointer']);
const sceneBounds = computed(() => gameViewHeight.value === ROOM_VIEW_HEIGHT
  ? ROOM_ART : { x: 0, y: 0, w: LOGICAL_WIDTH, h: gameViewHeight.value });
function clampCursor(point: Vec2, width = 1, height = 1) {
  const { x, y, w, h } = sceneBounds.value;
  return { x: Math.max(x, Math.min(x + w - width, point.x)), y: Math.max(y, Math.min(y + h - height, point.y)) };
}
const cursorStyle = computed(() => {
  const shape = cursorShape.value;
  const pos = clampCursor({ x: cursor.value.x - shape.x, y: cursor.value.y - shape.y }, shape.w, shape.h);
  return { left: `${pos.x / 3.2}%`, top: `${pos.y * 100 / gameViewHeight.value}%`,
    width: `${shape.w / 3.2}%`, height: `${shape.h * 100 / gameViewHeight.value}%` };
});
const heldItem = ref<InventoryItemId | null>(null);
const touchPointer = ref(typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
let gesture: { id: number; x: number; y: number; travel: number; started: number } | null = null;
function syncControls() {
  gameViewHeight.value = canvasRef.value?.height ?? LOGICAL_HEIGHT;
  cursor.value = clampCursor(cursor.value);
  portals.value = game?.getPortals() ?? [];
  const snapshot = game?.getSnapshot();
  heldItem.value = snapshot?.itemInHand ?? null;
  game?.setPointer(pointerInStage.value || touchPointer.value ? cursor.value : null);
}
const { x: optionsX, y: optionsY, w: optionsWidth, h: optionsHeight } = HUD_OPTIONS_RECT;
const optionsStyle = { left: `${optionsX / LOGICAL_WIDTH * 100}%`, top: `${optionsY / LOGICAL_HEIGHT * 100}%`,
  width: `${optionsWidth / LOGICAL_WIDTH * 100}%`, height: `${optionsHeight / LOGICAL_HEIGHT * 100}%` };
function isOptionsPoint(point: Vec2) {
  return point.x >= optionsX && point.x < optionsX + optionsWidth && point.y >= optionsY && point.y < optionsY + optionsHeight;
}
function interact(point: Vec2) {
  if (!game || loading.value || gameError.value || bookSnapshot.value) return;
  // Touch aims a persistent cursor; activating the original HUD must use it too.
  if (controlMode.value === 'classic' && !sequenceActive.value && isOptionsPoint(point)) { showSettings(); return; }
  game.setPointer(point);
  if (!game.handleClick(point)) game.setTarget(point);
  syncControls();
}
const appRef = ref<HTMLElement | null>(null);
const gameError = ref("");
const loading = ref(false);
const fullscreenAvailable = ref(false);
const isFullscreen = ref(false);
const portraitMedia = window.matchMedia('(orientation: portrait) and (pointer: coarse)');
const mobilePortrait = ref(portraitMedia.matches);
const rotationDialog = ref<HTMLDialogElement>();
const canvasRef = ref<HTMLCanvasElement | null>(null);
const inventoryCanvas = ref<HTMLCanvasElement | null>(null);
const inventoryTooltip = ref<HTMLCanvasElement | null>(null);
const statusTextCanvas = ref<HTMLCanvasElement | null>(null);
const sceneBackdrop = ref<HTMLCanvasElement | null>(null);
let game: Awaited<ReturnType<typeof startGame>> | null = null;
let gameLoadController: AbortController | null = null;
let restoreController: AbortController | null = null;
const showMask = ref(false);
const showLayerInfo = ref(false);
const maskOpacity = ref(0.35);
const walkSpeed = ref<"slowest" | "slow" | "fast" | "fastest">("fast");
const animStepInterval = ref(1);
const introActive = ref(true), openingScene = ref(false);
let intro: IntroPlayback | null = null;
const overlayOpen = computed(() => !!bookSnapshot.value || (!bookOpened.value && openingReadingReady.value));
let panelTrigger: HTMLElement | null = null;
watch(overlayOpen, async () => {
  if (overlayOpen.value) {
    if (!panelTrigger) panelTrigger = document.activeElement as HTMLElement;
    await nextTick();
    if (!bookSnapshot.value) appRef.value?.querySelector<HTMLElement>('[role="dialog"]')?.focus();
  } else {
    await nextTick(); panelTrigger?.focus(); panelTrigger = null;
  }
});
function handlePanelKey(event: KeyboardEvent) {
  if (firstRun.value || mobilePortrait.value || event.defaultPrevented) return;
  if (!overlayOpen.value) {
    if (!bookOpened.value || event.repeat) return;
    if (event.code === 'KeyI' && toggleInventory()) event.preventDefault();
    if (event.key === 'Escape') {
      if (introActive.value && intro) { event.preventDefault(); intro.skip(); }
      else if (!loading.value && (game?.setInventoryOpen(false) || game?.skipOpening())) { event.preventDefault(); syncControls(); }
    }
    return;
  }
  if (event.key === 'Escape') { event.preventDefault(); if (!bookBusy.value) closePanels(); }
  if (event.key !== 'Tab') return;
  const panel = appRef.value?.querySelector<HTMLElement>('[role="dialog"]');
  const controls = [...panel?.querySelectorAll<HTMLElement>('button:not(:disabled), select, input, summary, a[href]') ?? []].filter(el => el.getClientRects().length);
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
const introSteps = buildIntroSteps();
let introRunId = 0;
let subtitleResizeObserver: ResizeObserver | null = null;
const currentIntroStep = ref(introSteps[0]?.id ?? "");
const cinematicPlane = computed(() => {
  const art = introActive.value ? introArtBounds(currentIntroStep.value) : openingScene.value ? ROOM_ART : null;
  return art ? { left: `${-art.x / art.w * 100}%`, top: `${-art.y / art.h * 100}%`,
    width: `${LOGICAL_WIDTH / art.w * 100}%`, height: `${gameViewHeight.value / art.h * 100}%` } : undefined;
});
const subtitleLines = ref([] as import('./engine/intro/types').IntroSubtitle[]);
const subtitleAlpha = ref(1);
const subtitleVisible = computed(() => subtitleLines.value.length > 0);
const sequenceActive = ref(false);
const awaitingContinue = ref(false);
const locationName = ref("");
const navigationError = ref("");
const subtitleScale = ref(1);
const subtitleScaleY = ref(1);


const config = {
  onOptions: showSettings,
  onDeath: () => { gameOver.value = true; music.stop(); showBookOptions(); },
  onCheckpoint: scheduleAutosave,
  onContinueChange: (waiting: boolean) => { awaitingContinue.value = waiting; },
  onNoteChange: (visible: boolean) => { noteVisible.value = visible; },
  scene: gemCutScene,
  world: import.meta.env.BASE_URL + "assets/world/world.json",
  onLocationChange: (name: string, _id?: number, bank?: string) => { if (bank) music.prepareVoice(bank); locationName.value = name; queueMicrotask(syncControls); scheduleAutosave(); },
  onScriptAction: (action: import('./engine/gameplay/roomScript').RoomAction) => {
    if (action.op === 'music') music.wander(action.command, action.restart);
    else if (action.op === 'sfx') music.effect(action.track);
    else if (action.op === 'say' && action.voiceBank) music.speak(action.voiceBank, action.voiceId);
    else if (action.op === 'clearText' && action.stopVoice) music.stopSpeech();
  },
  onLoadingChange: (value: boolean) => { if (value) music.stopSpeech(); loading.value = value; queueMicrotask(syncControls); },
  onNavigationError: (message: string) => { navigationError.value = message; },
  onSubtitleChange: (lines: import('./engine/intro/types').IntroSubtitle[]) => { subtitleLines.value = lines; },
  onSequenceChange: (active: boolean) => { if (!active) music.stopSpeech(); sequenceActive.value = active; queueMicrotask(syncControls); }
};

function refreshSaveSlots() {
  try { saveSlots.value = [...readSaveSlots(), readAutosave()]; return true; }
  catch (error) { bookMessage.value = error instanceof Error ? error.message : 'Saved chapters are unavailable.'; return false; }
}
function captureFrame() {
  const copy = document.createElement('canvas'); copy.width = 320; copy.height = 200;
  if (canvasRef.value) copy.getContext('2d')!.drawImage(canvasRef.value, 0, 0);
  return copy;
}
function captureBookFrame() {
  const source = canvasRef.value;
  const actor = game?.getSnapshot().pos;
  bookFocus.value = undefined;
  if (!source || (!game && !kallakMenu.value)) return captureFrame();
  const { x, y, w, h } = ROOM_ART;
  const copy = document.createElement('canvas');
  copy.width = w; copy.height = h;
  copy.getContext('2d')!.drawImage(source, x, y, w, h, 0, 0, w, h);
  if (actor) bookFocus.value = { x: (actor.x - x) / w, y: 1 - (actor.y - y - 20) / h };
  else if (kallakMenu.value) bookFocus.value = { x: .72, y: .61 };
  return copy;
}
let autosaveFrame = 0;
function scheduleAutosave() {
  if (autosaveFrame || !game || gameOver.value || !bookOpened.value) return;
  const owner = game;
  autosaveFrame = requestAnimationFrame(() => {
    autosaveFrame = 0;
    if (game !== owner || gameOver.value || bookBusy.value || gameError.value) return;
    const state = owner.getSaveState();
    if (!state) return;
    try {
      const save = writeAutosave({ location: locationName.value, thumbnail: captureFrame().toDataURL('image/webp', .8), state });
      saveSlots.value = [...saveSlots.value.filter(slot => slot.index !== AUTOSAVE_SLOT), { index: AUTOSAVE_SLOT, save, error: null }];
    } catch { /* Keep the last saved chapter when storage is unavailable. */ }
  });
}
function showBookOptions(view: 'main' | 'load' = 'main') {
  if (bookSnapshot.value || loading.value || sequenceActive.value || !canvasRef.value) return;
  syncControls(); cancelGesture();
  intro?.setPaused(true); game?.setPaused(true);
  bookMessage.value = ''; refreshSaveSlots();
  canSave.value = !!game?.getSaveState();
  if (!introActive.value && !canSave.value && !gameOver.value && !gameError.value && !bookMessage.value) bookMessage.value = 'Resume to finish the current action before saving.';
  bookInitialView.value = view; bookReady.value = false; bookReturning.value = false;
  readingHistory.value = false;
  bookSnapshot.value = captureBookFrame();
  music.bookSound('page');
}
async function bookOptionsReady() {
  bookReady.value = true; await nextTick();
  appRef.value?.querySelector<HTMLElement>('[role="dialog"]')?.focus();
}
function resumeBook() { if (gameOver.value || bookBusy.value || !bookSnapshot.value || bookReturning.value) return; music.bookSound('enter'); bookReturning.value = true; }
function finishBookResume() {
  bookSnapshot.value = null; bookReady.value = false; bookReturning.value = false;
  intro?.setPaused(mobilePortrait.value); game?.setPaused(mobilePortrait.value); syncControls();
  const action = afterBookResume; afterBookResume = null; action?.();
}
function startJourney() {
  if (bookBusy.value || !bookReady.value || bookReturning.value) return;
  kallakMenu.value = false;
  afterBookResume = () => intro?.exitDemoLoop();
  resumeBook();
}
function leaveBook(destination: 'menu' | 'intro') {
  if (bookBusy.value) return;
  bookSnapshot.value = null; bookReturning.value = false; afterBookResume = null; kallakMenu.value = readingHistory.value = false;
  if (destination === 'menu') openMenu(); else replayIntro();
}
function saveChapter(index: number, name: string) {
  if (bookBusy.value) return;
  const state = game?.getSaveState();
  if (!state) { canSave.value = false; bookMessage.value = 'Resume to finish the current action before saving.'; return; }
  try {
    writeSaveSlot(index, { name, location: locationName.value, thumbnail: captureFrame().toDataURL('image/webp', .8), state });
    refreshSaveSlots(); bookMessage.value = `“${name}” saved.`;
  } catch (error) { bookMessage.value = error instanceof Error ? error.message : 'The chapter could not be saved.'; }
}
async function restoreChapter(record: SaveRecord) {
  if (!canvasRef.value) throw new Error('The game is not ready.');
  const controller = new AbortController();
  restoreController = controller;
  let committed = false, restoredLocation = record.location, restoredVoiceBank: string | undefined;
  const oldFrame = captureFrame();
  try {
    const candidate = await startGame(canvasRef.value, { ...config, inventoryCanvas: inventoryCanvas.value ?? undefined,
      inventoryTooltipCanvas: inventoryTooltip.value ?? undefined,
      statusTextCanvas: statusTextCanvas.value ?? undefined,
      backdropCanvas: sceneBackdrop.value ?? undefined, controlMode: controlMode.value, saveState: record.state, paused: true, signal: controller.signal,
      onDeath: () => { if (committed) config.onDeath(); },
      onCheckpoint: () => { if (committed) config.onCheckpoint(); },
      onContinueChange: value => { if (committed) config.onContinueChange(value); },
      onNoteChange: value => { if (committed) config.onNoteChange(value); },
      onLocationChange: (name, id, bank) => { restoredLocation = name; restoredVoiceBank = bank; if (committed) config.onLocationChange(name, id, bank); },
      onScriptAction: action => { if (committed) config.onScriptAction(action); },
      onLoadingChange: value => { if (committed) config.onLoadingChange(value); },
      onNavigationError: message => { if (committed) config.onNavigationError(message); },
      onSubtitleChange: lines => { if (committed) config.onSubtitleChange(lines); },
      onSequenceChange: active => { if (committed) config.onSequenceChange(active); }
    });
    introRunId++;
    intro?.stop(); intro = null; game?.stop(); gameLoadController?.abort();
    gameLoadController = controller; game = candidate; committed = true;
    introActive.value = openingScene.value = false; kallakMenu.value = false; noteVisible.value = false;
    music.stop(); music.restoreRoom(record.state.currentRoom, !!record.state.rooms[record.state.currentRoom].wispMs);
    if (restoredVoiceBank) music.prepareVoice(restoredVoiceBank);
    gameError.value = ''; gameOver.value = false; navigationError.value = ''; loading.value = false;
    sequenceActive.value = awaitingContinue.value = false; subtitleLines.value = []; subtitleAlpha.value = 1;
    locationName.value = restoredLocation;
    walkSpeed.value = record.state.settings.walkSpeed;
    animStepInterval.value = record.state.settings.animStepInterval;
    game.setDebug({ showMask: showMask.value, maskOpacity: maskOpacity.value, showLayerInfo: showLayerInfo.value });
    syncControls();
  } catch (error) {
    controller.abort(); canvasRef.value?.getContext('2d')?.drawImage(oldFrame, 0, 0);
    throw error;
  } finally { if (restoreController === controller) restoreController = null; }
}
async function loadChapter(index: number) {
  if (bookBusy.value || !refreshSaveSlots()) return;
  const slot = saveSlots.value.find(slot => slot.index === index);
  const record = slot?.save;
  if (!record) { bookMessage.value = slot?.error || 'This page has no saved chapter.'; return; }
  bookBusy.value = true; bookMessage.value = 'Opening your saved chapter…';
  try {
    await restoreChapter(record);
    bookSnapshot.value = captureBookFrame();
    await nextTick(); bookBusy.value = false; bookMessage.value = ''; resumeBook();
  } catch (error) { bookMessage.value = error instanceof Error ? error.message : 'This chapter could not be opened.'; }
  finally { bookBusy.value = false; }
}
async function continueJourney() {
  if (bookBusy.value || !refreshSaveSlots() || !latestSave.value?.save) return;
  bookBusy.value = true; bookMessage.value = '';
  try {
    await restoreChapter(latestSave.value.save);
    openingPrologue.value = false; openingSnapshot.value = captureBookFrame(); await nextTick();
    openingBook.value?.openBook();
  } catch (error) { bookBusy.value = false; bookMessage.value = error instanceof Error ? error.message : 'This chapter could not be opened.'; }
}

async function boot() {
  if (!canvasRef.value) return;
  updateSubtitleScale();
  await launchIntro(0, true);
}

function updateSubtitleScale() {
  if (!canvasRef.value) return;
  const rect = canvasRef.value.getBoundingClientRect();
  if (rect.width > 0) {
    const sx = rect.width / LOGICAL_WIDTH, sy = rect.height / canvasRef.value.height;
    if ((sx !== subtitleScale.value || sy !== subtitleScaleY.value) && game?.setInventoryOpen(false)) syncControls();
    subtitleScale.value = sx;
    subtitleScaleY.value = sy;
  }
}

async function startIntro(startIndex: number, autoStartGame: boolean) {
  if (!canvasRef.value) return;
  closePanels();
  introRunId += 1;
  gameLoadController?.abort();
  intro?.stop();
  if (game) {
    game.stop();
    game = null;
  }
  introActive.value = true;
  openingScene.value = false;
  gameOver.value = false;
  music.stop();
  music.prepareVoice('INTRO');
  kallakMenu.value = false; noteVisible.value = false;
  sequenceActive.value = false;
  navigationError.value = "";
  subtitleLines.value = [];
  const runId = introRunId;
  const steps = introSteps.slice(startIndex);
  currentIntroStep.value = steps[0]?.id ?? '';
  let introVoice: number | undefined;
  openingFrameReady.value = false;
  intro = playIntro(canvasRef.value, steps, {
    onFirstFrame: () => {
      openingFrameReady.value = true;
      if (bookOpened.value || openingFinished) bookOpened.value = true;
      intro?.setPaused(mobilePortrait.value || !bookOpened.value);
    },
    renderSubtitlesOnCanvas: false,
    atmosphere: () => true,
    onSoundEffect: track => { if (runId === introRunId) music.effect(track); },
    onVoiceSkip: () => { if (runId === introRunId) music.stopSpeech(); },
    onLoadingChange: (value) => { loading.value = value; },
    onStepChange: (id) => {
      introVoice = undefined; music.stopSpeech();
      currentIntroStep.value = id;
      music.intro(id);
      if (id === "kallak_writing" && autoStartGame) {
        intro?.setDemoLoopStep("kallak_writing");
      }
    },
    onStepReady: id => {
      if (id === 'kallak_writing' && autoStartGame && runId === introRunId) { kallakMenu.value = true; showBookOptions(); }
    },
    onSubtitleChange: (payload) => {
      if (runId !== introRunId) return;
      if (!payload.stepId) music.stopSpeech();
      const voice = payload.lines.find(line => line.voiceId !== undefined)?.voiceId;
      if (voice !== undefined && voice !== introVoice) {
        introVoice = voice;
        music.speak('INTRO', voice);
      }
      subtitleLines.value = payload.stepId === 'kallak_writing'
        ? payload.lines.map(line => ({ ...line, y: ROOM_ART.y + ROOM_ART.h - 32 }))
        : payload.lines;
      subtitleAlpha.value = payload.alpha;
    }
  });
  syncControls();
  await intro.done;
  if (runId !== introRunId) return;
  intro = null;
  if (!autoStartGame) {
    introActive.value = true;
    return;
  }
  introActive.value = false;
  openingScene.value = true;
  music.beginGame();
  subtitleLines.value = [];
  subtitleAlpha.value = 1;
  if (!canvasRef.value) return;
  loading.value = true;
  gameLoadController = new AbortController();
  const startedGame = await startGame(canvasRef.value, { ...config, inventoryCanvas: inventoryCanvas.value ?? undefined,
    inventoryTooltipCanvas: inventoryTooltip.value ?? undefined,
    statusTextCanvas: statusTextCanvas.value ?? undefined,
    backdropCanvas: sceneBackdrop.value ?? undefined, controlMode: controlMode.value, paused: mobilePortrait.value,
    signal: gameLoadController.signal,
    onCheckpoint: () => { if (runId === introRunId) config.onCheckpoint(); },
    onLocationChange: (name, id, bank) => { if (runId === introRunId) config.onLocationChange(name, id, bank); },
    onScriptAction: action => { if (runId === introRunId) config.onScriptAction(action); },
    onNoteChange: visible => { if (runId === introRunId) config.onNoteChange(visible); },
    onLoadingChange: value => { if (runId === introRunId) config.onLoadingChange(value); },
    onNavigationError: message => { if (runId === introRunId) config.onNavigationError(message); },
    onSubtitleChange: lines => { if (runId === introRunId) config.onSubtitleChange(lines); },
    onSequenceChange: active => {
      if (runId !== introRunId) return;
      if (!active) openingScene.value = false;
      config.onSequenceChange(active);
    }
  });
  if (runId !== introRunId) {
    startedGame.stop();
    return;
  }
  game = startedGame;
  game.setPaused(mobilePortrait.value);
  syncControls();
  loading.value = false;
  game.setDebug({
    showMask: showMask.value,
    maskOpacity: maskOpacity.value,
    showLayerInfo: showLayerInfo.value
  });
  game.setWalkSpeed(walkSpeed.value);
  game.setAnimStepInterval(animStepInterval.value);
  scheduleAutosave();
}

const gameHint = computed(() => {
  if (gameError.value) return t("The journey is paused.");
  if (loading.value) return t("Loading the scene…");
  if (navigationError.value) return t(navigationError.value);
  if (kallakMenu.value) return t("Your journey begins here.");
  if (subtitleVisible.value) return t("Click or tap to skip this line.");
  return introActive.value || sequenceActive.value ? t("The story is unfolding…") : `${t(locationName.value)} · ${t("Swipe to move the cursor. Tap to interact.")}`;
});

async function launchIntro(startIndex: number, autoStartGame: boolean) {
  gameError.value = "";
  const request = introRunId + 1;
  try {
    await startIntro(startIndex, autoStartGame);
  } catch (error) {
    if (request !== introRunId) return;
    console.error("Failed to start game", error);
    gameError.value = "The game could not load. Please try again.";
    if (openingFinished || bookOpened.value) bookOpened.value = true;
    loading.value = false;
  }
}

function openMenu() {
  closePanels();
  void launchIntro(introSteps.findIndex(step => step.id === "kallak_writing"), true);
}

function replayIntro() {
  closePanels();
  void launchIntro(0, true);
}

function updateFullscreen() {
  isFullscreen.value = document.fullscreenElement === appRef.value;
  const dialog = rotationDialog.value;
  if (dialog?.open) {
    // Keep the prompt above the app when the app itself enters the top layer.
    dialog.close();
    dialog.showModal();
  }
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await appRef.value?.requestFullscreen();
  } catch (error) {
    console.warn("Full screen is unavailable", error);
    fullscreenAvailable.value = false;
  }
}

function handleClick(event: MouseEvent) {
  if (overlayOpen.value) return;
  if (touchPointer.value) return; // Touch activation is handled on pointerup, never after a swipe.
  if (introActive.value) {
    intro?.skipLine();
    return;
  }
  if (!canvasRef.value || !game) return;
  const point = clampCursor(mapPointerToCanvas(canvasRef.value, event.clientX, event.clientY));
  interact(point);
}

function toggleInventory() {
  if (controlMode.value !== 'modern' || !game || overlayOpen.value || loading.value || gameError.value) return false;
  if (!game.setInventoryOpen(!game.getInventoryOpen())) return false;
  syncControls();
  return true;
}
function handleContextMenu(event: MouseEvent) {
  if (touchPointer.value || !canvasRef.value) return;
  cursor.value = clampCursor(mapPointerToCanvas(canvasRef.value, event.clientX, event.clientY));
  game?.setPointer(cursor.value);
  toggleInventory();
}

function handlePointerDown(event: PointerEvent) {
  if (overlayOpen.value) return;
  touchPointer.value = event.pointerType !== 'mouse';
  if (!touchPointer.value) { handleMove(event); return; }
  if (!event.isPrimary) { cancelGesture(); return; }
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, travel: 0, started: performance.now() };
  canvasRef.value?.setPointerCapture(event.pointerId);
}

function handleMove(event: PointerEvent) {
  if (overlayOpen.value || !canvasRef.value) return;
  if (event.pointerType !== 'mouse') {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    gesture.travel += Math.hypot(dx, dy);
    gesture.x = event.clientX; gesture.y = event.clientY;
    const rect = canvasRef.value.getBoundingClientRect();
    cursor.value = clampCursor({ x: cursor.value.x + dx * LOGICAL_WIDTH / rect.width,
      y: cursor.value.y + dy * gameViewHeight.value / rect.height });
  } else {
    touchPointer.value = false;
    pointerInStage.value = true;
    cursor.value = clampCursor(mapPointerToCanvas(canvasRef.value, event.clientX, event.clientY));
  }
  game?.setPointer(cursor.value);
}

function leaveStage(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return;
  pointerInStage.value = false;
  game?.setPointer(null);
}

function handlePointerUp(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId) return;
  const tap = gesture.travel < 6;
  const hold = performance.now() - gesture.started >= 420;
  cancelGesture();
  if (tap) {
    if (introActive.value) intro?.skipLine();
    else if (hold && controlMode.value === 'modern') toggleInventory();
    else interact(cursor.value);
  }
}
function cancelGesture() { gesture = null; }

function updateOrientation() {
  mobilePortrait.value = portraitMedia.matches;
  cancelGesture();
  const paused = mobilePortrait.value || !bookOpened.value || !!bookSnapshot.value;
  intro?.setPaused(paused);
  game?.setPaused(paused);
}

watch(rotationDialog, dialog => dialog?.showModal(), { flush: 'post' });

onMounted(() => {
  void music.restore();
  document.addEventListener('visibilitychange', musicVisibility);
  refreshSaveSlots();
  document.addEventListener('keydown', handlePanelKey);
  fullscreenAvailable.value = document.fullscreenEnabled;
  document.addEventListener("fullscreenchange", updateFullscreen);
  portraitMedia.addEventListener('change', updateOrientation);
  document.title = 'Fables & Fiends — The Legend of Kyrandia';
  subtitleResizeObserver = new ResizeObserver(updateSubtitleScale);
  if (canvasRef.value) subtitleResizeObserver.observe(canvasRef.value);
  window.addEventListener("resize", updateSubtitleScale);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(autosaveFrame);
  music.dispose(); document.removeEventListener('visibilitychange', musicVisibility);
  introRunId++;
  document.removeEventListener('keydown', handlePanelKey);
  restoreController?.abort();
  gameLoadController?.abort();
  subtitleResizeObserver?.disconnect();
  intro?.stop();
  game?.stop();
  window.removeEventListener("resize", updateSubtitleScale);
  document.removeEventListener("fullscreenchange", updateFullscreen);
  portraitMedia.removeEventListener('change', updateOrientation);
});

watch([showMask, maskOpacity, showLayerInfo, walkSpeed, animStepInterval], () => {
  game?.setDebug({
    showMask: showMask.value,
    maskOpacity: maskOpacity.value,
    showLayerInfo: showLayerInfo.value
  });
  if (walkSpeed.value) {
    game?.setWalkSpeed(walkSpeed.value);
  }
  game?.setAnimStepInterval(animStepInterval.value);
});

watch(introActive, (active) => {
  document.title = active ? "Intro — Kyrandia" : "GemCut — Kyrandia";
}, { immediate: true });


function musicVisibility() { music.setHidden(document.hidden); }
watch([bookOpened, bookSnapshot, loading, gameError, mobilePortrait],
  () => {
    const book = !bookOpened.value || !!bookSnapshot.value;
    music.setPaused(book || loading.value || !!gameError.value || mobilePortrait.value);
    music.setBook(book && !mobilePortrait.value);
  },
  { immediate: true, flush: 'sync' });
</script>
