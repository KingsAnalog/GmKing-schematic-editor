import type { ComponentInstance, PinDef } from "./types";
import { boxedComponentPinPoint, boxedComponentSize } from "./boxedComponentModel";

export const INDUCTOR_DOT_VALUE_KEY = "inductorDot";
export const INDUCTOR_TAP_VALUE_KEY = "inductorTap";
export const INDUCTOR_LAYOUT_VALUE_KEY = "inductorLayout";
export const INDUCTOR_LAYOUT_OPTIONS = [
  { id: "single", label: "single turn" },
  { id: "double", label: "double turn" }
] as const;
export type InductorLayout = typeof INDUCTOR_LAYOUT_OPTIONS[number]["id"];
export const TAPPED_INDUCTOR_SIZE = { width: 100, height: 56 };
export const PLANAR_INDUCTOR_SCALE = 2;
export const PLANAR_INDUCTOR_BODY_HALF_SIZE = 40 * PLANAR_INDUCTOR_SCALE;
export const PLANAR_INDUCTOR_SIZE = boxedComponentSize(4 * PLANAR_INDUCTOR_SCALE, 4 * PLANAR_INDUCTOR_SCALE, PLANAR_INDUCTOR_SCALE);

export function isPlanarInductor(instance: ComponentInstance) {
  return isInductor(instance) && instance.variantId === "planar";
}

export function isInductorLayout(value: unknown): value is InductorLayout {
  return INDUCTOR_LAYOUT_OPTIONS.some(option => option.id === value);
}

export function inductorLayout(instance: ComponentInstance): InductorLayout {
  const value = instance.values[INDUCTOR_LAYOUT_VALUE_KEY];
  return isInductorLayout(value) ? value : "double";
}

export function setInductorLayout(instance: ComponentInstance, layout: InductorLayout) {
  if (!isPlanarInductor(instance) || !isInductorLayout(layout) || inductorLayout(instance) === layout) return false;
  if (layout === "double") delete instance.values[INDUCTOR_LAYOUT_VALUE_KEY];
  else instance.values[INDUCTOR_LAYOUT_VALUE_KEY] = layout;
  return true;
}

export function planarInductorPins(tap: InductorTap = "none"): PinDef[] {
  return [
    { id: "p", label: "+", role: "p", ...boxedComponentPinPoint(PLANAR_INDUCTOR_SIZE, "bottom", -20 * PLANAR_INDUCTOR_SCALE) },
    { id: "n", label: "-", role: "n", ...boxedComponentPinPoint(PLANAR_INDUCTOR_SIZE, "bottom", 20 * PLANAR_INDUCTOR_SCALE) },
    ...(tap === "none" ? [] : [{ id: "ct", label: "CT", role: "io" as const, x: 0, y: (tap === "top" ? 10 : 60) * PLANAR_INDUCTOR_SCALE }])
  ];
}

export type InductorDotTerminal = "none" | "p" | "n";
export type InductorTap = "none" | "top" | "bottom";

const DOT_TERMINALS = new Set<InductorDotTerminal>(["none", "p", "n"]);
const TAP_POSITIONS = new Set<InductorTap>(["none", "top", "bottom"]);

export function isInductor(instance: ComponentInstance) {
  return instance.type === "inductor";
}

export function isInductorDotTerminal(value: unknown): value is InductorDotTerminal {
  return typeof value === "string" && DOT_TERMINALS.has(value as InductorDotTerminal);
}

export function inductorDotTerminal(instance: ComponentInstance): InductorDotTerminal {
  const value = instance.values[INDUCTOR_DOT_VALUE_KEY];
  return isInductorDotTerminal(value) ? value : "none";
}

export function setInductorDotTerminal(instance: ComponentInstance, terminal: InductorDotTerminal) {
  if (!isInductor(instance) || !isInductorDotTerminal(terminal)) return false;
  if (inductorDotTerminal(instance) === terminal) return false;
  if (terminal === "none") delete instance.values[INDUCTOR_DOT_VALUE_KEY];
  else instance.values[INDUCTOR_DOT_VALUE_KEY] = terminal;
  return true;
}

export function inductorTap(instance: ComponentInstance): InductorTap {
  if (!isInductor(instance)) return "none";
  const value = instance.values[INDUCTOR_TAP_VALUE_KEY];
  return isInductorTap(value) ? value : "none";
}

export function isInductorTap(value: unknown): value is InductorTap {
  return typeof value === "string" && TAP_POSITIONS.has(value as InductorTap);
}

export function setInductorTap(instance: ComponentInstance, tap: InductorTap) {
  if (!isInductor(instance) || !isInductorTap(tap)) return false;
  if (inductorTap(instance) === tap) return false;
  if (tap === "none") delete instance.values[INDUCTOR_TAP_VALUE_KEY];
  else instance.values[INDUCTOR_TAP_VALUE_KEY] = tap;
  return true;
}

export function tappedInductorPins(tap: Exclude<InductorTap, "none">): PinDef[] {
  return [
    { id: "p", label: "+", role: "p", x: -40, y: 0 },
    { id: "n", label: "-", role: "n", x: 40, y: 0 },
    {
      id: "ct",
      label: "CT",
      role: "io",
      x: 0,
      y: tap === "top" ? -20 : 20
    }
  ];
}
