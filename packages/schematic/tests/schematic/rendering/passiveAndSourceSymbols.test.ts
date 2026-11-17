import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { extractNetlist } from "../../../src/schematic/netlist";
import {
  getComponentDef,
  getComponentVariants,
  PALETTE_ORDER,
  resolveComponentDef
} from "../../../src/schematic/catalog";
import { makeComponentCell } from "../../../src/schematic/renderer";
import { resolveComponentVisualModel } from "../../../src/schematic/componentVisualModel";
import { componentFrameBox, componentVisualBounds } from "../../../src/schematic/view-geometry";
import {
  arrow,
  arrowUp,
  circlePath,
  polarityMark,
  SYMBOL_STROKE_WIDTH,
  twoTerminalSourceShell
} from "../../../src/schematic/symbols/symbolPrimitives";
import {
  capacitorPlateStrokeWidth,
  capacitorPlateSymbol,
  capacitorSymbol,
  currentSourceArrowSize,
  currentSourceArrowSymbol,
  currentSourceSymbol,
  variableCapacitorSymbol,
  variablePassiveArrowHeadSize,
  variablePassiveArrowMarkerSymbol,
  variableResistorSymbol,
  sourceShellPathRadius,
  switchBladeEndpoint,
  switchBladeStartPoint,
  switchClosedBladeEndpoint,
  switchClosedBladeStartPoint,
  switchContactPathRadius,
  switchSymbol,
  voltageSourceSymbol
} from "../../../src/schematic/symbols/symbolBuilders";
import {
  inductorCenterTapSymbol,
  inductorDotMarkerSymbol,
  inductorSymbol
} from "../../../src/schematic/symbols/passiveSymbols";
import {
  symbolAccentStrokeWidth,
  symbolMarkerPath,
  symbolPath
} from "../../../src/schematic/symbols/symbolRegistry";
import { GRID_SIZE } from "../../../src/schematic/types";
import { component } from "../support/testHelpers";

