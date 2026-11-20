import { voltageSourceDisplayValue } from "./voltageSourceModel";
import { splitComponentName } from "./componentNameFormat";
export { splitComponentName } from "./componentNameFormat";
import { resolveComponentDef } from "./catalog";
import {
  componentGainPolarity,
  componentColor,
  componentLabelVisible,
  componentValueVisible,
  componentPinMode,
  componentPinSymbolVisible
} from "./componentPropertyModel";
import {
  analogBufferFamilyLabelText,
  analogBufferLabelPosition,
  analogBufferNonlinearAccentSymbol,
  inverterSupplyLeadSymbol
} from "./symbols/bufferSymbols";
import {
  adcQuantizerSymbol,
  adcSymbol,
  converterClockBubbleSymbol,
  converterLabelFontSize,
  converterLabelPosition,
  converterLabelText,
  dacSymbol
} from "./symbols/converterSymbols";
import {
  converterBitsValue,
  quantizerLevelCount
} from "./converterModel";
import {
  comparatorAccentSymbol,
  comparatorClockBubbleSymbol,
  differentialAmpLeadSymbol,
  differentialComparatorAccentSymbol,
  differentialComparatorClockBubbleSymbol,
  differentialOtaLeadSymbol,
  normalizeComparatorLevels,
  slicerAccentSymbol,
  slicerClockBubbleSymbol
} from "./symbols/amplifierSymbols";
import {
  symbolAccentPath,
  symbolAccentStrokeWidth,
  symbolMarkerPath,
  symbolPath,
  symbolStrokeWidth
} from "./symbols/symbolRegistry";
import { SYMBOL_STROKE_WIDTH } from "./symbols/symbolPrimitives";
import { operatorSymbol, plusPinRoleSymbols } from "./symbols/operatorSymbols";
import { spntSwitchBladeSymbol, switchBladeSymbol, switchSymbol } from "./symbols/switchSymbols";
import { spntPosition, spntThrowCount } from "./spntSwitchModel";
import { voltageSourceShellSymbol, voltageSourceWaveformContent, voltageSourceWaveformFromSymbol } from "./symbols/sourceSymbols";
import { quadraticArcSymbol } from "./symbols/arcSymbols";
import { polylineArtwork } from "./symbols/polylineSymbols";
import { triangleFrameSymbol } from "./symbols/triangleSymbols";
import { rectangleFrameSymbol } from "./symbols/rectangleSymbols";
import { isLibraryShapeType, LIBRARY_SHAPE_LINE_DASHARRAYS, libraryShapeStyle } from "./libraryShapeStyleModel";
import { functionBlockGain, supportsFunctionBlockGain, resolveFunctionBlockModel } from "./functionBlockModel";
import { componentLocalFrameBox, componentSymbolBounds } from "./view-geometry";
import type { ComponentDef, ComponentInstance, GainPolarity, Point } from "./types";
import type { Rect } from "./view-geometry";
import { isTransistorComponentType } from "./transistorCircleModel";
import { differentialOutputsSame } from "./differentialOutputModel";
import { dffSettings } from "./dffModel";
import { componentClockForInstance, type ComponentClock } from "./clockModel";
import {
  dffAccentSymbol,
  dffBodySymbol,
  dffContentLayout
} from "./symbols/dffSymbols";
import {
  inductorCenterTapSymbol,
  inductorDotMarkerSymbol
} from "./symbols/passiveSymbols";
import {
  inductorDotTerminal,
  isPlanarInductor,
  inductorTap,
  inductorLayout
} from "./inductorModel";
import { planarInductorBody, planarInductorLeads, planarInductorTap, planarInductorDot } from "./symbols/planarInductorSymbols";

export const ANALOG_BUFFER_LABEL_FONT_SIZE = 20;
export const REF_LABEL_FONT_SIZE = 11;
export const REF_LABEL_TAIL_FONT_SIZE = 8;
export const RECTANGLE_REF_LABEL_FONT_SIZE = 16;
export const RECTANGLE_REF_LABEL_TAIL_FONT_SIZE = 16;

