import type { RoomPortal, Vec2 } from "../core/types";
import { LOGICAL_WIDTH, ROOM_ART } from '../core/constants';

const edgeDepth = 11;

export function roomViewPortals(portals: RoomPortal[]) {
  const { x, y, w, h } = ROOM_ART;
  return portals.map(portal => {
    const r = portal.rect;
    if (portal.id !== portal.side) return portal;
    if (r.w === LOGICAL_WIDTH) return { ...portal, rect: { x, y: portal.side === 'north' ? y : y + h - edgeDepth, w, h: edgeDepth } };
    if (r.h === 159) return { ...portal, rect: { x: portal.side === 'west' ? x : x + w - edgeDepth, y, w: edgeDepth, h } };
    return portal;
  });
}

export function portalAtPoint(portals: RoomPortal[], point: Vec2 | null) {
  return point ? portals.find(({ rect: r }) => point.x >= r.x && point.x < r.x + r.w && point.y >= r.y && point.y < r.y + r.h) : undefined;
}

export function exitCursor(portals: RoomPortal[], point: Vec2 | null, modern = false) {
  if (!point || !portals.length) return;
  const portal = portalAtPoint(portals, point);
  if (portal) return portal.side;
  const { x, y, w, h } = modern ? ROOM_ART : { x: 0, y: 0, w: LOGICAL_WIDTH, h: 159 };
  if (point.x < x || point.x >= x + w || point.y < y || point.y >= y + h) return;
  const depth = modern ? 4 : 12;
  if (point.x < x + depth || point.x >= x + w - depth || point.y < y + depth ||
      point.y >= (modern ? y + h - depth : 136)) return 'blocked';
}

export function portalMarker(portal: RoomPortal): Vec2 {
  const { rect, side, point } = portal;
  const edge = portal.id === side;
  return {
    x: Math.max(20, Math.min(300, edge ? side === "west" ? 8 : side === "east" ? 312 : point.x : rect.x + rect.w / 2)),
    y: Math.max(20, Math.min(116, edge ? side === "north" ? rect.y + rect.h / 2 : side === "south" ? 132 : point.y : rect.y + rect.h / 2)),
  };
}
