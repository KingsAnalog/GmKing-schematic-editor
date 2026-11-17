import { PLANAR_INDUCTOR_SCALE, type InductorDotTerminal, type InductorTap, type InductorLayout } from "../inductorModel";
import { circlePath, line, path } from "./symbolPrimitives";

function geometry(width: number, height: number) {
  return {
    x: (offset: number) => width / 2 + offset * PLANAR_INDUCTOR_SCALE,
    y: (offset: number) => height / 2 + offset * PLANAR_INDUCTOR_SCALE
  };
}

/** Scaled winding, equal stroke/gap widths, a 45-degree crossover and short thick stubs. */
export function planarInductorBody(width: number, height: number, layout: InductorLayout = "double") {
  const { x, y } = geometry(width, height);
  const points = layout === "single" ? [
    [-20, 50], [-20, 37], [-37, 37], [-37, -37],
    [37, -37], [37, 37], [20, 37], [20, 50]
  ] : [
    [-20, 50], [-20, 37], [-37, 37], [-37, -37],
    [-6, -37], [6, -25], [25, -25], [25, 25], [-25, 25], [-25, -25],
    [-6, -25], [6, -37], [37, -37], [37, 37], [20, 37], [20, 50]
  ];
  return points.map(([dx, dy], index) => `${index ? "L" : "M"} ${x(dx)} ${y(dy)}`).join(" ");
}

export function planarInductorLeads(width: number, height: number) {
  const { x, y } = geometry(width, height);
  return path([line(x(-20), y(50), x(-20), y(60)), line(x(20), y(50), x(20), y(60))]);
}

export function planarInductorTap(width: number, height: number, tap: InductorTap, layout: InductorLayout = "double") {
  if (tap === "none") return "";
  const { x, y } = geometry(width, height);
  return line(x(0), y(layout === "single" ? -37 : 25), x(0), y(tap === "top" ? 10 : 60));
}

export function planarInductorDot(width: number, height: number, terminal: InductorDotTerminal) {
  if (terminal === "none") return "";
  const { x, y } = geometry(width, height);
  return circlePath(x(terminal === "p" ? -28 : 28), y(48), 4 * PLANAR_INDUCTOR_SCALE);
}
