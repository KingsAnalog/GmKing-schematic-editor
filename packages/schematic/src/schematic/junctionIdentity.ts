import { snapPoint } from "./geometry";
import type { Point } from "./types";

const JUNCTION_ID_PATTERN = /^junction-(-?\d+)-(-?\d+)$/;

/** Stable view identity for a grid-snapped derived junction. */
export function junctionId(point: Point) {
  const snapped = snapPoint(point);
  return `junction-${snapped.x}-${snapped.y}`;
}

/** Parses a stable junction view identity without depending on the renderer. */
export function junctionPointFromId(id: string): Point | null {
  const match = JUNCTION_ID_PATTERN.exec(id);
  if (!match) return null;
  return { x: Number(match[1]), y: Number(match[2]) };
}

/** Converts the persisted geometry key representation back into a point. */
export function parseJunctionKey(key: string): Point | null {
  const [x, y] = key.split(",").map(Number);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}
