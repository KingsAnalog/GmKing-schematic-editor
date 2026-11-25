import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { junctionId } from "../../../src/schematic/renderer";
import { createSchematicSelectionState } from "../../../src/schematic/selection/selectionModel";
import {
  SchematicSelectionSessionCoordinator,
  type SelectionDelta
} from "../../../src/schematic/selection/selectionSessionCoordinator";
import type {
  ComponentInstance,
  NetLabel,
  Point,
  SchematicDocument,
  SchematicNote,
  Wire
} from "../../../src/schematic/types";

function component(id: string): ComponentInstance {
  return {
    id,
    type: "resistor",
    ref: id,
    x: 200,
    y: 200,
    rotation: 0,
    mirrored: false,
    values: { main: "1k" }
  };
}

function wire(id: string, points: Point[]): Wire {
  return {
    id,
    points,
    routeMode: "orthogonal",
    appearance: { variant: "signal", color: "#0072b2" }
  };
}

function note(id: string): SchematicNote {
  return {
    id,
    x: 120,
    y: 160,
    width: 160,
    anchor: "upperLeft",
    text: id
  };
}

function label(id: string, name: string, wireId: string, point: Point): NetLabel {
  return { id, name, attachment: { wireId, point } };
}

function sessionDocument(): SchematicDocument {
  const junction = { x: 40, y: 0 };
  const selectedWire = wire("wire-1", [{ x: 0, y: 0 }, { x: 80, y: 0 }]);
  selectedWire.appearance = {
    ...selectedWire.appearance!,
    startMarker: "arrow",
    endMarker: "circle",
    digitalSlash: true,
    digitalLabel: "8"
  };
  return fixtureDocument({
    components: [component("R1")],
    wires: [
      selectedWire,
      wire("branch", [junction, { x: 40, y: 40 }])
    ],
    junctions: [junction],

    junctionAppearances: [{ point: junction, color: "#d55e00" }],
    netLabels: [label("label-1", "OUT", "wire-1", { x: 20, y: 0 })],
    notes: [note("note-1"), note("note-2")]
  });
}

function stateOf(session: SchematicSelectionSessionCoordinator) {
  const state = session.snapshot();
  return {
    selectedIds: Array.from(state.selectedIds),
    selectedNoteIds: Array.from(state.selectedNoteIds),
    primarySelectedId: state.primarySelectedId
  };
}

function deltaOf(delta: SelectionDelta) {
  return {
    previous: {
      selectedIds: Array.from(delta.previous.selectedIds),
      selectedNoteIds: Array.from(delta.previous.selectedNoteIds),
      primarySelectedId: delta.previous.primarySelectedId
    },
    next: {
      selectedIds: Array.from(delta.next.selectedIds),
      selectedNoteIds: Array.from(delta.next.selectedNoteIds),
      primarySelectedId: delta.next.primarySelectedId
    },
    changedCellIds: Array.from(delta.changedCellIds),
    changedNoteIds: Array.from(delta.changedNoteIds)
  };
}

