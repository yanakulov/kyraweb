import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIntroSteps } from '../src/engine/intro/steps';
import { studioLogoFrame, drawStudioLogo } from '../src/engine/intro/studioLogo';
import { WESTWOOD_RLE, WESTWOOD_TOTAL_MS } from '../src/engine/intro/introTiming';
import { playIntro } from '../src/engine/intro/player';
import { bookTransition, pageCameraDistance } from '../src/components/bookTransition';

test('the book opens before its picture colours and zooms into the game viewport', () => {
  assert.deepEqual(bookTransition(0), { hinge: 0, colour: 0, zoom: 0, done: false });
  assert.deepEqual(bookTransition(2600), { hinge: 1, colour: 0, zoom: 0, done: false });
  assert.deepEqual(bookTransition(4500), { hinge: 1, colour: 1, zoom: 0, done: false });
  assert.deepEqual(bookTransition(7000), { hinge: 1, colour: 1, zoom: 1, done: true });
  for (const [width, height] of [[1280, 720], [390, 844], [320, 700]]) {
    const gameHeight = Math.min(width - 8, 1280, (height - 8) * 1.6) / 1.6;
    const distance = pageCameraDistance(height, gameHeight, 35);
    const projectedHeight = 1.625 / (2 * distance * Math.tan(35 * Math.PI / 360)) * height;
    assert.ok(Math.abs(projectedHeight - gameHeight) < .001, 'the last 3D frame matches the 2D game rectangle');
  }
});

test('AkulaFlow follows Westwood inside the intro and uses the original reveal clock', () => {
  const steps = buildIntroSteps();
  assert.deepEqual(steps.slice(0, 3).map(step => step.id), ['westwood', 'akulaflow', 'kyrandia_scroll']);
  assert.equal(steps[1].durationMs, steps[0].durationMs);
  assert.equal(steps[1].bgSrc, steps[0].bgSrc);
  assert.ok(steps[1].overlaySrc?.endsWith('akulaflow-studio.webp'));
  const total = WESTWOOD_RLE.reduce((sum, [, count]) => sum + count, 0);
  let units = 0;
  for (const [frame, count] of WESTWOOD_RLE) {
    assert.equal(studioLogoFrame((units + count / 2) / total * WESTWOOD_TOTAL_MS), frame);
    units += count;
  }
  assert.equal(studioLogoFrame(WESTWOOD_TOTAL_MS), 0);
  let draws = 0, masks = 0;
  const ctx = new Proxy({}, { get: (_, key) => key === 'drawImage' ? () => draws++ : key === 'clip' ? () => masks++ : () => {} }) as CanvasRenderingContext2D;
  const revealMs = (150 + 3 * 4 + 1) / total * WESTWOOD_TOTAL_MS;
  drawStudioLogo(ctx, {} as CanvasImageSource, revealMs, true);
  assert.equal(draws, 1); assert.equal(masks, 0, 'reduced motion uses a still logo');
  drawStudioLogo(ctx, {} as CanvasImageSource, revealMs, false);
  assert.equal(masks, 1, 'the regular logo uses the pixel wipe');
});

test('the studio reveal draws over the original background throughout its animation', async () => {
  const original = { Image: globalThis.Image, performance: globalThis.performance, requestAnimationFrame: globalThis.requestAnimationFrame, cancelAnimationFrame: globalThis.cancelAnimationFrame };
  let callback: FrameRequestCallback = () => {};
  const draws: string[] = [];
  class FakeImage {
    onload = () => {}; source = '';
    set src(value: string) { this.source = value; queueMicrotask(() => this.onload()); }
  }
  Object.assign(globalThis, { Image: FakeImage, performance: { now: () => 0 }, requestAnimationFrame: (next: FrameRequestCallback) => { callback = next; return 1; }, cancelAnimationFrame: () => {} });
  const context = new Proxy({}, { get: (_, key) => key === 'drawImage' ? (image: FakeImage) => draws.push(image.source) : () => {} });
  const canvas = { getContext: () => context } as unknown as HTMLCanvasElement;
  const step = buildIntroSteps()[1];
  let readyFrames = 0;
  const playback = playIntro(canvas, [step], { onFirstFrame: () => {
    assert.ok(draws.includes(step.bgSrc!), 'the book stays visible until a real frame is drawn');
    readyFrames++;
  } });
  try {
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(readyFrames, 0);
    callback(100);
    assert.equal(readyFrames, 1);
    assert.deepEqual(draws, [step.bgSrc], 'the background is visible before the letters appear');
    draws.length = 0;
    callback(3000);
    assert.equal(readyFrames, 1, 'handoff occurs once');
    assert.equal(draws[0], step.bgSrc, 'draw the whole background before applying the logo wipe');
    assert.ok(draws.slice(1).includes(step.overlaySrc!));
  } finally { playback.stop(); await playback.done; Object.assign(globalThis, original); }
});
