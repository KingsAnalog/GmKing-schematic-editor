import type { PinDef } from "../types";
import { boxedFrameSymbol, boxedLeadSymbol } from "./boxedSymbols";

export { boxedFrameSymbol, boxedLeadSymbol } from "./boxedSymbols";

export function rectangleFrameSymbol(width: number, height: number) {
  return boxedFrameSymbol(width, height);
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
