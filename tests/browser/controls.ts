import { createApp, nextTick } from 'vue';
import App from '../../src/App.vue';
import { readSaveSlots, writeSaveSlot } from '../../src/engine/gameplay/saveStorage';
import { t } from '../../src/i18n';
import '../../src/styles.css';

// Real application and rendering, with a visible clock for reproducible review.
let now = performance.now(), id = 0, busy = false;
const frames = new Map<number, FrameRequestCallback>();
performance.now = () => now;
window.requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
window.cancelAnimationFrame = handle => { frames.delete(handle); };
async function advance(ms: number) {
  for (let elapsed = 0; elapsed < ms; elapsed += 50) {
    now += Math.min(50, ms - elapsed);
    const batch = [...frames.values()]; frames.clear();
    batch.forEach(callback => callback(now));
    await nextTick();
    if (elapsed % 500 === 0) await new Promise(resolve => setTimeout(resolve, 0));
  }
}
const aside = document.querySelector('aside')!;
const status = document.querySelector<HTMLOutputElement>('#verification-status')!;
function details() { return [...document.querySelectorAll('.folio-message,.game-error,.scene-notice')].map(el=>el.textContent?.trim()).filter(Boolean).join('; '); }
function assert(value: unknown, message: string): asserts value { if (!value) throw Error(message); }
async function until(predicate: () => boolean, message: string, timeout = 45000) {
  const deadline = Date.now()+timeout;
  while (!predicate()) {
    assert(Date.now()<deadline, `${message}. ${details() || 'Timed out waiting for asynchronous assets/state.'}`);
    await advance(100); await new Promise(resolve=>setTimeout(resolve,25));
  }
  await nextTick();
}
async function runCheck(button: HTMLButtonElement, label: string, action: () => Promise<void>, pass = label) {
  if (busy) return;
  busy=true; status.textContent=`RUNNING — ${label}`; status.dataset.result='running';
  aside.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=true);
  try { await action(); status.textContent=`PASS — ${pass}`; status.dataset.result='pass'; if (!button.id) button.textContent=`PASS — ${pass}`; }
  catch (error) { status.textContent=`FAIL — ${label}: ${error instanceof Error ? error.message : String(error)}`; status.dataset.result='fail'; console.error(`Controls verification failed: ${label}`,error); }
  finally { busy=false; aside.querySelectorAll<HTMLButtonElement>('button').forEach(b=>b.disabled=false); }
}
for (const [selector, ms] of [['#second',1000],['#half',500],['#minute',60000]] as const) {
  const button=document.querySelector<HTMLButtonElement>(selector)!;
  button.onclick=()=>void runCheck(button,button.textContent!,()=>advance(ms));
}
const book = () => document.querySelector<HTMLElement>('.fantasy-book.is-options');
function menu() { const el=document.querySelector<HTMLElement>('.book-page-menu.is-visible .folio-menu'); assert(el,'Options page is not visible'); return el; }
function hud() { const el=document.querySelector<HTMLButtonElement>('.hud-options'); assert(el&&!el.disabled,'Reach gameplay and let Brandon finish the current sequence first.'); return el; }
async function click(label: string, scope: ParentNode = document) {
  const translated=t(label);
  const button=[...scope.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===translated||b.getAttribute('aria-label')===translated);
  assert(button&&!button.matches(':disabled'),`Missing or disabled control: ${label}. ${details()}`);
  button.focus(); button.click(); await nextTick();
}
async function bookReady() {
  await until(()=>!!document.querySelector('.book-page-menu.is-visible .folio-menu[aria-busy="false"]'),'Options did not finish its pullback');
  assert(menu().contains(document.activeElement),'Options did not receive keyboard focus after its pullback');
}
async function openOptions() { assert(!book(),'Close Options before starting this check'); const trigger=hud(); trigger.focus(); trigger.click(); await bookReady(); return trigger; }
async function closeOptions() { menu().dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); await until(()=>!book(),'Options did not finish its return zoom'); }
async function choose(id: string, label: string) {
  const trigger=menu().querySelector<HTMLButtonElement>(`[role="combobox"][aria-controls="${id}-choices"]`);
  assert(trigger,'Missing book dropdown: '+id); trigger.click(); await nextTick();
  const options=menu().querySelector<HTMLElement>(`#${id}-choices`);
  assert(options?.getAttribute('role')==='listbox','Custom dropdown did not open');
  const option=[...options.querySelectorAll<HTMLButtonElement>('[role="option"]')].find(el=>el.textContent?.replace('✧','').trim()===t(label));
  assert(option,'Missing dropdown choice: '+label); option.click(); await nextTick();
  assert(trigger.getAttribute('aria-expanded')==='false','Dropdown did not close after selection');
  assert(document.activeElement===trigger,'Dropdown did not restore keyboard focus');
}
const speedLabels = { slowest: 'Slowest', slow: 'Slow', fast: 'Fast', fastest: 'Fastest' };
function selectedSpeed() {
  const label=menu().querySelector('#book-speed-value')?.textContent;
  const speed=Object.entries(speedLabels).find(([,value])=>t(value)===label)?.[0];
  assert(speed,'The book does not display a known walk speed'); return speed as keyof typeof speedLabels;
}
function addCheck(label: string, action: () => Promise<void>, pass = label) {
  const button=document.createElement('button'); button.textContent=label; aside.insertBefore(button,status);
  button.onclick=()=>void runCheck(button,label,action,pass);
}
// Hide the clock for clean captures without changing the rendered application.
document.addEventListener('keydown', event => {
  if (event.key.toLowerCase() !== 'h' || (event.target as HTMLElement).matches('input, select, textarea')) return;
  const controls = document.querySelector('aside')!;
  controls.hidden = !controls.hidden;
});
createApp(App).mount('#app');
addCheck('Reach gameplay',async()=>{
  if (book()&&!document.querySelector('.journey-choice')) await closeOptions();
  if (document.querySelector('.hud-options:not(:disabled)')) return;
  const open=document.querySelector<HTMLButtonElement>('.book-open');
  if(open) { await until(()=>!open.disabled,'The opening book did not load'); open.click(); await nextTick(); }
  const deadline=Date.now()+120000;
  for(let elapsed=0;elapsed<240000;elapsed+=1000) {
    const prologue=document.querySelector<HTMLButtonElement>('.prologue-skip');
    if(prologue&&!prologue.disabled) { prologue.click(); await nextTick(); }
    const start=document.querySelector<HTMLButtonElement>('.book-page-menu.is-visible .journey-choice');
    if(start&&!start.disabled) { start.click(); await nextTick(); }
    const next=document.querySelector<HTMLButtonElement>('.continue-button');
    if(next&&!next.disabled) { next.click(); await nextTick(); }
    if(document.querySelector('.hud-options:not(:disabled)')) return;
    assert(Date.now()<deadline,`Gameplay preparation exceeded two real minutes. ${details()}`);
    assert(!document.querySelector('.game-error'),details());
    await advance(1000); await new Promise(resolve=>setTimeout(resolve,30));
  }
  throw Error(`Gameplay did not become interactive within 240 logical seconds. ${details()}`);
},'gameplay ready');
const verify = document.createElement('button');
verify.textContent = 'Verify swipe cursor';
aside.insertBefore(verify,status);
verify.onclick = () => void runCheck(verify,'Verify swipe cursor',async () => {
  hud(); assert(!book(),'Close Options before checking gestures');
  const canvas = document.querySelector<HTMLCanvasElement>('.stage canvas')!;
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
    await nextTick(); assert(book(),'Tap must activate OPTIONS at the persistent cursor, not at the finger');
    await bookReady(); await closeOptions();
    assert(!document.querySelector('.folio-menu'),'Options remained after its return zoom');
  } finally { canvas.setPointerCapture = capture; }
},'relative swipe and book Options');

