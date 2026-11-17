import { describe, expect, it, vi } from "vitest";
import { getComponentVariants, resolveComponentDef } from "../../../src/schematic/catalog";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { renderComponentSvg } from "../../../src/schematic/componentSvgRenderer";
import { resolveComponentVisualModel } from "../../../src/schematic/componentVisualModel";
import { inductorLayout, setInductorLayout, setInductorTap } from "../../../src/schematic/inductorModel";
import { SchematicPropertyInteractionController } from "../../../src/schematic/propertyInteractionController";
import { componentPinPoint } from "../../../src/schematic/netlist";
import { executeSchematicPropertyBatchCommand } from "../../../src/schematic/propertyBatchCommands";
import { parseSchematicDocumentFile, serializeSchematicDocumentFile } from "../../../src/schematic/schematicDocumentFile";
import { inductorSymbol } from "../../../src/schematic/symbols/passiveSymbols";
import { componentVisualBounds } from "../../../src/schematic/view-geometry";
import { fixtureComponent, fixtureWire } from "../support/fixtures";
import { fixtureDocument } from "../support/fixtureDocument";
import { createSchematicDocumentHistoryAdapter } from "../support/documentHistory";

function planar(rotation = 0, mirrored = false) {
  return { ...fixtureComponent("inductor", "L1", 200, 200), variantId: "planar", rotation, mirrored };
}

