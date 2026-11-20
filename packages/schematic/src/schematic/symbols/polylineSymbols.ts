import { DEFAULT_POLYLINE_POINTS } from "../polylineComponentModel";
import type { LibraryShapeStyle } from "../libraryShapeStyleModel";
import type { Point } from "../types";
import { endpointArrow, shapeArrowPaths } from "./shapeArrowSymbols";

export function polylineFrameSymbol(width: number, height: number, points = DEFAULT_POLYLINE_POINTS) {
  return points.map((point, index) =>
    `${index === 0 ? "M" : "L"} ${width / 2 + point.x} ${height / 2 + point.y}`
  ).join(" ");
}

export function polylineArtwork(width: number, height: number, points: readonly Point[], style: LibraryShapeStyle) {
  const last = points.length - 1;
  const start = endpointArrow(points[0], points[1], style.startArrow, style.startArrowSize, style.strokeWidth);
  const end = endpointArrow(points[last], points[last - 1], style.endArrow, style.endArrowSize, style.strokeWidth);
  // Keep the tip at the vertex. The shaft ends inside the marker so its flat cap cannot cover the tip.
  const shaft = [start?.shaftEnd ?? points[0], ...points.slice(1, last), end?.shaftEnd ?? points[last]];
  return {
    path: polylineFrameSymbol(width, height, shaft),
    markers: shapeArrowPaths(width, height, [start, end])
  };
}
