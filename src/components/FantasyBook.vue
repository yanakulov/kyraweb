<template>
  <section class="fantasy-book" :class="{ 'is-opening': opening, 'is-options': isOptions, 'is-rendered': rendered, 'is-fallback': fallback }" :aria-label="t('Fables and Fiends, Book One')" @pointermove="move" @pointerdown="move" @pointerleave="rest">
    <div ref="host" class="book-table" @click="openBook">
      <img v-if="fallback && !isOptions" class="book-fallback" :src="`${base}assets/interface/book-cover.webp`" :alt="t('The original Kyrandia cover embossed into leather')" />
      <span v-if="!ready && !fallback && !isOptions" class="book-loading" role="status">{{ t('Preparing your story…') }}</span>
    </div>
    <div ref="letterbox" class="book-letterbox" aria-hidden="true"></div>
    <div v-if="hasReadingPage" ref="pageLayer" class="book-ui">
      <div ref="pageMenu" class="book-page-menu" data-book-page :class="{ 'is-visible': menuVisible }" :inert="!menuVisible" @click.stop @pointerdown.stop><slot /></div>
    </div>
    <div v-if="!isOptions" class="book-invitation">
      <button class="pixel-button book-open" type="button" :disabled="opening || (!ready && !fallback)" @click="openBook">{{ t('Open the book') }}</button>
      <slot name="invitation" />
    </div>
    <p v-if="opening" class="sr-only" role="status">{{ t('The story begins…') }}</p>
  </section>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { CSS3DObject, CSS3DRenderer } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import { bookTransition, candleMotion, optionsTransition, pageCameraDistance } from './bookTransition';
import { inscribePage, storybookFilm } from './storybookInk';
import { t } from '../i18n';

const props = withDefaults(defineProps<{ mode?: 'opening' | 'options'; snapshot?: HTMLCanvasElement; returning?: boolean; prologue?: boolean }>(), { mode: 'opening', returning: false, prologue: false });
const emit = defineEmits<{ open: []; ready: []; resume: [] }>();
const isOptions = props.mode === 'options';
const hasReadingPage = isOptions || props.prologue;
const base = import.meta.env.BASE_URL;
const host = ref<HTMLDivElement | null>(null), letterbox = ref<HTMLDivElement | null>(null);
const pageLayer = ref<HTMLDivElement | null>(null), pageMenu = ref<HTMLDivElement | null>(null);
const opening = ref(false), ready = ref(false), rendered = ref(false), fallback = ref(false), menuVisible = ref(false);
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
let reduced = motionPreference.matches;
let disposed = false, frame = 0, started = 0, entered = false, readySent = false;
let queuedOpen = false;
let returnStarted = 0, returnZoom = 0, currentZoom = isOptions ? 1 : 0, resumed = false;
let lastPaint = 0, flameTime = 0, hiddenAt = 0;
let renderer: T.WebGLRenderer | undefined, scene: T.Scene | undefined;
let camera: T.PerspectiveCamera, cover: T.Object3D;
let composer: EffectComposer | undefined, ao: GTAOPass | undefined, bloom: UnrealBloomPass | undefined, film: ShaderPass | undefined;
let uiRenderer: CSS3DRenderer | undefined, uiScene: T.Scene | undefined, menu: CSS3DObject | undefined;
let flamePivot: T.Group | undefined, candle: T.PointLight | undefined, cursorLight: T.PointLight | undefined;
let flameMaterial: T.MeshStandardMaterial | undefined;
let pageImage: ReturnType<typeof inscribePage> | undefined, introImage: T.Texture | undefined;
let portal: T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial>;
let observer: ResizeObserver | undefined, environment: T.WebGLRenderTarget | undefined;
let pointerX = 0, pointerY = 0, viewX = 0, viewY = 0, width = 1, height = 1, gameHeight = 1;
let pointerInside = false;
const pointer = new T.Vector2(), pointerRay = new T.Raycaster();
const pagePlane = new T.Plane(new T.Vector3(0,1,0), -.54), pointerPoint = new T.Vector3();
const textures = new Set<T.Texture>();
const assets = new AbortController();
const ink = { value: 0 }, colour = { value: 0 };
const pageCentre = new T.Vector3(0, .386, -.15);

