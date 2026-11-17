import { circlePath, line, path, SYMBOL_STROKE_WIDTH } from "./symbolPrimitives";
import { SYMBOL_GRID_SIZE, type GainPolarity } from "../types";
import { variableSymbolArrowShaftSymbol } from "./variableSymbolDecoration";

const ANALOG_BUFFER_SCALE = 1.3;
const INVERTER_BODY_HEIGHT = 26;
const INVERTER_TRIANGLE_WIDTH = 20;
const INVERTER_INNER_TANGENCY_GUARD = 0.5;
const VARIABLE_INVERTER_ARROW_TAIL_OFFSET = 16;
const ANALOG_BUFFER_BODY_HEIGHT = 29 * ANALOG_BUFFER_SCALE;
const ANALOG_BUFFER_TRIANGLE_WIDTH = 22 * ANALOG_BUFFER_SCALE;

export function bufferAccentStrokeWidth(lineWidth = SYMBOL_STROKE_WIDTH) {
  return 2 * lineWidth;
}

export function inverterBubbleInnerDiameter(lineWidth = SYMBOL_STROKE_WIDTH) {
  return 4 * lineWidth;
}

export function inverterSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const geometry = inverterGeometry(width, height, lineWidth);
  return bufferLeadSymbol(geometry, true);
}

export function variableInverterSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  return path([
    inverterSymbol(width, height, lineWidth),
    variableSymbolArrowShaftSymbol(width, height, lineWidth, VARIABLE_INVERTER_ARROW_TAIL_OFFSET)
  ]);
}

export function inverterTriangleSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  return bufferTriangleSymbol(inverterGeometry(width, height, lineWidth));
}

export function inverterSupplyLeadSymbol(
  width: number,
  height: number,
  visiblePinIds: ReadonlySet<string>,
  lineWidth = SYMBOL_STROKE_WIDTH
) {
  const geometry = inverterGeometry(width, height, lineWidth);
  // Intersect the vertical supply leads with the triangle's sloping edges.
  const edgeOffset = (geometry.cy - geometry.bodyTopY)
    * (geometry.bodyApexX - geometry.cx) / (geometry.bodyApexX - geometry.bodyLeftX);
  return path([
    visiblePinIds.has("vdd")
      ? line(geometry.cx, geometry.cy - SYMBOL_GRID_SIZE, geometry.cx, geometry.cy - edgeOffset)
      : "",
    visiblePinIds.has("gnd")
      ? line(geometry.cx, geometry.cy + edgeOffset, geometry.cx, geometry.cy + SYMBOL_GRID_SIZE)
      : ""
  ]);
}

export function inverterBubbleSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const geometry = inverterGeometry(width, height, lineWidth);
  return circlePath(geometry.outputBubbleCx, geometry.cy, geometry.bubbleRadius);
}

export function inverterBubbleRadius(lineWidth = SYMBOL_STROKE_WIDTH) {
  return (inverterBubbleInnerDiameter(lineWidth) + bufferAccentStrokeWidth(lineWidth)) / 2;
}

export function digitalBufferSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  return bufferLeadSymbol(inverterGeometry(width, height, lineWidth), false);
}

export function digitalBufferTriangleSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  return inverterTriangleSymbol(width, height, lineWidth);
}

export function analogBufferSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  return bufferLeadSymbol(analogBufferGeometry(width, height, lineWidth), false);
}

export function analogBufferTriangleSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  return bufferTriangleSymbol(analogBufferGeometry(width, height, lineWidth));
}
export function analogBufferNonlinearAccentSymbol(
  width: number,
  height: number,
  lineWidth = SYMBOL_STROKE_WIDTH,
  polarity: GainPolarity = "default"
) {
  return path([
    analogBufferTriangleSymbol(width, height, lineWidth),
    analogBufferNonlinearCurveSymbol(width, height, lineWidth, polarity)
  ]);
}

