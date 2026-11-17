import { line, path } from "./symbolPrimitives";

const BODY_HALF_SIZE = 12;

/** Anode on the left; the bar on the right marks the cathode. */
export function diodeLeadSymbol(width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;
  return path([
    line(cx - 40, cy, cx - BODY_HALF_SIZE, cy),
    line(cx + BODY_HALF_SIZE, cy, cx + 40, cy)
  ]);
}

export function diodeBodySymbol(width: number, height: number) {
  const cx = width / 2;
  const cy = height / 2;
  const left = cx - BODY_HALF_SIZE;
  const right = cx + BODY_HALF_SIZE;
  const top = cy - BODY_HALF_SIZE;
  const bottom = cy + BODY_HALF_SIZE;
  return path([
    `M ${left} ${top} L ${right} ${cy} L ${left} ${bottom} Z`,
    line(right, top, right, bottom)
  ]);
}