const CENTERED_REF_LABEL_SIGN_FONT_SIZE = 18;
const CENTERED_REF_LABEL_TAIL_FONT_SIZE = 12;
const REF_LABEL_SEGMENT_GAP = 1;
const ORDINARY_REF_LABEL_SUBSCRIPT_CENTER_OFFSET_Y = 3;
// SVG renderers disagree on `central`; explicit Arial alphabetic baselines are stable across them.
const REF_LABEL_VISUAL_CENTER_TO_BASELINE_EM = 0.35;
// This is JointJS's established `textVerticalAnchor: "middle"` placement, made renderer-independent.
const SYMBOL_LABEL_VISUAL_CENTER_TO_BASELINE_EM = 0.3;
const REF_LABEL_MARGIN = 6;
const TWO_TERMINAL_REF_LABEL_MARGIN = 2;
const TRANSISTOR_REF_LABEL_SOURCE_BIAS = 0.7;

export function splitIndexedComponentName(ref: string) {
  const match = /^([+\-−]?(?:\p{Nd}+(?:\.\p{Nd}*)?|\.\p{Nd}+)?)(\p{L}+)(\p{Nd}*)$/u.exec(ref);
  if (!match) return { prefix: ref, head: "", tail: "", literal: true };
  return {
    prefix: (match[1] ?? "").replace(/^-/, "−"),
    head: match[2] ?? "",
    tail: match[3] ?? "",
    literal: false
  };
}

function approximateArialBoldAdvanceEm(character: string) {
  if (character === "+" || character === "−" || character === "-") return 0.584;
  if (/\d/.test(character)) return 0.556;
  if (character === "." || character === " " || character === "\u00a0") return 0.278;
  if (/[A-Z]/.test(character)) {
    if (character === "I") return 0.278;
    if (character === "M") return 0.833;
    if (character === "W") return 0.944;
    if (character === "G" || character === "O" || character === "Q") return 0.778;
    return 0.722;
  }
  if (/[a-z]/.test(character)) {
    if (character === "i" || character === "j" || character === "l") return 0.278;
    if (character === "f" || character === "r" || character === "t") return 0.389;
    if (character === "m") return 0.833;
    if (character === "w") return 0.778;
    return 0.556;
  }
  return 0.6;
}

function approximateArialBoldTextWidth(text: string, fontSize: number) {
  return Array.from(text).reduce((width, character) => width + approximateArialBoldAdvanceEm(character) * fontSize, 0);
}

type RefLabelTextAnchor = "start" | "middle" | "end";
type RefLabelSegmentId = "sign" | "prefix" | "head" | "tail" | "value";

function refLabelXLayout(
  anchorX: number,
  textAnchor: RefLabelTextAnchor,
  sign: string,
  prefix: string,
  head: string,
  tail: string,
  value: string,
  fontSizes: {
    sign: number;
    prefix: number;
    head: number;
    tail: number;
    value: number;
  },
  segmentGap: number,
  valueWidth = approximateArialBoldTextWidth(value, fontSizes.value)
) {
  const segments = [
    { id: "sign" as const, text: sign, width: approximateArialBoldTextWidth(sign, fontSizes.sign) },
    { id: "prefix" as const, text: prefix, width: approximateArialBoldTextWidth(prefix, fontSizes.prefix) },
    { id: "head" as const, text: head, width: approximateArialBoldTextWidth(head, fontSizes.head) },
    { id: "tail" as const, text: tail, width: approximateArialBoldTextWidth(tail, fontSizes.tail) },
    { id: "value" as const, text: value, width: valueWidth }
  ].filter((segment) => segment.text.length > 0);
  const totalWidth = segments.reduce((width, segment) => width + segment.width, 0)
    + Math.max(0, segments.length - 1) * segmentGap;
  let cursor = textAnchor === "start"
    ? anchorX
    : textAnchor === "end"
      ? anchorX - totalWidth
      : anchorX - totalWidth / 2;
  const starts: Record<RefLabelSegmentId, number> = {
    sign: anchorX,
    prefix: anchorX,
    head: anchorX,
    tail: anchorX,
    value: anchorX
  };
  const widths: Record<RefLabelSegmentId, number> = { sign: 0, prefix: 0, head: 0, tail: 0, value: 0 };
  segments.forEach((segment, index) => {
    starts[segment.id] = cursor;
    widths[segment.id] = segment.width;
    cursor += segment.width;
    if (index < segments.length - 1) cursor += segmentGap;
  });
  return { starts, widths };
}

function normalizeRotation(rotation: number) {
  return ((rotation % 360) + 360) % 360;
}

function rotationQuadrant(rotation: number) {
  return (Math.round(normalizeRotation(rotation) / 90) * 90) % 360;
}

