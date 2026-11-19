import type { ComponentInstance, Point } from "./types";

export type ShapeKind = "rectangle" | "triangle" | "ellipse" | "line" | "polyline" | "polygon" | "circle" | "arc";

export const SHAPE_KINDS: readonly ShapeKind[] = [
  "rectangle", "triangle", "ellipse", "line", "polyline", "polygon", "circle", "arc"
];

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rectangle: "Rectangle",
  triangle: "Triangle",
  ellipse: "Ellipse",
  line: "Line",
  polyline: "Polyline",
  polygon: "Polygon",
  circle: "Circle",
  arc: "Arc"
};

const DEFAULTS: Record<ShapeKind, { width: number; height: number; fill: string }> = {
  rectangle: { width: 140, height: 90, fill: "#ffffff" },
  triangle: { width: 120, height: 110, fill: "#ffffff" },
  ellipse: { width: 110, height: 80, fill: "#ffffff" },
  line: { width: 120, height: 0, fill: "none" },
  polyline: { width: 140, height: 100, fill: "none" },
  polygon: { width: 130, height: 120, fill: "#ffffff" },
  circle: { width: 100, height: 100, fill: "#ffffff" },
  arc: { width: 120, height: 100, fill: "none" }
};

export const SHAPE_DEFAULT_STROKE = "#111111";

export function isShapeKind(value: unknown): value is ShapeKind {
  return typeof value === "string" && (SHAPE_KINDS as readonly string[]).includes(value);
}

export function isShapeInstance(instance: ComponentInstance | undefined | null): boolean {
  return !!instance && instance.type === "annotation" && isShapeKind(instance.values["shape:kind"]);
}

export function shapeKind(instance: ComponentInstance): ShapeKind {
  const kind = instance.values["shape:kind"];
  return isShapeKind(kind) ? kind : "rectangle";
}

export function defaultShapeValues(
  kind: ShapeKind,
  layerId: string,
  zOrder: number
): Record<string, string> {
  const defaults = DEFAULTS[kind];
  const values: Record<string, string> = {
    main: "",
    "shape:kind": kind,
    "shape:width": String(defaults.width),
    "shape:height": String(defaults.height),
    "shape:fill": defaults.fill,
    "shape:stroke": SHAPE_DEFAULT_STROKE,
    "shape:strokeWidth": "2",
    "shape:dash": "solid",
    "shape:layerId": layerId,
    "shape:z": String(zOrder),
    "shape:startArrow": "none",
    "shape:endArrow": "none",
    "shape:arrowSize": "9"
  };
  if (kind === "rectangle") {
    values["shape:radius"] = "0";
    values["shape:points"] = `-70,-45 70,-45 70,45 -70,45`;
  }
  if (kind === "triangle") {
    values["shape:points"] = `0,-55 60,55 -60,55`;
  }
  if (kind === "arc") {
    values["shape:startAngle"] = "0";
    values["shape:endAngle"] = "180";
  }
  if (kind === "line") {
    values["shape:points"] = "-60,0 60,0";
  }
  if (kind === "polyline") {
    values["shape:points"] = "-60,30 -25,-30 15,25 60,-25";
  }
  if (kind === "polygon") {
    values["shape:points"] = "0,-55 52,-17 32,45 -32,45 -52,-17";
  }
  return values;
}

export interface ShapeGeometry {
  kind: ShapeKind;
  width: number;
  height: number;
  path: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  dashArray: string;
  radius: number;
  points: Point[];
  startAngle: number;
  endAngle: number;
  startArrow: string;
  endArrow: string;
  arrowSize: number;
}

