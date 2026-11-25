import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import {
  buildSelectionBoxGeometry,
  collectSelectionBoxHits,
  projectFinishedSelectionBox,
  SELECTION_BOX_TINY_THRESHOLD
} from "../../../src/schematic/selection/selectionBoxModel";
import { junctionId } from "../../../src/schematic/renderer";
import { createSchematicSelectionState } from "../../../src/schematic/selection/selectionModel";
import { addInductorCoupling } from "../../../src/schematic/inductorCouplingModel";
import { inductorCouplingGeometry } from "../../../src/schematic/inductorCouplingGeometry";
import type { SelectionBoxHitResult } from "../../../src/schematic/selection/selectionBoxModel";
import type { SchematicDocument } from "../../../src/schematic/types";
import { fixtureComponent, fixtureNote, fixtureWire } from "../support/fixtures";

function selectionBox(overrides: Partial<SelectionBoxHitResult> = {}): SelectionBoxHitResult {
  return {
    rect: { x: 0, y: 0, width: 80, height: 80 },
    containOnly: false,
    tiny: false,
    ids: [],
    noteIds: [],
    ...overrides
  };
}

describe("schematic selection box model", () => {
  function coupledInductors(rotation = 0) {
    const document = fixtureDocument({
      components: [fixtureComponent("inductor", "L1", 100, 100, rotation), fixtureComponent("inductor", "L2", 300, 100, rotation)],
      wires: []
    });
    const coupling = addInductorCoupling(document, "L1", "L2", "coupling-12")!;
    return { document, coupling };
  }

  it.each([0, 90, 180, 270])("box-selects a coupling along with its inductors in both drag directions at %s degrees", rotation => {
    const { document } = coupledInductors(rotation);
    for (const [start, end] of [[{ x: 0, y: -100 }, { x: 400, y: 200 }], [{ x: 400, y: 200 }, { x: 0, y: -100 }]]) {
      expect(collectSelectionBoxHits(document, start, end).ids).toEqual(["L1", "L2", "coupling-12"]);
    }
  });

  it("selects an arc alone and respects intersection versus full containment", () => {
    const { document, coupling } = coupledInductors();
    // A strip through the middle of the arc, clear of either winding.
    expect(collectSelectionBoxHits(document, { x: 180, y: 30 }, { x: 220, y: 60 }).ids).toEqual([coupling.id]);
    expect(collectSelectionBoxHits(document, { x: 220, y: 60 }, { x: 180, y: 30 }).ids).toEqual([]);
    const box = inductorCouplingGeometry(document, coupling)!.bounds;
    expect(collectSelectionBoxHits(document,
      { x: box.x + box.width + 1, y: box.y + box.height + 1 },
      { x: box.x - 1, y: box.y - 1 }).ids).toEqual([coupling.id]);
    expect(collectSelectionBoxHits(document, { x: 180, y: -100 }, { x: 220, y: -80 }).ids).toEqual([]);
  });

  it("uses the current flipped arc or core geometry and ignores invisible couplings", () => {
    const { document, coupling } = coupledInductors();
    coupling.arcFlipped = true;
    expect(collectSelectionBoxHits(document, { x: 180, y: 140 }, { x: 220, y: 170 }).ids).toEqual([coupling.id]);
    expect(collectSelectionBoxHits(document, { x: 180, y: 30 }, { x: 220, y: 60 }).ids).toEqual([]);
    coupling.showArc = false;
    coupling.showCore = true;
    expect(collectSelectionBoxHits(document, { x: 180, y: 110 }, { x: 220, y: 135 }).ids).toEqual([coupling.id]);
    coupling.showCore = false;
    expect(collectSelectionBoxHits(document, { x: 0, y: -100 }, { x: 400, y: 200 }).ids).not.toContain(coupling.id);
    coupling.showArc = true;
    document.components[0].temporarilyDeleted = true;
    expect(collectSelectionBoxHits(document, { x: 0, y: -100 }, { x: 400, y: 200 }).ids).not.toContain(coupling.id);
    document.components = [];
    expect(collectSelectionBoxHits(document, { x: 0, y: -100 }, { x: 400, y: 200 }).ids).toEqual([]);
  });

  it("normalizes normal drag boxes and selects intersecting components", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [fixtureComponent("resistor", "R1", 100, 100)],
      wires: [],
      junctions: []
    });

    const result = collectSelectionBoxHits(document, { x: 80, y: 80 }, { x: 120, y: 120 });

    expect(result.rect).toEqual({ x: 80, y: 80, width: 40, height: 40 });
    expect(result.containOnly).toBe(false);
    expect(result.tiny).toBe(false);
    expect(result.ids).toEqual(["R1"]);
  });

  it("uses contain-only semantics for up-left reverse drags", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [
        fixtureComponent("resistor", "R-contained", 100, 100),
        fixtureComponent("resistor", "R-partial", 200, 100)
      ],
      wires: [],
      junctions: []
    });

    const result = collectSelectionBoxHits(document, { x: 180, y: 160 }, { x: 40, y: 40 });

    expect(result.rect).toEqual({ x: 40, y: 40, width: 140, height: 120 });
    expect(result.containOnly).toBe(true);
    expect(result.ids).toEqual(["R-contained"]);
  });

  it("includes notes by visual bounds", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [],
      wires: [],
      junctions: [],
      notes: [fixtureNote("note-1", 40, 40)]
    });

    const result = collectSelectionBoxHits(document, { x: 60, y: 60 }, { x: 80, y: 80 });

    expect(result.ids).toEqual([]);
    expect(result.noteIds).toEqual(["note-1"]);
  });

  it("outputs junction ids for junction points inside the selection box", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      wires: [],
      junctions: [{ x: 40, y: 20 }]
    });

    const result = collectSelectionBoxHits(document, { x: 0, y: 0 }, { x: 80, y: 40 });

    expect(result.ids).toEqual([junctionId({ x: 40, y: 20 })]);
    expect(result.noteIds).toEqual([]);
  });

  it("uses the visible junction projection supplied by presentation mode", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      wires: [],
      junctions: []
    });

    const result = collectSelectionBoxHits(
      document,
      { x: 0, y: 0 },
      { x: 80, y: 40 },
      [{ x: 40, y: 20 }]
    );

    expect(result.ids).toEqual([junctionId({ x: 40, y: 20 })]);
    expect(result.noteIds).toEqual([]);
  });

  it("selects partial wire segment intersections only for normal drag boxes", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      wires: [fixtureWire("w-crossed", [{ x: 0, y: 0 }, { x: 100, y: 0 }])],
      junctions: []
    });

    const normal = collectSelectionBoxHits(document, { x: 40, y: -10 }, { x: 60, y: 10 });
    const reverse = collectSelectionBoxHits(document, { x: 60, y: 10 }, { x: 40, y: -10 });

    expect(normal.containOnly).toBe(false);
    expect(normal.ids).toEqual(["w-crossed"]);
    expect(reverse.containOnly).toBe(true);
    expect(reverse.ids).toEqual([]);
  });

  it("keeps component-wire-junction ordering with notes returned separately", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [fixtureComponent("resistor", "R1", 100, 100)],
      wires: [fixtureWire("w1", [{ x: 0, y: 0 }, { x: 40, y: 0 }])],
      junctions: [{ x: 20, y: 0 }],
      notes: [fixtureNote("note-1", 160, 160)]
    });

    const result = collectSelectionBoxHits(document, { x: -100, y: -100 }, { x: 320, y: 320 });

    expect(result.ids).toEqual(["R1", "w1", "junction-20-0"]);
    expect(result.noteIds).toEqual(["note-1"]);
  });

  it("treats boxes as tiny only when both dimensions are below the threshold", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [fixtureComponent("resistor", "R1", 0, 0)],
      wires: [fixtureWire("w1", [{ x: 0, y: 0 }, { x: 100, y: 0 }])],
      junctions: [{ x: 0, y: 0 }],
      notes: [fixtureNote("note-1", 0, 0)]
    });

    expect(buildSelectionBoxGeometry({ x: 0, y: 0 }, { x: SELECTION_BOX_TINY_THRESHOLD - 1, y: SELECTION_BOX_TINY_THRESHOLD - 1 }).tiny).toBe(true);
    expect(buildSelectionBoxGeometry({ x: 0, y: 0 }, { x: SELECTION_BOX_TINY_THRESHOLD, y: SELECTION_BOX_TINY_THRESHOLD - 1 }).tiny).toBe(false);
    expect(buildSelectionBoxGeometry({ x: 0, y: 0 }, { x: SELECTION_BOX_TINY_THRESHOLD - 1, y: SELECTION_BOX_TINY_THRESHOLD }).tiny).toBe(false);

    const result = collectSelectionBoxHits(document, { x: 0, y: 0 }, { x: SELECTION_BOX_TINY_THRESHOLD - 1, y: SELECTION_BOX_TINY_THRESHOLD - 1 });

    expect(result.tiny).toBe(true);
    expect(result.ids).toEqual([]);
    expect(result.noteIds).toEqual([]);
  });

  it("projects a tiny select-mode box without active analysis pick as clear selection", () => {
    const intent = projectFinishedSelectionBox({
      selectionBox: selectionBox({ tiny: true }),
      mode: "select",
      additive: false,
      hasActiveAnalysisPick: false,
      selectionState: createSchematicSelectionState({ selectedIds: ["R1"], selectedNoteIds: ["note-1"], primarySelectedId: "R1" })
    });

    expect(intent).toEqual({ kind: "clear-selection" });
  });

  it("projects a tiny box during active analysis pick as a no-op", () => {
    const intent = projectFinishedSelectionBox({
      selectionBox: selectionBox({ tiny: true }),
      mode: "select",
      additive: false,
      hasActiveAnalysisPick: true,
      selectionState: createSchematicSelectionState({ selectedIds: ["R1"], primarySelectedId: "R1" })
    });

    expect(intent).toEqual({ kind: "noop" });
  });

  it("projects a tiny box outside select mode as a no-op", () => {
    const intent = projectFinishedSelectionBox({
      selectionBox: selectionBox({ tiny: true }),
      mode: "delete",
      additive: false,
      hasActiveAnalysisPick: false,
      selectionState: createSchematicSelectionState({ selectedIds: ["R1"], primarySelectedId: "R1" })
    });

    expect(intent).toEqual({ kind: "noop" });
  });

  it.each(["delete", "temp-delete"] as const)("projects boxed targets unchanged for %s mode", (mode) => {
    const ids = ["R1", "w1"];
    const noteIds = ["note-1"];
    const intent = projectFinishedSelectionBox({
      selectionBox: selectionBox({ ids, noteIds }),
      mode,
      additive: false,
      hasActiveAnalysisPick: false,
      selectionState: createSchematicSelectionState({ selectedIds: ["R0"], primarySelectedId: "R0" })
    });

    expect(intent.kind).toBe("delete-targets");
    if (intent.kind !== "delete-targets") return;
    expect(intent.ids).toBe(ids);
    expect(intent.noteIds).toBe(noteIds);
  });

  it.each(["move", "copy"] as const)("picks the boxed targets directly in %s mode", mode => {
    const input = {
      mode,
      additive: false,
      hasActiveAnalysisPick: false,
      selectionState: createSchematicSelectionState()
    };
    const ids = ["S1", "w1"];
    const noteIds = ["note-1"];
    expect(projectFinishedSelectionBox({ ...input, selectionBox: selectionBox({ ids, noteIds }) }))
      .toEqual({ kind: "pick-tool-targets", mode, ids, noteIds });
    expect(projectFinishedSelectionBox({ ...input, selectionBox: selectionBox() })).toEqual({ kind: "noop" });
    expect(projectFinishedSelectionBox({ ...input, selectionBox: selectionBox({ tiny: true }) })).toEqual({ kind: "noop" });
  });

  it("projects a plain box as replacement mixed selection", () => {
    const intent = projectFinishedSelectionBox({
      selectionBox: selectionBox({ ids: ["R1", "w1"], noteIds: ["note-1"] }),
      mode: "select",
      additive: false,
      hasActiveAnalysisPick: false,
      selectionState: createSchematicSelectionState({ selectedIds: ["R0"], selectedNoteIds: ["note-0"], primarySelectedId: "R0" })
    });

    expect(intent.kind).toBe("replace-selection");
    if (intent.kind !== "replace-selection") return;
    expect(Array.from(intent.selection.selectedIds)).toEqual(["R1", "w1"]);
    expect(Array.from(intent.selection.selectedNoteIds)).toEqual(["note-1"]);
    expect(intent.selection.primarySelectedId).toBe("note-1");
  });

  it("projects a Shift box as merged mixed selection with existing primary semantics", () => {
    const existing = createSchematicSelectionState({
      selectedIds: ["R0"],
      selectedNoteIds: ["note-0"],
      primarySelectedId: "R0"
    });

    const intent = projectFinishedSelectionBox({
      selectionBox: selectionBox({ ids: ["R1", "w1"], noteIds: ["note-1"] }),
      mode: "select",
      additive: true,
      hasActiveAnalysisPick: false,
      selectionState: existing
    });

    expect(intent.kind).toBe("merge-selection");
    if (intent.kind !== "merge-selection") return;
    expect(Array.from(intent.selection.selectedIds)).toEqual(["R0", "R1", "w1"]);
    expect(Array.from(intent.selection.selectedNoteIds)).toEqual(["note-0", "note-1"]);
    expect(intent.selection.primarySelectedId).toBe("note-1");

    const emptyMergeIntent = projectFinishedSelectionBox({
      selectionBox: selectionBox(),
      mode: "select",
      additive: true,
      hasActiveAnalysisPick: false,
      selectionState: existing
    });

    expect(emptyMergeIntent.kind).toBe("merge-selection");
    if (emptyMergeIntent.kind !== "merge-selection") return;
    expect(emptyMergeIntent.selection.primarySelectedId).toBe("R0");
  });
});
