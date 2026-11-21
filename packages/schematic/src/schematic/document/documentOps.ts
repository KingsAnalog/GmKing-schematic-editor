import { applyCopyPlacementToDocument, type CopySource } from "../copyModel";
import {
  assignRestoredSchematicDocument,
  createEmptySchematicDocument,
  isEmptySchematicDocument,
  restoreSchematicDocument
} from "./documentModel";
import { samePoint } from "../geometry";
import { createPlainSchematicNote } from "../notes/noteModel";
import {
  applyNoteFormat,
  noteFontSizeSnapshotChanged,
  noteWidthSnapshotChanged,
  type NoteFontSizePropertySnapshot,
  type NoteWidthPropertySnapshot
} from "../notes/noteProperties";
import { applyPlacementCommitToDocument, type PlacementCommit } from "../placementModel";
import {
  DELETE_SELECTION_EMPTY_STATUS,
  TEMPORARY_DELETE_SELECTION_EMPTY_STATUS,
  TEMPORARY_DELETE_UNSUPPORTED_STATUS,
  deleteSchematicSelection,
  deleteSelectionStatus,
  temporaryDeletableSchematicIds,
  temporaryDeleteToggleStatus,
  toggleTemporaryDeletedByIds
} from "../selection/selectionDeleteModel";
import type { SchematicSelectionProjection } from "../selection/selectionProjection";
import {
  applySelectionMoveTransaction,
  type SelectionMoveBehavior,
  type SelectionMoveTransaction,
  type SelectionMoveTransactionResult
} from "../selection/selectionMoveTransaction";
import { transformComponentOrientation, transformSelectionDocumentGeometry, type GroupTransformKind } from "../selection/selectionTransformModel";
import type { ComponentInstance, NetLabel, Point, SchematicDocument, SchematicNote, SchematicNoteFormat, WireAppearance, WireRouteMode } from "../types";
import { applyWireCommitToDocument } from "../wire/wireCreationModel";

export type SchematicDocumentHistoryIntent = "push" | "none";

export interface SchematicDocumentOpResult {
  changed: boolean;
  historyIntent: SchematicDocumentHistoryIntent;
  selectedIds: string[];
  noteIds: string[];
  status: string;
}

export interface ResetSchematicDocumentResult extends SchematicDocumentOpResult {
  document: SchematicDocument;
}

export interface PlacementDocumentOpResult extends SchematicDocumentOpResult {
  appendedComponentCount: number;
  appendedWireCount: number;
}

export interface DeleteSchematicDocumentSelectionResult extends SchematicDocumentOpResult {
  removedCount: number;
}

export interface TemporaryDeleteSchematicDocumentResult extends SchematicDocumentOpResult {
  toggledIds: string[];
  unsupportedIds: string[];
  recovered: boolean;
}

export interface CopyPlacementDocumentOpResult extends SchematicDocumentOpResult {
  count: number;
  placed: boolean;
}

export interface WireCommitDocumentOpResult extends SchematicDocumentOpResult {
  committed: boolean;
  wireId: string | null;
}

export interface SingleComponentTransformDocumentOpResult extends SchematicDocumentOpResult {
  transformedCount: number;
}

export interface SelectionTransformDocumentOpResult extends SchematicDocumentOpResult {
  transformedJunctionIds: string[];
  transformedCount: number;
}

export interface SelectionMoveApplyDocumentOpResult extends SchematicDocumentOpResult, SelectionMoveTransactionResult {
  historyIntent: "none";
  affectedGraphIds: string[];
  affectedNoteIds: string[];
  affectedIds: string[];
}

export interface SelectionMoveCommitDocumentOpInput {
  geometryChanged: boolean;
  selectionMoveChanged: boolean;
  liveGeometryDirty: boolean;
  activeComponentId?: string | null;
  affectedGraphIds?: Iterable<string>;
  affectedNoteIds?: Iterable<string>;
}

export interface SelectionMoveCommitDocumentOpResult extends SchematicDocumentOpResult {
  affectedGraphIds: string[];
  affectedNoteIds: string[];
  affectedIds: string[];
}

