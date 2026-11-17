import { shapes } from "@joint/core";
import { describe, expect, it, vi } from "vitest";
import { createSchematicPaperSurface } from "../../../src/schematic/paperLifecycle";
import { SCHEMATIC_GRID } from "../../../src/schematic/renderer";

class FakeCell {
  removeCalls = 0;

  constructor(readonly id: string) {}

  remove() {
    this.removeCalls += 1;
  }
}

class FakeGraph {
  readonly cells = new Map<string, FakeCell>();
  readonly addedIds: string[] = [];
  readonly eventHandlers = new Map<string, Array<(cell: unknown) => void>>();
  clearCalls = 0;

  clear() {
    this.clearCalls += 1;
    this.cells.clear();
  }

  addCell(cell: FakeCell) {
    this.addedIds.push(cell.id);
    this.cells.set(cell.id, cell);
  }

  getCell(id: string) {
    return this.cells.get(id) ?? null;
  }

  getCells() {
    return Array.from(this.cells.values());
  }

  on(eventName: string, handler: (cell: unknown) => void) {
    this.eventHandlers.set(eventName, [...(this.eventHandlers.get(eventName) ?? []), handler]);
  }
}

class FakePaper {
  readonly scaleCalls: Array<[number, number]> = [];
  readonly translateCalls: Array<[number, number]> = [];
  removeCalls = 0;

  scale(x: number, y: number) {
    this.scaleCalls.push([x, y]);
  }

  translate(x: number, y: number) {
    this.translateCalls.push([x, y]);
  }

  remove() {
    this.removeCalls += 1;
  }
}

function makePaperEl() {
  return {
    clientWidth: 800,
    clientHeight: 600,
    scrollLeft: 0,
    scrollTop: 0,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
  } as HTMLElement;
}

describe("schematic paper lifecycle", () => {
  it("creates the paper with the editor paper options", () => {
    const graph = new FakeGraph();
    const paper = new FakePaper();
    const paperEl = makePaperEl();
    const interactive = () => ({ labelMove: false });
    let capturedOptions: any = null;

    const surface = createSchematicPaperSurface({
      paperEl,
      interactive,
      createGraph: () => graph,
      createPaper: (options) => {
        capturedOptions = options;
        return paper;
      }
    });

    expect(surface.graph).toBe(graph);
    expect(surface.paper).toBe(paper);
    expect(capturedOptions).toMatchObject({
      el: paperEl,
      model: graph,
      width: "100%",
      height: "100%",
      gridSize: 10,
      background: { color: "#ffffff" }
    });
    expect(capturedOptions.drawGrid).toBe(SCHEMATIC_GRID);
    expect(capturedOptions.cellViewNamespace).toBe(shapes);
    expect(capturedOptions.validateMagnet()).toBe(false);
    expect(capturedOptions.interactive).toBe(interactive);
  });

  it("exposes adapters backed by the created graph and paper", () => {
    const graph = new FakeGraph();
    const paper = new FakePaper();
    const surface = createSchematicPaperSurface({
      paperEl: makePaperEl(),
      interactive: false,
      createGraph: () => graph,
      createPaper: () => paper
    });

    const cell = new FakeCell("cell-1");
    surface.graphAdapter.addCell(cell);

    expect(graph.addedIds).toEqual(["cell-1"]);
    expect(surface.graphAdapter.getCell("cell-1")).toBe(cell);
    expect(surface.graphAdapter.getCells()).toEqual([cell]);

    surface.viewAdapter.setView({ zoom: 2, translate: { x: 10, y: 20 } });
    expect(paper.scaleCalls).toEqual([[2, 2]]);
    expect(paper.translateCalls).toEqual([[10, 20]]);
  });

  it("registers geometry change handlers for the JointJS geometry events", () => {
    const graph = new FakeGraph();
    const surface = createSchematicPaperSurface({
      paperEl: makePaperEl(),
      interactive: false,
      createGraph: () => graph,
      createPaper: () => new FakePaper()
    });
    const changedCells: unknown[] = [];
    const changedCell = new FakeCell("moved");

    surface.onGeometryChange((cell) => changedCells.push(cell));

    expect(Array.from(graph.eventHandlers.keys()).sort()).toEqual(["change:position", "change:source", "change:target", "change:vertices"]);
    graph.eventHandlers.forEach((handlers) => {
      expect(handlers).toHaveLength(1);
      handlers[0](changedCell);
    });
    expect(changedCells).toEqual([changedCell, changedCell, changedCell, changedCell]);
  });

  it("destroys the paper and clears the graph", () => {
    const graph = new FakeGraph();
    const paper = new FakePaper();
    const surface = createSchematicPaperSurface({
      paperEl: makePaperEl(),
      interactive: false,
      createGraph: () => graph,
      createPaper: () => paper
    });

    graph.addCell(new FakeCell("cell-1"));
    surface.destroy();

    expect(paper.removeCalls).toBe(1);
    expect(graph.clearCalls).toBe(1);
    expect(graph.getCells()).toEqual([]);
  });

  it("refreshes a grid created in a hidden host and disconnects its layout observer on destroy", () => {
    let resized: ResizeObserverCallback = () => {};
    const observe = vi.fn();
    const disconnect = vi.fn();
    class FakeResizeObserver {
      constructor(callback: ResizeObserverCallback) { resized = callback; }
      observe = observe;
      disconnect = disconnect;
    }
    const paperEl = Object.assign(makePaperEl(), {
      clientWidth: 0, clientHeight: 0,
      ownerDocument: { defaultView: { ResizeObserver: FakeResizeObserver } }
    });
    const updateGrid = vi.fn();
    const paper = Object.assign(new FakePaper(), { getLayerView: vi.fn(() => ({ updateGrid })) });
    const surface = createSchematicPaperSurface({
      paperEl, interactive: false, createGraph: () => new FakeGraph(), createPaper: () => paper
    });
    expect(observe).toHaveBeenCalledWith(paperEl);
    Object.assign(paperEl, { clientWidth: 800, clientHeight: 600 });
    resized([], {} as ResizeObserver);
    expect(paper.getLayerView).toHaveBeenCalledWith("grid");
    expect(updateGrid).toHaveBeenCalledOnce();
    surface.destroy();
    expect(disconnect).toHaveBeenCalledOnce();
  });
});
