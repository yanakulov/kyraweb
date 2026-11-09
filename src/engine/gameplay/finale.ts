// DOS CD finale timing and bead positions follow ScummVM sequence_sequences_lok.cpp.
// SPDX-License-Identifier: GPL-3.0-or-later
import type { Vec2 } from '../core/types';
import specialPalettes from '../resources/specialPalettes.json';
import { changeInvisibility, transformWisp } from './forest';
import type { RoomAction } from './roomScript';

const tickMs = 1000 / 60;
const wait = (ticks: number): RoomAction => ({ op: 'wait', ms: ticks * tickMs });
const music = (command: number): RoomAction => ({ op: 'music', command, restart: true });
const sfx = (track: number): RoomAction => ({ op: 'sfx', track });
const frame = (clip: string, index: number, x: number, y: number, ticks = 0): RoomAction =>
  ({ op: 'frame', clip, index, x, y, ms: ticks * tickMs });
const frames = (clip: string, from: number, count: number, x: number, y: number, ticks: number) =>
  Array.from({ length: count }, (_, i) => frame(clip, from + i, x, y, ticks));
const close = (clip: string): RoomAction => ({ op: 'close', clip });

const sway = [-1, -2, -4, -5, -6, -7, -6, -5, -4, -2, -1, 0, 1, 2, 4, 5, 6, 7, 6, 5, 4, 2, 1, 0, 0];
const bob = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 4, 4, 3, 3, 2, 2, 1, 1, 0, 0, 0];
const gemRamp = [63, 59, 56, 52, 50, 47, 44, 41, 37, 34, 31, 28, 25, 22, 18, 15, 12, 10, 6, 3];

export function kyragemColors(step: number) {
  const phase = Math.floor(step / 19) % 6, n = step % 19;
  const offsets = [[0, 19, 19 - n], [n, 19, 0], [19, 19 - n, 0], [19, 0, n], [19 - n, 0, 19], [0, n, 19]][phase];
  return gemRamp.flatMap((_, index) => offsets.map(offset => (gemRamp[index + offset] ?? 0) * 4));
}

export function reflectsSpell(pos: Vec2, invisible: boolean) {
  return invisible && pos.x > 233 && pos.x < 305 && pos.y > 85 && pos.y < 105;
}

function flight(from: Vec2, to: Vec2) {
  const sx = Math.sign(to.x - from.x), sy = Math.sign(to.y - from.y);
  const dx = Math.abs(to.x - from.x), dy = Math.abs(to.y - from.y);
  const horizontal = dx >= dy;
  const major = Math.max(dx, dy), minor = Math.min(dx, dy);
  let { x, y } = from, error = 0;
  const actions = [frame('bead', 18, x, y, 1)];
  while (x !== to.x || y !== to.y) {
    const snapX = Math.abs(to.x - x) < 12, snapY = Math.abs(to.y - y) < 12;
    for (let i = 0; i < 12; i++) {
      error += minor;
      const diagonal = error >= major;
      if (diagonal) error -= major;
      if (horizontal || diagonal) x += sx;
      if (!horizontal || diagonal) y += sy;
    }
    if (snapX) x = to.x;
    if (snapY) y = to.y;
    actions.push(frame('bead', (actions.length - 1) % 18, x, y, 1));
  }
  return actions;
}

