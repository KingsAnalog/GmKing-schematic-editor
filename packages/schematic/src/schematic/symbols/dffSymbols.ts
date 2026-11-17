import {
  measureSymbolText,
  type SymbolContentLayout,
  type SymbolPathLayout,
  type SymbolTextRunLayout
} from "../symbolContentModel";
import {
  dffPins,
  type DffSettings
} from "../dffModel";
import { circlePath, line, path, SYMBOL_STROKE_WIDTH } from "./symbolPrimitives";
import {
  CLOCK_BUBBLE_RADIUS,
  clockInputBubbleSymbol,
  clockInputLeadSymbol
} from "./clockSymbols";

const DFF_DENSE_LABEL_FONT_SIZE = 22;
const DFF_STANDARD_LABEL_FONT_SIZE = 25;
const DFF_SPARSE_LABEL_FONT_SIZE = 30;
const DFF_CONTROL_LABEL_FONT_SIZE = 18;
const DFF_LABEL_SIDE_INSET = 22;
const DFF_ASYNC_CONTROL_VERTICAL_INSET = 14;
const DFF_SYNC_CONTROL_VERTICAL_INSET = 12;
const DFF_SYNC_INPUT_SHIFT = 6;
const DFF_LABEL_BASELINE_OFFSET_EM = 0.35;
const DFF_OVERLINE_OFFSET_EM = 0.9;

export function dffBodySymbol(
  width: number,
  height: number,
  settings: DffSettings,
  visiblePinIds: ReadonlySet<string>
) {
  const geometry = dffGeometry(width, height);
  return path(dffPins(settings).map((pin) => {
    if (!visiblePinIds.has(pin.id)) return "";
    const point = { x: geometry.cx + pin.x, y: geometry.cy + pin.y };
    if (pin.id === "qbar") {
      return line(geometry.qbarBubbleCx + geometry.bubbleRadius, point.y, point.x, point.y);
    }
    if (pin.id === "set" || pin.id === "reset") {
      const activeLow = pin.id === "set"
        ? settings.setActiveLevel === "low"
        : settings.resetActiveLevel === "low";
      return dffControlLead(geometry, pin.id, point, activeLow);
    }
    if (pin.id === "clk" && settings.clockEdge === "falling") {
      return line(point.x, point.y, geometry.clockBubbleCx - geometry.bubbleRadius, point.y);
    }
    if (pin.x < 0) return line(point.x, point.y, geometry.bodyLeftX, point.y);
    return line(geometry.bodyRightX, point.y, point.x, point.y);
  }));
}

export function dffAccentSymbol(
  width: number,
  height: number,
  settings: DffSettings,
  visiblePinIds: ReadonlySet<string>
) {
  const geometry = dffGeometry(width, height);
  return path([
    `M ${geometry.bodyLeftX} ${geometry.bodyTopY} L ${geometry.bodyRightX} ${geometry.bodyTopY} L ${geometry.bodyRightX} ${geometry.bodyBottomY} L ${geometry.bodyLeftX} ${geometry.bodyBottomY} Z`,
    clockEdgeSymbol(geometry, settings.clockEdge),
    visiblePinIds.has("qbar")
      ? circlePath(geometry.qbarBubbleCx, geometry.cy + 20, geometry.bubbleRadius)
      : "",
    settings.setMode !== "none" && settings.setActiveLevel === "low"
      ? controlBubble(geometry, "set", settings)
      : "",
    settings.resetMode !== "none" && settings.resetActiveLevel === "low"
      ? controlBubble(geometry, "reset", settings)
      : ""
  ]);
}

export function dffAccentStrokeWidth(lineWidth = SYMBOL_STROKE_WIDTH) {
  return 2 * lineWidth;
}

