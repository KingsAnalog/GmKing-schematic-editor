import { resolveComponentDef, resolveComponentPinOptions } from "./catalog";
import { TRIANGLE_EDGES, TRIANGLE_VERTICES, TRIANGLE_MAX_COORDINATE, TRIANGLE_MAX_PIN_COUNT, trianglePinCountKey, triangleVertexKey, triangleSettings, validTriangleSettings } from "./triangleComponentModel";
import { GRID_SIZE } from "./types";
import { COMPONENT_CLOCK_OPTIONS, COMPONENT_CLOCK_VALUE_KEY, supportsOptionalClock } from "./clockModel";
import { DFF_VALUE_KEYS, DFF_SETTING_OPTIONS, type DffSettingProperty } from "./dffModel";
import { DIFFERENTIAL_OUTPUTS_SAME_VALUE_KEY } from "./differentialOutputModel";
import { FILTER_KIND_OPTIONS, FILTER_KIND_VALUE_KEY, FUNCTION_BLOCK_TIME_DOMAIN_OPTIONS, FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY, isFunctionBlockType } from "./functionBlockModel";
import { INDUCTOR_DOT_VALUE_KEY, INDUCTOR_TAP_VALUE_KEY, INDUCTOR_LAYOUT_VALUE_KEY, INDUCTOR_LAYOUT_OPTIONS } from "./inductorModel";
import { RECTANGLE_WIDTH_VALUE_KEY, RECTANGLE_HEIGHT_VALUE_KEY, RECTANGLE_LEFT_PIN_COUNT_VALUE_KEY, RECTANGLE_RIGHT_PIN_COUNT_VALUE_KEY, RECTANGLE_TOP_PIN_COUNT_VALUE_KEY, RECTANGLE_BOTTOM_PIN_COUNT_VALUE_KEY, RECTANGLE_FREE_SHAPE_MIN_SIZE_GRID, RECTANGLE_MAX_SIZE_GRID, RECTANGLE_MAX_PIN_COUNT } from "./rectangleComponentModel";
import { SPNT_POSITION_VALUE_KEY, validSpntPosition } from "./spntSwitchModel";
import { isTransistorComponentType, TRANSISTOR_CIRCLE_VALUE_KEY } from "./transistorCircleModel";
import { isMosComponentType, MOS_THICK_GATE_VALUE_KEY } from "./mosViewModel";
import { validVoltageSourceFieldValue } from "./voltageSourceModel";
import type { ComponentInstance, ComponentType } from "./types";

export interface ComponentValueIssue { key: string; expected: string }
export interface ComponentValueRule {
  key: string;
  prefix?: boolean;
  supports(component: ComponentInstance): boolean;
  valid(value: string, component: ComponentInstance, key: string): boolean;
  expected: string;
  unsupportedExpected?: string;
}

const anyComponent: ComponentValueRule["supports"] = () => true;
const only = (type: ComponentType) => (component: ComponentInstance) => component.type === type;
const booleanValues = ["true", "false"] as const;
function enumeration(key: string, values: readonly string[], supports = anyComponent): ComponentValueRule {
  return { key, supports, valid: value => values.includes(value), expected: `one of ${values.join(", ")}` };
}
function integer(key: string, min: number, max: number): ComponentValueRule {
  return {
    key, supports: only("rectangle"),
    valid: value => Number.isInteger(Number(value)) && Number(value) >= min && Number(value) <= max,
    expected: `an integer from ${min} to ${max}`
  };
}

/** Stored keys, capabilities and validation are shared by editing and decoding.
 * Formula/parameter strings use the component's declared value key.
 * Other stored settings must be declared in this table.
 */
