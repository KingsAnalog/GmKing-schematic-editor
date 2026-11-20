import { componentScale } from "./componentScaleModel";
import { rotatePoint, samePoint, snapPoint } from "./geometry";
import { GRID_SIZE, type ComponentInstance, type Point } from "./types";

export const POLYLINE_POINTS_VALUE_KEY = "polylinePoints";
export const POLYLINE_MAX_POINTS = 256;
const MAX_COORDINATE = GRID_SIZE * 4096;
// Half-grid centers, including a 2× shape edited on the canvas, produce quarter-grid local offsets.
const LOCAL_STEP = GRID_SIZE / 4;

export const DEFAULT_POLYLINE_POINTS: readonly Point[] = [
  { x: -40, y: 20 }, { x: -10, y: -20 }, { x: 10, y: -20 }, { x: 40, y: 10 }
];

function validPolylinePoints(points: readonly Point[]) {
  return points.length >= 2 && points.length <= POLYLINE_MAX_POINTS
    && points.every((point, index) =>
      [point.x, point.y].every(value => Number.isFinite(value) && Math.abs(value) <= MAX_COORDINATE && value % LOCAL_STEP === 0)
      && (!index || !samePoint(point, points[index - 1]))
    );
}

export function parsePolylinePoints(value: string): Point[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length < 2 || parsed.length > POLYLINE_MAX_POINTS) return null;
  const points: Point[] = [];
  for (const pair of parsed) {
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some(value => typeof value !== "number")) return null;
    points.push({ x: pair[0], y: pair[1] });
  }
  return validPolylinePoints(points) ? points : null;
}

export function polylinePoints(component: Pick<ComponentInstance, "values">): readonly Point[] {
  const value = component.values[POLYLINE_POINTS_VALUE_KEY];
  return (value === undefined ? null : parsePolylinePoints(value)) ?? DEFAULT_POLYLINE_POINTS;
}

export function polylineSize(points: readonly Point[]) {
  return {
    width: Math.max(GRID_SIZE, ...points.map(point => 2 * Math.abs(point.x))),
    height: Math.max(GRID_SIZE, ...points.map(point => 2 * Math.abs(point.y)))
  };
}

export function createPolylineGeometry(points: readonly Point[]) {
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  const center = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const local = points.map(point => ({ x: point.x - center.x, y: point.y - center.y }));
  if (!validPolylinePoints(local)) return null;
  return {
    center,
    values: { [POLYLINE_POINTS_VALUE_KEY]: JSON.stringify(local.map(point => [point.x, point.y])) }
  };
}

export function setPolylineVertex(component: ComponentInstance, index: number, pointer: Point) {
  if (component.type !== "polyline" || !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) return false;
  const points = polylinePoints(component);
  if (points[index] === undefined) return false;
  const scale = componentScale(component);
  const target = snapPoint(pointer);
  const unrotated = rotatePoint({
    x: (target.x - component.x) / scale, y: (target.y - component.y) / scale
  }, -component.rotation);
  const localTarget = { x: component.mirrored ? -unrotated.x : unrotated.x, y: unrotated.y };
  if (samePoint(points[index], localTarget)) return true;
  const local = points.map((point, pointIndex) => pointIndex === index ? localTarget : point);
  const geometry = createPolylineGeometry(local);
  if (!geometry) return false;
  const offset = rotatePoint({ x: component.mirrored ? -geometry.center.x : geometry.center.x, y: geometry.center.y }, component.rotation);
  component.x += offset.x * scale;
  component.y += offset.y * scale;
  Object.assign(component.values, geometry.values);
  return true;
}