const panelCheck = document.createElement('button');
panelCheck.textContent = 'Verify in-game panels';
aside.insertBefore(panelCheck,status);
panelCheck.onclick = () => void runCheck(panelCheck,'Verify in-game panels',async () => {
  const trigger=await openOptions();
  assert(!document.querySelector('.masthead,.game-toolbar'),'External interface remains');
  for(const label of ['Options','How to play','Settings']) {
    if(label!=='Options') await click(label,menu());
    const dialog=menu(),page=dialog.closest<HTMLElement>('[data-book-page]')!;
    const box=dialog.getBoundingClientRect(),bounds=page.getBoundingClientRect();
    assert(box.width>150&&box.height>150,`${label} is too small to read`);
    assert(box.left>=-2&&box.right<=innerWidth+2&&box.top>=-2&&box.bottom<=innerHeight+2,`${label} escapes the viewport`);
    assert(box.left>=bounds.left-2&&box.right<=bounds.right+2&&box.top>=bounds.top-2&&box.bottom<=bounds.bottom+2,`${label} escapes its book page`);
    assert(dialog.contains(document.activeElement),`${label} lost keyboard focus`);
    if(label==='Settings') assert(dialog.contains(document.querySelector('.folio-credits')),'Credits are outside the book');
    const controls=[...dialog.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')].filter(el=>el.getClientRects().length);
    assert(controls.length,`${label} has no usable controls`);
    controls.at(-1)!.focus(); controls.at(-1)!.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));
    assert(document.activeElement===controls[0],`${label} lets Tab leave its page`);
    controls[0].dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true}));
    assert(document.activeElement===controls.at(-1),`${label} lets Shift+Tab leave its page`);
    if(label!=='Options') await click('Back to Options',dialog);
  }
  await closeOptions(); assert(document.activeElement===trigger,'Returning from the book did not restore focus');
},'book pages contain controls and focus');

