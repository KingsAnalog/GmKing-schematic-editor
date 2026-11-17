import { describe, expect, it } from "vitest";
import {
  createSchematicSelectionState,
  mergeMixedSelection,
  selectCell,
  selectNote,
  setMixedSelection,
  setNoteSelection,
  setSelection,
  type SchematicSelectionState
} from "../../../src/schematic/selection/selectionModel";

function snapshot(state: SchematicSelectionState) {
  return {
    selectedIds: Array.from(state.selectedIds),
    selectedNoteIds: Array.from(state.selectedNoteIds),
    primarySelectedId: state.primarySelectedId
  };
}

describe("schematic selection model", () => {
  it("replaces cell selection and clears notes for plain cell clicks", () => {
    const state = createSchematicSelectionState({
      selectedIds: ["R1", "R2"],
      selectedNoteIds: ["note-1"],
      primarySelectedId: "note-1"
    });

    expect(snapshot(selectCell(state, "C1", "plain"))).toEqual({
      selectedIds: ["C1"],
      selectedNoteIds: [],
      primarySelectedId: "C1"
    });
  });

  it("adds and removes cell ids with Shift and Ctrl without discarding Notes", () => {
    const state = createSchematicSelectionState({
      selectedIds: ["R1", "R2"],
      selectedNoteIds: ["note-1"],
      primarySelectedId: "R2"
    });

    expect(snapshot(selectCell(state, "C1", "shift"))).toEqual({
      selectedIds: ["R1", "R2", "C1"],
      selectedNoteIds: ["note-1"],
      primarySelectedId: "C1"
    });

    expect(snapshot(selectCell(state, "R2", "ctrl"))).toEqual({
      selectedIds: ["R1"],
      selectedNoteIds: ["note-1"],
      primarySelectedId: "R1"
    });
  });

  it("makes a directly clicked Note the primary selection", () => {
    const state = createSchematicSelectionState({
      selectedIds: ["R1"],
      selectedNoteIds: ["note-1"],
      primarySelectedId: "R1"
    });

    expect(snapshot(selectNote(state, "note-2", "plain"))).toEqual({
      selectedIds: [],
      selectedNoteIds: ["note-2"],
      primarySelectedId: "note-2"
    });
  });

  it("adds and removes note ids without clearing selected cells for modifiers", () => {
    const state = createSchematicSelectionState({
      selectedIds: ["R1"],
      selectedNoteIds: ["note-1", "note-2"],
      primarySelectedId: "R1"
    });

    expect(snapshot(selectNote(state, "note-3", "shift"))).toEqual({
      selectedIds: ["R1"],
      selectedNoteIds: ["note-1", "note-2", "note-3"],
      primarySelectedId: "note-3"
    });

    expect(snapshot(selectNote(state, "note-2", "ctrl"))).toEqual({
      selectedIds: ["R1"],
      selectedNoteIds: ["note-1"],
      primarySelectedId: "R1"
    });
  });

  it("sets cell-only, note-only, and mixed selections with legacy primary ordering", () => {
    expect(snapshot(setSelection(["R1", "R2"]))).toEqual({
      selectedIds: ["R1", "R2"],
      selectedNoteIds: [],
      primarySelectedId: "R2"
    });

    expect(snapshot(setNoteSelection(["note-1", "note-2"]))).toEqual({
      selectedIds: [],
      selectedNoteIds: ["note-1", "note-2"],
      primarySelectedId: "note-2"
    });

    expect(snapshot(setMixedSelection(["R1", "w1"], ["note-1"]))).toEqual({
      selectedIds: ["R1", "w1"],
      selectedNoteIds: ["note-1"],
      primarySelectedId: "note-1"
    });

    expect(snapshot(setMixedSelection(["R1", "w1"], []))).toEqual({
      selectedIds: ["R1", "w1"],
      selectedNoteIds: [],
      primarySelectedId: "w1"
    });
  });

  it("merges box selections additively and prefers the last newly-added note as primary", () => {
    const state = createSchematicSelectionState({
      selectedIds: ["R1"],
      selectedNoteIds: ["note-1"],
      primarySelectedId: "R1"
    });

    expect(snapshot(mergeMixedSelection(state, ["R2", "w1"], ["note-2"]))).toEqual({
      selectedIds: ["R1", "R2", "w1"],
      selectedNoteIds: ["note-1", "note-2"],
      primarySelectedId: "note-2"
    });

    expect(snapshot(mergeMixedSelection(state, [], []))).toEqual({
      selectedIds: ["R1"],
      selectedNoteIds: ["note-1"],
      primarySelectedId: "R1"
    });

    expect(snapshot(mergeMixedSelection(state, ["R2", "w1"], []))).toEqual({
      selectedIds: ["R1", "R2", "w1"],
      selectedNoteIds: ["note-1"],
      primarySelectedId: "w1"
    });
  });
});
