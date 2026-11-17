import { GRID_SIZE, SYMBOL_GRID_SIZE, type ComponentInstance, type PinDef } from "./types";

export const RECTANGLE_WIDTH_VALUE_KEY = "rectangleWidthGrid";
export const RECTANGLE_HEIGHT_VALUE_KEY = "rectangleHeightGrid";
export const RECTANGLE_LEFT_PIN_COUNT_VALUE_KEY = "rectanglePinCount:left";
export const RECTANGLE_RIGHT_PIN_COUNT_VALUE_KEY = "rectanglePinCount:right";
export const RECTANGLE_TOP_PIN_COUNT_VALUE_KEY = "rectanglePinCount:top";
export const RECTANGLE_BOTTOM_PIN_COUNT_VALUE_KEY = "rectanglePinCount:bottom";

export const RECTANGLE_MIN_SIZE_GRID = 2;
export const RECTANGLE_MAX_SIZE_GRID = 4096;
export const RECTANGLE_MAX_PIN_COUNT = 1024;
export const RECTANGLE_PIN_LEAD_GRID = 1;

export type RectangleSide = "left" | "right" | "top" | "bottom";
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
  leftPins: number;
  rightPins: number;
  topPins: number;
  bottomPins: number;
}

export type RectanglePropertyMutationResult =
  | { kind: "noop"; reason: "unsupported" | "invalid" | "unchanged" }
  | { kind: "changed"; settings: RectangleSettings };

export const DEFAULT_RECTANGLE_SETTINGS: Readonly<RectangleSettings> = {
  widthGrid: 4,
  heightGrid: 2,
  leftPins: 1,
  rightPins: 1,
  topPins: 0,
  bottomPins: 0
};

export function rectangleDefaultValues(): Record<string, string> {
  return rectangleSettingsValues(DEFAULT_RECTANGLE_SETTINGS);
}

export function rectangleSettingsValues(settings: RectangleSettings): Record<string, string> {
  const normalized = normalizeRectangleSettings(settings);
  return {
    [RECTANGLE_WIDTH_VALUE_KEY]: String(normalized.widthGrid),
    [RECTANGLE_HEIGHT_VALUE_KEY]: String(normalized.heightGrid),
    [RECTANGLE_LEFT_PIN_COUNT_VALUE_KEY]: String(normalized.leftPins),
    [RECTANGLE_RIGHT_PIN_COUNT_VALUE_KEY]: String(normalized.rightPins),
    [RECTANGLE_TOP_PIN_COUNT_VALUE_KEY]: String(normalized.topPins),
    [RECTANGLE_BOTTOM_PIN_COUNT_VALUE_KEY]: String(normalized.bottomPins)
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
    widthGrid: readInteger(values[RECTANGLE_WIDTH_VALUE_KEY], DEFAULT_RECTANGLE_SETTINGS.widthGrid),
    heightGrid: readInteger(values[RECTANGLE_HEIGHT_VALUE_KEY], DEFAULT_RECTANGLE_SETTINGS.heightGrid),
    leftPins: readInteger(values[RECTANGLE_LEFT_PIN_COUNT_VALUE_KEY], DEFAULT_RECTANGLE_SETTINGS.leftPins),
    rightPins: readInteger(values[RECTANGLE_RIGHT_PIN_COUNT_VALUE_KEY], DEFAULT_RECTANGLE_SETTINGS.rightPins),
    topPins: readInteger(values[RECTANGLE_TOP_PIN_COUNT_VALUE_KEY], DEFAULT_RECTANGLE_SETTINGS.topPins),
    bottomPins: readInteger(values[RECTANGLE_BOTTOM_PIN_COUNT_VALUE_KEY], DEFAULT_RECTANGLE_SETTINGS.bottomPins)
  });
}

export function normalizeRectangleSettings(settings: RectangleSettings): RectangleSettings {
  const leftPins = clampPinCount(settings.leftPins);
  const rightPins = clampPinCount(settings.rightPins);
  const topPins = clampPinCount(settings.topPins);
  const bottomPins = clampPinCount(settings.bottomPins);
  const minimumWidth = rectangleMinimumSideGrid(Math.max(topPins, bottomPins));
  const minimumHeight = rectangleMinimumSideGrid(Math.max(leftPins, rightPins));
  return {
    widthGrid: normalizeGridSize(settings.widthGrid, minimumWidth),
    heightGrid: normalizeGridSize(settings.heightGrid, minimumHeight),
    leftPins,
    rightPins,
    topPins,
    bottomPins
  };
}

export function normalizeRectangleDimensionInput(value: string | number): number | null {
  const parsed = parseIntegerInput(value);
  if (parsed === null || parsed < RECTANGLE_MIN_SIZE_GRID || parsed > RECTANGLE_MAX_SIZE_GRID) {
    return null;
  }
  return parsed;
}

export function normalizeRectanglePinCountInput(value: string | number): number | null {
  const parsed = parseIntegerInput(value);
  if (parsed === null || parsed < 0 || parsed > RECTANGLE_MAX_PIN_COUNT) return null;
  return parsed;
}

