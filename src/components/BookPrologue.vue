<template>
  <section ref="page" class="book-prologue" role="dialog" aria-modal="true" :aria-label="pageLabel" tabindex="-1" @keydown.esc="closeAudio">
    <p v-if="showStory && !audioOpen" class="prologue-kicker">{{ locale === 'ru' ? 'Из летописей Кирандии' : 'From the chronicles of Kyrandia' }}</p>
    <h2>{{ audioOpen || !showStory ? pageLabel : chapter.title }}</h2>
    <div v-if="audioOpen" class="prologue-audio"><slot name="audio" /></div>
    <div v-else-if="showStory" class="prologue-story"><p class="sr-only">{{ chapter.text }}</p><p aria-hidden="true"><span v-if="letters" class="opening-word"><span class="initial">{{ revealedText.slice(0, 1) }}</span>{{ revealedText.slice(1, firstWordLength) }}</span>{{ revealedText.slice(firstWordLength) }}<span v-if="letters < chapter.text.length" class="ink-mark">✦</span></p></div>
    <nav v-if="showStory && !audioOpen" :aria-label="locale === 'ru' ? 'Страницы пролога' : 'Prologue pages'">
      <button v-if="index" type="button" :disabled="!ready" @click="turnPage(-1)" :aria-label="locale === 'ru' ? 'Предыдущая страница' : 'Previous page'">‹</button>
      <span>{{ ['I', 'II', 'III', 'IV'][index] }}</span>
      <button class="prologue-next" type="button" :disabled="!ready" @click="advance">{{ nextLabel }}</button>
    </nav>
    <div class="prologue-actions">
      <button v-if="$slots.audio" ref="audioButton" type="button" :aria-expanded="audioOpen" :disabled="!ready" @click="audioOpen = !audioOpen">{{ t(audioOpen ? 'Back to book' : 'Sound settings') }}</button>
      <button type="button" class="prologue-skip" :disabled="!ready" @click="$emit('continue')">{{ returning ? returnLabel : (locale === 'ru' ? 'Перейти к легенде' : 'Enter the legend') }}</button>
    </div>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { locale, t } from '../i18n';
import { prologue } from './prologue';
const props = withDefaults(defineProps<{ ready: boolean; returning?: boolean; showStory?: boolean }>(), { returning: false, showStory: true });
const emit = defineEmits<{ continue: []; pageTurn: [] }>();
const index = ref(0), letters = ref(0), page = ref<HTMLElement | null>(null);
const audioOpen = ref(false), audioButton = ref<HTMLButtonElement | null>(null);
const pageLabel = computed(() => audioOpen.value ? t('Sound settings') : !props.showStory ? t('Book One') : locale.value === 'ru' ? 'Пролог' : 'Prologue');
function closeAudio(event: KeyboardEvent) {
  if (!audioOpen.value || event.defaultPrevented) return;
  event.stopPropagation(); audioOpen.value = false; audioButton.value?.focus();
}
const chapter = computed(() => prologue[locale.value][index.value]);
const revealedText = computed(() => chapter.value.text.slice(0, letters.value));
const firstWordLength = computed(() => chapter.value.text.split(' ', 1)[0].length);
const returnLabel = computed(() => locale.value === 'ru' ? 'Вернуться к меню' : 'Return to Options');
const nextLabel = computed(() => letters.value < chapter.value.text.length ? (locale.value === 'ru' ? 'Проявить текст' : 'Reveal the words') : index.value < 3 ? (locale.value === 'ru' ? 'Листать дальше' : 'Turn the page') : props.returning ? returnLabel.value : (locale.value === 'ru' ? 'Начать легенду' : 'Begin the legend'));
const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
let frame = 0;
async function write() {
  cancelAnimationFrame(frame); letters.value = 0;
  if (!props.ready || !props.showStory) return;
  await nextTick(); page.value?.focus({ preventScroll: true });
  if (preference.matches) { letters.value = chapter.value.text.length; return; }
  let previous = performance.now(), elapsed = 0;
  const tick = (now: number) => {
    if (!document.hidden) elapsed += Math.min(80, now - previous);
    previous = now; letters.value = Math.min(chapter.value.text.length, Math.floor(elapsed / 24));
    if (letters.value < chapter.value.text.length) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}
function advance() {
  if (letters.value < chapter.value.text.length) { cancelAnimationFrame(frame); letters.value = chapter.value.text.length; }
  else if (index.value < 3) turnPage(1);
  else emit('continue');
}
function turnPage(direction: number) {
  index.value += direction;
  emit('pageTurn');
}
watch([chapter, () => props.ready], write, { immediate: true });
onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>
<style scoped>
.book-prologue{height:100%;box-sizing:border-box;padding:16px;display:flex;flex-direction:column;color:#39220e;font:17px/1.3 Georgia,'Times New Roman',serif;outline:none;text-shadow:0 1px #efd6a122}
.prologue-kicker{text-align:center;letter-spacing:.07em;font-size:11px;font-variant:small-caps;margin:0 0 12px}
h2{font:32px/1.1 Germanica,Georgia,serif;text-align:center;margin:0 0 18px;padding-bottom:12px;border-bottom:1px solid #70492360}
.prologue-story{flex:1;min-height:0;overflow:auto;scrollbar-width:thin;scrollbar-color:#79552d transparent;font:22px/1.1 Germanica,Georgia,serif}.prologue-story p{margin:0}.opening-word{white-space:nowrap}.initial{font-size:1.65em;line-height:.85;color:#92261e}.ink-mark{color:#846431;font:11px Georgia,serif;margin-left:3px}
.prologue-audio{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:#79552d transparent;color-scheme:light;padding:0 4px}.prologue-actions{display:flex;justify-content:center;flex-wrap:wrap;gap:0 10px;margin-top:auto}
nav{display:flex;align-items:center;gap:10px;margin-top:14px;border-top:1px solid #70492360}button{color:inherit;border:0;background:transparent;min-height:44px;padding:7px 8px;font:inherit;cursor:inherit}nav>span{font-size:13px;opacity:.7}nav>button:first-child:not(.prologue-next){font-size:28px}.prologue-next{flex:1;font-variant:small-caps;text-align:right}.prologue-actions button{font-size:12px;text-decoration:underline;text-underline-offset:4px;opacity:.75;min-height:36px}button:hover{color:#754718}button:active{transform:translateY(1px)}button{transition:color .15s,transform .15s}button:focus-visible{outline:1px solid #79552d;outline-offset:-2px}
@media(prefers-reduced-motion:reduce){button{transition:none}}
</style>
