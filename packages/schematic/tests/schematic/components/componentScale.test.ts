import { describe, expect, it } from "vitest";
import { COMPONENT_CATALOG, getComponentVariants, resolveComponentDef, resolveComponentPinOptions } from "../../../src/schematic/catalog";
import { COMPONENT_SCALES, supportsComponentScale } from "../../../src/schematic/componentScaleModel";
import { resolveComponentVisualModel } from "../../../src/schematic/componentVisualModel";
import { componentCellAttrs, makeComponentCell } from "../../../src/schematic/componentRenderer";
import { renderComponentSvg } from "../../../src/schematic/componentSvgRenderer";
import { componentPinPoint } from "../../../src/schematic/netlist";
import { executeSchematicPropertyBatchCommand } from "../../../src/schematic/propertyBatchCommands";
import { buildSchematicPropertyPanelInput } from "../../../src/schematic/propertyPanelProjection";
import { parseSchematicDocumentFile, serializeSchematicDocumentFile } from "../../../src/schematic/schematicDocumentFile";
import { copySourceFromDocument, instantiateCopyAt } from "../../../src/schematic/copyModel";
import { triangleVertexWorldPoint, setTriangleVertex } from "../../../src/schematic/triangleComponentModel";
import { componentExportBounds } from "../../../src/schematic/componentExportBounds";
import type { ComponentType } from "../../../src/schematic/types";
import { fixtureComponent, fixtureWire } from "../support/fixtures";
import { fixtureDocument } from "../support/fixtureDocument";
import { createSchematicDocumentHistoryAdapter } from "../support/documentHistory";

