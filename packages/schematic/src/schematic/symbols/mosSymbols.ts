import {
  parseMosViewVariantId,
  MOS_THICK_GATE_SYMBOL_SUFFIX,
  type MosComponentType,
  type MosViewSettings
} from "../mosViewModel";
import { circlePath, line, path, SYMBOL_STROKE_WIDTH } from "./symbolPrimitives";
import {
  appendTransistorCircle,
  splitTransistorCircleSymbol
} from "./transistorSymbols";

export interface MosSymbolView {
  kind: MosComponentType;
  settings: MosViewSettings;
  circle: boolean;
  thickGate: boolean;
}

export function parseMosSymbol(symbol: string): MosSymbolView | null {
  const parsed = splitTransistorCircleSymbol(symbol);
  const thickGate = parsed.symbol.endsWith(MOS_THICK_GATE_SYMBOL_SUFFIX);
  const baseSymbol = thickGate ? parsed.symbol.slice(0, -MOS_THICK_GATE_SYMBOL_SUFFIX.length) : parsed.symbol;
  const match = /^(nmos|pmos)-(.+)$/.exec(baseSymbol);
  if (!match) return null;
  const settings = parseMosViewVariantId(match[2]);
  return settings ? { kind: match[1] as MosComponentType, settings, circle: parsed.circle, thickGate } : null;
}

export function mosfetBodySymbol(
  width: number,
  height: number,
  view: MosSymbolView,
  lineWidth = SYMBOL_STROKE_WIDTH
) {
  const geometry = mosfetGeometry(width, height, lineWidth);
  const hasGateCircle = shouldDrawPmosGateCircle(view);
  const gateLeadEndX = hasGateCircle
    ? geometry.gateCircleCx - geometry.gateCircleRadius
    : geometry.gateInnerX;
  const hasBulkConnection = view.settings.pins === "4pin" || view.settings.arrow === "bulk";
  return appendTransistorCircle(path([
    line(geometry.gatePinX, geometry.cy, gateLeadEndX, geometry.cy),
    `M ${geometry.channelX} ${geometry.upperRightY} L ${geometry.rightInnerX} ${geometry.upperRightY} L ${geometry.rightInnerX} ${geometry.drainPinY}`,
    `M ${geometry.channelX} ${geometry.lowerRightY} L ${geometry.rightInnerX} ${geometry.lowerRightY} L ${geometry.rightInnerX} ${geometry.sourcePinY}`,
    hasBulkConnection ? line(geometry.rightInnerX, geometry.cy, geometry.channelX, geometry.cy) : "",
    hasGateCircle ? circlePath(geometry.gateCircleCx, geometry.cy, geometry.gateCircleRadius) : ""
  ]), width, height, view.circle, lineWidth);
}

export function mosfetGateSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH, thickGate = false) {
  const geometry = mosfetGeometry(width, height, lineWidth);
  return path([
    // Thick gates use the filled marker layer, leaving the channel stroke at 2a.
    thickGate ? "" : line(geometry.gateInnerX, geometry.cy - geometry.shortGateHalfLength, geometry.gateInnerX, geometry.cy + geometry.shortGateHalfLength),
    line(geometry.channelX, geometry.cy - geometry.longGateHalfLength, geometry.channelX, geometry.cy + geometry.longGateHalfLength)
  ]);
}

export function mosfetMarkerSymbol(
  width: number,
  height: number,
  view: MosSymbolView,
  lineWidth = SYMBOL_STROKE_WIDTH
) {
  const geometry = mosfetGeometry(width, height, lineWidth);
  // Grow the 2a gate to 3a toward the channel, keeping its left edge and PMOS bubble fixed.
  const gateLeft = geometry.gateInnerX - lineWidth;
  const gateRight = geometry.gateInnerX + 2 * lineWidth;
  const gateTop = geometry.cy - geometry.shortGateHalfLength;
  const gateBottom = geometry.cy + geometry.shortGateHalfLength;
  const gate = view.thickGate
    ? `M ${gateLeft} ${gateTop} L ${gateRight} ${gateTop} L ${gateRight} ${gateBottom} L ${gateLeft} ${gateBottom} Z`
    : "";
  if (view.settings.arrow === "none") return gate;
  if (view.settings.arrow === "bulk") {
    return path([gate, view.kind === "nmos"
      ? mosfetArrowTriangle(geometry.channelX, geometry.cy, "left", lineWidth)
      : mosfetArrowTriangle(geometry.rightInnerX, geometry.cy, "right", lineWidth)]);
  }
  return path([gate, view.kind === "nmos"
    ? mosfetArrowTriangle(geometry.rightInnerX, geometry.lowerRightY, "right", lineWidth)
    : mosfetArrowTriangle(geometry.channelX, geometry.upperRightY, "left", lineWidth)]);
}

function shouldDrawPmosGateCircle(view: MosSymbolView) {
  return view.kind === "pmos" && view.settings.gateStyle;
}

function mosfetGeometry(width: number, height: number, lineWidth: number) {
  const cx = width / 2;
  const cy = height / 2;
  const gatePinX = cx - 40;
  const rightInnerX = cx;
  const channelX = rightInnerX - 11 * lineWidth;
  const gateInnerX = channelX - 4 * lineWidth;
  const gateCircleRadius = 1.5 * lineWidth;
  const gateCircleCx = gateInnerX - gateCircleRadius - 0.5 * lineWidth;
  const rightHorizontalCenterHalfSpacing = (10 * lineWidth + lineWidth) / 2;
  const upperRightY = cy - rightHorizontalCenterHalfSpacing;
  const lowerRightY = cy + rightHorizontalCenterHalfSpacing;
  return {
    cy,
    gatePinX,
    gateInnerX,
    gateCircleCx,
    gateCircleRadius,
    channelX,
    rightInnerX,
    upperRightY,
    lowerRightY,
    drainPinY: cy - 40,
    sourcePinY: cy + 40,
    shortGateHalfLength: 7 * lineWidth,
    longGateHalfLength: 9 * lineWidth
  };
}

function mosfetArrowTriangle(tipX: number, centerY: number, direction: "left" | "right", lineWidth: number) {
  const base = 6 * lineWidth;
  const height = 7 * lineWidth;
  const baseX = direction === "right" ? tipX - height : tipX + height;
  return path([
    `M ${tipX} ${centerY}`,
    `L ${baseX} ${centerY - base / 2}`,
    `L ${baseX} ${centerY + base / 2}`,
    "Z"
  ]);
}
