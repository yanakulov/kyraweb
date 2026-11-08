<template>
  <div class="music-settings">
    <BookSelect id="book-music" :label="t('Music device')" :model-value="state.renderer" :options="devices" :disabled="state.busy" @update:model-value="player.selectRenderer($event)" />
    <label class="sfx-switch"><input type="checkbox" :checked="state.enabled" :disabled="state.busy" @change="player.setEnabled(($event.target as HTMLInputElement).checked)" />{{ t('Music') }}</label>
    <label class="music-volume" for="music-volume">{{ t('Music volume') }} <span>{{ Math.round(state.volume * 100) }}%</span><input id="music-volume" type="range" min="0" max="100" step="1" :value="state.volume * 100" @input="player.setVolume(Number(($event.target as HTMLInputElement).value) / 100)" /></label>
    <label class="sfx-switch"><input type="checkbox" :checked="state.sfxEnabled" :disabled="state.busy" @change="player.setSfxEnabled(($event.target as HTMLInputElement).checked)" />{{ t('Sound effects') }}</label>
    <label class="music-volume" for="sfx-volume">{{ t('Effects volume') }} <span>{{ Math.round(state.sfxVolume * 100) }}%</span><input id="sfx-volume" type="range" min="0" max="100" step="1" :value="state.sfxVolume * 100" @input="player.setSfxVolume(Number(($event.target as HTMLInputElement).value) / 100)" /></label>
    <label class="sfx-switch"><input type="checkbox" :checked="state.voiceEnabled" @change="player.setVoiceEnabled(($event.target as HTMLInputElement).checked)" />{{ t('CD voices (English)') }}</label>
    <label class="music-volume" for="voice-volume">{{ t('Voice volume') }} <span>{{ Math.round(state.voiceVolume * 100) }}%</span><input id="voice-volume" type="range" min="0" max="100" step="1" :value="state.voiceVolume * 100" @input="player.setVoiceVolume(Number(($event.target as HTMLInputElement).value) / 100)" /></label>
    <template v-if="state.renderer === 'mt32'">
      <p class="music-note">{{ t('Original XMIDI music, synthesized by Munt. No Roland ROMs are included.') }}</p>
      <label class="rom-import" :class="{ 'is-busy': state.busy }">{{ t(state.available ? 'Replace ROM pair' : 'Import ROM pair') }}<input type="file" accept=".rom,.bin" multiple :disabled="state.busy" @change="importFiles" /></label>
      <p v-if="state.romNames.length" class="music-note rom-names">{{ state.romNames.join(' + ') }}</p>
      <p v-if="state.source === 'local'" class="music-note">{{ t('Local ROMs loaded automatically. They are not included in the published build.') }}</p>
      <p class="music-note">{{ t('Choose your own matching MT-32 or CM-32L Control and PCM ROMs. Files stay in this browser and are never uploaded.') }}</p>
    </template>
    <p v-else-if="state.renderer === 'adlib'" class="music-note">{{ t('Original DOS AdLib music. No ROM or SoundFont required.') }}</p>
    <p v-else class="music-note">{{ t('SoundFont mode uses approximate MT-32 to GM instrument mapping. It is not MU50, Kawai, Casio or SBLive hardware emulation; custom timbres and effects can differ.') }}</p>
    <template v-if="!basic">
      <label class="rom-import" :class="{ 'is-busy': state.busy }">{{ t('Add SoundFont bank (.sf2)') }}<input type="file" accept=".sf2" :disabled="state.busy" @change="importFont" /></label>
      <p class="music-note">{{ t('Each imported bank becomes a separate choice. Files stay in this browser; local banks are loaded only when selected.') }}</p>
    </template>
    <div class="music-buttons"><button type="button" :disabled="!state.available || state.busy" @click="player.preview(basic)">{{ t(state.previewing ? 'Stop test' : basic ? 'Test audio mix' : 'Test music') }}</button><button v-if="state.renderer === 'mt32' && state.available && state.source !== 'local'" type="button" :disabled="state.busy" @click="player.forgetRoms()">{{ t('Remove ROMs') }}</button></div>
    <p v-if="basic" class="music-note mix-note">{{ t('Listen to music, effects and speech together while adjusting their levels.') }}</p>
    <p v-if="state.soundFontProgress !== undefined" class="music-note" role="status">{{ t('Loading SoundFont…') }} {{ state.soundFontProgress }}%</p>
    <p v-else-if="state.message" class="music-note" role="status">{{ t(state.message) }}</p>
    <p v-if="!basic" class="music-note music-credit"><a :href="withBase('assets/audio/README.md')" target="_blank" rel="noopener">AdPlug / Nuked OPL3 / Munt / TinySoundFont</a> · <a :href="withBase(state.renderer === 'adlib' ? 'assets/audio/adlib-source.tar.gz' : 'assets/audio/mt32-source.tar.gz')">{{ t('Emulator source') }}</a></p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount } from 'vue';
