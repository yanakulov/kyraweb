<template>
  <section ref="page" class="book-prologue" role="dialog" aria-modal="true" :aria-label="locale === 'ru' ? 'Пролог' : 'Prologue'" tabindex="-1">
    <p class="prologue-kicker">{{ locale === 'ru' ? 'Из летописей Кирандии' : 'From the chronicles of Kyrandia' }}</p>
    <h2>{{ chapter.title }}</h2>
    <div class="prologue-story"><p class="sr-only">{{ chapter.text }}</p><p aria-hidden="true">{{ chapter.text.slice(0, letters) }}<span v-if="letters < chapter.text.length" class="ink-mark">✦</span></p></div>
    <nav :aria-label="locale === 'ru' ? 'Страницы пролога' : 'Prologue pages'">
      <button v-if="index" type="button" :disabled="!ready" @click="index--" :aria-label="locale === 'ru' ? 'Предыдущая страница' : 'Previous page'">‹</button>
      <span>{{ ['I', 'II', 'III', 'IV'][index] }}</span>
      <button class="prologue-next" type="button" :disabled="!ready" @click="advance">{{ nextLabel }}</button>
    </nav>
    <button type="button" class="prologue-skip" :disabled="!ready" @click="$emit('continue')">{{ returning ? returnLabel : (locale === 'ru' ? 'Перейти к легенде' : 'Enter the legend') }}</button>
  </section>
</template>
<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { locale } from '../i18n';
import { prologue } from './prologue';
const props = withDefaults(defineProps<{ ready: boolean; returning?: boolean }>(), { returning: false });
const emit = defineEmits<{ continue: [] }>();
const index = ref(0), letters = ref(0), page = ref<HTMLElement | null>(null);
const chapter = computed(() => prologue[locale.value][index.value]);
const returnLabel = computed(() => locale.value === 'ru' ? 'Вернуться к меню' : 'Return to Options');
const nextLabel = computed(() => letters.value < chapter.value.text.length ? (locale.value === 'ru' ? 'Проявить текст' : 'Reveal the words') : index.value < 3 ? (locale.value === 'ru' ? 'Листать дальше' : 'Turn the page') : props.returning ? returnLabel.value : (locale.value === 'ru' ? 'Начать легенду' : 'Begin the legend'));
const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
let frame = 0;
async function write() {
  cancelAnimationFrame(frame); letters.value = 0;
  if (!props.ready) return;
  await nextTick(); page.value?.focus();
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
  else if (index.value < 3) index.value++;
  else emit('continue');
}
watch([chapter, () => props.ready], write, { immediate: true });
onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>
<style scoped>
.book-prologue{height:100%;box-sizing:border-box;padding:16px;display:flex;flex-direction:column;color:#39220e;font:17px/1.65 Georgia,'Times New Roman',serif;outline:none;text-shadow:0 1px #efd6a122}
.prologue-kicker{text-align:center;letter-spacing:.07em;font-size:11px;font-variant:small-caps;margin:0 0 12px}
h2{font:small-caps 26px/1.15 Georgia,serif;text-align:center;margin:0 0 18px;padding-bottom:16px;border-bottom:1px solid #70492360}
.prologue-story{flex:1;min-height:0;overflow:auto;scrollbar-width:thin;scrollbar-color:#79552d transparent}.prologue-story p{margin:0}.prologue-story p[aria-hidden]::first-letter{float:left;font-size:46px;line-height:.9;margin:6px 5px 0 0;color:#633514}.ink-mark{color:#846431;font-size:11px;margin-left:3px}
nav{display:flex;align-items:center;gap:10px;margin-top:14px;border-top:1px solid #70492360}button{color:inherit;border:0;background:transparent;min-height:44px;padding:7px 8px;font:inherit;cursor:inherit}nav>span{font-size:13px;opacity:.7}nav>button:first-child:not(.prologue-next){font-size:28px}.prologue-next{flex:1;font-variant:small-caps;text-align:right}.prologue-skip{font-size:12px;text-decoration:underline;text-underline-offset:4px;opacity:.75;min-height:36px}button:hover{color:#754718}button:active{transform:translateY(1px)}button{transition:color .15s,transform .15s}button:focus-visible{outline:1px solid #79552d;outline-offset:-2px}
@media(prefers-reduced-motion:reduce){button{transition:none}}
</style>
