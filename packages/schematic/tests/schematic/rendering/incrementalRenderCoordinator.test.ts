import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { SchematicGraphAdapter, type SchematicGraphLike } from "../../../src/schematic/graphAdapter";
import {
  SchematicIncrementalRenderCoordinator,
  type SchematicIncrementalRenderCell
} from "../../../src/schematic/incrementalRenderCoordinator";
import { junctionId, makeWireCell } from "../../../src/schematic/renderer";
import type { ComponentInstance, Point, SchematicDocument, Wire } from "../../../src/schematic/types";

class FakeCell implements SchematicIncrementalRenderCell {
  readonly values = new Map<string, unknown>();
  readonly sourceCalls: Point[] = [];
  readonly targetCalls: Point[] = [];
  readonly verticesCalls: Point[][] = [];
  readonly attrCalls: Array<Record<string, unknown>> = [];
  removeCalls = 0;

  constructor(readonly id: string) {}

  remove() {
    this.removeCalls += 1;
  }

  get(key: string) {
    return this.values.get(key);
  }

  set(key: string, value: unknown) {
    this.values.set(key, value);
    return this;
  }

  source(point: Point) {
    this.sourceCalls.push(point);
    return this;
  }

  target(point: Point) {
    this.targetCalls.push(point);
    return this;
  }

  vertices(points: Point[]) {
    this.verticesCalls.push(points);
    return this;
  }

  attr(attributes: Record<string, unknown>) {
    this.attrCalls.push(attributes);
    return this;
  }
}

function component(id: string): ComponentInstance {
  return {
    id,
    type: "resistor",
    ref: "R1",
    x: 20,
    y: 20,
    rotation: 0,
    mirrored: false,
    values: { main: "1k" }
  };
}

function wire(id: string, points: Point[]): Wire {
  return {
    id,
    points,
    routeMode: "orthogonal",
    appearance: { variant: "signal" }
  };
}

function documentWith(wires: Wire[] = []): SchematicDocument {
  return fixtureDocument({
    components: [],
    wires,
    junctions: [],

    junctionAppearances: [],
    netLabels: [],
    notes: []
  });
}

function fixture(document = documentWith(), initialCells: FakeCell[] = []) {
  const cells = new Map(initialCells.map((cell) => [cell.id, cell]));
  const graph = {
    addedCells: [] as FakeCell[],
    clear() {},
    addCell(cell: FakeCell) {
      this.addedCells.push(cell);
      cells.set(cell.id, cell);
    },
    getCell(id: string) {
      return cells.get(id) ?? null;
    },
    getCells() {
      return Array.from(cells.values());
    }
  } satisfies SchematicGraphLike<FakeCell> & { addedCells: FakeCell[] };
  const componentFactoryCalls: ComponentInstance[] = [];
  const wireFactoryCalls: Wire[] = [];
  const junctionFactoryCalls: Point[] = [];
  const selectedWireIds = new Set<string>();
  const coordinator = new SchematicIncrementalRenderCoordinator({
    graphAdapter: new SchematicGraphAdapter(graph),
    document,
    makeComponentCell: (instance) => {
      componentFactoryCalls.push(instance);
      return new FakeCell(instance.id);
    },
    makeWireCell: (candidate) => {
      wireFactoryCalls.push(candidate);
      return new FakeCell(candidate.id);
    },
    makeJunctionCell: (point) => {
      junctionFactoryCalls.push(point);
      return new FakeCell(junctionId(point));
    },
    isWireSelected: (wireId) => selectedWireIds.has(wireId)
  });
  return {
    cells,
    graph,
    coordinator,
    componentFactoryCalls,
    wireFactoryCalls,
    junctionFactoryCalls,
    selectedWireIds
  };
}

