import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import {
  createSelectionBoxCell,
  SchematicSelectionBoxController,
  SELECTION_BOX_ID,
  updateSelectionBoxCell
} from "../../../src/schematic/selection/selectionBoxController";
import type { SelectionBoxGeometry } from "../../../src/schematic/selection/selectionBoxModel";
import { selectionBoxBodyAttrs } from "../../../src/schematic/viewStyling";
import { fixtureComponent, fixtureNote, fixtureWire } from "../support/fixtures";
import type { SchematicDocument } from "../../../src/schematic/types";

interface FakeCell {
  id: string;
  createdWith: SelectionBoxGeometry;
  updates: SelectionBoxGeometry[];
}

function cloneGeometry(geometry: SelectionBoxGeometry): SelectionBoxGeometry {
  return {
    rect: { ...geometry.rect },
    containOnly: geometry.containOnly,
    tiny: geometry.tiny
  };
}

function geometry(x: number, y: number, width: number, height: number, containOnly: boolean): SelectionBoxGeometry {
  return {
    rect: { x, y, width, height },
    containOnly,
    tiny: false
  };
}

function expectBodyAttrs(cell: ReturnType<typeof createSelectionBoxCell>, containOnly: boolean) {
  const attrs = selectionBoxBodyAttrs(containOnly);
  expect(cell.attr("body/fill")).toBe(attrs.fill);
  expect(cell.attr("body/stroke")).toBe(attrs.stroke);
  expect(cell.attr("body/strokeDasharray")).toBe(attrs.strokeDasharray);
  expect(cell.attr("body/pointerEvents")).toBe(attrs.pointerEvents);
}

function makeHarness() {
  const addedCells: FakeCell[] = [];
  const removedIds: string[] = [];
  const createdGeometries: SelectionBoxGeometry[] = [];
  const listenerCalls = { add: 0, remove: 0 };

  const controller = new SchematicSelectionBoxController<FakeCell>({
    graphAdapter: {
      addCell: (cell) => {
        addedCells.push(cell);
      },
      removeCell: (id) => {
        removedIds.push(id);
      }
    },
    listeners: {
      add: () => {
        listenerCalls.add += 1;
      },
      remove: () => {
        listenerCalls.remove += 1;
      }
    },
    createCell: (geometry) => {
      const createdWith = cloneGeometry(geometry);
      createdGeometries.push(createdWith);
      return {
        id: SELECTION_BOX_ID,
        createdWith,
        updates: []
      };
    },
    updateCell: (cell, geometry) => {
      cell.updates.push(cloneGeometry(geometry));
    }
  });

  return { addedCells, controller, createdGeometries, listenerCalls, removedIds };
}

describe("schematic selection box controller", () => {
  it("creates a JointJS rectangle selection box cell", () => {
    const cell = createSelectionBoxCell(geometry(20, 40, 120, 80, false));

    expect(cell.id).toBe(SELECTION_BOX_ID);
    expect(cell.position()).toEqual({ x: 20, y: 40 });
    expect(cell.size()).toEqual({ width: 120, height: 80 });
    expectBodyAttrs(cell, false);
    expect(cell.attr("label/text")).toBe("");
    expect(cell.get("preview")).toBe(true);
  });

  it("updates the existing selection box cell in place", () => {
    const cell = createSelectionBoxCell(geometry(20, 40, 120, 80, false));
    const originalCell = cell;

    updateSelectionBoxCell(cell, geometry(4, 8, 30, 60, true));

    expect(cell).toBe(originalCell);
    expect(cell.id).toBe(SELECTION_BOX_ID);
    expect(cell.position()).toEqual({ x: 4, y: 8 });
    expect(cell.size()).toEqual({ width: 30, height: 60 });
    expectBodyAttrs(cell, true);
    expect(cell.attr("label/text")).toBe("");
    expect(cell.get("preview")).toBe(true);
  });

  it("tracks start, update, and cancel lifecycle", () => {
    const harness = makeHarness();

    expect(harness.controller.isActive()).toBe(false);
    expect(harness.controller.startPoint()).toBeNull();
    expect(harness.controller.isAdditive()).toBe(false);

    harness.controller.start({ x: 10, y: 20 }, true);

    expect(harness.controller.isActive()).toBe(true);
    expect(harness.controller.startPoint()).toEqual({ x: 10, y: 20 });
    expect(harness.controller.isAdditive()).toBe(true);
    expect(harness.listenerCalls.add).toBe(1);

    const geometry = harness.controller.update({ x: 30, y: 50 });

    expect(geometry?.rect).toEqual({ x: 10, y: 20, width: 20, height: 30 });
    expect(harness.addedCells).toHaveLength(1);
    expect(harness.addedCells[0].createdWith).toEqual(geometry);

    harness.controller.cancel();

    expect(harness.removedIds).toEqual([SELECTION_BOX_ID]);
    expect(harness.listenerCalls.remove).toBe(1);
    expect(harness.controller.isActive()).toBe(false);
    expect(harness.controller.startPoint()).toBeNull();
    expect(harness.controller.isAdditive()).toBe(false);
  });

  it("creates one selection-box cell and updates that same cell", () => {
    const harness = makeHarness();

    harness.controller.start({ x: 0, y: 0 }, false);
    harness.controller.update({ x: 20, y: 20 });
    harness.controller.update({ x: 40, y: 10 });

    expect(harness.addedCells).toHaveLength(1);
    expect(harness.createdGeometries).toHaveLength(1);
    expect(harness.addedCells[0].updates).toEqual([
      {
        rect: { x: 0, y: 0, width: 40, height: 10 },
        containOnly: false,
        tiny: false
      }
    ]);
  });

  it("clearTransient removes the current cell and listeners", () => {
    const harness = makeHarness();

    harness.controller.start({ x: 0, y: 0 }, false);
    harness.controller.update({ x: 20, y: 20 });
    harness.controller.clearTransient();

    expect(harness.removedIds).toEqual([SELECTION_BOX_ID]);
    expect(harness.listenerCalls.remove).toBe(1);
    expect(harness.controller.isActive()).toBe(false);
    expect(harness.controller.startPoint()).toBeNull();
  });

  it("finish returns hit and additive information while clearing runtime state", () => {
    const harness = makeHarness();
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [fixtureComponent("resistor", "R1", 100, 100)],
      wires: [fixtureWire("w1", [{ x: 0, y: 0 }, { x: 120, y: 0 }])],
      junctions: [{ x: 20, y: 0 }],
      notes: [fixtureNote("note-1", 40, 40)]
    });

    harness.controller.start({ x: -20, y: -20 }, true);
    harness.controller.update({ x: 180, y: 180 });
    const result = harness.controller.finish(document, { x: 180, y: 180 });

    expect(result?.additive).toBe(true);
    expect(result?.selectionBox.ids).toEqual(["R1", "w1", "junction-20-0"]);
    expect(result?.selectionBox.noteIds).toEqual(["note-1"]);
    expect(harness.removedIds).toEqual([SELECTION_BOX_ID]);
    expect(harness.listenerCalls.remove).toBe(1);
    expect(harness.controller.isActive()).toBe(false);
    expect(harness.controller.startPoint()).toBeNull();
    expect(harness.controller.update({ x: 200, y: 200 })).toBeNull();
  });
});