describe("component sizes", () => {
  it.each(Object.keys(COMPONENT_CATALOG) as ComponentType[])("keeps %s pins on-grid with stable IDs through views, rotations and mirrors", type => {
    const variants = getComponentVariants(type);
    for (const variantId of variants.length ? variants.map(v => v.id) : [undefined]) {
      const original = { ...fixtureComponent(type, "X1", 200, 200), variantId };
      for (const scale of COMPONENT_SCALES.filter(scale => supportsComponentScale(type, scale))) {
        for (const rotation of [0, 90, 180, 270]) for (const mirrored of [false, true]) {
          const component = { ...original, scale, rotation, mirrored };
          const pins = resolveComponentDef(component).pins;
          expect(pins.map(p => p.id)).toEqual(resolveComponentDef(original).pins.map(p => p.id));
          for (const pin of resolveComponentPinOptions(component)) {
            expect(pin.x % 10 === 0 && pin.y % 10 === 0).toBe(true);
          }
          const cell = makeComponentCell(component);
          for (const pin of pins) {
            const base = componentPinPoint({ ...component, scale: 1 }, pin.id);
            const expected = { x: 200 + (base.x - 200) * scale, y: 200 + (base.y - 200) * scale };
            expect(componentPinPoint(component, pin.id)).toEqual(expected);
            const local = cell.getPortsPositions("pin")[pin.id];
            const world = cell.position().offset(local.x, local.y).rotate(cell.getBBox().center(), -rotation);
            expect(world.x).toBeCloseTo(expected.x);
            expect(world.y).toBeCloseTo(expected.y);
          }
          expect(renderComponentSvg(component)).not.toMatch(/NaN|Infinity/);
        }
      }
    }
  });

  it.each([0, 90, 180, 270])("preserves wired connectivity and undo while changing size at %s degrees", rotation => {
    const c = fixtureComponent("nmos", "M1", 200, 200, rotation);
    c.mirrored = true;
    const pin = componentPinPoint(c, "g");
    const end = { x: 200 + 5 * (pin.x - 200), y: 200 + 5 * (pin.y - 200) };
    const document = fixtureDocument({ components: [c], wires: [fixtureWire("w", [pin, end])] });
    const history = createSchematicDocumentHistoryAdapter(document);
    const selection = { selectedIds: [c.id], selectedNoteIds: [] };
    const connections = structuredClone(document.connections);
    const result = executeSchematicPropertyBatchCommand(document, selection, { kind: "component-scale", scale: 0.5 });
    expect(result).toMatchObject({ kind: "changed", historyIntent: "push", renderScope: "document" });
    expect(document.components[0]).toMatchObject({ x: 200, y: 200, scale: 0.5 });
    expect(document.wires[0].points[0]).toEqual(componentPinPoint(c, "g"));
    expect(document.wires[0].points.at(-1)).toEqual(end);
    expect(document.connections.pins[c.id].g).toBe(document.connections.wires.w[0]);
    expect(document.connections.pins[c.id].d).toBe(connections.pins[c.id].d);
    expect(document.connections.pins[c.id].s).toBe(connections.pins[c.id].s);
    expect(document.connections.wires.w[1]).toBe(connections.wires.w[1]);
    history.push(document);
    expect(history.undo()!.components[0].scale).toBeUndefined();
    expect(history.redo()).toEqual(document);
    expect(executeSchematicPropertyBatchCommand(document, selection, { kind: "component-scale", scale: 0.5 }).historyIntent).toBe("none");
  });

  it.each(["rectangle", "triangle", "spntSwitch"] as const)("rejects half-size %s in commands, UI and imported files", type => {
    const c = fixtureComponent(type, "X1", 200, 200);
    const document = fixtureDocument({ components: [c] });
    const result = executeSchematicPropertyBatchCommand(document, { selectedIds: [c.id], selectedNoteIds: [] }, { kind: "component-scale", scale: 0.5 });
    expect(result.kind).toBe("rejected");
    expect(c.scale).toBeUndefined();
    const panel = buildSchematicPropertyPanelInput({ document, hasSelection: true, targets: { components: [c], wires: [], notes: [], netLabels: [], junctionPoints: [] } });
    expect(panel.component?.scale?.options.map(option => option.id)).toEqual(["1", "2"]);
    const raw = JSON.parse(serializeSchematicDocumentFile(document));
    raw.schematic.components[0].scale = 0.5;
    expect(() => parseSchematicDocumentFile(JSON.stringify(raw))).toThrow();
  });

  it("preserves size through save, selection copy and placement preview", () => {
    const c = { ...fixtureComponent("diode", "ndio_18", 200, 200, 270), scale: 0.5 as const };
    const document = fixtureDocument({ components: [c] });
    expect(parseSchematicDocumentFile(serializeSchematicDocumentFile(document)).components[0].scale).toBe(0.5);
    const copy = instantiateCopyAt({ source: copySourceFromDocument(document), anchor: { x: 200, y: 200 } }, { x: 400, y: 400 },
      { preview: true, createId: () => "copy", nextComponentRef: () => "D2" });
    expect(copy.components[0]).toMatchObject({ scale: 0.5, x: 400, y: 400 });
    expect(renderComponentSvg(copy.components[0], { preview: true })).toContain("scale(0.5)");
    expect(componentExportBounds(c).width).toBeGreaterThan(resolveComponentDef(c).size.height / 2);
  });

  it("scales body strokes while retaining terminal strokes and external label size", () => {
    const original = fixtureComponent("resistor", "R123", 200, 200);
    const base = resolveComponentVisualModel(original);
    for (const scale of [0.5, 2] as const) {
      const c = { ...original, scale };
      const model = resolveComponentVisualModel(c);
      const attrs = componentCellAttrs(c);
      expect(model.refLabelHeadFontSize).toBe(base.refLabelHeadFontSize);
      expect(attrs.symbolTerminalLeads.strokeWidth * scale).toBe(2);
      expect(attrs.symbolBody.strokeWidth * scale).toBe(base.symbolStrokeWidth * scale);
      expect(model.terminalLeadPath).toContain("M 10 28 L");
      expect(renderComponentSvg(c)).toContain('data-selector="symbolTerminalLeads"');
    }
  });

  it("only shrinks internal text as necessary and never enlarges it", () => {
    for (const type of ["adc", "delay", "integrator", "dff"] as const) {
      const c = fixtureComponent(type, "X1", 200, 200);
      const base = resolveComponentVisualModel(c);
      const large = resolveComponentVisualModel({ ...c, scale: 2 });
      const small = resolveComponentVisualModel({ ...c, scale: 0.5 });
      expect(large.labelLayout.fontSize).toBe(base.labelLayout.fontSize);
      expect(small.labelLayout.fontSize).toBeLessThanOrEqual(base.labelLayout.fontSize);
      base.symbolContentLayout?.runs.forEach((run, i) => {
        expect(large.symbolContentLayout!.runs[i].fontSize).toBe(run.fontSize);
        expect(small.symbolContentLayout!.runs[i].fontSize).toBeLessThanOrEqual(run.fontSize);
      });
    }
  });

  it.each([0, 90, 180, 270])("keeps the DFF overbar attached to its text at %s degrees", rotation => {
    const c = fixtureComponent("dff", "FF1", 200, 200, rotation);
    c.values = { dffSetMode: "synchronous", dffResetMode: "asynchronous" };
    const base = resolveComponentVisualModel(c).symbolContentLayout!;
    for (const scale of [0.5, 2] as const) {
      const layout = resolveComponentVisualModel({ ...c, scale }).symbolContentLayout!;
      base.paths.forEach((path, i) => {
        const pivot = path.counterRotation!;
        const index = base.runs.findIndex(run => run.x === pivot.x && run.y === pivot.y);
        expect(index).toBeGreaterThanOrEqual(0);
        const scaled = layout.paths[i];
        expect(scaled.translateX + pivot.x * scaled.scale!).toBeCloseTo(layout.runs[index].x);
        expect(scaled.translateY + pivot.y * scaled.scale!).toBeCloseTo(layout.runs[index].y);
        expect(scaled.scale).toBeCloseTo(layout.runs[index].fontSize / base.runs[index].fontSize);
      });
    }
  });

  it("resizes both ends of a wire in a single batch without changing the net", () => {
    const first = fixtureComponent("resistor", "R1", 200, 200);
    const second = fixtureComponent("resistor", "R2", 400, 200);
    const firstPin = resolveComponentDef(first).pins[1].id;
    const secondPin = resolveComponentDef(second).pins[0].id;
    const document = fixtureDocument({ components: [first, second], wires: [fixtureWire("w", [
      componentPinPoint(first, firstPin), componentPinPoint(second, secondPin)
    ])] });
    const result = executeSchematicPropertyBatchCommand(document,
      { selectedIds: [first.id, second.id], selectedNoteIds: [] }, { kind: "component-scale", scale: 2 });
    expect(result.kind).toBe("changed");
    expect(document.wires[0].points).toEqual([componentPinPoint(first, firstPin), componentPinPoint(second, secondPin)]);
    expect(document.connections.pins[first.id][firstPin]).toBe(document.connections.wires.w[0]);
    expect(document.connections.pins[second.id][secondPin]).toBe(document.connections.wires.w[1]);
  });

  it.each([0, 90, 180, 270])("reshapes a doubled triangle without moving the other vertices at %s degrees", rotation => {
    const c = { ...fixtureComponent("triangle", "X1", 200, 200, rotation), scale: 2 as const, mirrored: true };
    const b = triangleVertexWorldPoint(c, "b"), a = triangleVertexWorldPoint(c, "a"), end = triangleVertexWorldPoint(c, "c");
    expect(setTriangleVertex(c, "a", { x: a.x + 40, y: a.y - 40 }).kind).toBe("changed");
    expect(triangleVertexWorldPoint(c, "b")).toEqual(b);
    expect(triangleVertexWorldPoint(c, "c")).toEqual(end);
  });
});
