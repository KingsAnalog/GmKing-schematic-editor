import { normalizeHexColor } from "../shared/color";
import type { ComponentInstance, ComponentType } from "./types";

export const LIBRARY_SHAPE_STROKE_WIDTH_VALUE_KEY = "libraryShapeStrokeWidth";
export const LIBRARY_SHAPE_LINE_STYLE_VALUE_KEY = "libraryShapeLineStyle";
export const LIBRARY_SHAPE_CORNER_RADIUS_VALUE_KEY = "libraryShapeCornerRadius";
export const LIBRARY_SHAPE_FILL_ENABLED_VALUE_KEY = "libraryShapeFillEnabled";
export const LIBRARY_SHAPE_FILL_COLOR_VALUE_KEY = "libraryShapeFillColor";
export const LIBRARY_SHAPE_FILL_OPACITY_VALUE_KEY = "libraryShapeFillOpacity";
export const LIBRARY_SHAPE_START_ARROW_VALUE_KEY = "libraryShapeStartArrow";
export const LIBRARY_SHAPE_END_ARROW_VALUE_KEY = "libraryShapeEndArrow";
export const LIBRARY_SHAPE_START_ARROW_SIZE_VALUE_KEY = "libraryShapeStartArrowSize";
export const LIBRARY_SHAPE_END_ARROW_SIZE_VALUE_KEY = "libraryShapeEndArrowSize";

export const LIBRARY_SHAPE_MIN_STROKE_WIDTH = 0.5;
export const LIBRARY_SHAPE_MAX_STROKE_WIDTH = 40;
export const LIBRARY_SHAPE_MAX_CORNER_RADIUS = 4096;

export const LIBRARY_SHAPE_LINE_STYLES = ["solid", "dashed", "dotted", "dashDot"] as const;
export type LibraryShapeLineStyle = typeof LIBRARY_SHAPE_LINE_STYLES[number];

export const LIBRARY_SHAPE_LINE_STYLE_OPTIONS: readonly {
  value: LibraryShapeLineStyle;
  label: string;
}[] = [
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
  { value: "dashDot", label: "Dash-dot" }
];

export const LIBRARY_SHAPE_LINE_DASHARRAYS: Readonly<Record<LibraryShapeLineStyle, string>> = {
  solid: "none",
  dashed: "12 6",
  dotted: "2 5",
  dashDot: "12 5 2 5"
};

export const LIBRARY_SHAPE_ARROW_TYPES = ["none", "filled", "asmeFilled", "open", "stealth", "diamond"] as const;
export type LibraryShapeArrowType = typeof LIBRARY_SHAPE_ARROW_TYPES[number];
export const LIBRARY_SHAPE_ARROW_SIZES = ["small", "medium", "large", "extraLarge"] as const;
export type LibraryShapeArrowSize = typeof LIBRARY_SHAPE_ARROW_SIZES[number];
export const LIBRARY_SHAPE_ARROW_FIELDS = [
  ["startArrow", "startArrowSize"], ["endArrow", "endArrowSize"]
] as const;

export function isLibraryShapeArrowType(value: unknown): value is LibraryShapeArrowType {
  return LIBRARY_SHAPE_ARROW_TYPES.some(type => type === value);
}

export function isLibraryShapeArrowSize(value: unknown): value is LibraryShapeArrowSize {
  return LIBRARY_SHAPE_ARROW_SIZES.some(size => size === value);
}

function readArrowType(value: string | undefined): LibraryShapeArrowType {
  if (value === "true") return "filled";
  return isLibraryShapeArrowType(value) ? value : "none";
}

function readArrowSize(value: string | undefined): LibraryShapeArrowSize {
  return isLibraryShapeArrowSize(value) ? value : "medium";
}

export interface LibraryShapeStyle {
  strokeWidth: number;
  lineStyle: LibraryShapeLineStyle;
  cornerRadius: number;
  fillEnabled: boolean;
  fillColor: string;
  fillOpacity: number;
  startArrow: LibraryShapeArrowType;
  endArrow: LibraryShapeArrowType;
  startArrowSize: LibraryShapeArrowSize;
  endArrowSize: LibraryShapeArrowSize;
}

export type LibraryShapeStyleProperty = keyof LibraryShapeStyle;
export type LibraryShapeStyleValue = string | number | boolean;

export type LibraryShapeStyleMutationResult =
  | { kind: "noop"; reason: "unsupported" | "invalid" | "unchanged" }
  | { kind: "changed"; style: LibraryShapeStyle };

