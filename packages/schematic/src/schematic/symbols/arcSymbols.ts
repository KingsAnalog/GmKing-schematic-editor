import { quadraticArc } from "../arcGeometry";
import { DEFAULT_ARC_POINTS } from "../arcComponentModel";
import type { LibraryShapeArrowSize, LibraryShapeArrowType, LibraryShapeStyle } from "../libraryShapeStyleModel";
import type { Point } from "../types";
import { positionShapeArrow, shapeArrowPaths, shapeArrowProfile } from "./shapeArrowSymbols";

export function quadraticArcSymbol(width: number, height: number, points: readonly Point[] = DEFAULT_ARC_POINTS) {
  const arc = quadraticArc(points);
  if (!arc) return "";
  return quadraticPath(width, height, points[0], arc.control, points[1]);
}

function quadraticPath(width: number, height: number, start: Point, control: Point, end: Point) {
  const svgPoint = ({ x, y }: Point) => `${x + width / 2} ${y + height / 2}`;
  return `M ${svgPoint(start)} Q ${svgPoint(control)} ${svgPoint(end)}`;
}

function arcEndpointArrow(
  tip: Point, control: Point, opposite: Point, type: LibraryShapeArrowType, size: LibraryShapeArrowSize, strokeWidth: number
) {
  const chord = Math.hypot(opposite.x - tip.x, opposite.y - tip.y);
  const profile = shapeArrowProfile(type, size, strokeWidth, chord);
  if (!profile) return null;

  // Aim from the tip to the shaft join on the original arc. A tight bend changes the direction, not the head size.
  const t = firstArcDistance(tip, control, opposite, profile.outline.join * profile.length);
  const join = interpolate(interpolate(tip, control, t), interpolate(control, opposite, t), t);
  return { arrow: positionShapeArrow(tip, join, profile), t };
}

function firstArcDistance(start: Point, control: Point, end: Point, distance: number): number {
  const tangentX = 2 * (control.x - start.x);
  const tangentY = 2 * (control.y - start.y);
  const bendX = end.x - start.x - tangentX;
  const bendY = end.y - start.y - tangentY;
  const distanceSquared = distance * distance;
  const distanceAt = (t: number) => t * t * ((tangentX + bendX * t) ** 2 + (tangentY + bendY * t) ** 2);

  // Distance squared from the endpoint has at most one local maximum before the far endpoint.
  // Keep an earlier crossing when an arc briefly doubles back before heading toward its other endpoint.
  const tangentSquared = tangentX ** 2 + tangentY ** 2;
  const bendSquared = bendX ** 2 + bendY ** 2;
  const slope = 3 * (tangentX * bendX + tangentY * bendY);
  const discriminant = slope * slope - 8 * bendSquared * tangentSquared;
  let high = 1;
  if (slope < 0 && discriminant > 0) {
    const peak = 2 * tangentSquared / (-slope + Math.sqrt(discriminant));
    if (peak < 1 && distanceAt(peak) >= distanceSquared) high = peak;
  }

  let low = 0;
  for (let step = 0; step < 32; step += 1) {
    const mid = (low + high) / 2;
    if (distanceAt(mid) < distanceSquared) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

function interpolate(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

export function arcArtwork(width: number, height: number, points: readonly Point[], style: LibraryShapeStyle) {
  const arc = quadraticArc(points);
  if (!arc) return { path: "", markers: "" };
  const [start, end] = points;
  const { control } = arc;
  const from = arcEndpointArrow(start, control, end, style.startArrow, style.startArrowSize, style.strokeWidth);
  const to = arcEndpointArrow(end, control, start, style.endArrow, style.endArrowSize, style.strokeWidth);
  if (!from && !to) return { path: quadraticPath(width, height, start, control, end), markers: "" };

  // Split at both joins using De Casteljau so the visible shaft stays on the original curve.
  const t0 = from?.t ?? 0;
  const t1 = 1 - (to?.t ?? 0);
  const left = interpolate(start, control, t0);
  const right = interpolate(control, end, t0);
  const shaftStart = interpolate(left, right, t0);
  const shaftEnd = interpolate(interpolate(start, control, t1), interpolate(control, end, t1), t1);
  const shaftControl = interpolate(shaftStart, right, (t1 - t0) / (1 - t0));
  return {
    path: quadraticPath(width, height, shaftStart, shaftControl, shaftEnd),
    markers: shapeArrowPaths(width, height, [from?.arrow ?? null, to?.arrow ?? null])
  };
}
