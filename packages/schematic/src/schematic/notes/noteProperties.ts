import { DEFAULT_NOTE_TEXT_COLOR, noteTextColor } from "./noteAppearance";
import {
  MAX_MARKDOWN_NOTE_WIDTH,
  MAX_NOTE_FONT_SIZE_PX,
  MIN_MARKDOWN_NOTE_WIDTH,
  MIN_NOTE_FONT_SIZE_PX,
  normalizeMarkdownNoteWidth,
  noteFontSizePx,
  noteWidthPx
} from "./noteSizing";
import type { SchematicNote, SchematicNoteFormat } from "../types";
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

export interface NoteWidthPropertySnapshot {
  noteId: string;
  width: number;
  height?: number;
}

export function normalizeNoteBackgroundColor(value: string): string | null {
  return normalizeHexColor(value);
}

export function applyNoteBackgroundColor(note: SchematicNote, value: string | null): NoteBackgroundColorResult {
  if (value === null) {
    if (note.backgroundColor === null) return { status: "unchanged", color: null };
    note.backgroundColor = null;
    return { status: "changed", color: null };
  }
  const color = normalizeNoteBackgroundColor(value);
  if (!color) return { status: "invalid" };
  if (note.backgroundColor === color) return { status: "unchanged", color };
  note.backgroundColor = color;
  return { status: "changed", color };
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

export function normalizeNoteWidthInput(value: string): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return normalizeMarkdownNoteWidth(numeric);
}

export function applyNoteWidth(note: SchematicNote, nextWidth: number): NoteFontSizeInputResult {
  const normalized = normalizeMarkdownNoteWidth(nextWidth);
  if (noteWidthPx(note) === normalized) return { status: "unchanged", nextSize: normalized };
  note.width = normalized;
  return { status: "changed", nextSize: normalized };
}

export function createNoteWidthSnapshot(note: SchematicNote): NoteWidthPropertySnapshot {
  return { noteId: note.id, width: note.width, height: note.height };
}

export function noteWidthSnapshotChanged(snapshot: NoteWidthPropertySnapshot, note: SchematicNote) {
  return snapshot.width !== note.width || snapshot.height !== note.height;
}

export function applyNoteFormat(note: SchematicNote, format: SchematicNoteFormat) {
  if (note.format === format) return false;
  note.format = format;
  if (format === "markdown") {
    note.width = note.width < MIN_MARKDOWN_NOTE_WIDTH ? 320 : normalizeMarkdownNoteWidth(note.width);
  }
  return true;
}

export const NOTE_WIDTH_INPUT_MIN = MIN_MARKDOWN_NOTE_WIDTH;
export const NOTE_WIDTH_INPUT_MAX = MAX_MARKDOWN_NOTE_WIDTH;

export function applyNoteTextColor(note: SchematicNote, value: string | null): NoteBackgroundColorResult {
  const color = value === null ? DEFAULT_NOTE_TEXT_COLOR : normalizeHexColor(value);
  if (!color) return { status: "invalid" };
  if (noteTextColor(note) === color) return { status: "unchanged", color };
  if (color === DEFAULT_NOTE_TEXT_COLOR) delete note.textColor;
  else note.textColor = color;
  return { status: "changed", color };
}