export interface RestoreSchematicDocumentResult extends SchematicDocumentOpResult {
  document: SchematicDocument;
}

export type NoteFontSizeCommitDocumentOpResult = SchematicDocumentOpResult;
export type NoteWidthCommitDocumentOpResult = SchematicDocumentOpResult;

export interface NoteEditCommitSnapshot {
  noteId: string;
  text: string;
  width: number;
  height?: number;
  fontSizePx?: number;
}

export const RESET_SCHEMATIC_DOCUMENT_STATUS = "Schematic reset to defaults.";
export const CREATE_PLAIN_SCHEMATIC_NOTE_STATUS = "Note created. Type to edit; Esc or focus outside finishes editing.";
export const SELECTION_MOVE_APPLY_STATUS = "Selection move updated.";
export const SELECTION_MOVE_COMMIT_STATUS = "Object moved. Netlist and junctions refreshed.";

export function resetSchematicDocument(document: SchematicDocument): ResetSchematicDocumentResult {
  const empty = createEmptySchematicDocument();
  const changed = !isEmptySchematicDocument(document);
  if (changed) {
    assignRestoredSchematicDocument(document, empty);
  }
  return { ...documentOpResult(changed, RESET_SCHEMATIC_DOCUMENT_STATUS), document };
}

export function applyPlacementCommitDocumentOp(document: SchematicDocument, commit: PlacementCommit): PlacementDocumentOpResult {
  const appendedComponentCount = commit.fragment.components.length;
  const appendedWireCount = commit.fragment.wires.length;
  const changed = appendedComponentCount + appendedWireCount > 0;
  if (changed) {
    applyPlacementCommitToDocument(document, commit);
  }
  return {
    ...documentOpResult(changed, commit.status, [...commit.selectedIds]),
    appendedComponentCount,
    appendedWireCount
  };
}

export function applyCopyPlacementDocumentOp(document: SchematicDocument, copied: CopySource): CopyPlacementDocumentOpResult {
  const placement = applyCopyPlacementToDocument(document, copied);
  return {
    ...documentOpResult(placement.placed, placement.status, placement.ids, placement.noteIds),
    count: placement.count,
    placed: placement.placed
  };
}

export function createPlainSchematicNoteDocumentOp(
  document: SchematicDocument,
  id: string,
  anchor: Point,
  layerId?: string
): SchematicDocumentOpResult {
  const note = createPlainSchematicNote(id, anchor);
  if (layerId !== undefined) note.layerId = layerId;
  document.notes.push(note);
  return documentOpResult(true, CREATE_PLAIN_SCHEMATIC_NOTE_STATUS, [], [id]);
}

export function applyNetLabelPlacementDocumentOp(
  document: SchematicDocument,
  label: NetLabel
): SchematicDocumentOpResult {
  document.netLabels = [...(document.netLabels ?? []), label];
  return documentOpResult(
    true,
    `Placed label ${label.name}. Click another wire to place the same label; Esc cancels.`
  );
}

export function moveSchematicNoteDocumentOp(note: SchematicNote, nextPoint: Point): SchematicDocumentOpResult {
  const changed = !samePoint({ x: note.x, y: note.y }, nextPoint);
  if (changed) {
    note.x = nextPoint.x;
    note.y = nextPoint.y;
  }
  return documentOpResult(changed, changed ? "Note moved." : "", [], changed ? [note.id] : []);
}

export function applyWireCommitDocumentOp(
  document: SchematicDocument,
  points: Point[],
  appearance: WireAppearance,
  createId: () => string,
  routeMode?: WireRouteMode,
  layerId?: string
): WireCommitDocumentOpResult {
  const commit = applyWireCommitToDocument(document, points, appearance, createId, routeMode, layerId);
  if (commit.kind !== "committed") {
    return {
      ...documentOpResult(false, "No wire committed."),
      committed: false,
      wireId: null
    };
  }
  return {
    ...documentOpResult(true, commit.status),
    committed: true,
    wireId: commit.wireId
  };
}

