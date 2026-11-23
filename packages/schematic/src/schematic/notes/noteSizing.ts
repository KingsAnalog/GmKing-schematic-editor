import { GRID_SIZE } from "../types";
import type { SchematicNote } from "../types";
import { clamp } from "../uiUtils";

export type NoteSize = { width: number; height: number };
export interface NoteGraphic extends NoteSize {
  markup: string;
}

export const DEFAULT_NOTE_FONT_SIZE_PX = 14;
export const MIN_NOTE_FONT_SIZE_PX = 1;
export const MAX_NOTE_FONT_SIZE_PX = 200;
export const NOTE_BORDER_WIDTH = 1;
export const NOTE_HORIZONTAL_PADDING = 4;
// Plain notes fit their text on the current fine grid, with a one-cell minimum.
export const MIN_NOTE_WIDTH = GRID_SIZE;
export const MIN_NOTE_HEIGHT = GRID_SIZE;

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

export function noteFontSizePx(note: SchematicNote) {
  return clamp(note.fontSizePx ?? DEFAULT_NOTE_FONT_SIZE_PX, MIN_NOTE_FONT_SIZE_PX, MAX_NOTE_FONT_SIZE_PX);
}

export function noteWidthPx(note: SchematicNote) {
  return Math.max(MIN_NOTE_WIDTH, note.width);
}

export function noteHeightPx(note: SchematicNote) {
  return Math.max(MIN_NOTE_HEIGHT, note.height ?? MIN_NOTE_HEIGHT);
}
