import type { ComponentInstance, ComponentType } from "./types";

export type TransistorComponentType = Extract<ComponentType, "nmos" | "pmos" | "npn" | "pnp">;

export const TRANSISTOR_CIRCLE_VALUE_KEY = "transistorCircle";

export type TransistorCircleMutationResult =
  | { kind: "noop"; reason: "unsupported" | "unchanged" }
  | { kind: "changed"; visible: boolean };

export function isTransistorComponentType(type: ComponentType): type is TransistorComponentType {
  return type === "nmos" || type === "pmos" || type === "npn" || type === "pnp";
}

export function transistorCircleVisible(instance: Pick<ComponentInstance, "type" | "values">) {
  return isTransistorComponentType(instance.type)
    && instance.values[TRANSISTOR_CIRCLE_VALUE_KEY] === "true";
}

export function setTransistorCircle(
  instance: Pick<ComponentInstance, "type" | "values">,
  visible: boolean
): TransistorCircleMutationResult {
  if (!isTransistorComponentType(instance.type)) return { kind: "noop", reason: "unsupported" };
  if (transistorCircleVisible(instance) === visible) return { kind: "noop", reason: "unchanged" };
  if (visible) instance.values[TRANSISTOR_CIRCLE_VALUE_KEY] = "true";
  else delete instance.values[TRANSISTOR_CIRCLE_VALUE_KEY];
  return { kind: "changed", visible };
}

export function symbolWithTransistorCircle(symbol: string, visible: boolean) {
  return visible ? `${symbol}-circle` : symbol;
}
