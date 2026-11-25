import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import {
  SchematicJunctionRenderCoordinator,
  type SchematicJunctionRenderCell
} from "../../../src/schematic/junctionRenderCoordinator";
import { pointKey } from "../../../src/schematic/geometry";
import { SchematicGraphAdapter, type SchematicGraphLike } from "../../../src/schematic/graphAdapter";
import { resolveSchematicNets } from "../../../src/schematic/netResolution";
import { junctionId } from "../../../src/schematic/renderer";
import type { Point, SchematicDocument, Wire } from "../../../src/schematic/types";

class FakeCell implements SchematicJunctionRenderCell {
  removeCalls = 0;
  toFrontCalls = 0;
  onRemove: (() => void) | null = null;
  private readonly values = new Map<string, unknown>();

  constructor(readonly id: string, values: Record<string, unknown> = {}) {
    Object.entries(values).forEach(([key, value]) => this.values.set(key, value));
  }

  get(key: string) {
    return this.values.get(key);
  }

  remove() {
    this.removeCalls += 1;
    this.onRemove?.();
  }

  toFront() {
    this.toFrontCalls += 1;
    return this;
  }
}

class FakeGraph implements SchematicGraphLike<FakeCell> {
  readonly cells = new Map<string, FakeCell>();
  readonly addedCells: FakeCell[] = [];

  clear() {
    this.cells.clear();
  }

  addCell(cell: FakeCell) {
    cell.onRemove = () => this.cells.delete(cell.id);
    this.cells.set(cell.id, cell);
    this.addedCells.push(cell);
  }

  getCell(id: string) {
    return this.cells.get(id) ?? null;
  }

  getCells() {
    return Array.from(this.cells.values());
  }
}

function wire(id: string, points: Point[]): Wire {
  return { id, points, routeMode: "orthogonal" };
}

function documentWith(
  wires: Wire[] = []
): SchematicDocument {
  return fixtureDocument({ wires });
}

function tJunctionDocument() {
  return documentWith([
    wire("horizontal", [{ x: 0, y: 0 }, { x: 80, y: 0 }]),
    wire("branch", [{ x: 40, y: 0 }, { x: 40, y: 40 }])
  ]);
}

function createFrameScheduler() {
  let nextHandle = 1;
  const callbacks = new Map<number, (timestamp: number) => void>();
  const canceledHandles: number[] = [];
  return {
    callbacks,
    canceledHandles,
    request(callback: (timestamp: number) => void) {
      const handle = nextHandle;
      nextHandle += 1;
      callbacks.set(handle, callback);
      return handle;
    },
    cancel(handle: number) {
      canceledHandles.push(handle);
      callbacks.delete(handle);
    },
    runNext() {
      const entry = callbacks.entries().next().value as
        | [number, (timestamp: number) => void]
        | undefined;
      if (!entry) throw new Error("No scheduled frame.");
      callbacks.delete(entry[0]);
      entry[1](16);
    }
  };
}

function createFixture(document = documentWith()) {
  const graph = new FakeGraph();
  const graphAdapter = new SchematicGraphAdapter(graph);
  const frames = createFrameScheduler();
  const factoryCalls: Point[] = [];
  let presentationMode = false;
  const coordinator = new SchematicJunctionRenderCoordinator({
    document,
    graphAdapter,
    makeJunctionCell: (point) => {
      factoryCalls.push({ ...point });
      return new FakeCell(junctionId(point), { junctionKey: pointKey(point) });
    },
    getPresentationMode: () => presentationMode,
    requestAnimationFrame: (callback) => frames.request(callback),
    cancelAnimationFrame: (handle) => frames.cancel(handle)
  });
  return {
    coordinator,
    document,
    graph,
    graphAdapter,
    frames,
    factoryCalls,
    setPresentationMode(value: boolean) {
      presentationMode = value;
    }
  };
}

