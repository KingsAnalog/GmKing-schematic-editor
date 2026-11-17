import { buildCopySource, type CopySource } from "../copyModel";
import { presentationJunctions } from "../connectivity";
import { pointKey, samePoint, snapPoint } from "../geometry";
import { junctionId, junctionPointFromId } from "../junctionIdentity";
import type { SchematicSelectionExportInput } from "./selectionExport";
import type { NetLabelStatus } from "../netResolution";
import type { SchematicSelectionProjection } from "./selectionProjection";
import type { InductorCoupling, JunctionAppearance, Point, SchematicDocument } from "../types";
import type { Rect } from "../view-geometry";
import type { SymbolTemplateId } from "../symbolTemplateModel";

export type SelectionCopyExportProjection = Pick<
  SchematicSelectionProjection,
  "components" | "wires" | "junctionPoints" | "junctionKeys" | "netLabels" | "notes"
> & Partial<Pick<
  SchematicSelectionProjection,
  "inductorCouplings" | "relatedInductorCouplings"
>>;

export type TargetCopySourceProjection = {
  ids: string[];
  noteIds: string[];
  source: CopySource;
};

export function buildSelectionExportInput(
  selection: SelectionCopyExportProjection,
  presentationMode: boolean,
  netLabelStatuses: Readonly<Record<string, NetLabelStatus>> = {},
  junctionColors: Readonly<Record<string, string>> = {},
  connections?: SchematicDocument["connections"],
  symbolTemplate?: SymbolTemplateId
): SchematicSelectionExportInput {
  return {
    symbolTemplate,
    components: selection.components,
    inductorCouplings: selection.relatedInductorCouplings ?? [],
    wires: selection.wires,
    ...(connections ? { connections } : {}),
    netLabels: selection.netLabels,
    netLabelStatuses,
    junctionPoints: selection.junctionPoints,
    junctionColors,
    notes: selection.notes,
    presentationMode
  };
}

export function selectedExportJunctionPoints(
  document: SchematicDocument,
  selectedIds: ReadonlySet<string>,
  presentationMode: boolean
) {
  const visibleJunctions = presentationMode ? presentationJunctions(document) : document.junctions;
  return visibleJunctions.filter((point) => selectedIds.has(junctionId(point)));
}

export function buildSelectionCopySource(
  selection: SelectionCopyExportProjection,
  junctionAppearances: JunctionAppearance[],
  inductorCouplings: InductorCoupling[] = [],
  connections: SchematicDocument["connections"],
  symbolTemplate?: SymbolTemplateId
): CopySource {
  return buildCopySource({
    symbolTemplate,
    components: selection.components,
    wires: selection.wires,
    netLabels: selection.netLabels,
    notes: selection.notes,
    junctionPoints: selection.junctionPoints,
    junctionKeys: selection.junctionKeys,
    junctionAppearances,
    inductorCouplings,
    connections
  });
}

export function buildTargetCopySource(document: SchematicDocument, ids: string[], noteIds: string[]): TargetCopySourceProjection {
  const uniqueIds = Array.from(new Set(ids));
  const uniqueNoteIds = Array.from(new Set(noteIds));
  const components = document.components.filter((component) => uniqueIds.includes(component.id));
  const wires = document.wires.filter((wire) => uniqueIds.includes(wire.id));
  const netLabels = document.netLabels.filter((label) => uniqueIds.includes(label.id));
  const junctionPoints = uniqueIds
    .map((id) => junctionPointFromId(id))
    .filter((point): point is Point => !!point && document.junctions.some((junction) => samePoint(junction, point)));
  const junctionKeys = new Set(junctionPoints.map((point) => pointKey(snapPoint(point))));
  const notes = document.notes.filter((note) => uniqueNoteIds.includes(note.id));
  const source = buildCopySource({
    symbolTemplate: document.symbolTemplate,
    components,
    wires,
    netLabels,
    notes,
    junctionPoints,
    junctionKeys,
    connections: document.connections,
    junctionAppearances: document.junctionAppearances,
    inductorCouplings: document.inductorCouplings
  });
  return { ids: uniqueIds, noteIds: uniqueNoteIds, source };
}

export function copyAnchorFromBounds(bounds: Rect, lastPointerPoint: Point | null | undefined): Point {
  if (lastPointerPoint && pointInRect(lastPointerPoint, bounds)) return snapPoint(lastPointerPoint);
  return snapPoint({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
}

function pointInRect(point: Point, rect: Rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}
