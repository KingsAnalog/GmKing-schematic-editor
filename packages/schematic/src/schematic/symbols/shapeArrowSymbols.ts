import type { LibraryShapeArrowSize, LibraryShapeArrowType } from "../libraryShapeStyleModel";
import type { Point } from "../types";
import { closedPolygonPath } from "./closedShapeSymbols";

const ARROW_SIZE_FACTOR: Record<LibraryShapeArrowSize, number> = {
  small: 0.7, medium: 1, large: 1.4, extraLarge: 1.9
};

// Coordinates are fractions of the head length and half-width, measured back from the tip.
const SOLID_TRIANGLE = { join: 0.95, points: [[0, 0], [1, 1], [1, -1]] } as const;
const ARROW_OUTLINES = {
  filled: SOLID_TRIANGLE,
  asmeFilled: SOLID_TRIANGLE,
  open: { join: 0.33, points: [[0, 0], [1, 1], [1, 0.65], [0.3, 0], [1, -0.65], [1, -1]] },
  stealth: { join: 0.82, points: [[0, 0], [1, 1], [0.7, 0], [1, -1]] },
  diamond: { join: 0.64, points: [[0, 0], [0.5, 1], [1, 0], [0.5, -1]] }
} as const;

export function shapeArrowProfile(
  type: LibraryShapeArrowType, size: LibraryShapeArrowSize, strokeWidth: number, availableLength: number
) {
  if (type === "none" || availableLength <= 0) return null;
  const factor = ARROW_SIZE_FACTOR[size];
  // Leave room between opposing arrows on short shapes.
  const isAsme = type === "asmeFilled";
  const nominalLength = Math.max(8, strokeWidth * (isAsme ? 6 : 3));
  const length = Math.min(availableLength * 0.47, nominalLength * factor);
  // Visio 13 uses a 3:2 head. Keep the shaft covered when a short segment limits the head length.
  const halfWidth = isAsme
    ? Math.max(length / 3, strokeWidth * (0.55 + factor * 0.06))
    : Math.max(length * 0.43, strokeWidth * (0.6 + factor * 0.15));
  return { outline: ARROW_OUTLINES[type], length, halfWidth };
}

export function positionShapeArrow(tip: Point, inside: Point, profile: NonNullable<ReturnType<typeof shapeArrowProfile>>) {
  const { outline, length, halfWidth } = profile;
  const distance = Math.hypot(inside.x - tip.x, inside.y - tip.y);
  const dx = (inside.x - tip.x) / distance;
  const dy = (inside.y - tip.y) / distance;
  const point = (along: number, across: number): Point => ({
    x: tip.x + dx * along * length - dy * across * halfWidth,
    y: tip.y + dy * along * length + dx * across * halfWidth
  });
  return {
    shaftEnd: point(outline.join, 0),
    head: outline.points.map(([along, across]) => point(along, across))
  };
}

export function endpointArrow(
  tip: Point, inside: Point, type: LibraryShapeArrowType, size: LibraryShapeArrowSize, strokeWidth: number
) {
  const profile = shapeArrowProfile(type, size, strokeWidth, Math.hypot(inside.x - tip.x, inside.y - tip.y));
  return profile ? positionShapeArrow(tip, inside, profile) : null;
}

export function shapeArrowPaths(width: number, height: number, arrows: Array<ReturnType<typeof endpointArrow>>) {
  return arrows.flatMap(arrow => arrow ? [closedPolygonPath(width, height, arrow.head)] : []).join(" ");
}