function prepareImage(texture: T.Texture) {
  texture.colorSpace = T.SRGBColorSpace;
  texture.magFilter = T.NearestFilter; texture.minFilter = T.NearestFilter;
  textures.add(texture); return texture;
}
watch(() => props.snapshot, snapshot => {
  if (disposed || fallback.value || !pageImage || !portal || (!snapshot && !introImage)) return;
  const previous = pageImage.value, next = snapshot ? prepareImage(new T.CanvasTexture(snapshot)) : introImage!;
  pageImage.update(next,!!snapshot); portal.material.map = next;
  if (previous !== introImage) { textures.delete(previous); previous.dispose(); }
  schedule();
});

function enterGame() { if (!entered) { entered = true; emit('open'); } }
function resumeGame() { if (!resumed) { resumed = true; emit('resume'); } }
function optionsReady() {
  if (!readySent && !props.returning) { readySent = true; void nextTick(() => { if (!disposed && !props.returning) emit('ready'); }); }
}
function openBook() {
  if (isOptions || opening.value) return;
  if (!ready.value && !fallback.value) { queuedOpen = true; return; }
  queuedOpen = false;
  opening.value = true; started = performance.now();
  if (reduced || fallback.value) {
    if (!props.prologue) { enterGame(); return; }
    menuVisible.value = true; optionsReady();
  }
  schedule();
}
defineExpose({ openBook });
watch(() => props.prologue, reading => {
  if (reading || !opening.value || isOptions) return;
  menuVisible.value = false;
  if (reduced || fallback.value) { enterGame(); return; }
  started = performance.now() - Math.min(performance.now()-started, 4200);
  schedule();
});
function move(event: PointerEvent) {
  if (!host.value) return;
  const rect = host.value.getBoundingClientRect();
  pointer.set((event.clientX-rect.left)/rect.width*2-1, 1-(event.clientY-rect.top)/rect.height*2);
  pointerInside = true;
  if (!isOptions && !reduced && !opening.value && event.pointerType === 'mouse') {
    pointerX = pointer.x*.5; pointerY = -pointer.y*.5;
  }
  schedule();
}
function rest() { pointerInside = false; pointerX = pointerY = 0; schedule(); }
function schedule() { if (!disposed && !entered && !resumed && !document.hidden && ready.value && !frame) frame = requestAnimationFrame(draw); }
watch(() => props.returning, returning => {
  if (!isOptions || !returning) return;
  menuVisible.value = false;
  returnZoom = currentZoom; returnStarted = performance.now();
  if (reduced || fallback.value || !ready.value || currentZoom === 1) { resumeGame(); return; }
  schedule();
}, { immediate: true });

