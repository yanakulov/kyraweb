import test from 'node:test';
import assert from 'node:assert/strict';
import { buildIntroSteps } from '../src/engine/intro/steps';
import { studioLogoFrame, drawStudioLogo } from '../src/engine/intro/studioLogo';
import { WESTWOOD_RLE, WESTWOOD_TOTAL_MS } from '../src/engine/intro/introTiming';

test('AkulaFlow follows Westwood inside the intro and uses the original reveal clock', () => {
  const steps = buildIntroSteps();
  assert.deepEqual(steps.slice(0, 3).map(step => step.id), ['westwood', 'akulaflow', 'kyrandia_scroll']);
  assert.equal(steps[1].durationMs, steps[0].durationMs);
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
