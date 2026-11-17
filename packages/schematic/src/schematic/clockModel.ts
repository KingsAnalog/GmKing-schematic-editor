import type { ComponentInstance, ComponentType } from "./types";

export type ClockEdge = "rising" | "falling";
export type ComponentClock = "none" | ClockEdge;

export const COMPONENT_CLOCK_VALUE_KEY = "clock";
export const DEFAULT_COMPONENT_CLOCK: ComponentClock = "none";
export const COMPONENT_CLOCK_OPTIONS = [
  { id: "none", label: "No" },
  { id: "rising", label: "Rising" },
  { id: "falling", label: "Falling" }
] as const;

const OPTIONAL_CLOCK_COMPONENT_TYPES = new Set<ComponentType>([
  "adc",
  "dac",
  "comparator",
  "diffComparator",
  "slicer",
  "integrator",
  "differentiator",
  "delay",
  "filter"
]);

export function isClockEdge(value: unknown): value is ClockEdge {
  return value === "rising" || value === "falling";
}

export function isComponentClock(value: unknown): value is ComponentClock {
  return value === "none" || isClockEdge(value);
}

export function supportsOptionalClock(type: ComponentType) {
  return OPTIONAL_CLOCK_COMPONENT_TYPES.has(type);
}

export function componentClockForInstance(
  instance: Pick<ComponentInstance, "type" | "values">
): ComponentClock {
  if (!supportsOptionalClock(instance.type)) return DEFAULT_COMPONENT_CLOCK;
  const value = instance.values[COMPONENT_CLOCK_VALUE_KEY];
  return isComponentClock(value) ? value : DEFAULT_COMPONENT_CLOCK;
}

export function setComponentClock(instance: ComponentInstance, clock: ComponentClock) {
  if (!supportsOptionalClock(instance.type) || !isComponentClock(clock)) {
    return { kind: "noop", reason: "unsupported" } as const;
  }
  if (componentClockForInstance(instance) === clock) {
    return { kind: "noop", reason: "unchanged" } as const;
  }
  if (clock === DEFAULT_COMPONENT_CLOCK) delete instance.values[COMPONENT_CLOCK_VALUE_KEY];
  else instance.values[COMPONENT_CLOCK_VALUE_KEY] = clock;
  return { kind: "changed", clock } as const;
}
