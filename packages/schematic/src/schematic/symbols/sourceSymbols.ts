import { line, path, polarityMark, SYMBOL_STROKE_WIDTH, twoTerminalSourceShell } from "./symbolPrimitives";
import type { SymbolContentLayout } from "../symbolContentModel";

export function voltageSourceSymbol(width: number, height: number) {
  const { cx, cy, leftPin, rightPin } = twoTerminalGeometry(width, height);
  return path([twoTerminalSourceShell(leftPin, rightPin, cx, cy, sourceShellPathRadius()), polarityMark("plus", cx - 8, cy, 6), polarityMark("minus", cx + 8, cy, 6)]);
}

export function currentSourceSymbol(width: number, height: number) {
  const { cx, cy, leftPin, rightPin } = twoTerminalGeometry(width, height);
  const arrowLength = 12 * SYMBOL_STROKE_WIDTH;
  const arrowSize = currentSourceArrowSize();
  const arrowTipX = cx + arrowLength / 2;
  const arrowBaseX = arrowTipX - arrowSize.height;
  return path([twoTerminalSourceShell(leftPin, rightPin, cx, cy, sourceShellPathRadius()), line(cx - arrowLength / 2, cy, arrowBaseX, cy)]);
}

const VOLTAGE_SOURCE_WAVEFORMS = ["sine", "square", "exp", "bit", "pwl", "ramp-up", "ramp-down", "noise"] as const;
export type VoltageSourceWaveform = typeof VOLTAGE_SOURCE_WAVEFORMS[number];

export function voltageSourceWaveformFromSymbol(symbol: string): VoltageSourceWaveform | null {
  return VOLTAGE_SOURCE_WAVEFORMS.find(waveform => symbol === `voltageSource-${waveform}`) ?? null;
}

export function voltageSourceShellSymbol(width: number, height: number) {
  const { cx, cy, leftPin, rightPin } = twoTerminalGeometry(width, height);
  return twoTerminalSourceShell(leftPin, rightPin, cx, cy, sourceShellPathRadius());
}

export function voltageSourceWaveformSymbol(
  width: number,
  height: number,
  waveform: VoltageSourceWaveform
) {
  const { cx, cy } = twoTerminalGeometry(width, height);
  return path([
    voltageSourceShellSymbol(width, height),
    voltageSourceWaveformPath(cx, cy, waveform)
  ]);
}

/** Waveforms describe time from left to right, independent of terminal rotation or mirroring. */
export function voltageSourceWaveformContent(
  width: number,
  height: number,
  waveform: VoltageSourceWaveform,
  rotation: number
): SymbolContentLayout {
  const cx = width / 2;
  const cy = height / 2;
  return {
    bounds: { x: cx - 7, y: cy - 5, width: 14, height: 10 },
    runs: [],
    paths: [{
      d: voltageSourceWaveformPath(cx, cy, waveform),
      translateX: 0,
      translateY: 0,
      strokeWidth: SYMBOL_STROKE_WIDTH,
      fill: "none",
      lineCap: "butt",
      lineJoin: "miter",
      counterRotation: { degrees: ((rotation % 360) + 360) % 360, x: cx, y: cy }
    }]
  };
}

