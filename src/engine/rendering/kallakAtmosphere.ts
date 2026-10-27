/** Slow, integer-position dust in the window light. No gameplay clock changes. */
export function drawKallakAtmosphere(ctx: CanvasRenderingContext2D, timeMs: number, closeup = false) {
  const x = closeup ? 37 : 34, y = closeup ? 30 : 53;
  const width = closeup ? 76 : 54, height = closeup ? 82 : 69;
  ctx.save();
  // All particles remain above the scene/UI boundary, at logical pixel resolution.
  ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
  for (let i = 0; i < 12; i++) {
    const phase = ((timeMs / (12000 + i * 1700)) + i * 0.137) % 1;
    const px = x + Math.floor((i * 19 % width) + Math.sin(phase * Math.PI * 2) * 3);
    const py = y + Math.floor(phase * height);
    ctx.globalAlpha = Math.round(Math.sin(phase * Math.PI) * 3) / 12;
    ctx.fillStyle = "#ecd8a0";
    ctx.fillRect(px, py, 1, 1);
  }
  ctx.restore();
}
