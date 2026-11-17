import { componentScale } from "./componentScaleModel";
import { rotatePoint, snapPoint } from "./geometry";
import { GRID_SIZE, SYMBOL_GRID_SIZE, type ComponentInstance, type PinDef, type Point } from "./types";

export const TRIANGLE_VERTICES = ["a", "b", "c"] as const;
export const TRIANGLE_EDGES = ["ab", "bc", "ca"] as const;
export type TriangleVertex = typeof TRIANGLE_VERTICES[number];
export type TriangleEdge = typeof TRIANGLE_EDGES[number];
export const TRIANGLE_MAX_PIN_COUNT = 1024;
export const TRIANGLE_MAX_COORDINATE = GRID_SIZE * 4096;
export interface TriangleSettings {
  vertices: Record<TriangleVertex, Point>;
  pins: Record<TriangleEdge, number>;
}
export const DEFAULT_TRIANGLE_SETTINGS: TriangleSettings = {
  vertices: { a: { x: 0, y: -40 }, b: { x: 40, y: 40 }, c: { x: -40, y: 40 } },
  pins: { ab: 1, bc: 0, ca: 1 }
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
    pins: Object.fromEntries(TRIANGLE_EDGES.map(edge => [edge,
      Number(component.values[trianglePinCountKey(edge)] ?? DEFAULT_TRIANGLE_SETTINGS.pins[edge])
    ])) as TriangleSettings["pins"]
  };
}

export function triangleSettingsValues(settings: TriangleSettings): Record<string, string> {
  return Object.fromEntries([
    ...TRIANGLE_VERTICES.flatMap(vertex => (["x", "y"] as const).map(axis => [triangleVertexKey(vertex, axis), String(settings.vertices[vertex][axis])])),
    ...TRIANGLE_EDGES.map(edge => [trianglePinCountKey(edge), String(settings.pins[edge])])
  ]);
}