export function resolveShapeGeometry(instance: ComponentInstance): ShapeGeometry {
  const kind = shapeKind(instance);
  const defaults = DEFAULTS[kind];
  const width = positive(instance.values["shape:width"], defaults.width);
  const height = positive(instance.values["shape:height"], defaults.height);
  const fill = instance.values["shape:fill"]?.trim() || defaults.fill;
  const stroke = instance.values["shape:stroke"]?.trim() || SHAPE_DEFAULT_STROKE;
  const strokeWidth = Math.max(0, finite(instance.values["shape:strokeWidth"], 2));
  const dash = instance.values["shape:dash"] || "solid";
  const radius = Math.max(0, Math.min(finite(instance.values["shape:radius"], 0), Math.min(width, height) / 2));
  const points = parsePoints(instance.values["shape:points"], kind);
  const startAngle = finite(instance.values["shape:startAngle"], 0);
  const endAngle = finite(instance.values["shape:endAngle"], 180);
  const startArrow = instance.values["shape:startArrow"] || "none";
  const endArrow = instance.values["shape:endArrow"] || "none";
  const arrowSize = Math.max(2, finite(instance.values["shape:arrowSize"], 9));
  const path = shapePath(kind, width, height, radius, points, startAngle, endAngle);
  return {
    kind,
    width,
    height,
    path,
    fill,
    stroke,
    strokeWidth,
    dashArray: dashArray(dash),
    radius,
    points,
    startAngle,
    endAngle,
    startArrow,
    endArrow,
    arrowSize
  };
}

export interface ShapeArrow {
  d: string;
  filled: boolean;
}

export function shapeArrows(geometry: ShapeGeometry): { start: ShapeArrow | null; end: ShapeArrow | null } {
  if (geometry.kind !== "line" && geometry.kind !== "polyline") {
    return { start: null, end: null };
  }
  if (geometry.points.length < 2) return { start: null, end: null };
  const first = geometry.points[0];
  const second = geometry.points[1];
  const last = geometry.points[geometry.points.length - 1];
  const previous = geometry.points[geometry.points.length - 2];
  return {
    start: buildArrow(first, { x: first.x - second.x, y: first.y - second.y }, geometry.startArrow, geometry.arrowSize),
    end: buildArrow(last, { x: last.x - previous.x, y: last.y - previous.y }, geometry.endArrow, geometry.arrowSize)
  };
}

function buildArrow(tip: Point, direction: Point, type: string, size: number): ShapeArrow | null {
  const length = Math.hypot(direction.x, direction.y);
  if (type === "none" || !length) return null;
  const ux = direction.x / length;
  const uy = direction.y / length;
  const px = -uy;
  const py = ux;
  const base = { x: tip.x - ux * size, y: tip.y - uy * size };
  const half = size * 0.45;
  const left = { x: base.x + px * half, y: base.y + py * half };
  const right = { x: base.x - px * half, y: base.y - py * half };
  if (type === "open") {
    return {
      d: `M ${number(left.x)} ${number(left.y)} L ${number(tip.x)} ${number(tip.y)} L ${number(right.x)} ${number(right.y)}`,
      filled: false
    };
  }
  if (type === "bar") {
    const center = { x: tip.x - ux * size, y: tip.y - uy * size };
    return {
      d: `M ${number(center.x + px * size * 0.6)} ${number(center.y + py * size * 0.6)} L ${number(center.x - px * size * 0.6)} ${number(center.y - py * size * 0.6)}`,
      filled: false
    };
  }
  if (type === "circle") {
    const center = { x: tip.x - ux * size * 0.5, y: tip.y - uy * size * 0.5 };
    const radius = size * 0.35;
    return {
      d: `M ${number(center.x - radius)} ${number(center.y)} A ${number(radius)} ${number(radius)} 0 1 0 ${number(center.x + radius)} ${number(center.y)} A ${number(radius)} ${number(radius)} 0 1 0 ${number(center.x - radius)} ${number(center.y)}`,
      filled: true
    };
  }
  return {
    d: `M ${number(tip.x)} ${number(tip.y)} L ${number(left.x)} ${number(left.y)} L ${number(right.x)} ${number(right.y)} Z`,
    filled: true
  };
}

