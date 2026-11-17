import { authorFixture, fixtureDocument } from "../support/fixtureDocument";
import { disconnectJunction } from "../../../src/schematic/connectionGraph";
import { applyNormalizedDocumentWires } from "../../../src/schematic/document/documentWires";
import { contentFromDocument } from "../../../src/schematic/document/documentModel";
import { serializeSchematicContent } from "../../../src/schematic/schematicDocumentCodec";
import { describe, expect, it } from "vitest";
import {
  SchematicCellGeometryInteractionCoordinator,
  type SchematicCellGeometryInteractionCell
} from "../../../src/schematic/cellGeometryInteractionCoordinator";
import { SchematicGraphAdapter, type SchematicGraphLike } from "../../../src/schematic/graphAdapter";
import { SchematicIncrementalRenderCoordinator } from "../../../src/schematic/incrementalRenderCoordinator";
import { netLabelPosition } from "../../../src/schematic/netLabelModel";
import { beginWireSegmentMove } from "../../../src/schematic/wire/wireSegmentMoveModel";
import { junctionId } from "../../../src/schematic/renderer";
import type { ComponentInstance, Point, SchematicDocument, Wire } from "../../../src/schematic/types";
import { componentCellPosition } from "../../../src/schematic/view-geometry";

class FakeCell implements SchematicCellGeometryInteractionCell {
  readonly values = new Map<string, unknown>();
  readonly attrCalls: Array<Record<string, unknown>> = [];
  private cellPosition: Point;
  private sourcePoint: Point;
  private targetPoint: Point;
  private vertexPoints: Point[];

  constructor(
    readonly id: string,
    options: {
      values?: Record<string, unknown>;
      position?: Point;
      source?: Point;
      target?: Point;
      vertices?: Point[];
    } = {}
  ) {
    Object.entries(options.values ?? {}).forEach(([key, value]) => this.values.set(key, value));
    this.cellPosition = { ...(options.position ?? { x: 0, y: 0 }) };
    this.sourcePoint = { ...(options.source ?? { x: 0, y: 0 }) };
    this.targetPoint = { ...(options.target ?? { x: 0, y: 0 }) };
    this.vertexPoints = (options.vertices ?? []).map((point) => ({ ...point }));
  }

  remove() {}

  get(key: string) {
    return this.values.get(key);
  }

  set(key: string, value: unknown) {
    this.values.set(key, value);
    return this;
  }

  position(): Point;
  position(x: number, y: number): this;
  position(x?: number, y?: number) {
    if (x !== undefined && y !== undefined) {
      this.cellPosition = { x, y };
      return this;
    }
    return { ...this.cellPosition };
  }

  source(): Point;
  source(point: Point): this;
  source(point?: Point) {
    if (point) {
      this.sourcePoint = { ...point };
      return this;
    }
    return { ...this.sourcePoint };
  }

  target(): Point;
  target(point: Point): this;
  target(point?: Point) {
    if (point) {
      this.targetPoint = { ...point };
      return this;
    }
    return { ...this.targetPoint };
  }

  vertices(): Point[];
  vertices(points: Point[]): this;
  vertices(points?: Point[]) {
    if (points) {
      this.vertexPoints = points.map((point) => ({ ...point }));
      return this;
    }
    return this.vertexPoints.map((point) => ({ ...point }));
  }

  attr(attributes: Record<string, unknown>) {
    this.attrCalls.push(attributes);
    return this;
  }
}

class FakeGraph implements SchematicGraphLike<FakeCell> {
  readonly cells = new Map<string, FakeCell>();

  clear() {
    this.cells.clear();
  }

  addCell(cell: FakeCell) {
    this.cells.set(cell.id, cell);
  }

  getCell(id: string) {
    return this.cells.get(id) ?? null;
  }

  getCells() {
    return Array.from(this.cells.values());
  }
}

function component(id: string, x: number, y: number): ComponentInstance {
  return {
    id,
    type: "resistor",
    ref: id,
    x,
    y,
    rotation: 0,
    mirrored: false,
    values: { resistance: "1k" }
  };
}

function wire(id: string, points: Point[]): Wire {
  return { id, routeMode: "orthogonal", points: points.map((point) => ({ ...point })) };
}

function interactionDocument(): SchematicDocument {
  return fixtureDocument({

    junctionAppearances: [],
    components: [component("R1", 200, 200), component("R2", 360, 200)],
    wires: [wire("w-r1-r2", [{ x: 240, y: 200 }, { x: 320, y: 200 }])],
    junctions: [],
    netLabels: [
      {
        id: "label-1",
        name: "signal",
        attachment: { wireId: "w-r1-r2", point: { x: 240, y: 200 } }
      }
    ],
    notes: [
      {
        id: "note-1",
        x: 220,
        y: 260,
        width: 160,
        format: "plain",
        text: "selection note"
      }
    ]
  });
}