const TEST_NAME='Codex UI round-trip (test)';
function safeTestSlot() {
  const slot=readSaveSlots()[2];
  assert(!slot.error,`Chapter 3 is damaged; it was left untouched. ${slot.error}`);
  assert(!slot.save||slot.save.name===TEST_NAME,'Chapter 3 contains a user save; it was left untouched. Use an empty third slot to run this check.');
}
addCheck('Verify saved chapter round trip',async()=>{
  hud(); safeTestSlot();
  const untouched=[localStorage.getItem('kyrandia.save.1'),localStorage.getItem('kyrandia.save.2')];
  await openOptions(); await click('Settings',menu());
  const originalSpeed=selectedSpeed();
  await click('Back to Options',menu()); await click('Save game',menu());
  const name=menu().querySelector('input')!; name.value=TEST_NAME; name.dispatchEvent(new Event('input',{bubbles:true})); await nextTick();
  safeTestSlot();
  let slot=menu().querySelectorAll<HTMLElement>('.folio-saves li')[2]; assert(slot,'Chapter 3 is absent');
  await click('Save here',slot);
  if([...slot.querySelectorAll('button')].some(b=>b.textContent?.trim()===t('Replace'))) { safeTestSlot(); await click('Replace',slot); }
  const record=readSaveSlots()[2].save;
  assert(record?.name===TEST_NAME&&menu().querySelector('.folio-message')?.textContent?.includes(t(`“${TEST_NAME}” saved.`)),`Saving failed: ${details()}`);
  assert(record.state.settings.walkSpeed===originalSpeed,'Saved walk speed differs from the displayed setting');
  const savedBytes=localStorage.getItem('kyrandia.save.3');
  await click('Back to Options',menu()); await click('Settings',menu());
  await choose('book-speed',originalSpeed==='slowest'?'Fastest':'Slowest');
  assert(selectedSpeed()!==originalSpeed,'Walk speed did not change');
  await click('Back to Options',menu()); await click('Load game',menu());
  slot=menu().querySelectorAll<HTMLElement>('.folio-saves li')[2];
  assert(slot.querySelector('strong')?.textContent===TEST_NAME,'Load targeted the wrong chapter');
  await click('Load chapter',slot); await until(()=>!book(),'Saved chapter did not load and return to gameplay');
  assert(localStorage.getItem('kyrandia.save.3')===savedBytes,'Loading unexpectedly rewrote the saved chapter');
  await openOptions(); await click('Settings',menu());
  assert(selectedSpeed()===originalSpeed,'Loading did not restore the saved walk speed');
  assert(localStorage.getItem('kyrandia.save.1')===untouched[0]&&localStorage.getItem('kyrandia.save.2')===untouched[1],'Another save slot changed');
  await closeOptions();
},'chapter 3 saved, changed and restored through UI');