describe("schematic passive and source symbols", () => {
  it("exposes reusable symbol primitives for polarity marks, arrows, and source shells", () => {
    expect(polarityMark("plus", 10, 20, 3)).toBe("M 7 20 L 13 20 M 10 17 L 10 23");
    expect(polarityMark("minus", 10, 20, 3)).toBe("M 7 20 L 13 20");
    expect(arrow(10, 20, 12, 4, "right")).toBe("M 4 20 L 16 20 M 16 20 L 12 16 M 16 20 L 12 24");
    expect(arrowUp(10, 20, 6, 4)).toBe("M 10 26 L 10 14 M 10 14 L 6 18 M 10 14 L 14 18");
    expect(circlePath(10, 20, 5)).toBe("M 15 20 A 5 5 0 1 1 5 20 A 5 5 0 1 1 15 20");
    expect(twoTerminalSourceShell(0, 40, 20, 10, 8)).toBe("M 0 10 L 12 10 M 28 10 L 40 10 M 28 10 A 8 8 0 1 1 12 10 A 8 8 0 1 1 28 10");
  });

  it("renders capacitor plates with thicker stroke, 3a visible spacing, and 12.5a length", () => {
    const capacitor = getComponentDef("capacitor");
    const a = SYMBOL_STROKE_WIDTH;
    const cx = capacitor.size.width / 2;
    const cy = capacitor.size.height / 2;
    const plateStrokeWidth = 2 * a;
    const plateGap = 3 * a;
    const plateLength = 12.5 * a;
    const leftPlateX = cx - (plateGap + plateStrokeWidth) / 2;
    const rightPlateX = cx + (plateGap + plateStrokeWidth) / 2;
    const halfPlateLength = plateLength / 2;

    expect(capacitorSymbol(capacitor.size.width, capacitor.size.height)).toBe(`M 10 28 L ${leftPlateX} 28 M ${rightPlateX} 28 L 90 28`);
    expect(capacitorPlateSymbol(capacitor.size.width, capacitor.size.height)).toBe(
      `M ${leftPlateX} ${cy - halfPlateLength} L ${leftPlateX} ${cy + halfPlateLength} M ${rightPlateX} ${cy - halfPlateLength} L ${rightPlateX} ${cy + halfPlateLength}`
    );
    expect(capacitorPlateStrokeWidth()).toBe(plateStrokeWidth);
    expect(symbolAccentStrokeWidth(capacitor.symbol)).toBe(plateStrokeWidth);

    const capCell = makeComponentCell(component("capacitor", "Cplate", 100, 120));
    expect(capCell.attr("symbolBody/strokeWidth")).toBe(a);
    expect(capCell.attr("symbolAccent/strokeWidth")).toBe(plateStrokeWidth);
    expect(String(capCell.attr("symbolBody/d"))).toBe(capacitorSymbol(capacitor.size.width, capacitor.size.height));
    expect(String(capCell.attr("symbolAccent/d"))).toBe(capacitorPlateSymbol(capacitor.size.width, capacitor.size.height));
  });

  it("renders variable resistor and capacitor arrows with 1a shafts and 6a-by-12a filled heads", () => {
    const a = SYMBOL_STROKE_WIDTH;
    const resistor = getComponentDef("resistor");
    const capacitor = getComponentDef("capacitor");
    const variableResistor = component("resistor", "RV1", 100, 120);
    const variableCapacitor = component("capacitor", "CV1", 100, 120);
    variableResistor.variantId = "variable";
    variableCapacitor.variantId = "variable";
    const resolvedResistor = resolveComponentDef(variableResistor);
    const resolvedCapacitor = resolveComponentDef(variableCapacitor);
    const resistorCell = makeComponentCell(variableResistor);
    const capacitorCell = makeComponentCell(variableCapacitor);

    [resistor, capacitor].forEach((def) => {
      expect(getComponentVariants(def.type).map(({ id, label }) => ({ id, label }))).toEqual([
        { id: "fixed", label: "Fixed" },
        { id: "variable", label: "Variable" }
      ]);
    });
    expect(resolvedResistor.symbol).toBe("resistor-variable");
    expect(resolvedCapacitor.symbol).toBe("capacitor-variable");
    expect(symbolPath(resolvedResistor.symbol, resistor.size.width, resistor.size.height)).toBe(
      variableResistorSymbol(resistor.size.width, resistor.size.height)
    );
    expect(symbolPath(resolvedCapacitor.symbol, capacitor.size.width, capacitor.size.height)).toBe(
      variableCapacitorSymbol(capacitor.size.width, capacitor.size.height)
    );
    expect(symbolMarkerPath(resolvedResistor.symbol, resistor.size.width, resistor.size.height)).toBe(
      variablePassiveArrowMarkerSymbol(resistor.size.width, resistor.size.height)
    );
    expect(symbolMarkerPath(resolvedCapacitor.symbol, capacitor.size.width, capacitor.size.height)).toBe(
      variablePassiveArrowMarkerSymbol(capacitor.size.width, capacitor.size.height)
    );
    expect(resistorCell.attr("symbolBody/strokeWidth")).toBe(a);
    expect(capacitorCell.attr("symbolBody/strokeWidth")).toBe(a);
    expect(capacitorCell.attr("symbolAccent/strokeWidth")).toBe(2 * a);
    expect(variablePassiveArrowHeadSize()).toEqual({ base: 6 * a, height: 12 * a });
    [resistorCell, capacitorCell].forEach((cell) => {
      expect(String(cell.attr("symbolMarker/d"))).toMatch(/^M .+ L .+ L .+ Z$/);
      expect(cell.attr("symbolMarker/fill")).toBe("#111111");
      expect(cell.attr("symbolMarker/stroke")).toBe("none");
    });
  });

  it("joins center taps at the winding outline, places labels opposite the tap, and uses 4a dots", () => {
    const topTap = component("inductor", "Ltop", 100, 120);
    topTap.values.inductorTap = "top";
    topTap.values.inductorDot = "p";
    const bottomTap = component("inductor", "Lbottom", 100, 120);
    bottomTap.values.inductorTap = "bottom";
    const topCell = makeComponentCell(topTap);
    const bottomCell = makeComponentCell(bottomTap);
    const topVisual = resolveComponentVisualModel(topTap);
    const bottomVisual = resolveComponentVisualModel(bottomTap);
    const a = SYMBOL_STROKE_WIDTH;

    expect(resolveComponentDef(topTap).size).toEqual({ width: 100, height: 56 });
    expect(resolveComponentDef(topTap).pins.find((pin) => pin.id === "ct")).toMatchObject({ x: 0, y: -20 });
    expect(resolveComponentDef(bottomTap).pins.find((pin) => pin.id === "ct")).toMatchObject({ x: 0, y: 20 });
    expect(inductorCenterTapSymbol(100, 56, "top")).toBe("M 50 16 L 50 8");
    expect(inductorCenterTapSymbol(100, 56, "bottom")).toBe("M 50 40 L 50 48");
    expect(topCell.attr("symbolAccent/d")).toBe("M 50 16 L 50 8");
    expect(bottomCell.attr("symbolAccent/d")).toBe("M 50 40 L 50 48");
    expect(inductorDotMarkerSymbol(100, 56, "p")).toBe(
      "M 16 15 A 4 4 0 1 0 24 15 A 4 4 0 1 0 16 15 Z"
    );
    expect(inductorSymbol(100, 56)).toMatch(/^M 90 28 L /);
    expect(inductorSymbol(100, 56)).toContain("L 10 28 M ");
    expect(2 * 2 * a).toBe(4 * a);
    expect(topVisual.refLabelAttrs.refLabel.y).toBeGreaterThan(bottomVisual.refLabelAttrs.refLabel.y);
    expect(topVisual.refLabelAttrs.refLabel.dominantBaseline).toBe("text-before-edge");
    expect(bottomVisual.refLabelAttrs.refLabel.dominantBaseline).toBe("text-after-edge");
  });

  it("renders the open switch blade inside a 4-by-2 grid frame with 3a contact inner diameter", () => {
    const switchDef = getComponentDef("switch");
    const a = SYMBOL_STROKE_WIDTH;
    const cx = switchDef.size.width / 2;
    const cy = switchDef.size.height / 2;
    const leftContactX = cx - 16;
    const rightContactX = cx + 16;
    const bladeStart = switchBladeStartPoint(leftContactX, cy);
    const blade = switchBladeEndpoint(bladeStart.x, bladeStart.y);
    const visibleBladeDx = blade.x - bladeStart.x;
    const visibleBladeDy = blade.y - bladeStart.y;
    const originalDx = 29;
    const originalDy = -18;
    const bladeLength = Math.hypot(visibleBladeDx, visibleBladeDy);
    const originalLength = Math.hypot(originalDx, originalDy);
    const contactRadius = switchContactPathRadius();

    expect(bladeLength).toBeCloseTo(originalLength * (7 / 8), 12);
    expect(blade.y).toBeCloseTo(cy - 20, 12);
    expect(componentFrameBox(resolveComponentDef("switch"))).toEqual({ x: 10, y: 8, width: 80, height: 30 });
    expect(contactRadius).toBe(2 * a);
    expect(2 * (contactRadius - a / 2)).toBe(3 * a);
    expect(Math.hypot(bladeStart.x - leftContactX, bladeStart.y - cy)).toBeCloseTo(contactRadius, 12);
    expect(switchDef.symbol).toBe("switch-open");
    expect(switchDef.defaultValues).toEqual({ "pinVisible:ctrl": "false" });
    expect(switchDef.pins.map(({ id, role, x, y }) => ({ id, role, x, y }))).toEqual([
      { id: "p", role: "p", x: -40, y: 0 },
      { id: "n", role: "n", x: 40, y: 0 },
      { id: "ctrl", role: "ctrlP", x: 0, y: -20 }
    ]);
    expect(resolveComponentDef(component("switch", "SW1", 0, 0)).symbol).toBe("switch-open");
    const closedSwitch = component("switch", "SW2", 0, 0);
    closedSwitch.variantId = "closed";
    expect(resolveComponentDef(closedSwitch).symbol).toBe("switch-closed");
    expect(symbolPath("switch-open", switchDef.size.width, switchDef.size.height)).toBe(switchSymbol(switchDef.size.width, switchDef.size.height));
    expect(symbolPath("switch-closed", switchDef.size.width, switchDef.size.height)).toBe(switchSymbol(switchDef.size.width, switchDef.size.height, a, true));
    const closedBladeStart = switchClosedBladeStartPoint(leftContactX, cy);
    const closedBladeEnd = switchClosedBladeEndpoint(rightContactX, cy);
    expect(closedBladeStart).toEqual({ x: leftContactX + contactRadius, y: cy });
    expect(Math.hypot(closedBladeEnd.x - rightContactX, closedBladeEnd.y - cy)).toBeCloseTo(contactRadius, 12);
    expect(closedBladeEnd.x).toBeLessThan(rightContactX);
    expect(closedBladeEnd.y).toBeLessThan(cy);
    expect(switchSymbol(switchDef.size.width, switchDef.size.height, a, true)).toContain(
      `M ${closedBladeStart.x} ${closedBladeStart.y} L ${closedBladeEnd.x} ${closedBladeEnd.y}`
    );

    expect(switchSymbol(switchDef.size.width, switchDef.size.height)).toBe(
      [
        `M 10 ${cy} L ${leftContactX - contactRadius} ${cy}`,
        `M ${rightContactX + contactRadius} ${cy} L 90 ${cy}`,
        `M ${bladeStart.x} ${bladeStart.y} L ${blade.x} ${blade.y}`,
        `M ${leftContactX + contactRadius} ${cy} A ${contactRadius} ${contactRadius} 0 1 1 ${leftContactX - contactRadius} ${cy} A ${contactRadius} ${contactRadius} 0 1 1 ${leftContactX + contactRadius} ${cy}`,
        `M ${rightContactX + contactRadius} ${cy} A ${contactRadius} ${contactRadius} 0 1 1 ${rightContactX - contactRadius} ${cy} A ${contactRadius} ${contactRadius} 0 1 1 ${rightContactX + contactRadius} ${cy}`
      ].join(" ")
    );

    const hiddenControl = component("switch", "SW3", 100, 120);
    const visibleControl = component("switch", "SW4", 100, 120);
    visibleControl.values["pinVisible:ctrl"] = "true";
    const hiddenControlCell = makeComponentCell(hiddenControl);
    const visibleControlCell = makeComponentCell(visibleControl);
    expect(hiddenControlCell.attr("symbolBody/d")).toBe(switchSymbol(switchDef.size.width, switchDef.size.height));
    expect(visibleControlCell.attr("symbolBody/d")).toBe(
      switchSymbol(switchDef.size.width, switchDef.size.height, a, false, true)
    );
    expect(String(visibleControlCell.attr("symbolBody/d"))).toContain(
      `M ${cx} ${cy - 10 * a} L ${cx} ${cy - 8 * a}`
    );

    const hiddenNetlist = extractNetlist(fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [hiddenControl],
      wires: [],
      junctions: []
    }));
    const visibleNetlist = extractNetlist(fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [visibleControl],
      wires: [],
      junctions: []
    }));
    expect(hiddenNetlist.pins.map((pin) => pin.pinId)).toEqual(["p", "n"]);
    expect(visibleNetlist.pins.map((pin) => pin.pinId)).toEqual(["p", "n", "ctrl"]);
  });

  it("renders shared source primitives for voltage and current source symbols", () => {
    const voltageSource = getComponentDef("voltageSource");
    const currentSource = getComponentDef("currentSource");
    const voltagePath = symbolPath(voltageSource.symbol, voltageSource.size.width, voltageSource.size.height);
    const currentPath = symbolPath(currentSource.symbol, currentSource.size.width, currentSource.size.height);
    const a = SYMBOL_STROKE_WIDTH;
    const sourceRadius = sourceShellPathRadius();
    const currentArrow = currentSourceArrowSize();
    const cx = currentSource.size.width / 2;
    const cy = currentSource.size.height / 2;
    const arrowTipX = cx + currentArrow.length / 2;
    const arrowBaseX = arrowTipX - currentArrow.height;

    expect(voltagePath).toBe(voltageSourceSymbol(voltageSource.size.width, voltageSource.size.height));
    expect(currentPath).toBe(currentSourceSymbol(currentSource.size.width, currentSource.size.height));
    expect(sourceRadius).toBe((16 * a + a) / 2);
    expect(2 * (sourceRadius - a / 2)).toBe(16 * a);
    expect(currentArrow).toEqual({ length: 12 * a, base: 8 * a, height: 8.5 * a });
    expect(voltagePath).toContain(`A ${sourceRadius} ${sourceRadius} 0 1 1`);
    expect(voltagePath).toContain("M 36 28 L 48 28");
    expect(voltagePath).toContain("M 42 22 L 42 34");
    expect(voltagePath).toContain("M 52 28 L 64 28");
    expect(currentPath).toContain(`A ${sourceRadius} ${sourceRadius} 0 1 1`);
    expect(currentPath).toContain(`M ${cx - currentArrow.length / 2} ${cy} L ${arrowBaseX} ${cy}`);
    expect(symbolMarkerPath(currentSource.symbol, currentSource.size.width, currentSource.size.height)).toBe(currentSourceArrowSymbol(currentSource.size.width, currentSource.size.height));
    expect(currentSourceArrowSymbol(currentSource.size.width, currentSource.size.height)).toBe(
      `M ${arrowTipX} ${cy} L ${arrowBaseX} ${cy - currentArrow.base / 2} L ${arrowBaseX} ${cy + currentArrow.base / 2} Z`
    );
  });

  it("derives grid-tight component frames from the rendered symbol paths and pins", () => {
    const voltageSourceFrame = componentFrameBox(resolveComponentDef("voltageSource"));
    const currentSourceFrame = componentFrameBox(resolveComponentDef("currentSource"));
    const resistorFrame = componentFrameBox(resolveComponentDef("resistor"));
    const nmosFrame = componentFrameBox(resolveComponentDef("nmos"));
    const pmosFrame = componentFrameBox(resolveComponentDef("pmos"));
    const annotationFrame = componentFrameBox(resolveComponentDef("annotation"));

    expect(voltageSourceFrame).toEqual({ x: 10, y: 8, width: 80, height: 40 });
    expect(currentSourceFrame).toEqual(voltageSourceFrame);
    expect(resistorFrame).toEqual({ x: 10, y: 18, width: 80, height: 20 });
    expect(nmosFrame).toEqual({ x: 10, y: 10, width: 40, height: 80 });
    expect(pmosFrame).toEqual({ x: 10, y: 10, width: 40, height: 80 });
    expect(annotationFrame).toEqual({ x: 0, y: 0, width: 180, height: 30 });

    expect(componentVisualBounds(component("voltageSource", "Vframe", 200, 200))).toEqual({ x: 160, y: 180, width: 80, height: 40 });
    expect(makeComponentCell(component("voltageSource", "Vcell", 100, 120)).attr("frame/height")).toBe(40);
  });

  it("keeps all generated component frames grid-aligned and enclosing their pins", () => {
    const cases = PALETTE_ORDER.flatMap((type) => {
      const base = getComponentDef(type);
      return [resolveComponentDef(component(type, `${base.label}case`, 0, 0)), ...getComponentVariants(type).map((variant) => resolveComponentDef({ ...component(type, `${base.label}case`, 0, 0), variantId: variant.id }))];
    });

    for (const def of cases) {
      const frame = componentFrameBox(def);
      const cell = makeComponentCell({ ...component(def.type, `${def.label}frame`, 0, 0), variantId: def.variantId });
      const cx = def.size.width / 2;
      const cy = def.size.height / 2;
      expect((frame.x - cx) % GRID_SIZE, def.symbol).toBeCloseTo(0, 12);
      expect((frame.y - cy) % GRID_SIZE, def.symbol).toBeCloseTo(0, 12);
      expect(frame.width % GRID_SIZE, def.symbol).toBe(0);
      expect(frame.height % GRID_SIZE, def.symbol).toBe(0);
      expect(cell.size(), def.symbol).toEqual({ width: frame.width, height: frame.height });
      expect(cell.attr("frame/x"), def.symbol).toBe(0);
      expect(cell.attr("frame/y"), def.symbol).toBe(0);
      expect(cell.attr("frame/width"), def.symbol).toBe(frame.width);
      expect(cell.attr("frame/height"), def.symbol).toBe(frame.height);

      for (const pin of def.pins) {
        const pinX = cx + pin.x;
        const pinY = cy + pin.y;
        expect(pinX, `${def.symbol}:${pin.id}`).toBeGreaterThanOrEqual(frame.x);
        expect(pinX, `${def.symbol}:${pin.id}`).toBeLessThanOrEqual(frame.x + frame.width);
        expect(pinY, `${def.symbol}:${pin.id}`).toBeGreaterThanOrEqual(frame.y);
        expect(pinY, `${def.symbol}:${pin.id}`).toBeLessThanOrEqual(frame.y + frame.height);
      }
    }
  });
});
