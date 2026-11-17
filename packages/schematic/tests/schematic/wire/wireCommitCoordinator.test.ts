import { describe, expect, it } from "vitest";
import { emptyDoc } from "../support/fixtures";
import { SchematicWireCommitCoordinator } from "../../../src/schematic/wire/wireCommitCoordinator";
import { SchematicWireToolController } from "../../../src/schematic/wire/wireToolController";

function coordinatorHarness() {
  const document = emptyDoc();
  const wireTool = new SchematicWireToolController();
  let nextId = 1;
  const coordinator = new SchematicWireCommitCoordinator(
    document,
    wireTool,
    () => `wire-${nextId++}`
  );
  return { coordinator, document, wireTool };
}

describe("SchematicWireCommitCoordinator", () => {
  it("keeps pending route state out of the canonical document", () => {
    const { coordinator, document, wireTool } = coordinatorHarness();

    expect(coordinator.applyBlankClick({ x: 13, y: 8 })).toEqual({
      kind: "pending",
      previewPoint: { x: 10, y: 10 },
      status: "Wire start 10, 10. Empty clicks add bends; click a pin or press Enter to finish."
    });
    expect(document.wires).toEqual([]);
    expect(wireTool.routePointCount()).toBe(1);
  });

  it("commits a finished route once and resets the route session", () => {
    const { coordinator, document, wireTool } = coordinatorHarness();

    expect(coordinator.applyPinClick({ x: 40, y: 0 }).kind).toBe("pending");
    const outcome = coordinator.applyPinClick({ x: 80, y: 40 });

    expect(outcome).toMatchObject({
      kind: "commit",
      result: {
        changed: true,
        historyIntent: "push",
        status: "Wire added. Click another start point or press Esc."
      }
    });
    expect(document.wires).toHaveLength(2);
    expect(document.wires.map((wire) => wire.points)).toEqual([
      [{ x: 40, y: 0 }, { x: 80, y: 0 }],
      [{ x: 80, y: 0 }, { x: 80, y: 40 }]
    ]);
    expect(wireTool.routePointCount()).toBe(0);
  });

  it("keeps route state when a commit-shaped route is a document no-op", () => {
    const { coordinator, document, wireTool } = coordinatorHarness();

    coordinator.applyBlankClick({ x: 0, y: 0 });
    coordinator.applyBlankClick({ x: 40, y: 0 });
    const outcome = coordinator.finishFromKeyboard({ x: 0, y: 0 });

    expect(outcome).toEqual({ kind: "none" });
    expect(document.wires).toEqual([]);
    expect(wireTool.routePointCount()).toBe(2);
  });

  it("projects invalid keyboard finishes as status without changing route state", () => {
    const { coordinator, document, wireTool } = coordinatorHarness();

    expect(coordinator.finishFromKeyboard(null)).toEqual({
      kind: "status",
      status: "Click a start point before finishing a wire."
    });
    expect(document.wires).toEqual([]);
    expect(wireTool.routePointCount()).toBe(0);
  });
});
