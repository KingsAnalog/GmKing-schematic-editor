import type { Point, SchematicNote, SchematicNoteAnchor } from "../types";
import { noteHeightPx, noteWidthPx } from "./noteSizing";
import { rotatePoint } from "../geometry";

export const DEFAULT_NOTE_ANCHOR: SchematicNoteAnchor = "lowerLeft";

export function noteAnchorOffset(note: SchematicNote) {
  const anchor = note.anchor ?? DEFAULT_NOTE_ANCHOR;
  const width = noteWidthPx(note);
  const height = noteHeightPx(note);
  return {
    x: anchor.endsWith("Left") ? 0 : anchor.endsWith("Right") ? width : width / 2,
    y: anchor.startsWith("upper") ? 0 : anchor.startsWith("lower") ? height : height / 2
  };
}

export function noteRotation(note: SchematicNote) { return note.rotation ?? 0; }

export function rotateNote(note: SchematicNote) {
  const rotation = (noteRotation(note) + 90) % 360 as 0 | 90 | 180 | 270;
  if (rotation === 0) delete note.rotation;
  else note.rotation = rotation;
}

/** x/y is the text frame's anchor, also used as its rotation pivot. */
export function noteWorldBounds(note: SchematicNote) {
  const width = noteWidthPx(note), height = noteHeightPx(note);
  const offset = noteAnchorOffset(note);
  const corners = [
    { x: -offset.x, y: -offset.y }, { x: width - offset.x, y: -offset.y },
    { x: -offset.x, y: height - offset.y }, { x: width - offset.x, y: height - offset.y }
  ].map(point => rotatePoint(point, noteRotation(note)));
  const xs = corners.map(point => point.x), ys = corners.map(point => point.y);
  return { x: note.x + Math.min(...xs), y: note.y + Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

export function noteCssTransform(note: SchematicNote, zoom: number) {
  const { x, y } = noteAnchorOffset(note);
  return `scale(${zoom}) rotate(${noteRotation(note)}deg) translate(${-x}px, ${-y}px)`;
}

/** Rotation moves the anchor and text together. Mirrors retain readable text. */
export function transformNote(note: SchematicNote, point: (point: Point) => Point, rotate: boolean) {
  Object.assign(note, point(note));
  if (rotate) rotateNote(note);
}