import BookSelect from './BookSelect.vue';
import { t } from '../i18n';
import { withBase } from '../engine/core/assets';
import type { MusicPlayer, MusicState } from '../engine/audio/music';
const props = defineProps<{ player: MusicPlayer; state: MusicState; basic?: boolean }>();
const devices = computed(() => [{ value: 'adlib', label: 'AdLib (OPL2)' }, { value: 'mt32', label: 'Roland MT-32 / CM-32L · Munt' },
  ...props.state.banks.filter(bank => !props.basic || props.state.renderer === `sf2:${bank.id}`).map(bank => ({ value: `sf2:${bank.id}`, label: `SF2 · ${bank.name}` }))]);
function importFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files?.length) void props.player.importRoms(Array.from(input.files));
  input.value = '';
}
function importFont(event: Event) { const input = event.target as HTMLInputElement; if (input.files?.[0]) void props.player.importSoundFont(input.files[0]); input.value = ''; }
onBeforeUnmount(() => props.player.stopPreview());
</script>

<style scoped>
.sfx-switch{display:flex;align-items:center;gap:8px;min-height:44px;font-size:14px}.sfx-switch input{accent-color:#536244;width:18px;height:18px}
.music-note{font-size:12px;line-height:1.5;margin:8px 0;overflow-wrap:anywhere}.music-volume{display:grid;grid-template-columns:1fr auto;align-items:center;margin-top:10px;font-size:14px}.music-volume input{grid-column:1/-1;width:100%;height:44px;accent-color:#536244;cursor:inherit}.rom-import{display:block;position:relative;min-height:44px;box-sizing:border-box;padding:9px 5px;text-align:center;border:1px solid #77502170;font:inherit;cursor:inherit}.rom-import input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:inherit}.rom-import:focus-within{outline:2px solid #82511d;outline-offset:-2px}.is-busy{opacity:.5}.music-buttons{display:flex;gap:8px}.music-buttons button{flex:1;min-height:44px;border:0;border-bottom:1px solid #77502145;background:transparent;font:inherit;color:inherit;cursor:inherit}.music-buttons button:disabled{opacity:.45}.music-buttons button:focus-visible{outline:2px solid #82511d;outline-offset:-2px}.music-credit{font-size:11px}.music-credit a{color:inherit;text-underline-offset:3px}
.music-settings { display: grid; grid-template-columns: minmax(96px, 1fr) minmax(0, 2fr); gap: 2px 16px; margin: 0; padding: 0; border: 0; }
.music-settings > :not(.sfx-switch, .music-volume) { grid-column: 1 / -1; }
.music-settings .music-volume { margin-top: 4px; }
.music-settings .music-buttons button { border: 1px solid #946039; color: #60301e; background: #e5c08455; box-shadow: inset 0 0 0 2px #f5dfae75; font-variant: small-caps; }
.music-settings .sfx-switch input { appearance: none; flex: 0 0 17px; width: 17px; height: 17px; margin: 0 2px; border: 1px solid #886035;
  background: #e8cb94; box-shadow: inset 0 0 0 2px #edd9ab; display: grid; place-items: center; cursor: pointer; }
.music-settings .sfx-switch input:checked { background: #603026; box-shadow: inset 0 0 0 2px #a86848; }
.music-settings .sfx-switch input:checked::after { content: ''; width: 5px; height: 5px; background: #f1d79d; transform: rotate(45deg); }
.music-settings .music-volume input { appearance: none; margin: 0; background: transparent; accent-color: #773f2e; cursor: pointer; }
.music-settings .music-volume input::-webkit-slider-runnable-track { height: 6px; border: 1px solid #a47b47; background: #d1a869; box-shadow: inset 0 1px 2px #74523555; }
.music-settings .music-volume input::-webkit-slider-thumb { appearance: none; width: 13px; height: 13px; margin-top: -5px; transform: rotate(45deg); border: 2px solid #c29257; background: #70342b; }
.music-settings .music-volume input::-moz-range-track { height: 4px; border: 1px solid #a47b47; background: #d1a869; }
.music-settings .music-volume input::-moz-range-thumb { width: 9px; height: 9px; border-radius: 0; transform: rotate(45deg); border: 2px solid #c29257; background: #70342b; }
.music-settings :deep(.book-select-trigger) { background: #e9cc9455; box-shadow: inset 0 0 0 2px #f4dea775; border-color: #916641; }
.mix-note { text-align: center; }
</style>