function voltageSourceWaveformPath(cx: number, cy: number, waveform: VoltageSourceWaveform) {
  const left = cx - 7;
  const right = cx + 7;
  const top = cy - 5;
  const bottom = cy + 5;
  if (waveform === "ramp-up" || waveform === "ramp-down") {
    const start = waveform === "ramp-up" ? bottom : top;
    const end = waveform === "ramp-up" ? top : bottom;
    return `M ${left} ${start} L ${left + 2} ${start} L ${right} ${end}`;
  }
  if (waveform === "exp") {
    return `M ${left} ${bottom} C ${left + 2} ${top} ${cx - 2} ${top} ${cx} ${top} C ${cx + 2} ${bottom} ${right - 2} ${bottom} ${right} ${bottom}`;
  }
  if (waveform === "bit") {
    return `M ${left} ${bottom} L ${left + 2} ${bottom} L ${left + 2} ${top} L ${cx - 1} ${top} L ${cx - 1} ${bottom} L ${cx + 2} ${bottom} L ${cx + 2} ${top} L ${right - 1} ${top} L ${right - 1} ${bottom} L ${right} ${bottom}`;
  }
  if (waveform === "pwl") {
    return `M ${left} ${bottom} L ${cx - 3} ${top} L ${cx + 1} ${cy} L ${right} ${top + 1}`;
  }
  if (waveform === "square") {
    return `M ${left} ${bottom} L ${cx - 3.5} ${bottom} L ${cx - 3.5} ${top} L ${cx + 3.5} ${top} L ${cx + 3.5} ${bottom} L ${right} ${bottom}`;
  }
  if (waveform === "noise") {
    return `M ${left} ${cy + 1} L ${cx - 5} ${cy - 4} L ${cx - 2.5} ${cy + 4} L ${cx} ${cy - 5} L ${cx + 2.5} ${cy + 5} L ${cx + 5} ${cy - 3} L ${right} ${cy}`;
  }
  return `M ${left} ${cy} C ${cx - 5} ${top} ${cx - 2} ${top} ${cx} ${cy} C ${cx + 2} ${bottom} ${cx + 5} ${bottom} ${right} ${cy}`;
}

export function batterySymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const { cx, cy, leftPin, rightPin } = twoTerminalGeometry(width, height);
  const { leftPlateX, rightPlateX } = batteryPlateGeometry(cx, lineWidth);
  return path([line(leftPin, cy, leftPlateX, cy), line(rightPlateX, cy, rightPin, cy)]);
}

export function batteryPlateSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const cx = width / 2;
  const cy = height / 2;
  const { leftPlateX, rightPlateX, longHalfLength, shortHalfLength } = batteryPlateGeometry(cx, lineWidth);
  return path([
    line(leftPlateX, cy - longHalfLength, leftPlateX, cy + longHalfLength),
    line(rightPlateX, cy - shortHalfLength, rightPlateX, cy + shortHalfLength)
  ]);
}

export function batteryPlateStrokeWidth(lineWidth = SYMBOL_STROKE_WIDTH) {
  return 2 * lineWidth;
}

export function iprobeSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const { cx, cy, leftPin, rightPin } = twoTerminalGeometry(width, height);
  const { left, right, triangleLeftX, triangleTipX, triangleTopY, triangleBottomY } = iprobeGeometry(cx, cy, lineWidth);
  return path([
    line(leftPin, cy, left, cy),
    line(right, cy, rightPin, cy),
    `M ${triangleLeftX} ${triangleTopY} L ${triangleTipX} ${cy} L ${triangleLeftX} ${triangleBottomY} Z`
  ]);
}

export function iprobeFrameSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const cx = width / 2;
  const cy = height / 2;
  const { left, right, top, bottom } = iprobeGeometry(cx, cy, lineWidth);
  return `M ${left} ${top} L ${right} ${top} L ${right} ${bottom} L ${left} ${bottom} Z`;
}

export function iprobeStrokeWidth(lineWidth = SYMBOL_STROKE_WIDTH) {
  return 2 * lineWidth;
}

export function impedanceSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const { cx, cy, leftPin, rightPin } = twoTerminalGeometry(width, height);
  const { left, right } = impedanceBoxGeometry(cx, cy, lineWidth);
  return path([line(leftPin, cy, left, cy), line(right, cy, rightPin, cy)]);
}

export function impedanceBoxSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const cx = width / 2;
  const cy = height / 2;
  const { left, right, top, bottom } = impedanceBoxGeometry(cx, cy, lineWidth);
  return `M ${left} ${top} L ${right} ${top} L ${right} ${bottom} L ${left} ${bottom} Z`;
}
export function diffProbeSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const { cx, cy, leftPin, rightPin } = twoTerminalGeometry(width, height);
  const { left, right } = diffProbeGeometry(cx, cy, lineWidth);
  const signHalf = 3 * lineWidth;
  return path([
    line(leftPin, cy, left, cy),
    line(right, cy, rightPin, cy),
    polarityMark("plus", cx - 4 * lineWidth, cy, signHalf),
    polarityMark("minus", cx + 4 * lineWidth, cy, signHalf)
  ]);
}

