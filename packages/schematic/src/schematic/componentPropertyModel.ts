import { componentScale, supportsComponentScale } from "./componentScaleModel";
import {
  getComponentDef,
  getComponentVariants,
  isValidComponentVariant,
  PALETTE_ORDER,
  resolveComponentPinOptions,
  resolveComponentDef
} from "./catalog";
import { normalizeHexColor } from "../shared/color";
import { isMosComponentType, mosThickGate, setMosThickGate } from "./mosViewModel";
import { validSpntPosition } from "./spntSwitchModel";
import {
  differentialOutputsSame,
  setDifferentialOutputsSame,
  supportsDifferentialOutputOrder
} from "./differentialOutputModel";
import { transformPin } from "./geometry";
import {
  functionBlockTimeDomainForInstance,
  isFunctionBlockType,
  setFunctionBlockTimeDomain
} from "./functionBlockModel";
import {
  componentPinMode,
  componentPinSymbolVisible,
  componentPinVisible,
  setComponentPinMode,
  setComponentPinSymbolVisibility,
  setComponentPinVisibility
} from "./pinConfigurationModel";
import {
  isTransistorComponentType,
  setTransistorCircle,
  transistorCircleVisible
} from "./transistorCircleModel";
import type { ComponentInstance, ComponentType, ComponentVariantId, GainPolarity, SchematicDocument } from "./types";

export {
  componentPinMode,
  componentPinNetlistRole,
  componentPinSymbolVisible,
  componentPinVisible,
  setComponentPinMode,
  setComponentPinSymbolVisibility,
  setComponentPinVisibility,
  type ComponentPinModeMutationResult,
  type ComponentPinSymbolVisibilityMutationResult,
  type ComponentPinVisibilityMutationResult
} from "./pinConfigurationModel";

export type ComponentVariantMutationResult =
  | { kind: "noop"; reason: "invalid-variant" | "unchanged" }
  | { kind: "changed"; variantId: ComponentVariantId };

export type ComponentRefMutationResult =
  | { kind: "noop"; reason: "blank" | "unchanged"; nextRef?: string }
  | { kind: "changed"; previousRef: string; nextRef: string; propagatedMainValue: boolean };

export type ComponentValueMutationResult =
  | { kind: "noop"; reason: "hidden-value" | "unchanged" | "invalid-value" }
  | { kind: "changed"; previousValue: string; nextValue: string };

export type ComponentLabelVisibilityMutationResult =
  | { kind: "noop"; reason: "unchanged" }
  | { kind: "changed"; visible: boolean };

export type ComponentValueVisibilityMutationResult =
  | { kind: "noop"; reason: "unsupported" | "unchanged" }
  | { kind: "changed"; visible: boolean };

export type ComponentColorMutationResult =
  | { kind: "noop"; reason: "invalid" | "unchanged" }
  | { kind: "changed"; color: string | null };

export type ComponentGainPolarityMutationResult =
  | { kind: "noop"; reason: "unsupported" | "invalid-polarity" | "unchanged" }
  | { kind: "changed"; polarity: GainPolarity };

export type ComponentCellChangeMutationResult =
  | { kind: "noop"; reason: "invalid-cell" | "unchanged" | "incompatible-pins" }
  | { kind: "changed"; type: ComponentType };

export type ComponentCellChangeCommitResult =
  | { kind: "noop"; reason: "invalid-cell" | "unchanged" | "incompatible-pins" }
  | {
      kind: "changed";
      previousType: ComponentType;
      type: ComponentType;
      previousRef: string;
      ref: string;
      message: string;
    };

const LABEL_VISIBLE_VALUE_KEY = "labelVisible";
export const VALUE_VISIBLE_VALUE_KEY = "valueVisible";
const GAIN_POLARITY_VALUE_KEY = "gainPolarity";
const GAIN_POLARITIES = new Set<GainPolarity>(["default", "positive", "negative"]);

export const DEFAULT_COMPONENT_COLOR = "#111111";

export function componentCustomColor(instance: ComponentInstance): string | null {
  const color = normalizeHexColor(instance.appearance?.color);
  return color && color !== DEFAULT_COMPONENT_COLOR ? color : null;
}

export function componentColor(instance: ComponentInstance): string {
  return componentCustomColor(instance) ?? DEFAULT_COMPONENT_COLOR;
}

