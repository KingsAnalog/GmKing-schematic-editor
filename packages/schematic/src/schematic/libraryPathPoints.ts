import { componentScale } from "./componentScaleModel";
import { rotatePoint, samePoint, snapPoint } from "./geometry";
import { GRID_SIZE, type ComponentInstance, type Point } from "./types";

export const LIBRARY_PATH_MAX_POINTS = 256;
export const LIBRARY_PATH_MAX_COORDINATE = GRID_SIZE * 4096;
// Half-grid centers, including a 2× shape edited on the canvas, produce quarter-grid local offsets.
const LOCAL_STEP = GRID_SIZE / 4;

interface PathPointOptions {
  localStep?: number;
  allowRepeatedNeighbors?: boolean;
}

function validPathPoints(points: readonly Point[], options: PathPointOptions) {
  const step = options.localStep ?? LOCAL_STEP;
  return points.length >= 2 && points.length <= LIBRARY_PATH_MAX_POINTS
    && points.every((point, index) =>
      [point.x, point.y].every(value => Number.isFinite(value) && Math.abs(value) <= LIBRARY_PATH_MAX_COORDINATE && value % step === 0)
      && (options.allowRepeatedNeighbors || !index || !samePoint(point, points[index - 1]))
    );
}

export function parseLibraryPathPoints(value: string, options: PathPointOptions = {}): Point[] | null {
  let pairs: unknown;
  try {
    pairs = JSON.parse(value);
  } catch {
    return null;
  }
  if (!Array.isArray(pairs) || pairs.length < 2 || pairs.length > LIBRARY_PATH_MAX_POINTS) return null;
  const points: Point[] = [];
  for (const pair of pairs) {
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some(value => typeof value !== "number")) return null;
    points.push({ x: pair[0], y: pair[1] });
  }
  return validPathPoints(points, options) ? points : null;
}

function boundsCenter(points: readonly Point[]) {
  const xs = points.map(point => point.x);
  const ys = points.map(point => point.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

export function createLibraryPathGeometry(
  points: readonly Point[], valueKey: string, options: PathPointOptions & { center?: Point } = {}
) {
  const center = options.center ?? boundsCenter(points);
  const local = points.map(point => ({ x: point.x - center.x, y: point.y - center.y }));
  if (!validPathPoints(local, options)) return null;
  return {
    center,
    values: { [valueKey]: JSON.stringify(local.map(point => [point.x, point.y])) }
  };
}

export function setLibraryPathVertex(
  component: ComponentInstance, points: readonly Point[], index: number, pointer: Point,
  createGeometry: (points: readonly Point[]) => ReturnType<typeof createLibraryPathGeometry>,
  snapStep = GRID_SIZE
) {
  if (!points[index] || !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) return false;
  const scale = componentScale(component);
  const target = snapPoint(pointer, snapStep);
  const unrotated = rotatePoint({
    x: (target.x - component.x) / scale, y: (target.y - component.y) / scale
  }, -component.rotation);
  const localTarget = { x: component.mirrored ? -unrotated.x : unrotated.x, y: unrotated.y };
  if (points[index].x === localTarget.x && points[index].y === localTarget.y) return true;
  const local = points.map((point, pointIndex) => pointIndex === index ? localTarget : point);
  const geometry = createGeometry(local);
  if (!geometry) return false;
  const offset = rotatePoint({ x: component.mirrored ? -geometry.center.x : geometry.center.x, y: geometry.center.y }, component.rotation);
  component.x += offset.x * scale;
  component.y += offset.y * scale;
  Object.assign(component.values, geometry.values);
  return true;
}
