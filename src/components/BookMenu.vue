<template>
  <section ref="menu" class="folio-menu" role="dialog" aria-modal="true" :aria-label="t('Game settings')" tabindex="-1" :aria-busy="busy" :lang="locale">
    <header><button v-if="view !== 'main'" class="folio-back" type="button" @click="go('main')" :disabled="busy" :aria-label="t('Back to Options')">‹</button><h2 ref="heading" tabindex="-1">{{ title }}</h2></header>
    <div class="folio-content">
      <fieldset :key="view" :disabled="busy" class="folio-leaf">
        <nav v-if="view === 'main'" class="folio-choices" :aria-label="t('Book options')">
          <p v-if="mainMenu" class="folio-frontispiece">{{ t('The Legend of Kyrandia') }}</p>
          <button v-if="mainMenu" class="journey-choice" type="button" @click="$emit('startJourney')"><span>{{ t('Start Journey') }}</span></button>
          <template v-else><button type="button" @click="$emit('resume')"><span>{{ t('Resume') }}</span></button><button type="button" @click="go('save')" :disabled="!canSave"><span>{{ t('Save game') }}</span></button></template>
          <button type="button" @click="go('load')" :disabled="!slots.some(slot => slot.savedAt || slot.error)"><span>{{ t('Load game') }}</span></button>
          <button type="button" @click="go('settings')"><span>{{ t('Settings') }}</span></button>
          <button type="button" @click="go('help')"><span>{{ t('How to play') }}</span></button>
          <span class="folio-ornament" aria-hidden="true">✧</span>
        </nav>
        <template v-else-if="view === 'save' || view === 'load'">
          <p class="folio-note">{{ t(view === 'save' ? 'Keep your place in the story.' : 'Return to a saved chapter.') }}</p>
          <label v-if="view === 'save'" class="folio-field">{{ t('Chapter name') }}<input v-model="saveName" maxlength="48" :placeholder="t('My adventure')" /></label>
          <ol class="folio-saves">
            <li v-for="slot in slots" :key="slot.index">
              <div class="folio-save-details"><img v-if="slot.thumbnail" :src="slot.thumbnail" alt="" /><div><strong>{{ slot.name ? t(slot.name) : t(`Chapter ${slot.index + 1}`) }}</strong><small>{{ t(slot.error || (slot.savedAt ? slot.location || '' : 'Empty page')) }}</small><small v-if="slot.savedAt">{{ formatDate(slot.savedAt) }}</small></div></div>
              <template v-if="overwrite === slot.index"><p>{{ t('Replace this saved chapter?') }}</p><div class="folio-inline"><button type="button" @click="save(slot.index)">{{ t('Replace') }}</button><button type="button" @click="cancelOverwrite">{{ t('Keep it') }}</button></div></template>
              <button v-else-if="view === 'save'" type="button" :disabled="!canSave" @click="slot.savedAt || slot.error ? askOverwrite(slot.index) : save(slot.index)">{{ t('Save here') }}</button>
              <button v-else type="button" :disabled="!slot.savedAt || !!slot.error" @click="$emit('load', slot.index)">{{ t('Load chapter') }}</button>
            </li>
          </ol>
          <p class="folio-note">{{ t('Saved in this browser on this device.') }}</p>
        </template>
        <div v-else-if="view === 'settings'" class="folio-settings">
          <div class="folio-settings-grid">
            <BookSelect id="book-language" :label="t('Language')" :model-value="locale" :options="languages" :disabled="busy" @update:model-value="setLocale" />
            <BookSelect id="book-speed" :label="t('Walk speed')" :model-value="walkSpeed" :options="speeds" :disabled="busy" @update:model-value="$emit('update:walkSpeed', $event as WalkSpeed)" />
          </div>
          <label class="folio-check"><input type="checkbox" :checked="atmosphere" @change="$emit('update:atmosphere', ($event.target as HTMLInputElement).checked)" /><span aria-hidden="true" class="check-gem"></span><span>{{ t('Window dust') }}</span></label>
          <button v-if="fullscreenAvailable" type="button" @click="$emit('fullscreen')">{{ t(isFullscreen ? 'Exit full screen' : 'Full screen') }}</button>
          <div class="folio-inline folio-navigation"><button v-if="!mainMenu" type="button" @click="askLeave('menu')">{{ t('Main menu') }}</button><button type="button" @click="mainMenu ? $emit('replayIntro') : askLeave('intro')">{{ t('Replay intro') }}</button></div>
          <button type="button" @click="$emit('readPrologue')">{{ t('The story so far') }}</button>
          <div v-if="confirmAction" class="folio-confirm"><p>{{ t('Leave this adventure? Unsaved progress will be lost.') }}</p><div class="folio-inline"><button type="button" @click="leave">{{ t('Continue') }}</button><button type="button" @click="cancelLeave">{{ t('Stay here') }}</button></div></div>
          <p class="folio-credits">{{ t('Original tale © 1992 Westwood Studios') }}<br /><a href="https://github.com/yanakulov/kyraweb" target="_blank" rel="noopener noreferrer">{{ t('Reimagined by AkulaFlow · Yan Akulov') }}</a></p>
        </div>
        <div v-else class="folio-help"><p><strong>{{ t('Explore.') }}</strong> {{ t('Click to walk. Move the cursor to an exit to reveal its arrow.') }}</p><p><strong>{{ t('Discover.') }}</strong> {{ t('Click people to talk or objects to take them. Choose an inventory item, then click where to use it.') }}</p><p><strong>{{ t('Touch.') }}</strong> {{ t('Swipe to guide the cursor. Tap to interact. During dialogue, tap to skip the current line.') }}</p><p>{{ t('Options returns you to this book and pauses the adventure.') }}</p></div>
      </fieldset>
    </div>
    <p v-if="message" class="folio-message" role="status">{{ t(message) }}</p>
    <footer>{{ t('Fables & Fiends · Book One') }}</footer>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
