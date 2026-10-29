<template>
  <main class="app" :class="{ 'book-is-closed': !bookOpened }" ref="appRef">
    <FantasyBook v-if="!bookOpened" ref="openingBook" :snapshot="openingSnapshot ?? undefined" :inert="bookBusy" @open="openBook">
      <template #invitation><button v-if="latestSave" class="pixel-button book-continue" type="button" :disabled="bookBusy" @click.stop="continueJourney">Continue journey</button><p v-if="bookBusy || bookMessage" class="book-status" role="status">{{ bookBusy ? 'Opening your saved chapter…' : bookMessage }}</p></template>
    </FantasyBook>
    <FantasyBook v-if="bookSnapshot" mode="options" :snapshot="bookSnapshot" :returning="bookReturning" @ready="bookOptionsReady" @resume="finishBookResume">
      <BookMenu :gameplay="!introActive" :can-save="canSave" :busy="bookBusy || !bookReady || bookReturning" :message="bookMessage" :slots="bookSlots" :initial-view="bookInitialView"
        v-model:walk-speed="walkSpeed" v-model:atmosphere="atmosphere" :fullscreen-available="fullscreenAvailable" :is-fullscreen="isFullscreen" :inventory="bookInventory" :held-item-name="heldItem ? itemDefinitions.get(heldItem)?.name ?? '' : ''"
        @resume="resumeBook" @save="saveChapter" @load="loadChapter" @inventory="chooseBookItem" @fullscreen="toggleFullscreen" @main-menu="leaveBook('menu')" @replay-intro="leaveBook('intro')" />
    </FantasyBook>
    <div v-show="bookOpened" class="game-frame" :inert="!!bookSnapshot">
      <div class="stage">
        <SubtitleOverlay
          :lines="subtitleLines"
          :scale="subtitleScale"
          :alpha="subtitleAlpha"
          :visible="subtitleVisible"
        />
        <canvas
          ref="canvasRef"
          width="320"
          height="200"
          aria-label="Kyrandia game scene"
          @click="handleClick"
          @pointerdown="handlePointerDown"
          @pointermove="handleMove"
          @pointerup="handlePointerUp"
          @pointercancel="cancelGesture"
          :class="{ 'cursor-controlled': !introActive }"
        ></canvas>
        <div v-if="!introActive && !gameError && !overlayOpen" class="game-cursor" :style="{ left: `${(cursor.x - cursorShape.x) / 3.2}%`, top: `${(cursor.y - cursorShape.y) / 2}%`, width: `${cursorShape.w / 3.2}%`, height: `${cursorShape.h / 2}%` }" aria-hidden="true">
          <img v-if="cursorExit || !heldItem" :src="`${baseUrl}assets/cursors/${cursorExit?.side ?? 'pointer'}.svg`" alt="" />
        </div>
        <button v-if="awaitingContinue" class="pixel-button continue-button" type="button" @click="game?.handleClick({ x: 160, y: 100 })">Continue</button>
        <template v-if="introPanelVisible">
          <img
            class="intro-logo"
            :style="{ opacity: introPanelOpacity }"
            :src="`${baseUrl}assets/interface/kyrandia-title.webp`"
            alt="The Legend of Kyrandia"
          />
          <div class="intro-menu" :style="{ opacity: introPanelOpacity }">
            <p class="chapter-title">A tale of magic. A kingdom to awaken.</p>
            <div class="intro-choices">
            <button
              class="pixel-button start-button"
              type="button"
              :disabled="introPanelClosing"
              @click="handleIntroPanelClick"
            ><span class="button-gem" aria-hidden="true"></span>Start game</button>
            <button v-if="latestSave" class="pixel-button menu-secondary" type="button" :disabled="introPanelClosing" @click="showBookOptions('load')">Load game</button>
            <button class="pixel-button menu-secondary" type="button" :disabled="introPanelClosing" :aria-expanded="helpOpen" @click="showHelp">How to play</button>
            <button class="pixel-button menu-secondary" type="button" :disabled="introPanelClosing" :aria-expanded="panelOpen" @click="showSettings">Settings</button>
            </div>
            <p class="menu-footnote">Book One · The beginning of a legend</p>
          </div>
        </template>
        <div v-if="gameError" class="game-error" role="alert">
          <p>{{ gameError }}</p>
          <button class="pixel-button" type="button" @click="boot">Try again</button>
          <button v-if="latestSave" class="pixel-button" type="button" @click="showBookOptions('load')">Load game</button>
        </div>
        <button v-if="!introActive && !gameError && !sequenceActive && !loading" class="hud-options" type="button" aria-label="Options" @click="showSettings"><span class="sr-only">Options</span></button>
        <p class="sr-only" role="status">{{ gameHint }}</p>
        <p v-if="loading || navigationError" class="scene-notice" role="status">{{ loading ? 'Loading…' : navigationError }}</p>
        <div v-if="legacyPanelsOpen" class="dialog-shade" @click.self="closePanels">
    <section v-if="inventoryOpen && !introActive" class="touch-inventory in-game-dialog" role="dialog" aria-modal="true" aria-label="Inventory" tabindex="-1">
      <div class="panel-heading"><h2>Inventory</h2><button class="text-button" type="button" @click="closePanels">Close</button></div>
      <p aria-live="polite">{{ heldItem ? `In hand: ${itemDefinitions.get(heldItem)?.name}` : 'Choose an item, then tap where to use it.' }}</p>
      <div class="inventory-grid">
        <button v-for="(item, index) in inventorySlots" :key="index" class="inventory-slot" type="button"
          :disabled="sequenceActive || loading || !!gameError" :aria-label="item ? `Take ${itemDefinitions.get(item)?.name}` : heldItem ? `Store item in slot ${index + 1}` : `Empty slot ${index + 1}`"
          @click="useInventorySlot(index)"><span v-if="item" class="item-icon" :style="itemStyle(item)"></span></button>
      </div>
    </section>
    <section v-if="helpOpen" id="game-help" class="settings help-panel in-game-dialog" role="dialog" aria-modal="true" aria-labelledby="help-title" tabindex="-1">
      <div class="panel-heading"><h2 id="help-title">Your adventure begins</h2><button class="text-button" type="button" @click="closePanels">Close</button></div>
      <div class="help-columns"><p><strong>Explore</strong>Click to walk. Move the cursor to an exit to reveal its arrow.</p><p><strong>Discover</strong>Click people to talk, or objects to take them. Choose an inventory item, then click where to use it.</p><p><strong>On a touch screen</strong>Swipe to guide the cursor. Tap to interact. During dialogue, tap to skip the current line.</p></div>
    </section>
    <section v-if="panelOpen" id="game-settings" class="settings in-game-dialog" role="dialog" aria-modal="true" aria-label="Game settings" tabindex="-1">
      <div class="panel-heading"><h2>Options</h2><button class="text-button" type="button" @click="closePanels">Resume</button></div>
      <nav class="game-actions" aria-label="Game controls">
        <button v-if="!introActive" class="text-button" type="button" @click="showInventory">Inventory</button>
        <button class="text-button" type="button" @click="showHelp">How to play</button>
        <button v-if="fullscreenAvailable" class="text-button" type="button" @click="toggleFullscreen">{{ isFullscreen ? 'Exit full screen' : 'Full screen' }}</button>
        <button v-if="!introPanelVisible" class="text-button" type="button" @click="openMenu">Main menu</button>
      </nav>
      <div class="settings-main">
        <label class="check-field"><input type="checkbox" v-model="atmosphere" /> Window dust</label>
        <label class="setting-field">
          <span>Walk speed</span>
          <select v-model="walkSpeed">
            <option value="slowest">Slowest</option>
            <option value="slow">Slow</option>
            <option value="fast">Fast</option>
            <option value="fastest">Fastest</option>
          </select>
        </label>
        <button class="pixel-button" type="button" @click="replayIntro">Replay intro</button>
      </div>
      <details class="developer-tools">
        <summary>Developer tools</summary>
        <div class="debug-fields">
          <label class="check-field"><input type="checkbox" v-model="showMask" /> Show walk mask</label>
          <label class="check-field"><input type="checkbox" v-model="showLayerInfo" /> Show layer info</label>
          <label class="setting-field">
            <span>Intro scene</span>
            <select v-model="introScene">
              <option v-for="step in introSteps" :key="step.id" :value="step.id">{{ step.id }}</option>
            </select>
          </label>
          <label class="setting-field">
            <span>Walk animation: {{ animStepInterval }} steps</span>
            <input type="range" min="1" max="8" step="1" v-model.number="animStepInterval" />
          </label>
          <label class="setting-field">
            <span>Mask opacity: {{ Math.round(maskOpacity * 100) }}%</span>
            <input type="range" min="0" max="1" step="0.05" v-model.number="maskOpacity" />
          </label>
        </div>
      </details>
    <footer class="credits">
      <span>Original tale © 1992 Westwood Studios</span>
      <a href="https://github.com/yanakulov/kyraweb" target="_blank" rel="noopener noreferrer">Reimagined by AkulaFlow · Yan Akulov</a>
    </footer>
    </section>
        </div>
      </div>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