function vddLabelCenter(
  instance: ComponentInstance,
  def: ComponentDef,
  symbolBox: Rect,
  labelText: string
) {
  const quadrant = rotationQuadrant(instance.rotation);
  const sideways = quadrant === 90 || quadrant === 270;
  const sidewaysWidthCompensation = sideways
    ? Math.max(0, (
        approximateArialBoldTextWidth(labelText, REF_LABEL_FONT_SIZE)
        - REF_LABEL_FONT_SIZE
      ) / 2)
    : 0;
  return {
    x: def.size.width / 2,
    y: symbolBox.y
      - REF_LABEL_MARGIN
      - REF_LABEL_FONT_SIZE / 2
      - sidewaysWidthCompensation
  };
}

function componentNameAnchor(
  instance: ComponentInstance,
  def: ComponentDef,
  symbolBox: Rect,
  flipReferenceLabelSide = false
): Point {
  if (def.type === "amp") {
    const scale = def.geometryScale ?? 1;
    const anchor = analogBufferLabelPosition(def.size.width / scale, def.size.height / scale, instance.mirrored);
    return { x: anchor.x * scale, y: anchor.y * scale };
  }
  if (def.centeredRefLabel) {
    if (def.bodyPolygon) {
      const center = def.bodyPolygon.reduce((sum, point) => ({ x: sum.x + point.x / def.bodyPolygon!.length, y: sum.y + point.y / def.bodyPolygon!.length }), { x: 0, y: 0 });
      return { x: def.size.width / 2 + (instance.mirrored ? -center.x : center.x), y: def.size.height / 2 + center.y };
    }
    return { x: def.size.width / 2, y: def.size.height / 2 };
  }
  if (isTransistorComponentType(def.type)) {
    const controlPin = def.pins.find((pin) => pin.role === "gate" || pin.role === "base");
    const lowerBiasedPin = def.pins.find((pin) => pin.role === "source" || pin.role === "emitter");
    if (controlPin && lowerBiasedPin) {
      // Keep the label center in the control/source-side blank area. The cell
      // rotates this anchor; inverse text rotation only keeps the name upright.
      const centerX = (controlPin.x + lowerBiasedPin.x) / 2;
      return {
        x: def.size.width / 2 + (instance.mirrored ? -centerX : centerX),
        y: def.size.height / 2 + controlPin.y
          + (lowerBiasedPin.y - controlPin.y) * TRANSISTOR_REF_LABEL_SOURCE_BIAS
      };
    }
  }
  const margin = def.terminalClass === "twoTerminal" || def.type === "switch" || def.type === "inductor"
    ? TWO_TERMINAL_REF_LABEL_MARGIN : REF_LABEL_MARGIN;
  if (def.type === "inductor") {
    const anchor = !isPlanarInductor(instance) && inductorTap(instance) === "top" ? {
      x: def.size.width / 2,
      y: symbolBox.y + symbolBox.height + margin
    } : {
      x: def.size.width / 2,
      y: symbolBox.y - margin
    };
    return flipReferenceLabelSide ? {
      x: def.size.width - anchor.x,
      y: def.size.height - anchor.y
    } : anchor;
  }

  return {
    x: def.size.width / 2,
    y: symbolBox.y - margin
  };
}

function componentNameTextAlignment(
  instance: ComponentInstance,
  def: ComponentDef,
  flipReferenceLabelSide = false
): { textAnchor: RefLabelTextAnchor; dominantBaseline: string } {
  if (def.centeredRefLabel || isTransistorComponentType(def.type)) {
    return { textAnchor: "middle", dominantBaseline: "central" };
  }

  const labelUsesBottomSide = def.type === "inductor"
    && ((!isPlanarInductor(instance) && inductorTap(instance) === "top") !== flipReferenceLabelSide);
  const quadrant = (rotationQuadrant(instance.rotation) + (labelUsesBottomSide ? 180 : 0)) % 360;
  if (quadrant === 90) {
    return { textAnchor: "start", dominantBaseline: "central" };
  }
  if (quadrant === 180) {
    return { textAnchor: "middle", dominantBaseline: "text-before-edge" };
  }
  if (quadrant === 270) {
    return { textAnchor: "end", dominantBaseline: "central" };
  }
  return { textAnchor: "middle", dominantBaseline: "text-after-edge" };
}

function componentNameTransform(instance: ComponentInstance, anchor: Point) {
  const transforms: string[] = [];
  const rotation = normalizeRotation(instance.rotation);
  if (rotation !== 0) {
    transforms.push(`rotate(${-rotation} ${anchor.x} ${anchor.y})`);
  }
  return transforms.join(" ");
}

