import { WESTWOOD_RLE, WESTWOOD_TOTAL_MS } from './introTiming';

const units = WESTWOOD_RLE.reduce((sum, [, count]) => sum + count, 0);

/** Match the original logo's reveal, travelling glint, hold and reverse reveal. */
export function studioLogoFrame(elapsedMs: number) {
  let unit = Math.max(0, elapsedMs) / WESTWOOD_TOTAL_MS * units;
  for (const [frame, count] of WESTWOOD_RLE) {
    if (unit < count) return frame;
    unit -= count;
  }
  return 0;
}

export function drawStudioLogo(ctx: CanvasRenderingContext2D, image: CanvasImageSource, elapsedMs: number, reducedMotion: boolean) {
  const frame = studioLogoFrame(elapsedMs);
  if (!frame) return;
  ctx.save();
  // The artwork's letters start at y=82; Westwood's wordmark starts at y=46.
  ctx.translate(0, -36);
  ctx.imageSmoothingEnabled = false;
  if (!reducedMotion && frame < 9) {
    ctx.beginPath();
    // Four-pixel stairs keep the diagonal wipe on the same pixel grid as the art.
    for (let y = 0; y < 200; y += 4) {
      const edge = Math.floor((frame / 9 * 360 - 40 + y / 5) / 4) * 4;
      ctx.rect(0, y, Math.max(0, Math.min(320, edge)), 4);
    }
    ctx.clip();
  }
  ctx.drawImage(image, 0, 0, 320, 200);
  if (!reducedMotion && frame >= 10 && frame <= 20) {
    ctx.beginPath();
    for (let y = 0; y < 200; y += 4) ctx.rect(Math.floor(((frame - 10) / 10 * 360 - 40 + y / 5) / 4) * 4, y, 12, 4);
    ctx.clip();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.6;
    ctx.drawImage(image, 0, 0, 320, 200);
  }
  ctx.restore();
}