describe("SchematicSelectionSessionCoordinator", () => {
  it("applies set and gesture mutations with defensive deltas", () => {
    const session = new SchematicSelectionSessionCoordinator(sessionDocument());

    expect(deltaOf(session.setCells(["R1", "wire-1"]))).toEqual({
      previous: { selectedIds: [], selectedNoteIds: [], primarySelectedId: null },
      next: {
        selectedIds: ["R1", "wire-1"],
        selectedNoteIds: [],
        primarySelectedId: "wire-1"
      },
      changedCellIds: ["R1", "wire-1"],
      changedNoteIds: []
    });

    const shifted = session.selectCell(junctionId({ x: 40, y: 0 }), "shift");
    expect(stateOf(session)).toEqual({
      selectedIds: ["R1", "wire-1", "junction-40-0"],
      selectedNoteIds: [],
      primarySelectedId: "junction-40-0"
    });
    expect(Array.from(shifted.changedCellIds)).toEqual(["junction-40-0"]);

    session.selectCell("wire-1", "ctrl");
    expect(stateOf(session)).toEqual({
      selectedIds: ["R1", "junction-40-0"],
      selectedNoteIds: [],
      primarySelectedId: "junction-40-0"
    });

    session.setNotes(["note-1", "note-2"]);
    expect(stateOf(session)).toEqual({
      selectedIds: [],
      selectedNoteIds: ["note-1", "note-2"],
      primarySelectedId: "note-2"
    });

    session.selectNote("note-1", "ctrl");
    expect(stateOf(session)).toEqual({
      selectedIds: [],
      selectedNoteIds: ["note-2"],
      primarySelectedId: "note-2"
    });

    session.setMixed(["R1"], ["note-1"]);
    expect(stateOf(session)).toEqual({
      selectedIds: ["R1"],
      selectedNoteIds: ["note-1"],
      primarySelectedId: "note-1"
    });

    const source = createSchematicSelectionState({
      selectedIds: ["wire-1"],
      primarySelectedId: "wire-1"
    });
    session.apply(source);
    (source.selectedIds as Set<string>).add("source-only");
    expect(stateOf(session).selectedIds).toEqual(["wire-1"]);
  });

  it("returns empty no-op deltas without leaking any internal set", () => {
    const session = new SchematicSelectionSessionCoordinator(sessionDocument());
    session.setMixed(["R1"], ["note-1"]);

    const delta = session.setMixed(["R1"], ["note-1"]);
    expect(deltaOf(delta)).toEqual({
      previous: {
        selectedIds: ["R1"],
        selectedNoteIds: ["note-1"],
        primarySelectedId: "note-1"
      },
      next: {
        selectedIds: ["R1"],
        selectedNoteIds: ["note-1"],
        primarySelectedId: "note-1"
      },
      changedCellIds: [],
      changedNoteIds: []
    });

    (delta.previous.selectedIds as Set<string>).clear();
    (delta.next.selectedIds as Set<string>).add("delta-only");
    (delta.changedCellIds as Set<string>).add("changed-only");
    (session.selectedIds as Set<string>).add("getter-only");
    (session.selectedNoteIds as Set<string>).clear();

    expect(stateOf(session)).toEqual({
      selectedIds: ["R1"],
      selectedNoteIds: ["note-1"],
      primarySelectedId: "note-1"
    });
  });

  it("preserves ordered primary junction remap and fallback behavior", () => {
    const previousFirst = junctionId({ x: 20, y: 40 });
    const previousPrimary = junctionId({ x: 60, y: 40 });
    const nextFirst = junctionId({ x: 40, y: 80 });
    const nextPrimary = junctionId({ x: 80, y: 80 });
    const session = new SchematicSelectionSessionCoordinator(
      sessionDocument(),
      createSchematicSelectionState({
        selectedIds: ["R1", previousFirst, "wire-1", previousPrimary],
        selectedNoteIds: ["note-1"],
        primarySelectedId: previousPrimary
      })
    );

    const ordered = session.remapJunctions([nextFirst, nextPrimary]);
    expect(stateOf(session)).toEqual({
      selectedIds: ["R1", "wire-1", nextFirst, nextPrimary],
      selectedNoteIds: ["note-1"],
      primarySelectedId: nextPrimary
    });
    expect(Array.from(ordered.changedCellIds)).toEqual([
      previousFirst,
      previousPrimary,
      nextFirst,
      nextPrimary
    ]);

    session.apply(createSchematicSelectionState({
      selectedIds: ["R1", previousFirst, previousPrimary],
      primarySelectedId: previousPrimary
    }));
    session.remapJunctions([nextFirst]);
    expect(stateOf(session)).toEqual({
      selectedIds: ["R1", nextFirst],
      selectedNoteIds: [],
      primarySelectedId: nextFirst
    });

    session.apply(createSchematicSelectionState({
      selectedIds: ["R1", previousPrimary],
      primarySelectedId: previousPrimary
    }));
    session.remapJunctions([]);
    expect(stateOf(session).primarySelectedId).toBeNull();
  });

  it("answers selection queries and projects editable document objects", () => {
    const session = new SchematicSelectionSessionCoordinator(sessionDocument());
    expect(session.hasAny()).toBe(false);
    expect(session.hasExportableSelection()).toBe(false);

    session.setMixed(["R1", "wire-1", junctionId({ x: 40, y: 0 })], ["note-1"]);
    expect(session.hasAny()).toBe(true);
    expect(session.hasExportableSelection()).toBe(true);
    expect(session.isCellSelected("wire-1")).toBe(true);
    expect(session.isNoteSelected("note-1")).toBe(true);
    expect(session.targetIsSelected({ kind: "component", id: "R1" })).toBe(true);
    expect(session.targetIsSelected({ kind: "note", id: "note-2" })).toBe(false);

    const projection = session.project();
    expect(projection.components.map((candidate) => candidate.id)).toEqual(["R1"]);
    expect(projection.wires.map((candidate) => candidate.id)).toEqual(["wire-1"]);
    expect(projection.junctionPoints).toEqual([{ x: 40, y: 0 }]);
    expect(projection.notes.map((candidate) => candidate.id)).toEqual(["note-1"]);
    expect(session.status("moveOnly")).toContain("1 wire, 1 junction, 1 note");

    session.setCells(["R1"]);
    expect(session.selectedComponent()?.id).toBe("R1");
    expect(session.selectedNote()).toBeNull();
    expect(session.selectedNetLabel()).toBeNull();

    session.setNotes(["note-1"]);
    expect(session.selectedNote()?.id).toBe("note-1");

    session.setCells(["label-1"]);
    expect(session.selectedNetLabel()?.id).toBe("label-1");
  });

  it("projects label, wire, and junction network properties from one supplied resolution", () => {
    const session = new SchematicSelectionSessionCoordinator(sessionDocument());

    session.setCells(["wire-1"]);
    const resolution = session.selectedNetworkResolution();
    expect(resolution).toBeDefined();
    expect(session.selectedNetworkProperty("select", resolution)).toEqual({
      netName: { state: "uniform", value: "OUT" },
      color: { state: "uniform", value: "#0072b2" },
      wire: {
        lineWidth: { state: "uniform", value: "a" },
        startMarker: { state: "uniform", value: "arrow" },
        endMarker: { state: "uniform", value: "circle" },
        digitalSlash: { state: "uniform", value: true },
        digitalLabel: { state: "uniform", value: "8" }
      }
    });

    session.setCells(["label-1"]);
    expect(session.selectedNetworkProperty("select", resolution)).toEqual({
      netName: { state: "uniform", value: "OUT" },
      label: {
        name: { state: "uniform", value: "OUT" },
        message: undefined
      }
    });

    session.setCells([junctionId({ x: 40, y: 0 })]);
    expect(session.selectedNetworkProperty("select", resolution)).toEqual({
      netName: { state: "uniform", value: "OUT" },
      color: { state: "uniform", value: "#d55e00" }
    });
    expect(session.selectedNetworkProperty("label", resolution)).toBeUndefined();
  });

  it("rejects component, mixed, and note selections as network projections", () => {
    const session = new SchematicSelectionSessionCoordinator(sessionDocument());

    session.setCells(["R1"]);
    expect(session.selectedNetworkResolution()).toBeUndefined();
    expect(session.selectedNetworkProperty("select")).toBeUndefined();

    session.setCells(["wire-1", "label-1"]);
    expect(session.selectedNetworkResolution()).toBeUndefined();
    expect(session.selectedNetworkProperty("select")).toBeUndefined();

    session.setMixed(["wire-1"], ["note-1"]);
    expect(session.selectedNetworkResolution()).toBeUndefined();
    expect(session.selectedNetworkProperty("select")).toBeUndefined();

    session.setCells([junctionId({ x: 999, y: 888 })]);
    expect(session.selectedNetworkResolution()).toBeDefined();
    expect(session.selectedNetworkProperty("select")).toEqual({
      netName: { state: "uniform", value: "" },
      color: { state: "uniform", value: null }
    });
  });

  it("does not access network collections for a selected component", () => {
    const document = {
      components: [component("R1")],
      junctions: [],
      connections: { wires: {}, pins: {} },
      junctionAppearances: [],
      notes: []
    } as unknown as SchematicDocument;
    Object.defineProperties(document, {
      wires: {
        get: () => {
          throw new Error("component selection must not inspect wires");
        }
      },
      netLabels: {
        get: () => {
          throw new Error("component selection must not inspect net labels");
        }
      }
    });
    const session = new SchematicSelectionSessionCoordinator(document);

    session.setCells(["R1"]);

    expect(session.selectedNetworkResolution()).toBeUndefined();
    expect(session.selectedNetworkProperty("select")).toBeUndefined();
  });
});