function visibilityChanged() {
  if (document.hidden) { hiddenAt = performance.now(); cancelAnimationFrame(frame); frame = 0; }
  else {
    const now = performance.now();
    if (hiddenAt && started) started += now-Math.max(started,hiddenAt);
    if (hiddenAt && returnStarted) returnStarted += now-Math.max(returnStarted,hiddenAt);
    hiddenAt = lastPaint = 0; schedule();
  }
}
function motionChanged(event: MediaQueryListEvent) {
  reduced = event.matches;
  if (reduced && isOptions && props.returning) resumeGame();
  else if (reduced && opening.value && !props.prologue) enterGame();
  else schedule();
}
function draw(now: number) {
  frame = 0;
  if (disposed || resumed || !renderer || !scene || document.hidden) return;
  const transitioning = (opening.value && !(props.prologue && readySent)) || (isOptions && (!readySent || props.returning));
  // The idle flame needs 30 rendered frames, while transitions retain full refresh.
  if (!transitioning && !reduced && lastPaint && now-lastPaint < 1000/30) { schedule(); return; }
  const delta = lastPaint ? (now-lastPaint)/1000 : 0;
  lastPaint = now;
  if (!reduced) flameTime += delta;
  const follow = 1-Math.exp(-8*delta);
  viewX += (pointerX - viewX) * follow; viewY += (pointerY - viewY) * follow;
  if (isOptions && !started) started = now;
  const t = isOptions
    ? optionsTransition(reduced ? 1400 : now-(props.returning ? returnStarted : started), props.returning, returnZoom)
    : bookTransition(opening.value ? (reduced && props.prologue ? 4200 : now - started) : 0, props.prologue);
  currentZoom = t.zoom;
  cover.rotation.z = t.hinge * Math.PI;
  ink.value = t.ink; colour.value = t.colour;
  portal.visible = t.zoom > .65;
  portal.material.opacity = T.MathUtils.smoothstep(t.zoom, .65, 1);
  const effects = 1 - T.MathUtils.smoothstep(t.zoom, .55, .95);
  if (ao) { ao.enabled = effects > 0; ao.blendIntensity = .65 * effects; }
  if (bloom) { bloom.enabled = effects > 0; bloom.strength = .12 * effects; }
  if (film) film.uniforms.effect.value = effects;
  // Portrait framing pulls back as the cover opens, keeping the whole spread in view.
  const fit = Math.max(1, (3.7 + t.hinge * 2.8) / (width / height * 5.4)) * (1 + .53 * Math.sin(t.hinge * Math.PI));
  const portrait = width/height < .85;
  const readingView = isOptions ? 1 : hasReadingPage ? t.hinge : 0;
  const focusX = T.MathUtils.lerp(-t.hinge*(portrait ? 1.55 : 1.25), portrait ? -3.1 : -1.55, readingView);
  const focus = new T.Vector3(focusX, T.MathUtils.lerp(.1,.45,readingView), 0);
  const from = new T.Vector3(focusX + viewX * .28, (7.8 - viewY * .2) * fit, 5.7 * fit);
  if (readingView) {
    const distance = Math.max(4.6, 3.05/(width/height))/(2*Math.tan(camera.fov*Math.PI/360));
    const tilt = portrait ? .18 : .36;
    from.lerp(focus.clone().add(new T.Vector3(0, Math.cos(tilt)*distance, Math.sin(tilt)*distance)),readingView);
  }
  const end = new T.Vector3(0, pageCentre.y + pageCameraDistance(height, gameHeight, camera.fov), pageCentre.z + .00001);
  camera.position.lerpVectors(from, end, t.zoom);
  camera.up.set(0, 1 - t.zoom, -t.zoom).normalize();
  camera.lookAt(focus.lerp(pageCentre, t.zoom));
  if (cursorLight) {
    pointerRay.setFromCamera(pointer,camera);
    if (pointerInside && pointerRay.ray.intersectPlane(pagePlane,pointerPoint)) {
      cursorLight.position.copy(pointerPoint); cursorLight.position.y += .85;
      cursorLight.intensity = .7*(1-t.zoom);
    } else cursorLight.intensity = 0;
  }
  if (letterbox.value) letterbox.value.style.opacity = String(Math.max(0, (t.zoom - .72) / .28));
  const flicker = candleMotion(flameTime);
  if (flamePivot) {
    flamePivot.rotation.set(flicker.bendX, 0, flicker.bendZ);
    flamePivot.scale.y = flicker.scaleY;
    if (candle) { flamePivot.getWorldPosition(candle.position); candle.position.y += .15*flicker.scaleY; }
  }
  if (candle) { candle.intensity = 18*flicker.intensity; candle.color.setRGB(1, .5+.15*flicker.warmth, .16+.035*flicker.warmth); }
  if (flameMaterial) { flameMaterial.emissiveIntensity = 4*flicker.intensity; flameMaterial.emissive.setRGB(1,.20+.08*flicker.warmth,.009+.006*flicker.warmth); }
  // GTAO draws the geometry again; update the moving cover's shadow only once.
  renderer.shadowMap.needsUpdate = true;
  if (t.zoom === 1) renderer.render(scene, camera);
  else composer?.render(0);
  rendered.value = true;
  menuVisible.value = isOptions ? t.done && !props.returning : props.prologue && opening.value && t.ink === 1;
  if (menu) menu.visible = menuVisible.value;
  if (uiRenderer && uiScene) uiRenderer.render(uiScene, camera);
  if (isOptions && t.done) {
    if (props.returning) { resumeGame(); return; }
    optionsReady();
  } else if (menuVisible.value) optionsReady();
  else if (!isOptions && t.done) { enterGame(); return; }
  if (!reduced || transitioning || Math.abs(viewX-pointerX)+Math.abs(viewY-pointerY)>.002) schedule();
}

