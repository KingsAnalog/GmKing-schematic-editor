import { GRID_SIZE, SYMBOL_GRID_SIZE } from "../types";
import type { SchematicNote } from "../types";
import { clamp } from "../uiUtils";

export type NoteSize = { width: number; height: number };

export const DEFAULT_MARKDOWN_NOTE_WIDTH = SYMBOL_GRID_SIZE * 16;
export const MIN_MARKDOWN_NOTE_WIDTH = SYMBOL_GRID_SIZE * 8;
export const MAX_MARKDOWN_NOTE_WIDTH = SYMBOL_GRID_SIZE * 40;
export const MIN_MARKDOWN_NOTE_HEIGHT = SYMBOL_GRID_SIZE;
export const DEFAULT_NOTE_BACKGROUND_COLOR = "#ffffe8";
export const DEFAULT_NOTE_BACKGROUND_OPACITY = 0.88;
export const DEFAULT_NOTE_FONT_SIZE_PX = 14;
export const MIN_NOTE_FONT_SIZE_PX = 1;
export const MAX_NOTE_FONT_SIZE_PX = 200;
export const NOTE_BORDER_WIDTH = 1;
export const NOTE_HORIZONTAL_PADDING = 4;
export const NOTE_VERTICAL_PADDING = 0;
export const NOTE_LINE_HEIGHT = 1.25;
export const PLAIN_NOTE_LINE_HEIGHT = 1;
// Plain notes fit their text on the current fine grid, with a one-cell minimum.
export const MIN_NOTE_WIDTH = GRID_SIZE;
export const MIN_NOTE_HEIGHT = GRID_SIZE;

export function markdownNoteHeightFromMeasuredContent(contentHeight: number) {
  const outerHeight = contentHeight + NOTE_VERTICAL_PADDING * 2 + NOTE_BORDER_WIDTH * 2;
  return Math.max(MIN_MARKDOWN_NOTE_HEIGHT, Math.ceil(outerHeight / SYMBOL_GRID_SIZE) * SYMBOL_GRID_SIZE);
}

export function noteSizeFromMeasuredContent(measured: NoteSize, fontSizePx: number): NoteSize {
  const outerWidth = measured.width + NOTE_HORIZONTAL_PADDING * 2 + NOTE_BORDER_WIDTH * 2;
  // With a compact 1em line box, descenders can extend below the last line.
  // A 0.1em allowance still fits a 9px single line within the 10px grid.
  // Selection outlines sit outside this frame and consume no height.
  const outerHeight = measured.height + fontSizePx * 0.1;
  return {
    width: Math.max(MIN_NOTE_WIDTH, Math.ceil(outerWidth / GRID_SIZE) * GRID_SIZE),
    height: Math.max(MIN_NOTE_HEIGHT, Math.ceil(outerHeight / GRID_SIZE) * GRID_SIZE)
  };
}

export function textForNoteMeasurement(text: string) {
  if (text.length === 0) return " ";
  return text.endsWith("\n") ? `${text} ` : text;
}

export function noteFontSizePx(note: SchematicNote) {
  return clamp(note.fontSizePx ?? DEFAULT_NOTE_FONT_SIZE_PX, MIN_NOTE_FONT_SIZE_PX, MAX_NOTE_FONT_SIZE_PX);
}

export function normalizeMarkdownNoteWidth(value: number) {
  const finiteValue = Number.isFinite(value) ? value : DEFAULT_MARKDOWN_NOTE_WIDTH;
  const snapped = Math.round(finiteValue / SYMBOL_GRID_SIZE) * SYMBOL_GRID_SIZE;
  return clamp(snapped, MIN_MARKDOWN_NOTE_WIDTH, MAX_MARKDOWN_NOTE_WIDTH);
}

export function noteWidthPx(note: SchematicNote) {
  return note.format === "markdown"
    ? normalizeMarkdownNoteWidth(note.width)
    : Math.max(MIN_NOTE_WIDTH, note.width);
}

export function noteHeightPx(note: SchematicNote) {
  const minimum = note.format === "markdown" ? MIN_MARKDOWN_NOTE_HEIGHT : MIN_NOTE_HEIGHT;
  return Math.max(minimum, note.height ?? minimum);
}
