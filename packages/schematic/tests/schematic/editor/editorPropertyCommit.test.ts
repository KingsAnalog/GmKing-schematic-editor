// @vitest-environment jsdom
import { authorFixture } from "../support/fixtureDocument";

import { SchematicPropertyInteractionController } from "../../../src/schematic/propertyInteractionController";

import { describe, expect, it, vi } from "vitest";
import { SchematicEditor } from "../../../src/schematic/editor";
import { contentFromDocument, createEmptySchematicDocument } from "../../../src/schematic/document/documentModel";
import { createSchematicContentHistoryAdapter } from "../../../src/schematic/document/contentHistoryAdapter";
import type { SchematicPropertyBatchCommand, SchematicPropertyBatchCommandResult } from "../../../src/schematic/propertyBatchCommands";
import type { SchematicDocument } from "../../../src/schematic/types";
import type { PointerClickRoutingIntent } from "../../../src/schematic/pointerClickRoutingModel";
import { fixtureComponent, fixtureWire } from "../support/fixtures";
import { addInductorCoupling, updateInductorCoupling } from "../../../src/schematic/inductorCouplingModel";
import { componentPinPoint } from "../../../src/schematic/netlist";
import { inductorLayout } from "../../../src/schematic/inductorModel";
import { serializeSchematicDocumentFile, parseSchematicDocumentFile } from "../../../src/schematic/schematicDocumentFile";

const methods = SchematicEditor.prototype as unknown as {
  applyPointerClickIntent(this: unknown, intent: PointerClickRoutingIntent, event: MouseEvent): void;
  renderIncrementalPropertyBatch(this: unknown, outcome: SchematicPropertyBatchCommandResult): void;
};

function runtime(document: SchematicDocument, selectedIds: string[]) {
  const history = createSchematicContentHistoryAdapter(contentFromDocument(document));
  let interactions!: SchematicPropertyInteractionController;
  const editor = {
    get propertyInteractions() { return interactions; },
    document,
    selectionSession: { selectedIds: new Set(selectedIds), selectedNoteIds: new Set<string>() },
    renderDocument: vi.fn(),
    rebuildCounters: vi.fn(),
    renderNotes: vi.fn(),
    renderInductorCouplings: vi.fn(),
    setStatus: vi.fn(),
    selectCell(id: string) {
      this.selectionSession.selectedIds = new Set([id]);
      this.selectionSession.selectedNoteIds.clear();
    },
    incrementalRenderer: {
      runWithDocumentGeometryGuard: vi.fn((render: () => void) => render()),
      replaceComponent: vi.fn(),
      replaceWire: vi.fn(),
      replaceJunction: vi.fn()
    },
    consumeHistoryIntent: vi.fn(() => history.push(contentFromDocument(document))),
    runSelectedPropertyBatchCommand(command: SchematicPropertyBatchCommand): SchematicPropertyBatchCommandResult {
      return interactions.run(command);
    },
    renderIncrementalPropertyBatch(outcome: SchematicPropertyBatchCommandResult) {
      methods.renderIncrementalPropertyBatch.call(this, outcome);
    }
  };
  interactions = new SchematicPropertyInteractionController({
    document, selection: () => editor.selectionSession, moveBehavior: () => "stretch",
    render: outcome => outcome.renderScope === "document" ? editor.renderDocument() : editor.renderIncrementalPropertyBatch(outcome),
    restorePreview: () => editor.renderDocument(), renderPanel: vi.fn(),
    rebuildCounters: editor.rebuildCounters, commit: () => { editor.consumeHistoryIntent(); },
    status: editor.setStatus, scheduler: { request: () => 1, cancel: vi.fn() }
  });
  return { editor, history };
}

