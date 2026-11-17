import { pointKey } from "../geometry";
import { disconnectJunction, syncConnectionVertices } from "../connectionGraph";
import { removeInductorCouplingsForIds } from "../inductorCouplingModel";
import type { SchematicSelectionProjection } from "./selectionProjection";
import type { ComponentInstance, SchematicDocument, Wire } from "../types";

export interface DeleteSchematicSelectionResult {
  removedCount: number;
}

export interface TemporaryDeleteToggleResult {
  ids: string[];
  recovered: boolean;
}

export type SchematicDeleteMode = "delete" | "temp-delete";

export interface SchematicDeleteTargetProjection {
  ids: string[];
  noteIds: string[];
}

export const DELETE_SELECTION_EMPTY_STATUS = "Select objects before deleting.";
export const DELETE_TARGET_EMPTY_STATUS = "Delete mode: click an object or drag a box around objects to delete.";
export const TEMPORARY_DELETE_TARGET_EMPTY_STATUS =
  "Temporary Delete mode: click a component or wire, or drag a box around components and wires.";
export const TEMPORARY_DELETE_SELECTION_EMPTY_STATUS = "Select objects before temporary delete.";
export const TEMPORARY_DELETE_UNSUPPORTED_STATUS =
  "Temporary delete applies to components and wires. Use Delete to remove junctions, labels, or notes.";

export function deleteSelectionStatus(removedCount: number) {
  return `Deleted ${removedCount} object${removedCount === 1 ? "" : "s"}.`;
}

export function temporaryDeleteToggleStatus(result: TemporaryDeleteToggleResult) {
  return `${result.recovered ? "Recovered" : "Temporarily deleted"} ${result.ids.length} object${result.ids.length === 1 ? "" : "s"}.`;
}

export function projectSchematicDeleteTargets(
  document: SchematicDocument,
  mode: SchematicDeleteMode,
  ids: Iterable<string>,
  noteIds: Iterable<string> = []
): SchematicDeleteTargetProjection {
  if (mode === "temp-delete") {
    return {
      ids: temporaryDeletableSchematicIds(document, ids),
      noteIds: []
    };
  }

  return {
    ids: Array.from(new Set(ids)),
    noteIds: Array.from(new Set(noteIds))
  };
}

export function deleteSchematicSelection(document: SchematicDocument, selection: SchematicSelectionProjection): DeleteSchematicSelectionResult {
  if (selection.count === 0) return { removedCount: 0 };
  const selectedComponentIds = new Set(selection.components.map((component) => component.id));
  const selectedCouplingIds = new Set(selection.inductorCouplings.map((coupling) => coupling.id));
  const selectedWireIds = new Set(selection.wires.map((wire) => wire.id));
  const selectedNoteIds = new Set(selection.notes.map((note) => note.id));
  const selectedLabelIds = new Set(selection.netLabels.map((label) => label.id));

  if (!selection.junctionPoints.length
    && !document.components.some(item => selectedComponentIds.has(item.id))
    && !document.wires.some(item => selectedWireIds.has(item.id))
    && !document.notes.some(item => selectedNoteIds.has(item.id))
    && !document.netLabels.some(item => selectedLabelIds.has(item.id))
    && !document.inductorCouplings?.some(item => selectedCouplingIds.has(item.id))) return { removedCount: 0 };

  selection.junctionPoints.forEach((point) => {
    disconnectJunction(document, point);
    document.junctionAppearances = document.junctionAppearances.filter(appearance => pointKey(appearance.point) !== pointKey(point));
  });

  const beforeComponents = document.components.length;
  const beforeWires = document.wires.length;
  const beforeNotes = document.notes.length;
  const beforeLabels = document.netLabels.length;
  const beforeCouplings = document.inductorCouplings?.length ?? 0;

  document.components = document.components.filter((component) => !selectedComponentIds.has(component.id));
  removeInductorCouplingsForIds(document, selectedComponentIds);
  if (selectedCouplingIds.size > 0) {
    document.inductorCouplings = (document.inductorCouplings ?? [])
      .filter((coupling) => !selectedCouplingIds.has(coupling.id));
    if (document.inductorCouplings.length === 0) delete document.inductorCouplings;
  }
  document.wires = document.wires.filter((wire) => !selectedWireIds.has(wire.id));
  document.netLabels = document.netLabels.filter(
    (label) => !selectedLabelIds.has(label.id) && !selectedWireIds.has(label.attachment.wireId)
  );
  document.notes = document.notes.filter((note) => !selectedNoteIds.has(note.id));
  syncConnectionVertices(document);

  return {
    removedCount:
      beforeComponents -
      document.components.length +
      beforeWires -
      document.wires.length +
      beforeNotes -
      document.notes.length +
      beforeLabels -
      document.netLabels.length +
      beforeCouplings -
      (document.inductorCouplings?.length ?? 0) +
      selection.junctionPoints.length
  };
}

export function temporaryDeletableSchematicIds(document: SchematicDocument, ids: Iterable<string>) {
  const components = new Set(document.components.map((component) => component.id));
  const wires = new Set(document.wires.map((wire) => wire.id));
  return Array.from(new Set(ids)).filter((id) => components.has(id) || wires.has(id));
}

export function toggleTemporaryDeletedByIds(document: SchematicDocument, ids: Iterable<string>): TemporaryDeleteToggleResult {
  const selectedIds = new Set(temporaryDeletableSchematicIds(document, ids));
  const selectedComponents = document.components.filter((component) => selectedIds.has(component.id));
  const selectedWires = document.wires.filter((wire) => selectedIds.has(wire.id));
  const selectedObjects: Array<ComponentInstance | Wire> = [...selectedComponents, ...selectedWires];
  if (selectedObjects.length === 0) return { ids: [], recovered: false };

  const recovered = selectedObjects.every((object) => object.temporarilyDeleted);
  selectedObjects.forEach((object) => {
    object.temporarilyDeleted = !recovered;
  });

  return { ids: selectedObjects.map((object) => object.id), recovered };
}