export function parseShapePoints(raw: string | undefined): Point[] {
  if (!raw) return [];
  return raw
    .split(/[;\s]+/)
    .filter(Boolean)
    .map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    })
    .filter((point): point is Point => !!point);
}

export function formatShapePoints(points: readonly Point[]) {
  return points.map(point => `${number(point.x)},${number(point.y)}`).join(" ");
}

function parsePoints(raw: string | undefined, kind: ShapeKind): Point[] {
  const parsed = parseShapePoints(raw);
  if (parsed.length >= 2) return parsed;
  const defaults = parseShapePoints(defaultShapeValues(kind, "layer-1", 0)["shape:points"]);
  if (defaults.length >= 2) return defaults;
  const geometry = DEFAULTS[kind];
  return [
    { x: -geometry.width / 2, y: -geometry.height / 2 },
    { x: geometry.width / 2, y: geometry.height / 2 }
  ];
}

function shapePath(
  kind: ShapeKind,
  width: number,
  height: number,
  radius: number,
  points: readonly Point[],
  startAngle: number,
  endAngle: number
) {
  if (kind === "rectangle") {
    const left = -width / 2;
    const top = -height / 2;
    const right = width / 2;
    const bottom = height / 2;
    if (radius <= 0) return `M ${number(left)} ${number(top)} H ${number(right)} V ${number(bottom)} H ${number(left)} Z`;
    return [
      `M ${number(left + radius)} ${number(top)}`,
      `H ${number(right - radius)}`,
      `Q ${number(right)} ${number(top)} ${number(right)} ${number(top + radius)}`,
      `V ${number(bottom - radius)}`,
      `Q ${number(right)} ${number(bottom)} ${number(right - radius)} ${number(bottom)}`,
      `H ${number(left + radius)}`,
      `Q ${number(left)} ${number(bottom)} ${number(left)} ${number(bottom - radius)}`,
      `V ${number(top + radius)}`,
      `Q ${number(left)} ${number(top)} ${number(left + radius)} ${number(top)}`,
      "Z"
    ].join(" ");
  }
  if (kind === "triangle") {
    if (points.length >= 3) {
      return points.slice(0, 3).map((point, index) => `${index === 0 ? "M" : "L"} ${number(point.x)} ${number(point.y)}`).join(" ") + " Z";
    }
    return `M 0 ${number(-height / 2)} L ${number(width / 2)} ${number(height / 2)} L ${number(-width / 2)} ${number(height / 2)} Z`;
  }
  if (kind === "ellipse" || kind === "circle") {
    const rx = width / 2;
    const ry = height / 2;
    return [
      `M ${number(-rx)} 0`,
      `A ${number(rx)} ${number(ry)} 0 1 0 ${number(rx)} 0`,
      `A ${number(rx)} ${number(ry)} 0 1 0 ${number(-rx)} 0`,
      "Z"
    ].join(" ");
  }
  if (kind === "arc") {
    const rx = width / 2;
    const ry = height / 2;
    const start = pointOnEllipse(rx, ry, startAngle);
    const end = pointOnEllipse(rx, ry, endAngle);
    const delta = endAngle - startAngle;
    const large = Math.abs(delta) > 180 ? 1 : 0;
    const sweep = delta >= 0 ? 1 : 0;
    return `M ${number(start.x)} ${number(start.y)} A ${number(rx)} ${number(ry)} 0 ${large} ${sweep} ${number(end.x)} ${number(end.y)}`;
  }
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${number(point.x)} ${number(point.y)}`).join(" ");
  return kind === "polygon" ? `${path} Z` : path;
}

function pointOnEllipse(rx: number, ry: number, degrees: number) {
  const radians = degrees * Math.PI / 180;
  return { x: rx * Math.cos(radians), y: ry * Math.sin(radians) };
}

function dashArray(dash: string) {
  if (dash === "dashed") return "8 5";
  if (dash === "dotted") return "2 4";
  return "none";
}

function positive(raw: string | undefined, fallback: number) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function finite(raw: string | undefined, fallback: number) {
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function number(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
