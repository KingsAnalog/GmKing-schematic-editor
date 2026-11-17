import { line, path, SYMBOL_STROKE_WIDTH } from "./symbolPrimitives";
import {
  appendTransistorCircle,
  solidArrowTriangleAlong,
  splitTransistorCircleSymbol
} from "./transistorSymbols";

export type BjtKind = "npn" | "pnp";

export interface BjtSymbolView {
  kind: BjtKind;
  circle: boolean;
}

export function parseBjtSymbol(symbol: string): BjtSymbolView | null {
  const parsed = splitTransistorCircleSymbol(symbol);
  return parsed.symbol === "npn" || parsed.symbol === "pnp"
    ? { kind: parsed.symbol, circle: parsed.circle }
    : null;
}

export function bjtBodySymbol(
  width: number,
  height: number,
  view: BjtSymbolView,
  lineWidth = SYMBOL_STROKE_WIDTH
) {
  const geometry = bjtGeometry(width, height, lineWidth);
  const emitter = view.kind === "npn" ? geometry.lower : geometry.upper;
  const collector = view.kind === "npn" ? geometry.upper : geometry.lower;
  return appendTransistorCircle(path([
    line(geometry.leftPinX, geometry.cy, geometry.baseX, geometry.cy),
    `M ${geometry.baseX} ${collector.joinY} L ${geometry.topBottomPinX} ${collector.elbowY} L ${geometry.topBottomPinX} ${collector.pinY}`,
    `M ${geometry.baseX} ${emitter.joinY} L ${geometry.topBottomPinX} ${emitter.elbowY} L ${geometry.topBottomPinX} ${emitter.pinY}`
  ]), width, height, view.circle, lineWidth);
}

export function bjtBaseSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const geometry = bjtGeometry(width, height, lineWidth);
  return line(geometry.baseX, geometry.baseTopY, geometry.baseX, geometry.baseBottomY);
}

export function bjtMarkerSymbol(
  width: number,
  height: number,
  view: BjtSymbolView,
  lineWidth = SYMBOL_STROKE_WIDTH
) {
  const geometry = bjtGeometry(width, height, lineWidth);
  const emitter = view.kind === "npn" ? geometry.lower : geometry.upper;
  const branchX = geometry.topBottomPinX - geometry.baseX;
  const branchY = emitter.elbowY - emitter.joinY;
  const arrowPosition = view.kind === "npn" ? 1 : 0.35;
  const tipX = geometry.baseX + branchX * arrowPosition;
  const tipY = emitter.joinY + branchY * arrowPosition;
  return view.kind === "npn"
    ? solidArrowTriangleAlong(tipX, tipY, branchX, branchY, lineWidth)
    : solidArrowTriangleAlong(tipX, tipY, -branchX, -branchY, lineWidth);
}

function bjtGeometry(width: number, height: number, lineWidth: number) {
  const cy = height / 2;
  const baseX = width / 2 - 12 * lineWidth;
  const baseHalfVisibleLength = 9 * lineWidth;
  const branchJoinOffset = 4 * lineWidth;
  return {
    cy,
    baseX,
    baseTopY: cy - baseHalfVisibleLength,
    baseBottomY: cy + baseHalfVisibleLength,
    leftPinX: width / 2 - 40,
    topBottomPinX: width / 2,
    upper: {
      joinY: cy - branchJoinOffset,
      elbowY: cy - baseHalfVisibleLength,
      pinY: cy - 40
    },
    lower: {
      joinY: cy + branchJoinOffset,
      elbowY: cy + baseHalfVisibleLength,
      pinY: cy + 40
    }
  };
}
