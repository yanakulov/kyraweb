<template>
  <section ref="menu" class="folio-menu" role="dialog" aria-modal="true" aria-label="Game settings" tabindex="-1" :aria-busy="busy">
    <header><button v-if="view !== 'main'" class="folio-back" type="button" @click="go('main')" :disabled="busy" aria-label="Back to Options">‹</button><h2 ref="heading" tabindex="-1">{{ title }}</h2></header>
    <div class="folio-content">
      <fieldset :disabled="busy">
        <nav v-if="view === 'main'" class="folio-choices" aria-label="Book options">
          <button type="button" @click="$emit('resume')">Resume</button>
          <button type="button" @click="go('save')" :disabled="!canSave">Save game</button>
          <button type="button" @click="go('load')" :disabled="!slots.some(slot => slot.savedAt || slot.error)">Load game</button>
          <button type="button" @click="go('inventory')" :disabled="!gameplay">Inventory</button>
          <button type="button" @click="go('settings')">Settings</button>
          <button type="button" @click="go('help')">How to play</button>
        </nav>
        <template v-else-if="view === 'save' || view === 'load'">
          <p class="folio-note">{{ view === 'save' ? 'Keep your place in the story.' : 'Return to a saved chapter.' }}</p>
          <label v-if="view === 'save'" class="folio-field">Chapter name<input v-model="saveName" maxlength="48" placeholder="My adventure" /></label>
          <ol class="folio-saves">
            <li v-for="slot in slots" :key="slot.index">
              <div class="folio-save-details"><img v-if="slot.thumbnail" :src="slot.thumbnail" alt="" /><div><strong>{{ slot.name || `Chapter ${slot.index + 1}` }}</strong><small>{{ slot.error || (slot.savedAt ? slot.location : 'Empty page') }}</small><small v-if="slot.savedAt">{{ formatDate(slot.savedAt) }}</small></div></div>
              <template v-if="overwrite === slot.index"><p>Replace this saved chapter?</p><div class="folio-inline"><button type="button" @click="save(slot.index)">Replace</button><button type="button" @click="cancelOverwrite">Keep it</button></div></template>
              <button v-else-if="view === 'save'" type="button" :disabled="!canSave" @click="slot.savedAt || slot.error ? askOverwrite(slot.index) : save(slot.index)">Save here</button>
              <button v-else type="button" :disabled="!slot.savedAt || !!slot.error" @click="$emit('load', slot.index)">Load chapter</button>
            </li>
          </ol>
          <p class="folio-note">Saved in this browser on this device.</p>
        </template>
        <template v-else-if="view === 'settings'">
          <label class="folio-field">Walk speed<select :value="walkSpeed" @change="$emit('update:walkSpeed', ($event.target as HTMLSelectElement).value as WalkSpeed)"><option value="slowest">Slowest</option><option value="slow">Slow</option><option value="fast">Fast</option><option value="fastest">Fastest</option></select></label>
          <label class="folio-check"><input type="checkbox" :checked="atmosphere" @change="$emit('update:atmosphere', ($event.target as HTMLInputElement).checked)" /> Window dust</label>
          <button v-if="fullscreenAvailable" type="button" @click="$emit('fullscreen')">{{ isFullscreen ? 'Exit full screen' : 'Full screen' }}</button>
          <button type="button" @click="confirmAction = 'menu'">Main menu</button>
          <button type="button" @click="confirmAction = 'intro'">Replay intro</button>
          <div v-if="confirmAction" class="folio-confirm"><p>Leave this adventure? Unsaved progress will be lost.</p><div class="folio-inline"><button type="button" @click="leave">Continue</button><button type="button" @click="confirmAction = null">Stay here</button></div></div>
          <p class="folio-credits">Original tale © 1992 Westwood Studios<br /><a href="https://github.com/yanakulov/kyraweb" target="_blank" rel="noopener noreferrer">Reimagined by AkulaFlow · Yan Akulov</a></p>
        </template>
        <template v-else-if="view === 'inventory'">
          <p class="folio-note">{{ heldItemName ? `In hand: ${heldItemName}` : 'Choose an item, then return to the story.' }}</p>
          <div class="folio-inventory"><button v-for="(item, index) in inventory" :key="index" type="button" :aria-label="item.id ? `Take ${item.name}` : `Empty slot ${index + 1}`" @click="$emit('inventory', index)"><span v-if="item.id" class="item-icon" :style="item.style"></span></button></div>
        </template>
        <div v-else class="folio-help"><p><strong>Explore.</strong> Click to walk. Move the cursor to an exit to reveal its arrow.</p><p><strong>Discover.</strong> Click people to talk or objects to take them. Choose an inventory item, then click where to use it.</p><p><strong>Touch.</strong> Swipe to guide the cursor. Tap to interact. During dialogue, tap to skip the current line.</p><p>Options returns you to this book and pauses the adventure.</p></div>
      </fieldset>
    </div>
    <p v-if="message" class="folio-message" role="status">{{ message }}</p>
    <footer>Fables &amp; Fiends · Book One</footer>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue';
