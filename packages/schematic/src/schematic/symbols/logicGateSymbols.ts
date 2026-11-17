import {
  LOGIC_GATE_INPUT_PIN_X,
  LOGIC_GATE_OUTPUT_PIN_X,
  logicGateInputOffsets,
  parseLogicGateSymbol,
  type LogicGateInputCount,
  type LogicGateType
} from "../logicGateModel";
import { circlePath, line, path, SYMBOL_STROKE_WIDTH } from "./symbolPrimitives";

export function logicGateBodySymbol(
  width: number,
  height: number,
  type: LogicGateType,
  inputCount: LogicGateInputCount,
  lineWidth = SYMBOL_STROKE_WIDTH
) {
  const geometry = logicGateGeometry(width, height, lineWidth);
  const inputKind = type === "and" || type === "nand" ? "and" : "or";
  const inputs = logicGateInputOffsets(inputCount).map((offset) => {
    const y = geometry.cy + offset;
    const bodyX = inputKind === "and"
      ? geometry.bodyLeftX
      : type === "xor" || type === "xnor"
        ? xorInputBoundaryX(geometry, y)
        : orInputBoundaryX(geometry, y);
    return line(geometry.inputPinX, y, bodyX, y);
  });
  const outputStartX = isInverting(type)
    ? geometry.outputBubbleCx + geometry.bubbleRadius
    : geometry.bodyRightX;
  return path([...inputs, line(outputStartX, geometry.cy, geometry.outputPinX, geometry.cy)]);
}

export function logicGateAccentSymbol(
  width: number,
  height: number,
  type: LogicGateType,
  lineWidth = SYMBOL_STROKE_WIDTH
) {
  const geometry = logicGateGeometry(width, height, lineWidth);
  const outline = type === "and" || type === "nand"
    ? andOutline(geometry)
    : orOutline(geometry);
  return path([
    outline,
    type === "xor" || type === "xnor" ? xorInputArc(geometry, lineWidth) : "",
    isInverting(type)
      ? circlePath(geometry.outputBubbleCx, geometry.cy, geometry.bubbleRadius)
      : ""
  ]);
}

export function logicGateAccentStrokeWidth(lineWidth = SYMBOL_STROKE_WIDTH) {
  return 2 * lineWidth;
}

export function logicGateSymbolBodyFromId(symbol: string, width: number, height: number) {
  const parsed = parseLogicGateSymbol(symbol);
  return parsed
    ? logicGateBodySymbol(width, height, parsed.type, parsed.inputCount)
    : "";
}

export function logicGateSymbolAccentFromId(symbol: string, width: number, height: number) {
  const parsed = parseLogicGateSymbol(symbol);
  return parsed ? logicGateAccentSymbol(width, height, parsed.type) : "";
}

function logicGateGeometry(width: number, height: number, lineWidth: number) {
  const frameCenterX = width / 2;
  const cx = frameCenterX + (LOGIC_GATE_INPUT_PIN_X + LOGIC_GATE_OUTPUT_PIN_X) / 2;
  const cy = height / 2;
  const bodyHalfHeight = height <= 80 ? 12 * lineWidth : 22 * lineWidth;
  const bodyLeftX = cx - 15 * lineWidth;
  const bodyRightX = cx + 15 * lineWidth;
  const bubbleRadius = 3 * lineWidth;
  return {
    cx,
    cy,
    inputPinX: frameCenterX + LOGIC_GATE_INPUT_PIN_X,
    outputPinX: frameCenterX + LOGIC_GATE_OUTPUT_PIN_X,
    lineWidth,
    bodyLeftX,
    bodyRightX,
    bodyTopY: cy - bodyHalfHeight,
    bodyBottomY: cy + bodyHalfHeight,
    bodyHalfHeight,
    outputBubbleCx: bodyRightX + bubbleRadius,
    bubbleRadius
  };
}

function andOutline(geometry: ReturnType<typeof logicGateGeometry>) {
  const curveBaseX = geometry.cx + 2 * geometry.lineWidth;
  const radiusX = geometry.bodyRightX - curveBaseX;
  return `M ${geometry.bodyLeftX} ${geometry.bodyTopY} L ${curveBaseX} ${geometry.bodyTopY} `
    + `A ${radiusX} ${geometry.bodyHalfHeight} 0 0 1 ${curveBaseX} ${geometry.bodyBottomY} `
    + `L ${geometry.bodyLeftX} ${geometry.bodyBottomY} Z`;
}

function orOutline(geometry: ReturnType<typeof logicGateGeometry>) {
  const { bodyLeftX: left, bodyRightX: right, bodyTopY: top, bodyBottomY: bottom, cy } = geometry;
  const shoulderX = geometry.cx - 4 * geometry.lineWidth;
  return `M ${left} ${top} C ${shoulderX} ${top} ${geometry.cx + 7 * geometry.lineWidth} ${cy - geometry.bodyHalfHeight * 0.72} ${right} ${cy} `
    + `C ${geometry.cx + 7 * geometry.lineWidth} ${cy + geometry.bodyHalfHeight * 0.72} ${shoulderX} ${bottom} ${left} ${bottom} `
    + `C ${left + 5 * geometry.lineWidth} ${cy + geometry.bodyHalfHeight * 0.45} ${left + 5 * geometry.lineWidth} ${cy - geometry.bodyHalfHeight * 0.45} ${left} ${top} Z`;
}

function xorInputArc(geometry: ReturnType<typeof logicGateGeometry>, lineWidth: number) {
  const left = geometry.bodyLeftX - 3 * lineWidth;
  return `M ${left} ${geometry.bodyBottomY} `
    + `C ${left + 5 * lineWidth} ${geometry.cy + geometry.bodyHalfHeight * 0.45} ${left + 5 * lineWidth} ${geometry.cy - geometry.bodyHalfHeight * 0.45} ${left} ${geometry.bodyTopY}`;
}

function orInputBoundaryX(geometry: ReturnType<typeof logicGateGeometry>, y: number) {
  const normalized = Math.min(1, Math.abs(y - geometry.cy) / geometry.bodyHalfHeight);
  return geometry.bodyLeftX + 5 * geometry.lineWidth * (1 - normalized);
}

function xorInputBoundaryX(geometry: ReturnType<typeof logicGateGeometry>, y: number) {
  const normalized = Math.min(1, Math.abs(y - geometry.cy) / geometry.bodyHalfHeight);
  return geometry.bodyLeftX - 3 * geometry.lineWidth
    + 5 * geometry.lineWidth * (1 - normalized);
}

function isInverting(type: LogicGateType) {
  return type === "nand" || type === "nor" || type === "xnor";
}
