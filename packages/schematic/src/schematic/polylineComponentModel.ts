import { createLibraryPathGeometry, LIBRARY_PATH_MAX_POINTS, parseLibraryPathPoints, setLibraryPathVertex } from "./libraryPathPoints";
import { GRID_SIZE, type ComponentInstance, type Point } from "./types";

export const POLYLINE_POINTS_VALUE_KEY = "polylinePoints";
export const POLYLINE_MAX_POINTS = LIBRARY_PATH_MAX_POINTS;
export const parsePolylinePoints = parseLibraryPathPoints;

export const DEFAULT_POLYLINE_POINTS: readonly Point[] = [
  { x: -40, y: 20 }, { x: -10, y: -20 }, { x: 10, y: -20 }, { x: 40, y: 10 }
];

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
  return createLibraryPathGeometry(points, POLYLINE_POINTS_VALUE_KEY);
}

export function setPolylineVertex(component: ComponentInstance, index: number, pointer: Point) {
  return component.type === "polyline"
    && setLibraryPathVertex(component, polylinePoints(component), index, pointer, createPolylineGeometry);
}
