import type { Point } from "../types";

export function closedPolygonPath(width: number, height: number, vertices: readonly Point[]) {
  return vertices.map((point, index) => `${index ? "L" : "M"} ${width / 2 + point.x} ${height / 2 + point.y}`).join(" ") + " Z";
}

export function ellipseSymbol(width: number, height: number) {
  const rx = width / 2;
  const ry = height / 2;
  const arc = `A ${rx} ${ry} 0 0 1`;
  return `M ${rx} 0 ${arc} ${width} ${ry} ${arc} ${rx} ${height} ${arc} 0 ${ry} ${arc} ${rx} 0 Z`;
}