function createFixture(document = interactionDocument()) {
  const graph = new FakeGraph();
  const graphAdapter = new SchematicGraphAdapter(graph);
  const makeComponentCell = (instance: ComponentInstance) => new FakeCell(instance.id, {
    values: { componentId: instance.id },
    position: componentCellPosition(instance)
  });
  const makeWireCell = (instance: Wire) => new FakeCell(instance.id, {
    values: { wireId: instance.id },
    source: instance.points[0],
    target: instance.points[instance.points.length - 1],
    vertices: instance.points.slice(1, -1)
  });
  const makeJunctionCell = (point: Point) => new FakeCell(`junction-${point.x}-${point.y}`, {
    values: { junction: true }
  });

  document.components.forEach((instance) => graph.addCell(makeComponentCell(instance)));
  document.wires.forEach((instance) => graph.addCell(makeWireCell(instance)));
  (document.netLabels ?? []).forEach((label) => {
    graph.addCell(new FakeCell(label.id, {
      values: { netLabelId: label.id },
      position: netLabelPosition(label)
    }));
  });

  const incrementalRenderer = new SchematicIncrementalRenderCoordinator({
    graphAdapter,
    document,
    makeComponentCell,
    makeWireCell,
    makeJunctionCell,
    isWireSelected: () => false
  });
  const coordinator = new SchematicCellGeometryInteractionCoordinator({
    document,
    graphAdapter,
    incrementalRenderer
  });
  return { coordinator, document, graph, incrementalRenderer };
}

