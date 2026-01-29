<template>
  <div class="app">
    <div class="layout">
      <div class="stage">
        <canvas
          ref="canvasRef"
          @click="handleClick"
          @mousemove="handleMove"
          @mouseleave="handleLeave"
        ></canvas>
      </div>
      <aside class="debug">
        <div class="debug-title">Debug</div>
        <label class="debug-row">
          <input type="checkbox" v-model="showMask" />
          Show mask
        </label>
        <label class="debug-row">
          <input type="checkbox" v-model="showLayerInfo" />
          Show layer info
        </label>
        <label class="debug-row">
          Walk speed
          <select v-model="walkSpeed">
            <option value="slowest">Slowest</option>
            <option value="slow">Slow</option>
            <option value="fast">Fast</option>
            <option value="fastest">Fastest</option>
          </select>
        </label>
        <label class="debug-row">
          Walk anim (steps)
          <input type="range" min="1" max="8" step="1" v-model.number="animStepInterval" />
          <span class="debug-value">{{ animStepInterval }}</span>
        </label>
        <label class="debug-row">
          Opacity
          <input type="range" min="0" max="1" step="0.05" v-model.number="maskOpacity" />
          <span class="debug-value">{{ maskOpacity.toFixed(2) }}</span>
        </label>
      </aside>
    </div>
    <div class="hud">
      <div>
        <div><strong>Gem Cut</strong> — canvas 320x200, Brandon sheet 320x200.</div>
        <div>Click to move. Walk mask from GEMCUT.MSC.</div>
      </div>
      <div class="badge">Canvas 2D</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { mapPointerToCanvas, startGame } from "./engine/game";
import { gemCutScene } from "./engine/scenes/gemCut";

const canvasRef = ref<HTMLCanvasElement | null>(null);
let game: Awaited<ReturnType<typeof startGame>> | null = null;
const showMask = ref(false);
const showLayerInfo = ref(false);
const maskOpacity = ref(0.35);
const walkSpeed = ref<"slowest" | "slow" | "fast" | "fastest">("fast");
const animStepInterval = ref(1);

const config = {
  scene: gemCutScene
};

async function boot() {
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

function handleClick(event: MouseEvent) {
  if (!canvasRef.value || !game) return;
  const point = mapPointerToCanvas(canvasRef.value, event.clientX, event.clientY);
  const used = game.handleClick(point);
  if (!used) {
    game.setTarget(point);
  }
}

function handleMove(event: MouseEvent) {
  if (!canvasRef.value || !game) return;
  const point = mapPointerToCanvas(canvasRef.value, event.clientX, event.clientY);
  game.setPointer(point);
}

function handleLeave() {
  if (!game) return;
  game.setPointer(null);
}

onMounted(() => {
  void boot();
});

onBeforeUnmount(() => {
  game?.stop();
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
</script>
