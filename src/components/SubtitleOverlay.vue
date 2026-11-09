<template>
  <div v-if="visible" class="subtitle-layer" :style="layerStyle">
    <div
      v-for="(line, index) in lines"
      :key="index"
      class="subtitle-line"
      :style="lineStyle(line)"
    >
      {{ translateGameText(line.text) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { IntroSubtitle } from "../engine/intro/types";
import { translateGameText } from '../i18n';
import { LOGICAL_WIDTH } from '../engine/core/constants';

const props = withDefaults(
  defineProps<{
    lines: IntroSubtitle[];
    scale: number;
    scaleY?: number;
    bounds: { x: number; y: number; w: number; h: number };
    alpha: number;
    visible: boolean;
  }>(),
  {
    lines: () => [],
    scale: 1,
    alpha: 1,
    visible: true
  }
);

const layerStyle = computed(() => ({
  opacity: props.alpha,
  pointerEvents: "none" as const,
  transform: `scale(${props.scale}, ${props.scaleY ?? props.scale})`,
  transformOrigin: "top left"
}));

const lineStyle = (line: IntroSubtitle) => {
  const { x, y, w, h } = props.bounds;
  const margin = 5;
  const align = line.align ?? "center";
  const anchorX = line.x ?? LOGICAL_WIDTH / 2;
  const offsetX = align === "left" || align === "start" ? 0 : align === "right" || align === "end" ? 100 : 50;
  const offsetY = line.type === "talk" ? 100 : 0;
  // Translate percentages use the actual wrapped box, including any change in translation length.
  const left = `clamp(${x + margin}px, ${anchorX}px - ${offsetX}%, ${x + w - margin}px - 100%)`;
  const top = `clamp(${y + margin}px, ${line.y}px - ${offsetY}%, ${y + h - margin}px - 100%)`;
  return {
    transform: `translate(${left}, ${top})`,
    maxWidth: `${Math.min(w - margin * 2, line.maxWidth ?? LOGICAL_WIDTH - 20)}px`,
    textAlign: align,
    color: line.color ?? "#f2f2f2"
  } as const;
};
</script>

<style scoped>
.subtitle-layer {
  position: absolute;
  inset: 0;
  width: 320px;
  height: 200px;
  z-index: 4;
}

.subtitle-line {
  position: absolute;
  left: 0;
  top: 0;
  width: max-content;
  font-family: "Kyrandia", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 8px;
  line-height: 10px;
  white-space: normal;
  overflow-wrap: anywhere;
  text-shadow: 0 1px 0 #130c0bba, 1px 1px 1px #130c0b8c;
  text-rendering: geometricPrecision;
  -webkit-font-smoothing: none;
  image-rendering: pixelated;
}
</style>
