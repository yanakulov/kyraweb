const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

// Open onto bare paper, trace the landscape in ink, wash in colour, then enter it.
export function bookTransition(ms: number) {
  return {
    hinge: smooth(ms / 2200),
    ink: smooth((ms - 1800) / 2400),
    colour: smooth((ms - 4500) / 1700),
    zoom: smooth((ms - 6500) / 2400),
    done: ms >= 8900,
  };
}

export function pageCameraDistance(viewportHeight: number, gameHeight: number, fov: number) {
  return 1.625 * viewportHeight / (gameHeight * 2 * Math.tan(fov * Math.PI / 360));
}