type WalkSpeed = 'slowest' | 'slow' | 'fast' | 'fastest';
type View = 'main' | 'save' | 'load' | 'settings' | 'help' | 'inventory';
const props = withDefaults(defineProps<{
  gameplay: boolean; canSave: boolean; busy: boolean; message: string;
  slots: { index: number; name?: string; location?: string; savedAt?: string; thumbnail?: string; error?: string | null }[];
  walkSpeed: WalkSpeed; atmosphere: boolean; fullscreenAvailable: boolean; isFullscreen: boolean;
  inventory: { id: string | null; name: string; style?: Record<string, string> }[];
  heldItemName: string; initialView?: 'main' | 'load';
}>(), { initialView: 'main' });
const emit = defineEmits<{
  resume: []; save: [index: number, name: string]; load: [index: number]; inventory: [index: number];
  mainMenu: []; replayIntro: []; fullscreen: [];
  'update:walkSpeed': [value: WalkSpeed]; 'update:atmosphere': [value: boolean];
}>();
const view = ref<View>(props.initialView), heading = ref<HTMLHeadingElement | null>(null);
const menu = ref<HTMLElement | null>(null);
const saveName = ref(''), overwrite = ref<number | null>(null), confirmAction = ref<'menu' | 'intro' | null>(null);
const title = computed(() => ({ main: 'Options', save: 'Save your story', load: 'Saved chapters', settings: 'Settings', help: 'How to play', inventory: 'Your belongings' })[view.value]);
async function go(next: View) { view.value = next; overwrite.value = null; confirmAction.value = null; await nextTick(); heading.value?.focus(); }
async function askOverwrite(index: number) { overwrite.value = index; await nextTick(); menu.value?.querySelector<HTMLButtonElement>('.folio-inline button')?.focus(); }
async function cancelOverwrite() { overwrite.value = null; await nextTick(); heading.value?.focus(); }
async function save(index: number) { overwrite.value = null; emit('save', index, saveName.value.trim() || `Chapter ${index + 1}`); await nextTick(); heading.value?.focus(); }
function leave() { if (confirmAction.value === 'menu') emit('mainMenu'); else emit('replayIntro'); }
function formatDate(value: string) { return new Date(value).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }); }
</script>

<style scoped>
.folio-menu{width:100%;height:100%;display:flex;flex-direction:column;color:#38200d;font:16px/1.4 Georgia,'Times New Roman',serif;outline:none;text-shadow:0 1px #e6d2a047}
header{position:relative;flex:none;border-bottom:1px solid #70492370;margin:0 0 10px;text-align:center;padding:0 28px 10px}h2{font:small-caps 26px/1.15 Georgia,serif;margin:0;outline:none;letter-spacing:.02em}
.folio-content{min-height:0;flex:1;overflow:auto;overscroll-behavior:contain;scrollbar-color:#74512b transparent;scrollbar-width:thin;padding:0 3px}
fieldset{border:0;margin:0;padding:0;min-width:0}button,input,select{font:inherit;color:inherit}button{display:block;width:100%;min-height:50px;padding:8px;border:0;border-bottom:1px solid #77502145;background:transparent;cursor:pointer}button:hover:not(:disabled){background:#6c360e12;color:#4a1708}button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:2px solid #82511d;outline-offset:-2px}
.folio-choices button{font-size:19px}.folio-back{position:absolute;left:0;top:-10px;width:36px;border:0;font-size:32px}.folio-field{display:grid;gap:4px;margin:8px 0 14px}.folio-field input,.folio-field select{width:100%;min-height:46px;border:1px solid #82582f80;background:#e6cf9a38;padding:7px;box-sizing:border-box}.folio-check{display:flex;align-items:center;gap:8px;min-height:50px}.folio-check input{width:20px;height:20px;accent-color:#6a421d}
.folio-note{font-size:14px;margin:4px 0 12px}.folio-saves{list-style:none;margin:0;padding:0}.folio-saves li{border-bottom:1px solid #70492370;padding:12px 0}.folio-save-details{display:flex;gap:8px;align-items:center}.folio-save-details img{width:72px;height:45px;object-fit:cover;image-rendering:pixelated;filter:sepia(.6);border:1px solid #70492370}.folio-save-details strong,.folio-save-details small{display:block;overflow-wrap:anywhere}.folio-save-details small{font-size:12px;line-height:1.4}.folio-inline{display:flex;gap:8px}.folio-inline button{flex:1}.folio-confirm{padding:8px 0;border-top:1px solid #70492370}
.folio-inventory{display:grid;grid-template-columns:repeat(5,1fr);gap:4px}.folio-inventory button{height:52px;min-height:52px;border:1px solid #70492380;display:grid;place-items:center}.folio-help p{margin:8px 0 16px}.folio-credits{font-size:11px;line-height:1.6;text-align:center;margin-top:18px}.folio-credits a{color:inherit}.folio-message{font-size:13px;margin:6px 0 0;padding-top:6px;border-top:1px solid #70492370;flex:none;max-height:65px;overflow:auto}footer{text-align:center;font-size:11px;letter-spacing:.05em;flex:none;margin-top:10px;padding-top:8px;border-top:1px solid #70492370}
</style>
