import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { junctionId } from "../../../src/schematic/renderer";
import {
  DELETE_SELECTION_EMPTY_STATUS,
  DELETE_TARGET_EMPTY_STATUS,
  TEMPORARY_DELETE_SELECTION_EMPTY_STATUS,
  TEMPORARY_DELETE_TARGET_EMPTY_STATUS,
  TEMPORARY_DELETE_UNSUPPORTED_STATUS,
  deleteSchematicSelection,
  deleteSelectionStatus,
  projectSchematicDeleteTargets,
  temporaryDeletableSchematicIds,
  temporaryDeleteToggleStatus,
  toggleTemporaryDeletedByIds
} from "../../../src/schematic/selection/selectionDeleteModel";
import { projectSchematicSelection } from "../../../src/schematic/selection/selectionProjection";
import { setMixedSelection } from "../../../src/schematic/selection/selectionModel";
import type { SchematicDocument } from "../../../src/schematic/types";
import { fixtureComponent, fixtureNote, fixtureWire } from "../support/fixtures";

describe("schematic selection delete model", () => {
  it("permanently deletes mixed objects and disconnects selected junctions", () => {
    const document: SchematicDocument = fixtureDocument({
      junctionAppearances: [],
      netLabels: [],
      components: [fixtureComponent("resistor", "R1", 40, 0), fixtureComponent("capacitor", "C1", 120, 0)],
      wires: [
        fixtureWire("w-delete", [{ x: 0, y: 0 }, { x: 80, y: 0 }]),
        fixtureWire("w-keep", [{ x: 120, y: 0 }, { x: 200, y: 0 }])
      ],
      junctions: [
        { x: 80, y: 0 },
        { x: 160, y: 0 }
      ],

      notes: [fixtureNote("note-delete", 20, 20), fixtureNote("note-keep", 200, 20)]
    }, { joinAt: [{ x: 80, y: 0 }, { x: 160, y: 0 }], disconnectAt: [{ x: 80, y: 0 }, { x: 240, y: 0 }] });
    const selection = projectSchematicSelection(
      document,
      setMixedSelection(["R1", "w-delete", junctionId({ x: 80, y: 0 })], ["note-delete"])
    );

    const result = deleteSchematicSelection(document, selection);

    expect(result.removedCount).toBe(4);
    expect(document.components.map((component) => component.id)).toEqual(["C1"]);
    expect(document.wires.map((wire) => wire.id)).toEqual(["w-keep"]);
    expect(document.notes?.map((note) => note.id)).toEqual(["note-keep"]);
    expect(document.junctions).toEqual([
      { x: 80, y: 0 },
      { x: 160, y: 0 }
    ]);

  });

  it("leaves the document unchanged for an empty permanent delete projection", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [fixtureComponent("resistor", "R1", 40, 0)],
      wires: [fixtureWire("w1", [{ x: 0, y: 0 }, { x: 40, y: 0 }])],
      junctions: [],
      notes: [fixtureNote("note-1", 20, 20)]
    });
    const before = JSON.stringify(document);
    const selection = projectSchematicSelection(document, setMixedSelection([], []));

    const result = deleteSchematicSelection(document, selection);

    expect(result.removedCount).toBe(0);
    expect(JSON.stringify(document)).toBe(before);
  });

  it("deletes a coupling without deleting its inductors", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [
        fixtureComponent("inductor", "L1", 40, 40),
        fixtureComponent("inductor", "L2", 120, 40)
      ],
      inductorCouplings: [{ showLabel: true,
        id: "K12",
        inductorAId: "L1",
        inductorBId: "L2",
        coefficient: "k12",
        coefficientAuto: true,
        labelMode: "coefficient",
        showArc: true,
        showCore: false,
        arcFlipped: false
      }],
      wires: [],
      junctions: [],
      notes: []
    });
    const selection = projectSchematicSelection(document, setMixedSelection(["K12"], []));

    expect(deleteSchematicSelection(document, selection)).toEqual({ removedCount: 1 });
    expect(document.components.map((component) => component.id)).toEqual(["L1", "L2"]);
    expect(document.inductorCouplings).toBeUndefined();
  });

  it("deletes every coupling attached to a deleted inductor", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [
        fixtureComponent("inductor", "L1", 40, 40),
        fixtureComponent("inductor", "L2", 120, 40),
        fixtureComponent("inductor", "L3", 200, 40)
      ],
      inductorCouplings: [
        { showLabel: true,
          id: "K12",
          inductorAId: "L1",
          inductorBId: "L2",
          coefficient: "k12",
          coefficientAuto: true,
          labelMode: "coefficient",
          showArc: true,
          showCore: false,
          arcFlipped: false
        },
        { showLabel: true,
          id: "K23",
          inductorAId: "L2",
          inductorBId: "L3",
          coefficient: "k23",
          coefficientAuto: true,
          labelMode: "coefficient",
          showArc: true,
          showCore: false,
          arcFlipped: false
        }
      ],
      wires: [],
      junctions: [],
      notes: []
    });
    const selection = projectSchematicSelection(document, setMixedSelection(["L2"], []));

    expect(deleteSchematicSelection(document, selection)).toEqual({ removedCount: 3 });
    expect(document.components.map((component) => component.id)).toEqual(["L1", "L3"]);
    expect(document.inductorCouplings).toBeUndefined();
  });

  it("filters temporary delete targets to components and wires only", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      components: [fixtureComponent("resistor", "R1", 40, 0)],
      wires: [fixtureWire("w1", [{ x: 0, y: 0 }, { x: 40, y: 0 }])],
      junctions: [{ x: 20, y: 0 }],
      netLabels: [{ id: "label-1", name: "OUT", attachment: { wireId: "w1", point: { x: 20, y: 0 } } }],
      notes: [fixtureNote("note-1", 20, 20)]
    });

    expect(temporaryDeletableSchematicIds(document, ["note-1", "label-1", "w1", junctionId({ x: 20, y: 0 }), "R1", "R1"])).toEqual(["w1", "R1"]);
  });

  it("projects permanent delete targets by deduping objects and notes without filtering target kinds", () => {
    const junctionTarget = junctionId({ x: 20, y: 0 });
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [fixtureComponent("resistor", "R1", 40, 0)],
      wires: [fixtureWire("w1", [{ x: 0, y: 0 }, { x: 40, y: 0 }])],
      junctions: [{ x: 20, y: 0 }],
      notes: [fixtureNote("note-1", 20, 20), fixtureNote("note-2", 120, 20)]
    });

    expect(
      projectSchematicDeleteTargets(document, "delete", ["R1", "w1", junctionTarget, "R1", junctionTarget], ["note-1", "note-2", "note-1"])
    ).toEqual({
      ids: ["R1", "w1", junctionTarget],
      noteIds: ["note-1", "note-2"]
    });
  });

  it("projects temporary delete targets by keeping components and wires while dropping junctions and notes", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [fixtureComponent("resistor", "R1", 40, 0)],
      wires: [fixtureWire("w1", [{ x: 0, y: 0 }, { x: 40, y: 0 }])],
      junctions: [{ x: 20, y: 0 }],
      notes: [fixtureNote("note-1", 20, 20)]
    });

    expect(
      projectSchematicDeleteTargets(document, "temp-delete", ["note-1", "w1", junctionId({ x: 20, y: 0 }), "R1", "R1", "w1"], ["note-1"])
    ).toEqual({
      ids: ["w1", "R1"],
      noteIds: []
    });
  });

  it("toggles temporary delete for eligible components and wires while ignoring notes and junctions", () => {
    const component = fixtureComponent("resistor", "R1", 40, 0);
    const keptComponent = { ...fixtureComponent("capacitor", "C1", 120, 0), temporarilyDeleted: true };
    const wire = fixtureWire("w1", [{ x: 0, y: 0 }, { x: 40, y: 0 }]);
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [component, keptComponent],
      wires: [wire],
      junctions: [{ x: 20, y: 0 }],
      notes: [fixtureNote("note-1", 20, 20)]
    });

    const first = toggleTemporaryDeletedByIds(document, ["R1", "note-1", junctionId({ x: 20, y: 0 }), "w1"]);

    expect(first).toEqual({ ids: ["R1", "w1"], recovered: false });
    expect(component.temporarilyDeleted).toBe(true);
    expect(wire.temporarilyDeleted).toBe(true);
    expect(keptComponent.temporarilyDeleted).toBe(true);

    const second = toggleTemporaryDeletedByIds(document, ["R1", "w1"]);

    expect(second).toEqual({ ids: ["R1", "w1"], recovered: true });
    expect(component.temporarilyDeleted).toBe(false);
    expect(wire.temporarilyDeleted).toBe(false);
    expect(keptComponent.temporarilyDeleted).toBe(true);
  });

  it("marks all eligible objects when the temporary delete selection is mixed", () => {
    const component = { ...fixtureComponent("resistor", "R1", 40, 0), temporarilyDeleted: true };
    const wire = fixtureWire("w1", [{ x: 0, y: 0 }, { x: 40, y: 0 }]);
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [component],
      wires: [wire],
      junctions: []
    });

    const result = toggleTemporaryDeletedByIds(document, ["R1", "w1"]);

    expect(result).toEqual({ ids: ["R1", "w1"], recovered: false });
    expect(component.temporarilyDeleted).toBe(true);
    expect(wire.temporarilyDeleted).toBe(true);
  });

  it("reports no temporary delete targets when only notes and junctions are selected", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [fixtureComponent("resistor", "R1", 40, 0)],
      wires: [fixtureWire("w1", [{ x: 0, y: 0 }, { x: 40, y: 0 }])],
      junctions: [{ x: 20, y: 0 }],
      notes: [fixtureNote("note-1", 20, 20)]
    });

    expect(toggleTemporaryDeletedByIds(document, ["note-1", junctionId({ x: 20, y: 0 })])).toEqual({ ids: [], recovered: false });
  });

  it("projects permanent delete status copy with exact singular and plural text", () => {
    expect(DELETE_SELECTION_EMPTY_STATUS).toBe("Select objects before deleting.");
    expect(DELETE_TARGET_EMPTY_STATUS).toBe("Delete mode: click an object or drag a box around objects to delete.");
    expect(deleteSelectionStatus(1)).toBe("Deleted 1 object.");
    expect(deleteSelectionStatus(2)).toBe("Deleted 2 objects.");
  });

  it("projects temporary delete status copy with exact plural and recovery text", () => {
    expect(TEMPORARY_DELETE_TARGET_EMPTY_STATUS).toBe(
      "Temporary Delete mode: click a component or wire, or drag a box around components and wires."
    );
    expect(TEMPORARY_DELETE_SELECTION_EMPTY_STATUS).toBe("Select objects before temporary delete.");
    expect(TEMPORARY_DELETE_UNSUPPORTED_STATUS).toBe(
      "Temporary delete applies to components and wires. Use Delete to remove junctions, labels, or notes."
    );
    expect(temporaryDeleteToggleStatus({ ids: ["R1"], recovered: false })).toBe("Temporarily deleted 1 object.");
    expect(temporaryDeleteToggleStatus({ ids: ["R1", "w1"], recovered: false })).toBe("Temporarily deleted 2 objects.");
    expect(temporaryDeleteToggleStatus({ ids: ["R1"], recovered: true })).toBe("Recovered 1 object.");
    expect(temporaryDeleteToggleStatus({ ids: ["R1", "w1"], recovered: true })).toBe("Recovered 2 objects.");
  });
});
