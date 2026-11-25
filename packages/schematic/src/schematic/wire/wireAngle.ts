import type { WireRouteMode } from "../types";

/** Drawing preference. Saved wires retain their existing geometry and route mode. */
export type WireAngle = WireRouteMode | "diagonal45";

export function parseWireAngle(value: string | null): WireAngle {
  return value === "diagonal45" || value === "freeAngle" ? value : "orthogonal";
}
