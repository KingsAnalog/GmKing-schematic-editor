import { pointKey, samePoint, snapPoint } from "../geometry";
import { junctionPointFromId } from "../junctionIdentity";
import type { SchematicSelectionState } from "./selectionModel";
import type { SchematicSelectionContents, SchematicSelectionSummarySelectionItem } from "./selectionSummary";
import { componentVisualBounds, noteVisualBounds, unionRects, wireVisualBounds, type Rect } from "../view-geometry";
import type { ComponentInstance, InductorCoupling, NetLabel, Point, SchematicDocument, SchematicNote, Wire } from "../types";

export interface SchematicSelectionProjection {
  components: ComponentInstance[];
  inductorCouplings: InductorCoupling[];
  relatedInductorCouplings: InductorCoupling[];
  wires: Wire[];
  junctionPoints: Point[];
  junctionKeys: Set<string>;
  netLabels: NetLabel[];
  notes: SchematicNote[];
  count: number;
  transformBounds: Rect | null;
  summaryContents: SchematicSelectionContents;
}

export function projectSchematicSelection(document: SchematicDocument, selection: SchematicSelectionState): SchematicSelectionProjection {
  const components = document.components.filter((component) => selection.selectedIds.has(component.id));
  const inductorCouplings = (document.inductorCouplings ?? [])
    .filter((coupling) => selection.selectedIds.has(coupling.id));
  const selectedComponentIds = new Set(components.map((component) => component.id));
  const relatedInductorCouplings = (document.inductorCouplings ?? [])
    .filter((coupling) =>
      selection.selectedIds.has(coupling.id)
      || (
        selectedComponentIds.has(coupling.inductorAId)
        && selectedComponentIds.has(coupling.inductorBId)
      )
    );
  const wires = document.wires.filter((wire) => selection.selectedIds.has(wire.id));
  const junctionPoints = selectedVisibleJunctionPoints(document, selection);
  const junctionKeys = new Set(junctionPoints.map((point) => pointKey(snapPoint(point))));
  const netLabels = document.netLabels.filter((label) => selection.selectedIds.has(label.id));
  const notes = document.notes.filter((note) => selection.selectedNoteIds.has(note.id));
  const count = components.length
    + inductorCouplings.length
    + wires.length
    + junctionPoints.length
    + netLabels.length
    + notes.length;
  return {
    components,
    inductorCouplings,
    relatedInductorCouplings,
    wires,
    junctionPoints,
    junctionKeys,
    netLabels,
    notes,
    count,
    transformBounds: selectionTransformBounds({ components, wires, junctionPoints, netLabels, notes }),
    summaryContents: selectionSummaryContents(document, selection)
  };
}

export function selectedVisibleJunctionPoints(document: SchematicDocument, selection: SchematicSelectionState) {
  return Array.from(selection.selectedIds)
    .map((id) => junctionPointFromId(id))
    .filter((point): point is Point => !!point && document.junctions.some((junction) => samePoint(junction, point)));
}

export function selectionSummaryContents(document: SchematicDocument, selection: SchematicSelectionState): SchematicSelectionContents {
  const items = Array.from(selection.selectedIds).map((id): SchematicSelectionSummarySelectionItem => {
    const component = document.components.find((candidate) => candidate.id === id);
    if (component) return { kind: "component", component };
    const coupling = (document.inductorCouplings ?? []).find((candidate) => candidate.id === id);
    if (coupling) {
      const first = document.components.find((component) => component.id === coupling.inductorAId);
      const second = document.components.find((component) => component.id === coupling.inductorBId);
      return {
        kind: "inductor-coupling",
        coupling: {
          firstRef: first?.ref ?? coupling.inductorAId,
          secondRef: second?.ref ?? coupling.inductorBId
        }
      };
    }
    const wire = document.wires.find((candidate) => candidate.id === id);
    if (wire) return { kind: "wire", wire };
    const junction = junctionPointFromId(id);
    if (junction) return { kind: "junction", point: junction };
    const netLabel = document.netLabels.find((candidate) => candidate.id === id);
    if (netLabel) return { kind: "net-label", label: netLabel };
    return { kind: "unknown", id };
  });
  const notes = document.notes.filter((note) => selection.selectedNoteIds.has(note.id));
  return { items, notes };
}

export function selectionTransformBounds(input: Pick<SchematicSelectionProjection, "components" | "wires" | "junctionPoints" | "netLabels" | "notes">) {
  const rects: Rect[] = [];
  input.components.forEach((component) => rects.push(componentVisualBounds(component)));
  input.wires.forEach((wire) => rects.push(wireVisualBounds(wire)));
  input.junctionPoints.forEach((point) => rects.push({ x: point.x, y: point.y, width: 0, height: 0 }));
  input.netLabels.forEach((label) => rects.push({
    x: label.attachment.point.x,
    y: label.attachment.point.y,
    width: 0,
    height: 0
  }));
  input.notes.forEach((note) => rects.push(noteVisualBounds(note)));
  return unionRects(rects);
}

export function selectionPlacementAnchor(selection: SchematicSelectionProjection, pickupPoint?: Point): Point | null {
  const bounds = selection.transformBounds;
  if (!bounds) return null;
  if (selection.count === 1) {
    const item = selection.components[0] ?? selection.notes[0];
    if (item) return snapPoint(item);
  }
  return snapPoint(pickupPoint ?? { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
}

export function singleEditableSelectedNetLabel(document: SchematicDocument, selection: SchematicSelectionState) {
  if (selection.selectedIds.size !== 1 || selection.selectedNoteIds.size !== 0) return null;
  const id = selection.selectedIds.values().next().value;
  return typeof id === "string" ? document.netLabels.find((label) => label.id === id) ?? null : null;
}

export function singleEditableSelectedComponent(document: SchematicDocument, selection: SchematicSelectionState) {
  if (selection.selectedIds.size !== 1 || selection.selectedNoteIds.size !== 0) return null;
  const id = selection.selectedIds.values().next().value;
  return typeof id === "string" ? document.components.find((component) => component.id === id) ?? null : null;
}

export function singleEditableSelectedNote(document: SchematicDocument, selection: SchematicSelectionState) {
  if (selection.selectedNoteIds.size !== 1 || selection.selectedIds.size !== 0) return null;
  const id = selection.selectedNoteIds.values().next().value;
  return typeof id === "string" ? document.notes.find((note) => note.id === id) ?? null : null;
}

export function remapSelectedJunctionIds(selectedIds: Iterable<string>, nextJunctionIds: Iterable<string>) {
  return [...Array.from(selectedIds).filter((id) => !junctionPointFromId(id)), ...nextJunctionIds];
}
