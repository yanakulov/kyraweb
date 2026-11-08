<template>
  <section ref="menu" class="folio-menu" role="dialog" aria-modal="true" :aria-label="t('Game settings')" tabindex="-1" :aria-busy="busy" :lang="locale">
    <header>
      <button v-if="view !== 'main'" class="folio-back" type="button" @click="go('main')" :disabled="busy" :aria-label="t('Back to Options')">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8H3m5-5L3 8l5 5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>
      </button>
      <h2 ref="heading" tabindex="-1">{{ title }}</h2>
      <div class="folio-rule" aria-hidden="true"><span></span></div>
    </header>
    <div ref="content" class="folio-content">
      <fieldset :key="view" :disabled="busy" class="folio-leaf">
        <nav v-if="view === 'main'" class="folio-choices" :aria-label="t('Book options')">
          <template v-if="gameOver">
            <button v-if="canLoadAutosave" class="journey-choice" type="button" @click="$emit('load', AUTOSAVE_SLOT)"><span>{{ t('Continue from autosave') }}</span></button>
            <button :class="{ 'journey-choice': !canLoadAutosave }" type="button" @click="$emit('mainMenu')"><span>{{ t('Start a new journey') }}</span></button>
          </template>
          <button v-else-if="mainMenu" class="journey-choice" type="button" @click="$emit('startJourney')"><span>{{ t('Start Journey') }}</span></button>
          <template v-else>
            <button class="journey-choice" type="button" @click="$emit('resume')"><span>{{ t('Resume') }}</span></button>
            <button type="button" @click="go('save')" :disabled="!canSave"><span>{{ t('Save game') }}</span></button>
          </template>
          <button type="button" @click="go('load')" :disabled="!slots.some(slot => slot.savedAt || slot.error)"><span>{{ t('Load game') }}</span></button>
          <button type="button" @click="go('settings')"><span>{{ t('Settings') }}</span></button>
          <button type="button" @click="go('help')"><span>{{ t('How to play') }}</span></button>
        </nav>
        <template v-else-if="view === 'save' || view === 'load'">
          <p class="folio-note">{{ t(view === 'save' ? 'Keep your place in the story.' : 'Return to a saved chapter.') }}</p>
          <label v-if="view === 'save'" class="folio-field">{{ t('Chapter name') }}<input v-model="saveName" maxlength="48" :placeholder="t('My adventure')" /></label>
          <ol class="folio-saves">
            <li v-for="slot in shownSlots" :key="slot.index">
              <div class="folio-save-details"><img v-if="slot.thumbnail" :src="slot.thumbnail" alt="" /><div><strong>{{ t(slot.name || (slot.index === AUTOSAVE_SLOT ? 'Autosave' : `Chapter ${slot.index + 1}`)) }}</strong><small>{{ t(slot.error || (slot.savedAt ? slot.location || '' : 'Empty page')) }}</small><small v-if="slot.savedAt">{{ formatDate(slot.savedAt) }}</small></div></div>
              <template v-if="overwrite === slot.index"><p>{{ t('Replace this saved chapter?') }}</p><div class="folio-inline"><button type="button" @click="save(slot.index)">{{ t('Replace') }}</button><button type="button" @click="cancelOverwrite">{{ t('Keep it') }}</button></div></template>
              <button v-else-if="view === 'save'" type="button" :disabled="!canSave" @click="slot.savedAt || slot.error ? askOverwrite(slot.index) : save(slot.index)">{{ t('Save here') }}</button>
              <button v-else type="button" :disabled="!slot.savedAt || !!slot.error" @click="$emit('load', slot.index)">{{ t('Load chapter') }}</button>
            </li>
          </ol>
          <p class="folio-note">{{ t('Saved in this browser on this device.') }}</p>
        </template>
        <div v-else-if="view === 'settings'" class="folio-settings">
          <div class="folio-tabs" role="group" :aria-label="t('Settings')">
            <button type="button" :aria-pressed="settingsPage === 'game'" @click="settingsPage = 'game'">{{ t('Game') }}</button>
            <button type="button" :aria-pressed="settingsPage === 'audio'" @click="settingsPage = 'audio'">{{ t('Sound') }}</button>
          </div>
          <template v-if="settingsPage === 'game'">
            <div class="folio-settings-grid">
              <BookSelect id="book-language" :label="t('Language')" :model-value="locale" :options="languages" :disabled="busy" @update:model-value="setLocale" />
              <BookSelect id="book-speed" :label="t('Walk speed')" :model-value="walkSpeed" :options="speeds" :disabled="busy" @update:model-value="$emit('update:walkSpeed', $event as WalkSpeed)" />
              <BookSelect id="book-controls" :label="t('Controls')" :model-value="controlMode" :options="controls" :disabled="busy" @update:model-value="$emit('update:controlMode', $event as ControlMode)" />
            </div>
            <button v-if="fullscreenAvailable" type="button" @click="$emit('fullscreen')">{{ t(isFullscreen ? 'Exit full screen' : 'Full screen') }}</button>
            <div class="folio-inline folio-navigation"><button v-if="!mainMenu" type="button" @click="askLeave('menu')">{{ t('Main menu') }}</button><button type="button" @click="mainMenu ? $emit('replayIntro') : askLeave('intro')">{{ t('Replay intro') }}</button></div>
            <button type="button" @click="$emit('readPrologue')">{{ t('The story so far') }}</button>
            <div v-if="confirmAction" class="folio-confirm"><p>{{ t('Leave this adventure? Unsaved progress will be lost.') }}</p><div class="folio-inline"><button type="button" @click="leave">{{ t('Continue') }}</button><button type="button" @click="cancelLeave">{{ t('Stay here') }}</button></div></div>
            <p class="folio-credits">{{ t('Original tale © 1992 Westwood Studios') }}<br /><a href="https://github.com/yanakulov/kyraweb" target="_blank" rel="noopener noreferrer">{{ t('Reimagined by AkulaFlow · Yan Akulov') }}</a></p>
          </template>
          <MusicSettings v-else-if="musicPlayer && musicState" :player="musicPlayer" :state="musicState" />
        </div>
        <div v-else class="folio-help"><p><strong>{{ t('Explore.') }}</strong> {{ t('Click to walk. Move the cursor to an exit to reveal its arrow.') }}</p><p><strong>{{ t('Discover.') }}</strong> {{ t('Click people to talk or objects to take them. Choose an inventory item, then click where to use it.') }}</p><p><strong>{{ t('Touch.') }}</strong> {{ t('Swipe to guide the cursor. Tap to interact. During dialogue, tap to skip the current line.') }}</p><p v-if="controlMode === 'modern'">{{ t('Right-click or press I to open the inventory. On touch screens, press and hold. Menu opens the book.') }}</p><p v-else>{{ t('Options returns you to this book and pauses the adventure.') }}</p></div>
      </fieldset>
    </div>
    <p v-if="message" class="folio-message" role="status">{{ t(message) }}</p>
    <footer>{{ t('Fables & Fiends · Book One') }}</footer>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import BookSelect from './BookSelect.vue';
