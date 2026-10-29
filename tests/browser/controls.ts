import { createApp } from 'vue';
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
document.querySelector('#minute')!.addEventListener('click', () => void advance(60000));
createApp(App).mount('#app');
const verify = document.createElement('button');
verify.textContent = 'Verify swipe cursor';
document.querySelector('aside')!.append(verify);
verify.onclick = () => {
  const canvas = document.querySelector('canvas')!;
  const cursor = document.querySelector<HTMLElement>('.game-cursor');
  if (!cursor) throw Error('Start the game before checking gestures');
  const rect = canvas.getBoundingClientRect();
  const before = parseFloat(cursor.style.left);
  // Synthetic events exercise the real Vue handlers; capture needs a hardware pointer.
  const capture = canvas.setPointerCapture;
  canvas.setPointerCapture = () => {};
  const send = (type: string, x: number) => canvas.dispatchEvent(new PointerEvent(type, {
    bubbles: true, pointerId: 99, pointerType: 'touch', isPrimary: true,
    clientX: x, clientY: rect.top + 80,
  }));
  send('pointerdown', rect.left + 40);
  send('pointermove', rect.left + 70);
  send('pointerup', rect.left + 70);
  canvas.setPointerCapture = capture;
  queueMicrotask(() => {
    const after = parseFloat(cursor.style.left);
    const expected = Math.min(319 / 3.2, before + 30 / rect.width * 100);
    if (Math.abs(after - expected) > 0.01) throw Error('Swipe must move relatively, without jumping to the finger');
    if (document.querySelector('.exit-marker')) throw Error('Physical exit buttons remain');
    verify.textContent = 'PASS — relative swipe cursor';
  });
};
