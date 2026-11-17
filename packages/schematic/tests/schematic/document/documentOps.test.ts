import { authorFixture, connectFixtureJunction, fixtureDocument } from "../support/fixtureDocument";
import { executeSchematicPropertyBatchCommand } from "../../../src/schematic/propertyBatchCommands";
import { describe, expect, it } from "vitest";
import { createEmptySchematicDocument } from "../../../src/schematic/document/documentModel";
import { createSchematicDocumentHistoryAdapter, SCHEMATIC_DOCUMENT_HISTORY_MAX_DEPTH } from "../support/documentHistory";
import {
  applyCopyPlacementDocumentOp,
  applyNetLabelPlacementDocumentOp,
  applyPlacementCommitDocumentOp,
  applySelectionMoveDocumentOp,
  applyWireCommitDocumentOp,
  commitSelectionMoveDocumentOp,
  commitNoteEditDocumentOp,
  commitNoteFontSizeDocumentOp,
  commitNoteWidthDocumentOp,
  createPlainSchematicNoteDocumentOp,
  deleteSchematicDocumentSelection,
  moveSchematicNoteDocumentOp,
  resetSchematicDocument,
  restoreSchematicDocumentOp,
  setNoteFormatDocumentOp,
  transformSelectionDocumentGeometryOp,
  transformSingleComponentOrientationDocumentOp,
  toggleTemporaryDeletedSchematicIds
} from "../../../src/schematic/document/documentOps";
import { buildPlacementCommit } from "../../../src/schematic/placementModel";
import { junctionId } from "../../../src/schematic/renderer";
import { beginSelectionMoveTransaction } from "../../../src/schematic/selection/selectionMoveTransaction";
import { projectSchematicSelection } from "../../../src/schematic/selection/selectionProjection";
import { setMixedSelection } from "../../../src/schematic/selection/selectionModel";
import type { SchematicDocument } from "../../../src/schematic/types";
import { fixtureComponent, fixtureNote, fixtureWire, mixedSelectionDoc, twoResistorsStraightWireDoc } from "../support/fixtures";

