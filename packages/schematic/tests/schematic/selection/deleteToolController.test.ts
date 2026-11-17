import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { SchematicDeleteToolController } from "../../../src/schematic/deleteToolController";
import { junctionId } from "../../../src/schematic/renderer";
import { DELETE_TARGET_EMPTY_STATUS, TEMPORARY_DELETE_TARGET_EMPTY_STATUS } from "../../../src/schematic/selection/selectionDeleteModel";
import { fixtureComponent, fixtureNote, fixtureWire } from "../support/fixtures";
import type { SchematicDocument } from "../../../src/schematic/types";

function makeDocument(): SchematicDocument {
  return fixtureDocument({
    junctionAppearances: [],
    netLabels: [],
    components: [fixtureComponent("resistor", "R1", 40, 40), fixtureComponent("capacitor", "C1", 140, 40)],
    wires: [fixtureWire("w1", [{ x: 0, y: 0 }, { x: 80, y: 0 }])],
    junctions: [{ x: 20, y: 0 }],

    notes: [fixtureNote("note-1", 120, 120)]
  });
}

function hoverIds(controller: SchematicDeleteToolController) {
  return Array.from(controller.hoverState());
}

describe("schematic delete tool controller", () => {
  it("projects permanent delete hover targets while preserving notes and junction ids", () => {
    const controller = new SchematicDeleteToolController();
    const document = makeDocument();
    const junction = junctionId({ x: 20, y: 0 });

    expect(controller.setHover(document, "delete", ["R1", "w1", junction, "R1"], ["note-1", "note-1"])).toBe(true);

    expect(hoverIds(controller)).toEqual(["R1", "w1", junction, "note-1"]);
    expect(controller.hasHover()).toBe(true);
    expect(controller.setHover(document, "delete", ["R1", "w1", junction], ["note-1"])).toBe(false);
  });

  it("filters temporary delete hover targets to components and wires", () => {
    const controller = new SchematicDeleteToolController();
    const document = makeDocument();
    const junction = junctionId({ x: 20, y: 0 });

    expect(controller.setHover(document, "temp-delete", ["note-1", "w1", junction, "R1"], ["note-1"])).toBe(true);

    expect(hoverIds(controller)).toEqual(["w1", "R1"]);
    expect(controller.clearHover()).toBe(true);
    expect(controller.clearHover()).toBe(false);
    expect(controller.hasHover()).toBe(false);
  });

  it("decides between entering delete tools and applying selected-object commands", () => {
    const controller = new SchematicDeleteToolController();

    expect(controller.commandForSelection("delete", false)).toEqual({ kind: "begin-tool", mode: "delete" });
    expect(controller.commandForSelection("temp-delete", false)).toEqual({ kind: "begin-tool", mode: "temp-delete" });
    expect(controller.commandForSelection("delete", true)).toEqual({ kind: "delete-selected" });
    expect(controller.commandForSelection("temp-delete", true)).toEqual({ kind: "temporary-delete-selected" });
  });

  it("projects click and box target commands using the active delete mode", () => {
    const controller = new SchematicDeleteToolController();
    const document = makeDocument();
    const junction = junctionId({ x: 20, y: 0 });

    expect(controller.commandForTargets(document, "delete", ["R1", junction, "R1"], ["note-1"])).toEqual({
      kind: "delete-targets",
      ids: ["R1", junction],
      noteIds: ["note-1"]
    });

    expect(controller.commandForTargets(document, "temp-delete", ["R1", junction, "note-1", "w1"], ["note-1"])).toEqual({
      kind: "temporary-delete-targets",
      ids: ["R1", "w1"]
    });
  });

  it("returns empty target commands so the editor can keep legacy status handling", () => {
    const controller = new SchematicDeleteToolController();
    const document = makeDocument();

    expect(controller.commandForTargets(document, "delete", [], [])).toEqual({ kind: "delete-targets", ids: [], noteIds: [] });
    expect(controller.commandForTargets(document, "temp-delete", ["note-1"], ["note-1"])).toEqual({ kind: "temporary-delete-targets", ids: [] });
  });

  it("plans permanent target application while preserving component, junction, and note targets", () => {
    const controller = new SchematicDeleteToolController();
    const document = makeDocument();
    const junction = junctionId({ x: 20, y: 0 });

    expect(controller.planTargetApplication(document, "delete", ["R1", junction, "R1"], ["note-1", "note-1"])).toEqual({
      kind: "delete-targets",
      ids: ["R1", junction],
      noteIds: ["note-1"]
    });
  });

  it("plans permanent empty target application as a status update", () => {
    const controller = new SchematicDeleteToolController();
    const document = makeDocument();

    expect(controller.planTargetApplication(document, "delete", [], [])).toEqual({
      kind: "status",
      status: DELETE_TARGET_EMPTY_STATUS
    });
  });

  it("plans temporary target application by keeping ordered components and wires only", () => {
    const controller = new SchematicDeleteToolController();
    const document = makeDocument();
    const junction = junctionId({ x: 20, y: 0 });

    expect(controller.planTargetApplication(document, "temp-delete", ["w1", junction, "R1", "note-1", "C1", "R1"], ["note-1"])).toEqual({
      kind: "temporary-delete-targets",
      ids: ["w1", "R1", "C1"]
    });
  });

  it("plans temporary note-only and empty target application as status updates", () => {
    const controller = new SchematicDeleteToolController();
    const document = makeDocument();

    expect(controller.planTargetApplication(document, "temp-delete", ["note-1"], ["note-1"])).toEqual({
      kind: "status",
      status: TEMPORARY_DELETE_TARGET_EMPTY_STATUS
    });
    expect(controller.planTargetApplication(document, "temp-delete", [], [])).toEqual({
      kind: "status",
      status: TEMPORARY_DELETE_TARGET_EMPTY_STATUS
    });
  });
});
