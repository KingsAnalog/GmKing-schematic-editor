import { path, SYMBOL_STROKE_WIDTH } from "./symbolPrimitives";
import { SYMBOL_GRID_SIZE } from "../types";

/** A coaxial-line outline inside the existing 4 × 2 grid delay footprint. */
export function transmissionLineGeometry(width: number, height: number) {
  const y = height / 2;
  // A 4a centerline radius with a 2a outline leaves a 6a inner diameter.
  const radius = 4 * SYMBOL_STROKE_WIDTH;
  const left = 0.8 * SYMBOL_GRID_SIZE;
  const right = width - 0.8 * SYMBOL_GRID_SIZE;
  return {
    body: path([
      `M ${left} ${y - radius} L ${right} ${y - radius}`,
      `A ${radius} ${radius} 0 0 1 ${right} ${y + radius}`,
      `L ${left} ${y + radius}`,
      `A ${radius} ${radius} 0 0 1 ${left} ${y - radius}`,
      `M ${left} ${y - radius}`,
      `A ${radius} ${radius} 0 0 1 ${left} ${y + radius}`
    ]),
    leads: `M 0 ${y} L ${left} ${y} M ${right + radius} ${y} L ${width} ${y}`,
    bottom: y + radius
  };
}
