import { resolveComponentDef, resolveComponentPinOptions } from "./catalog";
import { TRIANGLE_VERTICES, TRIANGLE_MAX_COORDINATE, triangleVertexKey, triangleSettings, validTriangleSettings } from "./triangleComponentModel";
import { ARC_POINTS_VALUE_KEY, parseArcPoints } from "./arcComponentModel";
import { CIRCLE_RADIUS_VALUE_KEYS, parseCircleRadius } from "./circleComponentModel";
import { POLYGON_POINTS_VALUE_KEY, parsePolygonPoints } from "./polygonComponentModel";
import { parsePolylinePoints, POLYLINE_MAX_POINTS, POLYLINE_POINTS_VALUE_KEY } from "./polylineComponentModel";
import { GRID_SIZE } from "./types";
import { COMPONENT_CLOCK_OPTIONS, COMPONENT_CLOCK_VALUE_KEY, supportsOptionalClock } from "./clockModel";
import { DFF_VALUE_KEYS, DFF_SETTING_OPTIONS, type DffSettingProperty } from "./dffModel";
import { DIFFERENTIAL_OUTPUTS_SAME_VALUE_KEY } from "./differentialOutputModel";
import { FILTER_KIND_OPTIONS, FILTER_KIND_VALUE_KEY, FUNCTION_BLOCK_TIME_DOMAIN_OPTIONS, FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY, isFunctionBlockType } from "./functionBlockModel";
import { INDUCTOR_DOT_VALUE_KEY, INDUCTOR_TAP_VALUE_KEY, INDUCTOR_LAYOUT_VALUE_KEY, INDUCTOR_LAYOUT_OPTIONS } from "./inductorModel";
import { RECTANGLE_WIDTH_VALUE_KEY, RECTANGLE_HEIGHT_VALUE_KEY, RECTANGLE_FREE_SHAPE_MIN_SIZE_GRID, RECTANGLE_MAX_SIZE_GRID } from "./rectangleComponentModel";
import { SPNT_POSITION_VALUE_KEY, validSpntPosition } from "./spntSwitchModel";
import { isTransistorComponentType, TRANSISTOR_CIRCLE_VALUE_KEY } from "./transistorCircleModel";
import { isMosComponentType, MOS_THICK_GATE_VALUE_KEY } from "./mosViewModel";
import { validVoltageSourceFieldValue } from "./voltageSourceModel";
import { isDeviceKind, isNetlistModelText, NETLIST_MODEL_VALUE_KEY } from "./netlist/profiles";
import {
  isLibraryShapeType,
  isOpenLibraryShapeType,
  supportsLibraryShapeStyle,
  LIBRARY_SHAPE_START_ARROW_VALUE_KEY,
  LIBRARY_SHAPE_END_ARROW_VALUE_KEY,
  LIBRARY_SHAPE_START_ARROW_SIZE_VALUE_KEY,
  LIBRARY_SHAPE_END_ARROW_SIZE_VALUE_KEY,
  LIBRARY_SHAPE_ARROW_TYPES,
  LIBRARY_SHAPE_ARROW_SIZES,
  LIBRARY_SHAPE_CORNER_RADIUS_VALUE_KEY,
  LIBRARY_SHAPE_FILL_COLOR_VALUE_KEY,
  LIBRARY_SHAPE_FILL_ENABLED_VALUE_KEY,
  LIBRARY_SHAPE_FILL_OPACITY_VALUE_KEY,
  LIBRARY_SHAPE_LINE_STYLES,
  LIBRARY_SHAPE_LINE_STYLE_VALUE_KEY,
  LIBRARY_SHAPE_MAX_CORNER_RADIUS,
  LIBRARY_SHAPE_MAX_STROKE_WIDTH,
  LIBRARY_SHAPE_MIN_STROKE_WIDTH,
  LIBRARY_SHAPE_STROKE_WIDTH_VALUE_KEY,
  normalizeLibraryShapeCornerRadius,
  normalizeLibraryShapeFillOpacity,
  normalizeLibraryShapeStrokeWidth
} from "./libraryShapeStyleModel";
import { normalizeHexColor } from "../shared/color";
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
/** Stored keys, capabilities and validation are shared by editing and decoding.
 * Formula/parameter strings use the component's declared value key.
 * Other stored settings must be declared in this table.
 */