export function transformSingleComponentOrientationDocumentOp(
  instances: readonly ComponentInstance[],
  kind: GroupTransformKind
): SingleComponentTransformDocumentOpResult {
  instances.forEach((instance) => {
    transformComponentOrientation(instance, kind);
  });
  const transformedCount = instances.length;
  const changed = transformedCount > 0;
  return {
    ...documentOpResult(changed, singleComponentTransformStatus(kind, transformedCount), instances.map((instance) => instance.id)),
    transformedCount
  };
}

export function transformSelectionDocumentGeometryOp(
  document: SchematicDocument,
  selection: SchematicSelectionProjection,
  kind: GroupTransformKind
): SelectionTransformDocumentOpResult {
  const result = transformSelectionDocumentGeometry({ document, selection, kind });
  return {
    ...documentOpResult(
      result.changed,
      result.changed ? selectionTransformStatus(kind, selection.count) : "Select at least one transformable object."
    ),
    // Selection remapping stays with the editor until the M3 selection model lands.
    transformedJunctionIds: result.transformedJunctionIds,
    transformedCount: result.changed ? selection.count : 0
  };
}

export function applySelectionMoveDocumentOp(
  document: SchematicDocument,
  transaction: SelectionMoveTransaction,
  moveBehavior: SelectionMoveBehavior
): SelectionMoveApplyDocumentOpResult {
  const result = applySelectionMoveTransaction({ document, transaction, moveBehavior });
  const movedComponentIds = Array.from(result.movedComponentIds);
  const updatedWireIds = Array.from(result.updatedWireIds);
  const movedNoteIds = Array.from(result.movedNoteIds);
  const movedNetLabelIds = Array.from(result.movedNetLabelIds);
  const affectedGraphIds = result.changed
    ? uniqueIds([
        ...(transaction.activeComponentId ? [transaction.activeComponentId] : []),
        ...movedComponentIds,
        ...updatedWireIds,
        ...movedNetLabelIds,
        ...result.transformedJunctionIds
      ])
    : [];
  const affectedNoteIds = result.changed
    ? uniqueIds([...(transaction.activeNoteId ? [transaction.activeNoteId] : []), ...movedNoteIds])
    : [];
  return {
    ...result,
    ...documentOpResult(result.changed, result.changed ? SELECTION_MOVE_APPLY_STATUS : "", [], [], "none"),
    historyIntent: "none",
    affectedGraphIds,
    affectedNoteIds,
    affectedIds: uniqueIds([...affectedGraphIds, ...affectedNoteIds])
  };
}

export function commitSelectionMoveDocumentOp(input: SelectionMoveCommitDocumentOpInput): SelectionMoveCommitDocumentOpResult {
  const changed = input.geometryChanged || input.selectionMoveChanged || input.liveGeometryDirty;
  const affectedGraphIds = changed
    ? uniqueIds([...(input.activeComponentId ? [input.activeComponentId] : []), ...(input.affectedGraphIds ?? [])])
    : [];
  const affectedNoteIds = changed ? uniqueIds(input.affectedNoteIds ?? []) : [];
  return {
    ...documentOpResult(changed, changed ? SELECTION_MOVE_COMMIT_STATUS : ""),
    affectedGraphIds,
    affectedNoteIds,
    affectedIds: uniqueIds([...affectedGraphIds, ...affectedNoteIds])
  };
}

export function commitNoteFontSizeDocumentOp(
  snapshot: NoteFontSizePropertySnapshot,
  note: SchematicNote
): NoteFontSizeCommitDocumentOpResult {
  const changed = noteFontSizeSnapshotChanged(snapshot, note);
  return documentOpResult(changed, changed ? "Note font size updated." : "");
}

export function commitNoteWidthDocumentOp(
  snapshot: NoteWidthPropertySnapshot,
  note: SchematicNote
): NoteWidthCommitDocumentOpResult {
  const changed = noteWidthSnapshotChanged(snapshot, note);
  return documentOpResult(changed, changed ? "Note width updated." : "");
}

