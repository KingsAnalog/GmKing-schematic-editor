import { describe, expect, it } from "vitest";
import { fixtureDocument } from "../support/fixtureDocument";
import type { SchematicNote } from "../../../src/schematic/types";
import { noteVisualBounds } from "../../../src/schematic/view-geometry";
import { noteSizeFromMeasuredContent } from "../../../src/schematic/notes/noteSizing";
import { collectSelectionBoxHits } from "../../../src/schematic/selection/selectionBoxModel";
import { setMixedSelection } from "../../../src/schematic/selection/selectionModel";
import { projectSchematicSelection } from "../../../src/schematic/selection/selectionProjection";
import { transformSelectionDocumentGeometry } from "../../../src/schematic/selection/selectionTransformModel";
import { parseSchematicDocumentFile, serializeSchematicDocumentFile } from "../../../src/schematic/schematicDocumentCodec";
import { createSchematicContentHistoryAdapter } from "../../../src/schematic/document/contentHistoryAdapter";
import { copySourceFromDocument, rotateCopySourceAroundAnchor, instantiateCopyAt } from "../../../src/schematic/copyModel";
import { buildSchematicSelectionSvg } from "../../../src/schematic/selection/selectionExport";
import { renderSchematicDocumentSvg } from "../../../src/schematic/documentSvgRenderer";

function makeNote(overrides: Partial<SchematicNote> = {}): SchematicNote {
  return { id: "note", x: 100, y: 200, width: 30, height: 10, anchor: "upperLeft", text: "V1", fontSizePx: 9, ...overrides };
}

describe("note size and rotation across editing, storage and rendering", () => {
  it("fits 9px single-line text into one grid and rounds multiline text up", () => {
    expect(noteSizeFromMeasuredContent({ width: 10, height: 9 }, 9)).toEqual({ width: 20, height: 10 });
    expect(noteSizeFromMeasuredContent({ width: 10, height: 18 }, 9)).toEqual({ width: 20, height: 20 });
    expect(noteSizeFromMeasuredContent({ width: 840, height: 200 }, 200)).toEqual({ width: 850, height: 220 });
  });

  it.each(["lowerLeft", "centerCenter", "upperRight"] as const)("rotates a %s note around its grid anchor and restores after four turns", (anchor) => {
    const note = makeNote({ anchor });
    const document = fixtureDocument({ notes: [note] });
    const before = structuredClone(document.notes[0]);
    for (const rotation of [90, 180, 270, 0]) {
      const selection = projectSchematicSelection(document, setMixedSelection([], [note.id]));
      expect(transformSelectionDocumentGeometry({ document, selection, kind: "rotate" }).changed).toBe(true);
      expect(document.notes[0]).toMatchObject({ x: 100, y: 200 });
      expect(document.notes[0].rotation ?? 0).toBe(rotation);
    }
    expect(document.notes[0]).toEqual(before);
  });

  it("uses the rotated frame for box selection and document/export bounds", () => {
    const note = makeNote({ rotation: 90 });
    const document = fixtureDocument({ notes: [note] });
    const bounds = { x: 90, y: 200, width: 10, height: 30 };
    expect(noteVisualBounds(note)).toEqual(bounds);
    expect(collectSelectionBoxHits(document, { x: 101, y: 231 }, { x: 89, y: 199 }).noteIds).toEqual([note.id]);
    expect(collectSelectionBoxHits(document, { x: 111, y: 201 }, { x: 129, y: 209 }).noteIds).toEqual([]);
    const exported = buildSchematicSelectionSvg({ ...document, junctionPoints: [], padding: 0 })!;
    expect(exported.bounds).toEqual(bounds);
    expect(exported.svg).toContain('transform="translate(100 200) rotate(90) translate(0 0)"');
    expect(exported.clipboardSvg).toContain('transform="translate(100 200) rotate(90) translate(0 0)"');
    expect(exported.clipboardSvg).toContain('font-size="9"');
    expect(exported.clipboardSvg).toContain('>V1</text>');
    expect(renderSchematicDocumentSvg(document, { namespace: "note", padding: 0 }).viewBox).toEqual(bounds);
  });

  it("round trips rotation and the expanded font range through files and undo/redo", () => {
    const document = fixtureDocument({ notes: [makeNote({ fontSizePx: 1 })] });
    const history = createSchematicContentHistoryAdapter(document);
    document.notes[0].rotation = 270;
    document.notes[0].fontSizePx = 200;
    history.push(document);
    expect(history.undo()?.notes[0]).toMatchObject({ fontSizePx: 1 });
    const redone = history.redo()!;
    expect(redone.notes[0]).toMatchObject({ rotation: 270, fontSizePx: 200 });
    expect(parseSchematicDocumentFile(serializeSchematicDocumentFile(redone)).notes).toEqual(redone.notes);
    const invalid = JSON.parse(serializeSchematicDocumentFile(redone));
    invalid.schematic.notes[0].rotation = 45;
    expect(() => parseSchematicDocumentFile(JSON.stringify(invalid))).toThrow(/rotation/);
  });

  it("rotates copy text with its anchor, preserving orientation on placement", () => {
    const document = fixtureDocument({ notes: [makeNote({ rotation: 270 })] });
    const state = { source: copySourceFromDocument(document), anchor: { x: 100, y: 200 } };
    rotateCopySourceAroundAnchor(state);
    expect(state.source.notes[0].rotation ?? 0).toBe(0);
    rotateCopySourceAroundAnchor(state);
    const placed = instantiateCopyAt(state, { x: 200, y: 300 }, {
      preview: false, nextComponentRef: () => "unused", createId: () => "copy"
    });
    expect(placed.notes[0]).toMatchObject({ id: "copy", x: 200, y: 300, rotation: 90 });
    expect(document.notes[0].rotation).toBe(270);
  });
});
