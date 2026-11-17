import { fixtureDocument, authorFixture } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { canChangeComponentCell } from "../../../src/schematic/componentPropertyModel";
import { getComponentDef } from "../../../src/schematic/catalog";
import { setComponentPinVisibility, componentPinVisible } from "../../../src/schematic/pinConfigurationModel";
import { resolveComponentVisualModel } from "../../../src/schematic/componentVisualModel";
import { renderComponentSvg } from "../../../src/schematic/componentSvgRenderer";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { componentPinPoint, extractNetlist } from "../../../src/schematic/netlist";
import { buildSchematicPropertyPanelInput } from "../../../src/schematic/propertyPanelProjection";
import { executeSchematicPropertyBatchCommand } from "../../../src/schematic/propertyBatchCommands";
import { createSchematicContentHistoryAdapter } from "../../../src/schematic/document/contentHistoryAdapter";
import { createEmptySchematicDocument, contentFromDocument } from "../../../src/schematic/document/documentModel";
import { parseSchematicContent, serializeSchematicContent } from "../../../src/schematic/schematicDocumentCodec";
import { fixtureComponent, fixtureWire } from "../support/fixtures";

function fixture(variantId = "fixed") {
  const component = fixtureComponent("inverter", "X1", 100, 100);
  component.variantId = variantId;
  const document = createEmptySchematicDocument();
  document.components.push(component);
    authorFixture(document);
  return { component, document };
}

