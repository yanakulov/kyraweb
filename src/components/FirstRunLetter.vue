<template>
  <dialog ref="letter" class="setup-letter" aria-labelledby="setup-title" @cancel.prevent>
    <header class="setup-heading">
      <span class="setup-seal" aria-hidden="true">✧</span>
      <p>{{ t('Fables & Fiends · Book One') }} <span>· {{ step === 1 ? 'I' : 'II' }} / II</span></p>
      <h1 id="setup-title" ref="heading" tabindex="-1">{{ t(step === 1 ? 'Choose your controls' : 'Sound settings') }}</h1>
    </header>
    <div class="setup-body">
      <fieldset v-if="step === 1" class="setup-modes">
        <legend>{{ t('Choose how you want to explore Kyrandia. You can change this later in the book.') }}</legend>
        <label v-for="mode in modes" :key="mode" class="setup-choice">
          <input v-model="selected" class="sr-only" type="radio" name="control-mode" :value="mode" />
          <img :src="withBase(`assets/interface/controls-${mode}.webp`)" width="320" :height="mode === 'modern' ? 136 : 200" alt="" />
          <strong>{{ t(mode === 'modern' ? 'Modern' : 'Classic') }}</strong>
          <span>{{ t(mode === 'modern' ? 'Full scene with a circular inventory.' : 'Original inventory bar beneath the scene.') }}</span>
        </label>
      </fieldset>
      <MusicSettings v-else :player="player" :state="state" basic />
    </div>
    <footer class="setup-actions">
      <button v-if="step === 2" type="button" @click="go(1)">{{ t('Previous page') }}</button>
      <button v-if="step === 1" class="setup-next" type="button" @click="go(2)">{{ t('Next page') }}</button>
      <button v-else class="setup-next" type="button" :disabled="state.busy || state.renderer === 'mt32' && !state.available" @click="$emit('finish', selected)">{{ t('Continue') }}</button>
    </footer>
  </dialog>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';
import { t } from '../i18n';
import { withBase } from '../engine/core/assets';
import type { ControlMode } from '../engine/core/types';
import type { MusicPlayer, MusicState } from '../engine/audio/music';
import MusicSettings from './MusicSettings.vue';

const props = defineProps<{ mode: ControlMode; player: MusicPlayer; state: MusicState }>();
defineEmits<{ finish: [mode: ControlMode] }>();
const modes: ControlMode[] = ['modern', 'classic'];
const selected = ref(props.mode), step = ref<1 | 2>(1);
const letter = ref<HTMLDialogElement>(), heading = ref<HTMLHeadingElement>();
onMounted(() => { letter.value?.showModal(); heading.value?.focus(); });
async function go(value: 1 | 2) {
  step.value = value;
  await nextTick();
  letter.value?.querySelector('.setup-body')?.scrollTo(0, 0);
  heading.value?.focus();
}
</script>

<style scoped>
.setup-letter {
  width: min(680px, calc(100% - 24px)); max-height: calc(100dvh - 28px); padding: clamp(14px, 4vw, 30px);
  color: #37210e; color-scheme: light; font: 16px/1.4 Georgia, serif;
  border: 5px double #987544; box-shadow: 0 18px 60px #000b, inset 0 0 35px #79522270;
  background: radial-gradient(ellipse at 48% 20%, #ecd9ab, transparent 70%),
    repeating-linear-gradient(0deg, #67491809 0 1px, transparent 1px 3px), #d4b47d;
}
.setup-letter[open] { display: flex; flex-direction: column; }
.setup-letter::backdrop { background: #100a0ac2; }
.setup-letter::after { content: ''; position: absolute; top: 0; right: 0; width: 22px; height: 22px;
  background: linear-gradient(45deg, transparent 48%, #a28250 50%, #ebd3a1 55%, #c19b62 100%); pointer-events: none; }
.setup-heading { text-align: center; border-bottom: 1px solid #917047; padding-bottom: 9px; }
.setup-heading p { margin: 4px 0 2px; font-size: 12px; font-variant: small-caps; letter-spacing: .08em; }
.setup-heading h1 { font: small-caps clamp(25px, 5vw, 37px)/1.08 Georgia, serif; margin: 4px 0; outline: none; }
.setup-seal { display: inline-grid; place-items: center; width: 33px; height: 33px; border-radius: 50%;
  border: 3px double #a56b4c; color: #e7c083; background: #762c22; font-size: 21px; box-shadow: 0 2px 3px #4c29196b; }
.setup-body { min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 12px 3px; }
.setup-modes { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding: 0; margin: 0; border: 0; min-width: 0; }
.setup-modes legend { padding: 0 0 12px; text-align: center; }
.setup-choice { min-width: 0; padding: 6px; border: 2px solid #a48454; display: flex; flex-direction: column; gap: 4px; cursor: pointer; }
.setup-choice:has(:checked) { border-color: #68512d; background: #7f5a2324; box-shadow: inset 0 0 0 1px #f1d8a3; }
.setup-choice:has(:focus-visible) { outline: 2px solid #632d20; outline-offset: 1px; }
.setup-choice img { width: 100%; height: auto; aspect-ratio: 8 / 5; object-fit: contain; background: #151314; image-rendering: pixelated; }
.setup-choice strong { font-variant: small-caps; font-size: 20px; }
.setup-choice span { font-size: 13px; line-height: 1.25; }
.setup-actions { display: flex; justify-content: end; gap: 10px; border-top: 1px solid #917047; padding-top: 10px; }
.setup-actions button { min-height: 44px; padding: 4px 14px; color: #512e17; border: 1px solid #8f6a3a; background: transparent; font-variant: small-caps; }
.setup-actions .setup-next { background: #6c3226; color: #fff1cf; }
.setup-letter :deep(:focus-visible) { outline: 2px solid #6c3226; outline-offset: 2px; }
.setup-heading h1:focus-visible { outline: none; }
@media (max-width: 400px) {
  .setup-choice strong { font-size: 15px; }
  .setup-heading p { font-size: 11px; }
}
@media (max-width: 340px) { .setup-modes { grid-template-columns: 1fr; } }
</style>
