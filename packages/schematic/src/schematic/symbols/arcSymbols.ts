import { quadraticArc } from "../arcGeometry";
import { DEFAULT_ARC_POINTS } from "../arcComponentModel";
import type { Point } from "../types";

export function quadraticArcSymbol(width: number, height: number, points: readonly Point[] = DEFAULT_ARC_POINTS) {
  const arc = quadraticArc(points);
  if (!arc) return "";
  const [start, end] = points;
  const svgPoint = ({ x, y }: Point) => `${x + width / 2} ${y + height / 2}`;
  return `M ${svgPoint(start)} Q ${svgPoint(arc.control)} ${svgPoint(end)}`;
}
