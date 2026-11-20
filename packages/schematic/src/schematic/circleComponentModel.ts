import { componentScale } from "./componentScaleModel";
import { rotatePoint, snap } from "./geometry";
import { LIBRARY_PATH_MAX_COORDINATE } from "./libraryPathPoints";
import { GRID_SIZE, type ComponentInstance, type Point } from "./types";

export const CIRCLE_RADIUS_VALUE_KEYS = { x: "circleRadiusX", y: "circleRadiusY" } as const;
const MIN_RADIUS = GRID_SIZE / 2;
const DEFAULT_RADIUS = 40;
const AXIS_HANDLES = [
  { axis: "y", direction: -1 },
  { axis: "x", direction: 1 },
  { axis: "y", direction: 1 },
  { axis: "x", direction: -1 }
] as const;

function validRadius(radius: number) {
  return radius >= MIN_RADIUS && radius <= LIBRARY_PATH_MAX_COORDINATE;
}

export function parseCircleRadius(value: string) {
  const radius = Number(value);
  return validRadius(radius) ? radius : null;
}

function circleRadius(component: Pick<ComponentInstance, "values">, axis: keyof Point) {
  return parseCircleRadius(component.values[CIRCLE_RADIUS_VALUE_KEYS[axis]]) ?? DEFAULT_RADIUS;
}

export function circleSize(component: Pick<ComponentInstance, "values">) {
  return { width: 2 * circleRadius(component, "x"), height: 2 * circleRadius(component, "y") };
}

export function circleAxisPoints({ width, height }: { width: number; height: number }): Point[] {
  return AXIS_HANDLES.map(({ axis, direction }) => ({
    x: axis === "x" ? width / 2 * direction : 0,
    y: axis === "y" ? height / 2 * direction : 0
  }));
}

export function createCircleGeometry([center, edge]: readonly Point[]) {
  if (!center || !edge) return null;
  const radius = Math.hypot(edge.x - center.x, edge.y - center.y);
  if (!validRadius(radius)) return null;
  return {
    center,
    values: { [CIRCLE_RADIUS_VALUE_KEYS.x]: String(radius), [CIRCLE_RADIUS_VALUE_KEYS.y]: String(radius) }
  };
}

export function setCircleAxis(component: ComponentInstance, index: number, pointer: Point) {
  const handle = AXIS_HANDLES[index];
  if (component.type !== "circle" || !handle || !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) return false;
  const { axis, direction } = handle;
  const scale = componentScale(component);
  const unrotated = rotatePoint({ x: pointer.x - component.x, y: pointer.y - component.y }, -component.rotation);
  const mirror = axis === "x" && component.mirrored ? -1 : 1;
  const previous = circleRadius(component, axis);
  const delta = snap(unrotated[axis] * mirror - direction * previous * scale) / scale;
  const radius = Math.max(MIN_RADIUS, Math.min(LIBRARY_PATH_MAX_COORDINATE, previous + direction * delta / 2));
  if (radius === previous) return true;

  // Move the center by half the dragged edge's travel to keep the opposite edge fixed.
  const shift = (radius - previous) * direction * mirror * scale;
  const offset = rotatePoint({ x: axis === "x" ? shift : 0, y: axis === "y" ? shift : 0 }, component.rotation);
  component.x += offset.x;
  component.y += offset.y;
  component.values[CIRCLE_RADIUS_VALUE_KEYS[axis]] = String(radius);
  return true;
}