onMounted(async () => {
  try {
    if (!host.value || resumed) return;
    document.addEventListener('visibilitychange', visibilityChanged);
    motionPreference.addEventListener('change', motionChanged);
    renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;
    renderer.outputColorSpace = T.SRGBColorSpace;
    // Grade the 3D scene in its pass, so the last frame can retain original game colours.
    renderer.toneMapping = T.NoToneMapping;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.value.prepend(renderer.domElement);
    scene = new T.Scene(); scene.background = new T.Color(0x1b130c);
    camera = new T.PerspectiveCamera(35, 1, .05, 100);
    const [modelResult, landscapeResult] = await Promise.allSettled([
      (async () => {
        const response = await fetch(`${base}assets/interface/storybook.glb.gz`, { signal: assets.signal });
        if (!response.ok) throw new Error(`Book model could not load (${response.status})`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        // GitHub serves the packed file; proxies may already have decompressed it.
        const buffer = bytes[0] === 0x1f && bytes[1] === 0x8b
          ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
          : bytes.buffer;
        return new GLTFLoader().parseAsync(buffer, '');
      })(),
      props.snapshot ? Promise.resolve(new T.CanvasTexture(props.snapshot))
        : isOptions ? Promise.reject(new Error('Options needs a paused game snapshot'))
          : new T.TextureLoader().loadAsync(`${base}assets/intro/logo_bg.png`),
    ]);
    // Own successful loads even if their sibling fails or the book was unmounted.
    if (landscapeResult.status === 'fulfilled') textures.add(landscapeResult.value);
    if (modelResult.status === 'fulfilled') scene.add(modelResult.value.scene);
    scene.traverse(object => {
      if (!(object instanceof T.Mesh)) return;
      object.castShadow = true; object.receiveShadow = true;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        for (const value of Object.values(material)) if (value instanceof T.Texture) { textures.add(value); value.anisotropy = 8; }
      }
    });
    if (disposed) { release(); return; }
    if (modelResult.status === 'rejected') throw modelResult.reason;
    if (landscapeResult.status === 'rejected') throw landscapeResult.reason;
    const model = modelResult.value;
    let landscape = landscapeResult.value;
    if (!(landscape instanceof T.CanvasTexture)) introImage = landscape;
    if (props.snapshot && landscape.image !== props.snapshot) {
      if (landscape !== introImage) { textures.delete(landscape); landscape.dispose(); }
      landscape = new T.CanvasTexture(props.snapshot);
    }
    const hinge = model.scene.getObjectByName('CoverHinge');
    if (!hinge) throw new Error('The Blender book is missing its cover hinge');
    cover = hinge;
    prepareImage(landscape);
    const page = model.scene.getObjectByName('Blank_right_parchment') as T.Mesh<T.BufferGeometry,T.MeshStandardMaterial> | undefined;
    if (!page?.isMesh) throw new Error('The Blender book is missing its parchment');
    if (hasReadingPage) {
      model.scene.traverse(object => { if (/^(Inside_folio_bookplate|Original_Fables_and_Fiends_bookplate|Original_Book_One_bookplate)$/.test(object.name)) object.visible = false; });
      const lining = model.scene.getObjectByName('Front_board_suede_lining') as T.Mesh<T.BufferGeometry,T.MeshStandardMaterial> | undefined;
      if (lining?.isMesh) { lining.material.dispose(); lining.material = page.material.clone(); }
      if (pageMenu.value && pageLayer.value) {
        uiRenderer = new CSS3DRenderer(); uiRenderer.domElement.className = 'book-projection'; pageLayer.value.append(uiRenderer.domElement);
        uiScene = new T.Scene(); menu = new CSS3DObject(pageMenu.value);
        menu.position.set(-3.1,.528,-.03); menu.rotation.x = -Math.PI/2; menu.scale.setScalar(2.55/320); menu.visible = false; uiScene.add(menu);
      }
    }
    page.material = page.material.clone();
    pageImage = inscribePage(page.material, landscape, ink, colour, !!props.snapshot);
    // Only the final approach becomes a full, unlit game frame. Until then ink is on paper.
    portal = new T.Mesh(new T.PlaneGeometry(2.6, 1.625), new T.MeshBasicMaterial({ map: landscape, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    portal.rotation.x = -Math.PI / 2; portal.position.copy(pageCentre); portal.visible = false; scene.add(portal);
    const pmrem = new T.PMREMGenerator(renderer), room = new RoomEnvironment();
    environment = pmrem.fromScene(room, .04); scene.environment = environment.texture;
    scene.environmentIntensity = .06; room.dispose(); pmrem.dispose();
    scene.add(new T.HemisphereLight(0x8fa8bf, 0x221006, .10));
    const key = new T.DirectionalLight(0xffd6a0, .8); key.position.set(3, 5, -1.8); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -8; key.shadow.camera.right = 8;
    key.shadow.camera.top = 8; key.shadow.camera.bottom = -8; key.shadow.normalBias = .015; scene.add(key);
    candle = new T.PointLight(0xffad58, 18, 14, 2); candle.position.set(3.6, 1.96, -1.8);
    scene.add(candle);
    cursorLight = new T.PointLight(0x9fdbb3,0,3,2); scene.add(cursorLight);
    const flame = model.scene.getObjectByName('Candle_flame') as T.Mesh<T.BufferGeometry,T.MeshStandardMaterial> | undefined;
    if (flame?.isMesh && flame.parent) {
      flame.castShadow = false; flame.receiveShadow = false;
      model.scene.updateMatrixWorld(true);
      const bounds = new T.Box3().setFromObject(flame), parent = flame.parent;
      const wick = new T.Vector3((bounds.min.x+bounds.max.x)/2, bounds.min.y, (bounds.min.z+bounds.max.z)/2);
      flamePivot = new T.Group(); flamePivot.position.copy(parent.worldToLocal(wick)); parent.add(flamePivot); flamePivot.attach(flame);
      flameMaterial = flame.material;
    }
    const moon = new T.DirectionalLight(0x7fadd4, .12); moon.position.set(-5, 4, -6); scene.add(moon);
    composer = new EffectComposer(renderer);
    composer.renderTarget1.samples = composer.renderTarget2.samples = 2;
    composer.addPass(new RenderPass(scene, camera));
    ao = new GTAOPass(scene, camera); ao.output = GTAOPass.OUTPUT.Default;
    ao.updateGtaoMaterial({ radius: .22, thickness: .12, distanceFallOff: 1, samples: 16 });
    composer.addPass(ao);
    bloom = new UnrealBloomPass(new T.Vector2(1,1), .12, .25, 2.8); composer.addPass(bloom);
    film = new ShaderPass(storybookFilm); composer.addPass(film); composer.addPass(new OutputPass());
    const candlestick = model.scene.getObjectByName('CandleRoot');
    const resize = () => {
      if (!host.value || !renderer) return;
      ({ width, height } = host.value.getBoundingClientRect());
      const portrait = width / height < .85;
      candlestick?.position.set(portrait ? 1.7 : 3.6, -.14, portrait ? -3.3 : -1.8);
      candle?.position.set(portrait ? 1.7 : 3.6, 1.96, portrait ? -3.3 : -1.8);
      gameHeight = (host.value.closest('.app')?.getBoundingClientRect().width ?? Math.min(width - 8, 1280, (height - 8) * 1.6)) / 1.6;
      if (letterbox.value) { letterbox.value.style.width = `${gameHeight * 1.6}px`; letterbox.value.style.height = `${gameHeight}px`; }
      renderer.setSize(width, height); composer?.setSize(width, height);
      uiRenderer?.setSize(width,height);
      ao?.setSize(Math.ceil(width*renderer.getPixelRatio()/2), Math.ceil(height*renderer.getPixelRatio()/2));
      camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix(); schedule();
    };
    ready.value = true; observer = new ResizeObserver(resize); observer.observe(host.value);
    resize(); schedule();
    if (queuedOpen) openBook();
  } catch (error) {
    release();
    if (!disposed) {
      fallback.value = rendered.value = true;
      if (isOptions) { menuVisible.value = !props.returning; if (props.returning) resumeGame(); else optionsReady(); }
      else if (queuedOpen) openBook();
      console.warn('Book preview unavailable', error);
    }
  }
});

function release() {
  cancelAnimationFrame(frame); frame = 0; ready.value = false;
  if (pageMenu.value && pageLayer.value) { pageLayer.value.append(pageMenu.value); pageMenu.value.style.transform = ''; pageMenu.value.style.display = ''; }
  uiRenderer?.domElement.remove(); uiRenderer = undefined; uiScene = undefined; menu = undefined;
  scene?.traverse(object => {
    if (object instanceof T.PointLight || object instanceof T.DirectionalLight) object.shadow.dispose();
    if (!(object instanceof T.Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
  });
  textures.forEach(texture => texture.dispose()); textures.clear();
  composer?.passes.forEach(pass => pass.dispose()); composer?.dispose();
  // These materials aren't released by the installed Three 0.186 pass disposers.
  ao?.gtaoMaterial.dispose(); ao?.blendMaterial.dispose(); bloom?.materialHighPassFilter.dispose();
  environment?.dispose(); renderer?.dispose(); renderer?.domElement.remove();
}
onBeforeUnmount(() => {
  disposed = true; assets.abort(); cancelAnimationFrame(frame); observer?.disconnect();
  document.removeEventListener('visibilitychange', visibilityChanged); motionPreference.removeEventListener('change', motionChanged); release();
});
</script>

<style scoped>
.fantasy-book { position: fixed; inset: 0; z-index: 20; overflow: hidden; isolation: isolate; background: #1b130c; }
.fantasy-book.is-options:not(.is-rendered) { visibility: hidden; pointer-events: none; }
.book-ui { position: absolute; inset: 0; pointer-events: none; }
.book-ui :deep(.book-projection) { position: absolute; inset: 0; pointer-events: none; }
.book-page-menu { width: 320px; height: 420px; overflow: auto; overscroll-behavior: contain; color: #38240f; visibility: hidden; pointer-events: none !important; backface-visibility: hidden; }
.book-page-menu.is-visible { visibility: visible; pointer-events: auto !important; }
.is-fallback .book-page-menu { position: absolute; left: 50%; top: 50%; width: min(320px, calc(100vw - 32px)); height: min(460px, calc(100svh - 48px)); transform: translate(-50%,-50%) !important; background: #d1b885; padding: 14px; border: 3px double #856639; box-shadow: 0 20px 80px #000b; }
.book-table { position: absolute; inset: 0; }
.book-table :deep(canvas) { display: block; width: 100%; height: 100%; touch-action: pan-y; }
.book-fallback { position: absolute; inset: 8% 0 22%; display: block; height: 70%; max-width: 80%; object-fit: contain; margin: auto; filter: drop-shadow(0 20px 20px #000); transform: rotate(-5deg); }
.book-loading { position: absolute; inset: 45% 0 auto; text-align: center; color: #d8bb7b; font-size: 13px; }
.book-letterbox { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 0 100vmax #080a09; opacity: 0; pointer-events: none; }
.book-invitation { position: absolute; left: 0; right: 0; bottom: max(30px, env(safe-area-inset-bottom)); text-align: center; transition: opacity 300ms; }
.book-invitation { display: flex; justify-content: center; align-items: center; flex-wrap: wrap; gap: 12px; padding-inline: 16px; }
.book-open { min-width: 220px; min-height: 54px; font-size: 15px; background: #252519ee; border-color: #a78849; box-shadow: 0 3px 0 #090b08, inset 0 0 0 3px #383324; }
.is-opening .book-invitation { opacity: 0; pointer-events: none; }
@media (max-width: 600px) { .book-invitation { bottom: max(36px, env(safe-area-inset-bottom)); } }
@media (prefers-reduced-motion: reduce) { .book-invitation { transition: none; } }
</style>
