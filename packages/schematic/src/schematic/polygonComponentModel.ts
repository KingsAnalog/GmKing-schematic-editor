import { createLibraryPathGeometry, parseLibraryPathPoints, setLibraryPathVertex } from "./libraryPathPoints";
import type { ComponentInstance, Point } from "./types";

export const POLYGON_POINTS_VALUE_KEY = "polygonPoints";
export const DEFAULT_POLYGON_POINTS: readonly Point[] = [
  { x: -40, y: 0 }, { x: -20, y: -30 }, { x: 30, y: -20 }, { x: 40, y: 20 }, { x: -20, y: 30 }
];

function validPolygon(points: readonly Point[]) {
  if (points.length < 3 || new Set(points.map(({ x, y }) => `${x},${y}`)).size !== points.length) return false;
  const [start, next, ...rest] = points;
  const dx = next.x - start.x;
  const dy = next.y - start.y;
  return rest.some(point => dx * (point.y - start.y) !== dy * (point.x - start.x));
}

export function parsePolygonPoints(value: string) {
  const points = parseLibraryPathPoints(value);
  return points && validPolygon(points) ? points : null;
}

export function polygonPoints(component: Pick<ComponentInstance, "values">): readonly Point[] {
  const value = component.values[POLYGON_POINTS_VALUE_KEY];
  return (value === undefined ? null : parsePolygonPoints(value)) ?? DEFAULT_POLYGON_POINTS;
}

export function createPolygonGeometry(points: readonly Point[]) {
  return validPolygon(points) ? createLibraryPathGeometry(points, POLYGON_POINTS_VALUE_KEY) : null;
}

export function setPolygonVertex(component: ComponentInstance, index: number, pointer: Point) {
  return component.type === "polygon"
    && setLibraryPathVertex(component, polygonPoints(component), index, pointer, createPolygonGeometry);
}