export const DEFAULT_LIBRARY_SHAPE_STYLE: Readonly<LibraryShapeStyle> = {
  strokeWidth: 4,
  lineStyle: "solid",
  cornerRadius: 0,
  fillEnabled: false,
  fillColor: "#ffffff",
  fillOpacity: 1,
  startArrow: "none",
  endArrow: "none",
  startArrowSize: "medium",
  endArrowSize: "medium"
};

const VALUE_KEYS: Readonly<Record<LibraryShapeStyleProperty, string>> = {
  strokeWidth: LIBRARY_SHAPE_STROKE_WIDTH_VALUE_KEY,
  lineStyle: LIBRARY_SHAPE_LINE_STYLE_VALUE_KEY,
  cornerRadius: LIBRARY_SHAPE_CORNER_RADIUS_VALUE_KEY,
  fillEnabled: LIBRARY_SHAPE_FILL_ENABLED_VALUE_KEY,
  fillColor: LIBRARY_SHAPE_FILL_COLOR_VALUE_KEY,
  fillOpacity: LIBRARY_SHAPE_FILL_OPACITY_VALUE_KEY,
  startArrow: LIBRARY_SHAPE_START_ARROW_VALUE_KEY,
  endArrow: LIBRARY_SHAPE_END_ARROW_VALUE_KEY,
  startArrowSize: LIBRARY_SHAPE_START_ARROW_SIZE_VALUE_KEY,
  endArrowSize: LIBRARY_SHAPE_END_ARROW_SIZE_VALUE_KEY
};

export type OpenLibraryShapeType = Extract<ComponentType, "polyline" | "arc">;
export type VertexLibraryShapeType = OpenLibraryShapeType | "circle" | "polygon";
export type LibraryShapeType = "rectangle" | "triangle" | VertexLibraryShapeType;

export function isVertexLibraryShapeType(type: string): type is VertexLibraryShapeType {
  return type === "circle" || type === "polygon" || isOpenLibraryShapeType(type);
}

export function isOpenLibraryShapeType(type: string): type is OpenLibraryShapeType {
  return type === "polyline" || type === "arc";
}

export function isLibraryShapeType(type: string): type is LibraryShapeType {
  return type === "rectangle" || type === "triangle" || isVertexLibraryShapeType(type);
}

export function supportsLibraryShapeStyle(type: ComponentType, property: LibraryShapeStyleProperty) {
  if (type === "sheetBlock") {
    return property === "fillEnabled" || property === "fillColor" || property === "fillOpacity";
  }
  if (!isLibraryShapeType(type)) return false;
  switch (property) {
    case "cornerRadius": return type === "rectangle";
    case "startArrow":
    case "endArrow":
    case "startArrowSize":
    case "endArrowSize": return isOpenLibraryShapeType(type);
    case "fillEnabled":
    case "fillColor":
    case "fillOpacity": return !isOpenLibraryShapeType(type);
    default: return true;
  }
}

export function isLibraryShapeLineStyle(value: unknown): value is LibraryShapeLineStyle {
  return typeof value === "string"
    && (LIBRARY_SHAPE_LINE_STYLES as readonly string[]).includes(value);
}

export function isLibraryShapeStyleProperty(value: unknown): value is LibraryShapeStyleProperty {
  return typeof value === "string" && Object.hasOwn(VALUE_KEYS, value);
}

export function libraryShapeStyleValueKey(property: LibraryShapeStyleProperty) {
  return VALUE_KEYS[property];
}

export function libraryShapeStyle(
  component: Pick<ComponentInstance, "type" | "values">
): LibraryShapeStyle {
  const values = component.values;
  const open = isOpenLibraryShapeType(component.type);
  return {
    strokeWidth: normalizeLibraryShapeStrokeWidth(values[LIBRARY_SHAPE_STROKE_WIDTH_VALUE_KEY])
      ?? DEFAULT_LIBRARY_SHAPE_STYLE.strokeWidth,
    lineStyle: isLibraryShapeLineStyle(values[LIBRARY_SHAPE_LINE_STYLE_VALUE_KEY])
      ? values[LIBRARY_SHAPE_LINE_STYLE_VALUE_KEY]
      : DEFAULT_LIBRARY_SHAPE_STYLE.lineStyle,
    cornerRadius: component.type === "rectangle"
      ? normalizeLibraryShapeCornerRadius(values[LIBRARY_SHAPE_CORNER_RADIUS_VALUE_KEY])
        ?? DEFAULT_LIBRARY_SHAPE_STYLE.cornerRadius
      : DEFAULT_LIBRARY_SHAPE_STYLE.cornerRadius,
    fillEnabled: !open && values[LIBRARY_SHAPE_FILL_ENABLED_VALUE_KEY] === "true",
    startArrow: open ? readArrowType(values[LIBRARY_SHAPE_START_ARROW_VALUE_KEY]) : "none",
    endArrow: open ? readArrowType(values[LIBRARY_SHAPE_END_ARROW_VALUE_KEY]) : "none",
    startArrowSize: readArrowSize(values[LIBRARY_SHAPE_START_ARROW_SIZE_VALUE_KEY]),
    endArrowSize: readArrowSize(values[LIBRARY_SHAPE_END_ARROW_SIZE_VALUE_KEY]),
    fillColor: normalizeHexColor(values[LIBRARY_SHAPE_FILL_COLOR_VALUE_KEY])
      ?? DEFAULT_LIBRARY_SHAPE_STYLE.fillColor,
    fillOpacity: normalizeLibraryShapeFillOpacity(values[LIBRARY_SHAPE_FILL_OPACITY_VALUE_KEY])
      ?? DEFAULT_LIBRARY_SHAPE_STYLE.fillOpacity
  };
}

