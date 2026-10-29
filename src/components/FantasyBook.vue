<template>
  <section class="fantasy-book" :class="{ 'is-opening': opening }" aria-label="Fables and Fiends, Book One">
    <div ref="host" class="book-table" @pointermove="move" @pointerleave="rest" @click="openBook">
      <img v-if="fallback" class="book-fallback" :src="`${base}assets/interface/book-cover.webp`" alt="A leather-bound copy of The Legend of Kyrandia" />
      <span v-if="!ready && !fallback" class="book-loading" role="status">Preparing your story…</span>
      <div class="page-light" aria-hidden="true"></div>
    </div>
    <div class="book-invitation">
      <p>A forgotten kingdom. A legend waiting to be told.</p>
      <button class="pixel-button book-open" type="button" :disabled="opening" @click="openBook">
        {{ opening ? 'The story begins…' : 'Open the book' }}
      </button>
      <span>Book I · The Legend of Kyrandia</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import * as T from 'three';
import type * as Three from 'three';

const emit = defineEmits<{ open: [] }>();
const base = import.meta.env.BASE_URL;
const host = ref<HTMLDivElement | null>(null);
const opening = ref(false), ready = ref(false), fallback = ref(false);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let disposed = false, frame = 0, started = 0;
let renderer: Three.WebGLRenderer | undefined, scene: Three.Scene | undefined;
let camera: Three.PerspectiveCamera, cover: Three.Group;
let observer: ResizeObserver | undefined;
let pointerX = 0, pointerY = 0, viewX = 0, viewY = 0;
const textures: Three.Texture[] = [];

function openBook() {
  if (opening.value) return;
  opening.value = true;
  started = performance.now();
  if (reduced || !ready.value || fallback.value) { emit('open'); return; }
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
  viewX += (pointerX - viewX) * .12;
  viewY += (pointerY - viewY) * .12;
  const progress = opening.value ? Math.min(1, (now - started) / 1450) : 0;
  const ease = 1 - Math.pow(1 - progress, 3);
  cover.rotation.z = ease * 2.9;
  camera.position.set(viewX * .45 - ease * .7, 7.1 - viewY * .3 - ease * 1.2, 5.7 - ease * .8);
  camera.lookAt(-ease * .45, 0, .1);
  renderer.render(scene, camera);
  if (progress === 1) { emit('open'); return; }
  if (opening.value || Math.abs(viewX - pointerX) + Math.abs(viewY - pointerY) > .002) schedule();
}

