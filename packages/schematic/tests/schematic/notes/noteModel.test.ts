import { describe, expect, it } from "vitest";
import { buildCopyPreviewNoteView, createMarkdownSchematicNote, createPlainSchematicNote } from "../../../src/schematic/notes/noteModel";
import {
  DEFAULT_NOTE_FONT_SIZE_PX,
  DEFAULT_MARKDOWN_NOTE_WIDTH,
  MIN_MARKDOWN_NOTE_HEIGHT,
  MAX_NOTE_FONT_SIZE_PX,
  MIN_NOTE_FONT_SIZE_PX,
  MIN_NOTE_HEIGHT,
  MIN_NOTE_WIDTH
} from "../../../src/schematic/notes/noteSizing";
import type { SchematicNote } from "../../../src/schematic/types";

function note(overrides: Partial<SchematicNote> = {}): SchematicNote {
  return {
    id: "note-1",
    x: 10,
    y: 20,
    width: 120,
    height: 60,
    format: "plain",
    text: "copy me",
    ...overrides
  };
}

describe("schematic note model", () => {
  it("creates default plain schematic notes at the provided anchor", () => {
    expect(createPlainSchematicNote("note-new", { x: 125, y: 260 })).toEqual({
      id: "note-new",
      x: 125,
      y: 260,
      width: MIN_NOTE_WIDTH,
      height: MIN_NOTE_HEIGHT,
      format: "plain",
      text: ""
    });
  });

  it("creates new Markdown notes with the default fixed width", () => {
    expect(createMarkdownSchematicNote("note-md", { x: 40, y: 60 })).toEqual({
      id: "note-md",
      x: 40,
      y: 60,
      width: DEFAULT_MARKDOWN_NOTE_WIDTH,
      height: MIN_MARKDOWN_NOTE_HEIGHT,
      format: "markdown",
      text: ""
    });
  });

  it("builds copy preview note presentation with empty-text and default fallbacks", () => {
    expect(
      buildCopyPreviewNoteView(note({ text: "", width: 4, height: undefined, backgroundColor: undefined, fontSizePx: undefined }), {
        screenPoint: { x: 101.5, y: -24 },
        zoom: 1.75
      })
    ).toEqual({
      className: "schematic-note schematic-note-copy-preview",
      noteId: "note-1",
      textContent: " ",
      style: {
        width: `${MIN_NOTE_WIDTH}px`,
        height: `${MIN_NOTE_HEIGHT}px`,
        backgroundColor: "transparent",
        color: "#111111",
        fontSize: `${DEFAULT_NOTE_FONT_SIZE_PX}px`,
        left: "101.5px",
        top: "-24px",
        transform: "scale(1.75)"
      }
    });
  });

  it("preserves copy preview text, dimensions, background, and explicit font size", () => {
    expect(
      buildCopyPreviewNoteView(note({ text: "copied note", width: 160, height: 80, backgroundColor: "#fff6bf", fontSizePx: 18 }), {
        screenPoint: { x: 240, y: 320 },
        zoom: 0.5
      })
    ).toEqual({
      className: "schematic-note schematic-note-copy-preview",
      noteId: "note-1",
      textContent: "copied note",
      style: {
        width: "160px",
        height: "80px",
        backgroundColor: "#fff6bf",
        color: "#111111",
        fontSize: "18px",
        left: "240px",
        top: "320px",
        transform: "scale(0.5)"
      }
    });
  });

  it("keeps explicit no-fill copy previews transparent", () => {
    expect(
      buildCopyPreviewNoteView(note({ backgroundColor: null }), { screenPoint: { x: 0, y: 0 }, zoom: 1 }).style.backgroundColor
    ).toBe("transparent");
  });

  it("clamps copy preview note dimensions and font sizes", () => {
    expect(buildCopyPreviewNoteView(note({ width: 1, height: 2, fontSizePx: 0 }), { screenPoint: { x: 0, y: 0 }, zoom: 1 }).style).toMatchObject({
      width: `${MIN_NOTE_WIDTH}px`,
      height: `${MIN_NOTE_HEIGHT}px`,
      fontSize: `${MIN_NOTE_FONT_SIZE_PX}px`
    });

    expect(buildCopyPreviewNoteView(note({ fontSizePx: 300 }), { screenPoint: { x: 0, y: 0 }, zoom: 1 }).style.fontSize).toBe(
      `${MAX_NOTE_FONT_SIZE_PX}px`
    );
  });
});