export function diffProbeFrameSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const cx = width / 2;
  const cy = height / 2;
  const { left, right, top, bottom } = diffProbeGeometry(cx, cy, lineWidth);
  return `M ${left} ${top} L ${right} ${top} L ${right} ${bottom} L ${left} ${bottom} Z`;
}

export function diffProbeStrokeWidth(lineWidth = SYMBOL_STROKE_WIDTH) {
  return 2 * lineWidth;

}

export function impedanceBoxStrokeWidth(lineWidth = SYMBOL_STROKE_WIDTH) {
  return 2 * lineWidth;
}

export function sourceShellPathRadius(lineWidth = SYMBOL_STROKE_WIDTH) {
  return (16 * lineWidth + lineWidth) / 2;
}

export function currentSourceArrowSize(lineWidth = SYMBOL_STROKE_WIDTH) {
  return { length: 12 * lineWidth, base: 8 * lineWidth, height: 8.5 * lineWidth };
}

export function currentSourceArrowTriangle(tipX: number, centerY: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const { base, height } = currentSourceArrowSize(lineWidth);
  const baseX = tipX - height;
  return path([`M ${tipX} ${centerY}`, `L ${baseX} ${centerY - base / 2}`, `L ${baseX} ${centerY + base / 2}`, "Z"]);
}

export function currentSourceArrowSymbol(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const { cx, cy } = twoTerminalGeometry(width, height);
  return currentSourceArrowTriangle(cx + (12 * lineWidth) / 2, cy, lineWidth);
}

export function controlledSourceSymbol(width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;
  return `M ${cx} 6 L ${width - 14} ${cy} L ${cx} ${height - 6} L 14 ${cy} Z`;
}

function twoTerminalGeometry(width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;
  return { cx, cy, leftPin: cx - 40, rightPin: cx + 40 };
}

function batteryPlateGeometry(cx: number, lineWidth: number) {
  const plateStrokeWidth = batteryPlateStrokeWidth(lineWidth);
  const plateClearGap = 3 * lineWidth;
  const plateCenterHalfDistance = (plateClearGap + plateStrokeWidth) / 2;
  const longPlateLength = 18 * lineWidth;
  return {
    leftPlateX: cx - plateCenterHalfDistance,
    rightPlateX: cx + plateCenterHalfDistance,
    longHalfLength: longPlateLength / 2,
    shortHalfLength: (longPlateLength * 13) / 25 / 2
  };
}

function iprobeGeometry(cx: number, cy: number, lineWidth: number) {
  const halfWidth = 8 * lineWidth;
  const halfHeight = 6 * lineWidth;
  const triangleLeftX = cx - 3 * lineWidth;
  const triangleTipX = cx + 4 * lineWidth;
  const triangleHalfHeight = 4 * lineWidth;
  return {
    left: cx - halfWidth,
    right: cx + halfWidth,
    top: cy - halfHeight,
    bottom: cy + halfHeight,
    triangleLeftX,
    triangleTipX,
    triangleTopY: cy - triangleHalfHeight,
    triangleBottomY: cy + triangleHalfHeight
  };
}

function impedanceBoxGeometry(cx: number, cy: number, lineWidth: number) {
  const strokeWidth = impedanceBoxStrokeWidth(lineWidth);
  const centerlineWidth = 19 * lineWidth + strokeWidth;
  const centerlineHeight = 6 * lineWidth + strokeWidth;
  return {
    left: cx - centerlineWidth / 2,
    right: cx + centerlineWidth / 2,
    top: cy - centerlineHeight / 2,
    bottom: cy + centerlineHeight / 2
  };
}
function diffProbeGeometry(cx: number, cy: number, lineWidth: number) {
  const halfWidth = 9 * lineWidth;
  const halfHeight = 6 * lineWidth;
  return {
    left: cx - halfWidth,
    right: cx + halfWidth,
    top: cy - halfHeight,
    bottom: cy + halfHeight
  };
}
