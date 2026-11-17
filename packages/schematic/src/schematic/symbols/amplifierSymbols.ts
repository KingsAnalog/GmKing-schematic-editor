import { line, path, polarityMark, SYMBOL_STROKE_WIDTH } from "./symbolPrimitives";
import { quantizerThresholdBarsSymbol } from "./quantizerSymbols";
import { boxedFrameSymbol, boxedLeadSymbol } from "./boxedSymbols";
import { boxedComponentBodyBounds } from "../boxedComponentModel";
import type { ComponentClock } from "../clockModel";
import {
  clockInputBubbleSymbol,
  clockInputLeadSymbol
} from "./clockSymbols";

export function singleInputAmplifierLeadSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const geometry = singleInputAmplifierGeometry(width, height, lineWidth);
  return path([
    line(geometry.inputX, geometry.cy, geometry.leftX, geometry.cy),
    line(geometry.rightX, geometry.cy, geometry.outputX, geometry.cy)
  ]);
}

export function singleInputAmplifierBodySymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const geometry = singleInputAmplifierGeometry(width, height, lineWidth);
  return trapezoidPath(
    geometry.leftX,
    geometry.topY,
    geometry.rightX,
    geometry.rightTopY,
    geometry.rightBottomY,
    geometry.bottomY
  );
}

function singleInputAmplifierGeometry(width: number, height: number, lineWidth: number) {
  const cx = width / 2;
  const cy = height / 2;
  const halfBodyWidth = 15 * lineWidth;
  const halfBodyHeight = 20 * lineWidth;
  const halfOutputEdgeHeight = 10 * lineWidth;
  return {
    cy,
    inputX: cx - 40,
    outputX: cx + 40,
    leftX: cx - halfBodyWidth,
    rightX: cx + halfBodyWidth,
    topY: cy - halfBodyHeight,
    bottomY: cy + halfBodyHeight,
    rightTopY: cy - halfOutputEdgeHeight,
    rightBottomY: cy + halfOutputEdgeHeight
  };
}

export function opAmpBodySymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const geometry = singleEndedAmpGeometry(width, height, lineWidth);
  return `M ${geometry.leftX} ${geometry.topY} L ${geometry.apexX} ${geometry.cy} L ${geometry.leftX} ${geometry.bottomY} Z`;
}

export function comparatorBodySymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  return opAmpBodySymbol(width, height, lineWidth);
}

export function slicerBodySymbol(width: number, height: number) {
  return boxedFrameSymbol(width, height);
}

export function slicerAccentSymbol(
  width: number,
  height: number,
  levels = 1,
  clock: ComponentClock = "none",
  lineWidth = SYMBOL_STROKE_WIDTH
) {
  const horizontalPins = [
    { pin: { x: -width / 2, y: 0 }, side: "left" as const },
    { pin: { x: width / 2, y: 0 }, side: "right" as const }
  ];
  const body = boxedComponentBodyBounds(width, height);
  return path([
    boxedLeadSymbol(width, height, horizontalPins),
    clockInputLeadSymbol(width / 2, body.bottom, width / 2, height, clock),
    comparatorStaircaseSymbol(width, height, levels, lineWidth, 2 * lineWidth)
  ]);
}

export function slicerClockBubbleSymbol(
  width: number,
  height: number,
  clock: ComponentClock
) {
  const body = boxedComponentBodyBounds(width, height);
  return clockInputBubbleSymbol(width / 2, body.bottom, width / 2, height, clock);
}

export function otaBodySymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const geometry = singleEndedAmpGeometry(width, height, lineWidth);
  return trapezoidPath(geometry.leftX, geometry.topY, geometry.apexX, geometry.cy - geometry.gridStep, geometry.cy + geometry.gridStep, geometry.bottomY);
}

export function singleEndedAmpLeadSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const geometry = singleEndedAmpGeometry(width, height, lineWidth);
  const inputSignX = geometry.leftX + 9 * lineWidth;
  const inputSignHalf = 3.5 * lineWidth;
  return path([
    line(geometry.inputX, geometry.cy - geometry.gridStep, geometry.leftX, geometry.cy - geometry.gridStep),
    line(geometry.inputX, geometry.cy + geometry.gridStep, geometry.leftX, geometry.cy + geometry.gridStep),
    line(geometry.apexX, geometry.cy, geometry.outputX, geometry.cy),
    polarityMark("plus", inputSignX, geometry.cy - geometry.gridStep, inputSignHalf),
    polarityMark("minus", inputSignX, geometry.cy + geometry.gridStep, inputSignHalf)
  ]);
}

