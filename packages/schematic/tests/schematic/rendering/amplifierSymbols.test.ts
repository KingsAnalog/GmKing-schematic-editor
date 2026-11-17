import { describe, expect, it } from "vitest";
import { resolveComponentAnalysisModel } from "../../../src/schematic/analysis/componentAnalysisRegistry";
import { getComponentDef, getComponentVariants, resolveComponentDef } from "../../../src/schematic/catalog";
import { ANALOG_BUFFER_LABEL_FONT_SIZE, makeComponentCell } from "../../../src/schematic/renderer";
import {
  componentCellPosition,
  componentCenterFromCellPosition,
  componentFrameBox,
  componentLocalFrameBox
} from "../../../src/schematic/view-geometry";
import { polarityMark, SYMBOL_STROKE_WIDTH } from "../../../src/schematic/symbols/symbolPrimitives";
import {
  analogBufferFamilyLabelText,
  analogBufferNonlinearAccentSymbol,
  analogBufferNonlinearCurveSymbol,
  batteryPlateStrokeWidth,
  batteryPlateSymbol,
  batterySymbol,
  analogBufferLabelPosition,
  analogBufferSymbol,
  analogBufferTriangleSymbol,
  bufferAccentStrokeWidth,
  comparatorAccentSymbol,
  comparatorBodySymbol,
  comparatorStaircaseSymbol,
  controlledSourceSymbol,
  differentialAmpBodySymbol,
  differentialComparatorAccentSymbol,
  differentialComparatorBodySymbol,
  differentialAmpLeadSymbol,
  differentialOtaBodySymbol,
  differentialOtaLeadSymbol,
  diffProbeFrameSymbol,
  diffProbeStrokeWidth,
  diffProbeSymbol,
  singleInputAmplifierBodySymbol,
  singleInputAmplifierLeadSymbol,
  impedanceBoxStrokeWidth,
  impedanceBoxSymbol,
  impedanceSymbol,
  inverterBubbleInnerDiameter,
  inverterBubbleRadius,
  inverterBubbleSymbol,
  inverterSymbol,
  inverterTriangleSymbol,
  inductorSymbol,
  iprobeFrameSymbol,
  iprobeStrokeWidth,
  iprobeSymbol,
  normalizeComparatorLevels,
  opAmpBodySymbol,
  otaBodySymbol,
  resistorSymbol,
  singleEndedAmpLeadSymbol,
  variableInverterSymbol,
  variableSymbolArrowMarkerSymbol
} from "../../../src/schematic/symbols/symbolBuilders";
import {
  symbolAccentPath,
  symbolAccentStrokeWidth,
  symbolMarkerPath,
  symbolPath,
  symbolStrokeWidth
} from "../../../src/schematic/symbols/symbolRegistry";
import { SYMBOL_GRID_SIZE } from "../../../src/schematic/types";
import { component } from "../support/testHelpers";

