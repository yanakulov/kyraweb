<template>
  <div ref="root" class="book-select" @keydown="onKey" @focusout="leaveFocus">
    <span :id="`${id}-label`" class="book-select-label">{{ label }}</span>
    <button ref="trigger" class="book-select-trigger" type="button" role="combobox" :aria-labelledby="`${id}-label ${id}-value`" :aria-expanded="open" aria-haspopup="listbox" :aria-controls="`${id}-choices`" :disabled="disabled" @click="toggle">
      <span :id="`${id}-value`">{{ options.find(option => option.value === modelValue)?.label }}</span><span class="book-select-arrow" aria-hidden="true">⌄</span>
    </button>
    <div v-if="open" :id="`${id}-choices`" class="book-select-choices" :class="{ 'opens-up': upward }" role="listbox" :aria-labelledby="`${id}-label`">
      <button v-for="(option, index) in options" :key="option.value" type="button" role="option" :aria-selected="option.value === modelValue" tabindex="-1" @click="choose(index)"><span aria-hidden="true" class="book-select-mark">{{ option.value === modelValue ? '✧' : '' }}</span>{{ option.label }}</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
const props = defineProps<{ id: string; label: string; modelValue: string; options: { value: string; label: string }[]; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const root = ref<HTMLElement | null>(null), trigger = ref<HTMLButtonElement | null>(null);
const open = ref(false), upward = ref(false);
function optionButtons() { return [...root.value?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []]; }
async function show(index = props.options.findIndex(option => option.value === props.modelValue)) {
  if (props.disabled) return;
  const rect = trigger.value!.getBoundingClientRect(), bounds = root.value!.closest('.folio-content')?.getBoundingClientRect();
  upward.value = !!bounds && bounds.bottom - rect.bottom < Math.min(178, props.options.length * 44) * rect.height / 44;
  open.value = true; await nextTick(); optionButtons()[Math.max(0, index)]?.focus();
}
function toggle() { if (open.value) close(); else void show(); }
function close() { open.value = false; trigger.value?.focus(); }
function choose(index: number) { emit('update:modelValue', props.options[index].value); close(); }
function leaveFocus(event: FocusEvent) { if (!root.value?.contains(event.relatedTarget as Node)) open.value = false; }
function outside(event: PointerEvent) { if (!root.value?.contains(event.target as Node)) open.value = false; }
function onKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) { event.preventDefault(); event.stopPropagation(); close(); return; }
  if (event.key === 'Tab') { open.value = false; return; }
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  if (!open.value) { void show(event.key === 'End' ? props.options.length - 1 : undefined); return; }
  const buttons = optionButtons(), index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
  buttons[next]?.focus();
}
watch(() => props.disabled, value => { if (value) open.value = false; });
onMounted(() => document.addEventListener('pointerdown', outside));
onBeforeUnmount(() => document.removeEventListener('pointerdown', outside));
</script>

<style scoped>

.book-select{position:relative;min-width:0;color:inherit}.book-select-label{display:block;font-size:13px;line-height:1.3;margin:0 0 4px;letter-spacing:.025em}.book-select-trigger{font:inherit;color:inherit;width:100%;height:44px;display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid #79502d80;border-radius:2px;background:#e5ce9c25;padding:8px 12px;text-align:left;cursor:inherit;transition:background-color .16s,border-color .16s}.book-select-trigger:hover{background:#70411c0c;border-color:#79502db0}.book-select-trigger:focus-visible,.book-select-choices button:focus-visible{outline:2px solid #81511d;outline-offset:-3px}.book-select-arrow{font-size:22px;line-height:1;transform-origin:50% 60%;transition:transform .16s}.book-select-trigger[aria-expanded=true] .book-select-arrow{transform:rotate(180deg)}.book-select-choices{position:absolute;z-index:3;top:100%;left:0;right:0;max-height:178px;overflow:auto;overscroll-behavior:contain;border:1px solid #79502d;background:#d4bc8d;box-shadow:0 4px 7px #35200e38;animation:unfold .14s ease-out;transform-origin:top}.book-select-choices.opens-up{top:auto;bottom:44px;transform-origin:bottom;box-shadow:0 -3px 7px #35200e25}.book-select-choices button{display:flex;align-items:center;gap:7px;width:100%;min-height:44px;padding:7px 10px;border:0;background:transparent;color:inherit;text-align:left;font:inherit;cursor:inherit}.book-select-choices button:hover,.book-select-choices button:focus{background:#79502d15}.book-select-mark{width:14px;flex:none;color:#73501d;font-size:19px}.book-select-trigger:disabled{opacity:.5}@keyframes unfold{from{opacity:0;transform:scaleY(.94)}to{opacity:1;transform:scaleY(1)}}@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
.book-select-trigger,.book-select-choices button{font-size:14px;line-height:1.2}
</style>
