<template>
  <section class="fantasy-book" :class="{ 'is-opening': opening }" aria-label="Fables and Fiends, Book One">
    <div ref="host" class="book-table" @pointermove="move" @pointerleave="rest" @click="openBook">
      <img v-if="fallback" class="book-fallback" :src="`${base}assets/interface/book-cover.webp`" alt="The original Kyrandia cover embossed into leather" />
      <span v-if="!ready && !fallback" class="book-loading" role="status">Preparing your story…</span>
    </div>
    <div ref="letterbox" class="book-letterbox" aria-hidden="true"></div>
    <div class="book-invitation">
      <button class="pixel-button book-open" type="button" :disabled="opening || (!ready && !fallback)" @click="openBook">Open the book</button>
    </div>
    <p v-if="opening" class="sr-only" role="status">The story begins…</p>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import * as T from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { bookTransition, pageCameraDistance } from './bookTransition';
import { inscribePage, storybookFilm } from './storybookInk';

const emit = defineEmits<{ open: [] }>();
const base = import.meta.env.BASE_URL;
const host = ref<HTMLDivElement | null>(null), letterbox = ref<HTMLDivElement | null>(null);
const opening = ref(false), ready = ref(false), fallback = ref(false);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let disposed = false, frame = 0, started = 0, entered = false;
let renderer: T.WebGLRenderer | undefined, scene: T.Scene | undefined;
let camera: T.PerspectiveCamera, cover: T.Object3D;
let composer: EffectComposer | undefined, ao: GTAOPass | undefined, bloom: UnrealBloomPass | undefined, film: ShaderPass | undefined;
let portal: T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial>;
let observer: ResizeObserver | undefined, environment: T.WebGLRenderTarget | undefined;
let pointerX = 0, pointerY = 0, viewX = 0, viewY = 0, width = 1, height = 1, gameHeight = 1;
const textures = new Set<T.Texture>();
const assets = new AbortController();
const ink = { value: 0 }, colour = { value: 0 };
const pageCentre = new T.Vector3(0, .386, -.15);

function enterGame() { if (!entered) { entered = true; emit('open'); } }
function openBook() {
  if (opening.value || (!ready.value && !fallback.value)) return;
  opening.value = true; started = performance.now();
  if (reduced || fallback.value) { enterGame(); return; }
  schedule();
}
function move(event: PointerEvent) {
  if (reduced || opening.value || event.pointerType !== 'mouse' || !host.value) return;
  const rect = host.value.getBoundingClientRect();
  pointerX = (event.clientX - rect.left) / rect.width - .5;
  pointerY = (event.clientY - rect.top) / rect.height - .5;
  schedule();
}
function rest() { pointerX = pointerY = 0; schedule(); }
function schedule() { if (!disposed && ready.value && !frame) frame = requestAnimationFrame(draw); }
function draw(now: number) {
  frame = 0;
  if (disposed || !renderer || !scene) return;
  viewX += (pointerX - viewX) * .12; viewY += (pointerY - viewY) * .12;
  const t = bookTransition(opening.value ? now - started : 0);
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
  const focusX = -t.hinge * (width / height < .85 ? 1.55 : 1.25);
  const from = new T.Vector3(focusX + viewX * .28, (7.8 - viewY * .2) * fit, 5.7 * fit);
  const end = new T.Vector3(0, pageCentre.y + pageCameraDistance(height, gameHeight, camera.fov), pageCentre.z + .00001);
  camera.position.lerpVectors(from, end, t.zoom);
  camera.up.set(0, 1 - t.zoom, -t.zoom).normalize();
  camera.lookAt(new T.Vector3(focusX, .1, 0).lerp(pageCentre, t.zoom));
  if (letterbox.value) letterbox.value.style.opacity = String(Math.max(0, (t.zoom - .72) / .28));
  // GTAO draws the geometry again; update the moving cover's shadow only once.
  renderer.shadowMap.needsUpdate = true;
  if (t.done) renderer.render(scene, camera);
  else composer?.render(0);
  if (t.done) { enterGame(); return; }
  if (opening.value || Math.abs(viewX - pointerX) + Math.abs(viewY - pointerY) > .002) schedule();
}

