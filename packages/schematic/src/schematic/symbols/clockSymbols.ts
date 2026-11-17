import type { ComponentClock } from "../clockModel";
import { circlePath, line, SYMBOL_STROKE_WIDTH } from "./symbolPrimitives";

export const CLOCK_BUBBLE_RADIUS = 3 * SYMBOL_STROKE_WIDTH;
export const CLOCK_BUBBLE_STROKE_WIDTH = 2 * SYMBOL_STROKE_WIDTH;

export function clockInputLeadSymbol(
  bodyX: number,
  bodyY: number,
  pinX: number,
  pinY: number,
  clock: ComponentClock,
  bubbleRadius = CLOCK_BUBBLE_RADIUS
) {
  if (clock === "none") return "";
  if (clock === "rising") return line(bodyX, bodyY, pinX, pinY);
  const geometry = clockBubbleGeometry(bodyX, bodyY, pinX, pinY, bubbleRadius);
  return geometry
    ? line(
        geometry.bubbleX + geometry.ux * bubbleRadius,
        geometry.bubbleY + geometry.uy * bubbleRadius,
        pinX,
        pinY
      )
    : "";
}

export function clockInputBubbleSymbol(
  bodyX: number,
  bodyY: number,
  pinX: number,
  pinY: number,
  clock: ComponentClock,
  bubbleRadius = CLOCK_BUBBLE_RADIUS
) {
  if (clock !== "falling") return "";
  const geometry = clockBubbleGeometry(bodyX, bodyY, pinX, pinY, bubbleRadius);
  return geometry
    ? circlePath(geometry.bubbleX, geometry.bubbleY, bubbleRadius)
    : "";
}

function clockBubbleGeometry(
  bodyX: number,
  bodyY: number,
  pinX: number,
  pinY: number,
  bubbleRadius: number
) {
  const length = Math.hypot(pinX - bodyX, pinY - bodyY);
  if (length === 0) return null;
  const ux = (pinX - bodyX) / length;
  const uy = (pinY - bodyY) / length;
  return {
    ux,
    uy,
    bubbleX: bodyX + ux * bubbleRadius,
    bubbleY: bodyY + uy * bubbleRadius
  };
}