function ending(from: Vec2, reunion: RoomAction[]): RoomAction[] {
  const mirror = { x: 290, y: 40 };
  return [
    ...flight(from, mirror), close('bead'),
    ...frames('finalb', 0, 8, 224, 8, 1), sfx(13),
    ...frames('finalb', 0, 8, 224, 8, 1).reverse(), close('finalb'),
    ...flight(mirror, { x: 63, y: 60 }), close('bead'),
    sfx(12), ...frames('finalc', 0, 17, 16, 50, 4), wait(4), music(51), wait(60),
    { op: 'ending', stage: 'film' },
    { op: 'palette', start: 228, colors: specialPalettes[32].slice(0, 60), ms: 1000 }, wait(60),
    { op: 'shuffle' }, frame('end-heal', 0, 0, 0), wait(120), sfx(64),
    ...frames('end-finald', 0, 22, 8, 8, 8).flatMap((action, i) =>
      i === 4 ? [sfx(62), action] : i === 20 ? [sfx(14), action] : [action]),
    wait(300), { op: 'shade', opacity: 1, ms: 500 },
    close('end-heal'), close('end-finald'), frame('end-home', 0, 0, 0), ...reunion,
    { op: 'ending', stage: 'credits' }
  ];
}

function defeat(from: Vec2, pos: Vec2, invisible: boolean, wisp: boolean): RoomAction[] {
  return [
    ...flight(from, { x: pos.x - 4, y: pos.y - 30 }), close('bead'),
    music(52), sfx(12), ...frames('finala', 34, 4, 8, 46, 8),
    ...(invisible ? changeInvisibility(false) : []), ...(wisp ? transformWisp(210, false) : []),
    ...Array.from({ length: 14 }, (_, index): RoomAction[] =>
      [{ op: 'heroFrame', clip: 'stone', index }, wait(8)]).flat(),
    wait(60), { op: 'death' }
  ];
}

export function createFinalBattle(reunion: RoomAction[]) {
  const charge = 14 * 8 + 180, rise = charge + 8 * 8, hover = rise + 12;
  const fire = hover + 244;
  let clock = 0, startAt = 600, settled = false, taunt = false, retryAt = 0;
  let idle = 14, idleTick = -1;
  return {
    malcolm: -1,
    bead: null as (Vec2 & { index: number }) | null,
    get started() { return clock >= startAt; },
    summon() { if (!this.started) startAt = Math.floor(clock); },
    dispel() {
      if (settled || retryAt || clock - startAt < hover + 116) return;
      this.bead = null;
      retryAt = Math.floor(clock) + 180;
      taunt = true;
    },
    update(ms: number, pos: Vec2, invisible: boolean, wisp: boolean, ready: boolean): RoomAction[] | undefined {
      if (settled) return;
      clock += ms / tickMs;
      const tick = Math.floor(clock + 1e-7);
      if (retryAt) {
        if (taunt && ready) {
          taunt = false;
          return [{ op: 'say', text: 'Very clever!  But your feeble efforts are futile.', voiceId: -1, x: 60, y: 31,
            ms: 180 * tickMs, color: 5, blocking: true }];
        }
        if (taunt || !ready || tick < retryAt) return;
        startAt = tick - 14 * 8;
        retryAt = 0;
      }
      const age = tick - startAt;
      if (age < 0) return;
      if (age < 14 * 8) this.malcolm = Math.floor(age / 8);
      else if (age < charge) {
        const idleStep = Math.floor(age / 8);
        if (idleStep !== idleTick) { idleTick = idleStep; idle = 14 + Math.floor(Math.random() * 4); }
        this.malcolm = idle;
      } else if (age < charge + 14 * 8) this.malcolm = 18 + Math.floor((age - charge) / 8);
      else this.malcolm = age < hover + 100 ? 31 : age < hover + 108 ? 32 : 33;
      if (age >= rise) {
        const index = Math.floor((age - rise) / 4);
        const swayIndex = Math.floor((age - hover) / 4) % sway.length;
        this.bead = age < hover ? { x: 60, y: Math.max(25, 40 - index * 8), index } :
          { x: 60 + sway[swayIndex], y: 25 + bob[swayIndex], index: index % 17 };
      }
      if (age < fire || !ready) return;
      const from = this.bead!;
      this.bead = null;
      settled = true;
      return [sfx(11), ...(reflectsSpell(pos, invisible) ? ending(from, reunion) : defeat(from, pos, invisible, wisp))];
    }
  };
}