onMounted(async () => {
  try {
    if (!host.value) return;
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
      new T.TextureLoader().loadAsync(`${base}assets/intro/logo_bg.png`),
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
    const model = modelResult.value, landscape = landscapeResult.value;
    const hinge = model.scene.getObjectByName('CoverHinge');
    if (!hinge) throw new Error('The Blender book is missing its cover hinge');
    cover = hinge;
    landscape.colorSpace = T.SRGBColorSpace;
    landscape.magFilter = T.NearestFilter; landscape.minFilter = T.NearestFilter;
    const page = model.scene.getObjectByName('Blank_right_parchment') as T.Mesh<T.BufferGeometry,T.MeshStandardMaterial> | undefined;
    if (!page?.isMesh) throw new Error('The Blender book is missing its parchment');
    page.material = page.material.clone();
    inscribePage(page.material, landscape, ink, colour);
    // Only the final approach becomes a full, unlit game frame. Until then ink is on paper.
    portal = new T.Mesh(new T.PlaneGeometry(2.6, 1.625), new T.MeshBasicMaterial({ map: landscape, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    portal.rotation.x = -Math.PI / 2; portal.position.copy(pageCentre); portal.visible = false; scene.add(portal);
    const pmrem = new T.PMREMGenerator(renderer), room = new RoomEnvironment();
    environment = pmrem.fromScene(room, .04); scene.environment = environment.texture;
    scene.environmentIntensity = .18; room.dispose(); pmrem.dispose();
    scene.add(new T.HemisphereLight(0x8fa8bf, 0x221006, .22));
    const key = new T.DirectionalLight(0xffd6a0, 1.2); key.position.set(3, 5, -1.8); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); key.shadow.camera.left = -8; key.shadow.camera.right = 8;
    key.shadow.camera.top = 8; key.shadow.camera.bottom = -8; key.shadow.normalBias = .015; scene.add(key);
    const candle = new T.PointLight(0xffad58, 12, 12, 2); candle.position.set(3.6, 1.96, -1.8); scene.add(candle);
    const moon = new T.DirectionalLight(0x7fadd4, 1.25); moon.position.set(-5, 4, -6); scene.add(moon);
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
      candle.position.set(portrait ? 1.7 : 3.6, 1.96, portrait ? -3.3 : -1.8);
      gameHeight = (host.value.closest('.app')?.getBoundingClientRect().width ?? Math.min(width - 8, 1280, (height - 8) * 1.6)) / 1.6;
      if (letterbox.value) { letterbox.value.style.width = `${gameHeight * 1.6}px`; letterbox.value.style.height = `${gameHeight}px`; }
      renderer.setSize(width, height); composer?.setSize(width, height);
      ao?.setSize(Math.ceil(width*renderer.getPixelRatio()/2), Math.ceil(height*renderer.getPixelRatio()/2));
      camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix(); schedule();
    };
    ready.value = true; observer = new ResizeObserver(resize); observer.observe(host.value);
    resize(); schedule();
  } catch (error) {
    release();
    if (!disposed) { fallback.value = true; console.warn('Book preview unavailable', error); }
  }
});

function release() {
  scene?.traverse(object => {
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
onBeforeUnmount(() => { disposed = true; assets.abort(); cancelAnimationFrame(frame); observer?.disconnect(); release(); });
</script>

<style scoped>
.fantasy-book { position: fixed; inset: 0; z-index: 20; overflow: hidden; isolation: isolate; background: #1b130c; }
.book-table { position: absolute; inset: 0; cursor: pointer; }
.book-table :deep(canvas) { display: block; width: 100%; height: 100%; touch-action: pan-y; }
.book-fallback { position: absolute; inset: 8% 0 22%; display: block; height: 70%; max-width: 80%; object-fit: contain; margin: auto; filter: drop-shadow(0 20px 20px #000); transform: rotate(-5deg); }
.book-loading { position: absolute; inset: 45% 0 auto; text-align: center; color: #d8bb7b; font-size: 13px; }
.book-letterbox { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); box-shadow: 0 0 0 100vmax #080a09; opacity: 0; pointer-events: none; }
.book-invitation { position: absolute; left: 0; right: 0; bottom: max(30px, env(safe-area-inset-bottom)); text-align: center; transition: opacity 300ms; }
.book-open { min-width: 220px; min-height: 54px; font-size: 15px; background: #252519ee; border-color: #a78849; box-shadow: 0 3px 0 #090b08, inset 0 0 0 3px #383324; }
.is-opening .book-invitation { opacity: 0; pointer-events: none; }
@media (max-width: 600px) { .book-invitation { bottom: max(36px, env(safe-area-inset-bottom)); } }
@media (prefers-reduced-motion: reduce) { .book-invitation { transition: none; } }
</style>