export function normalizeLibraryShapeStrokeWidth(value: unknown) {
  return normalizeHalfStepNumber(
    value,
    LIBRARY_SHAPE_MIN_STROKE_WIDTH,
    LIBRARY_SHAPE_MAX_STROKE_WIDTH
  );
}

export function normalizeLibraryShapeCornerRadius(value: unknown) {
  return normalizeHalfStepNumber(value, 0, LIBRARY_SHAPE_MAX_CORNER_RADIUS);
}

export function normalizeLibraryShapeFillOpacity(value: unknown) {
  const normalized = normalizeNumber(value);
  return normalized !== null && normalized >= 0 && normalized <= 1 ? normalized : null;
}

export function setLibraryShapeStyleProperty(
  component: Pick<ComponentInstance, "type" | "values">,
  property: LibraryShapeStyleProperty,
  value: LibraryShapeStyleValue
): LibraryShapeStyleMutationResult {
  if (!supportsLibraryShapeStyle(component.type, property)) {
    return { kind: "noop", reason: "unsupported" };
  }
  const key = VALUE_KEYS[property];
  const current = libraryShapeStyle(component);
  let nextValue = current[property];
  switch (property) {
    case "strokeWidth": {
      const parsed = normalizeLibraryShapeStrokeWidth(value);
      if (parsed === null) return { kind: "noop", reason: "invalid" };
      nextValue = parsed;
      break;
    }
    case "lineStyle":
      if (!isLibraryShapeLineStyle(value)) return { kind: "noop", reason: "invalid" };
      nextValue = value;
      break;
    case "cornerRadius": {
      const parsed = normalizeLibraryShapeCornerRadius(value);
      if (parsed === null) return { kind: "noop", reason: "invalid" };
      nextValue = parsed;
      break;
    }
    case "startArrow":
    case "endArrow":
      if (typeof value === "boolean") {
        nextValue = value ? (current[property] === "none" ? "filled" : current[property]) : "none";
      } else {
        if (!isLibraryShapeArrowType(value)) return { kind: "noop", reason: "invalid" };
        nextValue = value;
      }
      break;
    case "startArrowSize":
    case "endArrowSize":
      if (!isLibraryShapeArrowSize(value)) return { kind: "noop", reason: "invalid" };
      nextValue = value;
      break;
    case "fillEnabled":
      if (typeof value !== "boolean") return { kind: "noop", reason: "invalid" };
      nextValue = value;
      break;
    case "fillColor": {
      const parsed = normalizeHexColor(value);
      if (!parsed) return { kind: "noop", reason: "invalid" };
      nextValue = parsed;
      break;
    }
    case "fillOpacity": {
      const parsed = normalizeLibraryShapeFillOpacity(value);
      if (parsed === null) return { kind: "noop", reason: "invalid" };
      nextValue = parsed;
      break;
    }
  }

  const defaultValue = DEFAULT_LIBRARY_SHAPE_STYLE[property];
  const nextRaw = Object.is(nextValue, defaultValue) ? undefined : String(nextValue);
  if (component.values[key] === nextRaw) {
    return { kind: "noop", reason: "unchanged" };
  }
  if (nextRaw === undefined) delete component.values[key];
  else component.values[key] = nextRaw;
  return {
    kind: "changed",
    style: { ...current, [property]: nextValue }
  };
}

function normalizeHalfStepNumber(value: unknown, minimum: number, maximum: number) {
  const parsed = normalizeNumber(value);
  return parsed !== null
    && parsed >= minimum
    && parsed <= maximum
    && Number.isInteger(parsed * 2)
    ? parsed
    : null;
}

function normalizeNumber(value: unknown) {
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}
