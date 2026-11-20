import { DEFAULT_POLYLINE_POINTS } from "../polylineComponentModel";
import type { LibraryShapeArrowSize, LibraryShapeArrowType, LibraryShapeStyle } from "../libraryShapeStyleModel";
import type { Point } from "../types";

export function polylineFrameSymbol(width: number, height: number, points = DEFAULT_POLYLINE_POINTS) {
  return points.map((point, index) =>
    `${index === 0 ? "M" : "L"} ${width / 2 + point.x} ${height / 2 + point.y}`
  ).join(" ");
}

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

function endpointArrow(
  tip: Point, inside: Point, type: LibraryShapeArrowType, size: LibraryShapeArrowSize, strokeWidth: number
) {
  if (type === "none") return null;
  const x = inside.x - tip.x;
  const y = inside.y - tip.y;
  const segmentLength = Math.hypot(x, y);
  if (!segmentLength) return null;
  const factor = ARROW_SIZE_FACTOR[size];
  // Leave room between opposing arrows even on a one-segment polyline.
  const isAsme = type === "asmeFilled";
  const nominalLength = Math.max(8, strokeWidth * (isAsme ? 6 : 3));
  const length = Math.min(segmentLength * 0.47, nominalLength * factor);
  // Visio 13 uses a 3:2 head. Keep the shaft covered when a short segment limits the head length.
  const halfWidth = isAsme
    ? Math.max(length / 3, strokeWidth * (0.55 + factor * 0.06))
    : Math.max(length * 0.43, strokeWidth * (0.6 + factor * 0.15));
  const dx = x / segmentLength;
  const dy = y / segmentLength;
  const point = (along: number, across: number): Point => ({
    x: tip.x + dx * along * length - dy * across * halfWidth,
    y: tip.y + dy * along * length + dx * across * halfWidth
  });
  const outline = ARROW_OUTLINES[type];
  return {
    shaftEnd: point(outline.join, 0),
    head: outline.points.map(([along, across]) => point(along, across))
  };
}

export function polylineArtwork(width: number, height: number, points: readonly Point[], style: LibraryShapeStyle) {
  const last = points.length - 1;
  const start = endpointArrow(points[0], points[1], style.startArrow, style.startArrowSize, style.strokeWidth);
  const end = endpointArrow(points[last], points[last - 1], style.endArrow, style.endArrowSize, style.strokeWidth);
  // Keep the tip at the vertex. The shaft ends inside the marker so its flat cap cannot cover the tip.
  const shaft = [start?.shaftEnd ?? points[0], ...points.slice(1, last), end?.shaftEnd ?? points[last]];
  return {
    path: polylineFrameSymbol(width, height, shaft),
    markers: [start, end].flatMap(arrow => arrow ? [polylineFrameSymbol(width, height, arrow.head) + " Z"] : []).join(" ")
  };
}
