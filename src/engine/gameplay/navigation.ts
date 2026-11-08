import type { RoomPortal, Vec2 } from "../core/types";
import { LOGICAL_WIDTH, ROOM_ART } from '../core/constants';

export function roomViewPortals(portals: RoomPortal[]) {
  const { x, y, w, h } = ROOM_ART;
  const depth = 11;
  return portals.map(portal => {
    const r = portal.rect;
    if (portal.id !== portal.side) return portal;
    if (r.w === LOGICAL_WIDTH) return { ...portal, rect: { x, y: portal.side === 'north' ? y : y + h - depth, w, h: depth } };
    if (r.h === 159) return { ...portal, rect: { x: portal.side === 'west' ? x : x + w - depth, y, w: depth, h } };
    return portal;
  });
}

export function portalAtPoint(portals: RoomPortal[], point: Vec2 | null) {
  return point ? portals.find(({ rect: r }) => point.x >= r.x && point.x < r.x + r.w && point.y >= r.y && point.y < r.y + r.h) : undefined;
}

export function exitCursor(portals: RoomPortal[], point: Vec2 | null) {
  if (!point || !portals.length) return;
  const portal = portalAtPoint(portals, point);
  if (portal) return portal.side;
  if (point.x >= 0 && point.x < 320 && point.y >= 0 && point.y < 159 &&
      (point.x < 12 || point.x >= 308 || point.y < 12 || point.y >= 136)) return 'blocked';
}

export function portalMarker(portal: RoomPortal): Vec2 {
  const { rect, side, point } = portal;
  const edge = portal.id === side;
  return {
    x: Math.max(20, Math.min(300, edge ? side === "west" ? 8 : side === "east" ? 312 : point.x : rect.x + rect.w / 2)),
    y: Math.max(20, Math.min(116, edge ? side === "north" ? rect.y + rect.h / 2 : side === "south" ? 132 : point.y : rect.y + rect.h / 2)),
  };
}
