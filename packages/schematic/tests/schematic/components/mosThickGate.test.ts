import { describe, expect, it } from "vitest";
import { getComponentVariants, resolveComponentDef } from "../../../src/schematic/catalog";
import { mosThickGate, setMosThickGate } from "../../../src/schematic/mosViewModel";
import { componentPinPoint } from "../../../src/schematic/netlist";
import { componentValueIssue } from "../../../src/schematic/componentValueSchema";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { renderComponentSvg } from "../../../src/schematic/componentSvgRenderer";
import { componentFrameBox } from "../../../src/schematic/view-geometry";
import { executeSchematicPropertyBatchCommand } from "../../../src/schematic/propertyBatchCommands";
import { parseSchematicDocumentFile, serializeSchematicDocumentFile } from "../../../src/schematic/schematicDocumentFile";
import { buildCopySource, instantiateCopyAt } from "../../../src/schematic/copyModel";
import { fixtureDocument } from "../support/fixtureDocument";
import { fixtureComponent, fixtureWire } from "../support/fixtures";
import { createSchematicDocumentHistoryAdapter } from "../support/documentHistory";

const thickBar = "M 18 36 L 24 36 L 24 64 L 18 64 Z";

describe("MOS thick gate", () => {
  it.each(["nmos", "pmos"] as const)("uses a 3a gate extended only to the right with unchanged pins, channel and frame in every %s view", type => {
    for (const variant of getComponentVariants(type)) {
      for (const circle of [false, true]) {
        const instance = { ...fixtureComponent(type, "M1", 200, 200), variantId: variant.id };
        instance.values.transistorCircle = String(circle);
        const thinDef = resolveComponentDef(instance);
        const thinFrame = componentFrameBox(thinDef);
        expect(mosThickGate(instance)).toBe(false);
        expect(setMosThickGate(instance, true).kind).toBe("changed");
        const thickDef = resolveComponentDef(instance);
        expect(thickDef.pins).toEqual(thinDef.pins);
        expect(thickDef.size).toEqual(thinDef.size);
        expect(componentFrameBox(thickDef)).toEqual(thinFrame);
        for (const rotation of [0, 90, 180, 270]) {
          Object.assign(instance, { rotation, mirrored: rotation >= 180 });
          const cell = makeComponentCell(instance);
          expect(cell.attr("symbolMarker/d")).toContain(thickBar);
          expect(cell.attr("symbolAccent/d")).toBe("M 28 32 L 28 68");
          expect(cell.attr("symbolAccent/strokeWidth")).toBe(4);
          expect(cell.attr("symbolBody/strokeWidth")).toBe(2);
          expect(renderComponentSvg(instance)).toContain(thickBar);
        }
        expect(componentValueIssue(instance)).toBeNull();
        expect(setMosThickGate(instance, false).kind).toBe("changed");
        expect(instance.values.mosThickGate).toBeUndefined();
        expect(resolveComponentDef(instance).symbol).toBe(thinDef.symbol);
      }
    }
  });

  it("keeps the PMOS gate bubble and leads unchanged when thickening its gate", () => {
    const instance = fixtureComponent("pmos", "M1", 0, 0);
    instance.variantId = "3pin-gate";
    const pin = componentPinPoint(instance, "g");
    const thinBody = makeComponentCell(instance).attr("symbolBody/d");
    setMosThickGate(instance, true);
    const cell = makeComponentCell(instance);
    expect(cell.attr("symbolBody/d")).toBe(thinBody);
    expect(cell.attr("symbolMarker/d")).toBe(thickBar);
    expect(componentPinPoint(instance, "g")).toEqual(pin);
  });

  it("preserves the setting through batch history, view changes, copy, and file round trips", () => {
    const instance = fixtureComponent("nmos", "M1", 200, 200);
    const wire = fixtureWire("g-wire", [{ x: 40, y: 200 }, componentPinPoint(instance, "g")!]);
    const document = fixtureDocument({ components: [instance], wires: [wire] });
    const history = createSchematicDocumentHistoryAdapter(document);
    const selection = { selectedIds: [instance.id], selectedNoteIds: [] };
    expect(executeSchematicPropertyBatchCommand(document, selection, { kind: "component-mos-thick-gate", thick: true }))
      .toMatchObject({ kind: "changed", historyIntent: "push", renderScope: "incremental" });
    expect(history.push(document)).toBe(true);
    expect(mosThickGate(history.undo()!.components[0])).toBe(false);
    expect(mosThickGate(history.redo()!.components[0])).toBe(true);
    const connections = structuredClone(document.connections);
    executeSchematicPropertyBatchCommand(document, selection, { kind: "component-mos-view", patch: { gateStyle: true }, moveBehavior: "stretch" });
    executeSchematicPropertyBatchCommand(document, selection, { kind: "component-cell", type: "pmos" });
    expect(mosThickGate(document.components[0])).toBe(true);
    expect(document.wires).toEqual([wire]);
    expect(document.connections).toEqual(connections);
    const restored = parseSchematicDocumentFile(serializeSchematicDocumentFile(document));
    expect(mosThickGate(restored.components[0])).toBe(true);
    const copy = instantiateCopyAt({ source: buildCopySource({ ...document, junctionPoints: [], junctionKeys: new Set() }), anchor: { x: 0, y: 0 } }, { x: 400, y: 0 }, {
      preview: false, nextComponentRef: () => "M2", createId: () => "copy"
    });
    expect(mosThickGate(copy.components[0])).toBe(true);
  });
});
