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
  pointerEvents: "none" as const,
  transform: `scale(${props.scale})`,
  transformOrigin: "top left"
}));

const lineStyle = (line: IntroSubtitle) => {
  const align = line.align ?? "center";
  const x = line.x ?? 160;
  const maxWidth = Math.min(300, line.maxWidth ?? 300);
  const left = Math.max(10, Math.min(310 - maxWidth, x - (align === "left" ? 0 : align === "right" ? maxWidth : maxWidth / 2)));
  return {
    left: `${left}px`,
    top: line.type === "talk" ? undefined : `${line.y}px`,
    bottom: line.type === "talk" ? `${200 - line.y}px` : undefined,
    maxHeight: `${line.type === "talk" ? line.y : 200 - line.y}px`,
    width: `${maxWidth}px`,
    textAlign: align,
    color: line.color ?? "#f2f2f2",
    fontSize: "8px",
    lineHeight: "10px"
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
  font-family: "Kyrandia", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  white-space: normal;
  overflow-wrap: anywhere;
  overflow: hidden;
  text-rendering: geometricPrecision;
  -webkit-font-smoothing: none;
  image-rendering: pixelated;
}
</style>
