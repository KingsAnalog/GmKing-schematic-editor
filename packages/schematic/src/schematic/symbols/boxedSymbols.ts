import type { PinDef } from "../types";
import { boxedComponentBodyBounds, type BoxedComponentSide } from "../boxedComponentModel";

export interface BoxedLeadPin {
  pin: Pick<PinDef, "x" | "y">;
  side: BoxedComponentSide;
}

export function boxedFrameSymbol(width: number, height: number, inset?: number) {
  const body = boxedComponentBodyBounds(width, height, inset);
  return `M ${body.left} ${body.top} L ${body.right} ${body.top} L ${body.right} ${body.bottom} L ${body.left} ${body.bottom} Z`;
}

export function boxedLeadSymbol(
  width: number,
  height: number,
  pins: readonly BoxedLeadPin[],
  inset?: number
) {
  const body = boxedComponentBodyBounds(width, height, inset);
  const cx = width / 2;
  const cy = height / 2;
  return pins.map(({ pin, side }) => {
    const x = cx + pin.x;
    const y = cy + pin.y;
    if (side === "left") return `M ${x} ${y} L ${body.left} ${y}`;
    if (side === "right") return `M ${x} ${y} L ${body.right} ${y}`;
    if (side === "top") return `M ${x} ${y} L ${x} ${body.top}`;
    return `M ${x} ${y} L ${x} ${body.bottom}`;
  }).join(" ");
}
