import { describe, expect, it } from "vitest";
import { createSnapshotHistory } from "../../src/shared/history";

describe("snapshot history", () => {
  it("starts without undo or redo", () => {
    const history = createSnapshotHistory({ value: 1 });
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(false);
    expect(history.undo()).toBeNull();
    expect(history.redo()).toBeNull();
  });

  it("push enables undo", () => {
    const history = createSnapshotHistory({ value: 1 });
    expect(history.push({ value: 2 })).toBe(true);
    expect(history.canUndo).toBe(true);
    expect(history.undo()).toEqual({ value: 1 });
    expect(history.canRedo).toBe(true);
  });

  it("redo returns the next state after undo", () => {
    const history = createSnapshotHistory({ value: 1 });
    history.push({ value: 2 });
    expect(history.undo()).toEqual({ value: 1 });
    expect(history.redo()).toEqual({ value: 2 });
  });

  it("treats an empty reset snapshot as undoable and redoable", () => {
    const beforeReset = {
      junctionAppearances: [],
      netLabels: [],
      components: [{ id: "R1" }],
      wires: [{ id: "w1" }],
      junctions: [{ x: 20, y: 20 }],

      notes: [{ id: "n1", x: 0, y: 0, width: 80, text: "before reset" }]
    };
    const afterReset = {
      junctionAppearances: [],
      netLabels: [],
      components: [],
      wires: [],
      junctions: [],

      notes: []
    };
    const history = createSnapshotHistory(beforeReset);

    expect(history.push(afterReset)).toBe(true);
    expect(history.undo()).toEqual(beforeReset);
    expect(history.redo()).toEqual(afterReset);
  });

  it("pushing after undo clears redo", () => {
    const history = createSnapshotHistory({ value: 1 });
    history.push({ value: 2 });
    history.push({ value: 3 });
    expect(history.undo()).toEqual({ value: 2 });
    expect(history.canRedo).toBe(true);
    history.push({ value: 4 });
    expect(history.canRedo).toBe(false);
    expect(history.redo()).toBeNull();
  });

  it("trims old states at max depth", () => {
    const history = createSnapshotHistory({ value: 1 }, { maxDepth: 3 });
    history.push({ value: 2 });
    history.push({ value: 3 });
    history.push({ value: 4 });
    expect(history.undo()).toEqual({ value: 3 });
    expect(history.undo()).toEqual({ value: 2 });
    expect(history.undo()).toBeNull();
  });

  it("keeps 256 snapshots by default", () => {
    const history = createSnapshotHistory({ value: 0 });
    for (let value = 1; value <= 256; value += 1) {
      history.push({ value });
    }

    for (let value = 255; value >= 1; value -= 1) {
      expect(history.undo()).toEqual({ value });
    }
    expect(history.undo()).toBeNull();
  });

  it("skips duplicate snapshots", () => {
    const history = createSnapshotHistory({ value: 1 });
    expect(history.push({ value: 1 })).toBe(false);
    expect(history.canUndo).toBe(false);
  });
});