export function dffContentLayout(
  width: number,
  height: number,
  settings: DffSettings,
  visiblePinIds: ReadonlySet<string>,
  mirrored = false,
  rotation = 0
): SymbolContentLayout {
  const geometry = dffGeometry(width, height);
  const runs: SymbolTextRunLayout[] = [];
  const paths: SymbolPathLayout[] = [];
  const controlCount = Number(settings.setMode !== "none") + Number(settings.resetMode !== "none");
  const outputCount = Number(visiblePinIds.has("q")) + Number(visiblePinIds.has("qbar"));
  const mainFontSize = controlCount > 0
    ? DFF_DENSE_LABEL_FONT_SIZE
    : outputCount <= 1
      ? DFF_SPARSE_LABEL_FONT_SIZE
      : DFF_STANDARD_LABEL_FONT_SIZE;
  const counterRotation = uprightCounterRotation(rotation);
  const leftLabelX = mirroredX(width, geometry.bodyLeftX + DFF_LABEL_SIDE_INSET, mirrored);
  const rightLabelX = mirroredX(width, geometry.bodyRightX - DFF_LABEL_SIDE_INSET, mirrored);
  const inputCenterY = geometry.cy - 20
    + (settings.setMode === "synchronous" ? DFF_SYNC_INPUT_SHIFT : 0);
  addRun(
    runs,
    "D",
    leftLabelX,
    labelBaseline(inputCenterY, mainFontSize, counterRotation),
    mainFontSize,
    counterRotation
  );
  if (visiblePinIds.has("q")) {
    addRun(
      runs,
      "Q",
      rightLabelX,
      labelBaseline(geometry.cy - 20, mainFontSize, counterRotation),
      mainFontSize,
      counterRotation
    );
  }
  if (visiblePinIds.has("qbar")) {
    const qbarX = rightLabelX;
    const qbarBaseline = labelBaseline(geometry.cy + 20, mainFontSize, counterRotation);
    const overlineHalfWidth = measureSymbolText("Q", mainFontSize) / 2 + 1;
    addRun(runs, "Q", qbarX, qbarBaseline, mainFontSize, counterRotation);
    paths.push({
      d: line(
        qbarX - overlineHalfWidth,
        qbarBaseline - DFF_OVERLINE_OFFSET_EM * mainFontSize,
        qbarX + overlineHalfWidth,
        qbarBaseline - DFF_OVERLINE_OFFSET_EM * mainFontSize
      ),
      translateX: 0,
      translateY: 0,
      strokeWidth: SYMBOL_STROKE_WIDTH,
      fill: "none",
      lineCap: "butt",
      lineJoin: "miter",
      counterRotation: {
        degrees: counterRotation,
        x: qbarX,
        y: qbarBaseline
      }
    });
  }
  if (settings.setMode !== "none") {
    const synchronous = settings.setMode === "synchronous";
    const x = synchronous
      ? geometry.bodyLeftX + DFF_LABEL_SIDE_INSET
      : geometry.cx;
    const centerY = geometry.bodyTopY + (
      synchronous ? DFF_SYNC_CONTROL_VERTICAL_INSET : DFF_ASYNC_CONTROL_VERTICAL_INSET
    );
    addRun(
      runs,
      "S",
      mirroredX(width, x, mirrored),
      labelBaseline(centerY, DFF_CONTROL_LABEL_FONT_SIZE, counterRotation),
      DFF_CONTROL_LABEL_FONT_SIZE,
      counterRotation
    );
  }
  if (settings.resetMode !== "none") {
    const synchronous = settings.resetMode === "synchronous";
    const x = synchronous
      ? geometry.bodyLeftX + DFF_LABEL_SIDE_INSET
      : geometry.cx;
    const centerY = geometry.bodyBottomY - (
      synchronous ? DFF_SYNC_CONTROL_VERTICAL_INSET : DFF_ASYNC_CONTROL_VERTICAL_INSET
    );
    addRun(
      runs,
      "R",
      mirroredX(width, x, mirrored),
      labelBaseline(centerY, DFF_CONTROL_LABEL_FONT_SIZE, counterRotation),
      DFF_CONTROL_LABEL_FONT_SIZE,
      counterRotation
    );
  }
  return {
    bounds: { x: geometry.bodyLeftX, y: geometry.bodyTopY, width: 96, height: 96 },
    runs,
    paths
  };
}