export function componentNameLabelAttrs(
  instance: ComponentInstance,
  def: ComponentDef,
  frameBox: Rect,
  symbolBox: Rect,
  showName: boolean,
  valueText: string,
  flipReferenceLabelSide = false
) {
  const anchor = componentNameAnchor(
    instance,
    def,
    symbolBox,
    flipReferenceLabelSide
  );
  const localAnchor = { x: anchor.x - frameBox.x, y: anchor.y - frameBox.y };
  const alignment = componentNameTextAlignment(
    instance,
    def,
    flipReferenceLabelSide
  );
  const name = !showName
    ? { prefix: "", head: "", tail: "", literal: true }
    : def.nameFormat === "literal"
    ? { prefix: instance.ref, head: "", tail: "", literal: true }
    : def.nameFormat === "indexed"
      ? splitIndexedComponentName(instance.ref)
    : splitComponentName(instance.ref);
  const polarity = componentGainPolarity(instance);
  const sign = showName && def.centeredRefLabel
    ? (polarity === "positive" ? "+" : polarity === "negative" ? "−" : "")
    : "";
  const centered = !!def.centeredRefLabel;
  const centeredLiteral = centered && def.nameFormat === "literal";
  const usesVisualCenter = alignment.dominantBaseline === "central";
  const centeredHeadFontSize = (def.type === "rectangle" || def.type === "triangle")
    ? RECTANGLE_REF_LABEL_FONT_SIZE
    : ANALOG_BUFFER_LABEL_FONT_SIZE;
  const centeredTailFontSize = (def.type === "rectangle" || def.type === "triangle")
    ? RECTANGLE_REF_LABEL_TAIL_FONT_SIZE
    : CENTERED_REF_LABEL_TAIL_FONT_SIZE;
  const headFontSize = centered ? centeredHeadFontSize : REF_LABEL_FONT_SIZE;
  const signFontSize = centered ? CENTERED_REF_LABEL_SIGN_FONT_SIZE : REF_LABEL_FONT_SIZE;
  const tailFontSize = centered ? centeredTailFontSize : REF_LABEL_TAIL_FONT_SIZE;
  const valueFontSize = centered ? centeredTailFontSize : REF_LABEL_FONT_SIZE;
  const gain = functionBlockGain(instance);
  const valueName = valueText && supportsFunctionBlockGain(instance.type) && !Number.isFinite(Number(gain))
    ? splitComponentName(gain) : null;
  const valuePrefix = valueName && !valueName.literal
    ? valueText.slice(0, -gain.length) + valueName.prefix : valueText;
  const valueHead = valueName?.head ?? "";
  const valueTail = valueName?.tail ?? "";
  const valuePrefixWidth = approximateArialBoldTextWidth(valuePrefix, valueFontSize);
  const valueHeadWidth = approximateArialBoldTextWidth(valueHead, valueFontSize);
  const valueTailWidth = approximateArialBoldTextWidth(valueTail, REF_LABEL_TAIL_FONT_SIZE);
  const labelX = refLabelXLayout(
    localAnchor.x,
    centered ? "middle" : alignment.textAnchor,
    sign,
    name.prefix,
    name.head,
    name.tail,
    valueText,
    {
      sign: signFontSize,
      prefix: headFontSize,
      head: headFontSize,
      tail: tailFontSize,
      value: valueFontSize
    },
    REF_LABEL_SEGMENT_GAP,
    valuePrefixWidth + valueHeadWidth + valueTailWidth
  );
  const headY = usesVisualCenter ? alphabeticBaselineForVisualCenter(localAnchor.y, headFontSize) : localAnchor.y;
  const signY = centered
    ? alphabeticBaselineForVisualCenter(localAnchor.y, signFontSize)
    : headY;
  const tailY = centered
    ? alphabeticBaselineForVisualCenter(localAnchor.y + 5, tailFontSize)
    : usesVisualCenter
      ? alphabeticBaselineForVisualCenter(
          localAnchor.y + ORDINARY_REF_LABEL_SUBSCRIPT_CENTER_OFFSET_Y,
          tailFontSize
        )
      : localAnchor.y + ORDINARY_REF_LABEL_SUBSCRIPT_CENTER_OFFSET_Y;
  return {
    refLabel: {
      x: localAnchor.x,
      y: headY,
      textAnchor: alignment.textAnchor,
      dominantBaseline: usesVisualCenter ? "alphabetic" : alignment.dominantBaseline,
      transform: componentNameTransform(instance, localAnchor)
    },
    refLabelSign: centered
      ? {
          text: sign,
          x: labelX.starts.sign + labelX.widths.sign,
          y: signY,
          textAnchor: "end"
        }
      : { text: sign, x: labelX.starts.sign, y: signY, textAnchor: "start" },
    refLabelPrefix: centered
      ? {
          text: name.prefix,
          x: centeredLiteral
            ? labelX.starts.prefix + labelX.widths.prefix / 2
            : labelX.starts.prefix,
          y: headY,
          textAnchor: centeredLiteral ? "middle" : "start"
        }
      : { text: name.prefix, x: labelX.starts.prefix, y: headY, textAnchor: "start" },
    refLabelHead: centered
      ? {
          text: name.head,
          x: labelX.starts.head + labelX.widths.head / 2,
          y: headY,
          textAnchor: "middle"
        }
      : { text: name.head, x: labelX.starts.head, y: headY, textAnchor: "start" },
    refLabelTail: centered
      ? { text: name.tail, x: labelX.starts.tail, y: tailY, textAnchor: "start" }
      : { text: name.tail, x: labelX.starts.tail, y: tailY, textAnchor: "start" },
    refLabelValue: {
      text: valuePrefix,
      x: labelX.starts.value,
      y: usesVisualCenter
        ? alphabeticBaselineForVisualCenter(localAnchor.y, valueFontSize)
        : localAnchor.y,
      textAnchor: "start" as const
    },
    refLabelValueHead: {
      text: valueHead,
      x: labelX.starts.value + valuePrefixWidth,
      y: headY,
      textAnchor: "start" as const
    },
    refLabelValueTail: {
      text: valueTail,
      x: labelX.starts.value + valuePrefixWidth + valueHeadWidth,
      y: tailY,
      textAnchor: "start" as const
    }
  };
}