export function comparatorAccentSymbol(
  width: number,
  height: number,
  levels = 1,
  clock: ComponentClock = "none",
  lineWidth = SYMBOL_STROKE_WIDTH
) {
  const geometry = singleEndedAmpGeometry(width, height, lineWidth);
  return path([
    singleEndedAmpLeadSymbol(width, height, lineWidth),
    comparatorStaircaseSymbol(width, height, levels, lineWidth),
    clockInputLeadSymbol(
      geometry.cx,
      singleEndedTriangleBottomEdgeY(geometry, geometry.cx),
      geometry.cx,
      geometry.cy + 3 * geometry.gridStep,
      clock
    )
  ]);
}

export function comparatorClockBubbleSymbol(
  width: number,
  height: number,
  clock: ComponentClock,
  lineWidth = SYMBOL_STROKE_WIDTH
) {
  const geometry = singleEndedAmpGeometry(width, height, lineWidth);
  return clockInputBubbleSymbol(
    geometry.cx,
    singleEndedTriangleBottomEdgeY(geometry, geometry.cx),
    geometry.cx,
    geometry.cy + 3 * geometry.gridStep,
    clock
  );
}

function singleEndedAmpGeometry(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const cx = width / 2;
  const cy = height / 2;
  const strokeWidth = 2 * lineWidth;
  const outerLength = 50 * lineWidth;
  const centerlineLength = outerLength - strokeWidth;
  const gridStep = 10 * lineWidth;
  const leftX = cx - 2 * gridStep;
  const apexX = leftX + centerlineLength;
  const topY = cy - centerlineLength / 2;
  const bottomY = cy + centerlineLength / 2;
  const inputX = cx - 3 * gridStep;
  const outputX = cx + 4 * gridStep;
  return { cx, cy, gridStep, leftX, apexX, topY, bottomY, inputX, outputX };
}

function singleEndedTriangleBottomEdgeY(geometry: ReturnType<typeof singleEndedAmpGeometry>, x: number) {
  const t = (x - geometry.leftX) / (geometry.apexX - geometry.leftX);
  return geometry.bottomY + t * (geometry.cy - geometry.bottomY);
}

export function differentialAmpLeadSymbol(width: number, height: number, outputsSame = true) {
  return differentialAmpLeadPath(differentialAmpGeometry(width, height), outputsSame);
}

export function differentialOtaLeadSymbol(width: number, height: number, outputsSame = true) {
  return differentialAmpLeadPath(differentialOtaGeometry(width, height), outputsSame);
}

function differentialAmpLeadPath(geometry: ReturnType<typeof differentialAmpGeometry>, outputsSame: boolean) {
  const inputSignX = geometry.bodyLeftX + 18;
  const outputSignX = geometry.bodyLeftX + 56;
  const differentialSignHalf = 7;
  const outputTopSignY = geometry.outputTopY + 18;
  const outputBottomSignY = geometry.outputBottomY - 18;
  return path([
    line(geometry.inputX, geometry.inputTopY, geometry.bodyLeftX, geometry.inputTopY),
    line(geometry.inputX, geometry.inputBottomY, geometry.bodyLeftX, geometry.inputBottomY),
    line(geometry.topOutputBodyX, geometry.outputTopY, geometry.outputX, geometry.outputTopY),
    line(geometry.bottomOutputBodyX, geometry.outputBottomY, geometry.outputX, geometry.outputBottomY),
    polarityMark("plus", inputSignX, geometry.inputTopY, differentialSignHalf),
    polarityMark("minus", inputSignX, geometry.inputBottomY, differentialSignHalf),
    polarityMark(outputsSame ? "plus" : "minus", outputSignX, outputTopSignY, differentialSignHalf),
    polarityMark(outputsSame ? "minus" : "plus", outputSignX, outputBottomSignY, differentialSignHalf)
  ]);
}