function dffGeometry(width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;
  const bubbleRadius = CLOCK_BUBBLE_RADIUS;
  const bodyLeftX = cx - 24 * SYMBOL_STROKE_WIDTH;
  const bodyRightX = cx + 24 * SYMBOL_STROKE_WIDTH;
  const bodyTopY = cy - 24 * SYMBOL_STROKE_WIDTH;
  const bodyBottomY = cy + 24 * SYMBOL_STROKE_WIDTH;
  return {
    cx,
    cy,
    bodyLeftX,
    bodyRightX,
    bodyTopY,
    bodyBottomY,
    bubbleRadius,
    clockBubbleCx: bodyLeftX - bubbleRadius,
    qbarBubbleCx: bodyRightX + bubbleRadius
  };
}

function clockEdgeSymbol(
  geometry: ReturnType<typeof dffGeometry>,
  edge: DffSettings["clockEdge"]
) {
  const y = geometry.cy + 20;
  const x = geometry.bodyLeftX;
  return path([
    edge === "falling"
      ? clockInputLeadSymbol(
          geometry.bodyLeftX,
          y,
          geometry.bodyLeftX - 12,
          y,
          edge
        )
      : "",
    edge === "falling"
      ? clockInputBubbleSymbol(
          geometry.bodyLeftX,
          y,
          geometry.bodyLeftX - 12,
          y,
          edge
        )
      : "",
    `M ${x} ${y - 7} L ${x + 10} ${y} L ${x} ${y + 7}`
  ]);
}

function dffControlLead(
  geometry: ReturnType<typeof dffGeometry>,
  pinId: "set" | "reset",
  point: { x: number; y: number },
  activeLow: boolean
) {
  const mode = point.x < geometry.cx ? "synchronous" : "asynchronous";
  if (mode === "synchronous") {
    const endX = activeLow
      ? geometry.bodyLeftX - 2 * geometry.bubbleRadius
      : geometry.bodyLeftX;
    return line(point.x, point.y, endX, point.y);
  }
  if (pinId === "set") {
    const endY = activeLow
      ? geometry.bodyTopY - 2 * geometry.bubbleRadius
      : geometry.bodyTopY;
    return line(point.x, point.y, point.x, endY);
  }
  const endY = activeLow
    ? geometry.bodyBottomY + 2 * geometry.bubbleRadius
    : geometry.bodyBottomY;
  return line(point.x, point.y, point.x, endY);
}

function controlBubble(
  geometry: ReturnType<typeof dffGeometry>,
  pinId: "set" | "reset",
  settings: DffSettings
) {
  const mode = pinId === "set" ? settings.setMode : settings.resetMode;
  if (mode === "synchronous") {
    const y = geometry.cy + (pinId === "set" ? -40 : 40);
    return circlePath(geometry.bodyLeftX - geometry.bubbleRadius, y, geometry.bubbleRadius);
  }
  const y = pinId === "set"
    ? geometry.bodyTopY - geometry.bubbleRadius
    : geometry.bodyBottomY + geometry.bubbleRadius;
  return circlePath(geometry.cx, y, geometry.bubbleRadius);
}

function addRun(
  runs: SymbolTextRunLayout[],
  text: string,
  x: number,
  y: number,
  fontSize: number,
  counterRotation: number
) {
  runs.push({
    text,
    x,
    y,
    width: measureSymbolText(text, fontSize),
    fontSize,
    fontStyle: "italic",
    fontWeight: 700,
    script: "baseline",
    textAnchor: "middle",
    counterRotation
  });
}

function labelBaseline(centerY: number, fontSize: number, counterRotation: number) {
  const direction = counterRotation === 180 ? -1 : 1;
  return centerY + direction * DFF_LABEL_BASELINE_OFFSET_EM * fontSize;
}

function mirroredX(width: number, x: number, mirrored: boolean) {
  return mirrored ? width - x : x;
}

function uprightCounterRotation(rotation: number) {
  const normalized = ((rotation % 360) + 360) % 360;
  return normalized === 180 ? 180 : 0;
}