function componentDisplayValue(instance: ComponentInstance, def: ComponentDef) {
  const key = def.valueKey;
  if (!key) return "";
  const value = (instance.type === "voltageSource" ? voltageSourceDisplayValue(instance) : instance.values[key] ?? def.defaultValues?.[key] ?? "").trim();
  return value ? `${value}${def.valueUnit ?? ""}` : "";
}

function alphabeticBaselineForVisualCenter(centerY: number, fontSize: number) {
  return centerY + fontSize * REF_LABEL_VISUAL_CENTER_TO_BASELINE_EM;
}

function centeredTextLayout(
  center: Point,
  fontSize: number,
  textAnchor: RefLabelTextAnchor = "middle",
  lineCount = 1
) {
  const multiline = lineCount > 1;
  return {
    x: center.x,
    y: multiline
      ? center.y
      : center.y + fontSize * SYMBOL_LABEL_VISUAL_CENTER_TO_BASELINE_EM,
    fontSize,
    textAnchor,
    dominantBaseline: "alphabetic" as const,
    lineHeight: multiline ? "1em" : undefined,
    textVerticalAnchor: multiline ? "middle" as const : undefined
  };
}

export interface ComponentVisualOptions {
  preview?: boolean;
  selected?: boolean;
  presentationMode?: boolean;
  resizeHandles?: boolean;
  flipReferenceLabelSide?: boolean;
}

