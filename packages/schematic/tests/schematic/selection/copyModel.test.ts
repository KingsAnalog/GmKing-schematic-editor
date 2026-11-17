import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import {
  applyCopyPlacementToDocument,
  buildCopySource,
  copySourceCount,
  instantiateCopyAt,
  type CopyState
} from "../../../src/schematic/copyModel";
import type { SchematicDocument } from "../../../src/schematic/types";
import { component } from "../support/testHelpers";

describe("schematic copy model", () => {
  it("builds an isolated copy source from ordinary schematic objects", () => {
    const selectedComponent = component("resistor", "R1", 40, 60);
    const selectedWire = {
      id: "w1",
      routeMode: "orthogonal" as const,
      appearance: { variant: "wide" as const, color: "#ef4444" },
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 80, y: 0 }
      ]
    };
    const selectedNote = {
      id: "note-1",
      x: 20,
      y: 80,
      width: 100,
      height: 40,
      format: "plain" as const,
      text: "copy note",
      backgroundColor: "#ffffe8",
      fontSizePx: 16
    };
    const source = buildCopySource(fixtureDocument({
      netLabels: [],
      junctionAppearances: [],
      components: [selectedComponent],
      wires: [selectedWire],
      notes: [selectedNote],
      junctionPoints: [{ x: 40, y: 0 }],
      junctionKeys: new Set(["40,0"]),

    }, { disconnectAt: [{ x: 80, y: 0 }] }));

    selectedComponent.values.main = "changed";
    selectedWire.points[0].x = 999;
    selectedWire.appearance.color = "#000000";
    selectedNote.text = "changed";

    expect(copySourceCount(source)).toBe(3);
    expect(source.components[0]).toMatchObject({ id: "R1", ref: "R1", x: 40, y: 60, values: { main: "R1" } });
    expect(source.wires[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 80, y: 0 }
    ]);
    expect(source.wires[0].appearance).toEqual({ variant: "wide", color: "#ef4444" });
    expect(source.notes[0]).toMatchObject({ id: "note-1", text: "copy note" });

  });

  it("instantiates copy sources with preview ids or new ordinary object ids", () => {
    const source = buildCopySource(fixtureDocument({
      netLabels: [],
      junctionAppearances: [],
      components: [component("resistor", "R1", 40, 60)],
      wires: [
        {
          id: "w1",
          routeMode: "orthogonal",
          points: [
            { x: 0, y: 0 },
            { x: 40, y: 0 },
            { x: 80, y: 0 }
          ]
        }
      ],
      notes: [{ id: "note-1", x: 20, y: 80, width: 100, height: 40, format: "plain", text: "copy note" }],
      junctionPoints: [{ x: 40, y: 0 }],
      junctionKeys: new Set(["40,0"]),

    }, { joinAt: [{ x: 80, y: 0 }] }));
    const state: CopyState = { source, anchor: { x: 40, y: 0 } };
    const preview = instantiateCopyAt(state, { x: 100, y: 40 }, {
      preview: true,
      nextComponentRef: () => {
        throw new Error("preview should keep original refs");
      },
      createId: () => {
        throw new Error("preview should use deterministic preview ids");
      }
    });

    expect(preview.components[0]).toMatchObject({ id: "copy-preview-component-0", ref: "R1", x: 100, y: 100, values: { main: "R1" } });
    expect(preview.wires[0]).toMatchObject({ id: "copy-preview-wire-0" });
    expect(preview.wires[0].points).toEqual([
      { x: 60, y: 40 },
      { x: 140, y: 40 }
    ]);
    expect(preview.notes[0]).toMatchObject({ id: "copy-preview-note-0", x: 80, y: 120 });

    const ids = ["component-copy", "wire-copy", "note-copy"];
    const copied = instantiateCopyAt(state, { x: 100, y: 40 }, {
      preview: false,
      nextComponentRef: () => "R2",
      createId: () => ids.shift() ?? "unexpected-copy-id"
    });

    expect(copySourceCount(copied)).toBe(3);
    expect(copied.components[0]).toMatchObject({ id: "component-copy", ref: "R2", x: 100, y: 100, values: { main: "R2" } });
    expect(copied.wires[0]).toMatchObject({ id: "wire-copy" });
    expect(copied.wires[0].points).toEqual([
      { x: 60, y: 40 },
      { x: 140, y: 40 }
    ]);
    expect(copied.notes[0]).toMatchObject({ id: "note-copy", x: 80, y: 120 });

  });

  it("copies a coupling only when both inductors are selected and remaps both endpoints", () => {
    const first = component("inductor", "L1", 40, 40);
    const second = component("inductor", "L2", 120, 40);
    const coupling = { showLabel: true,
      id: "K12",
      inductorAId: first.id,
      inductorBId: second.id,
      coefficient: "k12",
      coefficientAuto: true,
      labelMode: "coefficient" as const,
      showArc: true,
      showCore: false,
      arcFlipped: false,
      appearance: { color: "#005f9e" }
    };
    const sourceInput = {
      netLabels: [],
      junctionAppearances: [],
      wires: [],
      notes: [],
      junctionPoints: [],
      junctionKeys: new Set<string>(),
      inductorCouplings: [coupling]
    };

    expect(buildCopySource(fixtureDocument({ ...sourceInput, components: [first] })).inductorCouplings).toEqual([]);

    const source = buildCopySource(fixtureDocument({ ...sourceInput, components: [first, second] }));
    const ids = ["L3-id", "L4-id", "K34-id"];
    let nextInductorRef = 3;
    const copied = instantiateCopyAt({ source, anchor: { x: 40, y: 40 } }, { x: 200, y: 200 }, {
      preview: false,
      nextComponentRef: () => `L${nextInductorRef++}`,
      createId: () => ids.shift() ?? "unexpected-copy-id"
    });

    expect(copied.inductorCouplings).toEqual([{
      ...coupling,
      id: "K34-id",
      inductorAId: "L3-id",
      inductorBId: "L4-id"
    }]);
    coupling.appearance.color = "#d55e00";
    expect(source.inductorCouplings?.[0].appearance).toEqual({ color: "#005f9e" });
    expect(copied.inductorCouplings?.[0].appearance).toEqual({ color: "#005f9e" });
  });

  it("applies copied objects to a document and reports selection and status", () => {
    const doc: SchematicDocument = fixtureDocument({
      junctionAppearances: [],
      netLabels: [],
      components: [component("capacitor", "C1", 20, 20)],
      wires: [{ id: "existing-wire", routeMode: "orthogonal", points: [{ x: 0, y: 0 }, { x: 20, y: 0 }] }],
      junctions: [],
      notes: [{ id: "existing-note", x: 0, y: 40, width: 80, height: 40, format: "plain", text: "old note" }],

    }, { joinAt: [{ x: 39, y: 1 }] });
    const copied = fixtureDocument({
      netLabels: [],
      junctionAppearances: [],
      components: [component("resistor", "R2", 80, 80)],
      wires: [{ id: "copied-wire", routeMode: "orthogonal" as const, points: [{ x: 40, y: 0 }, { x: 80, y: 0 }] }],
      notes: [{ id: "copied-note", x: 60, y: 100, width: 100, height: 40, format: "plain" as const, text: "copy note" }],
    });

    const result = applyCopyPlacementToDocument(doc, copied);

    expect(result).toEqual({
      count: 3,
      ids: ["R2", "copied-wire"],
      noteIds: ["copied-note"],
      status: "Copied 3 objects. Move to another point and click to copy again, or Esc cancels.",
      placed: true
    });
    expect(doc.components.map((component) => component.id)).toEqual(["C1", "R2"]);
    expect(doc.wires.map((wire) => wire.id)).toEqual(["existing-wire", "copied-wire"]);
    expect(doc.notes?.map((note) => note.id)).toEqual(["existing-note", "copied-note"]);

  });

  it("reports singular copy placement status", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [], components: [], wires: [], junctions: [] });

    const result = applyCopyPlacementToDocument(doc, fixtureDocument({
      netLabels: [],
      junctionAppearances: [],
      components: [component("resistor", "R1", 40, 40)],
      wires: [],
      notes: [],

    }));

    expect(result.status).toBe("Copied 1 object. Move to another point and click to copy again, or Esc cancels.");
    expect(result.ids).toEqual(["R1"]);
    expect(result.noteIds).toEqual([]);
    expect(doc.components.map((component) => component.id)).toEqual(["R1"]);
    expect(doc.notes).toEqual([]);
  });

  it("does not mutate the document for an empty copy placement", () => {
    const doc: SchematicDocument = fixtureDocument({
      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [component("resistor", "R1", 40, 40)],
      wires: [{ id: "w1", routeMode: "orthogonal", points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] }],
      junctions: [],

    }, { joinAt: [{ x: 40, y: 0 }] });
    const original = structuredClone(doc);

    const result = applyCopyPlacementToDocument(doc, fixtureDocument({
      netLabels: [],
      junctionAppearances: [], components: [], wires: [], notes: [], }));

    expect(result).toEqual({
      count: 0,
      ids: [],
      noteIds: [],
      status: "Nothing to copy.",
      placed: false
    });
    expect(doc).toEqual(original);
  });
});
