/** DOS shuffleScreen: shuffled columns and cyclic shuffled rows, one pass per tick. */
export function shufflePixels(width: number, height: number, random = Math.random) {
  const xs = Array.from({ length: width }, (_, i) => i);
  const ys = Array.from({ length: height }, (_, i) => i);
  for (const values of [xs, ys]) for (let i = 0; i < values.length; i++) {
    const j = Math.floor(random() * values.length);
    [values[i], values[j]] = [values[j], values[i]];
  }
  return Array.from({ length: height }, (_, pass) => xs.map((x, i) => ({ x, y: ys[(pass + i) % height] })));
}

export function sceneShuffle(previous: HTMLCanvasElement) {
  const ctx = previous.getContext('2d')!;
  const passes = shufflePixels(304, 128);
  let age = 0, pass = 0;
  return {
    get active() { return pass < passes.length; },
    update(ms: number) {
      age += ms;
      const end = Math.min(128, Math.floor(age * 60 / 1000));
      while (pass < end) for (const p of passes[pass++]) ctx.clearRect(8 + p.x, 8 + p.y, 1, 1);
    },
    draw(target: CanvasRenderingContext2D) { target.drawImage(previous, 8, 8, 304, 128, 8, 8, 304, 128); }
  };
}
