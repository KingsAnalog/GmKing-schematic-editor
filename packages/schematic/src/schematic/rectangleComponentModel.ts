import { GRID_SIZE, SYMBOL_GRID_SIZE, type ComponentInstance } from "./types";

export const RECTANGLE_WIDTH_VALUE_KEY = "rectangleWidthGrid";
export const RECTANGLE_HEIGHT_VALUE_KEY = "rectangleHeightGrid";

export const RECTANGLE_MIN_SIZE_GRID = 2;
export const RECTANGLE_FREE_SHAPE_MIN_SIZE_GRID = GRID_SIZE / SYMBOL_GRID_SIZE;
export const RECTANGLE_MAX_SIZE_GRID = 4096;

/** Legacy property ids remain accepted by the command API, but rectangles have no pins. */
export type RectangleProperty =
  | "width"
  | "height"
  | "leftPins"
  | "rightPins"
  | "topPins"
  | "bottomPins";

export interface RectangleSettings {
  widthGrid: number;
  heightGrid: number;
}

export type RectanglePropertyMutationResult =
  | { kind: "noop"; reason: "unsupported" | "invalid" | "unchanged" }
  | { kind: "changed"; settings: RectangleSettings };

export const DEFAULT_RECTANGLE_SETTINGS: Readonly<RectangleSettings> = {
  widthGrid: 4,
  heightGrid: 2
};

export function rectangleDefaultValues(): Record<string, string> {
  return rectangleSettingsValues(DEFAULT_RECTANGLE_SETTINGS);
}

export function rectangleSettingsValues(settings: RectangleSettings): Record<string, string> {
  const normalized = normalizeRectangleSettings(settings);
  return {
    [RECTANGLE_WIDTH_VALUE_KEY]: String(normalized.widthGrid),
    [RECTANGLE_HEIGHT_VALUE_KEY]: String(normalized.heightGrid)
  };
}

export function rectangleSettings(
  component: Pick<ComponentInstance, "type" | "values"> | Record<string, string>
): RectangleSettings {
  const candidateValues = (component as Pick<ComponentInstance, "values">).values;
  const values: Record<string, string> = candidateValues && typeof candidateValues === "object"
    ? candidateValues
    : component as Record<string, string>;
  return normalizeRectangleSettings({
    widthGrid: readGridSize(values[RECTANGLE_WIDTH_VALUE_KEY], DEFAULT_RECTANGLE_SETTINGS.widthGrid),
    heightGrid: readGridSize(values[RECTANGLE_HEIGHT_VALUE_KEY], DEFAULT_RECTANGLE_SETTINGS.heightGrid)
  });
}

export function normalizeRectangleSettings(settings: RectangleSettings): RectangleSettings {
  return {
    widthGrid: normalizeGridSize(settings.widthGrid),
    heightGrid: normalizeGridSize(settings.heightGrid)
  };
}

export function normalizeRectangleDimensionInput(value: string | number): number | null {
  const normalized = typeof value === "string" ? value.trim() : value;
  if (normalized === "") return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)
    || parsed < RECTANGLE_FREE_SHAPE_MIN_SIZE_GRID
    || parsed > RECTANGLE_MAX_SIZE_GRID
    || !Number.isInteger(parsed / RECTANGLE_FREE_SHAPE_MIN_SIZE_GRID)) {
    return null;
  }
  return parsed;
}

export function setRectangleProperty(
  component: Pick<ComponentInstance, "type" | "values">,
  property: RectangleProperty,
  value: string | number
): RectanglePropertyMutationResult {
  if (component.type !== "rectangle" || (property !== "width" && property !== "height")) {
    return { kind: "noop", reason: "unsupported" };
  }
  const parsed = normalizeRectangleDimensionInput(value);
  if (parsed === null) return { kind: "noop", reason: "invalid" };

  const previous = rectangleSettings(component);
  const next = normalizeRectangleSettings({
    ...previous,
    ...(property === "width" ? { widthGrid: parsed } : { heightGrid: parsed })
  });
  if (sameRectangleSettings(previous, next)) return { kind: "noop", reason: "unchanged" };
  Object.assign(component.values, rectangleSettingsValues(next));
  return { kind: "changed", settings: next };
}

/** The cell size is exactly the visible outline; there are no terminal lead margins. */
export function rectangleSize(settings: RectangleSettings) {
  const normalized = normalizeRectangleSettings(settings);
  return {
    width: normalized.widthGrid * SYMBOL_GRID_SIZE,
    height: normalized.heightGrid * SYMBOL_GRID_SIZE
  };
}

function sameRectangleSettings(left: RectangleSettings, right: RectangleSettings) {
  return left.widthGrid === right.widthGrid && left.heightGrid === right.heightGrid;
}

function normalizeGridSize(value: number) {
  const finite = Number.isFinite(value)
    ? Math.round(value / RECTANGLE_FREE_SHAPE_MIN_SIZE_GRID) * RECTANGLE_FREE_SHAPE_MIN_SIZE_GRID
    : RECTANGLE_FREE_SHAPE_MIN_SIZE_GRID;
  return Math.min(RECTANGLE_MAX_SIZE_GRID, Math.max(RECTANGLE_FREE_SHAPE_MIN_SIZE_GRID, finite));
}

function readGridSize(value: string | undefined, fallback: number) {
  const parsed = value === undefined ? Number.NaN : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