describe("schematic document ops", () => {
  it("resets to the ordinary empty shape and remains history-friendly", () => {
    const document: SchematicDocument = fixtureDocument({
      junctionAppearances: [],
      netLabels: [],
      components: [fixtureComponent("resistor", "R1", 40, 0)],
      wires: [fixtureWire("w1", [{ x: 40, y: 0 }, { x: 80, y: 0 }])],
      junctions: [{ x: 80, y: 0 }],

      notes: [fixtureNote("note-1", 20, 20)]
    }, { joinAt: [{ x: 80, y: 0 }] });
    const history = createSchematicDocumentHistoryAdapter(document);

    const result = resetSchematicDocument(document);
    if (result.historyIntent === "push") history.push(document);

    expect(result).toMatchObject({
      changed: true,
      historyIntent: "push",
      selectedIds: [],
      noteIds: [],
      status: "Schematic reset to defaults."
    });
    expect(document).toEqual(createEmptySchematicDocument());
    expect(history.undo()?.components.map((component) => component.id)).toEqual(["R1"]);
    expect(history.redo()).toEqual(createEmptySchematicDocument());
  });

  it("reports a no-op reset for an already empty document", () => {
    const document = createEmptySchematicDocument();

    expect(resetSchematicDocument(document)).toMatchObject({
      changed: false,
      historyIntent: "none",
      document: createEmptySchematicDocument()
    });
  });

  it("applies placement commits by appending only document objects and returning selected ids", () => {
    const existingJunctions = [{ x: 20, y: 40 }];
    const existingNotes = [fixtureNote("note-keep", 20, 20)];
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [fixtureComponent("capacitor", "C1", 0, 0)],
      wires: [fixtureWire("w-existing", [{ x: 0, y: 0 }, { x: 20, y: 0 }])],
      junctions: existingJunctions,
      notes: existingNotes
    });
    const commit = buildPlacementCommit("resistor", { x: 120, y: 80 }, {
      createId: () => "component-placed",
      nextRef: () => "R7",
      rotation: 90,
      mirrored: true
    });
    const syntheticCommit = {
      ...commit,
      fragment: {
        ...commit.fragment,
        junctions: [{ x: 200, y: 220 }],
        notes: [fixtureNote("note-synthetic", 100, 100)]
      }
    };

    const result = applyPlacementCommitDocumentOp(document, syntheticCommit);

    expect(result).toMatchObject({
      changed: true,
      historyIntent: "push",
      selectedIds: ["component-placed"],
      noteIds: [],
      appendedComponentCount: 1,
      appendedWireCount: 0
    });
    expect(document.components.map((component) => component.id)).toEqual(["C1", "component-placed"]);
    expect(document.wires.map((wire) => wire.id)).toEqual(["w-existing"]);
    expect(document.junctions).toBe(existingJunctions);
    expect(document.notes).toBe(existingNotes);
  });

  it("applies copy placement through a document op and returns copied selections", () => {
    const document = createEmptySchematicDocument();

    const result = applyCopyPlacementDocumentOp(document, fixtureDocument({
      netLabels: [],
      junctionAppearances: [],
      components: [fixtureComponent("resistor", "R-copy", 100, 120)],
      wires: [fixtureWire("w-copy", [{ x: 100, y: 120 }, { x: 140, y: 120 }])],
      notes: [fixtureNote("note-copy", 160, 120)],

    }, { joinAt: [{ x: 140, y: 120 }] }));

    expect(result).toMatchObject({
      changed: true,
      historyIntent: "push",
      selectedIds: ["R-copy", "w-copy"],
      noteIds: ["note-copy"],
      count: 3,
      placed: true,
      status: "Copied 3 objects. Move to another point and click to copy again, or Esc cancels."
    });
    expect(document.components.map((component) => component.id)).toEqual(["R-copy"]);
    expect(document.wires.map((wire) => wire.id)).toEqual(["w-copy"]);
    expect(document.notes?.map((note) => note.id)).toEqual(["note-copy"]);

  });

  it("reports no-op copy placement without changing the document", () => {
    const document = createEmptySchematicDocument();

    const result = applyCopyPlacementDocumentOp(document, fixtureDocument({
      netLabels: [],
      junctionAppearances: [],
      components: [],
      wires: [],
      notes: [],

    }));

    expect(result).toMatchObject({
      changed: false,
      historyIntent: "none",
      selectedIds: [],
      noteIds: [],
      count: 0,
      placed: false,
      status: "Nothing to copy."
    });
    expect(document).toEqual(createEmptySchematicDocument());
  });

  it("appends a placed net label with a standard history intent", () => {
    const document = createEmptySchematicDocument();
    const label = {
      id: "label-1",
      name: "CLK",
      attachment: {
        wireId: "wire-1",
        point: { x: 40, y: 20 }
      }
    };

    expect(applyNetLabelPlacementDocumentOp(document, label)).toEqual({
      changed: true,
      historyIntent: "push",
      selectedIds: [],
      noteIds: [],
      status: "Placed label CLK. Click another wire to place the same label; Esc cancels."
    });
    expect(document.netLabels).toEqual([label]);
  });

  it("creates a plain note by appending to existing document notes", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [],
      wires: [],
      junctions: [],
      notes: [fixtureNote("note-existing", 20, 20)]
    });

    const result = createPlainSchematicNoteDocumentOp(document, "note-created", { x: 120, y: 80 });

    expect(result).toEqual({
      changed: true,
      historyIntent: "push",
      selectedIds: [],
      noteIds: ["note-created"],
      status: "Note created. Type to edit; Esc or focus outside finishes editing."
    });
    expect(document.notes?.map((note) => note.id)).toEqual(["note-existing", "note-created"]);
    expect(document.notes?.[1]).toMatchObject({
      id: "note-created",
      x: 120,
      y: 80,
      format: "plain",
      text: ""
    });
  });

  it("commits reversible note format and width changes", () => {
    const target = fixtureNote("note-format", 20, 20);
    const source = target.text;
    expect(setNoteFormatDocumentOp(target, "markdown")).toMatchObject({ changed: true, historyIntent: "push" });
    const snapshot = { noteId: target.id, width: target.width, height: target.height };
    target.width = 400;
    expect(commitNoteWidthDocumentOp(snapshot, target)).toMatchObject({ changed: true, historyIntent: "push" });
    expect(setNoteFormatDocumentOp(target, "plain")).toMatchObject({ changed: true, historyIntent: "push" });
    expect(target.text).toBe(source);
  });

  it("moves a schematic note through a document op", () => {
    const note = fixtureNote("note-move", 20, 40);

    const result = moveSchematicNoteDocumentOp(note, { x: 80, y: 120 });

    expect(result).toEqual({
      changed: true,
      historyIntent: "push",
      selectedIds: [],
      noteIds: ["note-move"],
      status: "Note moved."
    });
    expect(note).toMatchObject({ x: 80, y: 120 });
  });

  it("reports a no-op schematic note move without mutating", () => {
    const note = fixtureNote("note-move", 20, 40);

    const result = moveSchematicNoteDocumentOp(note, { x: 20, y: 40 });

    expect(result).toEqual({
      changed: false,
      historyIntent: "none",
      selectedIds: [],
      noteIds: [],
      status: ""
    });
    expect(note).toMatchObject({ x: 20, y: 40 });
  });

  it("commits note background color changes through a document op", () => {
    const note = fixtureNote("note-fill", 20, 20);

    const result = executeSchematicPropertyBatchCommand(documentWithNote(note), { selectedIds: [], selectedNoteIds: [note.id] }, { kind: "note-background", color: "  #AaBbCc  " });

    expect(result).toMatchObject({
      changed: true,
      historyIntent: "push",
    });
    expect(note.backgroundColor).toBe("#aabbcc");
  });

  it("commits an explicit no-fill note background through a document op", () => {
    const note = fixtureNote("note-no-fill", 20, 20);

    const result = executeSchematicPropertyBatchCommand(documentWithNote(note), { selectedIds: [], selectedNoteIds: [note.id] }, { kind: "note-background", color: null });

    expect(result).toMatchObject({
      changed: true,
      historyIntent: "push",
    });
    expect(note.backgroundColor).toBeNull();
  });

  it("reports invalid note background colors without mutating", () => {
    const note = fixtureNote("note-fill", 20, 20);

    const result = executeSchematicPropertyBatchCommand(documentWithNote(note), { selectedIds: [], selectedNoteIds: [note.id] }, { kind: "note-background", color: "#12345g" });

    expect(result).toMatchObject({
      changed: false,
      historyIntent: "none",
    });
    expect(note.backgroundColor).toBe("#fff6bf");
  });

  it("reports unchanged note background colors without history intent", () => {
    const note = fixtureNote("note-fill", 20, 20);

    const result = executeSchematicPropertyBatchCommand(documentWithNote(note), { selectedIds: [], selectedNoteIds: [note.id] }, { kind: "note-background", color: "#fff6bf" });

    expect(result).toMatchObject({
      changed: false,
      historyIntent: "none",
    });
    expect(note.backgroundColor).toBe("#fff6bf");
  });

  it("commits changed note edit text snapshots without mutating", () => {
    const note = fixtureNote("note-edit", 20, 20);
    const snapshot = { noteId: note.id, text: note.text, width: note.width, height: note.height };
    note.text = "updated note";

    const result = commitNoteEditDocumentOp(snapshot, note);

    expect(result).toEqual({
      changed: true,
      historyIntent: "push",
      selectedIds: [],
      noteIds: [],
      status: "Note updated."
    });
    expect(note.text).toBe("updated note");
  });

  it("commits changed note edit bounds snapshots without mutating", () => {
    const note = fixtureNote("note-edit", 20, 20);
    const snapshot = { noteId: note.id, text: note.text, width: note.width, height: note.height };
    note.width = 136;
    note.height = 72;

    const result = commitNoteEditDocumentOp(snapshot, note);

    expect(result).toEqual({
      changed: true,
      historyIntent: "push",
      selectedIds: [],
      noteIds: [],
      status: "Note updated."
    });
    expect(note).toMatchObject({ width: 136, height: 72 });
  });

  it("commits changed note edit font-size snapshots without mutating", () => {
    const note = fixtureNote("note-edit", 20, 20);
    note.fontSizePx = 14;
    const snapshot = {
      noteId: note.id,
      text: note.text,
      width: note.width,
      height: note.height,
      fontSizePx: note.fontSizePx
    };
    note.fontSizePx = 18;

    expect(commitNoteEditDocumentOp(snapshot, note)).toMatchObject({
      changed: true,
      historyIntent: "push",
      status: "Note updated."
    });
  });

  it("reports unchanged note edit snapshots without history intent", () => {
    const note = fixtureNote("note-edit", 20, 20);
    const snapshot = { noteId: note.id, text: note.text, width: note.width, height: note.height };

    expect(commitNoteEditDocumentOp(snapshot, note)).toEqual({
      changed: false,
      historyIntent: "none",
      selectedIds: [],
      noteIds: [],
      status: ""
    });
  });

  it("commits missing and mismatched note edit snapshots", () => {
    const note = fixtureNote("note-edit", 20, 20);
    const snapshot = { noteId: "note-other", text: note.text, width: note.width, height: note.height };

    expect(commitNoteEditDocumentOp(null, note)).toEqual({
      changed: true,
      historyIntent: "push",
      selectedIds: [],
      noteIds: [],
      status: "Note updated."
    });
    expect(commitNoteEditDocumentOp(snapshot, note)).toEqual({
      changed: true,
      historyIntent: "push",
      selectedIds: [],
      noteIds: [],
      status: "Note updated."
    });
  });

  it("commits changed note font size snapshots without mutating", () => {
    const note = fixtureNote("note-size", 20, 20);
    const snapshot = { noteId: note.id, fontSizePx: note.fontSizePx, width: note.width, height: note.height };
    note.fontSizePx = 18;
    note.width = 132;

    const result = commitNoteFontSizeDocumentOp(snapshot, note);

    expect(result).toEqual({
      changed: true,
      historyIntent: "push",
      selectedIds: [],
      noteIds: [],
      status: "Note font size updated."
    });
    expect(note.fontSizePx).toBe(18);
    expect(note.width).toBe(132);
  });

  it("reports unchanged note font size snapshots without history intent", () => {
    const note = fixtureNote("note-size", 20, 20);
    const snapshot = { noteId: note.id, fontSizePx: note.fontSizePx, width: note.width, height: note.height };

    expect(commitNoteFontSizeDocumentOp(snapshot, note)).toEqual({
      changed: false,
      historyIntent: "none",
      selectedIds: [],
      noteIds: [],
      status: ""
    });
  });

  it("commits a signal route through a document op with an empty selection", () => {
    const document = createEmptySchematicDocument();

    const result = applyWireCommitDocumentOp(
      document,
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 }
      ],
      { variant: "signal" },
      () => "wire-new"
    );

    expect(result).toMatchObject({
      changed: true,
      historyIntent: "push",
      noteIds: [],
      committed: true,
      status: "Wire added. Click another start point or press Esc."
    });
    expect(document.wires).toHaveLength(2);
    expect(document.wires[0]).toMatchObject({
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 }
      ],
      routeMode: "orthogonal",
      appearance: { variant: "signal" }
    });
    expect(document.wires[1]).toMatchObject({
      points: [
        { x: 40, y: 0 },
        { x: 40, y: 40 }
      ],
      routeMode: "orthogonal",
      appearance: { variant: "signal" }
    });
    expect(result.wireId).toBe(document.wires[0].id);
    expect(result.selectedIds).toEqual([]);
  });

  it("commits a wide wire through a document op with preserved appearance", () => {
    const document = createEmptySchematicDocument();

    const result = applyWireCommitDocumentOp(
      document,
      [
        { x: 20, y: 20 },
        { x: 100, y: 20 }
      ],
      { variant: "wide", color: "#f97316" },
      () => "wire-new"
    );

    expect(result).toMatchObject({
      changed: true,
      historyIntent: "push",
      noteIds: [],
      committed: true,
      status: "Wide wire added. Click another start point or press Esc."
    });
    expect(document.wires).toHaveLength(1);
    expect(document.wires[0]).toMatchObject({
      points: [
        { x: 20, y: 20 },
        { x: 100, y: 20 }
      ],
      routeMode: "orthogonal",
      appearance: { variant: "wide", color: "#f97316" }
    });
    expect(result.wireId).toBe(document.wires[0].id);
    expect(result.selectedIds).toEqual([]);
  });

  it("infers free-angle mode for a diagonal document-op commit", () => {
    const document = createEmptySchematicDocument();

    const result = applyWireCommitDocumentOp(
      document,
      [
        { x: 20, y: 20 },
        { x: 100, y: 60 }
      ],
      { variant: "signal" },
      () => "wire-diagonal"
    );

    expect(result.committed).toBe(true);
    expect(document.wires).toEqual([expect.objectContaining({
      id: "wire-diagonal",
      routeMode: "freeAngle",
      points: [
        { x: 20, y: 20 },
        { x: 100, y: 60 }
      ]
    })]);
  });

  it("reports a no-op wire commit for degenerate paths without changing the document", () => {
    const document = createEmptySchematicDocument();

    const result = applyWireCommitDocumentOp(
      document,
      [
        { x: 20, y: 20 },
        { x: 20, y: 20 }
      ],
      { variant: "signal" },
      () => "wire-new"
    );

    expect(result).toEqual({
      changed: false,
      historyIntent: "none",
      selectedIds: [],
      noteIds: [],
      status: "No wire committed.",
      committed: false,
      wireId: null
    });
    expect(document).toEqual(createEmptySchematicDocument());
  });

  it("updates one wire decoration through a history-producing document op", () => {
    const document = createEmptySchematicDocument();
    document.wires.push(fixtureWire("wire-decoration", [
      { x: 0, y: 0 },
      { x: 80, y: 0 }
    ], { variant: "signal", color: "#0072b2" }));
    authorFixture(document);

    expect(executeSchematicPropertyBatchCommand(document, { selectedIds: ["wire-decoration"], selectedNoteIds: [] }, { kind: "wire-decoration", patch: {
      lineWidth: "2a",
      startMarker: "arrow",
      digitalSlash: true,
      digitalLabel: ""
    } })).toMatchObject({
      changed: true,
      historyIntent: "push",
    });
    expect(document.wires[0].appearance).toEqual({
      variant: "signal",
      color: "#0072b2",
      lineWidth: "2a",
      startMarker: "arrow",
      digitalSlash: true,
      digitalLabel: ""
    });
    expect(executeSchematicPropertyBatchCommand(document, { selectedIds: ["wire-decoration"], selectedNoteIds: [] }, { kind: "wire-decoration", patch: {
      startMarker: "arrow"
    } })).toMatchObject({
      changed: false,
      historyIntent: "none",
    });
  });

  it("rotates single-component orientation through a document op", () => {
    const component = { ...fixtureComponent("resistor", "R1", 0, 0, 270), mirrored: true };

    const result = transformSingleComponentOrientationDocumentOp([component], "rotate");

    expect(result).toMatchObject({
      changed: true,
      historyIntent: "push",
      selectedIds: ["R1"],
      noteIds: [],
      transformedCount: 1,
      status: "Rotated 1 component."
    });
    expect(component).toMatchObject({ rotation: 0, mirrored: true });
  });

  it("mirrors mixed selection geometry through a document op and returns transformed junction ids", () => {
    const document = mixedSelectionDoc();
    connectFixtureJunction(document, { x: 320, y: 200 });
    const selection = projectSchematicSelection(document, setMixedSelection(["R1", "w-mixed", junctionId({ x: 280, y: 200 })], ["note-1"]));

    const result = transformSelectionDocumentGeometryOp(document, selection, "mirror-y");

    expect(result).toMatchObject({
      changed: true,
      historyIntent: "push",
      selectedIds: [],
      noteIds: [],
      transformedCount: 4,
      status: "Mirrored 4 selected objects."
    });
    expect(result.transformedJunctionIds.length).toBeGreaterThan(0);
    expect(document.components.find((component) => component.id === "R1")).toMatchObject({ rotation: 180, mirrored: true });
  });

  it("applies selection move transactions through a document op without pushing history", () => {
    const document = mixedSelectionDoc();
    const transaction = beginSelectionMoveTransaction({
      document,
      activeComponentId: "R1",
      selectedIds: new Set(["R1", "C1", "w-mixed"]),
      selectedNoteIds: new Set(["note-1"])
    });
    expect(transaction).not.toBeNull();

    document.components.find((component) => component.id === "R1")!.x += 40;
    const result = applySelectionMoveDocumentOp(document, transaction!, "stretch");

    expect(result).toMatchObject({
      changed: true,
      historyIntent: "none",
      selectedIds: [],
      noteIds: [],
      affectedGraphIds: ["R1", "C1", "w-mixed"],
      affectedNoteIds: ["note-1"],
      affectedIds: ["R1", "C1", "w-mixed", "note-1"],
      status: "Selection move updated."
    });
    expect(Array.from(result.movedComponentIds)).toEqual(["C1"]);
    expect(Array.from(result.updatedWireIds)).toEqual(["w-mixed"]);
    expect(Array.from(result.movedNoteIds)).toEqual(["note-1"]);
    expect(document.components.find((component) => component.id === "C1")).toMatchObject({ x: 400, y: 200 });
    expect(document.wires.find((wire) => wire.id === "w-mixed")?.points).toEqual([
      { x: 280, y: 200 },
      { x: 360, y: 200 }
    ]);

    expect(document.notes?.[0]).toMatchObject({ id: "note-1", x: 260, y: 260 });
  });

  it("reports no-op selection move document ops without affected ids", () => {
    const document = mixedSelectionDoc();
    const transaction = beginSelectionMoveTransaction({
      document,
      activeComponentId: "R1",
      selectedIds: new Set(["R1", "C1", "w-mixed"]),
      selectedNoteIds: new Set(["note-1"])
    });
    expect(transaction).not.toBeNull();

    const result = applySelectionMoveDocumentOp(document, transaction!, "stretch");

    expect(result).toMatchObject({
      changed: false,
      historyIntent: "none",
      selectedIds: [],
      noteIds: [],
      affectedGraphIds: [],
      affectedNoteIds: [],
      affectedIds: [],
      status: ""
    });
    expect(result.movedComponentIds.size).toBe(0);
    expect(result.updatedWireIds.size).toBe(0);
    expect(result.movedNoteIds.size).toBe(0);
  });

  it("wraps selection move stretch and move-only results with affected ids", () => {
    const stretched = twoResistorsStraightWireDoc();
    const stretchTransaction = beginSelectionMoveTransaction({
      document: stretched,
      activeComponentId: "R1",
      selectedIds: new Set(["R1", "R2"]),
      selectedNoteIds: new Set()
    });
    expect(stretchTransaction).not.toBeNull();

    stretched.components.find((component) => component.id === "R1")!.x += 40;
    const stretchResult = applySelectionMoveDocumentOp(stretched, stretchTransaction!, "stretch");

    expect(stretchResult).toMatchObject({
      changed: true,
      historyIntent: "none",
      selectedIds: [],
      noteIds: [],
      affectedGraphIds: ["R1", "R2", "w-r1-r2"],
      affectedNoteIds: [],
      affectedIds: ["R1", "R2", "w-r1-r2"]
    });
    expect(stretchResult.selectedIds).not.toContain("w-r1-r2");
    expect(Array.from(stretchResult.updatedWireIds)).toEqual(["w-r1-r2"]);
    expect(stretched.wires[0].points).toEqual([
      { x: 280, y: 200 },
      { x: 360, y: 200 }
    ]);

    const moveOnly = twoResistorsStraightWireDoc();
    const moveOnlyTransaction = beginSelectionMoveTransaction({
      document: moveOnly,
      activeComponentId: "R1",
      selectedIds: new Set(["R1", "R2"]),
      selectedNoteIds: new Set()
    });
    expect(moveOnlyTransaction).not.toBeNull();

    moveOnly.components.find((component) => component.id === "R1")!.x += 40;
    const moveOnlyResult = applySelectionMoveDocumentOp(moveOnly, moveOnlyTransaction!, "moveOnly");

    expect(moveOnlyResult).toMatchObject({
      changed: true,
      historyIntent: "none",
      selectedIds: [],
      noteIds: [],
      affectedGraphIds: ["R1", "R2"],
      affectedNoteIds: [],
      affectedIds: ["R1", "R2"]
    });
    expect(Array.from(moveOnlyResult.updatedWireIds)).toEqual([]);
    expect(moveOnly.wires[0].points).toEqual([
      { x: 240, y: 200 },
      { x: 320, y: 200 }
    ]);
  });

  it("extracts selection move commit history intent and no-op status", () => {
    const commit = commitSelectionMoveDocumentOp({
      geometryChanged: false,
      selectionMoveChanged: false,
      liveGeometryDirty: true,
      activeComponentId: "R1",
      affectedGraphIds: ["C1", "w-mixed"],
      affectedNoteIds: ["note-1"]
    });

    expect(commit).toEqual({
      changed: true,
      historyIntent: "push",
      selectedIds: [],
      noteIds: [],
      affectedGraphIds: ["R1", "C1", "w-mixed"],
      affectedNoteIds: ["note-1"],
      affectedIds: ["R1", "C1", "w-mixed", "note-1"],
      status: "Object moved. Netlist and junctions refreshed."
    });

    expect(
      commitSelectionMoveDocumentOp({
        geometryChanged: false,
        selectionMoveChanged: false,
        liveGeometryDirty: false
      })
    ).toEqual({
      changed: false,
      historyIntent: "none",
      selectedIds: [],
      noteIds: [],
      affectedGraphIds: [],
      affectedNoteIds: [],
      affectedIds: [],
      status: ""
    });
  });

  it("keeps the complete document unchanged across note and network no-ops", () => {
    const component = fixtureComponent("plus", "SUM1", 40, 40);
    const wire = fixtureWire("w1", [{ x: 0, y: 40 }, { x: 80, y: 40 }]);
    const note = fixtureNote("note-1", 100, 100);
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [component],
      wires: [wire],
      junctions: [{ x: 20, y: 40 }],
      notes: [note]
    });
    const before = structuredClone(document);
    const operations = [
      () => executeSchematicPropertyBatchCommand(document, { selectedIds: [wire.id], selectedNoteIds: [] }, { kind: "ink-color", color: "invalid" }),
      () => executeSchematicPropertyBatchCommand(document, { selectedIds: [junctionId({ x: 20, y: 40 })], selectedNoteIds: [] }, { kind: "ink-color", color: "invalid" }),
      () => executeSchematicPropertyBatchCommand(documentWithNote(note), { selectedIds: [], selectedNoteIds: [note.id] }, { kind: "note-background", color: "invalid" }),
      () => setNoteFormatDocumentOp(note, note.format),
      () => moveSchematicNoteDocumentOp(note, { x: note.x, y: note.y })
    ];

    operations.forEach((operation) => {
      expect(operation().changed).toBe(false);
      expect(document).toEqual(before);
    });
  });

  it("normalizes and assigns restored documents through a document op", () => {
    const document = createEmptySchematicDocument();
    const source: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [fixtureComponent("resistor", "R1", 0, 0)],
      wires: [
        {
          id: "w-legacy",
          points: [
            { x: 0, y: 0 },
            { x: 120, y: 0 }
          ],
          routeMode: "orthogonal"
        }
      ],
      junctions: [],
      notes: [{ id: "note-current", x: 10, y: 20, width: 80, height: 40, format: "markdown", text: "current **text**" }]
    });

    const result = restoreSchematicDocumentOp(document, source);

    expect(result).toMatchObject({
      changed: true,
      historyIntent: "none",
      selectedIds: [],
      noteIds: [],
      status: "Schematic restored."
    });
    expect(document.components.map((component) => component.id)).toEqual(["R1"]);

    expect(document.notes).toEqual([
      { id: "note-current", x: 10, y: 20, width: 160, height: 40, format: "markdown", text: "current **text**" }
    ]);
    expect(document.wires.map((wire) => wire.id)).toEqual(["w-legacy", "w-legacy-segment-1"]);
    expect(document.wires[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 }
    ]);
    expect(document.wires[1].points).toEqual([
      { x: 40, y: 0 },
      { x: 120, y: 0 }
    ]);
  });

  it("permanently deletes selected objects and notes from a projection", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [fixtureComponent("resistor", "R1", 40, 0), fixtureComponent("capacitor", "C1", 120, 0)],
      wires: [
        fixtureWire("w-delete", [{ x: 0, y: 0 }, { x: 80, y: 0 }]),
        fixtureWire("w-keep", [{ x: 120, y: 0 }, { x: 200, y: 0 }])
      ],
      junctions: [{ x: 80, y: 0 }],
      notes: [fixtureNote("note-delete", 20, 20), fixtureNote("note-keep", 200, 20)]
    });
    const selection = projectSchematicSelection(document, setMixedSelection(["R1", "w-delete"], ["note-delete"]));

    const result = deleteSchematicDocumentSelection(document, selection);

    expect(result).toMatchObject({
      changed: true,
      historyIntent: "push",
      selectedIds: [],
      noteIds: [],
      removedCount: 3,
      status: "Deleted 3 objects."
    });
    expect(document.components.map((component) => component.id)).toEqual(["C1"]);
    expect(document.wires.map((wire) => wire.id)).toEqual(["w-keep"]);
    expect(document.notes?.map((note) => note.id)).toEqual(["note-keep"]);
  });

  it("preserves document collection identity when a stale delete projection removes nothing", () => {
    const selected = fixtureComponent("resistor", "R1", 40, 0);
    const retained = fixtureComponent("capacitor", "C1", 120, 0);
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [selected, retained],
      wires: [fixtureWire("w1", [{ x: 120, y: 0 }, { x: 200, y: 0 }])],
      junctions: [],
      notes: [fixtureNote("note-1", 20, 20)]
    });
    const selection = projectSchematicSelection(document, setMixedSelection(["R1"], []));
    document.components = [retained];
    authorFixture(document);
    const before = structuredClone(document);
    const collectionRefs = fixtureDocument({
      components: document.components,
      wires: document.wires,
      netLabels: document.netLabels,
      notes: document.notes
    });

    expect(deleteSchematicDocumentSelection(document, selection)).toMatchObject({
      changed: false,
      historyIntent: "none",
      removedCount: 0
    });
    expect(document).toEqual(before);
    expect(document.components).toBe(collectionRefs.components);
    expect(document.wires).toBe(collectionRefs.wires);
    expect(document.netLabels).toBe(collectionRefs.netLabels);
    expect(document.notes).toBe(collectionRefs.notes);
  });

  it("toggles temporary delete only for components and wires while reporting unsupported ids", () => {
    const component = fixtureComponent("resistor", "R1", 40, 0);
    const wire = fixtureWire("w1", [{ x: 0, y: 0 }, { x: 40, y: 0 }]);
    const unsupportedJunction = junctionId({ x: 20, y: 0 });
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [component],
      wires: [wire],
      junctions: [{ x: 20, y: 0 }],
      notes: [fixtureNote("note-1", 20, 20)]
    });

    const result = toggleTemporaryDeletedSchematicIds(document, ["note-1", "R1", "w1", unsupportedJunction, "R1"]);

    expect(result).toMatchObject({
      changed: true,
      historyIntent: "push",
      selectedIds: ["R1", "w1"],
      toggledIds: ["R1", "w1"],
      unsupportedIds: ["note-1", unsupportedJunction],
      recovered: false,
      status: "Temporarily deleted 2 objects."
    });
    expect(component.temporarilyDeleted).toBe(true);
    expect(wire.temporarilyDeleted).toBe(true);
  });

  it("reports a no-op temporary delete when no supported ids are present", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [fixtureComponent("resistor", "R1", 40, 0)],
      wires: [fixtureWire("w1", [{ x: 0, y: 0 }, { x: 40, y: 0 }])],
      junctions: [{ x: 20, y: 0 }],
      notes: [fixtureNote("note-1", 20, 20)]
    });
    const unsupportedJunction = junctionId({ x: 20, y: 0 });

    expect(toggleTemporaryDeletedSchematicIds(document, ["note-1", unsupportedJunction])).toMatchObject({
      changed: false,
      historyIntent: "none",
      selectedIds: [],
      toggledIds: [],
      unsupportedIds: ["note-1", unsupportedJunction],
      status: "Temporary delete applies to components and wires. Use Delete to remove junctions, labels, or notes."
    });
  });

  it("reports a distinct no-op temporary delete when no ids were requested", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [fixtureComponent("resistor", "R1", 40, 0)],
      wires: [],
      junctions: []
    });

    expect(toggleTemporaryDeletedSchematicIds(document, [])).toMatchObject({
      changed: false,
      historyIntent: "none",
      selectedIds: [],
      toggledIds: [],
      unsupportedIds: [],
      status: "Select objects before temporary delete."
    });
  });

  it("uses an explicit 256-entry schematic document history cap", () => {
    const document = createEmptySchematicDocument();
    const history = createSchematicDocumentHistoryAdapter(document);

    for (let index = 1; index <= SCHEMATIC_DOCUMENT_HISTORY_MAX_DEPTH + 4; index += 1) {
      history.push(fixtureDocument({

        junctionAppearances: [],
        netLabels: [],
        notes: [],
        components: [fixtureComponent("resistor", `R${index}`, index * 20, 0)],
        wires: [],
        junctions: []
      }));
    }

    let undoCount = 0;
    let previous = history.undo();
    while (previous) {
      undoCount += 1;
      previous = history.undo();
    }

    expect(SCHEMATIC_DOCUMENT_HISTORY_MAX_DEPTH).toBe(256);
    expect(undoCount).toBe(SCHEMATIC_DOCUMENT_HISTORY_MAX_DEPTH - 1);
  });
});

function documentWithNote(note: SchematicDocument["notes"][number]): SchematicDocument {
  return { ...createEmptySchematicDocument(), notes: [note] };
}
