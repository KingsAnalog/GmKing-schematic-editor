import { authorFixture, fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { SchematicDeleteCommitCoordinator } from "../../../src/schematic/deleteCommitCoordinator";
import { junctionId } from "../../../src/schematic/renderer";
import { setMixedSelection } from "../../../src/schematic/selection/selectionModel";
import { projectSchematicSelection } from "../../../src/schematic/selection/selectionProjection";
import type { SchematicDocument } from "../../../src/schematic/types";
import { fixtureComponent, fixtureNote, fixtureWire } from "../support/fixtures";

function deleteDocument(): SchematicDocument {
  return fixtureDocument({
    components: [
      fixtureComponent("resistor", "R1", 40, 0),
      fixtureComponent("capacitor", "C1", 120, 0)
    ],
    wires: [
      fixtureWire("wire-delete", [{ x: 0, y: 0 }, { x: 80, y: 0 }]),
      fixtureWire("wire-keep", [{ x: 120, y: 0 }, { x: 200, y: 0 }])
    ],
    netLabels: [],
    junctions: [{ x: 80, y: 0 }],

    junctionAppearances: [],
    notes: [
      fixtureNote("note-delete", 20, 20),
      fixtureNote("note-keep", 200, 20)
    ]
  });
}

describe("SchematicDeleteCommitCoordinator", () => {
  it("permanently deletes one complete projected selection", () => {
    const document = deleteDocument();
    const coordinator = new SchematicDeleteCommitCoordinator(document);
    const selection = projectSchematicSelection(
      document,
      setMixedSelection(["R1", "wire-delete"], ["note-delete"])
    );

    expect(coordinator.deleteSelection(selection)).toMatchObject({
      kind: "commit",
      result: {
        changed: true,
        historyIntent: "push",
        selectedIds: [],
        noteIds: [],
        removedCount: 3,
        status: "Deleted 3 objects."
      }
    });
    expect(document.components.map((component) => component.id)).toEqual(["C1"]);
    expect(document.wires.map((wire) => wire.id)).toEqual(["wire-keep"]);
    expect(document.notes.map((note) => note.id)).toEqual(["note-keep"]);
  });

  it("returns status for a stale permanent-delete projection", () => {
    const document = deleteDocument();
    const coordinator = new SchematicDeleteCommitCoordinator(document);
    const selection = projectSchematicSelection(
      document,
      setMixedSelection(["R1"], [])
    );
    document.components = document.components.filter((component) => component.id !== "R1");
    authorFixture(document);
    const before = structuredClone(document);

    expect(coordinator.deleteSelection(selection)).toEqual({
      kind: "status",
      status: "Select objects before deleting."
    });
    expect(document).toEqual(before);
  });

  it("toggles a temporary-delete batch once and recovers the same batch together", () => {
    const document = deleteDocument();
    const coordinator = new SchematicDeleteCommitCoordinator(document);

    expect(coordinator.toggleTemporary(["R1", "wire-delete"])).toMatchObject({
      kind: "commit",
      result: {
        historyIntent: "push",
        selectedIds: ["R1", "wire-delete"],
        recovered: false,
        status: "Temporarily deleted 2 objects."
      }
    });
    expect(document.components[0].temporarilyDeleted).toBe(true);
    expect(document.wires[0].temporarilyDeleted).toBe(true);

    expect(coordinator.toggleTemporary(["R1", "wire-delete"])).toMatchObject({
      kind: "commit",
      result: {
        historyIntent: "push",
        selectedIds: ["R1", "wire-delete"],
        recovered: true,
        status: "Recovered 2 objects."
      }
    });
    expect(document.components[0].temporarilyDeleted).toBe(false);
    expect(document.wires[0].temporarilyDeleted).toBe(false);
  });

  it("returns unsupported status without mutating the document", () => {
    const document = deleteDocument();
    const coordinator = new SchematicDeleteCommitCoordinator(document);
    const before = structuredClone(document);

    expect(coordinator.toggleTemporary([
      "note-delete",
      junctionId({ x: 80, y: 0 })
    ])).toEqual({
      kind: "status",
      status: "Temporary delete applies to components and wires. Use Delete to remove junctions, labels, or notes."
    });
    expect(document).toEqual(before);
  });
});
