import test from 'node:test';
import assert from 'node:assert/strict';
import { bookTransition, candleMotion, optionsTransition, pageCameraFraming } from '../src/components/bookTransition';
import { MeshStandardMaterial, PerspectiveCamera, Texture, Vector3 } from 'three';
import { inscribePage, illustrationLevels } from '../src/components/storybookInk';

test('the final book plane matches the actual canvas size and offset, including fullscreen and safe areas', () => {
  for (const [width,height,left,top,gameWidth,gameHeight] of [
    [1280,720,70.4,4,1139.2,712],
    [1920,1080,96,0,1728,1080],
    [390,844,4,302.625,382,238.75],
    [390,780,14,286,360,225],
  ]) {
    const framing = pageCameraFraming({width,height},{left,top,width:gameWidth,height:gameHeight},35);
    const camera = new PerspectiveCamera(35,width/height,.05,100);
    camera.position.set(0,.386+framing.distance,-.15); camera.up.set(0,0,-1);
    camera.lookAt(0,.386,-.15);
    camera.setViewOffset(width,height,framing.offsetX,framing.offsetY,width,height);
    camera.updateMatrixWorld();
    const corners = [new Vector3(-1.3,.386,-.15-.8125),new Vector3(1.3,.386,-.15+.8125)].map(p=>p.project(camera));
    const actual = [(corners[0].x+1)*width/2,(1-corners[0].y)*height/2,(corners[1].x+1)*width/2,(1-corners[1].y)*height/2];
    const expected = [left,top,left+gameWidth,top+gameHeight];
    actual.forEach((value,i)=>assert.ok(Math.abs(value-expected[i])<.001, `${width}×${height}: edge ${i} matches the game canvas`));
  }
});

test('Options pulls back from the exact full-colour frame onto the ink page', () => {
  assert.deepEqual(optionsTransition(0), { hinge: 1, ink: 1, colour: 1, zoom: 1, done: false });
  assert.deepEqual(optionsTransition(1400), { hinge: 1, ink: 1, colour: 0, zoom: 0, done: true });
  let previous = 1;
  for (let ms = 0; ms <= 1600; ms += 20) {
    const state = optionsTransition(ms);
    assert.ok(state.zoom >= 0 && state.zoom <= previous);
    assert.equal(state.colour, state.zoom);
    assert.equal(state.done, ms >= 1400);
    previous = state.zoom;
  }
  assert.equal(optionsTransition(-100).zoom, 1);
});

test('an early Options dismissal returns continuously from any point in the pullback', () => {
  for (const closeAt of [0, 175, 700, 1230, 1400]) {
    const current = optionsTransition(closeAt);
    const returning = optionsTransition(0, true, current.zoom);
    assert.equal(returning.zoom, current.zoom);
    assert.equal(returning.colour, current.colour);
    let previous = current.zoom;
    for (let ms = 0; ms <= 1200; ms += 20) {
      const state = optionsTransition(ms, true, current.zoom);
      assert.ok(state.zoom >= previous && state.zoom <= 1);
      assert.equal(state.done, ms >= 1200);
      previous = state.zoom;
    }
    assert.deepEqual(optionsTransition(1200, true, current.zoom), { hinge: 1, ink: 1, colour: 1, zoom: 1, done: true });
  }
});

test('the original opening retains its final exact-frame handoff', () => {
  assert.deepEqual(bookTransition(0), { hinge: 0, ink: 0, colour: 0, zoom: 0, done: false });
  assert.deepEqual(bookTransition(8900), { hinge: 1, ink: 1, colour: 1, zoom: 1, done: true });
});

test('the prologue holds on the illustrated spread until the reader continues', () => {
  const page = { hinge: 1, ink: 1, colour: 0, zoom: 0, done: false };
  for (const elapsed of [4200, 8900, 600000]) assert.deepEqual(bookTransition(elapsed, true), page);
  assert.deepEqual(bookTransition(4200), page, 'releasing the held clock is continuous');
  assert.equal(bookTransition(6200).colour, 1);
  assert.equal(bookTransition(8900).zoom, 1);
  assert.equal(bookTransition(8900).done, true);
});

test('candle motion stays bounded, smooth and independent of frame sampling', () => {
  let previous = candleMotion(0);
  for (let frame = 1; frame <= 60 * 60; frame++) {
    const next = candleMotion(frame / 60);
    assert.ok(Math.abs(next.bendX) <= .037 && Math.abs(next.bendZ) <= .053);
    assert.ok(next.scaleY >= .955 && next.scaleY <= 1.045);
    assert.ok(next.intensity >= .915 && next.intensity <= 1.085);
    assert.ok(next.warmth >= .32 && next.warmth <= .68);
    assert.ok(Math.abs(next.intensity - previous.intensity) < .01, 'no light jumps between frames');
    assert.ok(Math.abs(next.bendZ - previous.bendZ) < .003, 'no flame jumps between frames');
    assert.ok(Math.abs((next.scaleY - 1) / .045 - (next.intensity - 1) / .085) < 1e-12);
    previous = next;
  }
  const atFiveSeconds = candleMotion(5);
  for (const rate of [24, 30, 60, 120]) {
    for (let frame = 0; frame <= 5 * rate; frame++) candleMotion(frame / rate);
    assert.deepEqual(candleMotion(5), atFiveSeconds);
  }
});

test('loading a chapter replaces the already-compiled page image without retaining its old frame', () => {
  const material = new MeshStandardMaterial(), original = new Texture(), loaded = new Texture();
  const image = inscribePage(material, original, { value: 1 }, { value: 0 }, true);
  const shader = { uniforms: {}, vertexShader: '#include <worldpos_vertex>', fragmentShader: '#include <map_fragment>\n#include <emissivemap_fragment>' } as Parameters<typeof material.onBeforeCompile>[0];
  material.onBeforeCompile(shader, {} as Parameters<typeof material.onBeforeCompile>[1]);
  assert.equal(shader.uniforms.storyImage.value, original);
  image.update(loaded,false);
  assert.equal(shader.uniforms.storyImage.value, loaded);
  assert.equal(shader.uniforms.wholeFrame.value, false);
  material.dispose(); original.dispose(); loaded.dispose();
});

test('ink levels recover the tonal range of a dark room without clipping to a bright window', () => {
  const pixels = new Uint8ClampedArray(100*4);
  for(let i=0;i<100;i++) pixels.set([i<98 ? 20+i : 255,i<98 ? 20+i : 255,i<98 ? 20+i : 255,255],i*4);
  const [black,white] = illustrationLevels(pixels);
  assert.ok(black<.12 && white>.4 && white<.5);
  assert.deepEqual(illustrationLevels(new Uint8ClampedArray(8)),[0,1]);
  const flat=illustrationLevels(Uint8ClampedArray.from([25,25,25,255]));
  assert.ok(flat[1]-flat[0]>=.2, 'flat images retain a finite sampling range');
});
