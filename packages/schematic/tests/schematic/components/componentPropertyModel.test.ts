import { fixtureDocument } from "../support/fixtureDocument";
import { executeSchematicPropertyBatchCommand } from "../../../src/schematic/propertyBatchCommands";
import { describe, expect, it } from "vitest";
import {
  canChangeComponentCell,
  commitComponentCellChange,
  componentColor,
  componentCustomColor,
  componentGainPolarity,
  componentLabelVisible,
  componentValueVisible,
  componentPinMode,
  componentPinSymbolVisible,
  componentPinVisible,
  prepareComponentCellChange,
  prepareComponentVariantChange,
  setComponentGainPolarity,
  setComponentColor,
  setComponentLabelVisibility,
  setComponentValueVisibility,
  setComponentRef,
  setComponentPinMode,
  setComponentPinSymbolVisibility,
  setComponentPinVisibility,
  setComponentValue
} from "../../../src/schematic/componentPropertyModel";
import { resolveComponentDef } from "../../../src/schematic/catalog";
import { componentPinPoint } from "../../../src/schematic/netlist";
import { componentPinPoints } from "../../../src/schematic/document/documentGeometryModel";
import type { ComponentInstance, Point, SchematicDocument } from "../../../src/schematic/types";
import { fixtureComponent, fixtureWire } from "../support/fixtures";

function wireFromPin(id: string, instance: ComponentInstance, pinId: string, outerPoint: Point) {
  return fixtureWire(id, [outerPoint, componentPinPoint(instance, pinId)]);
}

function wirePointSnapshot(document: SchematicDocument) {
  return document.wires.map((wire) => ({
    id: wire.id,
    points: wire.points.map((point) => ({ ...point }))
  })).sort((a, b) => a.id.localeCompare(b.id));
}

