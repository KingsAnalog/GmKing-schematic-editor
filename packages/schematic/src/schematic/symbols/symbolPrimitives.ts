export const SYMBOL_STROKE_WIDTH = 2;

export type PolarityKind = "plus" | "minus";
export type ArrowDirection = "up" | "right" | "down" | "left";

export function path(parts: string[]) {
  return parts.filter(Boolean).join(" ");
}

export function line(x1: number, y1: number, x2: number, y2: number) {
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

export function circlePath(cx: number, cy: number, radius: number) {
  return `M ${cx + radius} ${cy} A ${radius} ${radius} 0 1 1 ${cx - radius} ${cy} A ${radius} ${radius} 0 1 1 ${cx + radius} ${cy}`;
}

export function polarityMark(kind: PolarityKind, x: number, y: number, half = 7) {
  const horizontal = line(x - half, y, x + half, y);
  if (kind === "minus") return horizontal;
  return path([horizontal, line(x, y - half, x, y + half)]);
}

export function arrow(x: number, y: number, length: number, headSize: number, direction: ArrowDirection) {
  const halfLength = length / 2;
  if (direction === "up") {
    const tipY = y - halfLength;
    const tailY = y + halfLength;
    return path([line(x, tailY, x, tipY), line(x, tipY, x - headSize, tipY + headSize), line(x, tipY, x + headSize, tipY + headSize)]);
  }
  if (direction === "down") {
    const tipY = y + halfLength;
    const tailY = y - halfLength;
    return path([line(x, tailY, x, tipY), line(x, tipY, x - headSize, tipY - headSize), line(x, tipY, x + headSize, tipY - headSize)]);
  }
  if (direction === "left") {
    const tipX = x - halfLength;
    const tailX = x + halfLength;
    return path([line(tailX, y, tipX, y), line(tipX, y, tipX + headSize, y - headSize), line(tipX, y, tipX + headSize, y + headSize)]);
  }
  const tipX = x + halfLength;
  const tailX = x - halfLength;
  return path([line(tailX, y, tipX, y), line(tipX, y, tipX - headSize, y - headSize), line(tipX, y, tipX - headSize, y + headSize)]);
}

export function arrowUp(x: number, y: number, halfHeight: number, halfWidth: number) {
  return arrow(x, y, halfHeight * 2, halfWidth, "up");
}

export function twoTerminalSourceShell(leftPin: number, rightPin: number, cx: number, cy: number, radius: number) {
  return path([line(leftPin, cy, cx - radius, cy), line(cx + radius, cy, rightPin, cy), circlePath(cx, cy, radius)]);
}