export function triangleAreaTwice(settings: TriangleSettings) {
  const { a, b, c } = settings.vertices;
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Contacts stay on their edge; wire endpoints snap to the canvas grid. */
export function trianglePinGeometry(settings: TriangleSettings): Array<{ pin: PinDef; contact: Point }> {
  const orientation = Math.sign(triangleAreaTwice(settings));
  return TRIANGLE_EDGES.flatMap((edge, edgeIndex) => {
    const start = settings.vertices[TRIANGLE_VERTICES[edgeIndex]];
    const end = settings.vertices[TRIANGLE_VERTICES[(edgeIndex + 1) % 3]];
    const dx = end.x - start.x, dy = end.y - start.y;
    const length = Math.hypot(dx, dy) || 1;
    const count = Math.max(0, Math.min(TRIANGLE_MAX_PIN_COUNT, Math.trunc(settings.pins[edge]) || 0));
    return Array.from({ length: count }, (_, index) => {
      const fraction = (index + 1) / (count + 1);
      const preferredContact = { x: start.x + dx * fraction, y: start.y + dy * fraction };
      const endpoint = snapPoint({
        x: preferredContact.x + orientation * dy / length * SYMBOL_GRID_SIZE,
        y: preferredContact.y - orientation * dx / length * SYMBOL_GRID_SIZE
      });
      // Project the snapped endpoint back to the edge so leads remain perpendicular,
      // including vertical leads on a horizontal edge with uneven grid spacing.
      const contactFraction = Math.max(0, Math.min(1,
        ((endpoint.x - start.x) * dx + (endpoint.y - start.y) * dy) / (dx * dx + dy * dy || 1)));
      const contact = { x: start.x + dx * contactFraction, y: start.y + dy * contactFraction };
      const id = `${edge}-${index + 1}`;
      return { contact, pin: { id, label: `${edge.toUpperCase()} ${index + 1}`, role: "io" as const, ...endpoint } };
    });
  });
}

/** Vertex leads extend outwards along the vertex angle bisector. */
export function triangleVertexPinGeometry(settings: TriangleSettings): Array<{ pin: PinDef; contact: Point }> {
  return TRIANGLE_VERTICES.map((vertex, index) => {
    const contact = settings.vertices[vertex];
    const neighbors = [1, 2].map(offset => settings.vertices[TRIANGLE_VERTICES[(index + offset) % 3]]);
    const direction = neighbors.reduce((sum, neighbor) => {
      const dx = contact.x - neighbor.x, dy = contact.y - neighbor.y;
      const length = Math.hypot(dx, dy) || 1;
      return { x: sum.x + dx / length, y: sum.y + dy / length };
    }, { x: 0, y: 0 });
    const length = Math.hypot(direction.x, direction.y) || 1;
    const endpoint = snapPoint({
      x: contact.x + direction.x / length * SYMBOL_GRID_SIZE,
      y: contact.y + direction.y / length * SYMBOL_GRID_SIZE
    });
    return { contact, pin: { id: vertex, label: vertex.toUpperCase(), role: "io", ...endpoint } };
  });
}

export function validTriangleSettings(settings: TriangleSettings) {
  if (!TRIANGLE_VERTICES.every(vertex => [settings.vertices[vertex].x, settings.vertices[vertex].y]
    .every(value => Number.isFinite(value) && value % GRID_SIZE === 0 && Math.abs(value) <= TRIANGLE_MAX_COORDINATE))) return false;
  if (!TRIANGLE_EDGES.every(edge => Number.isInteger(settings.pins[edge]) && settings.pins[edge] >= 0 && settings.pins[edge] <= TRIANGLE_MAX_PIN_COUNT)) return false;
  if (triangleAreaTwice(settings) === 0) return false;
  const pins = trianglePinGeometry(settings);
  return new Set(pins.map(({ pin }) => `${pin.x},${pin.y}`)).size === pins.length;
}

export function triangleSize(settings: TriangleSettings) {
  const vertices = Object.values(settings.vertices);
  return {
    width: 2 * (Math.max(...vertices.map(point => Math.abs(point.x))) + SYMBOL_GRID_SIZE),
    height: 2 * (Math.max(...vertices.map(point => Math.abs(point.y))) + SYMBOL_GRID_SIZE)
  };
}

export function triangleVertexWorldPoint(component: ComponentInstance, vertex: TriangleVertex): Point {
  const local = triangleSettings(component).vertices[vertex];
  const offset = rotatePoint({ x: (component.mirrored ? -local.x : local.x) * componentScale(component), y: local.y * componentScale(component) }, component.rotation);
  return { x: component.x + offset.x, y: component.y + offset.y };
}

type TriangleMutationResult = { kind: "changed" } | { kind: "noop"; reason: "unsupported" | "invalid" | "unchanged" };

export function setTrianglePinCount(component: ComponentInstance, edge: TriangleEdge, value: string | number): TriangleMutationResult {
  if (component.type !== "triangle") return { kind: "noop", reason: "unsupported" };
  if (!isTriangleEdge(edge) || String(value).trim() === "") return { kind: "noop", reason: "invalid" };
  const settings = triangleSettings(component);
  if (settings.pins[edge] === Number(value)) return { kind: "noop", reason: "unchanged" };
  settings.pins[edge] = Number(value);
  if (!validTriangleSettings(settings)) return { kind: "noop", reason: "invalid" };
  component.values[trianglePinCountKey(edge)] = String(settings.pins[edge]);
  return { kind: "changed" };
}

export function setTriangleVertex(component: ComponentInstance, vertex: TriangleVertex, pointer: Point): TriangleMutationResult {
  if (component.type !== "triangle") return { kind: "noop", reason: "unsupported" };
  if (!isTriangleVertex(vertex) || !Number.isFinite(pointer.x) || !Number.isFinite(pointer.y)) return { kind: "noop", reason: "invalid" };
  const target = snapPoint(pointer);
  const current = triangleVertexWorldPoint(component, vertex);
  if (Math.abs(current.x - target.x) < 1e-6 && Math.abs(current.y - target.y) < 1e-6) return { kind: "noop", reason: "unchanged" };
  const local = rotatePoint({ x: target.x - component.x, y: target.y - component.y }, -component.rotation);
  const settings = triangleSettings(component);
  settings.vertices[vertex] = snapPoint({ x: (component.mirrored ? -local.x : local.x) / componentScale(component), y: local.y / componentScale(component) });
  if (!validTriangleSettings(settings)) return { kind: "noop", reason: "invalid" };
  // Recenter on-grid without moving either of the other vertices.
  const points = Object.values(settings.vertices);
  const center = snapPoint({
    x: (Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) / 2,
    y: (Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) / 2
  });
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