export function setRectangleProperty(
  component: Pick<ComponentInstance, "type" | "values">,
  property: RectangleProperty,
  value: string | number
): RectanglePropertyMutationResult {
  if (component.type !== "rectangle") return { kind: "noop", reason: "unsupported" };
  const parsed = property === "width" || property === "height"
    ? normalizeRectangleDimensionInput(value)
    : normalizeRectanglePinCountInput(value);
  if (parsed === null) return { kind: "noop", reason: "invalid" };

  const previous = rectangleSettings(component);
  const next = normalizeRectangleSettings({
    ...previous,
    ...(property === "width" ? { widthGrid: parsed } : {}),
    ...(property === "height" ? { heightGrid: parsed } : {}),
    ...(property === "leftPins" ? { leftPins: parsed } : {}),
    ...(property === "rightPins" ? { rightPins: parsed } : {}),
    ...(property === "topPins" ? { topPins: parsed } : {}),
    ...(property === "bottomPins" ? { bottomPins: parsed } : {})
  });
  if (sameRectangleSettings(previous, next)) return { kind: "noop", reason: "unchanged" };
  Object.assign(component.values, rectangleSettingsValues(next));
  return { kind: "changed", settings: next };
}

export function rectangleSize(settings: RectangleSettings) {
  const normalized = normalizeRectangleSettings(settings);
  return {
    width: (normalized.widthGrid + 2 * RECTANGLE_PIN_LEAD_GRID) * SYMBOL_GRID_SIZE,
    height: (normalized.heightGrid + 2 * RECTANGLE_PIN_LEAD_GRID) * SYMBOL_GRID_SIZE
  };
}

export function rectanglePins(settings: RectangleSettings): PinDef[] {
  const normalized = normalizeRectangleSettings(settings);
  const size = rectangleSize(normalized);
  const leftY = distributedOffsets(normalized.heightGrid, normalized.leftPins);
  const rightY = distributedOffsets(normalized.heightGrid, normalized.rightPins);
  const topX = distributedOffsets(normalized.widthGrid, normalized.topPins);
  const bottomX = distributedOffsets(normalized.widthGrid, normalized.bottomPins);

  return [
    ...leftY.map((slot, index): PinDef => ({
      id: `left-${index + 1}`,
      label: `left-${index + 1}`,
      role: "io",
      x: -size.width / 2,
      y: slot
    })),
    ...rightY.map((slot, index): PinDef => ({
      id: `right-${index + 1}`,
      label: `right-${index + 1}`,
      role: "io",
      x: size.width / 2,
      y: slot
    })),
    ...topX.map((slot, index): PinDef => ({
      id: `top-${index + 1}`,
      label: `top-${index + 1}`,
      role: "io",
      x: slot,
      y: -size.height / 2
    })),
    ...bottomX.map((slot, index): PinDef => ({
      id: `bottom-${index + 1}`,
      label: `bottom-${index + 1}`,
      role: "io",
      x: slot,
      y: size.height / 2
    }))
  ];
}

export function rectangleMinimumSideGrid(pinCount: number) {
  if (pinCount <= 0) return RECTANGLE_MIN_SIZE_GRID;
  return normalizeGridSize(pinCount + 1, RECTANGLE_MIN_SIZE_GRID);
}

function distributedOffsets(sideGrid: number, count: number) {
  if (count <= 0) return [];
  if (count === 1) return [0];
  const span = (sideGrid - 2) * SYMBOL_GRID_SIZE;
  // Round distances from the center, then mirror. Rounding absolute slots
  // independently would bias pairs at half-grid ties to the same side.
  return Array.from({ length: count }, (_, index) => {
    const offset = (2 * index - count + 1) * span / (2 * (count - 1));
    return Math.sign(offset) * Math.round(Math.abs(offset) / GRID_SIZE) * GRID_SIZE;
  });
}

function sameRectangleSettings(left: RectangleSettings, right: RectangleSettings) {
  return left.widthGrid === right.widthGrid
    && left.heightGrid === right.heightGrid
    && left.leftPins === right.leftPins
    && left.rightPins === right.rightPins
    && left.topPins === right.topPins
    && left.bottomPins === right.bottomPins;
}

function normalizeGridSize(value: number, minimum: number) {
  const finite = Number.isFinite(value) ? Math.trunc(value) : minimum;
  return Math.min(RECTANGLE_MAX_SIZE_GRID, Math.max(minimum, finite));
}

function clampPinCount(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(RECTANGLE_MAX_PIN_COUNT, Math.max(0, Math.trunc(value)));
}

function readInteger(value: string | undefined, fallback: number) {
  const parsed = value === undefined ? Number.NaN : Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function parseIntegerInput(value: string | number) {
  const normalized = typeof value === "string" ? value.trim() : value;
  if (normalized === "") return null;
  const parsed = Number(normalized);
  return Number.isInteger(parsed) ? parsed : null;
}
