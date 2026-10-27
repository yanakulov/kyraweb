// SPDX-License-Identifier: GPL-3.0-or-later
// Adapted from ScummVM engines/kyra/engine/scene_v1.cpp.
// Copyright ScummVM contributors. See LICENSES/GPL-3.0.txt.
import type { Vec2 } from "../core/types";

// Pathfinder order: E, NE, N, NW, W, SW, S, SE.
const DX = [4, 4, 0, -4, -4, -4, 0, 4];
const DY = [0, -2, -2, -2, 0, 2, 2, 2];
const TURN = [[7, 0, 1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6, 7, 0]];
const NEXT = [[2, 4, 4, 6, 6, 0, 0, 2], [6, 6, 0, 0, 2, 2, 4, 4]];
const CORNER = [[-1, 0, -1, 2, -1, 4, -1, 6], [-1, 2, -1, 4, -1, 6, -1, 0]];
const CORNER_X = [[-1, 0, -1, 4, -1, 0, -1, -4], [-1, -4, -1, 0, -1, 4, -1, 0]];
const CORNER_Y = [[-1, 2, -1, 0, -1, -2, -1, 0], [-1, 0, -1, 2, -1, 0, -1, -2]];
const equal = (a: Vec2, b: Vec2) => a.x === b.x && a.y === b.y;
const step = (p: Vec2, dir: number): Vec2 => ({ x: p.x + DX[dir], y: p.y + DY[dir] });

export const snapToWalkGrid = (p: Vec2): Vec2 => ({ x: Math.floor(p.x / 4) * 4, y: Math.floor(p.y / 2) * 2 });

export function pathDirection(from: Vec2, to: Vec2) {
  const dx = to.x - from.x, dy = to.y - from.y;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.min(ax, ay) < Math.floor((Math.max(ax, ay) + 1) / 2)) {
    return ax >= ay ? (dx >= 0 ? 0 : 4) : (dy >= 0 ? 6 : 2);
  }
  return dy < 0 ? (dx >= 0 ? 1 : 3) : (dx >= 0 ? 7 : 5);
}

function contour(from: Vec2, to: Vec2, side: number, passable: (p: Vec2) => boolean): number[] | null {
  let pos = from, dir = pathDirection(from, to);
  const path: number[] = [];
  for (let count = 0; count < 2000; count++) {
    let candidate = dir;
    let next: Vec2;
    do {
      candidate = TURN[side][candidate];
      next = step(pos, candidate);
      if (passable(next)) break;
      if (candidate === dir) return null;
    } while (true);
    dir = candidate;
    if ((dir & 1) && equal({ x: next.x + CORNER_X[side][dir], y: next.y + CORNER_Y[side][dir] }, to)) {
      path.push(CORNER[side][dir]);
      return path;
    }
    path.push(dir);
    pos = next;
    if (equal(pos, to)) return path;
    if (equal(pos, from)) return null;
    dir = NEXT[side][dir];
  }
  return null;
}

function simplify(path: number[]) {
  const result: number[] = [];
  for (let dir of path) {
    while (result.length) {
      const previous = result[result.length - 1];
      const x = DX[previous] + DX[dir], y = DY[previous] + DY[dir];
      if (x === 0 && y === 0) { result.pop(); dir = -1; break; }
      const combined = DX.findIndex((dx, i) => dx === x && DY[i] === y);
      if (combined < 0) break;
      result.pop(); dir = combined;
    }
    if (dir >= 0) result.push(dir);
  }
  return result;
}

export function findWalkPath(from: Vec2, target: Vec2, passable: (p: Vec2) => boolean): Vec2[] {
  const start = snapToWalkGrid(from), to = snapToWalkGrid(target);
  if (equal(start, to)) return [];
  let pos = start;
  const path: number[] = [];
  for (let guard = 0; guard < 2000 && !equal(pos, to); guard++) {
    const dir = pathDirection(pos, to);
    let next = step(pos, dir);
    if (passable(next)) {
      path.push(dir);
    } else {
      if (equal(next, to)) break;
      let detour: number[] | null = null;
      for (let scan = 0; scan < 2000; scan++) {
        next = step(next, pathDirection(next, to));
        if (passable(next)) {
          const left = contour(pos, next, 1, passable), right = contour(pos, next, 0, passable);
          detour = left && (!right || left.length < right.length) ? left : right;
          if (detour) break;
        }
        if (equal(next, to)) break;
      }
      if (!detour) break;
      path.push(...detour);
    }
    if (path.length > 150) return [];
    pos = next;
  }
  let current = start;
  return simplify(path).map(dir => (current = step(current, dir)));
}
