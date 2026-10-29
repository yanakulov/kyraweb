import { createApp, nextTick } from 'vue';
import App from '../../src/App.vue';
import '../../src/styles.css';

// Real application and rendering, with a visible clock for reproducible review.
let now = performance.now(), id = 0;
const frames = new Map<number, FrameRequestCallback>();
performance.now = () => now;
window.requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
window.cancelAnimationFrame = handle => { frames.delete(handle); };
async function advance(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 50) {
    now += 50;
    const batch = [...frames.values()]; frames.clear();
    batch.forEach(callback => callback(now));
    if (elapsed % 500 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
}
document.querySelector('#second')!.addEventListener('click', () => void advance(1000));
document.querySelector('#half')!.addEventListener('click', () => void advance(500));
document.querySelector('#minute')!.addEventListener('click', () => void advance(60000));
// Hide the clock for clean captures without changing the rendered application.
document.addEventListener('keydown', event => {
  if (event.key.toLowerCase() !== 'h' || (event.target as HTMLElement).matches('input, select, textarea')) return;
  const controls = document.querySelector('aside')!;
  controls.hidden = !controls.hidden;
});
createApp(App).mount('#app');
const verify = document.createElement('button');
verify.textContent = 'Verify swipe cursor';
document.querySelector('aside')!.append(verify);
verify.onclick = async () => {
  const canvas = document.querySelector<HTMLCanvasElement>('canvas[aria-label="Kyrandia game scene"]')!;
  const cursor = document.querySelector<HTMLElement>('.game-cursor');
  if (!cursor || !document.querySelector('.hud-options')) throw Error('Finish the opening before checking gestures');
  const rect = canvas.getBoundingClientRect();
  // Synthetic events exercise the real Vue handlers; capture needs a hardware pointer.
  const capture = canvas.setPointerCapture;
  canvas.setPointerCapture = () => {};
  const send = (type: string, x: number, y = rect.top + 80, pointerType = 'touch') => canvas.dispatchEvent(new PointerEvent(type, {
    bubbles: true, pointerId: 99, pointerType, isPrimary: true,
    clientX: x, clientY: y,
  }));
  try {
    send('pointermove', rect.left + rect.width / 2, rect.top + rect.height / 2, 'mouse');
    await nextTick();
    const before = parseFloat(cursor.style.left);
    send('pointerdown', rect.left + 40);
    send('pointermove', rect.left + 70);
    send('pointerup', rect.left + 70);
    await nextTick();
    const after = parseFloat(cursor.style.left);
    const expected = Math.min(319 / 3.2, before + 30 / rect.width * 100);
    if (Math.abs(after - expected) > 0.01) throw Error('Swipe must move relatively, without jumping to the finger');
    if (document.querySelector('.exit-marker')) throw Error('Physical exit buttons remain');
    // Aim from the scene centre to the original OPTIONS gem, then tap elsewhere.
    // The gesture endpoint must move the persistent cursor, not activate the HUD.
    const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
    send('pointermove', x, y, 'mouse');
    send('pointerdown', x, y);
    send('pointermove', x - 120 * rect.width / 320, y + 76 * rect.height / 200);
    send('pointerup', x - 120 * rect.width / 320, y + 76 * rect.height / 200);
    await nextTick();
    if (document.querySelector('[role="dialog"]')) throw Error('A swipe activated Options without a tap');
    send('pointerdown', x, y); send('pointerup', x, y);
    await nextTick(); await nextTick();
    const options = document.querySelector<HTMLElement>('[role="dialog"][aria-label="Game settings"]');
    if (!options) throw Error('Tap must activate OPTIONS at the persistent cursor, not at the finger');
    if (!options.contains(document.activeElement)) throw Error('Cursor-opened Options did not receive focus');
    options.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await nextTick();
    if (document.querySelector('[role="dialog"]')) throw Error('Options did not close with Escape');
    verify.textContent = 'PASS — relative swipe and HUD Options';
  } finally { canvas.setPointerCapture = capture; }
};

const panelCheck = document.createElement('button');
panelCheck.textContent = 'Verify in-game panels';
document.querySelector('aside')!.append(panelCheck);
panelCheck.onclick = async () => {
  const stage = document.querySelector<HTMLElement>('.stage')!;
  const trigger = document.querySelector<HTMLButtonElement>('.hud-options') ?? [...stage.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Settings');
  if (!trigger) throw Error('Reach the main menu or gameplay first');
  trigger.focus(); trigger.click(); await nextTick(); await nextTick();
  if (document.querySelector('.masthead, .game-toolbar') || !stage.contains(document.querySelector('.credits'))) throw Error('Interface remains outside the game');
  for (const label of ['Options', 'How to play']) {
    if (label === 'How to play') {
      [...stage.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b => b.textContent === label)!.click();
      await nextTick(); await nextTick();
    }
    const dialog = stage.querySelector<HTMLElement>('[role="dialog"]')!;
    const box = dialog.getBoundingClientRect(), bounds = stage.getBoundingClientRect();
    if (box.left < bounds.left || box.right > bounds.right || box.top < bounds.top || box.bottom > bounds.bottom) throw Error(`${label} escapes the game`);
    if (!dialog.contains(document.activeElement)) throw Error('Panel does not own keyboard focus');
  }
  stage.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await nextTick();
  if (stage.querySelector('[role="dialog"]') || document.activeElement !== trigger) throw Error('Escape did not close the panel and restore focus');
  panelCheck.textContent = 'PASS — panels stay inside game';
};