describe("schematic incremental render coordinator", () => {
  it("exposes an exception-safe, nested document geometry guard", () => {
    const { coordinator } = fixture();

    expect(coordinator.isApplyingDocumentGeometry).toBe(false);
    expect(() => coordinator.runWithDocumentGeometryGuard(() => {
      expect(coordinator.isApplyingDocumentGeometry).toBe(true);
      coordinator.runWithDocumentGeometryGuard(() => {
        expect(coordinator.isApplyingDocumentGeometry).toBe(true);
      });
      expect(coordinator.isApplyingDocumentGeometry).toBe(true);
      throw new Error("stop");
    })).toThrow("stop");
    expect(coordinator.isApplyingDocumentGeometry).toBe(false);
  });

  it("preserves z while locally replacing component, wire, and junction cells", () => {
    const resistor = component("component-1");
    const signal = wire("wire-1", [{ x: 0, y: 0 }, { x: 40, y: 0 }]);
    const point = { x: 40, y: 20 };
    const oldComponent = new FakeCell(resistor.id).set("z", 3) as FakeCell;
    const oldWire = new FakeCell(signal.id).set("z", 0) as FakeCell;
    const oldJunction = new FakeCell(junctionId(point)).set("z", 9) as FakeCell;
    const result = fixture(documentWith([signal]), [oldComponent, oldWire, oldJunction]);

    const nextComponent = result.coordinator.replaceComponent(resistor);
    const nextWire = result.coordinator.replaceWire(signal);
    const nextJunction = result.coordinator.replaceJunction(point);

    expect(result.componentFactoryCalls).toEqual([resistor]);
    expect(result.wireFactoryCalls).toEqual([signal]);
    expect(result.junctionFactoryCalls).toEqual([point]);
    expect(nextComponent.get("z")).toBe(3);
    expect(nextWire.get("z")).toBe(0);
    expect(nextJunction.get("z")).toBe(9);
    expect([oldComponent.removeCalls, oldWire.removeCalls, oldJunction.removeCalls]).toEqual([1, 1, 1]);
    expect(result.coordinator.isApplyingDocumentGeometry).toBe(false);
  });

  it("projects existing wire geometry without removing collinear connection vertices", () => {
    const signal = wire("wire-1", [
      { x: 1, y: 1 },
      { x: 19, y: 0 },
      { x: 41, y: 0 },
      { x: 41, y: 39 }
    ]);
    const cell = new FakeCell(signal.id);
    const document = documentWith([signal]);
    const before = structuredClone(document);
    const result = fixture(document, [cell]);
    result.selectedWireIds.add(signal.id);

    result.coordinator.updateWireCellsFromDocument(new Set([signal.id]));

    expect(signal.points).toEqual([
      { x: 0, y: 0 },
      { x: 20, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 }
    ]);
    expect(cell.sourceCalls).toEqual([{ x: 0, y: 0 }]);
    expect(cell.targetCalls).toEqual([{ x: 40, y: 40 }]);
    expect(cell.verticesCalls).toEqual([[{ x: 20, y: 0 }, { x: 40, y: 0 }]]);
    expect(document).toEqual(before);
    expect(cell.attrCalls[0]).toMatchObject({
      line: { opacity: 1, pointerEvents: "stroke" },
      selectionHalo: { opacity: 1 },
      wrapper: { pointerEvents: "stroke" }
    });
    expect(cell.get("labels")).toEqual([]);
  });

  it("adds missing wire cells and removes cells for wires absent from the document", () => {
    const addedWire = wire("wire-add", [{ x: 0, y: 0 }, { x: 40, y: 0 }]);
    const removedCell = new FakeCell("wire-remove");
    const result = fixture(documentWith([addedWire]), [removedCell]);

    result.coordinator.updateWireCellsFromDocument(new Set([addedWire.id, removedCell.id]));

    expect(result.wireFactoryCalls).toEqual([addedWire]);
    expect(result.cells.get(addedWire.id)).toBe(result.graph.addedCells[0]);
    expect(removedCell.removeCalls).toBe(1);
  });

  it("hides a collapsed wire without changing its document vertices", () => {
    const signal = wire("wire-short", [{ x: 2, y: 2 }, { x: 3, y: 3 }]);
    const cell = new FakeCell(signal.id);
    const result = fixture(documentWith([signal]), [cell]);

    result.coordinator.updateWireCellsFromDocument(new Set([signal.id]));

    expect(signal.points).toEqual([{ x: 0, y: 0 }, { x: 0, y: 0 }]);
    expect(cell.sourceCalls).toEqual([{ x: 0, y: 0 }]);
    expect(cell.targetCalls).toEqual([{ x: 0, y: 0 }]);
    expect(cell.verticesCalls).toEqual([[]]);
    expect(cell.attrCalls[0]).toMatchObject({
      line: { opacity: 0, pointerEvents: "none" },
      selectionHalo: { opacity: 0 },
      wrapper: { pointerEvents: "none" }
    });
    expect(result.wireFactoryCalls).toEqual([]);
  });

  it("refreshes endpoint decoration geometry when an angled endpoint moves", () => {
    const signal: Wire = {
      ...wire("wire-arrow", [{ x: 0, y: 0 }, { x: 40, y: 40 }]),
      routeMode: "freeAngle",
      appearance: { variant: "signal", endMarker: "arrow" }
    };
    const cell = new FakeCell(signal.id);
    const result = fixture(documentWith([signal]), [cell]);

    result.coordinator.updateWireCellsFromDocument(new Set([signal.id]));
    const firstLabels = cell.get("labels");

    signal.points = [{ x: 0, y: 0 }, { x: 40, y: -40 }];
    result.coordinator.updateWireCellsFromDocument(new Set([signal.id]));

    expect(firstLabels).not.toEqual(cell.get("labels"));
    expect(cell.get("labels")).toEqual(makeWireCell(signal).labels());
  });
});