export const COMPONENT_VALUE_RULES: readonly ComponentValueRule[] = [
  enumeration("labelVisible", booleanValues),
  enumeration("valueVisible", booleanValues),
  enumeration(MOS_THICK_GATE_VALUE_KEY, booleanValues, component => isMosComponentType(component.type)),
  {
    key: NETLIST_MODEL_VALUE_KEY,
    supports: component => isDeviceKind(component.type),
    valid: isNetlistModelText,
    expected: "a netlist model name on one line"
  },
  ...["mos:w", "mos:l", "mos:m", "mos:nf"].map(key => ({
    key,
    supports: (component: ComponentInstance) => isMosComponentType(component.type),
    valid: (value: string) => value.length <= 256 && !/[\r\n]/.test(value),
    expected: "a MOS parameter expression on one line"
  })),
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
  { key: POLYLINE_POINTS_VALUE_KEY, supports: only("polyline"), valid: value => parsePolylinePoints(value) !== null,
    expected: `2 to ${POLYLINE_MAX_POINTS} valid local points without consecutive duplicates` },
  ...Object.values(CIRCLE_RADIUS_VALUE_KEYS).map(key => ({
    key, supports: only("circle"), valid: (value: string) => parseCircleRadius(value) !== null,
    expected: "a radius within the supported shape dimensions"
  })),
  { key: POLYGON_POINTS_VALUE_KEY, supports: only("polygon"), valid: value => parsePolygonPoints(value) !== null,
    expected: "three or more distinct, non-collinear local polygon vertices" },
  { key: ARC_POINTS_VALUE_KEY, supports: only("arc"), valid: value => parseArcPoints(value) !== null,
    expected: "three local points with distinct endpoints within the supported arc bounds" },
  ...[LIBRARY_SHAPE_START_ARROW_VALUE_KEY, LIBRARY_SHAPE_END_ARROW_VALUE_KEY].map(key =>
    enumeration(key, [...LIBRARY_SHAPE_ARROW_TYPES, ...booleanValues], component => isOpenLibraryShapeType(component.type))),
  ...[LIBRARY_SHAPE_START_ARROW_SIZE_VALUE_KEY, LIBRARY_SHAPE_END_ARROW_SIZE_VALUE_KEY].map(key =>
    enumeration(key, LIBRARY_SHAPE_ARROW_SIZES, component => isOpenLibraryShapeType(component.type))),
  ...TRIANGLE_VERTICES.flatMap(vertex => (["x", "y"] as const).map(axis => ({
    key: triangleVertexKey(vertex, axis), supports: only("triangle"),
    valid: (value: string) => value.trim() !== "" && Number.isFinite(Number(value)) && Number(value) % (GRID_SIZE / 2) === 0 && Math.abs(Number(value)) <= TRIANGLE_MAX_COORDINATE,
    expected: "a triangle vertex coordinate on the 5 px local grid"
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
  {
    key: LIBRARY_SHAPE_STROKE_WIDTH_VALUE_KEY,
    supports: component => isLibraryShapeType(component.type),
    valid: value => normalizeLibraryShapeStrokeWidth(value) !== null,
    expected: `a half-pixel step from ${LIBRARY_SHAPE_MIN_STROKE_WIDTH} to ${LIBRARY_SHAPE_MAX_STROKE_WIDTH}`
  },
  enumeration(
    LIBRARY_SHAPE_LINE_STYLE_VALUE_KEY,
    LIBRARY_SHAPE_LINE_STYLES,
    component => isLibraryShapeType(component.type)
  ),
  {
    key: LIBRARY_SHAPE_CORNER_RADIUS_VALUE_KEY,
    supports: only("rectangle"),
    valid: value => normalizeLibraryShapeCornerRadius(value) !== null,
    expected: `a half-pixel step from 0 to ${LIBRARY_SHAPE_MAX_CORNER_RADIUS}`
  },
  enumeration(
    LIBRARY_SHAPE_FILL_ENABLED_VALUE_KEY,
    booleanValues,
    component => supportsLibraryShapeStyle(component.type, "fillEnabled")
  ),
  {
    key: LIBRARY_SHAPE_FILL_COLOR_VALUE_KEY,
    supports: component => supportsLibraryShapeStyle(component.type, "fillColor"),
    valid: value => normalizeHexColor(value) !== null,
    expected: "a six-digit hex color"
  },
  {
    key: LIBRARY_SHAPE_FILL_OPACITY_VALUE_KEY,
    supports: component => supportsLibraryShapeStyle(component.type, "fillOpacity"),
    valid: value => normalizeLibraryShapeFillOpacity(value) !== null,
    expected: "a number from 0 to 1"
  },
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
    // Older files could contain electrical configuration on library artwork.
    // Decoding accepts it once; document restoration removes it before use.
    if ((component.type === "rectangle" || component.type === "triangle")
      && (key === "labelVisible"
        || key === "valueVisible"
        || key.startsWith("rectanglePinCount:")
        || key.startsWith("trianglePinCount:")
        || key.startsWith("pinVisible:")
        || key.startsWith("pinSymbolVisible:")
        || key.startsWith("pinMode:"))) {
      continue;
    }
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