describe("inverter optional supply pins", () => {
  it.each(["fixed", "variable"])("keeps %s inverters two-pin until supplies are enabled", (variantId) => {
    const { component, document } = fixture(variantId);
    component.values = {};
    expect([...resolveComponentVisualModel(component).visiblePinIds]).toEqual(["in", "out"]);
    expect(Object.keys(extractNetlist(document).components[0].pins)).toEqual(["in", "out"]);
    expect(resolveComponentVisualModel(component).pinMarksPath).toBe("");
    expect(getComponentDef("digitalBuffer").pins.map(pin => pin.id)).toEqual(["in", "out"]);
    expect(getComponentDef("adc").pins.some(pin => pin.id === "vdd" || pin.id === "gnd")).toBe(false);
    expect(setComponentPinVisibility(component, "in", false).kind).toBe("noop");
  });

  for (const variantId of ["fixed", "variable"]) {
    it.each([[false, false], [true, false], [false, true], [true, true]])(
      variantId + " renders independently selected supply pins (VDD=%s, GND=%s)", (vdd, gnd) => {
        const { component } = fixture(variantId);
        setComponentPinVisibility(component, "vdd", vdd);
        setComponentPinVisibility(component, "gnd", gnd);
        const model = resolveComponentVisualModel(component);
        const cell = makeComponentCell(component);
        const svg = renderComponentSvg(component);
        expect(cell.attr("symbolPinMarks/d")).toBe(model.pinMarksPath);
        for (const [id, visible] of [["vdd", vdd], ["gnd", gnd]] as const) {
          expect(model.visiblePinIds.has(id)).toBe(visible);
          expect(svg.includes('data-pin-id="' + id + '"')).toBe(visible);
          expect(!!cell.getPort(id)).toBe(visible);
        }
        expect((model.pinMarksPath.match(/M /g) ?? []).length).toBe(Number(vdd) + Number(gnd));
        if (vdd || gnd) expect(renderComponentSvg(component, { presentationMode: true })).toContain('data-selector="symbolPinMarks"');
        expect(renderComponentSvg(component, { presentationMode: true })).not.toContain('data-pin-id=');
      }
    );
  }

  it("exposes just VDD and GND visibility controls and preserves both through variant changes", () => {
    const { component, document } = fixture();
    setComponentPinVisibility(component, "vdd", true);
    const projected = buildSchematicPropertyPanelInput({
      document, hasSelection: true,
      targets: fixtureDocument({ components: [component], wires: [], junctionPoints: [], netLabels: [], notes: [] })
    }).component;
    expect(projected?.pinSettings).toEqual([
      { id: "vdd", label: "VDD", visible: { state: "uniform", value: true }, modeEditable: false },
      { id: "gnd", label: "GND", visible: { state: "uniform", value: false }, modeEditable: false }
    ]);
    executeSchematicPropertyBatchCommand(document, { selectedIds: [component.id], selectedNoteIds: [] }, { kind: "component-variant", variantId: "variable", moveBehavior: "stretch" });
    expect(componentPinVisible(component, "vdd")).toBe(true);
    expect(componentPinVisible(component, "gnd")).toBe(false);
  });

  it("connects visible supply terminals to wires and disconnects hidden pins without removing wires", () => {
    const { component, document } = fixture();
    document.wires.push(
      fixtureWire("supply", [{ x: 60, y: 80 }, { x: 140, y: 80 }]),
      fixtureWire("return", [{ x: 60, y: 120 }, { x: 140, y: 120 }])
    );
    authorFixture(document);
    setComponentPinVisibility(component, "vdd", true);
    setComponentPinVisibility(component, "gnd", true);
    authorFixture(document);
    const beforeWires = structuredClone(document.wires);
    let netlist = extractNetlist(document);
    for (const id of ["vdd", "gnd"]) {
      const point = componentPinPoint(component, id);
      expect(netlist.pins.find(pin => pin.pinId === id)?.point).toEqual(point);
      expect(netlist.nets.get(netlist.components[0].pins[id])).toContainEqual({ x: 60, y: id === "vdd" ? 80 : 120 });
    }
    expect(netlist.components[0].pins.gnd).not.toBe("0");
    document.components.push(fixtureComponent("gnd", "GND1", 100, 140));
    authorFixture(document);
    expect(extractNetlist(document).components[0].pins.gnd).toBe("0");
    setComponentPinVisibility(component, "vdd", false);
    authorFixture(document);
    netlist = extractNetlist(document);
    expect(netlist.components[0].pins.vdd).toBeUndefined();
    expect(netlist.components[0].pins.gnd).toBe("0");
    expect(document.wires).toEqual(beforeWires);
  });

  it.each([0, 90, 180, 270])("keeps supply pins grid-aligned at %s degrees when mirrored", (rotation) => {
    const { component } = fixture();
    setComponentPinVisibility(component, "vdd", true);
    setComponentPinVisibility(component, "gnd", true);
    component.rotation = rotation;
    component.mirrored = true;
    for (const id of ["vdd", "gnd"]) {
      const point = componentPinPoint(component, id);
      expect(point.x % 20).toBe(0);
      expect(point.y % 20).toBe(0);
      expect(Math.abs(point.x - 100) + Math.abs(point.y - 100)).toBe(20);
    }
    expect(componentPinPoint(component, "vdd")).not.toEqual(componentPinPoint(component, "gnd"));
  });

  it("allows replacing a two-pin inverter but protects exposed supply connections", () => {
    const { component } = fixture();
    expect(canChangeComponentCell(component, "amp")).toBe(true);
    setComponentPinVisibility(component, "vdd", true);
    expect(canChangeComponentCell(component, "amp")).toBe(false);
    setComponentPinVisibility(component, "vdd", false);
    setComponentPinVisibility(component, "gnd", true);
    expect(canChangeComponentCell(component, "digitalBuffer")).toBe(false);
  });

  it("round-trips independent settings and restores them through Undo/Redo", () => {
    const { component, document } = fixture();
    const history = createSchematicContentHistoryAdapter(contentFromDocument(document));
    for (const id of ["vdd", "gnd"]) {
      const outcome = executeSchematicPropertyBatchCommand(document, { selectedIds: [component.id], selectedNoteIds: [] }, { kind: "component-pin-visibility", pinId: id, visible: true });
      expect(outcome).toMatchObject({ changed: true, historyIntent: "push" });
      history.push(contentFromDocument(document));
    }
    const undo = history.undo()!;
    expect(componentPinVisible(undo.components[0], "vdd")).toBe(true);
    expect(componentPinVisible(undo.components[0], "gnd")).toBe(false);
    const restored = parseSchematicContent(serializeSchematicContent(undo));
    expect(componentPinVisible(restored.components[0], "vdd")).toBe(true);
    expect(componentPinVisible(restored.components[0], "gnd")).toBe(false);
    const redo = history.redo()!;
    expect(componentPinVisible(redo.components[0], "vdd")).toBe(true);
    expect(componentPinVisible(redo.components[0], "gnd")).toBe(true);
  });
});