import BookSelect from './BookSelect.vue';
import { locale, setLocale, t } from '../i18n';
type WalkSpeed = 'slowest' | 'slow' | 'fast' | 'fastest';
type View = 'main' | 'save' | 'load' | 'settings' | 'help';
const props = withDefaults(defineProps<{
  gameplay: boolean; canSave: boolean; busy: boolean; message: string; mainMenu?: boolean;
  slots: { index: number; name?: string; location?: string; savedAt?: string; thumbnail?: string; error?: string | null }[];
  walkSpeed: WalkSpeed; atmosphere: boolean; fullscreenAvailable: boolean; isFullscreen: boolean;
  initialView?: 'main' | 'load';
}>(), { initialView: 'main', mainMenu: false });
const emit = defineEmits<{
  resume: []; save: [index: number, name: string]; load: [index: number]; startJourney: []; readPrologue: [];
  mainMenu: []; replayIntro: []; fullscreen: [];
  'update:walkSpeed': [value: WalkSpeed]; 'update:atmosphere': [value: boolean];
}>();
const languages = [{ value: 'en', label: 'English' }, { value: 'ru', label: 'Русский' }];
const speeds = computed(() => ['slowest', 'slow', 'fast', 'fastest'].map((value, index) => ({ value, label: t(['Slowest', 'Slow', 'Fast', 'Fastest'][index]) })));
const view = ref<View>(props.initialView), heading = ref<HTMLHeadingElement | null>(null);
const menu = ref<HTMLElement | null>(null);
const saveName = ref(''), overwrite = ref<number | null>(null), confirmAction = ref<'menu' | 'intro' | null>(null);
const title = computed(() => t(({ main: props.mainMenu ? 'Book One' : 'Options', save: 'Save your story', load: 'Saved chapters', settings: 'Settings', help: 'How to play' })[view.value]));
async function go(next: View) { view.value = next; overwrite.value = null; confirmAction.value = null; await nextTick(); heading.value?.focus(); }
async function askOverwrite(index: number) { overwrite.value = index; await nextTick(); menu.value?.querySelector<HTMLButtonElement>('.folio-inline button')?.focus(); }
async function cancelOverwrite() { overwrite.value = null; await nextTick(); heading.value?.focus(); }
async function save(index: number) { overwrite.value = null; emit('save', index, saveName.value.trim() || t(`Chapter ${index + 1}`)); await nextTick(); heading.value?.focus(); }
async function askLeave(destination: 'menu' | 'intro') { confirmAction.value = destination; await nextTick(); menu.value?.querySelector<HTMLButtonElement>('.folio-confirm button')?.focus(); }
async function cancelLeave() { confirmAction.value = null; await nextTick(); heading.value?.focus(); }
function leave() { if (confirmAction.value === 'menu') emit('mainMenu'); else emit('replayIntro'); }
function formatDate(value: string) { return new Date(value).toLocaleString(locale.value === 'ru' ? 'ru-RU' : 'en-GB', { dateStyle: 'short', timeStyle: 'short' }); }
</script>

