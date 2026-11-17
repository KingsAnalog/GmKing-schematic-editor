import type { Point, SchematicNote } from "../types";
import { noteHeightPx, noteWidthPx } from "./noteSizing";

export function noteRotation(note: SchematicNote) { return note.rotation ?? 0; }

export function rotateNote(note: SchematicNote) {
  const rotation = (noteRotation(note) + 90) % 360 as 0 | 90 | 180 | 270;
  if (rotation === 0) delete note.rotation;
  else note.rotation = rotation;
}

/** x/y is the text frame's anchor, also used as its rotation pivot. */
export function noteWorldBounds(note: SchematicNote) {
  const width = noteWidthPx(note), height = noteHeightPx(note);
  switch (noteRotation(note)) {
    case 90: return { x: note.x - height, y: note.y, width: height, height: width };
    case 180: return { x: note.x - width, y: note.y - height, width, height };
    case 270: return { x: note.x, y: note.y - width, width: height, height: width };
    default: return { x: note.x, y: note.y, width, height };
  }
}

export function noteCssTransform(note: SchematicNote, zoom: number) {
  return `scale(${zoom})${noteRotation(note) ? ` rotate(${noteRotation(note)}deg)` : ""}`;
}

/** Rotation moves the anchor and text together. Mirrors retain readable text. */
export function transformNote(note: SchematicNote, point: (point: Point) => Point, rotate: boolean) {
  if (rotate) {
    Object.assign(note, point(note));
    rotateNote(note);
  } else {
    const box = noteWorldBounds(note);
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    const next = point(center);
    note.x += next.x - center.x;
    note.y += next.y - center.y;
  }
}
