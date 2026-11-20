import type { PinDef } from "../types";
import { boxedComponentBodyBounds } from "../boxedComponentModel";
import { boxedFrameSymbol, boxedLeadSymbol } from "./boxedSymbols";

export { boxedFrameSymbol, boxedLeadSymbol } from "./boxedSymbols";

export function rectangleFrameSymbol(width: number, height: number, inset?: number, cornerRadius = 0) {
  if (cornerRadius <= 0) return boxedFrameSymbol(width, height, inset);
  const body = boxedComponentBodyBounds(width, height, inset);
  const radius = Math.min(
    cornerRadius,
    (body.right - body.left) / 2,
    (body.bottom - body.top) / 2
  );
  return `M ${body.left + radius} ${body.top} L ${body.right - radius} ${body.top} Q ${body.right} ${body.top} ${body.right} ${body.top + radius} L ${body.right} ${body.bottom - radius} Q ${body.right} ${body.bottom} ${body.right - radius} ${body.bottom} L ${body.left + radius} ${body.bottom} Q ${body.left} ${body.bottom} ${body.left} ${body.bottom - radius} L ${body.left} ${body.top + radius} Q ${body.left} ${body.top} ${body.left + radius} ${body.top} Z`;
}

export function rectangleLeadSymbol(width: number, height: number, pins: readonly PinDef[]) {
  return boxedLeadSymbol(width, height, pins.map((pin) => ({
    pin,
    side: pin.id.startsWith("left-")
      ? "left"
      : pin.id.startsWith("right-")
        ? "right"
        : pin.id.startsWith("top-")
          ? "top"
          : "bottom"
  })));
}
