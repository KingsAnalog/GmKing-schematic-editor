import { authorFixture, fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { buildConnectivity, componentPinPoint } from "../../../src/schematic/connectivity";
import { reconcileConnectionEdit, disconnectJunction } from "../../../src/schematic/connectionGraph";
import { createEmptySchematicDocument } from "../../../src/schematic/document/documentModel";
import { applyNormalizedDocumentWires } from "../../../src/schematic/document/documentWires";
import { applyWireCommitToDocument } from "../../../src/schematic/wire/wireCreationModel";
import { deleteSchematicSelection } from "../../../src/schematic/selection/selectionDeleteModel";
import { parseSchematicDocumentFile, serializeSchematicDocumentFile } from "../../../src/schematic/schematicDocumentCodec";
import { applyCopyPlacementToDocument, copySourceFromDocument, instantiateCopyAt } from "../../../src/schematic/copyModel";
import { createSchematicContentHistoryAdapter } from "../../../src/schematic/document/contentHistoryAdapter";
import { contentFromDocument, documentFromContent } from "../../../src/schematic/document/documentModel";
import { captureWireMoveTopology } from "../../../src/schematic/wire/wireMoveTopology";
import { applySelectionMoveTransaction, beginSelectionMoveTransaction } from "../../../src/schematic/selection/selectionMoveTransaction";
import { beginWireSegmentMove, projectWireSegmentMove, syncWireSegmentMoveTopology } from "../../../src/schematic/wire/wireSegmentMoveModel";
import { executeSchematicPropertyBatchCommand } from "../../../src/schematic/propertyBatchCommands";
import { fixtureComponent } from "../support/fixtures";
import { wireEndpointConnections } from "../../../src/schematic/wire/wireEndpointConnection";
import type { ComponentInstance, Point, SchematicDocument, Wire } from "../../../src/schematic/types";
import type { SchematicSelectionProjection } from "../../../src/schematic/selection/selectionProjection";

function draw(document: SchematicDocument, id: string, points: Point[]) {
  applyWireCommitToDocument(document, points, { variant: "signal" }, () => id);
}

function remove(document: SchematicDocument, wires: Wire[] = [], junctionPoints: Point[] = []) {
  deleteSchematicSelection(document, fixtureDocument({
    components: [], inductorCouplings: [], wires, notes: [], netLabels: [], junctionPoints,
    count: wires.length + junctionPoints.length
  }) as unknown as SchematicSelectionProjection);
  applyNormalizedDocumentWires(document);
}

function tee() {
  const document = createEmptySchematicDocument();
  draw(document, "horizontal", [{ x: -100, y: 0 }, { x: 100, y: 0 }]);
  draw(document, "stem", [{ x: 0, y: 0 }, { x: 0, y: 100 }]);
  return document;
}

function mos(): ComponentInstance {
  return { id: "mos", type: "pmos", ref: "M5", x: 2460, y: -60, rotation: 0, mirrored: true, variantId: "3pin-current", values: {} };
}

describe("explicit endpoint connections", () => {
  it("reconnects a redrawn T branch after deleting its junction and old wire", () => {
    const document = tee();
    expect(buildConnectivity(document).groups.size).toBe(1);
    expect(buildConnectivity(document).junctions).toEqual([{ x: 0, y: 0 }]);
    remove(document, [], [{ x: 0, y: 0 }]);
    expect(buildConnectivity(document).groups.size).toBe(2);
    expect(document.wires).toHaveLength(2);

    remove(document, document.wires.filter(wire => wire.id === "stem"));
    draw(document, "new-stem", [{ x: 0, y: 0 }, { x: 0, y: 100 }]);
    expect(buildConnectivity(document).groups.size).toBe(1);
    expect(buildConnectivity(document).junctions).toEqual([{ x: 0, y: 0 }]);
    expect(document.wires).toHaveLength(3);
  });

  it("reconnecting by drawing over the detached branch needs no hidden-state control", () => {
    const document = tee();
    remove(document, [], [{ x: 0, y: 0 }]);
    draw(document, "reconnect", [{ x: 0, y: 0 }, { x: 0, y: 100 }]);
    expect(buildConnectivity(document).groups.size).toBe(1);
    expect(document.wires).toHaveLength(3);
  });

  it("splits a wire that passes through a fresh MOS pin", () => {
    const document = createEmptySchematicDocument();
    document.components.push(mos());
    authorFixture(document);
    draw(document, "horizontal", [{ x: 2400, y: -20 }, { x: 2540, y: -20 }]);
    expect(document.wires).toHaveLength(2);
    const graph = buildConnectivity(document);
    expect(graph.rootOf("p:mos:d")).toBe(graph.rootOfWire(document.wires[0].id));
    expect(document.wires.every(wire => wire.points.some(point => point.x === 2460 && point.y === -20))).toBe(true);
  });

  it("keeps the detached M5 pin separate, then connects the redrawn wire", () => {
    const document = fixtureDocument({
      components: [mos()],
      wires: [{ id: "old", routeMode: "orthogonal", points: [{ x: 2400, y: -20 }, { x: 2540, y: -20 }] }]
    });
    disconnectJunction(document, { x: 2460, y: -20 });
    applyNormalizedDocumentWires(document);
    expect(document.wires).toHaveLength(1);
    let graph = buildConnectivity(document);
    expect(graph.rootOf("p:mos:d")).not.toBe(graph.rootOfWire("old"));
    expect(captureWireMoveTopology(document, new Set(["mos"]), new Set()).attachments).toEqual([]);
    remove(document, [...document.wires]);
    draw(document, "new", [{ x: 2400, y: -20 }, { x: 2540, y: -20 }]);
    expect(document.wires).toHaveLength(2);
    graph = buildConnectivity(document);
    expect(graph.rootOf("p:mos:d")).toBe(graph.rootOfWire(document.wires[0].id));
  });

  it("does not reconnect coincident detached ends on normalize, save, reopen or undo/redo", () => {
    const document = tee();
    const history = createSchematicContentHistoryAdapter(contentFromDocument(document));
    remove(document, [], [{ x: 0, y: 0 }]);
    history.push(contentFromDocument(document));
    const source = serializeSchematicDocumentFile(document);
    expect(JSON.parse(source)).not.toHaveProperty("version");
    expect(source).not.toContain("noConnect");
    expect(source).not.toContain("junctionIntents");
    const reopened = parseSchematicDocumentFile(source);
    applyNormalizedDocumentWires(reopened);
    expect(buildConnectivity(reopened).groups.size).toBe(2);
    expect(serializeSchematicDocumentFile(reopened)).toBe(source);
    expect(buildConnectivity(documentFromContent(history.undo()!)).groups.size).toBe(1);
    expect(buildConnectivity(documentFromContent(history.redo()!)).groups.size).toBe(2);
  });

  it("keeps bare X crossings disconnected and breaks a joined X into two continuous conductors", () => {
    const document = createEmptySchematicDocument();
    draw(document, "h", [{ x: -100, y: 0 }, { x: 100, y: 0 }]);
    draw(document, "v", [{ x: 0, y: -100 }, { x: 0, y: 100 }]);
    expect(buildConnectivity(document).groups.size).toBe(2);
    expect(document.wires).toHaveLength(2);
    const joined = tee();
    draw(joined, "fourth", [{ x: 0, y: 0 }, { x: 0, y: -100 }]);
    expect(buildConnectivity(joined).groups.size).toBe(1);
    remove(joined, [], [{ x: 0, y: 0 }]);
    expect(buildConnectivity(joined).groups.size).toBe(2);
    expect(joined.wires).toHaveLength(2);
  });

  it("preserves a detached T when translating the whole group", () => {
    const document = tee();
    remove(document, [], [{ x: 0, y: 0 }]);
    const before = structuredClone(document);
    document.wires.forEach(wire => { wire.points = wire.points.map(point => ({ x: point.x + 80, y: point.y + 40 })); });
    reconcileConnectionEdit(document, before);
    applyNormalizedDocumentWires(document);
    expect(buildConnectivity(document).groups.size).toBe(2);
    expect(buildConnectivity(document).junctions).toEqual([]);
  });

  it("copies endpoint identities without connecting the copy to its source", () => {
    const document = tee();
    remove(document, [], [{ x: 0, y: 0 }]);
    let sequence = 0;
    const copied = instantiateCopyAt({ source: copySourceFromDocument(document), anchor: { x: 0, y: 0 } }, { x: 400, y: 0 }, {
      preview: false, createId: () => `copy-${sequence++}`, nextComponentRef: () => "M1"
    });
    applyCopyPlacementToDocument(document, copied);
    applyNormalizedDocumentWires(document);
    expect(document.wires).toHaveLength(4);
    expect(buildConnectivity(document).groups.size).toBe(4);
    expect(buildConnectivity(document).junctions).toEqual([]);
  });

  it("rejects a saved graph that joins endpoints at different coordinates", () => {
    const document = tee();
    const file = JSON.parse(serializeSchematicDocumentFile(document));
    const nodes = file.schematic.connections.wires.horizontal;
    nodes[1] = nodes[0];
    expect(() => parseSchematicDocumentFile(JSON.stringify(file))).toThrow(/same grid position/);
  });

  it.each([false, true])("preserves internal MOS contacts through repeated group drag frames (detached: %s)", detached => {
    const document = createEmptySchematicDocument();
    document.components.push(mos());
    authorFixture(document);
    draw(document, "wire", [{ x: 2400, y: -20 }, { x: 2540, y: -20 }]);
    if (detached) remove(document, [], [{ x: 2460, y: -20 }]);
    const before = structuredClone(document);
    const transaction = beginSelectionMoveTransaction({ document, activeComponentId: "mos",
      selectedIds: new Set(["mos", ...document.wires.map(wire => wire.id)]) })!;
    for (const delta of [20, 40, 80]) {
      document.components[0].x = before.components[0].x + delta;
      document.components[0].y = before.components[0].y + delta;
      applySelectionMoveTransaction({ document, transaction, moveBehavior: "stretch" });
    }
    reconcileConnectionEdit(document, before);
    applyNormalizedDocumentWires(document);
    const graph = buildConnectivity(document);
    expect(graph.rootOf("p:mos:d") === graph.rootOfWire(document.wires[0].id)).toBe(!detached);
    expect(document.wires).toHaveLength(detached ? 1 : 2);
    expect(() => serializeSchematicDocumentFile(document)).not.toThrow();
  });

  it("attaches a moved endpoint to a newly contacted external conductor", () => {
    const document = tee();
    remove(document, [], [{ x: 0, y: 0 }]);
    draw(document, "external", [{ x: 200, y: 0 }, { x: 400, y: 0 }]);
    const before = structuredClone(document);
    document.wires.find(wire => wire.id === "stem")!.points.forEach(point => { point.x += 300; });
    reconcileConnectionEdit(document, before);
    applyNormalizedDocumentWires(document);
    const graph = buildConnectivity(document);
    expect(graph.groups.size).toBe(2);
    expect(graph.rootOfWire("stem")).toBe(graph.rootOfWire("external"));
    expect(graph.junctions).toEqual([{ x: 300, y: 0 }]);
  });

  it("does not drag a disconnected stem when sliding the crossing conductor", () => {
    const document = tee();
    remove(document, [], [{ x: 0, y: 0 }]);
    const before = structuredClone(document);
    const transaction = beginWireSegmentMove(document, "horizontal", { x: 40, y: 0 })!;
    syncWireSegmentMoveTopology(document, transaction, projectWireSegmentMove(transaction, { x: 40, y: 40 }));
    reconcileConnectionEdit(document, before);
    applyNormalizedDocumentWires(document);
    expect(document.wires.find(wire => wire.id === "stem")?.points).toEqual(before.wires.find(wire => wire.id === "stem")?.points);
    expect(buildConnectivity(document).groups.size).toBe(2);
  });

  it("stretches and removes pin bridges without losing electrical connections", () => {
    const document = createEmptySchematicDocument();
    const resistor = fixtureComponent("resistor", "R1", 0, 0);
    document.components.push(resistor);
    authorFixture(document);
    const pin = componentPinPoint(resistor, "n");
    draw(document, "wire", [pin, { x: pin.x + 100, y: pin.y }]);
    for (const y of [40, 0]) {
      const before = structuredClone(document);
      const wire = document.wires.find(wire => wire.id === "wire")!;
      const start = wire.points[0];
      const transaction = beginWireSegmentMove(document, wire.id, start)!;
      syncWireSegmentMoveTopology(document, transaction, projectWireSegmentMove(transaction, { x: start.x, y }));
      reconcileConnectionEdit(document, before);
      applyNormalizedDocumentWires(document);
      const graph = buildConnectivity(document);
      expect(graph.rootOf("p:R1:n")).toBe(graph.rootOfWire("wire"));
      expect(document.wires).toHaveLength(y ? 2 : 1);
      expect(() => serializeSchematicDocumentFile(document)).not.toThrow();
    }
  });

  it("removes disabled pin bindings and reconnects a pin when enabled again", () => {
    const document = createEmptySchematicDocument();
    const plus = fixtureComponent("plus", "SUM1", 0, 0);
    document.components.push(plus);
    authorFixture(document);
    const pin = componentPinPoint(plus, "left");
    draw(document, "wire", [{ x: pin.x - 80, y: pin.y }, pin]);
    const selection = { selectedIds: [plus.id], selectedNoteIds: [] };
    executeSchematicPropertyBatchCommand(document, selection, { kind: "component-pin-visibility", pinId: "left", visible: false });
    expect(document.connections!.pins.SUM1.left).toBeUndefined();
    expect(captureWireMoveTopology(document, new Set([plus.id]), new Set()).attachments).toEqual([]);
    expect(wireEndpointConnections(document, document.wires[0]).end).toBe(false);
    executeSchematicPropertyBatchCommand(document, selection, { kind: "component-pin-visibility", pinId: "left", visible: true });
    const graph = buildConnectivity(document);
    expect(graph.rootOf("p:SUM1:left")).toBe(graph.rootOfWire("wire"));
    expect(wireEndpointConnections(document, document.wires[0]).end).toBe(true);
  });

  it("preserves explicit bindings for object IDs which are also JavaScript property names", () => {
    const document = createEmptySchematicDocument();
    draw(document, "__proto__", [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    draw(document, "constructor", [{ x: 100, y: 0 }, { x: 100, y: 80 }]);
    const reopened = parseSchematicDocumentFile(serializeSchematicDocumentFile(document));
    expect(reopened.wires).toHaveLength(2);
    expect(buildConnectivity(reopened).groups.size).toBe(1);
  });

  it("connects newly authored objects within one transaction without reconnecting an existing detached group", () => {
    const document = tee();
    remove(document, [], [{ x: 0, y: 0 }]);
    const before = structuredClone(document);
    document.wires.push(
      { id: "new-horizontal", routeMode: "orthogonal", points: [{ x: 200, y: 0 }, { x: 400, y: 0 }] },
      { id: "new-stem", routeMode: "orthogonal", points: [{ x: 300, y: 0 }, { x: 300, y: 100 }] }
    );
    reconcileConnectionEdit(document, before);
    applyNormalizedDocumentWires(document);
    expect(buildConnectivity(document).groups.size).toBe(3);
    expect(buildConnectivity(document).junctions).toEqual([{ x: 300, y: 0 }]);
  });

  it("joins the closing endpoints of a newly drawn loop", () => {
    const document = createEmptySchematicDocument();
    draw(document, "loop", [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }, { x: 0, y: 0 }]);
    expect(document.wires).toHaveLength(4);
    document.wires.forEach(wire => expect(wireEndpointConnections(document, wire)).toEqual({ start: true, end: true }));
    expect(buildConnectivity(document).groups.size).toBe(1);
  });
});
