import type { OperatorPinMode, Point } from "../types";
import { circlePath, line, path, polarityMark, SYMBOL_STROKE_WIDTH } from "./symbolPrimitives";

const ALL_OPERATOR_PINS = new Set(["left", "top", "right", "bottom"]);
const OPERATOR_PIN_IDS = ["left", "top", "right", "bottom"] as const;

export interface PlusPinSymbolState {
  mode: OperatorPinMode;
  symbolVisible: boolean;
  visible: boolean;
}

export function operatorSymbol(
  width: number,
  height: number,
  lineWidth = SYMBOL_STROKE_WIDTH,
  visiblePinIds: ReadonlySet<string> = ALL_OPERATOR_PINS
) {
  const { cx, cy, leftPin, topPin, rightPin, bottomPin, circleRadius } = operatorGeometry(width, height, lineWidth);
  return path([
    visiblePinIds.has("left") ? line(leftPin, cy, cx - circleRadius, cy) : "",
    visiblePinIds.has("top") ? line(cx, topPin, cx, cy - circleRadius) : "",
    visiblePinIds.has("right") ? line(cx + circleRadius, cy, rightPin, cy) : "",
    visiblePinIds.has("bottom") ? line(cx, cy + circleRadius, cx, bottomPin) : ""
  ]);
}

export function plusSymbol(
  width: number,
  height: number,
  lineWidth = SYMBOL_STROKE_WIDTH,
  visiblePinIds: ReadonlySet<string> = ALL_OPERATOR_PINS
) {
  return operatorSymbol(width, height, lineWidth, visiblePinIds);
}

export function multiplySymbol(
  width: number,
  height: number,
  lineWidth = SYMBOL_STROKE_WIDTH,
  visiblePinIds: ReadonlySet<string> = ALL_OPERATOR_PINS
) {
  return operatorSymbol(width, height, lineWidth, visiblePinIds);
}

export function plusAccentSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const { cx, cy, circleRadius, markHalfLength } = operatorGeometry(width, height, lineWidth);
  return path([
    circlePath(cx, cy, circleRadius),
    line(cx - markHalfLength, cy, cx + markHalfLength, cy),
    line(cx, cy - markHalfLength, cx, cy + markHalfLength)
  ]);
}

export function multiplyAccentSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const { cx, cy, circleRadius, markHalfLength } = operatorGeometry(width, height, lineWidth);
  return path([
    circlePath(cx, cy, circleRadius),
    line(cx - markHalfLength, cy - markHalfLength, cx + markHalfLength, cy + markHalfLength),
    line(cx - markHalfLength, cy + markHalfLength, cx + markHalfLength, cy - markHalfLength)
  ]);
}

export function plusAccentStrokeWidth(lineWidth = SYMBOL_STROKE_WIDTH) {
  return 2 * lineWidth;
}

export function multiplyAccentStrokeWidth(lineWidth = SYMBOL_STROKE_WIDTH) {
  return plusAccentStrokeWidth(lineWidth);
}

export function plusPinRoleSymbols(
  width: number,
  height: number,
  pinStates: ReadonlyMap<string, PlusPinSymbolState>,
  lineWidth = SYMBOL_STROKE_WIDTH
) {
  const geometry = operatorGeometry(width, height, lineWidth);
  const symbolHalfLength = 3 * lineWidth;
  return path(OPERATOR_PIN_IDS.map((pinId) => {
    const state = pinStates.get(pinId);
    if (!state?.visible || !state.symbolVisible || state.mode === "output") return "";
    const center = plusPinRoleSymbolCenter(pinId, geometry, lineWidth);
    return polarityMark(state.mode === "positive" ? "plus" : "minus", center.x, center.y, symbolHalfLength);
  }));
}

function plusPinRoleSymbolCenter(
  pinId: (typeof OPERATOR_PIN_IDS)[number],
  geometry: ReturnType<typeof operatorGeometry>,
  lineWidth: number
): Point {
  const { cx, cy, leftPin, topPin, rightPin, bottomPin, circleRadius } = geometry;
  const sideOffset = 8 * lineWidth;
  if (pinId === "left") return { x: (leftPin + cx - circleRadius) / 2, y: cy - sideOffset };
  if (pinId === "top") return { x: cx - sideOffset, y: (topPin + cy - circleRadius) / 2 };
  if (pinId === "right") return { x: (cx + circleRadius + rightPin) / 2, y: cy - sideOffset };
  return { x: cx - sideOffset, y: (cy + circleRadius + bottomPin) / 2 };
}

function operatorGeometry(width: number, height: number, lineWidth: number) {
  const cx = width / 2;
  const cy = height / 2;
  const accentStrokeWidth = plusAccentStrokeWidth(lineWidth);
  const circleRadius = (24 * lineWidth + accentStrokeWidth) / 2;
  return {
    cx,
    cy,
    leftPin: cx - width / 2,
    topPin: cy - height / 2,
    rightPin: cx + width / 2,
    bottomPin: cy + height / 2,
    circleRadius,
    markHalfLength: 8 * lineWidth
  };
}