<style scoped>
.folio-menu{width:100%;height:100%;padding:12px 16px;box-sizing:border-box;display:flex;flex-direction:column;color:#38200d;font:16px/1.4 Georgia,'Times New Roman',serif;outline:none;text-shadow:0 1px #e6d2a047;color-scheme:light}
header{position:relative;flex:none;border-bottom:1px solid #70492370;margin:0 0 10px;text-align:center;padding:0 38px 10px}h2{font:small-caps 25px/1.16 Georgia,serif;margin:0;outline:none;letter-spacing:.015em}
.folio-content{min-height:0;flex:1;overflow:auto;overscroll-behavior:contain;scrollbar-color:#74512b transparent;scrollbar-width:thin;padding:0 5px}
fieldset{border:0;margin:0;padding:0;min-width:0}.folio-leaf{animation:ink-appear .2s ease-out}button,input{font:inherit;color:inherit}button{display:block;width:100%;min-height:44px;padding:8px;border:0;border-bottom:1px solid #77502145;background:transparent;cursor:inherit;transition:color .16s,background-color .16s}button:hover:not(:disabled){background:#6c360e0c;color:#4a1708}button:disabled{opacity:.45;cursor:inherit}button:focus-visible,input:focus-visible,a:focus-visible{outline:2px solid #82511d;outline-offset:-2px}
.folio-choices button{font-size:19px;min-height:50px}.folio-choices button span{display:inline-block;transition:transform .16s}.folio-choices button:hover:not(:disabled) span{transform:translateX(2px)}.folio-choices button:active:not(:disabled) span{transform:translateY(1px)}.folio-frontispiece{font-size:18px;text-align:center;margin:4px 0 8px;font-style:italic}.journey-choice{font-weight:bold}.folio-ornament{display:block;text-align:center;font-size:24px;line-height:1;color:#765124;padding:14px 0 6px}.folio-back{position:absolute;left:0;top:-9px;width:36px;border:0;font-size:32px;min-height:44px}.folio-field{display:grid;gap:4px;margin:8px 0 14px}.folio-field input{width:100%;min-height:44px;border:1px solid #82582f80;border-radius:2px;background:#e6cf9a38;padding:7px;box-sizing:border-box}.folio-field input::placeholder{color:#795c38;opacity:.8}
.folio-settings-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;padding:2px 0 8px}.folio-check{position:relative;display:flex;align-items:center;gap:9px;min-height:44px;cursor:inherit}.folio-check input{position:absolute;opacity:0;width:20px;height:20px;margin:0}.check-gem{width:17px;height:17px;flex:none;border:1px solid #79502d;box-shadow:inset 0 0 0 3px #d6be91;transform:rotate(45deg) scale(.78);background:transparent;transition:background-color .18s,box-shadow .18s}.folio-check input:checked+.check-gem{background:#536244;box-shadow:inset 0 0 0 3px #d6be91,0 0 7px #66734122}.folio-check input:focus-visible+.check-gem{outline:2px solid #82511d;outline-offset:3px}.folio-navigation button{font-size:14px}
.folio-note{font-size:14px;margin:4px 0 12px}.folio-saves{list-style:none;margin:0;padding:0}.folio-saves li{border-bottom:1px solid #70492370;padding:12px 0}.folio-save-details{display:flex;gap:8px;align-items:center}.folio-save-details img{width:72px;height:45px;object-fit:cover;image-rendering:pixelated;filter:sepia(.6);border:1px solid #70492370}.folio-save-details strong,.folio-save-details small{display:block;overflow-wrap:anywhere}.folio-save-details small{font-size:12px;line-height:1.4}.folio-inline{display:flex;gap:8px}.folio-inline button{flex:1}.folio-confirm{padding:8px 0;border-top:1px solid #70492370}.folio-confirm p{margin:4px 0 8px;font-size:14px}
.folio-help p{margin:8px 0 16px}.folio-credits{font-size:11px;line-height:1.6;text-align:center;margin:12px 0 0}.folio-credits a{color:inherit;text-underline-offset:3px}.folio-message{font-size:13px;margin:6px 0 0;padding-top:6px;border-top:1px solid #70492370;flex:none;max-height:65px;overflow:auto}footer{text-align:center;font-size:11px;letter-spacing:.025em;flex:none;margin-top:10px;padding-top:8px;border-top:1px solid #70492370}
@keyframes ink-appear{from{opacity:.35;transform:translateY(2px)}to{opacity:1;transform:translateY(0)}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
