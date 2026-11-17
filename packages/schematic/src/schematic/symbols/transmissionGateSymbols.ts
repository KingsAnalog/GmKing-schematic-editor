import { circlePath, line, path, SYMBOL_STROKE_WIDTH } from "./symbolPrimitives";

function transmissionGateGeometry(width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;
  const halfBody = 12 * SYMBOL_STROKE_WIDTH;
  const bubbleRadius = 3 * SYMBOL_STROKE_WIDTH;
  return {
    cx, cy,
    left: cx - halfBody,
    right: cx + halfBody,
    top: cy - halfBody,
    bottom: cy + halfBody,
    upperCross: cy - halfBody / 2,
    lowerCross: cy + halfBody / 2,
    bubbleRadius
  };
}

export function transmissionGateLeads(width: number, height: number) {
  const g = transmissionGateGeometry(width, height);
  return path([
    line(0, g.cy, g.left, g.cy),
    line(g.right, g.cy, width, g.cy),
    line(g.cx, 0, g.cx, g.upperCross - 2 * g.bubbleRadius),
    line(g.cx, g.lowerCross, g.cx, height)
  ]);
}

export function transmissionGateBody(width: number, height: number) {
  const g = transmissionGateGeometry(width, height);
  return path([
    `M ${g.left} ${g.top} L ${g.right} ${g.cy} L ${g.left} ${g.bottom} Z`,
    `M ${g.right} ${g.top} L ${g.left} ${g.cy} L ${g.right} ${g.bottom} Z`,
    circlePath(g.cx, g.upperCross - g.bubbleRadius, g.bubbleRadius)
  ]);
}
