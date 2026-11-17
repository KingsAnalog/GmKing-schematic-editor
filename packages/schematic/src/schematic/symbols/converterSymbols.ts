import { line, path, SYMBOL_STROKE_WIDTH } from "./symbolPrimitives";
import { quantizerTransferStaircaseSymbol } from "./quantizerSymbols";
import { converterBitsLabel } from "../converterModel";
import { SYMBOL_GRID_SIZE } from "../types";
import type { ComponentClock } from "../clockModel";
import {
  clockInputBubbleSymbol,
  clockInputLeadSymbol
} from "./clockSymbols";

export const CONVERTER_LABEL_FONT_SIZE = 13;
export const CONVERTER_VALUE_LABEL_FONT_SIZE = CONVERTER_LABEL_FONT_SIZE;
export const CONVERTER_QUANTIZER_LABEL_FONT_SIZE = 9;

export function adcSymbol(
  width: number,
  height: number,
  lineWidth = SYMBOL_STROKE_WIDTH,
  visiblePinIds: ReadonlySet<string> = new Set(["in", "out"]),
  clock: ComponentClock = "none"
) {
  const { cy, inputPinX, outputPinX, leftApexX, rightX } = converterGeometry(width, height, lineWidth);
  return path([
    visiblePinIds.has("in") ? line(inputPinX, cy, leftApexX, cy) : "",
    visiblePinIds.has("out") ? line(rightX, cy, outputPinX, cy) : "",
    converterClockLeadSymbol(width, height, clock)
  ]);
}

export function adcQuantizerSymbol(
  width: number,
  height: number,
  lineWidth = SYMBOL_STROKE_WIDTH,
  visiblePinIds: ReadonlySet<string> = new Set(["in", "out"]),
  levels = 4,
  compact = false,
  clock: ComponentClock = "none"
) {
  return path([
    adcSymbol(width, height, lineWidth, visiblePinIds, clock),
    quantizerTransferStaircaseSymbol(width, height, lineWidth, levels, compact)
  ]);
}

export function adcPentagonSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const { cy, leftApexX, leftShoulderX, rightX, topY, bottomY } = converterGeometry(width, height, lineWidth);
  return `M ${leftApexX} ${cy} L ${leftShoulderX} ${topY} L ${rightX} ${topY} L ${rightX} ${bottomY} L ${leftShoulderX} ${bottomY} Z`;
}

export function dacSymbol(
  width: number,
  height: number,
  lineWidth = SYMBOL_STROKE_WIDTH,
  visiblePinIds: ReadonlySet<string> = new Set(["in", "out"]),
  clock: ComponentClock = "none"
) {
  const { cy, inputPinX, outputPinX, leftX, rightApexX } = converterGeometry(width, height, lineWidth);
  return path([
    visiblePinIds.has("in") ? line(inputPinX, cy, leftX, cy) : "",
    visiblePinIds.has("out") ? line(rightApexX, cy, outputPinX, cy) : "",
    converterClockLeadSymbol(width, height, clock)
  ]);
}

export function converterClockLeadSymbol(
  width: number,
  height: number,
  clock: ComponentClock = "rising"
) {
  const cx = width / 2;
  const cy = height / 2;
  return clockInputLeadSymbol(cx, cy + SYMBOL_GRID_SIZE, cx, cy + 2 * SYMBOL_GRID_SIZE, clock);
}

export function converterClockBubbleSymbol(
  width: number,
  height: number,
  clock: ComponentClock
) {
  const cx = width / 2;
  const cy = height / 2;
  return clockInputBubbleSymbol(cx, cy + SYMBOL_GRID_SIZE, cx, cy + 2 * SYMBOL_GRID_SIZE, clock);
}

export function dacPentagonSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const { cy, leftX, rightShoulderX, rightApexX, topY, bottomY } = converterGeometry(width, height, lineWidth);
  return `M ${leftX} ${topY} L ${rightShoulderX} ${topY} L ${rightApexX} ${cy} L ${rightShoulderX} ${bottomY} L ${leftX} ${bottomY} Z`;
}

export function converterPentagonStrokeWidth(lineWidth = SYMBOL_STROKE_WIDTH) {
  return 2 * lineWidth;
}

export function converterLabelText(symbol: string, bits = "") {
  const kind = symbol === "adc" || symbol === "adc-quantizer"
    ? "ADC"
    : symbol === "dac"
      ? "DAC"
      : "";
  if (!kind || (symbol === "adc-quantizer" && !bits)) return "";
  const bitsLabel = converterBitsLabel(bits);
  if (!bitsLabel) return kind;
  return symbol === "adc-quantizer"
    ? `${bitsLabel} ${kind}`
    : `${bitsLabel}\n${kind}`;
}

export function converterLabelPosition(symbol: string, width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const adc = symbol === "adc" || symbol === "adc-quantizer";
  return {
    x: width / 2 + (adc ? lineWidth : -lineWidth),
    y: height / 2 - (symbol === "adc-quantizer" ? 5 * lineWidth : 0)
  };
}

export function converterLabelFontSize(symbol: string, bits = "") {
  if (!bits) return CONVERTER_LABEL_FONT_SIZE;
  return symbol === "adc-quantizer"
    ? CONVERTER_QUANTIZER_LABEL_FONT_SIZE
    : CONVERTER_VALUE_LABEL_FONT_SIZE;
}

function converterGeometry(width: number, height: number, lineWidth: number) {
  const cx = width / 2;
  const cy = height / 2;
  return {
    cy,
    inputPinX: cx - 40,
    outputPinX: cx + 40,
    leftApexX: cx - 13 * lineWidth,
    leftShoulderX: cx - 7 * lineWidth,
    leftX: cx - 11 * lineWidth,
    rightShoulderX: cx + 7 * lineWidth,
    rightApexX: cx + 13 * lineWidth,
    rightX: cx + 11 * lineWidth,
    topY: cy - SYMBOL_GRID_SIZE,
    bottomY: cy + SYMBOL_GRID_SIZE
  };
}