export function setNoteFormatDocumentOp(note: SchematicNote, format: SchematicNoteFormat): SchematicDocumentOpResult {
  const changed = applyNoteFormat(note, format);
  return documentOpResult(changed, changed ? `Note format changed to ${format}.` : "", [], changed ? [note.id] : []);
}

export function commitNoteEditDocumentOp(
  snapshot: NoteEditCommitSnapshot | null,
  note: SchematicNote
): SchematicDocumentOpResult {
  const changed =
    !snapshot ||
    snapshot.noteId !== note.id ||
    snapshot.text !== note.text ||
    snapshot.width !== note.width ||
    snapshot.height !== note.height ||
    ("fontSizePx" in snapshot && snapshot.fontSizePx !== note.fontSizePx);
  return documentOpResult(changed, changed ? "Note updated." : "");
}

export function restoreSchematicDocumentOp(document: SchematicDocument, source: SchematicDocument): RestoreSchematicDocumentResult {
  assignRestoredSchematicDocument(document, restoreSchematicDocument(source));
  return { ...documentOpResult(true, "Schematic restored.", [], [], "none"), document };
}

export function deleteSchematicDocumentSelection(
  document: SchematicDocument,
  selection: SchematicSelectionProjection
): DeleteSchematicDocumentSelectionResult {
  const previousCollections = {
    components: document.components,
    wires: document.wires,
    netLabels: document.netLabels,
    notes: document.notes
  };
  const result = deleteSchematicSelection(document, selection);
  const changed = result.removedCount > 0;
  if (!changed) {
    document.components = previousCollections.components;
    document.wires = previousCollections.wires;
    document.netLabels = previousCollections.netLabels;
    document.notes = previousCollections.notes;
  }
  return {
    ...documentOpResult(changed, changed ? deleteSelectionStatus(result.removedCount) : DELETE_SELECTION_EMPTY_STATUS),
    removedCount: result.removedCount
  };
}

export function toggleTemporaryDeletedSchematicIds(
  document: SchematicDocument,
  ids: Iterable<string>
): TemporaryDeleteSchematicDocumentResult {
  const requestedIds = Array.from(new Set(ids));
  if (requestedIds.length === 0) {
    return {
      ...documentOpResult(false, TEMPORARY_DELETE_SELECTION_EMPTY_STATUS),
      toggledIds: [],
      unsupportedIds: [],
      recovered: false
    };
  }
  const supportedIds = temporaryDeletableSchematicIds(document, requestedIds);
  const supportedSet = new Set(supportedIds);
  const unsupportedIds = requestedIds.filter((id) => !supportedSet.has(id));
  const result = toggleTemporaryDeletedByIds(document, supportedIds);
  const changed = result.ids.length > 0;
  return {
    ...documentOpResult(
      changed,
      changed ? temporaryDeleteToggleStatus(result) : TEMPORARY_DELETE_UNSUPPORTED_STATUS,
      result.ids
    ),
    toggledIds: result.ids,
    unsupportedIds,
    recovered: result.recovered
  };
}

function singleComponentTransformStatus(kind: GroupTransformKind, count: number) {
  const verb = kind === "rotate" ? "Rotated" : "Mirrored";
  return `${verb} ${count} component${count === 1 ? "" : "s"}.`;
}

function selectionTransformStatus(kind: GroupTransformKind, count: number) {
  const verb = kind === "rotate" ? "Rotated" : "Mirrored";
  return `${verb} ${count} selected object${count === 1 ? "" : "s"}.`;
}

function uniqueIds(ids: Iterable<string>) {
  return Array.from(new Set(ids));
}

function documentOpResult(
  changed: boolean,
  status: string,
  selectedIds: string[] = [],
  noteIds: string[] = [],
  historyIntent: SchematicDocumentHistoryIntent = changed ? "push" : "none"
): SchematicDocumentOpResult {
  return { changed, historyIntent, selectedIds, noteIds, status };
}