const FantasyBook = defineAsyncComponent(() => import('./components/FantasyBook.vue'));
import BookMenu from './components/BookMenu.vue';
import { readSaveSlots, writeSaveSlot, type SaveRecord, type SaveSlot } from './engine/gameplay/saveStorage';
const bookOpened = ref(false);
const openingBook = ref<{ openBook: () => void } | null>(null);
const openingSnapshot = shallowRef<HTMLCanvasElement | null>(null), bookSnapshot = shallowRef<HTMLCanvasElement | null>(null);
const bookReturning = ref(false), bookReady = ref(false), bookBusy = ref(false), canSave = ref(false);
const bookMessage = ref(''), bookInitialView = ref<'main' | 'load'>('main');
const saveSlots = shallowRef<SaveSlot[]>([]);
const latestSave = computed(() => saveSlots.value.filter(slot => slot.save).sort((a,b) => b.save!.savedAt.localeCompare(a.save!.savedAt))[0]);
const bookSlots = computed(() => saveSlots.value.map(slot => ({ index: slot.index, ...slot.save, error: slot.error })));
const bookInventory = computed(() => inventorySlots.value.map(id => ({ id, name: id ? itemDefinitions.get(id)?.name ?? id : '', style: id ? itemStyle(id) : undefined })));
let afterBookResume: (() => void) | null = null;
const helpOpen = ref(false);
function openBook() { bookBusy.value = false; if (openingSnapshot.value && game) { bookOpened.value = true; openingSnapshot.value = null; game.setPaused(false); syncControls(); } else void boot(); }
function closePanels() { if (bookSnapshot.value) { resumeBook(); return; } helpOpen.value = panelOpen.value = inventoryOpen.value = false; }
function showHelp() { closePanels(); helpOpen.value = true; }
function showSettings() { if (!introActive.value) { showBookOptions(); return; } closePanels(); panelOpen.value = true; }
function showInventory() { closePanels(); inventoryOpen.value = true; }
import { mapPointerToCanvas, startGame } from "./engine/gameplay/game";
import { LOGICAL_WIDTH } from "./engine/core/constants";
import { buildIntroSteps, playIntro, type IntroPlayback } from "./engine/intro";
import { gemCutScene } from "./engine/scenes/gemCut";
import SubtitleOverlay from "./components/SubtitleOverlay.vue";
import { portalAtPoint } from "./engine/gameplay/navigation";
import { buildInventoryItems, getInventorySlotPositions } from "./engine/gameplay/inventory";
import type { RoomPortal, InventoryItemId, Vec2 } from "./engine/core/types";
const portals = ref<RoomPortal[]>([]);
const cursor = ref<Vec2>({ x: 160, y: 100 });
const cursorExit = computed(() => sequenceActive.value || loading.value ? undefined : portalAtPoint(portals.value, cursor.value));
const baseUrl = import.meta.env.BASE_URL;
const cursorShape = computed(() => ({
  pointer: {x:1,y:1,w:8,h:10}, north: {x:5,y:1,w:16,h:9},
  east: {x:7,y:5,w:16,h:11}, south: {x:5,y:7,w:16,h:9}, west: {x:1,y:5,w:16,h:11}
})[cursorExit.value?.side ?? 'pointer']);
const inventoryOpen = ref(false);
const inventorySlots = ref<(InventoryItemId | null)[]>([]);
const heldItem = ref<InventoryItemId | null>(null);
const itemDefinitions = buildInventoryItems();
let touchPointer = false;
let gesture: { id: number; x: number; y: number; travel: number } | null = null;
function syncControls() {
  portals.value = game?.getPortals() ?? [];
  const snapshot = game?.getSnapshot();
  inventorySlots.value = snapshot?.inventorySlots.slice() ?? [];
  heldItem.value = snapshot?.itemInHand ?? null;
  game?.setPointer(cursor.value);
}
function itemStyle(item: InventoryItemId) {
  const tile = itemDefinitions.get(item)!.tileIndex;
  return { backgroundPosition: `${-(tile % 20) * 32}px ${-Math.floor(tile / 20) * 32}px` };
}
function interact(point: Vec2) {
  if (!game || loading.value || gameError.value || bookSnapshot.value) return;
  // Touch aims a persistent cursor; activating the original HUD must use it too.
  if (!sequenceActive.value && point.x >= 12.8 && point.x < 73.6 && point.y >= 154 && point.y < 198) { showSettings(); return; }
  game.setPointer(point);
  if (!game.handleClick(point)) game.setTarget(point);
  syncControls();
}
function useInventorySlot(index: number) {
  const slot = getInventorySlotPositions()[index];
  interact({ x: slot.x + 8, y: slot.y + 8 });
  closePanels();
}
const appRef = ref<HTMLElement | null>(null);
const gameError = ref("");
const loading = ref(false);
const atmosphere = ref(true);
const fullscreenAvailable = ref(false);
const isFullscreen = ref(false);
const canvasRef = ref<HTMLCanvasElement | null>(null);
let game: Awaited<ReturnType<typeof startGame>> | null = null;
let gameLoadController: AbortController | null = null;
let restoreController: AbortController | null = null;
const showMask = ref(false);
const showLayerInfo = ref(false);
const maskOpacity = ref(0.35);
const walkSpeed = ref<"slowest" | "slow" | "fast" | "fastest">("fast");
const animStepInterval = ref(1);
const introActive = ref(true);
let intro: IntroPlayback | null = null;
const panelOpen = ref(false);
const legacyPanelsOpen = computed(() => panelOpen.value || helpOpen.value || inventoryOpen.value);
const overlayOpen = computed(() => legacyPanelsOpen.value || !!bookSnapshot.value);
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
watch(legacyPanelsOpen, value => { if (!bookSnapshot.value) { intro?.setPaused(value); game?.setPaused(value); } });
function handlePanelKey(event: KeyboardEvent) {
  if (!overlayOpen.value) return;
  if (event.key === 'Escape') { event.preventDefault(); if (!bookBusy.value) closePanels(); }
  if (event.key !== 'Tab') return;
  const panel = appRef.value?.querySelector<HTMLElement>('[role="dialog"]');
  const controls = [...panel?.querySelectorAll<HTMLElement>('button:not(:disabled), select, input, summary, a[href]') ?? []].filter(el => el.getClientRects().length);
  const first = controls[0], last = controls.at(-1);
  if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
const introSteps = buildIntroSteps();
const introScene = ref(introSteps[0]?.id ?? "");
let introRunId = 0;
let subtitleResizeObserver: ResizeObserver | null = null;
let panelFadeFrame = 0;
const currentIntroStep = ref(introSteps[0]?.id ?? "");
const introPanelClosing = ref(false);
const introPanelDismissed = ref(false);
const introMenuEnabled = ref(true);
const introPanelOpacity = ref(1);
const showIntroPanel = computed(
  () =>
    introActive.value && introMenuEnabled.value && currentIntroStep.value === "kallak_writing" && !introPanelDismissed.value
);
const introPanelVisible = computed(() => showIntroPanel.value || introPanelClosing.value);
const subtitleLines = ref([] as import('./engine/intro/types').IntroSubtitle[]);
const subtitleAlpha = ref(1);
const subtitleVisible = computed(() => subtitleLines.value.length > 0);
const sequenceActive = ref(false);
const awaitingContinue = ref(false);
const locationName = ref("");
const navigationError = ref("");
const subtitleScale = ref(1);


const config = {
  onDeath: () => { gameError.value = "Brandon has died. Start a new journey."; },
  onContinueChange: (waiting: boolean) => { awaitingContinue.value = waiting; },
  scene: gemCutScene,
  world: import.meta.env.BASE_URL + "assets/world/world.json",
  onLocationChange: (name: string) => { locationName.value = name; queueMicrotask(syncControls); },
  onLoadingChange: (value: boolean) => { loading.value = value; queueMicrotask(syncControls); },
  onNavigationError: (message: string) => { navigationError.value = message; },
  onSubtitleChange: (lines: import('./engine/intro/types').IntroSubtitle[]) => { subtitleLines.value = lines; },
  onSequenceChange: (active: boolean) => { sequenceActive.value = active; queueMicrotask(syncControls); }
};

function refreshSaveSlots() {
  try { saveSlots.value = readSaveSlots(); return true; }
  catch (error) { bookMessage.value = error instanceof Error ? error.message : 'Saved chapters are unavailable.'; return false; }
}
function captureFrame() {
  const copy = document.createElement('canvas'); copy.width = 320; copy.height = 200;
  if (canvasRef.value) copy.getContext('2d')!.drawImage(canvasRef.value, 0, 0);
  return copy;
}
function showBookOptions(view: 'main' | 'load' = 'main') {
  if (bookSnapshot.value || loading.value || sequenceActive.value || !canvasRef.value) return;
  syncControls(); cancelGesture();
  intro?.setPaused(true); game?.setPaused(true);
  bookMessage.value = ''; refreshSaveSlots();
  canSave.value = !!game?.getSaveState();
  if (!introActive.value && !canSave.value && !gameError.value && !bookMessage.value) bookMessage.value = 'Resume to finish the current action before saving.';
  bookInitialView.value = view; bookReady.value = false; bookReturning.value = false;
  helpOpen.value = panelOpen.value = inventoryOpen.value = false;
  bookSnapshot.value = captureFrame();
}
async function bookOptionsReady() {
  bookReady.value = true; await nextTick();
  appRef.value?.querySelector<HTMLElement>('.folio-menu')?.focus();
}
function resumeBook() { if (bookBusy.value || !bookSnapshot.value || bookReturning.value) return; bookReturning.value = true; }
function finishBookResume() {
  bookSnapshot.value = null; bookReady.value = false; bookReturning.value = false;
  intro?.setPaused(false); game?.setPaused(false); syncControls();
  const action = afterBookResume; afterBookResume = null; action?.();
}
function chooseBookItem(index: number) { afterBookResume = () => useInventorySlot(index); resumeBook(); }
function leaveBook(destination: 'menu' | 'intro') {
  if (bookBusy.value) return;
  bookSnapshot.value = null; bookReturning.value = false; afterBookResume = null;
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
  let committed = false, restoredLocation = record.location;
  const oldFrame = captureFrame();
  try {
    const candidate = await startGame(canvasRef.value, { ...config, saveState: record.state, paused: true, signal: controller.signal,
      onDeath: () => { if (committed) config.onDeath(); },
      onContinueChange: value => { if (committed) config.onContinueChange(value); },
      onLocationChange: name => { restoredLocation = name; if (committed) config.onLocationChange(name); },
      onLoadingChange: value => { if (committed) config.onLoadingChange(value); },
      onNavigationError: message => { if (committed) config.onNavigationError(message); },
      onSubtitleChange: lines => { if (committed) config.onSubtitleChange(lines); },
      onSequenceChange: active => { if (committed) config.onSequenceChange(active); }
    });
    introRunId++; cancelAnimationFrame(panelFadeFrame);
    intro?.stop(); intro = null; game?.stop(); gameLoadController?.abort();
    gameLoadController = controller; game = candidate; committed = true;
    introActive.value = false; introPanelClosing.value = false; introPanelDismissed.value = true;
    gameError.value = ''; navigationError.value = ''; loading.value = false;
    sequenceActive.value = awaitingContinue.value = false; subtitleLines.value = []; subtitleAlpha.value = 1;
    locationName.value = restoredLocation;
    walkSpeed.value = record.state.settings.walkSpeed; atmosphere.value = record.state.settings.atmosphere;
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
  const record = saveSlots.value[index]?.save;
  if (!record) { bookMessage.value = saveSlots.value[index]?.error || 'This page has no saved chapter.'; return; }
  bookBusy.value = true; bookMessage.value = 'Opening your saved chapter…';
  try {
    await restoreChapter(record);
    bookSnapshot.value = captureFrame();
    await nextTick(); bookBusy.value = false; bookMessage.value = ''; resumeBook();
  } catch (error) { bookMessage.value = error instanceof Error ? error.message : 'This chapter could not be opened.'; }
  finally { bookBusy.value = false; }
}
async function continueJourney() {
  if (bookBusy.value || !refreshSaveSlots() || !latestSave.value?.save) return;
  bookBusy.value = true; bookMessage.value = '';
  try {
    await restoreChapter(latestSave.value.save);
    openingSnapshot.value = captureFrame(); await nextTick();
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
    subtitleScale.value = rect.width / LOGICAL_WIDTH;
  }
}

async function startIntro(startIndex: number, autoStartGame: boolean) {
  if (!canvasRef.value) return;
  closePanels();
  introRunId += 1;
  gameLoadController?.abort();
  cancelAnimationFrame(panelFadeFrame);
  intro?.stop();
  if (game) {
    game.stop();
    game = null;
  }
  introActive.value = true;
  introMenuEnabled.value = autoStartGame;
  introPanelClosing.value = false;
  introPanelDismissed.value = false;
  introPanelOpacity.value = 1;
  sequenceActive.value = false;
  navigationError.value = "";
  subtitleLines.value = [];
  const runId = introRunId;
  const steps = introSteps.slice(startIndex);
  intro = playIntro(canvasRef.value, steps, {
    onFirstFrame: () => { bookOpened.value = true; },
    renderSubtitlesOnCanvas: false,
    atmosphere: () => atmosphere.value,
    onLoadingChange: (value) => { loading.value = value; },
    onStepChange: (id) => {
      currentIntroStep.value = id;
      if (id === "kallak_writing" && autoStartGame) {
        intro?.setDemoLoopStep("kallak_writing");
      }
    },
    onSubtitleChange: (payload) => {
      subtitleLines.value = payload.lines;
      subtitleAlpha.value = payload.alpha;
    }
  });
  await intro.done;
  if (runId !== introRunId) return;
  intro = null;
  if (!autoStartGame) {
    introActive.value = true;
    return;
  }
  introActive.value = false;
  subtitleLines.value = [];
  subtitleAlpha.value = 1;
  if (!canvasRef.value) return;
  loading.value = true;
  gameLoadController = new AbortController();
  const startedGame = await startGame(canvasRef.value, { ...config,
    signal: gameLoadController.signal,
    onLocationChange: name => { if (runId === introRunId) config.onLocationChange(name); },
    onLoadingChange: value => { if (runId === introRunId) config.onLoadingChange(value); },
    onNavigationError: message => { if (runId === introRunId) config.onNavigationError(message); },
    onSubtitleChange: lines => { if (runId === introRunId) config.onSubtitleChange(lines); },
    onSequenceChange: active => { if (runId === introRunId) config.onSequenceChange(active); }
  });
  if (runId !== introRunId) {
    startedGame.stop();
    return;
  }
  game = startedGame;
  syncControls();
  loading.value = false;
  game.setAtmosphere(atmosphere.value);
  game.setDebug({
    showMask: showMask.value,
    maskOpacity: maskOpacity.value,
    showLayerInfo: showLayerInfo.value
  });
  game.setWalkSpeed(walkSpeed.value);
  game.setAnimStepInterval(animStepInterval.value);
}

const gameHint = computed(() => {
  if (gameError.value) return "The journey is paused.";
  if (loading.value) return "Loading the scene…";
  if (navigationError.value) return navigationError.value;
  if (introPanelVisible.value) return "Your journey begins here.";
  if (subtitleVisible.value) return "Click or tap to skip this line.";
  return introActive.value || sequenceActive.value ? "The story is unfolding…" : `${locationName.value} · Swipe to move the cursor. Tap to interact.`;
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
    bookOpened.value = true;
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

function handleIntroPanelClick() {
  if (introPanelClosing.value || !showIntroPanel.value) return;
  introPanelClosing.value = true;
  fadeOutIntroPanel(window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 400);
}

function fadeOutIntroPanel(durationMs: number) {
  const start = performance.now();
  const startPanel = introPanelOpacity.value;
  const steps = 12;
  const step = (now: number) => {
    const t = durationMs === 0 ? 1 : Math.min(1, (now - start) / durationMs);
    const quantized = Math.floor(t * steps) / steps;
    const next = Math.max(0, 1 - quantized);
    introPanelOpacity.value = Math.max(0, startPanel * next);
    if (t < 1) {
      panelFadeFrame = requestAnimationFrame(step);
      return;
    }
    introPanelClosing.value = false;
    introPanelDismissed.value = true;
    intro?.exitDemoLoop();
  };
  panelFadeFrame = requestAnimationFrame(step);
}

function handleClick(event: MouseEvent) {
  if (overlayOpen.value) return;
  if (touchPointer) return; // Touch activation is handled on pointerup, never after a swipe.
  if (introActive.value) {
    intro?.skipLine();
    return;
  }
  if (!canvasRef.value || !game) return;
  const point = mapPointerToCanvas(canvasRef.value, event.clientX, event.clientY);
  interact(point);
}

function handlePointerDown(event: PointerEvent) {
  if (overlayOpen.value) return;
  touchPointer = event.pointerType !== 'mouse';
  if (!touchPointer) { handleMove(event); return; }
  if (!event.isPrimary) { cancelGesture(); return; }
  gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, travel: 0 };
  canvasRef.value?.setPointerCapture(event.pointerId);
}

function handleMove(event: PointerEvent) {
  if (introActive.value || overlayOpen.value) return;
  if (!canvasRef.value || !game) return;
  if (event.pointerType !== 'mouse') {
    if (!gesture || gesture.id !== event.pointerId) return;
    const dx = event.clientX - gesture.x, dy = event.clientY - gesture.y;
    gesture.travel += Math.hypot(dx, dy);
    gesture.x = event.clientX; gesture.y = event.clientY;
    const rect = canvasRef.value.getBoundingClientRect();
    cursor.value = { x: Math.max(0, Math.min(319, cursor.value.x + dx * 320 / rect.width)), y: Math.max(0, Math.min(199, cursor.value.y + dy * 200 / rect.height)) };
  } else cursor.value = mapPointerToCanvas(canvasRef.value, event.clientX, event.clientY);
  game.setPointer(cursor.value);
}

function handlePointerUp(event: PointerEvent) {
  if (!gesture || gesture.id !== event.pointerId) return;
  const tap = gesture.travel < 6;
  cancelGesture();
  if (tap) {
    if (introActive.value) intro?.skipLine();
    else interact(cursor.value);
  }
}
function cancelGesture() { gesture = null; }

onMounted(() => {
  refreshSaveSlots();
  document.addEventListener('keydown', handlePanelKey);
  fullscreenAvailable.value = document.fullscreenEnabled;
  document.addEventListener("fullscreenchange", updateFullscreen);
  document.title = 'Fables & Fiends — The Legend of Kyrandia';
  subtitleResizeObserver = new ResizeObserver(updateSubtitleScale);
  if (canvasRef.value) subtitleResizeObserver.observe(canvasRef.value);
  window.addEventListener("resize", updateSubtitleScale);
});

onBeforeUnmount(() => {
  introRunId++;
  document.removeEventListener('keydown', handlePanelKey);
  restoreController?.abort();
  gameLoadController?.abort();
  cancelAnimationFrame(panelFadeFrame);
  subtitleResizeObserver?.disconnect();
  intro?.stop();
  game?.stop();
  window.removeEventListener("resize", updateSubtitleScale);
  document.removeEventListener("fullscreenchange", updateFullscreen);
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

watch(introScene, (value) => {
  const index = introSteps.findIndex((step) => step.id === value);
  if (index < 0) return;
  void launchIntro(index, false);
});

watch(atmosphere, value => game?.setAtmosphere(value));
</script>
