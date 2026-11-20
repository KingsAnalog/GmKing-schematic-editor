import { quadraticArc } from "./arcGeometry";
import { createLibraryPathGeometry, LIBRARY_PATH_MAX_COORDINATE, parseLibraryPathPoints, setLibraryPathVertex } from "./libraryPathPoints";
import { snapPoint } from "./geometry";
import { GRID_SIZE, type ComponentInstance, type Point } from "./types";

export const ARC_POINTS_VALUE_KEY = "arcPoints";
export const ARC_THROUGH_POINT_STEP = 1;
const arcPointOptions = { localStep: ARC_THROUGH_POINT_STEP / 4, allowRepeatedNeighbors: true };
export const DEFAULT_ARC_POINTS: readonly Point[] = [
  { x: -40, y: 20 }, { x: 40, y: 20 }, { x: 0, y: -20 }
];

function validArc(points: readonly Point[]) {
  const arc = quadraticArc(points);
  return !!arc
    && Math.max(arc.bounds.width, arc.bounds.height) <= 2 * LIBRARY_PATH_MAX_COORDINATE;
}

export function parseArcPoints(value: string) {
  const points = parseLibraryPathPoints(value, arcPointOptions);
  return points && validArc(points) ? points : null;
}

export function arcPoints(component: Pick<ComponentInstance, "values">): readonly Point[] {
  const value = component.values[ARC_POINTS_VALUE_KEY];
  return (value === undefined ? null : parseArcPoints(value)) ?? DEFAULT_ARC_POINTS;
}

export function arcSize(points: readonly Point[]) {
  const { bounds } = quadraticArc(points)!;
  return {
    width: Math.max(GRID_SIZE, 2 * Math.abs(bounds.x), 2 * Math.abs(bounds.x + bounds.width)),
    height: Math.max(GRID_SIZE, 2 * Math.abs(bounds.y), 2 * Math.abs(bounds.y + bounds.height))
  };
}

export function createArcGeometry(points: readonly Point[]) {
  if (!validArc(points)) return null;
  const [start, end] = points;
  const center = snapPoint({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 });
  return createLibraryPathGeometry(points, ARC_POINTS_VALUE_KEY, { ...arcPointOptions, center });
}

export function setArcVertex(component: ComponentInstance, index: number, pointer: Point) {
  return component.type === "arc"
    && setLibraryPathVertex(component, arcPoints(component), index, pointer, createArcGeometry,
      index === 2 ? ARC_THROUGH_POINT_STEP : GRID_SIZE);
}
