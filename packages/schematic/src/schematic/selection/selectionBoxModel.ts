import { snapPoint, wireSegments } from "../geometry";
import { inductorCouplingGeometry } from "../inductorCouplingGeometry";
import { mergeMixedSelection, setMixedSelection, type SchematicSelectionState } from "./selectionModel";
import type { ToolMode } from "../toolState";
import { componentVisualBounds, netLabelVisualBounds, noteVisualBounds, type Rect } from "../view-geometry";
import type { Point, SchematicDocument } from "../types";

export const SELECTION_BOX_TINY_THRESHOLD = 8;

export interface SelectionBoxGeometry {
  rect: Rect;
  containOnly: boolean;
  tiny: boolean;
}

export interface SelectionBoxHitResult extends SelectionBoxGeometry {
  ids: string[];
  noteIds: string[];
}

export interface FinishedSelectionBoxProjectionInput {
  selectionBox: SelectionBoxHitResult;
  mode: ToolMode;
  additive: boolean;
  hasActiveAnalysisPick: boolean;
  selectionState: SchematicSelectionState;
}

export type FinishedSelectionBoxIntent =
  | { kind: "noop" }
  | { kind: "clear-selection" }
  | { kind: "delete-targets"; ids: string[]; noteIds: string[] }
  | { kind: "replace-selection"; selection: SchematicSelectionState }
  | { kind: "merge-selection"; selection: SchematicSelectionState };

export function buildSelectionBoxGeometry(start: Point, end: Point): SelectionBoxGeometry {
  const rect = normalizeSelectionBoxRect(start, end);
  return {
    rect,
    containOnly: end.x < start.x && end.y < start.y,
    tiny: rect.width < SELECTION_BOX_TINY_THRESHOLD && rect.height < SELECTION_BOX_TINY_THRESHOLD
  };
}

export function collectSelectionBoxHits(
  document: SchematicDocument,
  start: Point,
  end: Point,
  visibleJunctions: readonly Point[] = document.junctions
): SelectionBoxHitResult {
  const geometry = buildSelectionBoxGeometry(start, end);
  if (geometry.tiny) return { ...geometry, ids: [], noteIds: [] };

  const ids: string[] = [];
  document.components.forEach((component) => {
    const box = componentVisualBounds(component);
    const hit = geometry.containOnly ? rectContainsRect(geometry.rect, box) : rectsIntersect(geometry.rect, box);
    if (hit) ids.push(component.id);
  });

  (document.inductorCouplings ?? []).forEach((coupling) => {
    const visual = inductorCouplingGeometry(document, coupling);
    // Match the renderer: a hidden arc/core or an unavailable winding has no cell.
    if (!visual?.hitPath) return;
    const hit = geometry.containOnly
      ? rectContainsRect(geometry.rect, visual.bounds)
      : rectsIntersect(geometry.rect, visual.bounds);
    if (hit) ids.push(coupling.id);
  });

  document.wires.forEach((wire) => {
    const hit = wireSegments(wire).some((segment) =>
      geometry.containOnly
        ? segmentContainedInRect(segment.start, segment.end, geometry.rect)
        : segmentIntersectsRect(segment.start, segment.end, geometry.rect)
    );
    if (hit) ids.push(wire.id);
  });

  visibleJunctions.forEach((junction) => {
    if (pointInRect(junction, geometry.rect)) ids.push(junctionSelectionId(junction));
  });

  document.netLabels.forEach((label) => {
    const box = netLabelVisualBounds(label);
    const hit = geometry.containOnly ? rectContainsRect(geometry.rect, box) : rectsIntersect(geometry.rect, box);
    if (hit) ids.push(label.id);
  });

  const noteIds = document.notes
    .filter((note) => {
      const box = noteVisualBounds(note);
      return geometry.containOnly ? rectContainsRect(geometry.rect, box) : rectsIntersect(geometry.rect, box);
    })
    .map((note) => note.id);

  return { ...geometry, ids, noteIds };
}

export function projectFinishedSelectionBox(input: FinishedSelectionBoxProjectionInput): FinishedSelectionBoxIntent {
  const { selectionBox } = input;
  if (selectionBox.tiny) {
    return !input.hasActiveAnalysisPick && input.mode === "select" ? { kind: "clear-selection" } : { kind: "noop" };
  }

  const { ids, noteIds } = selectionBox;
  if (input.mode === "delete" || input.mode === "temp-delete") {
    return { kind: "delete-targets", ids, noteIds };
  }

  if (input.additive) {
    return { kind: "merge-selection", selection: mergeMixedSelection(input.selectionState, ids, noteIds) };
  }

  return { kind: "replace-selection", selection: setMixedSelection(ids, noteIds) };
}

function normalizeSelectionBoxRect(start: Point, end: Point): Rect {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return { x, y, width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y) };
}

function pointInRect(point: Point, rect: Rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

function rectsIntersect(a: Rect, b: Rect) {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y;
}

function rectContainsRect(a: Rect, b: Rect) {
  return b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height;
}

function segmentIntersectsRect(start: Point, end: Point, rect: Rect) {
  if (pointInRect(start, rect) || pointInRect(end, rect)) return true;
  const segmentBox = {
    x: Math.min(start.x, end.x),
    y: Math.min(start.y, end.y),
    width: Math.abs(start.x - end.x),
    height: Math.abs(start.y - end.y)
  };
  return rectsIntersect(rect, segmentBox);
}

function segmentContainedInRect(start: Point, end: Point, rect: Rect) {
  return pointInRect(start, rect) && pointInRect(end, rect);
}

function junctionSelectionId(point: Point) {
  const snapped = snapPoint(point);
  return `junction-${snapped.x}-${snapped.y}`;
}
