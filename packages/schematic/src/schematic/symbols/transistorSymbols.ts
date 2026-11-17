import { circlePath, path, SYMBOL_STROKE_WIDTH } from "./symbolPrimitives";

export const TRANSISTOR_CIRCLE_SUFFIX = "-circle";

export function splitTransistorCircleSymbol(symbol: string) {
  return symbol.endsWith(TRANSISTOR_CIRCLE_SUFFIX)
    ? { symbol: symbol.slice(0, -TRANSISTOR_CIRCLE_SUFFIX.length), circle: true }
    : { symbol, circle: false };
}

export function transistorCirclePath(width: number, height: number, lineWidth = SYMBOL_STROKE_WIDTH) {
  const cx = width / 2 - 10 * lineWidth;
  const cy = height / 2;
  const centerlineRadius = 9.5 * lineWidth;
  return circlePath(cx, cy, centerlineRadius);
}

export function appendTransistorCircle(
  bodyPath: string,
  width: number,
  height: number,
  visible: boolean,
  lineWidth = SYMBOL_STROKE_WIDTH
) {
  return visible ? path([bodyPath, transistorCirclePath(width, height, lineWidth)]) : bodyPath;
}

export function solidArrowTriangleAlong(
  tipX: number,
  tipY: number,
  directionX: number,
  directionY: number,
  lineWidth = SYMBOL_STROKE_WIDTH
) {
  const length = Math.hypot(directionX, directionY);
  if (length === 0) return "";
  const ux = directionX / length;
  const uy = directionY / length;
  const base = 6 * lineWidth;
  const height = 7 * lineWidth;
  const baseCx = tipX - ux * height;
  const baseCy = tipY - uy * height;
  const px = -uy * base / 2;
  const py = ux * base / 2;
  return path([
    `M ${tipX} ${tipY}`,
    `L ${baseCx + px} ${baseCy + py}`,
    `L ${baseCx - px} ${baseCy - py}`,
    "Z"
  ]);
}
