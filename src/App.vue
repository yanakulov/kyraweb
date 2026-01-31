<template>
  <div class="app">
    <div class="layout">
      <div class="stage">
        <SubtitleOverlay
          :lines="subtitleLines"
          :scale="subtitleScale"
          :alpha="subtitleAlpha"
          :visible="subtitleVisible"
        />
        <canvas
          ref="canvasRef"
          @click="handleClick"
          @mousemove="handleMove"
          @mouseleave="handleLeave"
        ></canvas>
        <div
          v-if="introPanelVisible"
          ref="introPanelRef"
          class="intro-panel"
          :class="{ hover: introPanelHover, closing: introPanelClosing }"
          :style="{ opacity: introPanelOpacity }"
          @mousemove="handleIntroPanelMove"
          @mouseleave="introPanelHover = false"
          @click="handleIntroPanelClick"
        ></div>
        <img
          v-if="introPanelVisible"
          class="intro-logo"
          :class="{ closing: introPanelClosing }"
          :style="{ opacity: introLogoOpacity }"
          src="/assets/interface/HUD/game-logo.png"
          alt="Kyrandia"
        />
        <div
          v-if="introPanelVisible"
          class="intro-logo-text"
          :class="{ closing: introPanelClosing }"
          :style="{ opacity: introLogoOpacity }"
        >
          <div>Copyright (c) 1992 Westwood Studios</div>
          <div>Web remade by Yan Akulov 2026</div>
        </div>
        <button class="panel-toggle" type="button" @click="panelOpen = !panelOpen">
          {{ panelOpen ? "Hide debug" : "Show debug" }}
        </button>
        <aside class="debug-panel" :class="{ open: panelOpen }">
          <div class="debug-header">
            <div class="debug-title">Debug</div>
            <div class="debug-sub">Mode: {{ introActive ? "Intro" : "GemCut" }}</div>
          </div>
          <label class="debug-row">
            <input type="checkbox" v-model="showMask" />
            <span>Show mask</span>
          </label>
          <label class="debug-row">
            <input type="checkbox" v-model="showLayerInfo" />
            <span>Show layer info</span>
          </label>
          <label class="debug-row">
            <span>Intro scene</span>
            <select v-model="introScene">
              <option v-for="step in introSteps" :key="step.id" :value="step.id">
                {{ step.id }}
              </option>
            </select>
          </label>
          <label class="debug-row">
            <span>Walk speed</span>
            <select v-model="walkSpeed">
              <option value="slowest">Slowest</option>
              <option value="slow">Slow</option>
              <option value="fast">Fast</option>
              <option value="fastest">Fastest</option>
            </select>
          </label>
          <label class="debug-row">
            <span>Walk anim (steps)</span>
            <input type="range" min="1" max="8" step="1" v-model.number="animStepInterval" />
            <span class="debug-value">{{ animStepInterval }}</span>
          </label>
          <label class="debug-row">
            <span>Opacity</span>
            <input type="range" min="0" max="1" step="0.05" v-model.number="maskOpacity" />
            <span class="debug-value">{{ maskOpacity.toFixed(2) }}</span>
          </label>
        </aside>
      </div>
    </div>
    <div class="hud">
      <div>
        <div class="hud-title">
          <strong>{{ introActive ? "Intro" : "Gem Cut" }}</strong>
        </div>
        <div class="hud-body" v-if="introActive">
          Westwood & Kyrandia logos, shoreline, trees, Kallak writing, Malk-Kalak.
        </div>
        <div class="hud-body" v-else>
          Click to move. Walk mask from GEMCUT.MSC.
        </div>
      </div>
      <div class="badge">Canvas 2D</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { mapPointerToCanvas, startGame } from "./engine/gameplay/game";
import { LOGICAL_WIDTH } from "./engine/core/constants";
import { buildIntroSteps, playIntro, type IntroPlayback } from "./engine/intro";
import { gemCutScene } from "./engine/scenes/gemCut";
import SubtitleOverlay from "./components/SubtitleOverlay.vue";
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
const currentIntroStep = ref(introSteps[0]?.id ?? "");
const introPanelRef = ref<HTMLDivElement | null>(null);
const introPanelHover = ref(false);
const introPanelClosing = ref(false);
const introPanelDismissed = ref(false);
const introPanelOpacity = ref(1);
const introLogoOpacity = ref(1);
const showIntroPanel = computed(
  () =>
    introActive.value && currentIntroStep.value === "kallak_writing" && !introPanelDismissed.value
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
  await startIntro(0, true);
}

