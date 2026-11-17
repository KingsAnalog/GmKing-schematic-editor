import type { ComponentInstance, ComponentType, PinDef } from "./types";

const DIFFERENTIAL_OUTPUT_TYPES = new Set<ComponentType>([
  "diffAmp",
  "diffOta",
  "diffComparator"
]);

export const DIFFERENTIAL_OUTPUTS_SAME_VALUE_KEY = "differentialOutputsSame";

export function supportsDifferentialOutputOrder(type: ComponentType) {
  return DIFFERENTIAL_OUTPUT_TYPES.has(type);
}

export function differentialOutputsSame(instance: ComponentInstance) {
  return !supportsDifferentialOutputOrder(instance.type)
    || instance.values[DIFFERENTIAL_OUTPUTS_SAME_VALUE_KEY] === "true";
}

export function setDifferentialOutputsSame(instance: ComponentInstance, same: boolean) {
  if (!supportsDifferentialOutputOrder(instance.type)) {
    return { kind: "noop", reason: "unsupported" } as const;
  }
  if (differentialOutputsSame(instance) === same) {
    return { kind: "noop", reason: "unchanged" } as const;
  }
  if (same) instance.values[DIFFERENTIAL_OUTPUTS_SAME_VALUE_KEY] = "true";
  else delete instance.values[DIFFERENTIAL_OUTPUTS_SAME_VALUE_KEY];
  return { kind: "changed", same } as const;
}

export function resolveDifferentialOutputPins(pins: readonly PinDef[], same: boolean) {
  if (same) return pins.map((pin) => ({ ...pin }));
  const positive = pins.find((pin) => pin.id === "outp");
  const negative = pins.find((pin) => pin.id === "outn");
  if (!positive || !negative) return pins.map((pin) => ({ ...pin }));
  return pins.map((pin) => {
    if (pin.id === "outp") return { ...negative, x: pin.x, y: pin.y };
    if (pin.id === "outn") return { ...positive, x: pin.x, y: pin.y };
    return { ...pin };
  });
}
