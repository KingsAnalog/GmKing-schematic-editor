import { noteBackgroundCss, noteTextColor } from "./noteAppearance";
import { noteCssTransform } from "./noteGeometry";
import { DEFAULT_MARKDOWN_NOTE_WIDTH, MIN_MARKDOWN_NOTE_HEIGHT, MIN_NOTE_HEIGHT, MIN_NOTE_WIDTH, noteFontSizePx, noteWidthPx, noteHeightPx } from "./noteSizing";
import type { Point, SchematicNote } from "../types";

export interface CopyPreviewNoteView {
  className: string;
  noteId: string;
  textContent: string;
  style: {
    width: string;
    height: string;
    backgroundColor: string;
    color: string;
    fontSize: string;
    left: string;
    top: string;
    transform: string;
  };
}

export function createPlainSchematicNote(id: string, anchor: Point): SchematicNote {
  return {
    id,
    x: anchor.x,
    y: anchor.y,
    width: MIN_NOTE_WIDTH,
    height: MIN_NOTE_HEIGHT,
    format: "plain",
    text: ""
  };
}

export function createMarkdownSchematicNote(id: string, anchor: Point): SchematicNote {
  return {
    id,
    x: anchor.x,
    y: anchor.y,
    width: DEFAULT_MARKDOWN_NOTE_WIDTH,
    height: MIN_MARKDOWN_NOTE_HEIGHT,
    format: "markdown",
    text: ""
  };
}

export function buildCopyPreviewNoteView(note: SchematicNote, options: { screenPoint: Point; zoom: number }): CopyPreviewNoteView {
  return {
    className: [
      "schematic-note",
      note.format === "markdown" ? "is-markdown" : "",
      "schematic-note-copy-preview"
    ].filter(Boolean).join(" "),
    noteId: note.id,
    textContent: note.text || " ",
    style: {
      width: `${noteWidthPx(note)}px`,
      height: `${noteHeightPx(note)}px`,
      backgroundColor: noteBackgroundCss(note),
      color: noteTextColor(note),
      fontSize: `${noteFontSizePx(note)}px`,
      left: `${options.screenPoint.x}px`,
      top: `${options.screenPoint.y}px`,
      transform: noteCssTransform(note, options.zoom)
    }
  };
}