export const COMPONENT_VALUE_RULES: readonly ComponentValueRule[] = [
  enumeration("labelVisible", booleanValues),
  enumeration("valueVisible", booleanValues),
  enumeration(MOS_THICK_GATE_VALUE_KEY, booleanValues, component => isMosComponentType(component.type)),
  enumeration("gainPolarity", ["default", "positive", "negative"]),
  enumeration(DIFFERENTIAL_OUTPUTS_SAME_VALUE_KEY, booleanValues),
  { ...enumeration(TRANSISTOR_CIRCLE_VALUE_KEY, booleanValues, component => isTransistorComponentType(component.type)), unsupportedExpected: "a setting for an NMOS, PMOS, NPN, or PNP transistor" },
  enumeration(COMPONENT_CLOCK_VALUE_KEY, COMPONENT_CLOCK_OPTIONS.map(option => option.id), component => supportsOptionalClock(component.type)),
  enumeration(FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY, FUNCTION_BLOCK_TIME_DOMAIN_OPTIONS.map(option => option.value), component => isFunctionBlockType(component.type)),
  enumeration(FILTER_KIND_VALUE_KEY, FILTER_KIND_OPTIONS.map(option => option.value), only("filter")),
  ...(Object.keys(DFF_VALUE_KEYS) as DffSettingProperty[]).map(property => enumeration(DFF_VALUE_KEYS[property], DFF_SETTING_OPTIONS[property].map(option => option.value), only("dff"))),
  enumeration(INDUCTOR_DOT_VALUE_KEY, ["none", "p", "n"], only("inductor")),
  enumeration(INDUCTOR_TAP_VALUE_KEY, ["none", "top", "bottom"], only("inductor")),
  enumeration(INDUCTOR_LAYOUT_VALUE_KEY, INDUCTOR_LAYOUT_OPTIONS.map(option => option.id), only("inductor")),
  ...TRIANGLE_EDGES.map(edge => ({
    key: trianglePinCountKey(edge), supports: only("triangle"),
    valid: (value: string) => value.trim() !== "" && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= TRIANGLE_MAX_PIN_COUNT,
    expected: `an integer from 0 to ${TRIANGLE_MAX_PIN_COUNT}`
  })),
  ...TRIANGLE_VERTICES.flatMap(vertex => (["x", "y"] as const).map(axis => ({
    key: triangleVertexKey(vertex, axis), supports: only("triangle"),
    valid: (value: string) => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) % GRID_SIZE === 0 && Math.abs(Number(value)) <= TRIANGLE_MAX_COORDINATE,
    expected: "a triangle vertex coordinate on the canvas grid"
  }))),
  ...[RECTANGLE_WIDTH_VALUE_KEY, RECTANGLE_HEIGHT_VALUE_KEY].map(key => ({
    key, supports: only("rectangle"),
    valid: (value: string) => value.trim() !== ""
      && Number.isFinite(Number(value))
      && Number(value) >= RECTANGLE_FREE_SHAPE_MIN_SIZE_GRID
      && Number(value) <= RECTANGLE_MAX_SIZE_GRID
      && Number.isInteger(Number(value) / RECTANGLE_FREE_SHAPE_MIN_SIZE_GRID),
    expected: `a multiple of ${RECTANGLE_FREE_SHAPE_MIN_SIZE_GRID} from ${RECTANGLE_FREE_SHAPE_MIN_SIZE_GRID} to ${RECTANGLE_MAX_SIZE_GRID}`
  })),
  ...[RECTANGLE_LEFT_PIN_COUNT_VALUE_KEY, RECTANGLE_RIGHT_PIN_COUNT_VALUE_KEY, RECTANGLE_TOP_PIN_COUNT_VALUE_KEY, RECTANGLE_BOTTOM_PIN_COUNT_VALUE_KEY].map(key => integer(key, 0, RECTANGLE_MAX_PIN_COUNT)),
  { key: SPNT_POSITION_VALUE_KEY, supports: only("spntSwitch"), valid: (value, component) => validSpntPosition(component, value), expected: "a switch position from 0 (open) to the number of throws" },
  { key: "vsource:", prefix: true, supports: only("voltageSource"), valid: (value, _component, key) => validVoltageSourceFieldValue(key, value), expected: "a valid voltage source setting" },
  {
    key: "layer:",
    prefix: true,
    supports: () => true,
    valid: value => value.length <= 256,
    expected: "a layer id"
  },
  ...["pinVisible:", "pinSymbolVisible:", "pinMode:"].map(key => ({
    ...enumeration(key, key === "pinMode:" ? ["positive", "negative", "output"] : booleanValues),
    prefix: true
  }))
];

export function componentValueRule(key: string) {
  return COMPONENT_VALUE_RULES.find(rule => rule.prefix ? key.startsWith(rule.key) : rule.key === key);
}

export function componentSupportsProperty(component: ComponentInstance, key: string) {
  return componentValueRule(key)?.supports(component) ?? false;
}

export function componentValueIssue(component: ComponentInstance): ComponentValueIssue | null {
  for (const [key, value] of Object.entries(component.values)) {
    const rule = componentValueRule(key);
    if (!rule) {
      if (key === resolveComponentDef(component).valueKey) continue;
      return { key, expected: "a declared component value or setting" };
    }
    if (!rule.supports(component)) return { key, expected: rule.unsupportedExpected ?? "a setting supported by this component type" };
    if (!rule.valid(value, component, key)) return { key, expected: rule.expected };
    if (key.startsWith("pinVisible:") || key.startsWith("pinSymbolVisible:") || key.startsWith("pinMode:")) {
      const pinId = key.slice(key.indexOf(":") + 1);
      if (!resolveComponentPinOptions(component).some(pin => pin.id === pinId)) return { key, expected: "setting for a known component pin" };
    }
  }
  if (component.type === "triangle" && !validTriangleSettings(triangleSettings(component))) {
    return { key: "triangleVertex:a:x", expected: "a nondegenerate triangle with distinct pin endpoints" };
  }
  return null;
}