describe("SchematicCellGeometryInteractionCoordinator", () => {
  it.each([0, 1, 2, 3].flatMap(turns => [false, true].map(bent => ({ turns, bent }))))(
    "does not retain pointer history when stretching a T terminal (rotation $turns, bent $bent)", ({ turns, bent }) => {
      const point = (x: number, y: number): Point => {
        for (let i = 0; i < turns; i++) [x, y] = [-y, x];
        return { x, y };
      };
      const route = (points: Point[]) => turns % 2 ? [...points].reverse() : points;
      const resistor = { ...component("R3", 200, 300), ...point(200, 300), rotation: turns * 90, values: { main: "1k" } };
      const document = fixtureDocument({ components: [resistor], wires: [
        wire("feed", route([point(240, 300), point(400, 300)])),
        wire("stem", [point(400, 100), point(400, 300)]),
        wire("right", [point(400, 300), point(600, 300)]),
        ...(bent ? [wire("right-up", [point(600, 300), point(600, 100)])] : [])
      ] });
      const stationary = structuredClone(document.wires.slice(1));
      const fixture = createFixture(document);
      const activeCell = fixture.graph.getCell("R3")!;
      fixture.coordinator.beginComponentMove({ activeComponentId: "R3", selectedIds: new Set(["R3"]), selectedNoteIds: new Set() });
      const gesture = [[160, 260], [120, 220], [160, 180], [240, 180], [260, 240],
        [220, 280], [180, 320], [220, 360], [180, 400], [200, 440], [200, 300], [280, 220]];
      for (const [x, y] of gesture) {
        const position = componentCellPosition({ ...resistor, ...point(x, y) });
        activeCell.position(position.x, position.y);
        fixture.coordinator.syncLive(activeCell, "stretch");
        const expected = route(y === 300
          ? [point(x + 40, y), point(400, 300)]
          : [point(x + 40, y), point(x + 40, 300), point(400, 300)]);
        expect(document.wires[0].points).toEqual(expected);
        expect(document.wires.slice(1)).toEqual(stationary);
        const feedCell = fixture.graph.getCell("feed")!;
        expect([feedCell.source(), ...feedCell.vertices(), feedCell.target()]).toEqual(expected);
      }
      expect(fixture.coordinator.finalize(activeCell, "stretch")?.commit.historyIntent).toBe("push");
      applyNormalizedDocumentWires(document);
      expect(document.wires).toHaveLength(bent ? 5 : 4);
      const nodes = Object.values(document.connections.wires);
      const reachable = new Set([document.connections.pins.R3.n]);
      for (let pass = 0; pass < nodes.length; pass++) {
        nodes.forEach(wireNodes => {
          if (wireNodes.some(node => reachable.has(node))) wireNodes.forEach(node => reachable.add(node));
        });
      }
      expect(nodes.every(wireNodes => wireNodes.every(node => reachable.has(node)))).toBe(true);
      expect(() => serializeSchematicContent(contentFromDocument(document))).not.toThrow();
    }
  );

  it.each([0, 1, 2, 3].flatMap(turns => ["collapse", "return"].map(mode => ({ turns, mode }))))(
    "preserves a shrinking wire's label during $mode (rotation $turns)", ({ turns, mode }) => {
      const point = (x: number, y: number): Point => {
        for (let i = 0; i < turns; i++) [x, y] = [-y, x];
        return { x, y };
      };
      const branch = (id: string, points: Point[]) => wire(id, turns % 2 ? points.reverse() : points);
      const document = fixtureDocument({ wires: [
        { ...branch("isolated", [point(200, 300), point(160, 240)]), routeMode: "freeAngle" },
        branch("feed", [point(200, 300), point(400, 300)]),
        branch("active", [point(400, 300), point(400, 460)])
      ], netLabels: [{ id: "label", name: "OUT", attachment: { wireId: "feed", point: point(300, 300) } }] });
      disconnectJunction(document, point(200, 300));
      const { coordinator, graph } = createFixture(document);
      coordinator.beginWireMove("active");
      const transaction = beginWireSegmentMove(document, "active", point(400, 400))!;
      const positions = mode === "collapse" ? [[280, 240], [200, 200]] : [[280, 240], [320, 300], [200, 200], [280, 240], [400, 300]];
      for (const [x, labelX] of positions) {
        coordinator.syncWireSegmentMove(transaction, point(x, 400));
        expect(document.netLabels[0].attachment).toEqual({
          wireId: x === 200 ? "active" : "feed", point: point(labelX, 300)
        });
        expect(graph.getCell("label")!.position()).toEqual(netLabelPosition(document.netLabels[0]));
      }
      expect(coordinator.finalize(graph.getCell("active")!, "stretch")?.commit.changed).toBe(true);
      applyNormalizedDocumentWires(document);
      expect(() => serializeSchematicContent(contentFromDocument(document))).not.toThrow();
      expect(document.netLabels[0].attachment.wireId).toBe(mode === "collapse" ? "active" : "feed");
    }
  );

  it("projects a segment drag and label before mouseup, then commits the document-owned move exactly once", () => {
    const document = fixtureDocument({
      components: [], wires: [wire("bar", [{ x: 0, y: 0 }, { x: 100, y: 0 }])],
      netLabels: [{ id: "label", name: "OUT", attachment: { wireId: "bar", point: { x: 40, y: 0 } } }]
    });
    const { coordinator, graph } = createFixture(document);
    const cell = graph.getCell("bar")!;
    coordinator.beginWireMove("bar");
    const transaction = beginWireSegmentMove(document, "bar", { x: 40, y: 0 })!;
    const result = coordinator.syncWireSegmentMove(transaction, { x: 40, y: 40 });
    expect(result?.geometryChanged).toBe(true);
    expect(document.wires[0].points).toEqual([{ x: 0, y: 40 }, { x: 100, y: 40 }]);
    expect(cell.source()).toEqual(document.wires[0].points[0]);
    expect(cell.target()).toEqual(document.wires[0].points[1]);
    expect(document.netLabels[0].attachment.point).toEqual({ x: 40, y: 40 });
    expect(graph.getCell("label")!.position()).toEqual(netLabelPosition(document.netLabels[0]));
    expect(coordinator.finalize(cell, "stretch")?.commit.changed).toBe(true);
    expect(coordinator.finalize(cell, "stretch")).toBeNull();
    expect(coordinator.syncWireSegmentMove(transaction, { x: 40, y: 80 })).toBeNull();
  });

  it.each(["stretch", "moveOnly"] as const)("drags a wire-only selection in %s mode and commits once", moveBehavior => {
    const document = interactionDocument();
    document.wires.push(wire("w2", [{ x: 100, y: 300 }, { x: 100, y: 340 }, { x: 160, y: 340 }]));
    authorFixture(document);
    const before = structuredClone(document);
    const fixture = createFixture(document);
    expect(fixture.coordinator.beginWireSelectionMove({
      activeWireId: "w-r1-r2", pointer: { x: 270, y: 200 },
      selectedIds: new Set(["w-r1-r2", "w2"]), selectedNoteIds: new Set()
    })).toBe(true);
    const live = fixture.coordinator.syncWireSelectionMove("w-r1-r2", { x: 312, y: 221 }, moveBehavior);
    expect(live?.selectionMove?.changed).toBe(true);
    expect(document.components).toEqual(before.components);
    expect(document.notes).toEqual(before.notes);
    document.wires.forEach((wire, index) => expect(wire.points).toEqual(before.wires[index].points.map(point => ({ x: point.x + 40, y: point.y + 20 }))));
    expect(document.netLabels[0].attachment.point).toEqual({ x: 280, y: 220 });
    expect(fixture.graph.getCell("w2")?.source()).toEqual({ x: 140, y: 320 });
    const cell = fixture.graph.getCell("w-r1-r2")!;
    expect(fixture.coordinator.finalize(cell, moveBehavior)?.commit).toMatchObject({ changed: true, historyIntent: "push" });
    expect(fixture.coordinator.finalize(cell, moveBehavior)).toBeNull();
  });

  it("moves mixed selections from a wire and restores all content when cancelled", () => {
    const fixture = createFixture();
    const before = structuredClone(fixture.document);
    fixture.coordinator.beginWireSelectionMove({
      activeWireId: "w-r1-r2", pointer: { x: 270, y: 200 },
      selectedIds: new Set(["R1", "w-r1-r2"]), selectedNoteIds: new Set(["note-1"])
    });
    fixture.coordinator.syncWireSelectionMove("w-r1-r2", { x: 310, y: 220 }, "stretch");
    expect(fixture.document.components[0]).toMatchObject({ x: 240, y: 220 });
    expect(fixture.document.notes[0]).toMatchObject({ x: 260, y: 280 });
    expect(fixture.coordinator.cancelActiveInteraction()).not.toBeNull();
    expect(fixture.document).toEqual(before);
    expect(fixture.coordinator.syncWireSelectionMove("w-r1-r2", { x: 330, y: 240 }, "stretch")).toBeNull();
  });

  it("keeps live group movement incremental and returns one pointerup commit intent", () => {
    const fixture = createFixture();
    const activeCell = fixture.graph.getCell("R1")!;
    expect(fixture.coordinator.beginComponentMove({
      activeComponentId: "R1",
      selectedIds: new Set(["R1", "R2", "w-r1-r2"]),
      selectedNoteIds: new Set(["note-1"])
    })).toBe(true);

    const active = fixture.document.components.find((instance) => instance.id === "R1")!;
    const movedActive = componentCellPosition({ ...active, x: 240, y: 200 });
    activeCell.position(movedActive.x, movedActive.y);
    const live = fixture.coordinator.syncLive(activeCell, "stretch");

    expect(live).not.toBeNull();
    expect(live?.geometryChanged).toBe(true);
    expect(live?.requestJunctionRefresh).toBe(true);
    expect(live?.changedLabelIds).toEqual(new Set(["label-1"]));
    expect(live?.selectionMove?.historyIntent).toBe("none");
    expect(live?.selectionMove?.movedNoteIds).toEqual(new Set(["note-1"]));
    expect(fixture.document.components.find((instance) => instance.id === "R2")).toMatchObject({ x: 400, y: 200 });
    expect(fixture.document.wires[0].points).toEqual([
      { x: 280, y: 200 },
      { x: 360, y: 200 }
    ]);
    expect(fixture.document.notes?.[0]).toMatchObject({ x: 260, y: 260 });
    expect(fixture.document.netLabels?.[0].attachment.point).toEqual({ x: 280, y: 200 });
    expect(fixture.graph.getCell("R2")?.position()).toEqual(
      componentCellPosition(fixture.document.components.find((instance) => instance.id === "R2")!)
    );
    expect(fixture.graph.getCell("w-r1-r2")?.source()).toEqual({ x: 280, y: 200 });
    expect(fixture.graph.getCell("w-r1-r2")?.target()).toEqual({ x: 360, y: 200 });
    expect(fixture.graph.getCell("label-1")?.position()).toEqual(netLabelPosition(fixture.document.netLabels![0]));

    const pointerUp = fixture.coordinator.finalize(activeCell, "stretch");
    expect(pointerUp?.selectionMove?.changed).toBe(false);
    expect(pointerUp?.commit).toMatchObject({
      changed: true,
      historyIntent: "push",
      affectedGraphIds: ["R1", "R2", "w-r1-r2", "label-1"],
      affectedNoteIds: ["note-1"]
    });

    expect(fixture.coordinator.finalize(activeCell, "stretch")).toBeNull();
  });

  it("projects a Note-origin mixed move and returns one pointerup commit intent", () => {
    const fixture = createFixture();
    expect(fixture.coordinator.beginNoteMove({
      activeNoteId: "note-1",
      selectedIds: new Set(["R1", "w-r1-r2"]),
      selectedNoteIds: new Set(["note-1"])
    })).toBe(true);

    fixture.document.notes![0].x += 40;
    const live = fixture.coordinator.syncNoteMove("note-1", ["note-1"], "stretch");

    expect(live).not.toBeNull();
    expect(live?.geometryChanged).toBe(true);
    expect(live?.requestJunctionRefresh).toBe(true);
    expect(live?.selectionMove).toMatchObject({
      changed: true,
      historyIntent: "none",
      movedComponentIds: new Set(["R1"]),
      updatedWireIds: new Set(["w-r1-r2"]),
      affectedGraphIds: ["R1", "w-r1-r2", "label-1"],
      affectedNoteIds: ["note-1"]
    });
    expect(fixture.document.components).toEqual([
      expect.objectContaining({ id: "R1", x: 240, y: 200 }),
      expect.objectContaining({ id: "R2", x: 360, y: 200 })
    ]);
    expect(fixture.document.wires[0].points).toEqual([
      { x: 280, y: 200 },
      { x: 360, y: 200 }
    ]);
    expect(fixture.document.notes?.[0]).toMatchObject({ id: "note-1", x: 260, y: 260 });
    expect(fixture.document.netLabels?.[0].attachment.point).toEqual({ x: 280, y: 200 });
    expect(fixture.graph.getCell("R1")?.position()).toEqual(
      componentCellPosition(fixture.document.components[0])
    );
    expect(fixture.graph.getCell("w-r1-r2")?.source()).toEqual({ x: 280, y: 200 });
    expect(fixture.graph.getCell("w-r1-r2")?.target()).toEqual({ x: 360, y: 200 });
    expect(fixture.graph.getCell("label-1")?.position()).toEqual(netLabelPosition(fixture.document.netLabels![0]));

    const pointerUp = fixture.coordinator.finalizeNoteMove(["note-1"], "stretch");
    expect(pointerUp?.selectionMove?.changed).toBe(false);
    expect(pointerUp?.commit).toMatchObject({
      changed: true,
      historyIntent: "push",
      affectedGraphIds: ["R1", "w-r1-r2", "label-1"],
      affectedNoteIds: ["note-1"]
    });
    expect(fixture.coordinator.finalizeNoteMove(["note-1"], "stretch")).toBeNull();
  });

  it("rolls a Note-origin mixed move back before pointerup", () => {
    const fixture = createFixture();
    expect(fixture.coordinator.beginNoteMove({
      activeNoteId: "note-1",
      selectedIds: new Set(["R1", "w-r1-r2"]),
      selectedNoteIds: new Set(["note-1"])
    })).toBe(true);

    fixture.document.notes![0].x += 40;
    expect(fixture.coordinator.syncNoteMove("note-1", ["note-1"], "stretch")?.requestJunctionRefresh).toBe(true);

    expect(fixture.coordinator.cancelActiveInteraction()).toEqual({
      restoredJunctionIds: []
    });
    expect(fixture.document.components).toEqual([
      expect.objectContaining({ id: "R1", x: 200, y: 200 }),
      expect.objectContaining({ id: "R2", x: 360, y: 200 })
    ]);
    expect(fixture.document.wires[0].points).toEqual([
      { x: 240, y: 200 },
      { x: 320, y: 200 }
    ]);
    expect(fixture.document.notes?.[0]).toMatchObject({ id: "note-1", x: 220, y: 260 });
    expect(fixture.document.netLabels?.[0].attachment.point).toEqual({ x: 240, y: 200 });
    expect(fixture.coordinator.finalizeNoteMove(["note-1"], "stretch")).toBeNull();
  });

  it("returns a no-op commit for a click and ignores renderer-owned geometry writes", () => {
    const fixture = createFixture();
    const activeCell = fixture.graph.getCell("R1")!;
    fixture.coordinator.beginComponentMove({
      activeComponentId: "R1",
      selectedIds: new Set(["R1"]),
      selectedNoteIds: new Set()
    });

    const live = fixture.coordinator.syncLive(activeCell, "stretch");
    expect(live).toMatchObject({
      geometryChanged: false,
      requestJunctionRefresh: false
    });
    expect(live?.selectionMove?.historyIntent).toBe("none");
    expect(fixture.coordinator.finalize(activeCell, "stretch")?.commit).toMatchObject({
      changed: false,
      historyIntent: "none",
      affectedIds: []
    });

    const moved = componentCellPosition({ ...fixture.document.components[0], x: 240 });
    activeCell.position(moved.x, moved.y);
    fixture.coordinator.beginComponentMove({
      activeComponentId: "R1",
      selectedIds: new Set(["R1"]),
      selectedNoteIds: new Set()
    });
    const guarded = fixture.incrementalRenderer.runWithDocumentGeometryGuard(() =>
      fixture.coordinator.syncLive(activeCell, "stretch")
    );
    expect(guarded).toBeNull();
    const guardedFinalize = fixture.incrementalRenderer.runWithDocumentGeometryGuard(() =>
      fixture.coordinator.finalize(activeCell, "stretch")
    );
    expect(guardedFinalize).toBeNull();
    expect(fixture.document.components[0]).toMatchObject({ x: 200, y: 200 });

    const junctionCell = new FakeCell("junction-200-200", { values: { junction: true } });
    fixture.graph.addCell(junctionCell);
    expect(fixture.coordinator.finalize(junctionCell, "stretch")).toBeNull();
  });

  it("tracks wire-only live geometry without exposing a pointermove history commit", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      components: [],
      wires: [wire("wire-1", [{ x: 0, y: 0 }, { x: 40, y: 0 }])],
      junctions: [],
      netLabels: [],
      notes: []
    });
    const fixture = createFixture(document);
    const wireCell = fixture.graph.getCell("wire-1")!;
    expect(fixture.coordinator.beginWireMove("wire-1")).toBe(true);
    wireCell.source({ x: 3, y: 8 });
    wireCell.vertices([{ x: 39, y: 8 }]);
    wireCell.target({ x: 39, y: 42 });

    const live = fixture.coordinator.syncLive(wireCell, "stretch");
    expect(live).toEqual({
      geometryChanged: true,
      selectionMove: null,
      changedLabelIds: new Set(),
      requestJunctionRefresh: true
    });
    expect(fixture.document.wires[0].points).toEqual([
      { x: 0, y: 10 },
      { x: 40, y: 10 },
      { x: 40, y: 40 }
    ]);

    expect(fixture.coordinator.finalize(wireCell, "stretch")?.commit).toMatchObject({
      changed: true,
      historyIntent: "push",
      affectedGraphIds: ["wire-1"],
      affectedNoteIds: []
    });
  });

  it("lets wire pointerup capture and commit a final delta without a live callback", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      components: [],
      wires: [wire("wire-1", [{ x: 0, y: 0 }, { x: 40, y: 0 }])],
      junctions: [],
      netLabels: [],
      notes: []
    });
    const fixture = createFixture(document);
    const wireCell = fixture.graph.getCell("wire-1")!;
    expect(fixture.coordinator.beginWireMove("wire-1")).toBe(true);
    wireCell.source({ x: 3, y: 8 });
    wireCell.vertices([{ x: 39, y: 8 }]);
    wireCell.target({ x: 39, y: 42 });

    const pointerUp = fixture.coordinator.finalize(wireCell, "stretch");
    expect(pointerUp?.selectionMove).toBeNull();
    expect(pointerUp?.commit).toMatchObject({
      changed: true,
      historyIntent: "push",
      affectedGraphIds: ["wire-1"]
    });
    expect(fixture.document.wires[0].points).toEqual([
      { x: 0, y: 10 },
      { x: 40, y: 10 },
      { x: 40, y: 40 }
    ]);
  });

  it("lets pointerup perform the final sync when no live callback observed the delta", () => {
    const fixture = createFixture();
    const activeCell = fixture.graph.getCell("R1")!;
    fixture.coordinator.beginComponentMove({
      activeComponentId: "R1",
      selectedIds: new Set(["R1", "R2"]),
      selectedNoteIds: new Set()
    });
    const nextPosition = componentCellPosition({ ...fixture.document.components[0], x: 240 });
    activeCell.position(nextPosition.x, nextPosition.y);

    const pointerUp = fixture.coordinator.finalize(activeCell, "stretch");
    expect(pointerUp?.commit).toMatchObject({ changed: true, historyIntent: "push" });
    expect(pointerUp?.selectionMove?.movedComponentIds).toEqual(new Set(["R2"]));
    expect(fixture.document.components).toEqual([
      expect.objectContaining({ id: "R1", x: 240 }),
      expect.objectContaining({ id: "R2", x: 400 })
    ]);
  });

  it("ignores stale component callbacks after a newer component move begins", () => {
    const fixture = createFixture();
    const staleCell = fixture.graph.getCell("R1")!;
    const activeCell = fixture.graph.getCell("R2")!;
    expect(fixture.coordinator.beginComponentMove({
      activeComponentId: "R1",
      selectedIds: new Set(["R1"]),
      selectedNoteIds: new Set()
    })).toBe(true);
    expect(fixture.coordinator.beginComponentMove({
      activeComponentId: "R2",
      selectedIds: new Set(["R2"]),
      selectedNoteIds: new Set()
    })).toBe(true);

    const stalePosition = componentCellPosition({ ...fixture.document.components[0], x: 240 });
    staleCell.position(stalePosition.x, stalePosition.y);
    expect(fixture.coordinator.syncLive(staleCell, "stretch")).toBeNull();
    expect(fixture.coordinator.finalize(staleCell, "stretch")).toBeNull();
    expect(fixture.document.components[0]).toMatchObject({ id: "R1", x: 200, y: 200 });

    const activePosition = componentCellPosition({ ...fixture.document.components[1], x: 400 });
    activeCell.position(activePosition.x, activePosition.y);
    expect(fixture.coordinator.syncLive(activeCell, "stretch")).toMatchObject({
      geometryChanged: true,
      requestJunctionRefresh: true
    });
    const commit = fixture.coordinator.finalize(activeCell, "stretch")?.commit;
    expect(commit).toMatchObject({
      changed: true,
      historyIntent: "push",
      affectedGraphIds: expect.arrayContaining(["R2"])
    });
    expect(commit?.affectedGraphIds).not.toContain("R1");
    expect(fixture.document.components[1]).toMatchObject({ id: "R2", x: 400, y: 200 });
  });

  it("ignores stale wire callbacks after a newer wire move begins", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      components: [],
      wires: [
        wire("wire-a", [{ x: 0, y: 0 }, { x: 40, y: 0 }]),
        wire("wire-b", [{ x: 80, y: 0 }, { x: 120, y: 0 }])
      ],
      junctions: [],
      netLabels: [],
      notes: []
    });
    const fixture = createFixture(document);
    const staleCell = fixture.graph.getCell("wire-a")!;
    const activeCell = fixture.graph.getCell("wire-b")!;
    expect(fixture.coordinator.beginWireMove("wire-a")).toBe(true);
    expect(fixture.coordinator.beginWireMove("wire-b")).toBe(true);

    staleCell.target({ x: 40, y: 40 });
    expect(fixture.coordinator.syncLive(staleCell, "stretch")).toBeNull();
    expect(fixture.coordinator.finalize(staleCell, "stretch")).toBeNull();
    expect(fixture.document.wires[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 }
    ]);

    activeCell.target({ x: 120, y: 40 });
    expect(fixture.coordinator.syncLive(activeCell, "stretch")).toMatchObject({
      geometryChanged: true,
      requestJunctionRefresh: true
    });
    expect(fixture.coordinator.finalize(activeCell, "stretch")?.commit).toMatchObject({
      changed: true,
      historyIntent: "push",
      affectedGraphIds: ["wire-b"]
    });
    expect(fixture.document.wires[1].points).toEqual([
      { x: 80, y: 0 },
      { x: 120, y: 40 }
    ]);
  });

  it("preserves attached wire geometry in move-only mode and snaps the active Cell", () => {
    const fixture = createFixture();
    const activeCell = fixture.graph.getCell("R1")!;
    fixture.coordinator.beginComponentMove({
      activeComponentId: "R1",
      selectedIds: new Set(["R1"]),
      selectedNoteIds: new Set()
    });
    const startPosition = activeCell.position();
    activeCell.position(startPosition.x + 25, startPosition.y + 7);

    const live = fixture.coordinator.syncLive(activeCell, "moveOnly");
    expect(live?.geometryChanged).toBe(true);
    expect(fixture.document.components[0]).toMatchObject({ x: 230, y: 210 });
    expect(activeCell.position()).toEqual(componentCellPosition(fixture.document.components[0]));
    expect(fixture.document.wires[0].points).toEqual([
      { x: 240, y: 200 },
      { x: 320, y: 200 }
    ]);
  });

  it("reports and projects a label remapped by an unselected stretched wire", () => {
    const fixture = createFixture();
    const activeCell = fixture.graph.getCell("R1")!;
    fixture.coordinator.beginComponentMove({
      activeComponentId: "R1",
      selectedIds: new Set(["R1"]),
      selectedNoteIds: new Set()
    });
    const nextPosition = componentCellPosition({ ...fixture.document.components[0], x: 240 });
    activeCell.position(nextPosition.x, nextPosition.y);

    const live = fixture.coordinator.syncLive(activeCell, "stretch");
    expect(live?.selectionMove?.movedNetLabelIds).toEqual(new Set());
    expect(live?.changedLabelIds).toEqual(new Set(["label-1"]));
    expect(fixture.document.netLabels?.[0].attachment.point).toEqual({ x: 280, y: 200 });
    expect(fixture.graph.getCell("label-1")?.position()).toEqual(netLabelPosition(fixture.document.netLabels![0]));

    expect(fixture.coordinator.finalize(activeCell, "stretch")?.commit).toMatchObject({
      changed: true,
      historyIntent: "push",
      affectedGraphIds: ["R1", "w-r1-r2", "label-1"]
    });
  });

  it("keeps two selected Notes anchored to their start positions across repeated live frames", () => {
    const document = interactionDocument();
    document.notes?.push({
      id: "note-2",
      x: 420,
      y: 300,
      width: 180,
      format: "markdown",
      text: "**second** note"
    });
    const fixture = createFixture(document);
    const activeCell = fixture.graph.getCell("R1")!;
    fixture.coordinator.beginComponentMove({
      activeComponentId: "R1",
      selectedIds: new Set(["R1", "R2", "w-r1-r2"]),
      selectedNoteIds: new Set(["note-1", "note-2"])
    });

    let nextPosition = componentCellPosition({ ...fixture.document.components[0], x: 240 });
    activeCell.position(nextPosition.x, nextPosition.y);
    const firstFrame = fixture.coordinator.syncLive(activeCell, "stretch");
    expect(firstFrame?.selectionMove?.movedNoteIds).toEqual(new Set(["note-1", "note-2"]));
    expect(fixture.document.notes).toEqual([
      expect.objectContaining({ id: "note-1", x: 260, y: 260 }),
      expect.objectContaining({ id: "note-2", x: 460, y: 300 })
    ]);

    nextPosition = componentCellPosition({ ...fixture.document.components[0], x: 280 });
    activeCell.position(nextPosition.x, nextPosition.y);
    const secondFrame = fixture.coordinator.syncLive(activeCell, "stretch");
    expect(secondFrame?.selectionMove?.movedNoteIds).toEqual(new Set(["note-1", "note-2"]));
    expect(fixture.document.notes).toEqual([
      expect.objectContaining({ id: "note-1", x: 300, y: 260 }),
      expect.objectContaining({ id: "note-2", x: 500, y: 300 })
    ]);

    expect(fixture.coordinator.finalize(activeCell, "stretch")?.commit).toMatchObject({
      changed: true,
      historyIntent: "push",
      affectedNoteIds: ["note-1", "note-2"]
    });
  });

  it("rolls an active live interaction back and rejects its later pointerup", () => {
    const fixture = createFixture();
    const activeCell = fixture.graph.getCell("R1")!;
    fixture.coordinator.beginComponentMove({
      activeComponentId: "R1",
      selectedIds: new Set(["R1", "R2", "w-r1-r2"]),
      selectedNoteIds: new Set(["note-1"])
    });
    const nextPosition = componentCellPosition({ ...fixture.document.components[0], x: 240 });
    activeCell.position(nextPosition.x, nextPosition.y);

    expect(fixture.coordinator.syncLive(activeCell, "stretch")?.requestJunctionRefresh).toBe(true);
    expect(fixture.document.components).toEqual([
      expect.objectContaining({ id: "R1", x: 240, y: 200 }),
      expect.objectContaining({ id: "R2", x: 400, y: 200 })
    ]);
    expect(fixture.document.notes?.[0]).toMatchObject({ x: 260, y: 260 });

    expect(fixture.coordinator.cancelActiveInteraction()).toEqual({
      restoredJunctionIds: []
    });
    expect(fixture.document.components).toEqual([
      expect.objectContaining({ id: "R1", x: 200, y: 200 }),
      expect.objectContaining({ id: "R2", x: 360, y: 200 })
    ]);
    expect(fixture.document.wires[0].points).toEqual([
      { x: 240, y: 200 },
      { x: 320, y: 200 }
    ]);
    expect(fixture.document.notes?.[0]).toMatchObject({ x: 220, y: 260 });
    expect(fixture.coordinator.finalize(activeCell, "stretch")).toBeNull();
    expect(fixture.coordinator.cancelActiveInteraction()).toBeNull();
  });

  it("returns original selected junction ids when rolling a live selection move back", () => {
    const document = interactionDocument();
    const originalJunction = { x: 280, y: 200 };
    document.junctions = [originalJunction];
    const fixture = createFixture(document);
    const activeCell = fixture.graph.getCell("R1")!;
    fixture.coordinator.beginComponentMove({
      activeComponentId: "R1",
      selectedIds: new Set(["R1", junctionId(originalJunction)]),
      selectedNoteIds: new Set()
    });
    const nextPosition = componentCellPosition({ ...fixture.document.components[0], x: 240 });
    activeCell.position(nextPosition.x, nextPosition.y);

    expect(fixture.coordinator.syncLive(activeCell, "stretch")?.selectionMove?.transformedJunctionIds).toEqual([
      junctionId({ x: 320, y: 200 })
    ]);
    expect(fixture.coordinator.cancelActiveInteraction()).toEqual({
      restoredJunctionIds: [junctionId(originalJunction)]
    });
  });

  it("invalidates an in-flight interaction so an old pointerup cannot rewrite a restored document", () => {
    const fixture = createFixture();
    const activeCell = fixture.graph.getCell("R1")!;
    fixture.coordinator.beginComponentMove({
      activeComponentId: "R1",
      selectedIds: new Set(["R1", "R2", "w-r1-r2"]),
      selectedNoteIds: new Set(["note-1"])
    });
    const nextPosition = componentCellPosition({ ...fixture.document.components[0], x: 240 });
    activeCell.position(nextPosition.x, nextPosition.y);
    expect(fixture.coordinator.syncLive(activeCell, "stretch")?.requestJunctionRefresh).toBe(true);

    const restored = interactionDocument();
    fixture.document.components = restored.components;
    fixture.document.wires = restored.wires;
    fixture.document.junctions = restored.junctions;
    fixture.document.connections = restored.connections;
    fixture.document.junctionAppearances = restored.junctionAppearances;
    fixture.document.netLabels = restored.netLabels;
    fixture.document.notes = restored.notes;
    fixture.coordinator.invalidateAgainstDocument();

    fixture.graph.clear();
    const currentCell = new FakeCell("R1", {
      values: { componentId: "R1" },
      position: componentCellPosition(fixture.document.components[0])
    });
    fixture.graph.addCell(currentCell);

    expect(fixture.coordinator.syncLive(activeCell, "stretch")).toBeNull();
    expect(fixture.coordinator.finalize(activeCell, "stretch")).toBeNull();
    expect(fixture.document.components).toEqual([
      expect.objectContaining({ id: "R1", x: 200, y: 200 }),
      expect.objectContaining({ id: "R2", x: 360, y: 200 })
    ]);
    expect(fixture.document.wires[0].points).toEqual([
      { x: 240, y: 200 },
      { x: 320, y: 200 }
    ]);
    expect(fixture.document.notes?.[0]).toMatchObject({ x: 220, y: 260 });
  });
});
