import { resolveComponentDef, resolveComponentPinOptions } from "./catalog";
import type { ComponentInstance, OperatorPinMode, PinRole } from "./types";

export type ComponentPinVisibilityMutationResult =
  | { kind: "noop"; reason: "unsupported" | "invalid-pin" | "unchanged" }
  | { kind: "changed"; pinId: string; visible: boolean };

export type ComponentPinModeMutationResult =
  | { kind: "noop"; reason: "unsupported" | "invalid-pin" | "invalid-mode" | "unchanged" }
  | { kind: "changed"; pinId: string; mode: OperatorPinMode };

export type ComponentPinSymbolVisibilityMutationResult =
  | { kind: "noop"; reason: "unsupported" | "invalid-pin" | "unchanged" }
  | { kind: "changed"; pinId: string; visible: boolean };

const PIN_VISIBILITY_VALUE_PREFIX = "pinVisible:";
const PIN_MODE_VALUE_PREFIX = "pinMode:";
const PIN_SYMBOL_VISIBILITY_VALUE_PREFIX = "pinSymbolVisible:";
const OPERATOR_PIN_MODES = new Set<OperatorPinMode>(["positive", "negative", "output"]);

export function componentPinVisible(instance: ComponentInstance, pinId: string) {
  return resolveComponentDef(instance).pins.some((pin) => pin.id === pinId);
}

export function setComponentPinVisibility(
  instance: ComponentInstance,
  pinId: string,
  visible: boolean
): ComponentPinVisibilityMutationResult {
  const def = resolveComponentDef(instance);
  if (!isPinVisibilityEditable(def, pinId)) return { kind: "noop", reason: "unsupported" };
  if (!hasPin(instance, pinId)) return { kind: "noop", reason: "invalid-pin" };
  if (componentPinVisible(instance, pinId) === visible) return { kind: "noop", reason: "unchanged" };

  writePinSetting(instance, pinVisibilityValueKey(pinId), String(visible), "true");
  return { kind: "changed", pinId, visible };
}

export function componentPinMode(instance: ComponentInstance, pinId: string): OperatorPinMode {
  const def = resolveComponentDef(instance);
  const key = pinModeValueKey(pinId);
  const stored = instance.values[key];
  if (isOperatorPinMode(stored)) return stored;
  const configuredDefault = def.defaultValues?.[key];
  return isOperatorPinMode(configuredDefault) ? configuredDefault : "output";
}

export function setComponentPinMode(
  instance: ComponentInstance,
  pinId: string,
  mode: OperatorPinMode
): ComponentPinModeMutationResult {
  const def = resolveComponentDef(instance);
  if (!def.editablePinMode) return { kind: "noop", reason: "unsupported" };
  if (!hasPin(instance, pinId)) return { kind: "noop", reason: "invalid-pin" };
  if (!isOperatorPinMode(mode)) return { kind: "noop", reason: "invalid-mode" };
  if (componentPinMode(instance, pinId) === mode) return { kind: "noop", reason: "unchanged" };

  writePinSetting(instance, pinModeValueKey(pinId), mode, "output");
  return { kind: "changed", pinId, mode };
}

export function componentPinSymbolVisible(instance: ComponentInstance, pinId: string) {
  const def = resolveComponentDef(instance);
  if (!def.editablePinMode) return false;
  return booleanPinSetting(instance, pinSymbolVisibilityValueKey(pinId), true);
}

export function setComponentPinSymbolVisibility(
  instance: ComponentInstance,
  pinId: string,
  visible: boolean
): ComponentPinSymbolVisibilityMutationResult {
  const def = resolveComponentDef(instance);
  if (!def.editablePinMode) return { kind: "noop", reason: "unsupported" };
  if (!hasPin(instance, pinId)) return { kind: "noop", reason: "invalid-pin" };
  if (componentPinSymbolVisible(instance, pinId) === visible) return { kind: "noop", reason: "unchanged" };

  writePinSetting(instance, pinSymbolVisibilityValueKey(pinId), String(visible), "true");
  return { kind: "changed", pinId, visible };
}

export function componentPinNetlistRole(instance: ComponentInstance, pinId: string, fallback: PinRole): PinRole {
  if (!resolveComponentDef(instance).editablePinMode) return fallback;
  const mode = componentPinMode(instance, pinId);
  return mode === "positive" ? "p" : mode === "negative" ? "n" : "out";
}

function booleanPinSetting(instance: ComponentInstance, key: string, fallback: boolean) {
  const def = resolveComponentDef(instance);
  const value = instance.values[key] ?? def.defaultValues?.[key];
  return value === undefined ? fallback : value !== "false";
}

function writePinSetting(instance: ComponentInstance, key: string, value: string, fallback: string) {
  const defaultValue = resolveComponentDef(instance).defaultValues?.[key] ?? fallback;
  if (value === defaultValue) {
    delete instance.values[key];
  } else {
    instance.values[key] = value;
  }
}

function hasPin(instance: ComponentInstance, pinId: string) {
  return resolveComponentPinOptions(instance).some((pin) => pin.id === pinId);
}

function isPinVisibilityEditable(def: ReturnType<typeof resolveComponentDef>, pinId: string) {
  if (!def.editablePinVisibility) return false;
  return !def.editablePinVisibilityIds || def.editablePinVisibilityIds.includes(pinId);
}

function isOperatorPinMode(value: unknown): value is OperatorPinMode {
  return typeof value === "string" && OPERATOR_PIN_MODES.has(value as OperatorPinMode);
}

function pinVisibilityValueKey(pinId: string) {
  return `${PIN_VISIBILITY_VALUE_PREFIX}${pinId}`;
}

function pinModeValueKey(pinId: string) {
  return `${PIN_MODE_VALUE_PREFIX}${pinId}`;
}

function pinSymbolVisibilityValueKey(pinId: string) {
  return `${PIN_SYMBOL_VISIBILITY_VALUE_PREFIX}${pinId}`;
}