export function differentialAmpBodySymbol(width: number, height: number) {
  const geometry = differentialAmpGeometry(width, height);
  return `M ${geometry.bodyLeftX} ${geometry.bodyTopY} L ${geometry.bodyApexX} ${geometry.cy} L ${geometry.bodyLeftX} ${geometry.bodyBottomY} Z`;
}

export function differentialComparatorBodySymbol(width: number, height: number) {
  return differentialAmpBodySymbol(width, height);
}

export function differentialOtaBodySymbol(width: number, height: number) {
  const geometry = differentialOtaGeometry(width, height);
  return trapezoidPath(geometry.bodyLeftX, geometry.bodyTopY, geometry.bodyRightX, geometry.outputTopY, geometry.outputBottomY, geometry.bodyBottomY);
}

export function differentialComparatorAccentSymbol(
  width: number,
  height: number,
  levels = 1,
  outputsSame = true,
  clock: ComponentClock = "none"
) {
  const geometry = differentialAmpGeometry(width, height);
  return path([
    differentialAmpLeadSymbol(width, height, outputsSame),
    comparatorStaircaseSymbol(width, height, levels),
    clockInputLeadSymbol(
      geometry.cx,
      differentialTriangleBottomEdgeY(geometry, geometry.cx),
      geometry.cx,
      geometry.cy + 80,
      clock
    )
  ]);
}

export function differentialComparatorClockBubbleSymbol(
  width: number,
  height: number,
  clock: ComponentClock
) {
  const geometry = differentialAmpGeometry(width, height);
  return clockInputBubbleSymbol(
    geometry.cx,
    differentialTriangleBottomEdgeY(geometry, geometry.cx),
    geometry.cx,
    geometry.cy + 80,
    clock
  );
}

function differentialAmpGeometry(width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;
  const bodyLeftX = cx - 60;
  const inputX = bodyLeftX - 20;
  const inputTopY = cy - 40;
  const inputBottomY = cy + 40;
  const bodyTopY = cy - 64;
  const bodyBottomY = cy + 64;
  const bodyApexX = cx + 60;
  const outputX = cx + 60;
  const outputTopY = cy - 40;
  const outputBottomY = cy + 40;
  const topOutputBodyX = bodyLeftX + ((outputTopY - bodyTopY) / (cy - bodyTopY)) * (bodyApexX - bodyLeftX);
  const bottomOutputBodyX = bodyLeftX + ((bodyBottomY - outputBottomY) / (bodyBottomY - cy)) * (bodyApexX - bodyLeftX);
  return {
    cx,
    cy,
    inputX,
    inputTopY,
    inputBottomY,
    bodyLeftX,
    bodyTopY,
    bodyBottomY,
    bodyApexX,
    outputX,
    outputTopY,
    outputBottomY,
    topOutputBodyX,
    bottomOutputBodyX
  };
}

function differentialTriangleBottomEdgeY(geometry: ReturnType<typeof differentialAmpGeometry>, x: number) {
  const t = (x - geometry.bodyLeftX) / (geometry.bodyApexX - geometry.bodyLeftX);
  return geometry.bodyBottomY + t * (geometry.cy - geometry.bodyBottomY);
}

function differentialOtaGeometry(width: number, height: number) {
  const geometry = differentialAmpGeometry(width, height);
  const bodyRightX = geometry.outputX - 20;
  return {
    ...geometry,
    bodyRightX,
    topOutputBodyX: bodyRightX,
    bottomOutputBodyX: bodyRightX
  };
}

function trapezoidPath(leftX: number, topY: number, rightX: number, rightTopY: number, rightBottomY: number, bottomY: number) {
  return `M ${leftX} ${topY} L ${rightX} ${rightTopY} L ${rightX} ${rightBottomY} L ${leftX} ${bottomY} Z`;
}

export function normalizeComparatorLevels(value: string | undefined, fallback = 1) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(12, parsed));
}

export function comparatorStaircaseSymbol(
  width: number,
  height: number,
  levels = 1,
  lineWidth = SYMBOL_STROKE_WIDTH,
  offsetX = 0
) {
  return quantizerThresholdBarsSymbol(
    width,
    height,
    normalizeComparatorLevels(String(levels)),
    lineWidth,
    offsetX
  );
}