/** Existing appearance family, kept intact when introducing template dispatch. */
export function resolveRazaviComponentVisualModel(
  instance: ComponentInstance,
  options: ComponentVisualOptions = {}
) {
  const def = resolveComponentDef(instance);
  const functionBlockModel = resolveFunctionBlockModel(instance);
  const clock = componentClockForInstance(instance);
  const visiblePinIds = new Set(def.pins.map((pin) => pin.id));
  const dffModel = def.type === "dff" ? dffSettings(instance) : null;
  const sourceWaveform = def.type === "voltageSource" ? voltageSourceWaveformFromSymbol(def.symbol) : null;
  const isConverter = def.type === "adc" || def.type === "dac";
  const converterBits = isConverter ? converterBitsValue(instance) : "";
  const visibleConverterBits = isConverter && componentValueVisible(instance)
    ? converterBits
    : "";
  const freeLibraryShape = isLibraryShapeType(def.type);
  const shapeStyle = libraryShapeStyle(instance);
  const polyline = def.bodyPolyline ? polylineArtwork(def.size.width, def.size.height, def.bodyPolyline, shapeStyle) : null;
  const path = polyline
    ? polyline.path
    : def.bodyArc
    ? quadraticArcSymbol(def.size.width, def.size.height, def.bodyArc)
    : def.bodyPolygon
    ? triangleFrameSymbol(def.size.width, def.size.height, def.bodyPolygon)
    : def.type === "rectangle"
      ? rectangleFrameSymbol(def.size.width, def.size.height, 0, shapeStyle.cornerRadius)
    : isPlanarInductor(instance)
    ? [planarInductorLeads(def.size.width, def.size.height), planarInductorTap(def.size.width, def.size.height, inductorTap(instance), inductorLayout(instance))].filter(Boolean).join(" ")
    : functionBlockModel
    ? functionBlockModel.framePath
    : sourceWaveform
    ? voltageSourceShellSymbol(def.size.width, def.size.height)
    : dffModel
    ? dffBodySymbol(def.size.width, def.size.height, dffModel, visiblePinIds)
    : def.symbol === "plus" || def.symbol === "multiply"
    ? operatorSymbol(def.size.width, def.size.height, SYMBOL_STROKE_WIDTH, visiblePinIds)
    : def.symbol === "adc"
      ? adcSymbol(
          def.size.width,
          def.size.height,
          SYMBOL_STROKE_WIDTH,
          visiblePinIds,
          clock
        )
      : def.symbol === "adc-quantizer"
        ? adcQuantizerSymbol(
            def.size.width,
            def.size.height,
            SYMBOL_STROKE_WIDTH,
            visiblePinIds,
            quantizerLevelCount(converterBits),
            !!visibleConverterBits,
            clock
          )
        : def.symbol === "dac"
          ? dacSymbol(
              def.size.width,
              def.size.height,
              SYMBOL_STROKE_WIDTH,
              visiblePinIds,
              clock
            )
    : def.symbol === "switch-open" || def.symbol === "switch-closed"
      ? switchSymbol(
          def.size.width,
          def.size.height,
          SYMBOL_STROKE_WIDTH,
          def.symbol === "switch-closed",
          visiblePinIds.has("ctrl")
        )
      : symbolPath(def.symbol, def.size.width, def.size.height);
  const pinMarksPath = freeLibraryShape ? "" : def.type === "inverter"
    ? inverterSupplyLeadSymbol(def.size.width, def.size.height, visiblePinIds)
    : def.symbol === "plus"
    ? plusPinRoleSymbols(
        def.size.width,
        def.size.height,
        new Map(def.pins.map((pin) => [pin.id, {
          mode: componentPinMode(instance, pin.id),
          symbolVisible: componentPinSymbolVisible(instance, pin.id),
          visible: visiblePinIds.has(pin.id)
        }]))
      )
    : functionBlockModel
      ? functionBlockModel.leadPath
      : "";
  const levels = normalizeComparatorLevels(instance.values.levels ?? def.defaultValues?.levels);
  const gainPolarity = componentGainPolarity(instance);
  const tap = def.type === "inductor" ? inductorTap(instance) : "none";
  const accentPath = isPlanarInductor(instance)
    ? planarInductorBody(def.size.width, def.size.height, inductorLayout(instance))
    : dffModel
    ? dffAccentSymbol(def.size.width, def.size.height, dffModel, visiblePinIds)
    : tap !== "none" && !isPlanarInductor(instance)
      ? inductorCenterTapSymbol(def.size.width, def.size.height, tap)
    : accentPathForInstance(
        def,
        levels,
        differentialOutputsSame(instance),
        gainPolarity,
        clock
      ) ?? symbolAccentPath(def.symbol, def.size.width, def.size.height);
  const dotTerminal = def.type === "inductor" ? inductorDotTerminal(instance) : "none";
  const markerPath = polyline
    ? polyline.markers
    : isPlanarInductor(instance)
    ? planarInductorDot(def.size.width, def.size.height, dotTerminal)
    : dotTerminal !== "none"
    ? inductorDotMarkerSymbol(def.size.width, def.size.height, dotTerminal)
    : symbolMarkerPath(def.symbol, def.size.width, def.size.height);
  const clockBubblePath = dffModel
    ? ""
    : functionBlockModel
      ? functionBlockModel.clockBubblePath
      : clockBubblePathForInstance(def, clock);
  const selected = !!options.selected;
  const deleted = !!instance.temporarilyDeleted;
  const preview = !!options.preview;
  const frameBox = componentLocalFrameBox(instance);
  const symbolBox = componentSymbolBounds(def);
  const showPins = !freeLibraryShape && !options.presentationMode && !preview;
  const isAnnotation = def.symbol === "annotation";
  const showName = componentLabelVisible(instance);
  const displayValue = componentValueVisible(instance) ? componentDisplayValue(instance, def) : "";
  const analogBufferFamilyLabel = analogBufferFamilyLabelText(def.symbol, gainPolarity);
  const converterLabel = converterLabelText(def.symbol, visibleConverterBits);
  const symbolLabelText = analogBufferFamilyLabel || converterLabel;
  const vddLabelText = def.type === "vdd"
    ? `${showName ? instance.ref : ""}${showName && displayValue ? "\u00a0=\u00a0" : ""}${displayValue}`
    : "";
  const labelText = isAnnotation
    ? String(instance.values?.main ?? instance.ref)
    : vddLabelText || symbolLabelText;
  const converterValueEmbedded = isConverter && !!displayValue;
  const valueLabelText = def.type !== "vdd" && !converterValueEmbedded && displayValue
    ? `${showName ? "\u00a0=\u00a0" : ""}${displayValue}`
    : "";
  const refLabelAttrs = componentNameLabelAttrs(
    instance,
    def,
    frameBox,
    symbolBox,
    showName,
    valueLabelText,
    options.flipReferenceLabelSide
  );
  const showRefLabel = !freeLibraryShape
    && def.type !== "vdd"
    && (showName || (!converterValueEmbedded && !!displayValue))
    && !isAnnotation
    && !preview;
  const annotationFontSize = Number(instance.values?.fontSize ?? 13);
  const annotationAnchor = instance.values?.align === "start" ? "start" : instance.values?.align === "end" ? "end" : "middle";
  const annotationX = annotationAnchor === "start" ? 0 : annotationAnchor === "end" ? def.size.width : def.size.width / 2;
  const labelFontWeight = isAnnotation
    ? (instance.values?.weight === "bold" ? 700 : 400)
    : symbolLabelText || vddLabelText ? 700 : 400;
  const symbolLabelCenter = vddLabelText
    ? vddLabelCenter(instance, def, symbolBox, vddLabelText)
    : analogBufferFamilyLabel
      ? analogBufferLabelPosition(def.size.width, def.size.height, instance.mirrored)
      : converterLabel
        ? converterLabelPosition(def.symbol, def.size.width, def.size.height)
        : null;
  const labelFontSize = isAnnotation
    ? annotationFontSize
    : vddLabelText
      ? REF_LABEL_FONT_SIZE
      : analogBufferFamilyLabel
        ? ANALOG_BUFFER_LABEL_FONT_SIZE
        : converterLabel
          ? converterLabelFontSize(def.symbol, visibleConverterBits)
          : 13;
  const labelCenter = isAnnotation
    ? { x: annotationX, y: def.size.height / 2 }
    : symbolLabelCenter ?? { x: def.size.width / 2, y: def.size.height / 2 };
  const labelLayout = centeredTextLayout(
    labelCenter,
    labelFontSize,
    isAnnotation ? annotationAnchor : "middle",
    labelText.split("\n").length
  );
  const labelTransform = def.type === "vdd"
    ? componentNameTransform(instance, {
        x: labelCenter.x - frameBox.x,
        y: labelCenter.y - frameBox.y
      })
    : "";
  const color = preview ? "#005f9e" : deleted ? "#8a8a8a" : componentColor(instance);
  const symbolOpacity = preview ? 0.58 : deleted ? 0.46 : 1;
  const labelOpacity = preview ? 0.72 : deleted ? 0.62 : 1;

  return {
    componentId: instance.id,
    def,
    path,
    switchBladePath: preview || deleted || options.presentationMode ? ""
      : def.type === "switch"
        ? switchBladeSymbol(def.size.width, def.size.height, SYMBOL_STROKE_WIDTH, def.symbol === "switch-closed")
        : def.type === "spntSwitch"
          ? spntSwitchBladeSymbol(def.size.width, def.size.height, spntThrowCount(instance), spntPosition(instance))
          : "",
    accentPath,
    pinMarksPath,
    clockBubblePath,
    markerPath,
    symbolContentLayout: sourceWaveform
      ? voltageSourceWaveformContent(def.size.width, def.size.height, sourceWaveform, instance.rotation)
      : dffModel
      ? dffContentLayout(
          def.size.width,
          def.size.height,
          dffModel,
          visiblePinIds,
          instance.mirrored,
          instance.rotation
        )
      : functionBlockModel?.contentLayout ?? null,
    mirrored: instance.mirrored,
    selected,
    deleted,
    preview,
    resizeHandles: !!options.resizeHandles && freeLibraryShape && !preview && !options.presentationMode,
    frameBox,
    showPins,
    visiblePinIds,
    isAnnotation,
    showSymbolLabel: !freeLibraryShape && (!!symbolLabelText || !!vddLabelText || componentLabelVisible(instance)),
    labelText,
    refLabelAttrs,
    showRefLabel,
    refLabelPrefixFontSize: (def.type === "rectangle" || def.type === "triangle")
      ? RECTANGLE_REF_LABEL_FONT_SIZE
      : def.centeredRefLabel ? ANALOG_BUFFER_LABEL_FONT_SIZE : REF_LABEL_FONT_SIZE,
    refLabelHeadFontSize: (def.type === "rectangle" || def.type === "triangle")
      ? RECTANGLE_REF_LABEL_FONT_SIZE
      : def.centeredRefLabel ? ANALOG_BUFFER_LABEL_FONT_SIZE : REF_LABEL_FONT_SIZE,
    refLabelSignFontSize: def.centeredRefLabel ? CENTERED_REF_LABEL_SIGN_FONT_SIZE : REF_LABEL_FONT_SIZE,
    refLabelTailFontSize: (def.type === "rectangle" || def.type === "triangle")
      ? RECTANGLE_REF_LABEL_TAIL_FONT_SIZE
      : def.centeredRefLabel ? CENTERED_REF_LABEL_TAIL_FONT_SIZE : REF_LABEL_TAIL_FONT_SIZE,
    refLabelValueFontSize: def.centeredRefLabel ? CENTERED_REF_LABEL_TAIL_FONT_SIZE : REF_LABEL_FONT_SIZE,
    labelFontWeight,
    labelLayout,
    labelTransform,
    color,
    symbolOpacity,
    labelOpacity,
    ...(freeLibraryShape ? {
      symbolFill: shapeStyle.fillEnabled ? shapeStyle.fillColor : "none",
      symbolFillOpacity: shapeStyle.fillEnabled ? shapeStyle.fillOpacity : 1,
      symbolStrokeDasharray: LIBRARY_SHAPE_LINE_DASHARRAYS[shapeStyle.lineStyle]
    } : {}),
    symbolStrokeWidth: freeLibraryShape
      ? shapeStyle.strokeWidth
      : symbolStrokeWidth(def.symbol, SYMBOL_STROKE_WIDTH),
    accentStrokeWidth: symbolAccentStrokeWidth(def.symbol, SYMBOL_STROKE_WIDTH)
  };
}

