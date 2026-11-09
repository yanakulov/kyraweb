import { ROOM_ART } from '../engine/core/constants';
import type { Vec2 } from '../engine/core/types';

const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };

export const BOOK_READING_MS = 3000;

// Open onto bare paper, trace the landscape in ink, wash in colour, then enter it.
export function bookTransition(ms: number, reading = false) {
  if (reading) ms = Math.min(ms, BOOK_READING_MS);
  const dive = ms - BOOK_READING_MS;
  return {
    hinge: smooth(ms / 1500),
    ink: smooth((ms - 1050) / 1950),
    colour: smooth(dive / 820),
    zoom: smooth(dive / 1480),
    done: dive >= 1480,
  };
}

export function bookHandoff(zoom: number) { return smooth((zoom - .86) / .14); }

export function roomFrameFocus(position: Vec2): Vec2 {
  const { x, y, w, h } = ROOM_ART;
  return { x: (position.x - x) / w, y: 1 - (position.y - y - 20) / h };
}

export function pageCameraDistance(viewportHeight: number, gameHeight: number, fov: number) {
  return 1.625 * viewportHeight / (gameHeight * 2 * Math.tan(fov * Math.PI / 360));
}

// Use the actual canvas bounds: fullscreen and mobile safe areas change both size and centre.
export function pageCameraFraming(viewport: { width: number; height: number }, target: { left: number; top: number; width: number; height: number }, fov: number) {
  return {
    distance: pageCameraDistance(viewport.height, target.height, fov),
    offsetX: (viewport.width - target.width) / 2 - target.left,
    offsetY: (viewport.height - target.height) / 2 - target.top,
  };
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
