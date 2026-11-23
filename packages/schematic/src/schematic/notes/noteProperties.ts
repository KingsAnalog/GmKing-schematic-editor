import { DEFAULT_NOTE_TEXT_COLOR, noteFillStyle, noteTextColor } from "./noteAppearance";
import { normalizeLibraryShapeFillOpacity } from "../libraryShapeStyleModel";
import {
  MAX_NOTE_FONT_SIZE_PX,
  MIN_NOTE_FONT_SIZE_PX,
  noteFontSizePx
} from "./noteSizing";
import type { SchematicNote } from "../types";
import { clamp } from "../uiUtils";
import { normalizeHexColor } from "../../shared/color";

export type NoteBackgroundColorResult =
  | { status: "invalid" }
  | { status: "unchanged"; color: string | null }
  | { status: "changed"; color: string | null };

export type NoteFontSizeInputResult =
  | { status: "unchanged"; nextSize: number }
  | { status: "changed"; nextSize: number };

export interface NoteFontSizePropertySnapshot {
  noteId: string;
  fontSizePx?: number;
  width: number;
  height?: number;
}

export function normalizeNoteBackgroundColor(value: string): string | null {
  return normalizeHexColor(value);
}

export function applyNoteBackgroundColor(note: SchematicNote, value: string | null): NoteBackgroundColorResult {
  if (value === null) {
    if (note.backgroundColor === null && !noteFillStyle(note).fillEnabled) return { status: "unchanged", color: null };
    note.backgroundColor = null;
    delete note.backgroundEnabled;
    return { status: "changed", color: null };
  }
  const color = normalizeNoteBackgroundColor(value);
  if (!color) return { status: "invalid" };
  if (note.backgroundColor === color) return { status: "unchanged", color };
  note.backgroundColor = color;
  return { status: "changed", color };
}

export function applyNoteFillEnabled(note: SchematicNote, enabled: boolean) {
  if (typeof enabled !== "boolean") return { status: "invalid" };
  if (noteFillStyle(note).fillEnabled === enabled) return { status: "unchanged" };
  note.backgroundEnabled = enabled;
  return { status: "changed" };
}

export function applyNoteFillOpacity(note: SchematicNote, value: string | number) {
  const opacity = normalizeLibraryShapeFillOpacity(value);
  if (opacity === null) return { status: "invalid" };
  if (noteFillStyle(note).fillOpacity === opacity) return { status: "unchanged" };
  note.backgroundOpacity = opacity;
  return { status: "changed" };
}

export function normalizeNoteFontSizeInput(value: string): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(clamp(numeric, MIN_NOTE_FONT_SIZE_PX, MAX_NOTE_FONT_SIZE_PX));
}

export function createNoteFontSizeSnapshot(note: SchematicNote): NoteFontSizePropertySnapshot {
  return {
    noteId: note.id,
    fontSizePx: note.fontSizePx,
    width: note.width,
    height: note.height
  };
}

export function noteFontSizeSnapshotChanged(snapshot: NoteFontSizePropertySnapshot, note: SchematicNote) {
  return snapshot.fontSizePx !== note.fontSizePx || snapshot.width !== note.width || snapshot.height !== note.height;
}

export function applyNoteFontSize(note: SchematicNote, nextSize: number): NoteFontSizeInputResult {
  if (noteFontSizePx(note) === nextSize) return { status: "unchanged", nextSize };
  note.fontSizePx = nextSize;
  return { status: "changed", nextSize };
}

export function applyNoteTextColor(note: SchematicNote, value: string | null): NoteBackgroundColorResult {
  const color = value === null ? DEFAULT_NOTE_TEXT_COLOR : normalizeHexColor(value);
  if (!color) return { status: "invalid" };
  if (noteTextColor(note) === color) return { status: "unchanged", color };
  if (color === DEFAULT_NOTE_TEXT_COLOR) delete note.textColor;
  else note.textColor = color;
  return { status: "changed", color };
}