function updateSubtitleScale() {
  if (!canvasRef.value) return;
  const rect = canvasRef.value.getBoundingClientRect();
  if (rect.width > 0) {
    const raw = rect.width / LOGICAL_WIDTH;
    const snapped = Math.max(1, Math.round(raw));
    subtitleScale.value = Math.abs(raw - snapped) < 0.15 ? snapped : raw;
  }
}

async function startIntro(startIndex: number, autoStartGame: boolean) {
  if (!canvasRef.value) return;
  intro?.stop();
  if (game) {
    game.stop();
    game = null;
  }
  introActive.value = true;
  introPanelHover.value = false;
  introPanelDismissed.value = false;
  introPanelOpacity.value = 1;
  introLogoOpacity.value = 1;
  introRunId += 1;
  const runId = introRunId;
  const steps = introSteps.slice(startIndex);
  intro = playIntro(canvasRef.value, steps, {
    renderSubtitlesOnCanvas: false,
    onStepChange: (id) => {
      currentIntroStep.value = id;
      if (id === "kallak_writing") {
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
  game = await startGame(canvasRef.value, config);
  game.setDebug({
    showMask: showMask.value,
    maskOpacity: maskOpacity.value,
    showLayerInfo: showLayerInfo.value
  });
  game.setWalkSpeed(walkSpeed.value);
  game.setAnimStepInterval(animStepInterval.value);
}

function isIntroPanelHotspot(clientX: number, clientY: number) {
  const el = introPanelRef.value;
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const relX = clientX - rect.left;
  const relY = clientY - rect.top;
  if (relX < 0 || relY < 0 || relX > rect.width || relY > rect.height) return false;
  const hotW = rect.width * 0.4;
  const hotH = rect.height * 0.8;
  const startX = (rect.width - hotW) / 2;
  const startY = (rect.height - hotH) / 2;
  return relX >= startX && relX <= startX + hotW && relY >= startY && relY <= startY + hotH;
}

function handleIntroPanelMove(event: MouseEvent) {
  introPanelHover.value = isIntroPanelHotspot(event.clientX, event.clientY);
}

function handleIntroPanelClick(event: MouseEvent) {
  if (!showIntroPanel.value) return;
  if (!isIntroPanelHotspot(event.clientX, event.clientY)) return;
  introPanelHover.value = false;
  introPanelClosing.value = true;
  fadeOutIntroPanel(4000);
}

function fadeOutIntroPanel(durationMs: number) {
  const start = performance.now();
  const startPanel = introPanelOpacity.value;
  const startLogo = introLogoOpacity.value;
  const steps = 32;
  const step = (now: number) => {
    const t = Math.min(1, (now - start) / durationMs);
    const quantized = Math.floor(t * steps) / steps;
    const next = Math.max(0, 1 - quantized);
    introPanelOpacity.value = Math.max(0, startPanel * next);
    introLogoOpacity.value = Math.max(0, startLogo * next);
    if (t < 1) {
      requestAnimationFrame(step);
      return;
    }
    introPanelClosing.value = false;
    introPanelDismissed.value = true;
    intro?.exitDemoLoop();
  };
  requestAnimationFrame(step);
}

function handleClick(event: MouseEvent) {
  if (introActive.value) {
    if (!showIntroPanel.value) {
      intro?.skip();
    }
    return;
  }
  if (!canvasRef.value || !game) return;
  const point = mapPointerToCanvas(canvasRef.value, event.clientX, event.clientY);
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
  void boot();
  window.addEventListener("resize", updateSubtitleScale);
});

onBeforeUnmount(() => {
  intro?.stop();
  game?.stop();
  window.removeEventListener("resize", updateSubtitleScale);
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
  void startIntro(index, false);
});
</script>
