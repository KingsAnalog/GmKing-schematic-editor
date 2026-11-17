import { describe, expect, it } from "vitest";
import { snapPoint } from "../../../src/schematic/geometry";
import { componentPinPoint } from "../../../src/schematic/netlist";
import { netNameForPin, resolveSchematicNets } from "../../../src/schematic/netResolution";
import { wireAttachmentAtPoint } from "../../../src/schematic/netLabelModel";
import { parseSchematicDocumentFile, serializeSchematicDocumentFile } from "../../../src/schematic/schematicDocumentFile";
import { beginSelectionMoveTransaction, applySelectionMoveTransaction } from "../../../src/schematic/selection/selectionMoveTransaction";
import { createSchematicDocumentHistoryAdapter } from "../support/documentHistory";
import { fixtureDocument } from "../support/fixtureDocument";
import { fixtureComponent, fixtureWire } from "../support/fixtures";

describe("10 px interaction grid", () => {
  it("preserves positions between the old grid lines when stretching, saving and undoing a component move", () => {
    const first = fixtureComponent("resistor", "R1", 210, 230);
    const second = fixtureComponent("resistor", "R2", 350, 230);
    const document = fixtureDocument({
      components: [first, second],
      wires: [fixtureWire("wire", [componentPinPoint(first, "n"), componentPinPoint(second, "p")])]
    });
    const original = serializeSchematicDocumentFile(document);
    expect(serializeSchematicDocumentFile(parseSchematicDocumentFile(original))).toBe(original);
    const history = createSchematicDocumentHistoryAdapter(document);
    const transaction = beginSelectionMoveTransaction({
      document, activeComponentId: first.id, selectedIds: new Set([first.id]), selectedNoteIds: new Set()
    })!;
    const next = snapPoint({ x: first.x + 11, y: first.y - 11 });
    Object.assign(first, next);
    applySelectionMoveTransaction({ document, transaction, moveBehavior: "stretch" });
    expect(next).toEqual({ x: 220, y: 220 });
    expect(document.wires[0].points[0]).toEqual(componentPinPoint(first, "n"));
    expect(document.wires.flatMap(wire => wire.points)).toContainEqual(componentPinPoint(second, "p"));
    const nets = resolveSchematicNets(document);
    expect(netNameForPin(nets, first.id, "n")).toBe(netNameForPin(nets, second.id, "p"));
    const moved = serializeSchematicDocumentFile(document);
    expect(serializeSchematicDocumentFile(parseSchematicDocumentFile(moved))).toBe(moved);
    history.push(document);
    expect(serializeSchematicDocumentFile(history.undo()!)).toBe(original);
    expect(serializeSchematicDocumentFile(history.redo()!)).toBe(moved);
  });

  it("keeps parallel wires one fine-grid step apart electrically separate", () => {
    const document = fixtureDocument({ wires: [
      fixtureWire("top", [{ x: 10, y: 10 }, { x: 110, y: 10 }]),
      fixtureWire("bottom", [{ x: 10, y: 20 }, { x: 110, y: 20 }])
    ] });
    expect(document.wires[0].points[0]).toEqual({ x: 10, y: 10 });
    const topNodes = new Set(document.connections.wires.top);
    expect(document.connections.wires.bottom.some(node => topNodes.has(node))).toBe(false);
    expect(parseSchematicDocumentFile(serializeSchematicDocumentFile(document)).wires).toEqual(document.wires);
  });

  it("attaches labels to intermediate points on short diagonal wires", () => {
    const diagonal = { ...fixtureWire("diagonal", [{ x: 10, y: 10 }, { x: 50, y: 30 }]), routeMode: "freeAngle" as const };
    const document = fixtureDocument({ wires: [diagonal] });
    expect(wireAttachmentAtPoint(document, { x: 30, y: 20 }))
      .toEqual({ wireId: "diagonal", point: { x: 30, y: 20 } });
  });
});
