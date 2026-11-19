import type { ComponentInstance, Point } from "./types";

export type ShapeKind = "rectangle" | "triangle" | "ellipse" | "polyline" | "polygon" | "arc";

export const SHAPE_KINDS: readonly ShapeKind[] = [
  "rectangle", "triangle", "ellipse", "polyline", "polygon", "arc"
];

export const SHAPE_LABELS: Record<ShapeKind, string> = {
  rectangle: "Rectangle",
  triangle: "Triangle",
  ellipse: "Ellipse",
  polyline: "Polyline",
  polygon: "Polygon",
  arc: "Arc"
};

const DEFAULTS: Record<ShapeKind, { width: number; height: number; fill: string }> = {
  rectangle: { width: 140, height: 90, fill: "#e8f0fb" },
  triangle: { width: 120, height: 110, fill: "#e8f0fb" },
  ellipse: { width: 110, height: 80, fill: "#e8f0fb" },
  polyline: { width: 140, height: 100, fill: "none" },
  polygon: { width: 130, height: 120, fill: "#e8f0fb" },
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
    "shape:z": String(zOrder)
  };
  if (kind === "rectangle") values["shape:radius"] = "12";
  if (kind === "arc") {
    values["shape:startAngle"] = "0";
    values["shape:endAngle"] = "180";
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
    endAngle
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
    return `M 0 ${number(-height / 2)} L ${number(width / 2)} ${number(height / 2)} L ${number(-width / 2)} ${number(height / 2)} Z`;
  }
  if (kind === "ellipse") {
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
