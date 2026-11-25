import { componentScale } from "./componentScaleModel";
import { rotatePoint, snapPoint } from "./geometry";
import { GRID_SIZE, type ComponentInstance, type Point } from "./types";

export const TRIANGLE_VERTICES = ["a", "b", "c"] as const;
export const TRIANGLE_EDGES = ["ab", "bc", "ca"] as const;
export type TriangleVertex = typeof TRIANGLE_VERTICES[number];
export type TriangleEdge = typeof TRIANGLE_EDGES[number];
export const TRIANGLE_MAX_PIN_COUNT = 1024;
export const TRIANGLE_MAX_COORDINATE = GRID_SIZE * 4096;
export interface TriangleSettings {
  vertices: Record<TriangleVertex, Point>;
  /** Retained only so older command and document APIs can be read safely. */
  pins: Record<TriangleEdge, number>;
}
export const DEFAULT_TRIANGLE_SETTINGS: TriangleSettings = {
  vertices: { a: { x: 0, y: -40 }, b: { x: 40, y: 40 }, c: { x: -40, y: 40 } },
  pins: { ab: 0, bc: 0, ca: 0 }
};
export const triangleVertexKey = (vertex: TriangleVertex, axis: "x" | "y") => `triangleVertex:${vertex}:${axis}`;
export const trianglePinCountKey = (edge: TriangleEdge) => `trianglePinCount:${edge}`;
export const isTriangleVertex = (value: unknown): value is TriangleVertex => TRIANGLE_VERTICES.some(vertex => vertex === value);
export const isTriangleEdge = (value: unknown): value is TriangleEdge => TRIANGLE_EDGES.some(edge => edge === value);

export function triangleSettings(component: Pick<ComponentInstance, "values">): TriangleSettings {
  return {
    vertices: Object.fromEntries(TRIANGLE_VERTICES.map(vertex => [vertex, {
      x: Number(component.values[triangleVertexKey(vertex, "x")] ?? DEFAULT_TRIANGLE_SETTINGS.vertices[vertex].x),
      y: Number(component.values[triangleVertexKey(vertex, "y")] ?? DEFAULT_TRIANGLE_SETTINGS.vertices[vertex].y)
    }])) as TriangleSettings["vertices"],
    // Legacy saved pin counts never create geometry on a pure library shape.
    pins: { ...DEFAULT_TRIANGLE_SETTINGS.pins }
  };
}

/** Only outline vertices are serialized for new and normalized triangle instances. */
export function triangleSettingsValues(settings: TriangleSettings): Record<string, string> {
  return Object.fromEntries(
    TRIANGLE_VERTICES.flatMap(vertex => (["x", "y"] as const).map(axis => [
      triangleVertexKey(vertex, axis),
      String(settings.vertices[vertex][axis])
    ]))
  );
}

export function triangleAreaTwice(settings: TriangleSettings) {
  const { a, b, c } = settings.vertices;
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

export function validTriangleSettings(settings: TriangleSettings) {
  return TRIANGLE_VERTICES.every(vertex => [settings.vertices[vertex].x, settings.vertices[vertex].y]
    .every(value => Number.isFinite(value) && value % (GRID_SIZE / 2) === 0 && Math.abs(value) <= TRIANGLE_MAX_COORDINATE))
    && triangleAreaTwice(settings) !== 0;
}

/** The outline is centered without adding invisible electrical lead margins. */
export function triangleSize(settings: TriangleSettings) {
  const vertices = Object.values(settings.vertices);
  return {
    width: 2 * Math.max(...vertices.map(point => Math.abs(point.x))),
    height: 2 * Math.max(...vertices.map(point => Math.abs(point.y)))
  };
}

export function triangleVertexWorldPoint(component: ComponentInstance, vertex: TriangleVertex): Point {
  const local = triangleSettings(component).vertices[vertex];
  const offset = rotatePoint({ x: (component.mirrored ? -local.x : local.x) * componentScale(component), y: local.y * componentScale(component) }, component.rotation);
  return { x: component.x + offset.x, y: component.y + offset.y };
}

type TriangleMutationResult = { kind: "changed" } | { kind: "noop"; reason: "unsupported" | "invalid" | "unchanged" };

/** Pin editing is intentionally unsupported for the pure triangle outline. */
export function setTrianglePinCount(component: ComponentInstance, _edge: TriangleEdge, _value: string | number): TriangleMutationResult {
  return component.type === "triangle"
    ? { kind: "noop", reason: "unsupported" }
    : { kind: "noop", reason: "unsupported" };
}

export function setTriangleVertex(component: ComponentInstance, vertex: TriangleVertex, pointer: Point): TriangleMutationResult {
  if (component.type !== "triangle") return { kind: "noop", reason: "unsupported" };
  if (!isTriangleVertex(vertex) || !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) return { kind: "noop", reason: "invalid" };
  const target = snapPoint(pointer);
  const current = triangleVertexWorldPoint(component, vertex);
  if (Math.abs(current.x - target.x) < 1e-6 && Math.abs(current.y - target.y) < 1e-6) return { kind: "noop", reason: "unchanged" };
  const local = rotatePoint({ x: target.x - component.x, y: target.y - component.y }, -component.rotation);
  const settings = triangleSettings(component);
  settings.vertices[vertex] = { x: (component.mirrored ? -local.x : local.x) / componentScale(component), y: local.y / componentScale(component) };
  if (!validTriangleSettings(settings)) return { kind: "noop", reason: "invalid" };
  // A half-grid center is required when the outline spans an odd number of
  // canvas cells. Keeping it exact leaves every world vertex on the 10 px grid.
  const points = Object.values(settings.vertices);
  const center = {
    x: (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) / 2,
    y: (Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) / 2
  };
  TRIANGLE_VERTICES.forEach(id => {
    settings.vertices[id].x -= center.x;
    settings.vertices[id].y -= center.y;
  });
  const offset = rotatePoint({ x: (component.mirrored ? -center.x : center.x) * componentScale(component), y: center.y * componentScale(component) }, component.rotation);
  component.x = Math.round(component.x + offset.x);
  component.y = Math.round(component.y + offset.y);
  Object.assign(component.values, triangleSettingsValues(settings));
  return { kind: "changed" };
}
