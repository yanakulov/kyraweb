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