onMounted(async () => {
  try {
    if (disposed || !host.value) return;
    renderer = new T.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFShadowMap;
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    host.value.prepend(renderer.domElement);
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(36, 1, .1, 50);
    const loader = new T.TextureLoader();
    const load = async (name: string) => {
      const texture = await loader.loadAsync(`${base}assets/interface/${name}.webp`);
      if (disposed) { texture.dispose(); return texture; }
      texture.colorSpace = T.SRGBColorSpace;
      texture.magFilter = T.NearestFilter;
      texture.minFilter = T.LinearMipmapLinearFilter;
      textures.push(texture);
      return texture;
    };
    const [art, wood, title] = await Promise.all([load('book-cover'), load('desk'), load('kyrandia-title')]);
    if (disposed) return;
    wood.wrapS = wood.wrapT = T.RepeatWrapping;
    wood.repeat.set(2, 2);
    const leather = new T.MeshStandardMaterial({ color: 0x342117, roughness: .84 });
    const brass = new T.MeshStandardMaterial({ color: 0xb28a43, roughness: .48, metalness: .72 });
    const paper = new T.MeshStandardMaterial({ color: 0xd2bb83, roughness: .95 });
    const book = new T.Group(); book.rotation.y = -.11; scene.add(book);
    const box = (parent: Three.Object3D, width: number, height: number, depth: number, material: Three.Material, x: number, y: number, z: number) => {
      const mesh = new T.Mesh(new T.BoxGeometry(width, height, depth), material);
      mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
    };
    const desk = new T.Mesh(new T.PlaneGeometry(30, 30), new T.MeshStandardMaterial({ map: wood, color: 0x9a7454, roughness: .92 }));
    desk.rotation.x = -Math.PI / 2; desk.position.y = -.19; desk.receiveShadow = true; scene.add(desk);
    box(book, 2.7, .1, 3.9, leather, 0, -.12, 0);
    box(book, 2.52, .34, 3.73, paper, .02, .10, 0);
    const titlePage = new T.Mesh(new T.PlaneGeometry(2.1, .525), new T.MeshStandardMaterial({ map: title, transparent: true, roughness: 1, color: 0x9f764c }));
    titlePage.rotation.x = -Math.PI / 2; titlePage.position.set(.02, .275, -.45); titlePage.receiveShadow = true; book.add(titlePage);
    // Individual page edges give the volume a real silhouette without a heavy model.
    for (let i = 0; i < 16; i++) box(book, 2.54, .006, 3.74, paper, .02, -.06 + i * .022, 0);
    box(book, .15, .46, 3.9, leather, -1.31, .08, 0);
    for (const z of [-1.4, -.75, .75, 1.4]) box(book, .18, .48, .07, brass, -1.32, .08, z);
    cover = new T.Group(); cover.position.set(-1.35, .32, 0); book.add(cover);
    box(cover, 2.7, .1, 3.9, leather, 1.35, 0, 0);
    const coverArt = new T.Mesh(new T.PlaneGeometry(2.7, 3.9), new T.MeshStandardMaterial({ map: art, roughness: .77, metalness: .08 }));
    coverArt.rotation.x = -Math.PI / 2; coverArt.position.set(1.35, .052, 0); coverArt.receiveShadow = true; cover.add(coverArt);
    for (const x of [.05, 2.65]) for (const z of [-1.90, 1.90]) {
      const inwardX = x < 1 ? 1 : -1, inwardZ = z < 0 ? 1 : -1;
      box(cover, .24, .035, .055, brass, x + inwardX * .09, .065, z);
      box(cover, .055, .035, .24, brass, x, .065, z + inwardZ * .09);
    }
    box(book, .13, .02, .75, new T.MeshStandardMaterial({ color: 0x65293c, roughness: .95 }), .72, -.03, 2.1);
    const gemMaterial = new T.MeshStandardMaterial({ color: 0x0d8c76, emissive: 0x07382c, emissiveIntensity: .5, metalness: .3, roughness: .18 });
    const gem = new T.Mesh(new T.OctahedronGeometry(.18), gemMaterial);
    gem.position.set(2.35, -.02, .95); gem.rotation.set(.3, .5, .6); scene.add(gem);
    const smallGem = new T.Mesh(new T.OctahedronGeometry(.11), new T.MeshStandardMaterial({ color: 0x695183, metalness: .3, roughness: .25 }));
    smallGem.position.set(2.65, -.08, 1.2); scene.add(smallGem);
    const candle = new T.Group(); candle.position.set(-2.55, -.16, -1.0); scene.add(candle);
    const candleBrass = new T.MeshStandardMaterial({ color: 0x62482c, roughness: .72, metalness: .5 });
    const wax = new T.MeshStandardMaterial({ color: 0xb8a77b, roughness: 1 });
    for (const [radius, height, y] of [[.31, .07, .04], [.07, .43, .28], [.22, .06, .53], [.13, .52, .82]]) {
      const mesh = new T.Mesh(new T.CylinderGeometry(radius, radius, height, 12), y > .6 ? wax : candleBrass);
      mesh.position.y = y; mesh.castShadow = true; candle.add(mesh);
    }
    const flame = new T.Mesh(new T.OctahedronGeometry(.09), new T.MeshBasicMaterial({ color: 0xffd58a }));
    flame.position.y = 1.16; flame.scale.set(.65, 1.8, .65); candle.add(flame);
    scene.add(new T.HemisphereLight(0xc4d1bd, 0x2c160d, 2));
    const key = new T.DirectionalLight(0xffd4a1, 3.2); key.position.set(-3, 6, 4); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); key.shadow.camera.left = -6; key.shadow.camera.right = 6; key.shadow.camera.top = 6; key.shadow.camera.bottom = -6; key.shadow.normalBias = .025; scene.add(key);
    const candleLight = new T.PointLight(0xffa144, 7, 8, 2); candleLight.position.set(-2.55, 1.1, -1); scene.add(candleLight);
    const moon = new T.PointLight(0x5b9c9c, 10, 9, 2); moon.position.set(3, 3, -3); scene.add(moon);
    const resize = () => {
      if (!host.value || !renderer) return;
      const { width, height } = host.value.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(1, height);
      camera.fov = width < 600 ? 44 : 32;
      camera.updateProjectionMatrix(); schedule();
    };
    ready.value = true;
    observer = new ResizeObserver(resize); observer.observe(host.value);
    resize(); schedule();
  } catch (error) {
    if (!disposed) {
      renderer?.dispose(); renderer?.domElement.remove();
      fallback.value = true; console.warn('Book preview unavailable', error);
    }
  }
});

onBeforeUnmount(() => {
  disposed = true; cancelAnimationFrame(frame); observer?.disconnect();
  scene?.traverse(object => {
    const mesh = object as Three.Mesh;
    mesh.geometry?.dispose();
    if (mesh.material) for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) material.dispose();
  });
  textures.forEach(texture => texture.dispose());
  renderer?.dispose(); renderer?.domElement.remove();
});
</script>

<style scoped>
.fantasy-book { position: relative; overflow: hidden; isolation: isolate; }
.book-table { height: clamp(320px, calc(100svh - 280px), 510px); position: relative; cursor: pointer; background: #1d1610; }
.book-table::after { content: ''; position: absolute; inset: 0; pointer-events: none; box-shadow: inset 0 0 110px 45px #0b0b09b0; }
.book-table :deep(canvas) { display: block; width: 100%; height: 100%; touch-action: pan-y; }
.book-fallback { display: block; height: 85%; max-width: 80%; object-fit: contain; margin: 0 auto; padding-top: 25px; image-rendering: pixelated; transform: rotate(-5deg); }
.book-loading { position: absolute; inset: 45% 0 auto; text-align: center; color: #d8bb7b; font-size: 13px; }
.book-invitation { position: relative; z-index: 1; margin-top: -42px; padding: 0 16px 28px; text-align: center; }
.book-invitation p { font-size: 13px; color: #e7d2a0; text-shadow: 0 2px 8px #000; margin: 0 0 18px; }
.book-open { min-width: 240px; min-height: 58px; font-size: 16px; }
.book-invitation > span { display: block; font-size: 10px; color: #a99c7b; margin-top: 15px; }
.page-light { position: absolute; z-index: 2; inset: 0; background: #f9e4af; pointer-events: none; opacity: 0; }
.is-opening .page-light { animation: into-story 1450ms ease-in forwards; }
@keyframes into-story { 0%, 65% { opacity: 0; } 100% { opacity: 1; } }
@media (max-width: 600px) { .book-table { height: clamp(300px, calc(100svh - 300px), 460px); } .book-invitation { margin-top: -25px; } .book-invitation p { max-width: 260px; line-height: 1.8; margin-inline: auto; font-size: 11px; } }
@media (prefers-reduced-motion: reduce) { .is-opening .page-light { animation: none; } }
</style>