describe("SchematicJunctionRenderCoordinator", () => {
  it("coalesces scheduled live refreshes without invoking analysis", () => {
    const fixture = createFixture(tJunctionDocument());
    fixture.document.junctionAppearances = [
      { point: { x: 40, y: 0 }, color: "#0072b2" },
      { point: { x: 400, y: 400 }, color: "#d55e00" }
    ];

    fixture.coordinator.scheduleLiveRefresh();
    fixture.coordinator.scheduleLiveRefresh();

    expect(fixture.frames.callbacks.size).toBe(1);
    expect(fixture.document.junctions).toEqual([]);

    fixture.frames.runNext();

    expect(fixture.document.junctions).toEqual([{ x: 40, y: 0 }]);
    expect(fixture.document.junctionAppearances).toEqual([
      { point: { x: 40, y: 0 }, color: "#0072b2" }
    ]);
    expect(fixture.factoryCalls).toEqual([{ x: 40, y: 0 }]);
    expect(fixture.graph.getCell("junction-40-0")?.toFrontCalls).toBe(1);
    expect(fixture.frames.callbacks.size).toBe(0);
  });

  it("cancels pending work and forgets owned cells before a graph clear", () => {
    const fixture = createFixture();
    fixture.document.junctions = [{ x: 20, y: 20 }];
    fixture.coordinator.refreshViews();
    const firstCell = fixture.graph.getCell("junction-20-20");

    fixture.coordinator.scheduleLiveRefresh();
    fixture.coordinator.prepareForGraphClear();
    fixture.graph.clear();
    fixture.coordinator.refreshViews();

    expect(fixture.frames.canceledHandles).toEqual([1]);
    expect(fixture.frames.callbacks.size).toBe(0);
    expect(firstCell?.removeCalls).toBe(0);
    expect(fixture.factoryCalls).toEqual([
      { x: 20, y: 20 },
      { x: 20, y: 20 }
    ]);
    expect(fixture.graph.getCell("junction-20-20")).not.toBe(firstCell);
  });

  it("prunes obsolete cells, retains current cells, and repairs a missing tracked cell", () => {
    const fixture = createFixture();
    fixture.document.junctions = [{ x: 20, y: 20 }];
    fixture.coordinator.refreshViews();
    const obsoleteCell = fixture.graph.getCell("junction-20-20")!;

    fixture.document.junctions = [{ x: 60, y: 40 }];
    fixture.coordinator.refreshViews();
    const retainedCell = fixture.graph.getCell("junction-60-40")!;
    fixture.coordinator.refreshViews();

    expect(obsoleteCell.removeCalls).toBe(1);
    expect(fixture.factoryCalls).toEqual([
      { x: 20, y: 20 },
      { x: 60, y: 40 }
    ]);
    expect(retainedCell.toFrontCalls).toBe(1);

    retainedCell.remove();
    fixture.coordinator.refreshViews();

    expect(fixture.factoryCalls).toEqual([
      { x: 20, y: 20 },
      { x: 60, y: 40 },
      { x: 60, y: 40 }
    ]);
    expect(fixture.graph.getCell("junction-60-40")).not.toBe(retainedCell);
  });

  it("switches between document and presentation junction views", () => {
    const point = { x: 40, y: 0 };
    const document = documentWith();
    document.junctions = [point];
    const fixture = createFixture(document);

    fixture.coordinator.refreshViews();
    expect(fixture.graph.getCell("junction-40-0")).not.toBeNull();

    fixture.setPresentationMode(true);
    fixture.coordinator.refreshViews();
    expect(fixture.graph.getCell("junction-40-0")).toBeNull();

    fixture.setPresentationMode(false);
    fixture.coordinator.refreshViews();
    expect(fixture.graph.getCell("junction-40-0")).not.toBeNull();
  });

  it("updates topology and views without extracting an Analysis netlist", () => {
    const document = tJunctionDocument();
    document.junctions = [{ x: 400, y: 400 }];
    document.junctionAppearances = [
      { point: { x: 400, y: 400 }, color: "#d55e00" }
    ];
    const fixture = createFixture(document);
    const resolution = resolveSchematicNets(document);

    fixture.coordinator.scheduleLiveRefresh();
    const refreshedResolution = fixture.coordinator.refreshFull(resolution);

    expect(fixture.frames.canceledHandles).toEqual([1]);
    expect(fixture.frames.callbacks.size).toBe(0);
    expect(document.junctions).toEqual([{ x: 40, y: 0 }]);
    expect(document.junctionAppearances).toEqual([]);
    expect(fixture.graph.getCell("junction-40-0")?.toFrontCalls).toBe(1);
    expect(refreshedResolution).toBe(resolution);
  });

  it("adopts cached junction cells after the shared graph adapter is retargeted", () => {
    const document = documentWith();
    document.junctions = [{ x: 20, y: 20 }];
    const fixture = createFixture(document);
    const cachedGraph = new FakeGraph();
    const cachedCell = new FakeCell("junction-20-20", {
      junction: true,
      junctionKey: pointKey({ x: 20, y: 20 })
    });
    cachedGraph.addCell(cachedCell);

    fixture.coordinator.scheduleLiveRefresh();
    fixture.graphAdapter.setGraph(cachedGraph);
    fixture.coordinator.adoptCurrentGraph();
    fixture.coordinator.refreshViews();

    expect(fixture.frames.canceledHandles).toEqual([1]);
    expect(fixture.factoryCalls).toEqual([]);
    expect(cachedGraph.getCell("junction-20-20")).toBe(cachedCell);
    expect(cachedCell.removeCalls).toBe(0);
  });

  it("removes and restores independently hidden junction views", () => {
    const fixture = createFixture(tJunctionDocument());
    fixture.coordinator.refreshFull();
    const visibleCell = fixture.graph.getCell("junction-40-0");
    expect(visibleCell).not.toBeNull();

    fixture.document.layerObjectStates = { "junction-40-0": { visible: false } };
    fixture.coordinator.refreshViews();
    expect(visibleCell?.removeCalls).toBe(1);
    expect(fixture.graph.getCell("junction-40-0")).toBeNull();

    fixture.document.layerObjectStates = {};
    fixture.coordinator.refreshViews();
    expect(fixture.graph.getCell("junction-40-0")).not.toBeNull();
    expect(fixture.document.junctions).toEqual([{ x: 40, y: 0 }]);
  });
});