function clockBubblePathForInstance(def: ComponentDef, clock: ComponentClock) {
  if (def.type === "adc" || def.type === "dac") {
    return converterClockBubbleSymbol(def.size.width, def.size.height, clock);
  }
  if (def.type === "comparator") {
    return comparatorClockBubbleSymbol(def.size.width, def.size.height, clock);
  }
  if (def.type === "diffComparator") {
    return differentialComparatorClockBubbleSymbol(def.size.width, def.size.height, clock);
  }
  if (def.type === "slicer") {
    return slicerClockBubbleSymbol(def.size.width, def.size.height, clock);
  }
  return "";
}

function accentPathForInstance(
  def: ComponentDef,
  levels: number,
  outputsSame: boolean,
  gainPolarity: GainPolarity,
  clock: ComponentClock
) {
  if (def.symbol === "analogBuffer-nonlinear") {
    return analogBufferNonlinearAccentSymbol(def.size.width, def.size.height, SYMBOL_STROKE_WIDTH, gainPolarity);
  }
  if (def.type === "comparator") {
    return comparatorAccentSymbol(
      def.size.width,
      def.size.height,
      levels,
      clock,
      SYMBOL_STROKE_WIDTH
    );
  }
  if (def.type === "diffComparator") {
    return differentialComparatorAccentSymbol(
      def.size.width,
      def.size.height,
      levels,
      outputsSame,
      clock
    );
  }
  if (def.type === "slicer") {
    return slicerAccentSymbol(def.size.width, def.size.height, levels, clock);
  }
  if (def.symbol === "differentialAmp") {
    return differentialAmpLeadSymbol(def.size.width, def.size.height, outputsSame);
  }
  if (def.symbol === "differentialOta") {
    return differentialOtaLeadSymbol(def.size.width, def.size.height, outputsSame);
  }
  return null;
}
