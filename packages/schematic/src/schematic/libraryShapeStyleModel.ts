import { normalizeHexColor } from "../shared/color";
import type { ComponentInstance, ComponentType } from "./types";

export const LIBRARY_SHAPE_STROKE_WIDTH_VALUE_KEY = "libraryShapeStrokeWidth";
export const LIBRARY_SHAPE_LINE_STYLE_VALUE_KEY = "libraryShapeLineStyle";
export const LIBRARY_SHAPE_CORNER_RADIUS_VALUE_KEY = "libraryShapeCornerRadius";
export const LIBRARY_SHAPE_FILL_ENABLED_VALUE_KEY = "libraryShapeFillEnabled";
export const LIBRARY_SHAPE_FILL_COLOR_VALUE_KEY = "libraryShapeFillColor";
export const LIBRARY_SHAPE_FILL_OPACITY_VALUE_KEY = "libraryShapeFillOpacity";

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

export interface LibraryShapeStyle {
  strokeWidth: number;
  lineStyle: LibraryShapeLineStyle;
  cornerRadius: number;
  fillEnabled: boolean;
  fillColor: string;
  fillOpacity: number;
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
  fillOpacity: 1
};

const VALUE_KEYS: Readonly<Record<LibraryShapeStyleProperty, string>> = {
  strokeWidth: LIBRARY_SHAPE_STROKE_WIDTH_VALUE_KEY,
  lineStyle: LIBRARY_SHAPE_LINE_STYLE_VALUE_KEY,
  cornerRadius: LIBRARY_SHAPE_CORNER_RADIUS_VALUE_KEY,
  fillEnabled: LIBRARY_SHAPE_FILL_ENABLED_VALUE_KEY,
  fillColor: LIBRARY_SHAPE_FILL_COLOR_VALUE_KEY,
  fillOpacity: LIBRARY_SHAPE_FILL_OPACITY_VALUE_KEY
};

export function isLibraryShapeType(type: ComponentType) {
  return type === "rectangle" || type === "triangle";
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
    fillEnabled: values[LIBRARY_SHAPE_FILL_ENABLED_VALUE_KEY] === "true",
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
  if (!isLibraryShapeType(component.type)
    || (property === "cornerRadius" && component.type !== "rectangle")) {
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
