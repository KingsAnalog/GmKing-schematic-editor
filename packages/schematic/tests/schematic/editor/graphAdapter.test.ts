import { describe, expect, it } from "vitest";
import { SchematicGraphAdapter, type SchematicGraphLike } from "../../../src/schematic/graphAdapter";

class FakeCell {
  removeCalls = 0;

  constructor(readonly id: string) {}

  remove() {
    this.removeCalls += 1;
  }
}

function makeGraph(initialCells: FakeCell[] = []) {
  const cells = new Map(initialCells.map((cell) => [cell.id, cell]));
  const graph = {
    addedIds: [] as string[],
    clearCalls: 0,
    getCellCalls: [] as string[],
    getCellsCalls: 0,
    clear() {
      this.clearCalls += 1;
    },
    addCell(cell: FakeCell) {
      this.addedIds.push(cell.id);
      cells.set(cell.id, cell);
    },
    getCell(id: string) {
      this.getCellCalls.push(id);
      return cells.get(id) ?? null;
    },
    getCells() {
      this.getCellsCalls += 1;
      return Array.from(cells.values());
    }
  } satisfies SchematicGraphLike<FakeCell> & {
    addedIds: string[];
    clearCalls: number;
    getCellCalls: string[];
    getCellsCalls: number;
  };
  return graph;
}

describe("schematic graph adapter", () => {
  it("adds cells in requested order", () => {
    const graph = makeGraph();
    const adapter = new SchematicGraphAdapter(graph);

    adapter.addCell(new FakeCell("a"));
    adapter.addCells([new FakeCell("b"), new FakeCell("c")]);
    adapter.addCells([]);

    expect(graph.addedIds).toEqual(["a", "b", "c"]);
  });

  it("forwards getCell lookups", () => {
    const cell = new FakeCell("cell-1");
    const graph = makeGraph([cell]);
    const adapter = new SchematicGraphAdapter(graph);

    expect(adapter.getCell("cell-1")).toBe(cell);
    expect(graph.getCellCalls).toEqual(["cell-1"]);
  });

  it("forwards getCells lookups", () => {
    const cells = [new FakeCell("cell-1"), new FakeCell("cell-2")];
    const graph = makeGraph(cells);
    const adapter = new SchematicGraphAdapter(graph);

    expect(adapter.getCells()).toEqual(cells);
    expect(graph.getCellsCalls).toBe(1);
  });

  it("does nothing when removing a missing cell", () => {
    const graph = makeGraph();
    const adapter = new SchematicGraphAdapter(graph);

    adapter.removeCell("missing");

    expect(graph.getCellCalls).toEqual(["missing"]);
  });

  it("removes an existing cell exactly once", () => {
    const cell = new FakeCell("cell-1");
    const graph = makeGraph([cell]);
    const adapter = new SchematicGraphAdapter(graph);

    adapter.removeCell("cell-1");

    expect(cell.removeCalls).toBe(1);
  });

  it("forwards clear", () => {
    const graph = makeGraph();
    const adapter = new SchematicGraphAdapter(graph);

    adapter.clear();

    expect(graph.clearCalls).toBe(1);
  });

  it("retargets one stable adapter without touching the inactive graph", () => {
    const firstCell = new FakeCell("first");
    const secondCell = new FakeCell("second");
    const firstGraph = makeGraph([firstCell]);
    const secondGraph = makeGraph([secondCell]);
    const adapter = new SchematicGraphAdapter(firstGraph);

    adapter.setGraph(secondGraph);
    adapter.addCell(new FakeCell("new"));
    adapter.removeCell("second");
    adapter.clear();

    expect(firstGraph.getCellCalls).toEqual([]);
    expect(firstGraph.addedIds).toEqual([]);
    expect(firstGraph.clearCalls).toBe(0);
    expect(secondGraph.addedIds).toEqual(["new"]);
    expect(secondCell.removeCalls).toBe(1);
    expect(secondGraph.clearCalls).toBe(1);
  });
});
