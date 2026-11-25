import { normalizeHexColor } from "../../shared/color";
import { DEFAULT_LIBRARY_SHAPE_STYLE, normalizeLibraryShapeFillOpacity } from "../libraryShapeStyleModel";
import type { SchematicNote } from "../types";

export const DEFAULT_NOTE_TEXT_COLOR = "#111111";

export function noteBackgroundColor(note: SchematicNote): string | null {
  return normalizeHexColor(note.backgroundColor);
}

export function noteBackgroundCss(note: SchematicNote) {
  const fill = noteFillStyle(note);
  if (!fill.fillEnabled) return "transparent";
  if (fill.fillOpacity === 1) return fill.fillColor;
  const rgb = [1, 3, 5].map(start => Number.parseInt(fill.fillColor.slice(start, start + 2), 16));
  return `rgb(${rgb.join(" ")} / ${fill.fillOpacity})`;
}

export function noteFillStyle(note: SchematicNote) {
  const color = noteBackgroundColor(note);
  return {
    fillEnabled: note.backgroundEnabled ?? (color !== null),
    fillColor: color ?? DEFAULT_LIBRARY_SHAPE_STYLE.fillColor,
    fillOpacity: normalizeLibraryShapeFillOpacity(note.backgroundOpacity) ?? DEFAULT_LIBRARY_SHAPE_STYLE.fillOpacity
  };
}

export function noteTextColor(note: SchematicNote) {
  return normalizeHexColor(note.textColor) ?? DEFAULT_NOTE_TEXT_COLOR;
}