export function setComponentColor(instance: ComponentInstance, value: string | null): ComponentColorMutationResult {
  const nextColor = value === null ? null : normalizeHexColor(value);
  if (value !== null && !nextColor) return { kind: "noop", reason: "invalid" };

  const canonicalColor = nextColor === DEFAULT_COMPONENT_COLOR ? null : nextColor;
  if (componentCustomColor(instance) === canonicalColor) return { kind: "noop", reason: "unchanged" };

  if (canonicalColor) {
    instance.appearance = { ...instance.appearance, color: canonicalColor };
  } else {
    delete instance.appearance;
  }
  return { kind: "changed", color: canonicalColor };
}

export function componentLabelVisible(instance: ComponentInstance) {
  const def = resolveComponentDef(instance);
  const fallback = def.defaultLabelVisible ?? true;
  const stored = instance.values[LABEL_VISIBLE_VALUE_KEY];
  return stored === undefined ? fallback : stored !== "false";
}

export function setComponentLabelVisibility(instance: ComponentInstance, visible: boolean): ComponentLabelVisibilityMutationResult {
  if (componentLabelVisible(instance) === visible) return { kind: "noop", reason: "unchanged" };
  writeComponentSetting(instance, LABEL_VISIBLE_VALUE_KEY, String(visible), String(resolveComponentDef(instance).defaultLabelVisible ?? true));
  return { kind: "changed", visible };
}

export function componentValueVisible(instance: ComponentInstance) {
  if (!resolveComponentDef(instance).valueKey) return false;
  return instance.values[VALUE_VISIBLE_VALUE_KEY] === "true";
}

export function setComponentValueVisibility(
  instance: ComponentInstance,
  visible: boolean
): ComponentValueVisibilityMutationResult {
  if (!resolveComponentDef(instance).valueKey) return { kind: "noop", reason: "unsupported" };
  if (componentValueVisible(instance) === visible) return { kind: "noop", reason: "unchanged" };
  writeComponentSetting(instance, VALUE_VISIBLE_VALUE_KEY, String(visible), "false");
  return { kind: "changed", visible };
}

export function componentGainPolarity(instance: ComponentInstance): GainPolarity {
  const stored = instance.values[GAIN_POLARITY_VALUE_KEY];
  return isGainPolarity(stored) ? stored : "default";
}

export function setComponentGainPolarity(instance: ComponentInstance, polarity: GainPolarity): ComponentGainPolarityMutationResult {
  if (!resolveComponentDef(instance).editableGainPolarity) return { kind: "noop", reason: "unsupported" };
  if (!isGainPolarity(polarity)) return { kind: "noop", reason: "invalid-polarity" };
  if (componentGainPolarity(instance) === polarity) return { kind: "noop", reason: "unchanged" };
  writeComponentSetting(instance, GAIN_POLARITY_VALUE_KEY, polarity, "default");
  return { kind: "changed", polarity };
}

function writeComponentSetting(instance: ComponentInstance, key: string, value: string, fallback: string) {
  if (value === fallback) delete instance.values[key];
  else instance.values[key] = value;
}

function isGainPolarity(value: unknown): value is GainPolarity {
  return typeof value === "string" && GAIN_POLARITIES.has(value as GainPolarity);
}

function isPaletteComponentType(value: string): value is ComponentType {
  return PALETTE_ORDER.includes(value as ComponentType);
}

function variantIdForChangedCell(instance: ComponentInstance, type: ComponentType) {
  const currentVariantId = instance.variantId ?? getComponentDef(instance.type).defaultVariantId;
  if (
    currentVariantId
    && compatibleVariantOptions(instance.type, type)
    && isValidComponentVariant(type, currentVariantId)
  ) {
    return currentVariantId;
  }
  return getComponentDef(type).defaultVariantId;
}

function compatibleVariantOptions(first: ComponentType, second: ComponentType) {
  const fingerprint = (type: ComponentType) => JSON.stringify(
    getComponentVariants(type).map(({ id, label }) => [id, label])
  );
  const firstFingerprint = fingerprint(first);
  return firstFingerprint !== "[]" && firstFingerprint === fingerprint(second);
}

function componentWithCell(instance: ComponentInstance, type: ComponentType): ComponentInstance {
  const def = getComponentDef(type);
  return {
    ...instance,
    type,
    variantId: variantIdForChangedCell(instance, type),
    values: { ...(def.defaultValues ?? {}) }
  };
}