describe("editor property commits", () => {
  it.each([2, 3])("changes turns for %s layout inductors in one commit while preserving wires and every coupling", count => {
    const document = createEmptySchematicDocument();
    document.components = [0, 1, 2].map(i => ({ ...fixtureComponent("inductor", `L${i + 1}`, 200 + i * 300, 200, i * 90),
      variantId: "planar", scale: ([0.5, 1, 2] as const)[i], mirrored: i === 1,
      values: { main: `L${i + 1}`, inductorTap: "top", inductorLayout: i === 1 ? "single" : "double" }
    }));
    document.wires = document.components.flatMap(c => ["p", "n", "ct"].map(pin => {
      const point = componentPinPoint(c, pin);
      return fixtureWire(`${c.id}-${pin}`, [point, { x: point.x, y: point.y + 40 }]);
    }));
    authorFixture(document);
    addInductorCoupling(document, "L1", "L2", "K12");
    addInductorCoupling(document, "L2", "L3", "K23");
    addInductorCoupling(document, "L1", "L3", "K13");
    updateInductorCoupling(document, "K12", { coefficient: "0.8", coefficientAuto: false, showCore: true, arcFlipped: true });
    const before = contentFromDocument(document);
    const selectedIds = document.components.slice(0, count).map(c => c.id);
    const { editor, history } = runtime(document, selectedIds);
    const change = editor.propertyInteractions.callbacks({}).onComponentInductorLayoutChange!;
    change("single");
    const expected = structuredClone(before);
    expected.components.slice(0, count).forEach(c => { c.values.inductorLayout = "single"; });
    expect(contentFromDocument(document)).toEqual(expected);
    expect(editor.consumeHistoryIntent).toHaveBeenCalledOnce();
    expect(editor.incrementalRenderer.replaceComponent.mock.calls.map(call => call[0].id)).toEqual(count === 2 ? ["L1"] : ["L1", "L3"]);
    expect(editor.renderInductorCouplings).toHaveBeenCalledOnce();
    expect(editor.incrementalRenderer.replaceWire).not.toHaveBeenCalled();
    expect(editor.selectionSession.selectedIds).toEqual(new Set(selectedIds));
    change("single");
    expect(editor.consumeHistoryIntent).toHaveBeenCalledOnce();
    expect(history.undo()).toEqual(before);
    expect(history.undo()).toBeNull();
    expect(history.redo()).toEqual(expected);
    expect(contentFromDocument(parseSchematicDocumentFile(serializeSchematicDocumentFile(document)))).toEqual(expected);
    change("double");
    expect(document.components.slice(0, count).map(inductorLayout)).toEqual(Array(count).fill("double"));
    expect(document.inductorCouplings).toEqual(before.inductorCouplings);
    expect(document.connections).toEqual(before.connections);
    expect(document.wires).toEqual(before.wires);
  });

  it("flushes a pending property edit once before a discrete command and cancels the next preview", () => {
    const document = createEmptySchematicDocument();
    document.components.push(fixtureComponent("resistor", "R1", 0, 0));
    authorFixture(document);
    const { editor, history } = runtime(document, ["R1"]);
    const controller = editor.propertyInteractions;
    controller.preview("component-value", { kind: "component-value", value: "10k" });
    controller.run({ kind: "component-label-visibility", visible: false });
    expect(editor.consumeHistoryIntent).toHaveBeenCalledTimes(2);
    controller.preview("component-value", { kind: "component-value", value: "20k" });
    controller.cancel("component-value");
    controller.flush();
    expect(document.components[0].values.main).toBe("10k");
    expect(editor.consumeHistoryIntent).toHaveBeenCalledTimes(2);
    expect(history.undo()?.components[0].values.main).toBe("10k");
    expect(history.undo()?.components[0].values.main).toBe("R1");
    expect(history.undo()).toBeNull();
  });

  it.each(["switch", "spntSwitch"] as const)("cycles only the clicked %s with one undoable commit", type => {
    const document = createEmptySchematicDocument();
    const first = fixtureComponent(type, "S1", 100, 100);
    const other = fixtureComponent(type, "S2", 200, 100);
    document.components.push(first, other);
    authorFixture(document);
    const before = contentFromDocument(document);
    const { editor, history } = runtime(document, ["S1", "S2"]);
    methods.applyPointerClickIntent.call(editor, { kind: "cycle-switch", id: "S1" }, new MouseEvent("click"));
    if (type === "switch") expect(first.variantId).toBe("closed");
    else expect(first.values.switchPosition).toBe("2");
    expect(other).toEqual(before.components[1]);
    expect(editor.consumeHistoryIntent).toHaveBeenCalledOnce();
    const after = contentFromDocument(document);
    expect(history.undo()).toEqual(before);
    expect(history.undo()).toBeNull();
    expect(history.redo()).toEqual(after);
  });

  it("updates every selected component and records one reversible content change", () => {
    const document = createEmptySchematicDocument();
    document.components.push(fixtureComponent("resistor", "R1", 0, 0), fixtureComponent("resistor", "R2", 100, 0));
    authorFixture(document);
    const before = contentFromDocument(document);
    const { editor, history } = runtime(document, ["R1", "R2"]);
    editor.propertyInteractions.callbacks({}).onComponentValueChange!("10k");

    expect(document.components.map(component => component.values.main)).toEqual(["10k", "10k"]);
    expect(editor.consumeHistoryIntent).toHaveBeenCalledOnce();
    expect(editor.renderDocument).not.toHaveBeenCalled();
    expect(editor.incrementalRenderer.replaceComponent.mock.calls.map(call => call[0].id)).toEqual(["R1", "R2"]);
    expect(history.undo()).toEqual(before);
    expect(history.undo()).toBeNull();
    expect(history.redo()?.components.map(component => component.values.main)).toEqual(["10k", "10k"]);
  });

  it("rebuilds counters and redraws the document for a cell replacement", () => {
    const document = createEmptySchematicDocument();
    document.components.push(fixtureComponent("resistor", "R1", 0, 0));
    authorFixture(document);
    const { editor } = runtime(document, ["R1"]);
    editor.propertyInteractions.callbacks({}).onComponentCellChange!("capacitor");
    expect(document.components[0]).toMatchObject({ type: "capacitor", ref: "C1" });
    expect(editor.rebuildCounters).toHaveBeenCalledOnce();
    expect(editor.renderDocument).toHaveBeenCalledOnce();
    expect(editor.consumeHistoryIntent).toHaveBeenCalledOnce();
  });

  it("leaves history and rendering untouched for rejected or unchanged edits", () => {
    const document = createEmptySchematicDocument();
    document.components.push(fixtureComponent("resistor", "R1", 0, 0));
    authorFixture(document);
    const { editor, history } = runtime(document, ["R1"]);
    const before = contentFromDocument(document);
    editor.runSelectedPropertyBatchCommand({ kind: "component-color", color: "invalid" });
    editor.propertyInteractions.callbacks({}).onComponentValueChange!("R1");
    expect(contentFromDocument(document)).toEqual(before);
    expect(editor.consumeHistoryIntent).not.toHaveBeenCalled();
    expect(editor.renderDocument).not.toHaveBeenCalled();
    expect(editor.incrementalRenderer.runWithDocumentGeometryGuard).not.toHaveBeenCalled();
    expect(history.canUndo).toBe(false);
  });

  it("refreshes both component and wire ink within one geometry guard", () => {
    const document = createEmptySchematicDocument();
    document.components.push(fixtureComponent("resistor", "R1", 0, 0));
    authorFixture(document);
    document.wires.push(fixtureWire("w1", [{ x: 100, y: 0 }, { x: 200, y: 0 }]));
    authorFixture(document);
    const { editor } = runtime(document, ["R1", "w1"]);
    editor.runSelectedPropertyBatchCommand({ kind: "ink-color", color: "#0072b2" });
    expect(editor.incrementalRenderer.runWithDocumentGeometryGuard).toHaveBeenCalledOnce();
    expect(editor.incrementalRenderer.replaceComponent).toHaveBeenCalledWith(document.components[0]);
    expect(editor.incrementalRenderer.replaceWire).toHaveBeenCalledWith(document.wires[0]);
    expect(editor.renderDocument).not.toHaveBeenCalled();
    expect(editor.consumeHistoryIntent).toHaveBeenCalledOnce();
  });
});