describe("planar inductor view", () => {
  it("retains the coil as default and exposes the new view", () => {
    expect(getComponentVariants("inductor").map(v => v.id)).toEqual(["coil", "planar"]);
    expect(getComponentVariants("inductor").map(v => v.label)).toEqual(["schematic", "layout"]);
    const old = fixtureComponent("inductor", "L1", 200, 200);
    expect(resolveComponentVisualModel(old).path).toBe(inductorSymbol(100, 56));
    expect(resolveComponentDef(old).pins.map(({ id, x, y }) => ({ id, x, y })))
      .toEqual([{ id: "p", x: -40, y: 0 }, { id: "n", x: 40, y: 0 }]);
  });

  it("renders a doubled 160px winding with 6a gaps and standard 80px terminal spacing", () => {
    const component = planar();
    const cell = makeComponentCell(component);
    expect(componentPinPoint(component, "p")).toEqual({ x: 160, y: 320 });
    expect(componentPinPoint(component, "n")).toEqual({ x: 240, y: 320 });
    expect(cell.attr("symbolBody/strokeWidth")).toBe(2);
    expect(cell.attr("symbolAccent/strokeWidth")).toBe(12);
    expect(resolveComponentVisualModel(component).accentPath).toContain("L 46 46");
    expect(resolveComponentVisualModel(component).accentPath).toContain("L 194 194");
    expect(resolveComponentVisualModel(component).accentPath).toContain("M 80 220 L 80 194");
    expect(resolveComponentVisualModel(component).accentPath).toContain("L 160 194 L 160 220");
    expect(resolveComponentVisualModel(component).accentPath).toContain("L 108 46 L 132 70");
    expect(resolveComponentVisualModel(component).accentPath).toContain("L 170 170 L 70 170 L 70 70");
    expect(resolveComponentVisualModel(component).path).toBe("M 80 220 L 80 240 M 160 220 L 160 240");
    const svg = renderComponentSvg(component);
    expect(svg).toMatch(/data-selector="symbolAccent"[^>]*stroke-width="12"/);
    for (const tap of ["top", "bottom", "none"] as const) {
      setInductorTap(component, tap);
      expect(resolveComponentDef(component).pins.map(p => p.id)).toEqual(tap === "none" ? ["p", "n"] : ["p", "n", "ct"]);
      if (tap !== "none") {
        expect(componentPinPoint(component, "ct")).toEqual({ x: 200, y: tap === "top" ? 220 : 320 });
        expect(resolveComponentVisualModel(component).path).toContain(`M 120 170 L 120 ${tap === "top" ? 140 : 240}`);
      }
    }
  });

  it("draws a single outer turn without an inner winding or crossover, keeping the same terminals", () => {
    const component = planar();
    setInductorTap(component, "top");
    const pins = resolveComponentDef(component).pins;
    const bounds = componentVisualBounds(component);
    setInductorLayout(component, "single");
    const visual = resolveComponentVisualModel(component);
    expect(visual.accentPath).toBe("M 80 220 L 80 194 L 46 194 L 46 46 L 194 46 L 194 194 L 160 194 L 160 220");
    expect(visual.path).toContain("M 120 46 L 120 140");
    expect(resolveComponentDef(component).pins).toEqual(pins);
    expect(componentVisualBounds(component)).toEqual(bounds);
    expect(makeComponentCell(component).attr("symbolAccent/strokeWidth")).toBe(12);
    setInductorTap(component, "bottom");
    expect(resolveComponentVisualModel(component).path).toContain("M 120 46 L 120 240");
  });

  it.each(["single", "double"] as const)("preserves %s layout pins, exports and saved settings across rotations", layout => {
    for (const rotation of [0, 90, 180, 270]) {
    for (const mirrored of [false, true]) {
      const component = planar(rotation, mirrored);
      setInductorLayout(component, layout);
      component.values.inductorTap = "top";
      component.values.inductorDot = "p";
      const frame = componentVisualBounds(component);
      const points = resolveComponentDef(component).pins.map(p => componentPinPoint(component, p.id));
      expect(new Set(points.map(p => `${p.x},${p.y}`)).size).toBe(3);
      points.forEach(p => {
        expect(p.x % 10).toBe(0);
        expect(p.y % 10).toBe(0);
        expect(p.x).toBeGreaterThanOrEqual(frame.x);
        expect(p.x).toBeLessThanOrEqual(frame.x + frame.width);
        expect(p.y).toBeGreaterThanOrEqual(frame.y);
        expect(p.y).toBeLessThanOrEqual(frame.y + frame.height);
      });
      const cell = makeComponentCell(component);
      const svg = renderComponentSvg(component);
      for (const selector of ["symbolBody", "symbolAccent", "symbolMarker"]) {
        expect(svg).toContain(`d="${cell.attr(`${selector}/d`)}"`);
      }
      const document = fixtureDocument({ components: [component] });
      expect(parseSchematicDocumentFile(serializeSchematicDocumentFile(document)).components).toEqual(document.components);
    }
    }
  });

  it("switches layout through the editor callback with one undo step and no changes to connected wires", () => {
    const component = planar();
    setInductorTap(component, "top");
    const wires = ["p", "n", "ct"].map(id => {
      const pin = componentPinPoint(component, id);
      return fixtureWire(id, [pin, { x: pin.x + 100, y: pin.y }]);
    });
    const document = fixtureDocument({ components: [component], wires });
    const before = structuredClone(document);
    const history = createSchematicDocumentHistoryAdapter(document);
    const render = vi.fn();
    const commit = vi.fn(() => history.push(document));
    const controller = new SchematicPropertyInteractionController({
      document, selection: () => ({ selectedIds: [component.id], selectedNoteIds: [] }), moveBehavior: () => "stretch",
      render, commit, restorePreview: vi.fn(), renderPanel: vi.fn(), rebuildCounters: vi.fn(),
      status: vi.fn(), scheduler: { request: () => 1, cancel: vi.fn() }
    });
    controller.callbacks({}).onComponentInductorLayoutChange!("single");
    expect(inductorLayout(component)).toBe("single");
    expect(document.wires).toEqual(before.wires);
    expect(document.connections).toEqual(before.connections);
    controller.callbacks({}).onComponentInductorLayoutChange!("single");
    expect(commit).toHaveBeenCalledTimes(1);
    expect(render).toHaveBeenCalledTimes(1);
    expect(history.undo()).toEqual(before);
    const redone = history.redo()!;
    expect(inductorLayout(redone.components[0])).toBe("single");
    expect(redone.wires).toEqual(before.wires);
    expect(redone.connections).toEqual(before.connections);
    executeSchematicPropertyBatchCommand(document,
      { selectedIds: [component.id], selectedNoteIds: [] },
      { kind: "component-variant", variantId: "coil", moveBehavior: "stretch" });
    expect(parseSchematicDocumentFile(serializeSchematicDocumentFile(document)).components[0].values.inductorLayout).toBe("single");
  });

  it("keeps all three wired terminals connected across view changes and Undo/Redo", () => {
    const component = fixtureComponent("inductor", "L1", 200, 200);
    component.values.inductorTap = "top";
    const ids = ["p", "n", "ct"];
    const before = ids.map(id => componentPinPoint(component, id));
    const wires = before.map((point, index) => fixtureWire(ids[index], [
      { x: point.x, y: point.y - 100 }, point
    ]));
    const document = fixtureDocument({ components: [component], wires });
    const history = createSchematicDocumentHistoryAdapter(document);
    const result = executeSchematicPropertyBatchCommand(document,
      { selectedIds: [component.id], selectedNoteIds: [] },
      { kind: "component-variant", variantId: "planar", moveBehavior: "stretch" });
    expect(result).toMatchObject({ kind: "changed", historyIntent: "push", renderScope: "document" });
    ids.forEach(id => {
      expect(document.wires.find(w => w.id === id)?.points.at(-1)).toEqual(componentPinPoint(component, id));
      expect(document.connections.wires[id].at(-1)).toBe(document.connections.pins[component.id][id]);
    });
    expect(history.push(document)).toBe(true);
    const undone = history.undo()!;
    before.forEach((p, i) => expect(undone.wires.find(w => w.id === ids[i])?.points.at(-1)).toEqual(p));
    const redone = history.redo()!;
    expect(redone.components[0].variantId).toBe("planar");
    expect(redone.connections).toEqual(document.connections);
  });
});
