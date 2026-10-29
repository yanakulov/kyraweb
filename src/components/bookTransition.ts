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

// Options opens from the captured game frame; reversal starts at the current zoom.
export function optionsTransition(ms: number, returning = false, startZoom = 0) {
  const progress = smooth(ms / (returning ? 1200 : 1400));
  const start = Math.max(0, Math.min(1, startZoom));
  const zoom = returning ? start + (1 - start) * progress : 1 - progress;
  return { hinge: 1, ink: 1, colour: zoom, zoom, done: progress === 1 };
}

// Shared oscillation keeps the flame and light in phase without random frame jumps.
export function candleMotion(seconds: number) {
  const flicker = .65 * Math.sin(seconds * 4.1) + .35 * Math.sin(seconds * 7.3);
  return {
    bendX: .025 * Math.sin(seconds * 1.7) + .012 * flicker,
    bendZ: .035 * Math.sin(seconds * 1.3) + .018 * flicker,
    scaleY: 1 + .045 * flicker,
    intensity: 1 + .085 * flicker,
    warmth: .5 + .18 * flicker,
  };
}
