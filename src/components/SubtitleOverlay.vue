<template>
  <div v-if="visible" class="subtitle-layer" :style="layerStyle">
    <div
      v-for="(line, index) in lines"
      :key="index"
      class="subtitle-line"
      :style="lineStyle(line)"
    >
      {{ line.text }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { IntroSubtitle } from "../engine/intro/types";

const props = withDefaults(
  defineProps<{
    lines: IntroSubtitle[];
    scale: number;
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
  pointerEvents: "none"
}));

const lineStyle = (line: IntroSubtitle) => {
  const align = line.align ?? "center";
  const scale = props.scale || 1;
  const x = line.x ?? 160;
  const y = line.y ?? 180;
  const maxWidth = line.maxWidth ?? 300;
  const fontSize = Math.max(10, Math.round(12 * scale));
  const lineHeight = Math.max(12, Math.round(14 * scale));
  let translateX = "-50%";
  if (align === "left") translateX = "0%";
  if (align === "right") translateX = "-100%";
  const translateY = line.type === "talk" ? "-100%" : "0%";
  return {
    left: `${Math.round(x * scale)}px`,
    top: `${Math.round(y * scale)}px`,
    width: `${Math.round(maxWidth * scale)}px`,
    transform: `translate(${translateX}, ${translateY})`,
    textAlign: align,
    color: line.color ?? "#f2f2f2",
    fontSize: `${fontSize}px`,
    lineHeight: `${lineHeight}px`
  } as const;
};
</script>

<style scoped>
.subtitle-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 4;
}

.subtitle-line {
  position: absolute;
  font-family: "Kyrandia", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  white-space: normal;
  text-rendering: geometricPrecision;
  -webkit-font-smoothing: none;
  image-rendering: pixelated;
}
</style>
