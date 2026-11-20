import type { Point } from "./types";

function quadraticBounds(start: number, control: number, end: number) {
  const min = Math.min(start, end);
  const max = Math.max(start, end);
  const curvature = start - 2 * control + end;
  if (curvature === 0) return { min, max };
  const t = (start - control) / curvature;
  if (t <= 0 || t >= 1) return { min, max };
  const opposite = 1 - t;
  const extreme = opposite * opposite * start + 2 * t * opposite * control + t * t * end;
  return { min: Math.min(min, extreme), max: Math.max(max, extreme) };
}

/** The third point is on the curve at t = 0.5. Its Bézier control point lies off the curve. */
export function quadraticArc(points: readonly Point[]) {
  if (points.length !== 3 || !points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y))) return null;
  const [start, end, through] = points;
  if (start.x === end.x && start.y === end.y) return null;
  const control = {
    x: 2 * through.x - (start.x + end.x) / 2,
    y: 2 * through.y - (start.y + end.y) / 2
  };
  const x = quadraticBounds(start.x, control.x, end.x);
  const y = quadraticBounds(start.y, control.y, end.y);
  return { control, bounds: { x: x.min, y: y.min, width: x.max - x.min, height: y.max - y.min } };
}
