import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { pointKey } from "../../../src/schematic/geometry";
import { junctionId } from "../../../src/schematic/renderer";
import {
  projectSchematicSelection,
  remapSelectedJunctionIds,
  singleEditableSelectedComponent,
  singleEditableSelectedNote
} from "../../../src/schematic/selection/selectionProjection";
import { setMixedSelection } from "../../../src/schematic/selection/selectionModel";
import type { SchematicDocument } from "../../../src/schematic/types";
import { fixtureComponent, fixtureNote, fixtureWire, mixedSelectionDoc } from "../support/fixtures";

describe("schematic selection projection", () => {
  it("projects mixed component, wire, visible junction, and note selections", () => {
    const document = mixedSelectionDoc();
    const selection = setMixedSelection(["w-mixed", "R1", junctionId({ x: 280, y: 200 })], ["note-1"]);

    const projection = projectSchematicSelection(document, selection);

    expect(projection.components.map((component) => component.id)).toEqual(["R1"]);
    expect(projection.wires.map((wire) => wire.id)).toEqual(["w-mixed"]);
    expect(projection.junctionPoints).toEqual([{ x: 280, y: 200 }]);
    expect(Array.from(projection.junctionKeys)).toEqual(["280,200"]);
    expect(projection.notes.map((note) => note.id)).toEqual(["note-1"]);
    expect(projection.count).toBe(4);
    expect(projection.summaryContents.items.map((item) => item.kind)).toEqual(["wire", "component", "junction"]);
    expect(projection.summaryContents.notes.map((note) => pointKey(note))).toEqual(["220,260"]);
  });

  it("includes selected notes in transform bounds", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [],
      wires: [],
      junctions: [{ x: 100, y: 100 }],
      notes: [fixtureNote("note-1", 220, 260)]
    });

    const projection = projectSchematicSelection(document, setMixedSelection([junctionId({ x: 100, y: 100 })], ["note-1"]));

    expect(projection.transformBounds).toEqual({ x: 100, y: 100, width: 240, height: 220 });
  });

  it("keeps unknown and stale parseable junction ids in summaries but ignores them for transforms", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [fixtureComponent("resistor", "R1", 40, 40)],
      wires: [fixtureWire("w1", [{ x: 0, y: 0 }, { x: 40, y: 0 }])],
      junctions: [{ x: 20, y: 0 }]
    });
    const selection = setMixedSelection(["missing-id", junctionId({ x: 999, y: 888 })], []);

    const projection = projectSchematicSelection(document, selection);

    expect(projection.components).toEqual([]);
    expect(projection.wires).toEqual([]);
    expect(projection.junctionPoints).toEqual([]);
    expect(projection.count).toBe(0);
    expect(projection.transformBounds).toBeNull();
    expect(projection.summaryContents.items).toEqual([
      { kind: "unknown", id: "missing-id" },
      { kind: "junction", point: { x: 1000, y: 890 } }
    ]);
  });

  it("finds single editable component and note selections", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [fixtureComponent("resistor", "R1", 40, 40)],
      wires: [],
      junctions: [],
      notes: [fixtureNote("note-1", 120, 160)]
    });

    expect(singleEditableSelectedComponent(document, setMixedSelection(["R1"], []))?.id).toBe("R1");
    expect(singleEditableSelectedComponent(document, setMixedSelection(["R1"], ["note-1"]))).toBeNull();
    expect(singleEditableSelectedComponent(document, setMixedSelection(["missing-id"], []))).toBeNull();

    expect(singleEditableSelectedNote(document, setMixedSelection([], ["note-1"]))?.id).toBe("note-1");
    expect(singleEditableSelectedNote(document, setMixedSelection(["R1"], ["note-1"]))).toBeNull();
    expect(singleEditableSelectedNote(document, setMixedSelection([], ["missing-note"]))).toBeNull();
  });

  it("remaps only selected junction ids after a junction transform", () => {
    expect(remapSelectedJunctionIds(["R1", junctionId({ x: 0, y: 0 }), "missing-id", junctionId({ x: 999, y: 888 })], [junctionId({ x: 20, y: 0 })])).toEqual([
      "R1",
      "missing-id",
      "junction-20-0"
    ]);
  });
});