describe("schematic component property model", () => {
  it("stores normalized custom colors and removes default black without touching values", () => {
    const instance = fixtureComponent("resistor", "R1", 0, 0);

    expect(componentColor(instance)).toBe("#111111");
    expect(componentCustomColor(instance)).toBeNull();
    expect(setComponentColor(instance, "  #AaBbCc  ")).toEqual({ kind: "changed", color: "#aabbcc" });
    expect(instance.appearance).toEqual({ color: "#aabbcc" });
    expect(componentColor(instance)).toBe("#aabbcc");
    expect(setComponentColor(instance, "#aabbcc")).toEqual({ kind: "noop", reason: "unchanged" });
    expect(setComponentColor(instance, "#12345g")).toEqual({ kind: "noop", reason: "invalid" });
    expect(instance.appearance).toEqual({ color: "#aabbcc" });
    expect(setComponentColor(instance, "#111111")).toEqual({ kind: "changed", color: null });
    expect(instance.appearance).toBeUndefined();
    expect(instance.values).toEqual({ main: "R1" });
  });

  it("changes compatible cells without moving rotated or mirrored pins and preserves custom values", () => {
    const instance = { ...fixtureComponent("resistor", "R1", 120, 160, 90), mirrored: true, values: { main: "12k" }, appearance: { color: "#0072b2" } };
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [instance, fixtureComponent("capacitor", "C4", 320, 160)],
      wires: [
        wireFromPin("wp", instance, "p", { x: 120, y: 40 }),
        wireFromPin("wn", instance, "n", { x: 120, y: 280 })
      ],
      junctions: []
    });
    const pinPoints = componentPinPoints(instance);
    const wires = wirePointSnapshot(document);

    expect(canChangeComponentCell(instance, "capacitor")).toBe(true);
    expect(canChangeComponentCell(instance, "ota")).toBe(false);
    expect(commitComponentCellChange(document, instance, "capacitor")).toEqual({
      kind: "changed",
      previousType: "resistor",
      type: "capacitor",
      previousRef: "R1",
      ref: "C5",
      message: "R1 cell changed from resistor to capacitor as C5."
    });
    expect(instance).toMatchObject({ type: "capacitor", ref: "C5", rotation: 90, mirrored: true, values: { main: "12k" }, appearance: { color: "#0072b2" } });
    expect(componentPinPoints(instance)).toEqual(pinPoints);
    expect(wirePointSnapshot(document)).toEqual(wires);
  });

  it("preserves shared Property Editor settings when compatible cells change", () => {
    const amplifier = fixtureComponent("amp", "A1", 0, 0);
    amplifier.values.gainPolarity = "negative";
    const capacitor = fixtureComponent("capacitor", "C1", 160, 0);
    capacitor.values.labelVisible = "false";
    capacitor.values.valueVisible = "true";
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [amplifier, capacitor],
      wires: [],
      junctions: []
    });

    expect(commitComponentCellChange(document, amplifier, "gm")).toMatchObject({
      kind: "changed",
      previousType: "amp",
      type: "gm"
    });
    expect(componentGainPolarity(amplifier)).toBe("negative");
    expect(amplifier.values.gainPolarity).toBe("negative");

    expect(commitComponentCellChange(document, capacitor, "resistor")).toMatchObject({
      kind: "changed",
      previousType: "capacitor",
      type: "resistor"
    });
    expect(componentLabelVisible(capacitor)).toBe(false);
    expect(componentValueVisible(capacitor)).toBe(true);
    expect(capacitor.values).toMatchObject({
      labelVisible: "false",
      valueVisible: "true"
    });
  });

  it("preserves a logic gate''s input count when changing its Cell", () => {
    const gate = fixtureComponent("nand", "NAND1", 120, 160);
    gate.variantId = "3-input";
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [gate],
      wires: [],
      junctions: []
    });
    const pinPoints = componentPinPoints(gate);

    expect(canChangeComponentCell(gate, "and")).toBe(true);
    expect(commitComponentCellChange(document, gate, "and")).toMatchObject({
      kind: "changed",
      previousType: "nand",
      type: "and",
      previousRef: "NAND1",
      ref: "AND1"
    });
    expect(gate.variantId).toBe("3-input");
    expect(resolveComponentDef(gate).pins.map((pin) => pin.id)).toEqual(["in1", "in2", "in3", "out"]);
    expect(componentPinPoints(gate)).toEqual(pinPoints);
  });

  it("preserves the shared Fixed/Variable view when changing compatible cells", () => {
    const instance = fixtureComponent("capacitor", "C1", 120, 160);
    instance.variantId = "variable";
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [instance],
      wires: [],
      junctions: []
    });
    const pinPoints = componentPinPoints(instance);

    expect(canChangeComponentCell(instance, "resistor")).toBe(true);
    expect(commitComponentCellChange(document, instance, "resistor")).toMatchObject({
      kind: "changed",
      previousType: "capacitor",
      type: "resistor",
      previousRef: "C1",
      ref: "R1"
    });
    expect(instance.variantId).toBe("variable");
    expect(resolveComponentDef(instance).symbol).toBe("resistor-variable");
    expect(componentPinPoints(instance)).toEqual(pinPoints);
  });

  it("does not carry Property Editor settings to cells that do not support them", () => {
    const amplifier = fixtureComponent("amp", "A1", 0, 0);
    amplifier.values.gainPolarity = "negative";
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [amplifier],
      wires: [],
      junctions: []
    });

    expect(commitComponentCellChange(document, amplifier, "inverter")).toMatchObject({ kind: "changed" });
    expect(amplifier.values.gainPolarity).toBeUndefined();
  });

  it("updates generated values with the new ref and rejects invalid or incompatible cells", () => {
    const instance = fixtureComponent("resistor", "R1", 0, 0, 180);
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [], components: [instance], wires: [], junctions: [] });
    expect(prepareComponentCellChange(instance, "missing")).toEqual({ kind: "noop", reason: "invalid-cell" });
    expect(prepareComponentCellChange(instance, "ota")).toEqual({ kind: "noop", reason: "incompatible-pins" });
    expect(commitComponentCellChange(document, instance, "ota")).toEqual({ kind: "noop", reason: "incompatible-pins" });
    expect(instance).toMatchObject({ type: "resistor", ref: "R1", rotation: 180, values: { main: "R1" } });

    expect(commitComponentCellChange(document, instance, "capacitor")).toMatchObject({ kind: "changed", ref: "C1" });
    expect(instance).toMatchObject({ type: "capacitor", ref: "C1", rotation: 180, values: { main: "C1" } });
  });

  it("prepares changed component variants without mutating before the editor captures old pins", () => {
    const instance = fixtureComponent("switch", "S1", 0, 0);

    expect(prepareComponentVariantChange(instance, "closed")).toEqual({ kind: "changed", variantId: "closed" });
    expect(instance.variantId).toBe("open");
  });

  it("commits invalid and unchanged component variants as no-ops without mutating", () => {
    const instance = fixtureComponent("switch", "S1", 0, 0);
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [instance],
      wires: [wireFromPin("w-p", instance, "p", { x: -80, y: 0 })],
      junctions: []
    });
    const beforeInvalid = JSON.stringify(document);

    const invalid = executeSchematicPropertyBatchCommand(document, { selectedIds: [instance.id], selectedNoteIds: [] }, { kind: "component-variant", variantId: "missing", moveBehavior: "stretch" });

    expect(invalid).toMatchObject({ kind: "rejected", changed: false, historyIntent: "none" });
    expect(JSON.stringify(document)).toBe(beforeInvalid);

    const beforeUnchanged = JSON.stringify(document);
    const unchanged = executeSchematicPropertyBatchCommand(document, { selectedIds: [instance.id], selectedNoteIds: [] }, { kind: "component-variant", variantId: "open", moveBehavior: "stretch" });

    expect(unchanged).toMatchObject({ kind: "unchanged", changed: false, historyIntent: "none" });
    expect(JSON.stringify(document)).toBe(beforeUnchanged);
  });

  it("switches open switches to closed without moving attached wires because pins are unchanged", () => {
    const instance = fixtureComponent("switch", "S1", 100, 100);
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [instance],
      wires: [
        wireFromPin("w-p", instance, "p", { x: 20, y: 100 }),
        wireFromPin("w-n", instance, "n", { x: 180, y: 100 })
      ],
      junctions: []
    });
    const previousPinPoints = componentPinPoints(instance);
    const previousWirePoints = wirePointSnapshot(document);

    const result = executeSchematicPropertyBatchCommand(document, { selectedIds: [instance.id], selectedNoteIds: [] }, { kind: "component-variant", variantId: "closed", moveBehavior: "stretch" });

    expect(resolveComponentDef(instance).symbol).toBe("switch-closed");
    expect(componentPinPoints(instance)).toEqual(previousPinPoints);
    expect(instance.variantId).toBe("closed");
    expect(result).toMatchObject({ changed: true, historyIntent: "push" });
    expect(result.targets.wireIds).toEqual([]);
    expect(wirePointSnapshot(document)).toEqual(previousWirePoints);
  });

  it("keeps existing MOS drain gate and source wires fixed when adding the 4-pin bulk variant", () => {
    const instance = fixtureComponent("nmos", "M1", 100, 100);
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [instance],
      wires: [
        wireFromPin("w-d", instance, "d", { x: 100, y: 20 }),
        wireFromPin("w-g", instance, "g", { x: 20, y: 100 }),
        wireFromPin("w-s", instance, "s", { x: 100, y: 180 })
      ],
      junctions: []
    });
    const previousPinPoints = componentPinPoints(instance);
    const previousWirePoints = wirePointSnapshot(document);

    const result = executeSchematicPropertyBatchCommand(document, { selectedIds: [instance.id], selectedNoteIds: [] }, { kind: "component-mos-view", patch: { pins: "4pin", arrow: "current" }, moveBehavior: "stretch" });
    const nextPinPoints = componentPinPoints(instance);

    expect(resolveComponentDef(instance).pins.map((pin) => pin.id)).toEqual(["d", "g", "s", "b"]);
    ["d", "g", "s"].forEach((pinId) => expect(nextPinPoints.get(pinId)).toEqual(previousPinPoints.get(pinId)));
    expect(nextPinPoints.get("b")).toEqual({ x: 100, y: 100 });
    expect(result).toMatchObject({ changed: true, historyIntent: "push" });
    expect(result.targets.wireIds).toEqual([]);
    expect(wirePointSnapshot(document)).toEqual(previousWirePoints);
  });

  it("leaves an existing MOS bulk wire at the old coordinate when removing the 4-pin bulk variant", () => {
    const instance = fixtureComponent("nmos", "M1", 100, 100);
    instance.variantId = "4pin-current";
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [instance],
      wires: [wireFromPin("w-b", instance, "b", { x: 140, y: 100 })],
      junctions: []
    });
    const previousPinPoints = componentPinPoints(instance);
    const previousWirePoints = wirePointSnapshot(document);

    const result = executeSchematicPropertyBatchCommand(document, { selectedIds: [instance.id], selectedNoteIds: [] }, { kind: "component-mos-view", patch: { pins: "3pin", arrow: "current" }, moveBehavior: "stretch" });

    expect(resolveComponentDef(instance).pins.map((pin) => pin.id)).toEqual(["d", "g", "s"]);
    expect(componentPinPoints(instance).has("b")).toBe(false);
    expect(document.wires[0].points.at(-1)).toEqual(previousPinPoints.get("b"));
    expect(result).toMatchObject({ changed: true, historyIntent: "push" });
    expect(result.targets.wireIds).toEqual([]);
    expect(wirePointSnapshot(document)).toEqual(previousWirePoints);
  });

  it("trims component refs and propagates the generated main value", () => {
    const instance = fixtureComponent("resistor", "R1", 0, 0);

    expect(setComponentRef(instance, "  R7  ")).toEqual({
      kind: "changed",
      previousRef: "R1",
      nextRef: "R7",
      propagatedMainValue: true
    });
    expect(instance.ref).toBe("R7");
    expect(instance.values.main).toBe("R7");
  });

  it("ignores blank and unchanged component refs", () => {
    const instance = fixtureComponent("resistor", "R1", 0, 0);
    const beforeBlank = JSON.stringify(instance);

    expect(setComponentRef(instance, "   ")).toEqual({ kind: "noop", reason: "blank", nextRef: "" });
    expect(JSON.stringify(instance)).toBe(beforeBlank);

    expect(setComponentRef(instance, " R1 ")).toEqual({ kind: "noop", reason: "unchanged", nextRef: "R1" });
    expect(instance.ref).toBe("R1");
    expect(instance.values.main).toBe("R1");
  });

  it("preserves custom component values when refs change", () => {
    const instance = fixtureComponent("resistor", "R1", 0, 0);
    instance.values.main = "10k";

    expect(setComponentRef(instance, "R8")).toEqual({
      kind: "changed",
      previousRef: "R1",
      nextRef: "R8",
      propagatedMainValue: false
    });
    expect(instance.ref).toBe("R8");
    expect(instance.values.main).toBe("10k");
  });

  it("trims, changes, and deletes component values", () => {
    const instance = fixtureComponent("resistor", "R1", 0, 0);

    expect(setComponentValue(instance, "  10k  ")).toEqual({
      kind: "changed",
      previousValue: "R1",
      nextValue: "10k"
    });
    expect(instance.values.main).toBe("10k");

    expect(setComponentValue(instance, "   ")).toEqual({
      kind: "changed",
      previousValue: "10k",
      nextValue: ""
    });
    expect(instance.values.main).toBeUndefined();
  });

  it("stores comparator levels through the configured value key", () => {
    const instance = fixtureComponent("comparator", "CMP1", 0, 0);

    expect(setComponentValue(instance, " 5 ")).toEqual({
      kind: "changed",
      previousValue: "1",
      nextValue: "5"
    });
    expect(instance.values).toEqual({ levels: "5" });

    expect(setComponentValue(instance, " ")).toEqual({
      kind: "changed",
      previousValue: "5",
      nextValue: ""
    });
    expect(instance.values).toEqual({});
  });

  it("ignores unchanged values and rejects hidden values even with a legacy main value", () => {
    const resistor = fixtureComponent("resistor", "R1", 0, 0);
    resistor.values.main = "10k";
    expect(setComponentValue(resistor, " 10k ")).toEqual({ kind: "noop", reason: "unchanged" });
    expect(resistor.values.main).toBe("10k");

    const ground = fixtureComponent("gnd", "GND1", 0, 0);
    expect(setComponentValue(ground, "0")).toEqual({ kind: "noop", reason: "hidden-value" });
    expect(ground.values.main).toBeUndefined();

    const nmos = fixtureComponent("nmos", "M1", 0, 0);
    nmos.values.main = "legacy-model";
    expect(setComponentValue(nmos, "new-model")).toEqual({ kind: "noop", reason: "hidden-value" });
    expect(nmos.values.main).toBe("legacy-model");
  });

  it("stores editable pin visibility relative to component defaults", () => {
    const plus = fixtureComponent("plus", "SUM1", 0, 0);
    expect(componentPinVisible(plus, "top")).toBe(false);
    expect(setComponentPinVisibility(plus, "top", false)).toEqual({ kind: "noop", reason: "unchanged" });
    expect(setComponentPinVisibility(plus, "missing", false)).toEqual({ kind: "noop", reason: "invalid-pin" });
    expect(setComponentPinVisibility(plus, "top", true)).toEqual({ kind: "changed", pinId: "top", visible: true });
    expect(plus.values["pinVisible:top"]).toBe("true");
    expect(setComponentPinVisibility(plus, "top", false)).toEqual({ kind: "changed", pinId: "top", visible: false });
    expect(plus.values["pinVisible:top"]).toBeUndefined();

    expect(setComponentPinVisibility(plus, "left", false)).toEqual({ kind: "changed", pinId: "left", visible: false });
    expect(plus.values["pinVisible:left"]).toBe("false");
    expect(setComponentPinVisibility(plus, "left", true)).toEqual({ kind: "changed", pinId: "left", visible: true });
    expect(plus.values["pinVisible:left"]).toBeUndefined();

    const resistor = fixtureComponent("resistor", "R1", 0, 0);
    expect(setComponentPinVisibility(resistor, "p", false)).toEqual({ kind: "noop", reason: "unsupported" });

    const switchInstance = fixtureComponent("switch", "S1", 0, 0);
    expect(componentPinVisible(switchInstance, "ctrl")).toBe(false);
    expect(componentPinVisible(switchInstance, "p")).toBe(true);
    expect(setComponentPinVisibility(switchInstance, "ctrl", true)).toEqual({
      kind: "changed",
      pinId: "ctrl",
      visible: true
    });
    expect(switchInstance.values["pinVisible:ctrl"]).toBe("true");
    expect(setComponentPinVisibility(switchInstance, "p", false)).toEqual({ kind: "noop", reason: "unsupported" });
  });

  it("stores label visibility relative to each component default", () => {
    const resistor = fixtureComponent("resistor", "R1", 0, 0);
    const ground = fixtureComponent("gnd", "GND1", 0, 0);
    const vdd = fixtureComponent("vdd", "VDD1", 0, 0);
    const plus = fixtureComponent("plus", "SUM1", 0, 0);
    const adc = fixtureComponent("adc", "ADC1", 0, 0);
    const dac = fixtureComponent("dac", "DAC1", 0, 0);

    expect(componentLabelVisible(resistor)).toBe(true);
    expect(componentLabelVisible(ground)).toBe(false);
    expect(componentLabelVisible(vdd)).toBe(false);
    expect(componentLabelVisible(plus)).toBe(false);
    expect(componentLabelVisible(adc)).toBe(false);
    expect(componentLabelVisible(dac)).toBe(false);
    expect(setComponentLabelVisibility(resistor, false)).toEqual({ kind: "changed", visible: false });
    expect(resistor.values.labelVisible).toBe("false");
    expect(setComponentLabelVisibility(resistor, true)).toEqual({ kind: "changed", visible: true });
    expect(resistor.values.labelVisible).toBeUndefined();
    expect(setComponentLabelVisibility(plus, true)).toEqual({ kind: "changed", visible: true });
    expect(plus.values.labelVisible).toBe("true");
    expect(setComponentLabelVisibility(plus, false)).toEqual({ kind: "changed", visible: false });
    expect(plus.values.labelVisible).toBeUndefined();
  });

  it("stores value visibility only for components with a Value field", () => {
    const resistor = fixtureComponent("resistor", "R1", 0, 0);
    const plus = fixtureComponent("plus", "SUM1", 0, 0);

    expect(componentValueVisible(resistor)).toBe(false);
    expect(setComponentValueVisibility(resistor, true)).toEqual({ kind: "changed", visible: true });
    expect(resistor.values.valueVisible).toBe("true");
    expect(componentValueVisible(resistor)).toBe(true);
    expect(setComponentValueVisibility(resistor, false)).toEqual({ kind: "changed", visible: false });
    expect(resistor.values.valueVisible).toBeUndefined();
    expect(setComponentValueVisibility(plus, true)).toEqual({ kind: "noop", reason: "unsupported" });
  });

  it("stores gain polarity only for single-input analog cells", () => {
    const amp = fixtureComponent("amp", "A1", 0, 0);
    const gm = fixtureComponent("gm", "Gm1", 0, 0);
    const buffer = fixtureComponent("analogBuffer", "X1", 0, 0);
    const resistor = fixtureComponent("resistor", "R1", 0, 0);

    expect(componentGainPolarity(amp)).toBe("default");
    expect(setComponentGainPolarity(amp, "negative")).toEqual({ kind: "changed", polarity: "negative" });
    expect(amp.values.gainPolarity).toBe("negative");
    expect(setComponentGainPolarity(amp, "default")).toEqual({ kind: "changed", polarity: "default" });
    expect(amp.values.gainPolarity).toBeUndefined();
    expect(setComponentGainPolarity(gm, "positive")).toEqual({ kind: "changed", polarity: "positive" });
    expect(setComponentGainPolarity(buffer, "negative")).toEqual({ kind: "changed", polarity: "negative" });
    expect(setComponentGainPolarity(resistor, "negative")).toEqual({ kind: "noop", reason: "unsupported" });
  });

  it("stores independent pin roles and role-symbol visibility", () => {
    const plus = fixtureComponent("plus", "SUM1", 0, 0);
    expect(["left", "top", "right", "bottom"].map((pinId) => componentPinMode(plus, pinId))).toEqual([
      "positive",
      "positive",
      "output",
      "negative"
    ]);
    expect(componentPinSymbolVisible(plus, "left")).toBe(true);
    expect(setComponentPinMode(plus, "left", "negative")).toEqual({ kind: "changed", pinId: "left", mode: "negative" });
    expect(plus.values["pinMode:left"]).toBe("negative");
    expect(setComponentPinMode(plus, "left", "positive")).toEqual({ kind: "changed", pinId: "left", mode: "positive" });
    expect(plus.values["pinMode:left"]).toBeUndefined();
    expect(setComponentPinSymbolVisibility(plus, "left", false)).toEqual({ kind: "changed", pinId: "left", visible: false });
    expect(plus.values["pinSymbolVisible:left"]).toBe("false");
    expect(setComponentPinSymbolVisibility(plus, "left", true)).toEqual({ kind: "changed", pinId: "left", visible: true });
    expect(plus.values["pinSymbolVisible:left"]).toBeUndefined();

    const resistor = fixtureComponent("resistor", "R1", 0, 0);
    expect(setComponentPinMode(resistor, "p", "positive")).toEqual({ kind: "noop", reason: "unsupported" });
    expect(setComponentPinSymbolVisibility(resistor, "p", false)).toEqual({ kind: "noop", reason: "unsupported" });
  });
});
