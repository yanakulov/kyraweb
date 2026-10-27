<template>
  <main class="app" ref="appRef">
    <header class="masthead">
      <h1>Kyrandia</h1>
      <span>Book One · Web remake</span>
    </header>
    <div class="game-frame">
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
          @mousemove="handleMove"
          @mouseleave="handleLeave"
        ></canvas>
        <template v-if="introPanelVisible">
          <img
            class="intro-logo"
            :style="{ opacity: introPanelOpacity }"
            src="/assets/interface/HUD/game-logo.png"
            alt="The Legend of Kyrandia"
          />
          <div class="intro-menu" :style="{ opacity: introPanelOpacity }">
            <button
              class="pixel-button start-button"
              type="button"
              :disabled="introPanelClosing"
              @click="handleIntroPanelClick"
            >Start demo</button>
          </div>
        </template>
        <div v-if="gameError" class="game-error" role="alert">
          <p>{{ gameError }}</p>
          <button class="pixel-button" type="button" @click="boot">Try again</button>
        </div>
      </div>
    </div>
    <div class="game-toolbar">
      <p class="game-hint" aria-live="polite">{{ gameHint }}</p>
      <nav class="game-actions" aria-label="Game controls">
        <button class="text-button" type="button" @click="openMenu">Menu</button>
        <button v-if="fullscreenAvailable" class="text-button" type="button" @click="toggleFullscreen">
          {{ isFullscreen ? "Exit full screen" : "Full screen" }}
        </button>
        <button class="text-button" type="button" :aria-expanded="panelOpen" aria-controls="game-settings" @click="panelOpen = !panelOpen">
          Settings
        </button>
      </nav>
    </div>
    <section v-if="panelOpen" id="game-settings" class="settings" aria-label="Game settings">
      <div class="settings-main">
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
    </section>
    <footer class="credits">
      <span>Original game © 1992 Westwood Studios</span>
      <a href="https://github.com/yanakulov/kyraweb" target="_blank" rel="noopener noreferrer">Web remake by Yan Akulov</a>
    </footer>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { mapPointerToCanvas, startGame } from "./engine/gameplay/game";
import { LOGICAL_WIDTH } from "./engine/core/constants";
import { buildIntroSteps, playIntro, type IntroPlayback } from "./engine/intro";
import { gemCutScene } from "./engine/scenes/gemCut";
import SubtitleOverlay from "./components/SubtitleOverlay.vue";
const appRef = ref<HTMLElement | null>(null);
const gameError = ref("");
const fullscreenAvailable = ref(false);
const isFullscreen = ref(false);
const canvasRef = ref<HTMLCanvasElement | null>(null);
let game: Awaited<ReturnType<typeof startGame>> | null = null;
const showMask = ref(false);
const showLayerInfo = ref(false);
const maskOpacity = ref(0.35);
const walkSpeed = ref<"slowest" | "slow" | "fast" | "fastest">("fast");
const animStepInterval = ref(1);
const introActive = ref(true);
let intro: IntroPlayback | null = null;
const panelOpen = ref(false);
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
const subtitleVisible = computed(() => introActive.value && subtitleLines.value.length > 0);
const subtitleScale = ref(1);


const config = {
  scene: gemCutScene
};

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
  introRunId += 1;
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
  subtitleLines.value = [];
  const runId = introRunId;
  const steps = introSteps.slice(startIndex);
  intro = playIntro(canvasRef.value, steps, {
    renderSubtitlesOnCanvas: false,
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
  const startedGame = await startGame(canvasRef.value, config);
  if (runId !== introRunId) {
    startedGame.stop();
    return;
  }
  game = startedGame;
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
  if (introPanelVisible.value) return "Your journey begins here.";
  return introActive.value ? "Click or tap the scene to skip the intro." : "Click or tap to walk, pick up and place items.";
});

async function launchIntro(startIndex: number, autoStartGame: boolean) {
  gameError.value = "";
  try {
    await startIntro(startIndex, autoStartGame);
  } catch (error) {
    console.error("Failed to start game", error);
    gameError.value = "The game could not load. Please try again.";
  }
}

function openMenu() {
  panelOpen.value = false;
  void launchIntro(introSteps.findIndex(step => step.id === "kallak_writing"), true);
}

function replayIntro() {
  panelOpen.value = false;
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
  if (introActive.value) {
    if (!introPanelVisible.value) {
      intro?.skip();
    }
    return;
  }
  if (!canvasRef.value || !game) return;
  const point = mapPointerToCanvas(canvasRef.value, event.clientX, event.clientY);
  game.setPointer(point);
  const used = game.handleClick(point);
  if (!used) {
    game.setTarget(point);
  }
}

function handleMove(event: MouseEvent) {
  if (introActive.value) return;
  if (!canvasRef.value || !game) return;
  const point = mapPointerToCanvas(canvasRef.value, event.clientX, event.clientY);
  game.setPointer(point);
}

function handleLeave() {
  if (introActive.value) return;
  if (!game) return;
  game.setPointer(null);
}

onMounted(() => {
  fullscreenAvailable.value = document.fullscreenEnabled;
  document.addEventListener("fullscreenchange", updateFullscreen);
  void boot();
  subtitleResizeObserver = new ResizeObserver(updateSubtitleScale);
  if (canvasRef.value) subtitleResizeObserver.observe(canvasRef.value);
  window.addEventListener("resize", updateSubtitleScale);
});

onBeforeUnmount(() => {
  introRunId++;
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
</script>
