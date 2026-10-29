import { createApp, nextTick } from 'vue';
import App from '../../src/App.vue';
import '../../src/styles.css';

// Real App, resources and renderers; only the animation clock is controlled.
let now = performance.now(), id = 0, busy = false;
const frames = new Map<number, FrameRequestCallback>();
performance.now = () => now;
window.requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
window.cancelAnimationFrame = handle => { frames.delete(handle); };
const controls = document.querySelector<HTMLElement>('#transition-controls')!;
const status = document.querySelector<HTMLOutputElement>('#transition-status')!;
const canvas = () => document.querySelector<HTMLCanvasElement>('.stage canvas')!;
const openingBook = () => document.querySelector<HTMLElement>('.fantasy-book:not(.is-options)');
const optionsBook = () => document.querySelector<HTMLElement>('.fantasy-book.is-options');
const pixels = (image: HTMLCanvasElement) => image.getContext('2d')!.getImageData(0, 0, image.width, image.height).data;
function assert(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
function sameRect(a: DOMRect, b: DOMRect, message: string) {
  for (const key of ['left', 'top', 'width', 'height'] as const) assert(Math.abs(a[key]-b[key])<.6, `${message}: ${key} ${a[key].toFixed(2)} → ${b[key].toFixed(2)}`);
}
function samePixels(a: Uint8ClampedArray, b: Uint8ClampedArray, message: string) {
  assert(a.length===b.length, `${message}: dimensions differ`);
  assert(a.every((value,index)=>value===b[index]), message);
}
type Capture = { bounds: DOMRect; pixels: Uint8ClampedArray; options: boolean };
let lastHandoff: Capture | null = null, handoffCount = 0;
let checkBounds: DOMRect | null = null;
function observeFrame() {
  const stage = canvas();
  if (stage && checkBounds) sameRect(checkBounds, stage.getBoundingClientRect(), 'Game layout changed during transition');
  const handoff = document.querySelector<HTMLCanvasElement>('canvas.book-handoff');
  if (!handoff || getComputedStyle(handoff).visibility==='hidden' || Number(getComputedStyle(handoff).opacity)<.999 || !handoff.width || !handoff.height) return;
  const bounds = handoff.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  sameRect(stage.getBoundingClientRect(), bounds, 'Book handoff does not cover the exact game rectangle');
  lastHandoff = { bounds, pixels: pixels(handoff), options: !!optionsBook() }; handoffCount++;
}
async function advance(ms: number) {
  for (let elapsed=0;elapsed<ms;elapsed+=50) {
    now += Math.min(50,ms-elapsed);
    for (const [handle, callback] of [...frames]) if (frames.delete(handle)) { callback(now); observeFrame(); }
    await nextTick();
    observeFrame();
    if (elapsed%500===0) await new Promise(resolve=>setTimeout(resolve,0));
  }
}
function details() { return [...document.querySelectorAll('.game-error,.scene-notice,.folio-message')].map(el=>el.textContent?.trim()).filter(Boolean).join('; '); }
async function until(predicate:()=>boolean, message:string, timeout=60000, beforeFrame?:()=>Promise<void>) {
  const deadline=Date.now()+timeout;
  while (!predicate()) {
    assert(Date.now()<deadline, `${message}. ${details()||'Timed out waiting for resources or state.'}`);
    assert(!document.querySelector('.game-error'),details());
    await beforeFrame?.();
    await advance(100); await new Promise(resolve=>setTimeout(resolve,25));
  }
  await nextTick();
}
async function press(selector:string) {
  const button=document.querySelector<HTMLButtonElement>(selector);
  assert(button&&!button.disabled, `Missing or disabled button: ${selector}`);
  button.focus(); button.click(); await nextTick();
}
async function dismissPrologue() {
  const button=document.querySelector<HTMLButtonElement>('.prologue-skip');
  if (!button||button.disabled) return;
  // Reviewing the fixture must not change whether the user's next real launch shows its prologue.
  const seen=localStorage.getItem('kyrandia.prologueSeen');
  button.click(); await nextTick();
  if (seen===null) localStorage.removeItem('kyrandia.prologueSeen'); else localStorage.setItem('kyrandia.prologueSeen',seen);
}
async function readyBook() {
  assert(openingBook(),'Reload this fixture to return to the closed book.');
  await until(()=>!!document.querySelector('.fantasy-book.is-rendered .book-open:not(:disabled)'),'The book did not become ready');
  assert(!document.querySelector('.fantasy-book.is-fallback'),'WebGL book rendering fell back; this check requires its 3D transition.');
  const open=document.querySelector<HTMLElement>('.book-open')!;
  assert(open.closest('.book-cover-invitation'),'Open the book is not on its cover');
  assert(!document.querySelector('.book-invitation'),'The old buttons below the book remain');
  const hint=open.getBoundingClientRect(), book=openingBook()!.getBoundingClientRect();
  assert(hint.width>0&&hint.height>0&&hint.left>=book.left&&hint.right<=book.right&&hint.top>=book.top&&hint.bottom<=book.bottom,'Cover invitation is not visible inside the book viewport');
  const saved=document.querySelector('.book-continue');
  assert(!saved||saved.closest('.book-cover-invitation'),'Continue journey is outside the book cover');
  const stage=canvas().getBoundingClientRect();
  assert(stage.width>0&&stage.height>0,'Hidden game has no stable layout');
}
async function enterIntro() {
  await readyBook();
  checkBounds=canvas().getBoundingClientRect(); lastHandoff=null; handoffCount=0;
  try {
    await press('.book-open');
    await until(()=>!openingBook(), 'The opening book did not reach the intro',60000,dismissPrologue);
    const handoff=lastHandoff as Capture|null;
    assert(handoff&&!handoff.options,'No fully opaque opening handoff frame was rendered');
    sameRect(handoff.bounds,canvas().getBoundingClientRect(),'First intro frame changed size or position');
    assert(!document.querySelector('.game-frame.is-concealed'),'The intro remained concealed after handoff');
  } finally { checkBounds=null; }
}
async function reachGameplay() {
  if (openingBook()) { await readyBook(); await press('.book-open'); }
  const deadline=Date.now()+120000;
  while (!document.querySelector('.hud-options:not(:disabled)') || optionsBook()) {
    assert(Date.now()<deadline,`Gameplay did not become ready. ${details()}`);
    await dismissPrologue();
    const journey=document.querySelector<HTMLButtonElement>('.book-page-menu.is-visible .journey-choice:not(:disabled)');
    if (journey) { journey.click(); await nextTick(); }
    const next=document.querySelector<HTMLButtonElement>('.continue-button:not(:disabled)');
    if (next) { next.click(); await nextTick(); }
    await advance(1000); await new Promise(resolve=>setTimeout(resolve,25));
    assert(!document.querySelector('.game-error'),details());
  }
}
async function optionsRoundTrip(early=false) {
  assert(!optionsBook()&&!openingBook(),'Return to gameplay before checking Options');
  assert(document.querySelector('.hud-options'),'Use Reach gameplay first');
  const before=pixels(canvas());
  checkBounds=canvas().getBoundingClientRect(); lastHandoff=null; handoffCount=0;
  try {
    await press('.hud-options');
    await until(()=>!!document.querySelector('.fantasy-book.is-options.is-rendered'),'Options did not render');
    const first=lastHandoff as Capture|null;
    assert(first?.options,'Options did not begin on a full game frame');
    samePixels(before,first.pixels,'Options changed pixels before pulling back');
    if (early) await advance(350);
    else await until(()=>!!document.querySelector('.book-page-menu.is-visible .folio-menu[aria-busy="false"]'),'Options did not reach its page');
    const paused=pixels(canvas());
    await advance(500);
    samePixels(paused,pixels(canvas()),'Game animation advanced while the book was open');
    const count=handoffCount;
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    await nextTick();
    await until(()=>!optionsBook(),'Options did not return to the game');
    const returned=lastHandoff as Capture|null;
    assert(returned?.options&&handoffCount>count,'No final Options handoff was rendered');
    samePixels(paused,returned.pixels,'Return zoom did not retain the paused game frame');
    sameRect(returned.bounds,canvas().getBoundingClientRect(),'Resuming changed game geometry');
  } finally { checkBounds=null; }
}
function add(label:string, action:()=>Promise<void>) {
  const button=document.createElement('button'); button.textContent=label; button.style.cssText='font:12px system-ui;padding:5px;margin:2px'; controls.insertBefore(button,status);
  button.onclick=async()=>{
    if (busy) return;
    busy=true; status.textContent=`RUNNING — ${label}`; status.dataset.result='running';
    controls.querySelectorAll<HTMLButtonElement>('button').forEach(item=>item.disabled=true);
    try { await action(); status.textContent=`PASS — ${label}`; status.dataset.result='pass'; }
    catch(error) { status.textContent=`FAIL — ${label}: ${error instanceof Error?error.message:String(error)}`; status.dataset.result='fail'; console.error(error); }
    finally { checkBounds=null; busy=false; controls.querySelectorAll<HTMLButtonElement>('button').forEach(item=>item.disabled=false); }
  };
}
document.addEventListener('keydown',event=>{
  if(event.key.toLowerCase()==='h'&&!(event.target as HTMLElement).matches('input,select,textarea')) controls.hidden=!controls.hidden;
});
createApp(App).mount('#app');
add('Show book',readyBook);
add('Open book',async()=>{await readyBook();await press('.book-open');});
add('Advance 100 ms',()=>advance(100));
add('Advance 1 second',()=>advance(1000));
add('Verify opening',enterIntro);
add('Reach gameplay',reachGameplay);
add('Verify Options round trip',()=>optionsRoundTrip());
add('Verify early reversal',()=>optionsRoundTrip(true));