describe("schematic amplifier symbols", () => {
  it("maps component centers through frame-sized cells for rotation and mirroring", () => {
    const nmos = component("nmos", "MNframe", 100, 120, 90);
    const cell = makeComponentCell(nmos);
    const position = componentCellPosition(nmos);

    expect(cell.size()).toEqual({ width: 40, height: 80 });
    expect(cell.position()).toEqual(position);
    expect(componentCenterFromCellPosition(nmos, position)).toEqual({ x: 100, y: 120 });

    const mirrored = { ...nmos, mirrored: true };
    const mirroredCell = makeComponentCell(mirrored);
    const mirroredPosition = componentCellPosition(mirrored);
    expect(mirroredCell.size()).toEqual({ width: 40, height: 80 });
    expect(mirroredCell.position()).toEqual(mirroredPosition);
    expect(componentCenterFromCellPosition(mirrored, mirroredPosition)).toEqual({ x: 100, y: 120 });
    expect(mirroredCell.getPorts().map((port: { args: unknown }) => port.args)).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 40 },
      { x: 0, y: 80 }
    ]);
  });

  it("renders differential amplifier bodies and shared leads with stable four-port pins", () => {
    const diffAmp = getComponentDef("diffAmp");
    const diffOta = getComponentDef("diffOta");
    const bodyPath = symbolPath(diffAmp.symbol, diffAmp.size.width, diffAmp.size.height);
    const leadPath = symbolAccentPath(diffAmp.symbol, diffAmp.size.width, diffAmp.size.height);
    const diffOtaBodyPath = symbolPath(diffOta.symbol, diffOta.size.width, diffOta.size.height);
    const diffOtaLeadPath = symbolAccentPath(diffOta.symbol, diffOta.size.width, diffOta.size.height);
    const cx = diffAmp.size.width / 2;
    const cy = diffAmp.size.height / 2;

    expect(diffAmp.symbol).toBe("differentialAmp");
    expect(diffOta.symbol).toBe("differentialOta");
    expect(bodyPath).toBe(differentialAmpBodySymbol(diffAmp.size.width, diffAmp.size.height));
    expect(leadPath).toBe(differentialAmpLeadSymbol(diffAmp.size.width, diffAmp.size.height));
    expect(diffOtaBodyPath).toBe(differentialOtaBodySymbol(diffOta.size.width, diffOta.size.height));
    expect(diffOtaLeadPath).toBe(differentialOtaLeadSymbol(diffOta.size.width, diffOta.size.height));
    expect(diffAmp.pins.map((pin) => ({ id: pin.id, x: pin.x, y: pin.y }))).toEqual([
      { id: "inp", x: -80, y: -40 },
      { id: "inn", x: -80, y: 40 },
      { id: "outp", x: 60, y: -40 },
      { id: "outn", x: 60, y: 40 }
    ]);
    expect(diffOta.pins.map((pin) => ({ id: pin.id, x: pin.x, y: pin.y }))).toEqual(diffAmp.pins.map((pin) => ({ id: pin.id, x: pin.x, y: pin.y })));
    const oppositeInstance = component("diffAmp", "DA2", 100, 120);
    expect(oppositeInstance.values.differentialOutputsSame).toBeUndefined();
    const oppositeDef = resolveComponentDef(oppositeInstance);
    expect(oppositeDef.pins.map((pin) => ({ id: pin.id, role: pin.role, x: pin.x, y: pin.y }))).toEqual([
      { id: "inp", role: "ctrlP", x: -80, y: -40 },
      { id: "inn", role: "ctrlN", x: -80, y: 40 },
      { id: "outn", role: "outN", x: 60, y: -40 },
      { id: "outp", role: "outP", x: 60, y: 40 }
    ]);
    const oppositeCell = makeComponentCell(oppositeInstance);
    expect(String(oppositeCell.attr("symbolAccent/d"))).toBe(
      differentialAmpLeadSymbol(oppositeDef.size.width, oppositeDef.size.height, false)
    );
    expect(bodyPath).not.toContain(`M ${cx - 60} ${cy - 64} L ${cx + 68} ${cy} L ${cx - 60} ${cy + 64} Z`);
    expect(bodyPath).toBe(`M ${cx - 60} ${cy - 64} L ${cx + 60} ${cy} L ${cx - 60} ${cy + 64} Z`);
    expect(diffOtaBodyPath).toBe(`M ${cx - 60} ${cy - 64} L ${cx + 40} ${cy - 40} L ${cx + 40} ${cy + 40} L ${cx - 60} ${cy + 64} Z`);
    const samePolarityInstance = component("diffAmp", "DA3", 100, 120);
    samePolarityInstance.values.differentialOutputsSame = "true";
    const samePolarityDef = resolveComponentDef(samePolarityInstance);
    expect(samePolarityDef.pins.map((pin) => ({ id: pin.id, role: pin.role, x: pin.x, y: pin.y }))).toEqual([
      { id: "inp", role: "ctrlP", x: -80, y: -40 },
      { id: "inn", role: "ctrlN", x: -80, y: 40 },
      { id: "outp", role: "outP", x: 60, y: -40 },
      { id: "outn", role: "outN", x: 60, y: 40 }
    ]);
    expect(String(makeComponentCell(samePolarityInstance).attr("symbolAccent/d"))).toBe(
      differentialAmpLeadSymbol(
        samePolarityDef.size.width,
        samePolarityDef.size.height,
        true
      )
    );
    expect(componentFrameBox(diffAmp)).toEqual({ x: cx - 80, y: cy - 70, width: 140, height: 140 });
    expect(componentFrameBox(diffOta)).toEqual(componentFrameBox(diffAmp));
    expect(leadPath).toContain(`M ${cx - 80} ${cy - 40} L ${cx - 60} ${cy - 40}`);
    expect(leadPath).toContain(`M ${cx - 80} ${cy + 40} L ${cx - 60} ${cy + 40}`);
    const topOutputBodyX = cx - 60 + ((cy - 40 - (cy - 64)) / 64) * 120;
    const bottomOutputBodyX = cx - 60 + (((cy + 64) - (cy + 40)) / 64) * 120;
    expect(leadPath).toContain(`M ${topOutputBodyX} ${cy - 40} L ${cx + 60} ${cy - 40}`);
    expect(leadPath).toContain(`M ${bottomOutputBodyX} ${cy + 40} L ${cx + 60} ${cy + 40}`);
    expect(diffOtaLeadPath).toContain(`M ${cx + 40} ${cy - 40} L ${cx + 60} ${cy - 40}`);
    expect(diffOtaLeadPath).toContain(`M ${cx + 40} ${cy + 40} L ${cx + 60} ${cy + 40}`);
    expect(leadPath).not.toContain(`M ${cx + 68} ${cy} L ${cx + 80} ${cy}`);
    expect(leadPath).toContain(`M ${cx - 49} ${cy - 40} L ${cx - 35} ${cy - 40}`);
    expect(leadPath).toContain(`M ${cx - 11} ${cy - 22} L ${cx + 3} ${cy - 22}`);
    expect(leadPath).toContain(`M ${cx - 11} ${cy + 22} L ${cx + 3} ${cy + 22}`);
    expect(leadPath).toContain(`M ${cx - 4} ${cy - 29} L ${cx - 4} ${cy - 15}`);
    const oppositeLeadPath = differentialAmpLeadSymbol(diffAmp.size.width, diffAmp.size.height, false);
    expect(oppositeLeadPath).toContain(`M ${cx - 4} ${cy + 15} L ${cx - 4} ${cy + 29}`);
    expect(diffOta.label).toBe("DOTA");
    expect(diffOta.hotLabel).toBe("diffota");
  });

  it("renders the inverter with a 28a outer triangle base, 22a outer height, and 4a output bubble inner diameter", () => {
    const inverter = getComponentDef("inverter");
    const a = SYMBOL_STROKE_WIDTH;
    const cx = inverter.size.width / 2;
    const cy = inverter.size.height / 2;
    const bodyHeight = 26 * a;
    const triangleWidth = 20 * a;
    const accentStrokeWidth = bufferAccentStrokeWidth();
    const innerTangencyGuard = 0.5 * a;
    const bubbleRadius = inverterBubbleRadius();
    const bodyLeftX = cx - (triangleWidth + 2 * bubbleRadius + innerTangencyGuard) / 2;
    const bodyApexX = bodyLeftX + triangleWidth;
    const bubbleCx = bodyApexX + bubbleRadius + innerTangencyGuard;

    expect(inverter.symbol).toBe("inverter");
    expect(resolveComponentAnalysisModel(component("inverter", "X1", 0, 0))).toBe("annotation");
    expect(inverter.pins.map((pin) => ({ id: pin.id, role: pin.role, x: pin.x, y: pin.y }))).toEqual([
      { id: "in", role: "in", x: -40, y: 0 },
      { id: "out", role: "out", x: 40, y: 0 },
      { id: "vdd", role: "p", x: 0, y: -20 },
      { id: "gnd", role: "n", x: 0, y: 20 }
    ]);
    const trianglePaintedTipX = bodyApexX + accentStrokeWidth / 2;
    const bubblePaintedLeftX = bubbleCx - bubbleRadius - accentStrokeWidth / 2;
    const bubbleInnerLeftX = bubbleCx - bubbleRadius + accentStrokeWidth / 2;

    expect(accentStrokeWidth).toBe(2 * a);
    expect(inverterBubbleInnerDiameter()).toBe(4 * a);
    expect(inverterBubbleRadius()).toBe(3 * a);
    expect(2 * (bubbleRadius - accentStrokeWidth / 2)).toBe(4 * a);
    expect(trianglePaintedTipX).toBeGreaterThan(bubblePaintedLeftX);
    expect(bubbleInnerLeftX - trianglePaintedTipX).toBe(innerTangencyGuard);
    expect(trianglePaintedTipX).toBeLessThan(bubbleInnerLeftX);
    expect(bodyHeight).toBe(26 * a);
    expect(triangleWidth).toBe(20 * a);
    expect(bodyHeight + accentStrokeWidth).toBe(28 * a);
    expect(triangleWidth + accentStrokeWidth).toBe(22 * a);
    expect(symbolPath(inverter.symbol, inverter.size.width, inverter.size.height)).toBe(inverterSymbol(inverter.size.width, inverter.size.height));
    expect(symbolAccentPath(inverter.symbol, inverter.size.width, inverter.size.height)).toBe(
      `${inverterTriangleSymbol(inverter.size.width, inverter.size.height)} ${inverterBubbleSymbol(inverter.size.width, inverter.size.height)}`
    );
    expect(inverterSymbol(inverter.size.width, inverter.size.height)).toBe(
      `M ${cx - 40} ${cy} L ${bodyLeftX} ${cy} M ${bubbleCx + bubbleRadius} ${cy} L ${cx + 40} ${cy}`
    );
    expect(inverterTriangleSymbol(inverter.size.width, inverter.size.height)).toBe(
      `M ${bodyLeftX} ${cy - bodyHeight / 2} L ${bodyApexX} ${cy} L ${bodyLeftX} ${cy + bodyHeight / 2} Z`
    );
    expect(inverterBubbleSymbol(inverter.size.width, inverter.size.height)).toBe(
      `M ${bubbleCx + bubbleRadius} ${cy} A ${bubbleRadius} ${bubbleRadius} 0 1 1 ${bubbleCx - bubbleRadius} ${cy} A ${bubbleRadius} ${bubbleRadius} 0 1 1 ${bubbleCx + bubbleRadius} ${cy}`
    );

    const inverterCell = makeComponentCell(component("inverter", "X1", 100, 120));
    expect(String(inverterCell.attr("symbolBody/d"))).toBe(inverterSymbol(inverter.size.width, inverter.size.height));
    expect(String(inverterCell.attr("symbolAccent/d"))).toBe(`${inverterTriangleSymbol(inverter.size.width, inverter.size.height)} ${inverterBubbleSymbol(inverter.size.width, inverter.size.height)}`);
    expect(inverterCell.attr("symbolBody/strokeWidth")).toBe(a);
    expect(inverterCell.attr("symbolAccent/strokeWidth")).toBe(2 * a);
  });

  it("renders the inverter Variable view with the shared tunable arrow", () => {
    const inverter = getComponentDef("inverter");
    const variable = component("inverter", "X1", 100, 120);
    variable.variantId = "variable";
    const resolved = resolveComponentDef(variable);
    const cell = makeComponentCell(variable);

    expect(getComponentVariants("inverter").map(({ id, label }) => ({ id, label }))).toEqual([
      { id: "fixed", label: "Fixed" },
      { id: "variable", label: "Variable" }
    ]);
    expect(resolved.symbol).toBe("inverter-variable");
    expect(symbolPath(resolved.symbol, inverter.size.width, inverter.size.height)).toBe(
      variableInverterSymbol(inverter.size.width, inverter.size.height)
    );
    expect(variableInverterSymbol(inverter.size.width, inverter.size.height)).toContain(
      `M ${inverter.size.width / 2 - 16 * SYMBOL_STROKE_WIDTH} ${inverter.size.height / 2 + 16 * SYMBOL_STROKE_WIDTH} L `
    );
    expect(symbolMarkerPath(resolved.symbol, inverter.size.width, inverter.size.height)).toBe(
      variableSymbolArrowMarkerSymbol(inverter.size.width, inverter.size.height)
    );
    expect(String(cell.attr("symbolBody/d"))).toBe(
      variableInverterSymbol(inverter.size.width, inverter.size.height)
    );
    expect(String(cell.attr("symbolAccent/d"))).toBe(
      `${inverterTriangleSymbol(inverter.size.width, inverter.size.height)} ${inverterBubbleSymbol(inverter.size.width, inverter.size.height)}`
    );
    expect(cell.attr("symbolMarker/fill")).toBe("#111111");
    expect(cell.attr("symbolMarker/stroke")).toBe("none");
  });

  it("renders buffer and amp triangles plus the gm trapezoid", () => {
    const digital = getComponentDef("digitalBuffer");
    const analog = getComponentDef("analogBuffer");
    const amp = getComponentDef("amp");
    const gm = getComponentDef("gm");
    const a = SYMBOL_STROKE_WIDTH;
    const cx = analog.size.width / 2;
    const cy = analog.size.height / 2;
    const expectedPins = [
      { id: "in", role: "in", x: -40, y: 0 },
      { id: "out", role: "out", x: 40, y: 0 }
    ];

    expect(digital.size).toEqual(getComponentDef("inverter").size);
    expect(analog.size).toEqual(digital.size);
    expect(amp.size).toEqual(analog.size);
    expect(gm.size).toEqual(analog.size);
    expect(amp.valuePrefix).toBe("A");
    expect(gm.valuePrefix).toBe("Gm");
    expect(gm.symbol).toBe("singleInputGm");
    expect(amp.pins.map((pin) => ({ id: pin.id, role: pin.role, x: pin.x, y: pin.y }))).toEqual(expectedPins);
    expect(gm.pins.map((pin) => ({ id: pin.id, role: pin.role, x: pin.x, y: pin.y }))).toEqual(expectedPins);
    expect(symbolPath(amp.symbol, amp.size.width, amp.size.height)).toBe(analogBufferSymbol(amp.size.width, amp.size.height));
    expect(symbolPath(gm.symbol, gm.size.width, gm.size.height)).toBe(singleInputAmplifierLeadSymbol(gm.size.width, gm.size.height));
    expect(symbolAccentPath(amp.symbol, amp.size.width, amp.size.height)).toBe(analogBufferTriangleSymbol(amp.size.width, amp.size.height));
    expect(symbolAccentPath(gm.symbol, gm.size.width, gm.size.height)).toBe(singleInputAmplifierBodySymbol(gm.size.width, gm.size.height));
    expect(singleInputAmplifierLeadSymbol(amp.size.width, amp.size.height)).toBe(
      `M ${cx - 40} ${cy} L ${cx - 15 * a} ${cy} M ${cx + 15 * a} ${cy} L ${cx + 40} ${cy}`
    );
    expect(singleInputAmplifierBodySymbol(amp.size.width, amp.size.height)).toBe(
      `M ${cx - 15 * a} ${cy - 20 * a} L ${cx + 15 * a} ${cy - 10 * a} L ${cx + 15 * a} ${cy + 10 * a} L ${cx - 15 * a} ${cy + 20 * a} Z`
    );

    const analogCell = makeComponentCell(component("analogBuffer", "X1", 100, 120));
    const mirroredAnalog = component("analogBuffer", "Xmirror", 100, 120);
    mirroredAnalog.mirrored = true;
    const mirroredAnalogCell = makeComponentCell(mirroredAnalog);
    const negativeBuffer = component("analogBuffer", "X2", 100, 120);
    negativeBuffer.values.gainPolarity = "negative";
    const negativeBufferCell = makeComponentCell(negativeBuffer);
    const nonlinearBuffer = component("analogBuffer", "X3", 100, 120);
    nonlinearBuffer.variantId = "nonlinear";
    const nonlinearDef = resolveComponentDef(nonlinearBuffer);
    const nonlinearBufferCell = makeComponentCell(nonlinearBuffer);
    const ampCell = makeComponentCell(component("amp", "A1", 100, 120));
    const gmCell = makeComponentCell(component("gm", "Gm1", 100, 120));
    const ampFrame = componentFrameBox(amp);

    expect(analogCell.attr("label/text")).toBe("\u00d71");
    const analogFrame = componentLocalFrameBox(component("analogBuffer", "Xframe", 100, 120));
    const mirroredAnalogFrame = componentLocalFrameBox(mirroredAnalog);
    const normalLabelPosition = analogBufferLabelPosition(analog.size.width, analog.size.height);
    const mirroredLabelPosition = analogBufferLabelPosition(analog.size.width, analog.size.height, true);
    expect(analogCell.attr("label/x")).toBe(normalLabelPosition.x - analogFrame.x);
    expect(mirroredAnalogCell.attr("label/x")).toBe(mirroredLabelPosition.x - mirroredAnalogFrame.x);
    expect(normalLabelPosition.x + mirroredLabelPosition.x).toBe(analog.size.width);
    expect(mirroredAnalogCell.attr("label/text")).toBe("\u00d71");
    expect(negativeBufferCell.attr("label/text")).toBe("−1");
    expect(analog.variants?.map((variant) => [variant.id, variant.label])).toEqual([
      ["linear", "Linear"],
      ["nonlinear", "Nonlinear"]
    ]);
    expect(nonlinearDef.symbol).toBe("analogBuffer-nonlinear");
    expect(nonlinearBufferCell.attr("label/text")).toBe("");
    expect(String(nonlinearBufferCell.attr("symbolAccent/d"))).toBe(
      analogBufferNonlinearAccentSymbol(nonlinearDef.size.width, nonlinearDef.size.height)
    );
    const nonlinearCurve = analogBufferNonlinearCurveSymbol(nonlinearDef.size.width, nonlinearDef.size.height);
    expect(nonlinearCurve.match(/\bC\b/g)).toHaveLength(1);
    const [x0, y0, control1X, control1Y, control2X, control2Y, x1, y1] =
      (nonlinearCurve.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    const [leftX, topY, apexX, centerY, , bottomY] =
      (analogBufferTriangleSymbol(nonlinearDef.size.width, nonlinearDef.size.height)
        .match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
    expect(x1 - x0).toBe(14 * SYMBOL_STROKE_WIDTH);
    expect(y0 - y1).toBe(9 * SYMBOL_STROKE_WIDTH);
    expect(control1X - x0).toBe(5 * SYMBOL_STROKE_WIDTH);
    expect(x1 - control2X).toBe(5 * SYMBOL_STROKE_WIDTH);
    expect((x0 + x1) / 2).toBe((leftX + apexX) / 2 - 4.5 * SYMBOL_STROKE_WIDTH);
    const cubicDerivativeAtHalf = (start: number, control1: number, control2: number, end: number) => {
      const t = 0.5;
      return 3 * (1 - t) ** 2 * (control1 - start)
        + 6 * (1 - t) * t * (control2 - control1)
        + 3 * t ** 2 * (end - control2);
    };
    const centerDx = cubicDerivativeAtHalf(x0, control1X, control2X, x1);
    const centerDy = cubicDerivativeAtHalf(y0, control1Y, control2Y, y1);
    expect(Math.abs(centerDy / centerDx)).toBeCloseTo(1, 12);
    const triangle = [
      { x: leftX, y: topY },
      { x: apexX, y: centerY },
      { x: leftX, y: bottomY }
    ];
    const curveHull = [
      { x: x0, y: y0 },
      { x: control1X, y: control1Y },
      { x: control2X, y: control2Y },
      { x: x1, y: y1 }
    ];
    triangle.forEach((start, index) => {
      const end = triangle[(index + 1) % triangle.length];
      const edgeLength = Math.hypot(end.x - start.x, end.y - start.y);
      curveHull.forEach((point) => {
        const inwardDistance = (
          (end.x - start.x) * (point.y - start.y)
          - (end.y - start.y) * (point.x - start.x)
        ) / edgeLength;
        expect(inwardDistance).toBeGreaterThanOrEqual(bufferAccentStrokeWidth());
      });
    });
    expect(analogBufferFamilyLabelText(analog.symbol, "positive")).toBe("+1");
    expect(analogBufferFamilyLabelText(analog.symbol, "negative")).toBe("−1");
    expect(ampCell.attr("label/text")).toBe("");
    expect(ampCell.attr("centeredRefLabelHead/text")).toBe("A");
    expect(ampCell.attr("centeredRefLabelTail/text")).toBe("1");
    expect(gmCell.attr("centeredRefLabelHead/text")).toBe("G");
    expect(gmCell.attr("centeredRefLabelTail/text")).toBe("m1");
    expect(ampCell.attr("centeredRefLabel/x")).toBe(analogBufferLabelPosition(amp.size.width, amp.size.height).x - ampFrame.x);
    expect(ampCell.attr("centeredRefLabel/y")).toBe(cy - ampFrame.y + ANALOG_BUFFER_LABEL_FONT_SIZE * 0.35);
    expect(ampCell.attr("centeredRefLabelHead/fontStyle")).toBe("italic");
    expect(ampCell.attr("centeredRefLabelHead/fontSize")).toBe(ANALOG_BUFFER_LABEL_FONT_SIZE);
    expect(ampCell.attr("symbolBody/strokeWidth")).toBe(a);
    expect(ampCell.attr("symbolAccent/strokeWidth")).toBe(2 * a);
    const idealGm = getComponentDef("idealGm");
    expect(idealGm.symbol).toBe("diamond");
    expect(symbolPath(idealGm.symbol, idealGm.size.width, idealGm.size.height)).toBe(
      controlledSourceSymbol(idealGm.size.width, idealGm.size.height)
    );
  });

  it("renders the op amp triangle with 50a outer base and height", () => {
    const opAmp = getComponentDef("opAmp");
    const ota = getComponentDef("ota");
    const opAmpCell = makeComponentCell(component("opAmp", "OA1", 100, 120));
    const otaCell = makeComponentCell(component("ota", "Gm1", 100, 120));
    const a = SYMBOL_STROKE_WIDTH;
    const cx = opAmp.size.width / 2;
    const cy = opAmp.size.height / 2;
    const strokeWidth = 2 * a;
    const outerLength = 50 * a;
    const centerlineLength = outerLength - strokeWidth;
    const leftX = cx - 2 * SYMBOL_GRID_SIZE;
    const apexX = leftX + centerlineLength;
    const topY = cy - centerlineLength / 2;
    const bottomY = cy + centerlineLength / 2;
    const inputX = cx - 3 * SYMBOL_GRID_SIZE;
    const outputX = cx + 4 * SYMBOL_GRID_SIZE;
    const inputSignX = leftX + 9 * a;
    const inputSignHalf = 3.5 * a;
    const expectedOpAmpPath = `M ${leftX} ${topY} L ${apexX} ${cy} L ${leftX} ${bottomY} Z`;
    const expectedOtaPath = `M ${leftX} ${topY} L ${apexX} ${cy - SYMBOL_GRID_SIZE} L ${apexX} ${cy + SYMBOL_GRID_SIZE} L ${leftX} ${bottomY} Z`;
    const expectedOpAmpLeads = [
      `M ${inputX} ${cy - SYMBOL_GRID_SIZE} L ${leftX} ${cy - SYMBOL_GRID_SIZE}`,
      `M ${inputX} ${cy + SYMBOL_GRID_SIZE} L ${leftX} ${cy + SYMBOL_GRID_SIZE}`,
      `M ${apexX} ${cy} L ${outputX} ${cy}`,
      polarityMark("plus", inputSignX, cy - SYMBOL_GRID_SIZE, inputSignHalf),
      polarityMark("minus", inputSignX, cy + SYMBOL_GRID_SIZE, inputSignHalf)
    ].join(" ");
    expect(symbolStrokeWidth(opAmp.symbol)).toBe(2 * SYMBOL_STROKE_WIDTH);
    expect(symbolAccentStrokeWidth(opAmp.symbol)).toBe(SYMBOL_STROKE_WIDTH);
    expect(opAmpCell.attr("symbolBody/strokeWidth")).toBe(2 * SYMBOL_STROKE_WIDTH);
    expect(opAmpCell.attr("symbolAccent/strokeWidth")).toBe(SYMBOL_STROKE_WIDTH);
    expect(symbolStrokeWidth(ota.symbol)).toBe(2 * SYMBOL_STROKE_WIDTH);
    expect(symbolAccentStrokeWidth(ota.symbol)).toBe(SYMBOL_STROKE_WIDTH);
    expect(otaCell.attr("symbolBody/strokeWidth")).toBe(2 * SYMBOL_STROKE_WIDTH);
    expect(otaCell.attr("symbolAccent/strokeWidth")).toBe(SYMBOL_STROKE_WIDTH);
    expect(symbolPath(opAmp.symbol, opAmp.size.width, opAmp.size.height)).toBe(opAmpBodySymbol(opAmp.size.width, opAmp.size.height));
    expect(symbolAccentPath(opAmp.symbol, opAmp.size.width, opAmp.size.height)).toBe(singleEndedAmpLeadSymbol(opAmp.size.width, opAmp.size.height));
    expect(symbolPath(ota.symbol, ota.size.width, ota.size.height)).toBe(otaBodySymbol(ota.size.width, ota.size.height));
    expect(symbolAccentPath(ota.symbol, ota.size.width, ota.size.height)).toBe(singleEndedAmpLeadSymbol(ota.size.width, ota.size.height));
    expect(opAmpBodySymbol(opAmp.size.width, opAmp.size.height)).toBe(expectedOpAmpPath);
    expect(otaBodySymbol(ota.size.width, ota.size.height)).toBe(expectedOtaPath);
    expect(singleEndedAmpLeadSymbol(opAmp.size.width, opAmp.size.height)).toBe(expectedOpAmpLeads);
    expect(String(opAmpCell.attr("symbolBody/d"))).toBe(expectedOpAmpPath);
    expect(String(opAmpCell.attr("symbolAccent/d"))).toBe(expectedOpAmpLeads);
    expect(String(otaCell.attr("symbolBody/d"))).toBe(expectedOtaPath);
    expect(String(otaCell.attr("symbolAccent/d"))).toBe(expectedOpAmpLeads);
    const opAmpFrame = componentFrameBox(opAmp);
    expect(opAmpCell.prop("ports/items")).toEqual([
      { id: "inp", group: "pin", args: { x: inputX - opAmpFrame.x, y: cy - SYMBOL_GRID_SIZE - opAmpFrame.y }, attrs: { portBody: { title: "+" } } },
      { id: "inn", group: "pin", args: { x: inputX - opAmpFrame.x, y: cy + SYMBOL_GRID_SIZE - opAmpFrame.y }, attrs: { portBody: { title: "-" } } },
      { id: "out", group: "pin", args: { x: outputX - opAmpFrame.x, y: cy - opAmpFrame.y }, attrs: { portBody: { title: "out" } } }
    ]);
    expect(componentFrameBox(ota)).toEqual(opAmpFrame);
    expect(otaCell.prop("ports/items")).toEqual(opAmpCell.prop("ports/items"));
    expect(centerlineLength + strokeWidth).toBe(50 * a);
    expect(leftX - cx).toBe(-2 * SYMBOL_GRID_SIZE);
    expect(opAmp.pins.map((pin) => ({ id: pin.id, x: pin.x, y: pin.y }))).toEqual([
      { id: "inp", x: -60, y: -20 },
      { id: "inn", x: -60, y: 20 },
      { id: "out", x: 80, y: 0 }
    ]);
    expect(ota.label).toBe("OTA");
    expect(ota.hotLabel).toBe("ota");
    expect(ota.pins.map((pin) => ({ id: pin.id, x: pin.x, y: pin.y }))).toEqual(opAmp.pins.map((pin) => ({ id: pin.id, x: pin.x, y: pin.y })));

    const diffAmp = getComponentDef("diffAmp");
    const diffAmpCell = makeComponentCell(component("diffAmp", "DA1", 100, 120));
    expect(symbolStrokeWidth(diffAmp.symbol)).toBe(2 * SYMBOL_STROKE_WIDTH);
    expect(symbolAccentStrokeWidth(diffAmp.symbol)).toBe(SYMBOL_STROKE_WIDTH);
    expect(diffAmpCell.attr("symbolBody/strokeWidth")).toBe(2 * SYMBOL_STROKE_WIDTH);
    expect(diffAmpCell.attr("symbolAccent/strokeWidth")).toBe(SYMBOL_STROKE_WIDTH);

    const resistor = getComponentDef("resistor");
    const resistorCell = makeComponentCell(component("resistor", "Rstroke", 100, 120));
    const resistorPath = "M 10 28 L 38.08 28 L 40.62 20.77 L 44.46 35.23 L 48.38 20.77 L 52.23 35.23 L 56.08 20.77 L 60 35.23 L 61.92 28 L 90 28";
    expect(symbolStrokeWidth(resistor.symbol)).toBe(SYMBOL_STROKE_WIDTH);
    expect(resistorCell.attr("symbolBody/strokeWidth")).toBe(SYMBOL_STROKE_WIDTH);
    expect(symbolPath(resistor.symbol, resistor.size.width, resistor.size.height)).toBe(resistorSymbol(resistor.size.width, resistor.size.height));
    expect(String(resistorCell.attr("symbolBody/d"))).toBe(resistorSymbol(resistor.size.width, resistor.size.height));
    expect(resistorSymbol(resistor.size.width, resistor.size.height)).toBe(resistorPath);

    const inductor = getComponentDef("inductor");
    const inductorCell = makeComponentCell(component("inductor", "Lstroke", 100, 120));
    const inductorPath = inductorSymbol(inductor.size.width, inductor.size.height);
    expect(symbolStrokeWidth(inductor.symbol)).toBe(SYMBOL_STROKE_WIDTH);
    expect(inductorCell.attr("symbolBody/strokeWidth")).toBe(SYMBOL_STROKE_WIDTH);
    expect(symbolPath(inductor.symbol, inductor.size.width, inductor.size.height)).toBe(inductorPath);
    expect(String(inductorCell.attr("symbolBody/d"))).toBe(inductorPath);
    expect(inductorPath.startsWith("M 90 28 L ")).toBe(true);
    expect(inductorPath).toContain(" L 10 28 M ");
    expect(inductorPath).not.toContain("C 26 8, 32 8, 32 28");
    expect((inductorPath.match(/ C /g) ?? []).length).toBe(15);
    expect((inductorPath.match(/M /g) ?? []).length).toBe(4);
  });

  it("renders battery plates scaled into a 4-by-2 grid while preserving the 25:13 ratio", () => {
    const battery = getComponentDef("battery");
    const a = SYMBOL_STROKE_WIDTH;
    const cx = battery.size.width / 2;
    const cy = battery.size.height / 2;
    const plateStrokeWidth = 2 * a;
    const visibleGap = 3 * a;
    const centerHalfDistance = (visibleGap + plateStrokeWidth) / 2;
    const leftPlateX = cx - centerHalfDistance;
    const rightPlateX = cx + centerHalfDistance;
    const longHalfLength = (18 * a) / 2;
    const shortHalfLength = ((18 * a) * 13) / 25 / 2;
    const batteryCell = makeComponentCell(component("battery", "Vbat", 100, 120));

    expect(symbolPath(battery.symbol, battery.size.width, battery.size.height)).toBe(batterySymbol(battery.size.width, battery.size.height));
    expect(symbolAccentPath(battery.symbol, battery.size.width, battery.size.height)).toBe(batteryPlateSymbol(battery.size.width, battery.size.height));
    expect(batterySymbol(battery.size.width, battery.size.height)).toBe(`M 10 ${cy} L ${leftPlateX} ${cy} M ${rightPlateX} ${cy} L 90 ${cy}`);
    expect(batteryPlateSymbol(battery.size.width, battery.size.height)).toBe(
      `M ${leftPlateX} ${cy - longHalfLength} L ${leftPlateX} ${cy + longHalfLength} M ${rightPlateX} ${cy - shortHalfLength} L ${rightPlateX} ${cy + shortHalfLength}`
    );
    expect(rightPlateX - leftPlateX - plateStrokeWidth).toBe(visibleGap);
    expect((shortHalfLength * 2) / (longHalfLength * 2)).toBe(13 / 25);
    expect(componentFrameBox(resolveComponentDef("battery"))).toEqual({ x: 10, y: 8, width: 80, height: 40 });
    expect(batteryPlateStrokeWidth()).toBe(plateStrokeWidth);
    expect(symbolStrokeWidth(battery.symbol)).toBe(a);
    expect(symbolAccentStrokeWidth(battery.symbol)).toBe(plateStrokeWidth);
    expect(batteryCell.attr("symbolBody/strokeWidth")).toBe(a);
    expect(batteryCell.attr("symbolAccent/strokeWidth")).toBe(plateStrokeWidth);
  });

  it("renders iprobe with a 2a rectangular frame and 1a internal triangle", () => {
    const iprobe = getComponentDef("iprobe");
    const a = SYMBOL_STROKE_WIDTH;
    const cx = iprobe.size.width / 2;
    const cy = iprobe.size.height / 2;
    const left = cx - 8 * a;
    const right = cx + 8 * a;
    const top = cy - 6 * a;
    const bottom = cy + 6 * a;
    const triangleLeftX = cx - 3 * a;
    const triangleTipX = cx + 4 * a;
    const triangleTopY = cy - 4 * a;
    const triangleBottomY = cy + 4 * a;
    const iprobeCell = makeComponentCell(component("iprobe", "IP1", 100, 120));

    expect(symbolPath(iprobe.symbol, iprobe.size.width, iprobe.size.height)).toBe(iprobeSymbol(iprobe.size.width, iprobe.size.height));
    expect(symbolAccentPath(iprobe.symbol, iprobe.size.width, iprobe.size.height)).toBe(iprobeFrameSymbol(iprobe.size.width, iprobe.size.height));
    expect(iprobeSymbol(iprobe.size.width, iprobe.size.height)).toBe(
      `M 10 ${cy} L ${left} ${cy} M ${right} ${cy} L 90 ${cy} M ${triangleLeftX} ${triangleTopY} L ${triangleTipX} ${cy} L ${triangleLeftX} ${triangleBottomY} Z`
    );
    expect(iprobeFrameSymbol(iprobe.size.width, iprobe.size.height)).toBe(
      `M ${left} ${top} L ${right} ${top} L ${right} ${bottom} L ${left} ${bottom} Z`
    );
    expect(iprobeStrokeWidth()).toBe(2 * a);
    expect(symbolStrokeWidth(iprobe.symbol)).toBe(a);
    expect(symbolAccentStrokeWidth(iprobe.symbol)).toBe(2 * a);
    expect(iprobeCell.attr("symbolBody/strokeWidth")).toBe(a);
    expect(iprobeCell.attr("symbolAccent/strokeWidth")).toBe(2 * a);
  });

  it("renders a differential voltage probe with plus and minus measurement terminals", () => {
    const probe = getComponentDef("diffProbe");
    const a = SYMBOL_STROKE_WIDTH;
    const cx = probe.size.width / 2;
    const cy = probe.size.height / 2;
    const left = cx - 9 * a;
    const right = cx + 9 * a;
    const top = cy - 6 * a;
    const bottom = cy + 6 * a;
    const probeCell = makeComponentCell(component("diffProbe", "VP1", 100, 120));

    expect(diffProbeSymbol(probe.size.width, probe.size.height)).toBe([
      `M 10 ${cy} L ${left} ${cy}`,
      `M ${right} ${cy} L 90 ${cy}`,
      polarityMark("plus", cx - 4 * a, cy, 3 * a),
      polarityMark("minus", cx + 4 * a, cy, 3 * a)
    ].join(" "));
    expect(diffProbeFrameSymbol(probe.size.width, probe.size.height)).toBe(
      `M ${left} ${top} L ${right} ${top} L ${right} ${bottom} L ${left} ${bottom} Z`
    );
    expect(diffProbeStrokeWidth()).toBe(2 * a);
    expect(probeCell.attr("symbolBody/d")).toBe(diffProbeSymbol(probe.size.width, probe.size.height));
    expect(probeCell.attr("symbolAccent/d")).toBe(diffProbeFrameSymbol(probe.size.width, probe.size.height));
    expect(resolveComponentAnalysisModel(component("diffProbe", "VP2", 0, 0))).toBe("annotation");
  });

  it("renders impedance as a 2a rectangle with 19a by 6a internal dimensions", () => {
    const impedance = getComponentDef("impedance");
    const a = SYMBOL_STROKE_WIDTH;
    const cx = impedance.size.width / 2;
    const cy = impedance.size.height / 2;
    const strokeWidth = 2 * a;
    const innerWidth = 19 * a;
    const innerHeight = 6 * a;
    const centerlineWidth = innerWidth + strokeWidth;
    const centerlineHeight = innerHeight + strokeWidth;
    const left = cx - centerlineWidth / 2;
    const right = cx + centerlineWidth / 2;
    const top = cy - centerlineHeight / 2;
    const bottom = cy + centerlineHeight / 2;
    const impedanceCell = makeComponentCell(component("impedance", "Z1", 100, 120));

    expect(symbolPath(impedance.symbol, impedance.size.width, impedance.size.height)).toBe(impedanceSymbol(impedance.size.width, impedance.size.height));
    expect(symbolAccentPath(impedance.symbol, impedance.size.width, impedance.size.height)).toBe(impedanceBoxSymbol(impedance.size.width, impedance.size.height));
    expect(impedanceSymbol(impedance.size.width, impedance.size.height)).toBe(`M 10 ${cy} L ${left} ${cy} M ${right} ${cy} L 90 ${cy}`);
    expect(impedanceBoxSymbol(impedance.size.width, impedance.size.height)).toBe(
      `M ${left} ${top} L ${right} ${top} L ${right} ${bottom} L ${left} ${bottom} Z`
    );
    expect(right - left - strokeWidth).toBe(innerWidth);
    expect(bottom - top - strokeWidth).toBe(innerHeight);
    expect(impedanceBoxStrokeWidth()).toBe(strokeWidth);
    expect(symbolStrokeWidth(impedance.symbol)).toBe(a);
    expect(symbolAccentStrokeWidth(impedance.symbol)).toBe(strokeWidth);
    expect(componentFrameBox(resolveComponentDef("impedance"))).toEqual({ x: 10, y: 18, width: 80, height: 20 });
    expect(impedanceCell.attr("symbolBody/strokeWidth")).toBe(a);
    expect(impedanceCell.attr("symbolAccent/strokeWidth")).toBe(strokeWidth);
  });

  it("renders comparator symbols as op-amp bodies with 1a threshold-bar accents", () => {
    const comparator = getComponentDef("comparator");
    const diffComparator = getComponentDef("diffComparator");
    const clockedComparator = component("comparator", "CMP5", 100, 120);
    clockedComparator.values.clock = "rising";
    clockedComparator.values.levels = "5";
    const clockedDiffComparator = component("diffComparator", "DCMP5", 260, 120);
    clockedDiffComparator.values.clock = "rising";
    clockedDiffComparator.values.levels = "5";
    const resolvedClockedComparator = resolveComponentDef(clockedComparator);
    const resolvedClockedDiffComparator = resolveComponentDef(clockedDiffComparator);
    const comparatorCell = makeComponentCell(clockedComparator);
    const diffComparatorCell = makeComponentCell(clockedDiffComparator);

    expect(symbolPath(comparator.symbol, comparator.size.width, comparator.size.height)).toBe(
      comparatorBodySymbol(comparator.size.width, comparator.size.height)
    );
    expect(symbolPath(diffComparator.symbol, diffComparator.size.width, diffComparator.size.height)).toBe(
      differentialComparatorBodySymbol(diffComparator.size.width, diffComparator.size.height)
    );
    expect(comparatorBodySymbol(comparator.size.width, comparator.size.height)).toBe(
      opAmpBodySymbol(comparator.size.width, comparator.size.height)
    );
    expect(differentialComparatorBodySymbol(diffComparator.size.width, diffComparator.size.height)).toBe(
      differentialAmpBodySymbol(diffComparator.size.width, diffComparator.size.height)
    );
    expect(symbolStrokeWidth(comparator.symbol)).toBe(2 * SYMBOL_STROKE_WIDTH);
    expect(symbolAccentStrokeWidth(comparator.symbol)).toBe(SYMBOL_STROKE_WIDTH);
    expect(comparatorCell.attr("symbolBody/strokeWidth")).toBe(2 * SYMBOL_STROKE_WIDTH);
    expect(comparatorCell.attr("symbolAccent/strokeWidth")).toBe(SYMBOL_STROKE_WIDTH);
    expect(comparatorCell.attr("symbolAccent/strokeLinecap")).toBe("round");
    expect(diffComparatorCell.attr("symbolBody/strokeWidth")).toBe(2 * SYMBOL_STROKE_WIDTH);
    expect(diffComparatorCell.attr("symbolAccent/strokeWidth")).toBe(SYMBOL_STROKE_WIDTH);
    expect(diffComparatorCell.attr("symbolAccent/strokeLinecap")).toBe("round");
    expect(comparatorStaircaseSymbol(comparator.size.width, comparator.size.height, 5)).toBe(
      "M 54 34 L 54 58 M 54 34 L 62 34 M 46 38 L 62 38 M 46 42 L 62 42 M 46 46 L 62 46 M 46 50 L 62 50 M 46 54 L 62 54 M 46 58 L 54 58"
    );
    expect(comparatorStaircaseSymbol(comparator.size.width, comparator.size.height, 0)).toBe(
      "M 54 34 L 54 58 M 54 34 L 62 34 M 46 58 L 54 58"
    );
    expect(String(comparatorCell.attr("symbolAccent/d"))).toBe(
      comparatorAccentSymbol(
        resolvedClockedComparator.size.width,
        resolvedClockedComparator.size.height,
        5,
        "rising"
      )
    );
    expect(String(diffComparatorCell.attr("symbolAccent/d"))).toBe(
      differentialComparatorAccentSymbol(
        resolvedClockedDiffComparator.size.width,
        resolvedClockedDiffComparator.size.height,
        5,
        true,
        "rising"
      )
    );
    expect(String(comparatorCell.attr("symbolAccent/d"))).toContain("M 58 74 L 58 106");
    expect(String(diffComparatorCell.attr("symbolAccent/d"))).toContain("M 120 120 L 120 168");
    expect(normalizeComparatorLevels("5")).toBe(5);
    expect(normalizeComparatorLevels("0")).toBe(0);
    expect(normalizeComparatorLevels("-2")).toBe(0);
    expect(normalizeComparatorLevels("99")).toBe(12);
    expect(normalizeComparatorLevels("bad")).toBe(1);

    const comparatorFrame = componentFrameBox(resolvedClockedComparator);
    const diffComparatorFrame = componentFrameBox(resolvedClockedDiffComparator);
    expect(comparatorCell.prop("ports/items")).toEqual([
      { id: "inp", group: "pin", args: { x: -2 - comparatorFrame.x, y: 26 - comparatorFrame.y }, attrs: { portBody: { title: "+" } } },
      { id: "inn", group: "pin", args: { x: -2 - comparatorFrame.x, y: 66 - comparatorFrame.y }, attrs: { portBody: { title: "-" } } },
      { id: "out", group: "pin", args: { x: 138 - comparatorFrame.x, y: 46 - comparatorFrame.y }, attrs: { portBody: { title: "out" } } },
      { id: "clk", group: "pin", args: { x: 58 - comparatorFrame.x, y: 106 - comparatorFrame.y }, attrs: { portBody: { title: "clk" } } }
    ]);
    expect(diffComparatorCell.prop("ports/items")).toEqual([
      { id: "inp", group: "pin", args: { x: 40 - diffComparatorFrame.x, y: 48 - diffComparatorFrame.y }, attrs: { portBody: { title: "in+" } } },
      { id: "inn", group: "pin", args: { x: 40 - diffComparatorFrame.x, y: 128 - diffComparatorFrame.y }, attrs: { portBody: { title: "in-" } } },
      { id: "outp", group: "pin", args: { x: 180 - diffComparatorFrame.x, y: 48 - diffComparatorFrame.y }, attrs: { portBody: { title: "out+" } } },
      { id: "outn", group: "pin", args: { x: 180 - diffComparatorFrame.x, y: 128 - diffComparatorFrame.y }, attrs: { portBody: { title: "out-" } } },
      { id: "clk", group: "pin", args: { x: 120 - diffComparatorFrame.x, y: 168 - diffComparatorFrame.y }, attrs: { portBody: { title: "clk" } } }
    ]);
  });
});
