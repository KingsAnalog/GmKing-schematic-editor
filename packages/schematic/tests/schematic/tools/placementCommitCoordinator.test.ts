import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { SchematicCopyController } from "../../../src/schematic/copyController";
import type { CopySource } from "../../../src/schematic/copyModel";
import { SchematicPlacementCommitCoordinator } from "../../../src/schematic/placementCommitCoordinator";
import { SchematicPlacementToolController } from "../../../src/schematic/placementToolController";
import type { ComponentType } from "../../../src/schematic/types";
import { emptyDoc, fixtureComponent } from "../support/fixtures";

function componentSource(): CopySource {
  return fixtureDocument({
    components: [fixtureComponent("resistor", "R1", 20, 40)],
    wires: [],
    netLabels: [],
    notes: [],

    junctionAppearances: []
  });
}

function coordinatorHarness(options: { activePlacement?: boolean } = {}) {
  const document = emptyDoc();
  const placementTool = new SchematicPlacementToolController(
    "resistor",
    options.activePlacement === false ? { activeItem: null } : {}
  );
  const copyTool = new SchematicCopyController();
  let nextId = 0;
  let nextRef = 0;
  const coordinator = new SchematicPlacementCommitCoordinator(
    document,
    placementTool,
    copyTool,
    {
      createId: () => `id-${++nextId}`,
      nextComponentRef: (type: ComponentType) => `${type}-${++nextRef}`
    }
  );
  return { coordinator, copyTool, document };
}

describe("SchematicPlacementCommitCoordinator", () => {
  it("commits the active placement directly to the canonical document", () => {
    const { coordinator, document } = coordinatorHarness();

    const outcome = coordinator.commitPlacement({ x: 80, y: 100 });

    expect(outcome).toMatchObject({
      kind: "commit",
      source: "placement",
      previewPoint: { x: 80, y: 100 },
      nextPlacementItem: "resistor",
      syncToolUiAfterPreview: false,
      result: {
        changed: true,
        historyIntent: "push",
        selectedIds: ["id-1"]
      }
    });
    expect(document.components).toMatchObject([
      {
        id: "id-1",
        type: "resistor",
        ref: "resistor-1",
        x: 80,
        y: 100
      }
    ]);
  });

  it("returns status without mutating when no placement item is active", () => {
    const { coordinator, document } = coordinatorHarness({ activePlacement: false });

    expect(coordinator.commitPlacement({ x: 80, y: 100 })).toEqual({
      kind: "status",
      status: "Type a valid component or template name before placing."
    });
    expect(document.components).toEqual([]);
  });

  it("commits a copy while preserving its source for continuous placement", () => {
    const { coordinator, copyTool, document } = coordinatorHarness();
    copyTool.attachSource({
      source: componentSource(),
      anchor: { x: 20, y: 40 }
    });

    const outcome = coordinator.commitCopy({ x: 200, y: 220 });

    expect(outcome).toMatchObject({
      kind: "commit",
      source: "copy",
      previewPoint: { x: 200, y: 220 },
      nextPlacementItem: "resistor",
      syncToolUiAfterPreview: true,
      result: {
        changed: true,
        historyIntent: "push",
        selectedIds: ["id-1"]
      }
    });
    expect(document.components).toMatchObject([
      {
        id: "id-1",
        type: "resistor",
        ref: "resistor-1",
        x: 200,
        y: 220
      }
    ]);
    expect(copyTool.hasSource).toBe(true);
    expect(copyTool.anchor).toEqual({ x: 20, y: 40 });
  });

  it("returns copy guidance without mutating when no source is armed", () => {
    const { coordinator, document } = coordinatorHarness();

    expect(coordinator.commitCopy({ x: 200, y: 220 })).toEqual({
      kind: "status",
      status: "Copy mode: click an object to copy, or Esc cancels."
    });
    expect(document.components).toEqual([]);
  });
});
