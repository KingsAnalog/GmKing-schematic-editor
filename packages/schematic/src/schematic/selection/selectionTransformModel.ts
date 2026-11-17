import { pointKey, rotatePoint, snapPoint } from "../geometry";
import { rotateNote, transformNote } from "../notes/noteGeometry";
import { reconcileConnectionEdit } from "../connectionGraph";
import { junctionId } from "../junctionIdentity";
import type { SchematicSelectionProjection } from "./selectionProjection";
import { componentVisualBounds, type Rect } from "../view-geometry";
import { clonePoints, normalizeWirePath, pointOnPath } from "../wire/wireGeometry";
import { moveJunctionAppearances } from "../networkColorModel";
import type { ComponentInstance, Point, SchematicDocument } from "../types";

export type GroupTransformKind = "rotate" | "mirror-x" | "mirror-y";

export interface SelectionDocumentTransformResult {
  changed: boolean;
  transformedJunctionIds: string[];
}

export function transformSelectionDocumentGeometry(input: {
  document: SchematicDocument;
  selection: SchematicSelectionProjection;
  kind: GroupTransformKind;
}): SelectionDocumentTransformResult {
  const { document, selection, kind } = input;
  const bounds = selection.transformBounds;
  if (!bounds) return { changed: false, transformedJunctionIds: [] };
  const before = structuredClone(document);

  const center = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  };
  const transformPoint = (point: Point) => transformSelectionPoint(point, center, kind);
  const transformedJunctionIds: string[] = [];
  const selectedWirePaths = selection.wires.map((wire) => clonePoints(wire.points));

  selection.components.forEach((instance) => {
    const previousCenter = rectCenter(componentVisualBounds(instance));
    const targetCenter = transformPoint(previousCenter);
    const next = transformPoint(instance);
    instance.x = next.x;
    instance.y = next.y;
    transformComponentOrientation(instance, kind);
    const currentCenter = rectCenter(componentVisualBounds(instance));
    const adjusted = snapPoint({
      x: instance.x + targetCenter.x - currentCenter.x,
      y: instance.y + targetCenter.y - currentCenter.y
    });
    instance.x = adjusted.x;
    instance.y = adjusted.y;
  });

  selection.wires.forEach((wire) => {
    wire.points = normalizeWirePath(wire.points.map(transformPoint));
  });

  const selectedWireIds = new Set(selection.wires.map((wire) => wire.id));
  document.netLabels.forEach((label) => {
    if (!selection.netLabels.some((candidate) => candidate.id === label.id) && !selectedWireIds.has(label.attachment.wireId)) return;
    label.attachment.point = transformPoint(label.attachment.point);
  });

  moveJunctionAppearances(
    document,
    transformPoint,
    (point) => selection.junctionKeys.has(pointKey(point)) || selectedWirePaths.some((path) => pointOnPath(point, path))
  );
  selection.junctionPoints.forEach((point) => {
    transformedJunctionIds.push(junctionId(transformPoint(point)));
  });

  selection.notes.forEach((note) => {
    if (selection.count === 1 && kind === "rotate") rotateNote(note);
    else transformNote(note, transformPoint, kind === "rotate");
  });

  reconcileConnectionEdit(document, before);
  return { changed: true, transformedJunctionIds };
}

export function transformSelectionPoint(point: Point, center: Point, kind: GroupTransformKind) {
  const local = { x: point.x - center.x, y: point.y - center.y };
  if (kind === "rotate") {
    const rotated = rotatePoint(local, 90);
    return snapPoint({ x: center.x + rotated.x, y: center.y + rotated.y });
  }
  if (kind === "mirror-x") {
    return snapPoint({ x: center.x - local.x, y: point.y });
  }
  return snapPoint({ x: point.x, y: center.y - local.y });
}

export function transformComponentOrientation(instance: ComponentInstance, kind: GroupTransformKind) {
  if (kind === "rotate") {
    instance.rotation = (instance.rotation + 90) % 360;
    return;
  }
  if (kind === "mirror-x") {
    instance.rotation = (360 - instance.rotation) % 360;
    instance.mirrored = !instance.mirrored;
    return;
  }
  instance.rotation = (540 - instance.rotation) % 360;
  instance.mirrored = !instance.mirrored;
}

export function transformSingleComponentOrientation(instance: ComponentInstance, kind: GroupTransformKind) {
  if (kind === "rotate") {
    instance.rotation = (instance.rotation + 90) % 360;
    return;
  }
  if (kind === "mirror-x") {
    instance.mirrored = !instance.mirrored;
    return;
  }
  instance.rotation = (360 - instance.rotation) % 360;
  instance.mirrored = !instance.mirrored;
}

function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}
