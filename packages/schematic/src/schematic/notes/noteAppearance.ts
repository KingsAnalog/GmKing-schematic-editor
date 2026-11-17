import { normalizeHexColor } from "../../shared/color";
import { DEFAULT_NOTE_BACKGROUND_COLOR } from "./noteSizing";
import type { SchematicNote } from "../types";

export const DEFAULT_NOTE_TEXT_COLOR = "#111111";

export function noteBackgroundColor(note: SchematicNote): string | null {
  if (note.backgroundColor === null) return null;
  return normalizeHexColor(note.backgroundColor)
    ?? (note.format === "markdown" ? DEFAULT_NOTE_BACKGROUND_COLOR : null);
}

export function noteBackgroundCss(note: SchematicNote) {
  const color = noteBackgroundColor(note);
  // Markdown's existing default opacity and hover appearance are supplied by CSS.
  return color === null ? "transparent" : note.backgroundColor === undefined ? "" : color;
}

export function noteTextColor(note: SchematicNote) {
  return normalizeHexColor(note.textColor) ?? DEFAULT_NOTE_TEXT_COLOR;
}
