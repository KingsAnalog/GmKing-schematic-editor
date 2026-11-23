import { noteBackgroundCss, noteTextColor } from "./noteAppearance";
import { noteCssTransform } from "./noteGeometry";
import { MIN_NOTE_HEIGHT, MIN_NOTE_WIDTH, noteFontSizePx, noteWidthPx, noteHeightPx } from "./noteSizing";
import type { Point, SchematicNote, SchematicNoteAnchor } from "../types";

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

export function createSchematicNote(id: string, point: Point, draft: { text: string; fontSizePx: number; anchor: SchematicNoteAnchor }): SchematicNote {
  return {
    id,
    x: point.x,
    y: point.y,
    width: MIN_NOTE_WIDTH,
    height: MIN_NOTE_HEIGHT,
    ...draft
  };
}

export function buildCopyPreviewNoteView(note: SchematicNote, options: { screenPoint: Point; zoom: number }): CopyPreviewNoteView {
  return {
    className: "schematic-note schematic-note-copy-preview",
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