function hasMatchingPinPoints(instance: ComponentInstance, type: ComponentType) {
  const nextInstance = componentWithCell(instance, type);
  // Cell replacement compares supported terminals, including saved optional-pin settings.
  const previous = new Map(resolveComponentPinOptions(instance).map(pin => [pin.id, transformPin(instance, pin)]));
  const next = new Map(resolveComponentPinOptions(nextInstance).map(pin => [pin.id, transformPin(nextInstance, pin)]));
  // Hidden optional terminals may be added or removed; shared terminals must stay put.
  return Array.from(previous.entries()).every(([pinId, point]) => {
    const nextPoint = next.get(pinId);
    return nextPoint
      ? point.x === nextPoint.x && point.y === nextPoint.y
      : !componentPinVisible(instance, pinId);
  }) && Array.from(next.keys()).every((pinId) => (
    previous.has(pinId) || !componentPinVisible(nextInstance, pinId)
  ));
}

export function prepareComponentCellChange(instance: ComponentInstance, type: string): ComponentCellChangeMutationResult {
  if (!isPaletteComponentType(type)) return { kind: "noop", reason: "invalid-cell" };
  if (instance.type === type) return { kind: "noop", reason: "unchanged" };
  if (!supportsComponentScale(type, componentScale(instance))) return { kind: "noop", reason: "incompatible-pins" };
  if (!hasMatchingPinPoints(instance, type)) return { kind: "noop", reason: "incompatible-pins" };
  return { kind: "changed", type };
}

export function canChangeComponentCell(instance: ComponentInstance, type: ComponentType) {
  const result = prepareComponentCellChange(instance, type);
  return result.kind === "changed" || result.reason === "unchanged";
}

function nextComponentRef(document: SchematicDocument, type: ComponentType) {
  const def = getComponentDef(type);
  const prefix = def.valuePrefix ?? def.label;
  let maximum = 0;
  document.components.forEach((component) => {
    if (!component.ref.startsWith(prefix)) return;
    const suffix = Number.parseInt(component.ref.slice(prefix.length), 10);
    if (Number.isFinite(suffix)) maximum = Math.max(maximum, suffix);
  });
  return `${prefix}${maximum + 1}`;
}

function pinVisibilityEditable(def: ReturnType<typeof resolveComponentDef>, pinId: string) {
  return !!def.editablePinVisibility
    && (!def.editablePinVisibilityIds || def.editablePinVisibilityIds.includes(pinId));
}

function copySupportedEditorSettings(
  previousInstance: ComponentInstance,
  nextInstance: ComponentInstance,
  previousDef: ReturnType<typeof resolveComponentDef>,
  nextDef: ReturnType<typeof resolveComponentDef>
) {
  setComponentLabelVisibility(nextInstance, componentLabelVisible(previousInstance));

  if (previousDef.valueKey && nextDef.valueKey) {
    setComponentValueVisibility(nextInstance, componentValueVisible(previousInstance));
  }
  if (previousDef.editableGainPolarity && nextDef.editableGainPolarity) {
    setComponentGainPolarity(nextInstance, componentGainPolarity(previousInstance));
  }
  if (supportsDifferentialOutputOrder(previousInstance.type) && supportsDifferentialOutputOrder(nextInstance.type)) {
    setDifferentialOutputsSame(nextInstance, differentialOutputsSame(previousInstance));
  }
  if (isTransistorComponentType(previousInstance.type) && isTransistorComponentType(nextInstance.type)) {
    setTransistorCircle(nextInstance, transistorCircleVisible(previousInstance));
  }
  if (isMosComponentType(previousInstance.type) && isMosComponentType(nextInstance.type)) {
    setMosThickGate(nextInstance, mosThickGate(previousInstance));
  }
  if (isFunctionBlockType(previousInstance.type) && isFunctionBlockType(nextInstance.type)) {
    setFunctionBlockTimeDomain(nextInstance, functionBlockTimeDomainForInstance(previousInstance));
  }

  const previousPinIds = new Set(resolveComponentPinOptions(previousInstance).map((pin) => pin.id));
  resolveComponentPinOptions(nextInstance).forEach((pin) => {
    if (!previousPinIds.has(pin.id)) return;
    if (pinVisibilityEditable(previousDef, pin.id) && pinVisibilityEditable(nextDef, pin.id)) {
      setComponentPinVisibility(nextInstance, pin.id, componentPinVisible(previousInstance, pin.id));
    }
    if (previousDef.editablePinMode && nextDef.editablePinMode) {
      setComponentPinMode(nextInstance, pin.id, componentPinMode(previousInstance, pin.id));
      setComponentPinSymbolVisibility(nextInstance, pin.id, componentPinSymbolVisible(previousInstance, pin.id));
    }
  });
}

