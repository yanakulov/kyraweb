const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

// Open, let the engraving read, restore its colour, then enter the picture.
export function bookTransition(ms: number) {
  return {
    hinge: smooth(ms / 2200),
    colour: smooth((ms - 2900) / 1400),
    zoom: smooth((ms - 4600) / 2400),
    done: ms >= 7000,
  };
}

export function pageCameraDistance(viewportHeight: number, gameHeight: number, fov: number) {
  return 1.625 * viewportHeight / (gameHeight * 2 * Math.tan(fov * Math.PI / 360));
}
