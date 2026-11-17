import { GRID_SIZE, type ComponentInstance, type PinDef, type Point, type Wire } from "./types";

export function snap(value: number, grid = GRID_SIZE) {
  return Math.round(value / grid) * grid;
}

export function snapPoint(point: Point, grid = GRID_SIZE): Point {
  return { x: snap(point.x, grid), y: snap(point.y, grid) };
}

export function pointKey(point: Point) {
  return `${Math.round(point.x)},${Math.round(point.y)}`;
}

export function samePoint(a: Point, b: Point) {
  return Math.round(a.x) === Math.round(b.x) && Math.round(a.y) === Math.round(b.y);
}

export function rotatePoint(point: Point, rotation: number): Point {
  const normalized = ((rotation % 360) + 360) % 360;
  if (normalized === 90) return { x: -point.y, y: point.x };
  if (normalized === 180) return { x: -point.x, y: -point.y };
  if (normalized === 270) return { x: point.y, y: -point.x };
  return { ...point };
}

export function transformPin(instance: ComponentInstance, pin: PinDef): Point {
  const mirrored = instance.mirrored ? { x: -pin.x, y: pin.y } : { x: pin.x, y: pin.y };
  const rotated = rotatePoint(mirrored, instance.rotation);
  return snapPoint({ x: instance.x + rotated.x, y: instance.y + rotated.y });
}

export function isHorizontal(a: Point, b: Point) {
  return Math.round(a.y) === Math.round(b.y);
}

export function isVertical(a: Point, b: Point) {
  return Math.round(a.x) === Math.round(b.x);
}

export function pointOnSegment(point: Point, start: Point, end: Point, includeInteriorOnly = false) {
  const p = snapPoint(point);
  const a = snapPoint(start);
  const b = snapPoint(end);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  if (dx === 0 && dy === 0) return !includeInteriorOnly && samePoint(p, a);
  const px = p.x - a.x;
  const py = p.y - a.y;
  if (px * dy - py * dx !== 0) return false;
  const projection = px * dx + py * dy;
  const lengthSquared = dx * dx + dy * dy;
  if (projection < 0 || projection > lengthSquared) return false;
  if (!includeInteriorOnly) return true;
  return !samePoint(p, a) && !samePoint(p, b);
}

export function wireSegments(wire: Wire) {
  const segments: Array<{ wireId: string; start: Point; end: Point }> = [];
  for (let index = 1; index < wire.points.length; index += 1) {
    const start = snapPoint(wire.points[index - 1]);
    const end = snapPoint(wire.points[index]);
    if (!samePoint(start, end)) {
      segments.push({ wireId: wire.id, start, end });
    }
  }
  return segments;
}

export function segmentIntersection(a1: Point, a2: Point, b1: Point, b2: Point): Point | null {
  const p = snapPoint(a1);
  const q = snapPoint(b1);
  const r = { x: snap(a2.x) - p.x, y: snap(a2.y) - p.y };
  const s = { x: snap(b2.x) - q.x, y: snap(b2.y) - q.y };
  const denominator = cross(r, s);
  if (denominator === 0) return null;
  const offset = { x: q.x - p.x, y: q.y - p.y };
  const t = cross(offset, s) / denominator;
  const u = cross(offset, r) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  const intersection = { x: p.x + t * r.x, y: p.y + t * r.y };
  const snapped = snapPoint(intersection);
  return Math.abs(intersection.x - snapped.x) < 1e-7
    && Math.abs(intersection.y - snapped.y) < 1e-7
    ? snapped
    : null;
}

export function orthogonalRoute(start: Point, end: Point): Point[] {
  const first = snapPoint(start);
  const last = snapPoint(end);
  if (first.x === last.x || first.y === last.y) {
    return [first, last];
  }
  return [first, { x: last.x, y: first.y }, last];
}

function cross(first: Point, second: Point) {
  return first.x * second.y - first.y * second.x;
}
