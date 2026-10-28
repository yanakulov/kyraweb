import type { RoomPortal, Vec2 } from "../core/types";

export function portalAtPoint(portals: RoomPortal[], point: Vec2 | null) {
  return point ? portals.find(({ rect: r }) => point.x >= r.x && point.x < r.x + r.w && point.y >= r.y && point.y < r.y + r.h) : undefined;
}

export function portalMarker(portal: RoomPortal): Vec2 {
  const { rect, side, point } = portal;
  const edge = portal.id === side;
  return {
    x: Math.max(20, Math.min(300, edge ? side === "west" ? 8 : side === "east" ? 312 : point.x : rect.x + rect.w / 2)),
    y: Math.max(20, Math.min(116, edge ? side === "north" ? rect.y + rect.h / 2 : side === "south" ? 132 : point.y : rect.y + rect.h / 2)),
  };
}