addCheck('Verify Russian book',async()=>{
  await openOptions(); await click('Settings',menu());
  const previous=menu().querySelector('#book-language-value')?.textContent;
  await choose('book-language','English');
  assert(menu().querySelector('h2')?.textContent==='Settings','English did not apply before switching to Russian');
  await choose('book-language','Русский');
  assert(document.documentElement.lang==='ru','Document language did not change');
  assert(menu().querySelector('h2')?.textContent==='Настройки','Settings heading did not translate');
  assert(menu().querySelector('#book-language-label')?.textContent==='Язык','Language control did not translate');
  assert(localStorage.getItem('kyrandia.language')==='ru','Russian preference was not persisted');
  assert(!menu().querySelector('select'),'A native dropdown remains in the book');
  await click('Back to Options',menu());
  assert(menu().querySelector('h2')?.textContent==='Меню','Options heading did not translate');
  assert(!menu().textContent?.includes('Инвентарь'),'Unneeded inventory menu remains');
  await click('How to play',menu());
  assert(/[А-Яа-яЁё]/.test(menu().querySelector('.folio-help')?.textContent??''),'Help was not translated');
  await closeOptions(); await openOptions(); await click('Settings',menu());
  assert(menu().querySelector('#book-language-value')?.textContent==='Русский','Language changed when reopening the book');
  if(previous==='English') await choose('book-language','English');
  await closeOptions();
},'Russian menus, custom choices and persisted language');

addCheck('Verify Russian letter',async()=>{
  hud(); safeTestSlot();
  const record=readSaveSlots()[2].save;
  assert(record?.state.rooms[0]?.runtime,'Run the saved chapter check from Brandon’s home first.');
  const savedBytes=localStorage.getItem('kyrandia.save.3')!;
  const state=structuredClone(record.state), room=state.rooms[0];
  state.currentRoom=0; state.quest.flags=[...new Set([...state.quest.flags,53,129,242])];
  room.pos={x:164,y:118}; room.facing=5; room.itemInHand='letter'; room.treeSpoken=true;
  room.inventorySlots=room.inventorySlots.map(item=>item==='letter'?null:item);
  room.runtime!.actorVisible=true; room.runtime!.actorShape=null;
  try {
    writeSaveSlot(2,{...record,state});
    await openOptions(); await click('Load game',menu());
    await click('Load chapter',menu().querySelectorAll('.folio-saves li')[2]);
    await until(()=>!book(),'Letter chapter did not load');
  } finally { localStorage.setItem('kyrandia.save.3',savedBytes); }
  await openOptions(); await click('Settings',menu()); await choose('book-language','Русский'); await closeOptions();
  const canvas=document.querySelector<HTMLCanvasElement>('.stage canvas')!, box=canvas.getBoundingClientRect();
  const clientX=box.left+164/320*box.width, clientY=box.top+90/200*box.height;
  canvas.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'mouse',clientX,clientY}));
  canvas.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX,clientY}));
  await until(()=>!!document.querySelector('.translated-letter'),'Clicking Brandon did not open the decoded letter');
  const letter=document.querySelector<HTMLElement>('.translated-letter')!;
  assert(letter.textContent?.includes('Малколм'),'The letter is not translated');
  assert(letter.scrollHeight<=letter.clientHeight,'Russian letter text is clipped vertically');
  assert(letter.scrollWidth<=letter.clientWidth,'Russian letter text is clipped horizontally');
  const area=letter.getBoundingClientRect();
  assert(area.left>=box.left&&area.right<=box.right&&area.top>=box.top&&area.bottom<=box.top+136/200*box.height,'The letter escapes the scene');
},'decoded letter reads in Russian without clipping');
