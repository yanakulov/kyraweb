import type { IntroEffect } from './types';

/** Fire each original cue once. Seeks and background-tab jumps must not burst
 * old effects; a paused player does not call this clock at all. */
export class IntroEffects {
  private step = '';
  private previous = -Infinity;
  private index = 0;
  update(step: string, effects: IntroEffect[], elapsed: number, muted: boolean, emit: (track: number) => void) {
    if (step !== this.step || elapsed < this.previous) { this.step = step; this.index = 0; this.previous = -Infinity; }
    while (this.index < effects.length && effects[this.index].atMs <= elapsed) {
      const effect = effects[this.index++];
      if (!muted && effect.atMs > this.previous && elapsed - effect.atMs <= 250) emit(effect.track);
    }
    this.previous = elapsed;
  }
}
