import { authorFixture } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { SchematicNetLabelCommitCoordinator } from "../../../src/schematic/netLabelCommitCoordinator";
import { SchematicNetLabelToolController } from "../../../src/schematic/netLabelToolController";
import { emptyDoc, fixtureWire } from "../support/fixtures";

function coordinatorHarness() {
  const document = emptyDoc();
  const labelTool = new SchematicNetLabelToolController();
  let nextId = 0;
  let createIdCalls = 0;
  const coordinator = new SchematicNetLabelCommitCoordinator(
    document,
    labelTool,
    () => {
      createIdCalls += 1;
      return `label-${++nextId}`;
    }
  );
  return {
    coordinator,
    createIdCalls: () => createIdCalls,
    document,
    labelTool
  };
}

describe("SchematicNetLabelCommitCoordinator", () => {
  it("returns focus guidance without allocating an id when no label is armed", () => {
    const { coordinator, createIdCalls, document } = coordinatorHarness();

    expect(coordinator.commitPlacement({ x: 40, y: 0 })).toEqual({
      kind: "status",
      status: "Open Net Label and enter a valid net name first."
    });
    expect(createIdCalls()).toBe(0);
    expect(document.netLabels).toEqual([]);
  });

  it("rejects invalid targets before allocating an id", () => {
    const { coordinator, createIdCalls, document, labelTool } = coordinatorHarness();
    labelTool.arm("CLK");

    expect(coordinator.commitPlacement({ x: 40, y: 0 })).toEqual({
      kind: "status",
      status: "Net labels can only be placed on an active wire or junction."
    });
    expect(createIdCalls()).toBe(0);
    expect(document.netLabels).toEqual([]);
  });

  it("commits a label to the canonical document and keeps the name armed", () => {
    const { coordinator, createIdCalls, document, labelTool } = coordinatorHarness();
    document.wires = [fixtureWire("wire-1", [{ x: 0, y: 0 }, { x: 100, y: 0 }])];
    authorFixture(document);
    labelTool.arm("CLK");

    const outcome = coordinator.commitPlacement({ x: 40, y: 0 }, "wire-1");

    expect(outcome).toEqual({
      kind: "commit",
      result: {
        changed: true,
        historyIntent: "push",
        selectedIds: [],
        noteIds: [],
        status: "Placed label CLK. Click another wire to place the same label; Esc cancels."
      }
    });
    expect(document.netLabels).toEqual([
      {
        id: "label-1",
        name: "CLK",
        attachment: {
          wireId: "wire-1",
          point: { x: 40, y: 0 }
        }
      }
    ]);
    expect(createIdCalls()).toBe(1);
    expect(labelTool.snapshot().armedName).toBe("CLK");
  });

  it("supports consecutive placements with one armed name", () => {
    const { coordinator, document, labelTool } = coordinatorHarness();
    document.wires = [fixtureWire("wire-1", [{ x: 0, y: 0 }, { x: 100, y: 0 }])];
    authorFixture(document);
    labelTool.arm("OUT");

    expect(coordinator.commitPlacement({ x: 20, y: 0 }).kind).toBe("commit");
    expect(coordinator.commitPlacement({ x: 80, y: 0 }).kind).toBe("commit");

    expect(document.netLabels.map((label) => ({
      id: label.id,
      name: label.name,
      point: label.attachment.point
    }))).toEqual([
      { id: "label-1", name: "OUT", point: { x: 20, y: 0 } },
      { id: "label-2", name: "OUT", point: { x: 80, y: 0 } }
    ]);
  });
});