export function analogBufferNonlinearCurveSymbol(
  width: number,
  height: number,
  lineWidth = SYMBOL_STROKE_WIDTH,
  polarity: GainPolarity = "default"
) {
  const geometry = analogBufferGeometry(width, height, lineWidth);
  const centerX = (geometry.bodyLeftX + geometry.bodyApexX) / 2 - 4.5 * lineWidth;
  const halfWidth = 7 * lineWidth;
  const halfHeight = 4.5 * lineWidth;
  const controlHalfWidth = 2 * lineWidth;
  if (polarity === "negative") {
    return `M ${centerX - halfWidth} ${geometry.cy - halfHeight} `
      + `C ${centerX - controlHalfWidth} ${geometry.cy - halfHeight} ${centerX + controlHalfWidth} ${geometry.cy + halfHeight} ${centerX + halfWidth} ${geometry.cy + halfHeight}`;
  }
  return `M ${centerX - halfWidth} ${geometry.cy + halfHeight} `
    + `C ${centerX - controlHalfWidth} ${geometry.cy + halfHeight} ${centerX + controlHalfWidth} ${geometry.cy - halfHeight} ${centerX + halfWidth} ${geometry.cy - halfHeight}`;
}


export function analogBufferFamilyLabelText(symbol: string, polarity: GainPolarity = "default") {
  if (symbol !== "analogBuffer") return "";
  if (polarity === "negative") return "−1";
  if (polarity === "positive") return "+1";
  return "\u00d71";
}

export function analogBufferLabelPosition(width: number, height: number, mirrored = false) {
  const x = width / 2 - 4 * SYMBOL_STROKE_WIDTH;
  return { x: mirrored ? width - x : x, y: height / 2 };
}

function inverterGeometry(width: number, height: number, lineWidth: number) {
  return bufferGeometry(width, height, lineWidth, {
    bodyHeight: INVERTER_BODY_HEIGHT,
    triangleWidth: INVERTER_TRIANGLE_WIDTH,
    bubble: true
  });
}

function analogBufferGeometry(width: number, height: number, lineWidth: number) {
  return bufferGeometry(width, height, lineWidth, {
    bodyHeight: ANALOG_BUFFER_BODY_HEIGHT,
    triangleWidth: ANALOG_BUFFER_TRIANGLE_WIDTH,
    bubble: false
  });
}

function bufferGeometry(
  width: number,
  height: number,
  lineWidth: number,
  options: { bodyHeight: number; triangleWidth: number; bubble: boolean }
) {
  const cx = width / 2;
  const cy = height / 2;
  const bubbleRadius = inverterBubbleRadius(lineWidth);
  const innerTangencyGuard = INVERTER_INNER_TANGENCY_GUARD * lineWidth;
  const bodyHeight = options.bodyHeight * lineWidth;
  const triangleWidth = options.triangleWidth * lineWidth;
  const bubbleSpan = options.bubble ? 2 * bubbleRadius + innerTangencyGuard : 0;
  const bodyLeftX = cx - (triangleWidth + bubbleSpan) / 2;
  const bodyApexX = bodyLeftX + triangleWidth;
  return {
    cx,
    cy,
    inputPinX: cx - 40,
    outputPinX: cx + 40,
    bodyLeftX,
    bodyApexX,
    bodyTopY: cy - bodyHeight / 2,
    bodyBottomY: cy + bodyHeight / 2,
    outputBubbleCx: bodyApexX + bubbleRadius + innerTangencyGuard,
    bubbleRadius
  };
}

function bufferLeadSymbol(geometry: ReturnType<typeof bufferGeometry>, hasBubble: boolean) {
  const outputStartX = hasBubble ? geometry.outputBubbleCx + geometry.bubbleRadius : geometry.bodyApexX;
  return path([line(geometry.inputPinX, geometry.cy, geometry.bodyLeftX, geometry.cy), line(outputStartX, geometry.cy, geometry.outputPinX, geometry.cy)]);
}

function bufferTriangleSymbol(geometry: ReturnType<typeof bufferGeometry>) {
  return `M ${geometry.bodyLeftX} ${geometry.bodyTopY} L ${geometry.bodyApexX} ${geometry.cy} L ${geometry.bodyLeftX} ${geometry.bodyBottomY} Z`;
}

export function inverterAccentSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  return path([inverterTriangleSymbol(width, height, lineWidth), inverterBubbleSymbol(width, height, lineWidth)]);
}