function valuesForChangedCell(instance: ComponentInstance, type: ComponentType, ref: string) {
  const previousDef = resolveComponentDef(instance);
  const nextDef = getComponentDef(type);
  const previousValueKey = previousDef.valueKey;
  const nextValueKey = nextDef.valueKey;
  const nextValues = { ...(nextDef.defaultValues ?? {}) };
  const previousValue = previousValueKey ? instance.values[previousValueKey] : undefined;
  if (previousValueKey && previousValueKey === nextValueKey && previousValue !== undefined && previousValue !== instance.ref) {
    nextValues[nextValueKey] = previousValue;
  } else if (nextValueKey === "main") {
    nextValues.main = ref;
  }

  const nextInstance: ComponentInstance = {
    ...instance,
    type,
    ref,
    variantId: nextDef.defaultVariantId,
    values: nextValues
  };
  copySupportedEditorSettings(instance, nextInstance, previousDef, nextDef);
  return nextInstance.values;
}

export function commitComponentCellChange(
  document: SchematicDocument,
  instance: ComponentInstance,
  type: string
): ComponentCellChangeCommitResult {
  const result = prepareComponentCellChange(instance, type);
  if (result.kind === "noop") return result;

  const previousType = instance.type;
  const previousRef = instance.ref;
  const previousInstance = { ...instance, values: { ...instance.values } };
  const ref = nextComponentRef(document, result.type);
  const nextVariantId = variantIdForChangedCell(previousInstance, result.type);
  instance.type = result.type;
  instance.ref = ref;
  instance.values = valuesForChangedCell(previousInstance, result.type, ref);
  if (nextVariantId) instance.variantId = nextVariantId;
  else delete instance.variantId;

  return {
    kind: "changed",
    previousType,
    type: result.type,
    previousRef,
    ref,
    message: `${previousRef} cell changed from ${getComponentDef(previousType).hotLabel} to ${getComponentDef(result.type).hotLabel} as ${ref}.`
  };
}

export function prepareComponentVariantChange(instance: ComponentInstance, variantId: ComponentVariantId): ComponentVariantMutationResult {
  if (!isValidComponentVariant(instance.type, variantId)) return { kind: "noop", reason: "invalid-variant" };
  if (instance.variantId === variantId) return { kind: "noop", reason: "unchanged" };

  return { kind: "changed", variantId };
}

export function setComponentRef(instance: ComponentInstance, ref: string): ComponentRefMutationResult {
  const nextRef = ref.trim();
  if (!nextRef) return { kind: "noop", reason: "blank", nextRef };

  const previousRef = instance.ref;
  if (previousRef === nextRef) return { kind: "noop", reason: "unchanged", nextRef };

  instance.ref = nextRef;
  const propagatedMainValue = resolveComponentDef(instance).valueKey === "main" && instance.values.main === previousRef;
  if (propagatedMainValue) instance.values.main = nextRef;

  return { kind: "changed", previousRef, nextRef, propagatedMainValue };
}

export function setComponentValue(instance: ComponentInstance, value: string): ComponentValueMutationResult {
  const def = resolveComponentDef(instance);
  const valueKey = def.valueKey;
  if (!valueKey) return { kind: "noop", reason: "hidden-value" };

  let nextValue = value.trim();
  if (instance.type === "spntSwitch") {
    if (nextValue === "") nextValue = "1";
    if (!validSpntPosition(instance, nextValue)) return { kind: "noop", reason: "invalid-value" };
    nextValue = String(Number(nextValue));
  }
  const previousValue = instance.values[valueKey] ?? def.defaultValues?.[valueKey] ?? "";
  if (previousValue === nextValue) return { kind: "noop", reason: "unchanged" };

  if (nextValue) {
    instance.values[valueKey] = nextValue;
  } else {
    delete instance.values[valueKey];
  }

  return { kind: "changed", previousValue, nextValue };
}