import MusicSettings from './MusicSettings.vue';
import type { MusicPlayer, MusicState } from '../engine/audio/music';
import { AUTOSAVE_SLOT } from '../engine/gameplay/saveStorage';
import { locale, setLocale, t } from '../i18n';
import type { ControlMode } from '../engine/core/types';
type WalkSpeed = 'slowest' | 'slow' | 'fast' | 'fastest';
type View = 'main' | 'save' | 'load' | 'settings' | 'help';
const props = withDefaults(defineProps<{
  gameplay: boolean; canSave: boolean; busy: boolean; message: string; mainMenu?: boolean; gameOver?: boolean;
  slots: { index: number; name?: string; location?: string; savedAt?: string; thumbnail?: string; error?: string | null }[];
  walkSpeed: WalkSpeed; controlMode: ControlMode; fullscreenAvailable: boolean; isFullscreen: boolean;
  initialView?: 'main' | 'load';
  musicPlayer?: MusicPlayer; musicState?: MusicState;
}>(), { initialView: 'main', mainMenu: false });
const emit = defineEmits<{
  resume: []; save: [index: number, name: string]; load: [index: number]; startJourney: []; readPrologue: [];
  mainMenu: []; replayIntro: []; fullscreen: [];
  'update:walkSpeed': [value: WalkSpeed];
  'update:controlMode': [value: ControlMode];
}>();
const languages = [{ value: 'en', label: 'English' }, { value: 'ru', label: 'Русский' }];
const speeds = computed(() => ['slowest', 'slow', 'fast', 'fastest'].map((value, index) => ({ value, label: t(['Slowest', 'Slow', 'Fast', 'Fastest'][index]) })));
const controls = computed(() => [{ value: 'modern', label: t('Modern') }, { value: 'classic', label: t('Classic') }]);
const view = ref<View>(props.initialView), heading = ref<HTMLHeadingElement | null>(null);
const menu = ref<HTMLElement | null>(null);
const content = ref<HTMLElement | null>(null), settingsPage = ref<'game' | 'audio'>('game');
const saveName = ref(''), overwrite = ref<number | null>(null), confirmAction = ref<'menu' | 'intro' | null>(null);
const canLoadAutosave = computed(() => props.slots.some(slot => slot.index === AUTOSAVE_SLOT && slot.savedAt));
const shownSlots = computed(() => props.slots.filter(slot => slot.index !== AUTOSAVE_SLOT || view.value === 'load' && (slot.savedAt || slot.error)));
const title = computed(() => t(({ main: props.gameOver ? "It didn't happen that way!" : props.mainMenu ? 'The Legend of Kyrandia' : 'Options', save: 'Save your story', load: 'Saved chapters', settings: 'Settings', help: 'How to play' })[view.value]));
watch(settingsPage, () => {
  confirmAction.value = null;
  content.value?.scrollTo(0, 0);
});
async function go(next: View) {
  view.value = next;
  settingsPage.value = 'game';
  overwrite.value = null;
  confirmAction.value = null;
  await nextTick();
  content.value?.scrollTo(0, 0);
  heading.value?.focus({ preventScroll: true });
}
async function askOverwrite(index: number) { overwrite.value = index; await nextTick(); menu.value?.querySelector<HTMLButtonElement>('.folio-inline button')?.focus(); }
async function cancelOverwrite() { overwrite.value = null; await nextTick(); heading.value?.focus(); }
async function save(index: number) { overwrite.value = null; emit('save', index, saveName.value.trim() || t(`Chapter ${index + 1}`)); await nextTick(); heading.value?.focus(); }
async function askLeave(destination: 'menu' | 'intro') { confirmAction.value = destination; await nextTick(); menu.value?.querySelector<HTMLButtonElement>('.folio-confirm button')?.focus(); }
async function cancelLeave() { confirmAction.value = null; await nextTick(); heading.value?.focus(); }
function leave() { if (confirmAction.value === 'menu') emit('mainMenu'); else emit('replayIntro'); }
function formatDate(value: string) { return new Date(value).toLocaleString(locale.value === 'ru' ? 'ru-RU' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' }); }
</script>

<style scoped>
.folio-menu {
  --ink: #271408;
  --rule: #5f351864;
  --rubric: #5e241b;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 14px 18px;
  color: var(--ink);
  color-scheme: light;
  font: 16px/1.35 Georgia, "Times New Roman", serif;
  outline: none;
}
header {
  position: relative;
  flex: none;
  margin-bottom: 12px;
  padding: 0 36px;
  text-align: center;
}
h2 {
  margin: 0;
  color: var(--rubric);
  font: 30px/1.06 Germanica, Georgia, serif;
  text-wrap: balance;
  outline: none;
}
.folio-rule {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 9px;
}
.folio-rule::before, .folio-rule::after {
  content: "";
  height: 1px;
  flex: 1;
  background: var(--rule);
}
.folio-rule span {
  width: 5px;
  height: 5px;
  transform: rotate(45deg);
  background: var(--rubric);
}
.folio-content {
  min-height: 0;
  flex: 1;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-color: #74512b transparent;
  scrollbar-width: thin;
  padding-inline: 3px;
}
fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.folio-leaf { animation: ink-appear .2s ease-out; }
button, input { font: inherit; color: inherit; }
button {
  display: block;
  width: 100%;
  min-height: 44px;
  padding: 7px 10px;
  border: 0;
  border-bottom: 1px solid var(--rule);
  background: transparent;
  cursor: inherit;
  transition: color .16s, background-color .16s;
}
button:hover:not(:disabled) { background: #6c360e18; color: var(--rubric); }
button:disabled { opacity: .52; }
button:focus-visible, input:focus-visible, a:focus-visible { outline: 2px solid #682e1c; outline-offset: -2px; }
.folio-choices { display: grid; }
.folio-choices button {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-inline: 12px;
  font-size: 17px;
  text-align: left;
}
.folio-choices button::before {
  content: "";
  flex: none;
  width: 6px;
  height: 6px;
  transform: rotate(45deg);
  border: 1px solid #835d2f;
}
.folio-choices .journey-choice {
  min-height: 49px;
  margin-bottom: 8px;
  border: 1px solid #7e5733;
  background: #54271e;
  color: #fff0cf;
  font-weight: bold;
  box-shadow: inset 0 0 0 2px #b68a5961;
}
.folio-choices .journey-choice::before { background: #c49858; border-color: #d9b784; }
.folio-choices .journey-choice:hover:not(:disabled) { background: #68382a; color: #fff7e1; }
.folio-choices .journey-choice:focus-visible { outline-color: #ffe4aa; outline-offset: -4px; }
.folio-back {
  display: grid;
  place-items: center;
  position: absolute;
  left: -4px;
  top: -7px;
  width: 44px;
  border: 0;
}
.folio-field { display: grid; gap: 4px; margin: 8px 0 14px; }
.folio-field input {
  width: 100%;
  min-height: 44px;
  border: 1px solid #82582f80;
  background: #e6cf9a38;
  padding: 7px;
}
.folio-field input::placeholder { color: #57381f; }
.folio-tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
  margin-bottom: 10px;
}
.folio-tabs button { border: 1px solid var(--rule); }
.folio-tabs button[aria-pressed="true"] { color: var(--rubric); background: #783b201e; box-shadow: inset 0 -2px var(--rubric); font-weight: bold; }
.folio-settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; padding-bottom: 6px; }
.folio-navigation button { font-size: 14px; }
.folio-note { font-size: 14px; margin: 4px 0 12px; }
.folio-saves { list-style: none; margin: 0; padding: 0; }
.folio-saves li { border-bottom: 1px solid var(--rule); padding: 9px 0 4px; }
.folio-saves li > button { border-bottom: 0; }
.folio-save-details { display: flex; gap: 9px; align-items: center; }
.folio-save-details img { width: 72px; height: 45px; object-fit: cover; image-rendering: pixelated; filter: sepia(.42); border: 1px solid var(--rule); }
.folio-save-details strong, .folio-save-details small { display: block; overflow-wrap: anywhere; }
.folio-save-details small { font-size: 12px; line-height: 1.25; }
.folio-inline { display: flex; gap: 8px; }
.folio-inline button { flex: 1; }
.folio-confirm { padding: 8px 0; border-top: 1px solid var(--rule); }
.folio-confirm p { margin: 4px 0 8px; }
.folio-help p { margin: 8px 0 16px; }
.folio-credits { font-size: 11px; line-height: 1.6; text-align: center; margin: 12px 0 0; }
.folio-credits a { color: inherit; text-underline-offset: 3px; }
.folio-message { font-size: 13px; margin: 6px 0 0; padding-top: 6px; border-top: 1px solid var(--rule); flex: none; max-height: 65px; overflow: auto; }
footer { text-align: center; font-size: 11px; letter-spacing: .035em; flex: none; margin-top: 10px; padding-top: 7px; border-top: 1px solid var(--rule); }
@keyframes ink-appear { from { opacity: .4; transform: translateY(2px); } to { opacity: 1; transform: translateY(0); } }
@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
</style>
