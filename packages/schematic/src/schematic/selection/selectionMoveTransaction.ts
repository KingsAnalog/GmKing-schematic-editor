import { componentPinPoints, moveJunctionAppearancesWithPath } from "../document/documentGeometryModel";
import { pointKey, samePoint, snapPoint } from "../geometry";
import { junctionId, junctionPointFromId } from "../junctionIdentity";
import type { Point, SchematicDocument } from "../types";
import { clonePoints, normalizeWirePath, samePath } from "../wire/wireGeometry";
import { moveJunctionAppearances } from "../networkColorModel";
import { isLibraryShapeType } from "../libraryShapeStyleModel";
import { snapLibraryShapeCenterToVertices } from "../libraryShapeGeometry";
import {
  applySelectedJunctionMoveTopology,
  applyWireMoveTopology,
  captureSelectedJunctionMoveTopology,
  captureWireMoveTopology,
  type FrozenSelectedJunctionMoveTopology,
  type FrozenWireMoveTopology
} from "../wire/wireMoveTopology";

export type SelectionMoveBehavior = "stretch" | "moveOnly";

export interface SelectionMoveTransaction {
  activeComponentId: string | null;
  activeNoteId: string | null;
  activeWireId: string | null;
  startPointer: Point | null;
  currentPointer: Point | null;
  componentIds: string[];
  wireIds: string[];
  junctionIds: string[];
  noteIds: string[];
  netLabelIds: string[];
  startCenters: Map<string, Point>;
  currentPinPoints: Map<string, Map<string, Point>>;
  startWirePaths: Map<string, Point[]>;
  startJunctionPoints: Map<string, Point>;
  currentJunctionPoints: Map<string, Point>;
  startNotePositions: Map<string, Point>;
  startNetLabelAttachments: Map<string, { wireId: string; point: Point }>;
  selectedJunctionMoveTopology: FrozenSelectedJunctionMoveTopology;
  wireMoveTopology: FrozenWireMoveTopology;
}

export interface SelectionMoveTransactionResult {
  changed: boolean;
  movedComponentIds: Set<string>;
  updatedWireIds: Set<string>;
  movedNoteIds: Set<string>;
  movedNetLabelIds: Set<string>;
  transformedJunctionIds: string[];
}

interface BeginSelectionMoveTransactionInputBase {
  document: SchematicDocument;
  selectedIds: ReadonlySet<string>;
  selectedNoteIds?: ReadonlySet<string>;
}

type BeginSelectionMoveTransactionInput = BeginSelectionMoveTransactionInputBase & (
  | { activeComponentId: string; activeNoteId?: never; activeWireId?: never; pointer?: never }
  | { activeComponentId?: never; activeNoteId: string; activeWireId?: never; pointer?: never }
  | { activeComponentId?: never; activeNoteId?: never; activeWireId: string; pointer: Point }
);

interface ApplySelectionMoveTransactionInput {
  document: SchematicDocument;
  transaction: SelectionMoveTransaction;
  moveBehavior: SelectionMoveBehavior;
}

export function beginSelectionMoveTransaction(input: BeginSelectionMoveTransactionInput): SelectionMoveTransaction | null {
  const activeComponentId = input.activeComponentId ?? null;
  const activeNoteId = input.activeNoteId ?? null;
  const activeWireId = input.activeWireId ?? null;
  if (activeWireId && !input.document.wires.some(wire => wire.id === activeWireId)) return null;
  const activeInstance = activeComponentId
    ? input.document.components.find((component) => component.id === activeComponentId)
    : null;
  const activeNote = activeNoteId
    ? (input.document.notes ?? []).find((note) => note.id === activeNoteId)
    : null;
  if ((activeComponentId && !activeInstance) || (activeNoteId && !activeNote)) return null;

  const selectedComponentIds = input.document.components.filter((component) => input.selectedIds.has(component.id)).map((component) => component.id);
  const selectedNoteIds = (input.document.notes ?? [])
    .filter((note) => input.selectedNoteIds?.has(note.id))
    .map((note) => note.id);
  const activeIsInSelection = activeComponentId
    ? selectedComponentIds.includes(activeComponentId)
    : activeNoteId ? selectedNoteIds.includes(activeNoteId)
    : Boolean(activeWireId && input.selectedIds.has(activeWireId));
  const componentIds = activeIsInSelection
    ? selectedComponentIds
    : activeComponentId
      ? [activeComponentId]
      : [];
  const wireIds = activeIsInSelection ? input.document.wires.filter((wire) => input.selectedIds.has(wire.id)).map((wire) => wire.id) : activeWireId ? [activeWireId] : [];
  const startJunctionPoints = new Map<string, Point>();
  if (activeIsInSelection) {
    input.selectedIds.forEach((id) => {
      const point = junctionPointFromId(id);
      if (!point || !input.document.junctions.some((junction) => samePoint(junction, point))) return;
      startJunctionPoints.set(id, snapPoint(point));
    });
  }
  const junctionIds = Array.from(startJunctionPoints.keys());
  const noteIds = activeIsInSelection
    ? selectedNoteIds
    : activeNoteId
      ? [activeNoteId]
      : [];
  const selectedWireIdSet = new Set(wireIds);
  const netLabelIds = activeIsInSelection
    ? (input.document.netLabels ?? [])
        .filter((label) => input.selectedIds.has(label.id) || selectedWireIdSet.has(label.attachment.wireId))
        .map((label) => label.id)
    : [];

  const startCenters = new Map<string, Point>();
  const currentPinPoints = new Map<string, Map<string, Point>>();
  componentIds.forEach((componentId) => {
    const instance = input.document.components.find((component) => component.id === componentId);
    if (!instance) return;
    startCenters.set(componentId, { x: instance.x, y: instance.y });
    currentPinPoints.set(componentId, componentPinPoints(instance));
  });
  if (
    (activeComponentId && !startCenters.has(activeComponentId))
    || (activeNoteId && !(input.document.notes ?? []).some((note) => note.id === activeNoteId))
  ) {
    return null;
  }

  const startWirePaths = new Map<string, Point[]>();
  wireIds.forEach((wireId) => {
    const wire = input.document.wires.find((candidate) => candidate.id === wireId);
    if (wire) startWirePaths.set(wireId, clonePoints(wire.points));
  });

  const startNotePositions = new Map<string, Point>();
  noteIds.forEach((noteId) => {
    const note = (input.document.notes ?? []).find((candidate) => candidate.id === noteId);
    if (note) startNotePositions.set(noteId, { x: note.x, y: note.y });
  });
  const startNetLabelAttachments = new Map<string, { wireId: string; point: Point }>();
  netLabelIds.forEach((labelId) => {
    const label = (input.document.netLabels ?? []).find((candidate) => candidate.id === labelId);
    if (label) startNetLabelAttachments.set(labelId, {
      wireId: label.attachment.wireId,
      point: { ...label.attachment.point }
    });
  });

  const movingWireIds = new Set(wireIds);
  const wireMoveTopology = captureWireMoveTopology(input.document, new Set(componentIds), movingWireIds);
  const selectedJunctionMoveTopology = captureSelectedJunctionMoveTopology(input.document, startJunctionPoints, movingWireIds);

  return {
    activeComponentId,
    activeNoteId,
    activeWireId,
    startPointer: input.pointer ? { ...input.pointer } : null,
    currentPointer: input.pointer ? { ...input.pointer } : null,
    componentIds,
    wireIds,
    junctionIds,
    noteIds,
    netLabelIds,
    startCenters,
    currentPinPoints,
    startWirePaths,
    startJunctionPoints,
    currentJunctionPoints: clonePointMap(startJunctionPoints),
    startNotePositions,
    startNetLabelAttachments,
    selectedJunctionMoveTopology,
    wireMoveTopology
  };
}

export function applySelectionMoveTransaction(input: ApplySelectionMoveTransactionInput): SelectionMoveTransactionResult {
  const result = emptySelectionMoveTransactionResult();
  const componentsById = new Map(input.document.components.map((component) => [component.id, component]));
  const wiresById = input.moveBehavior === "stretch" || input.transaction.wireIds.length > 0
    ? new Map(input.document.wires.map((wire) => [wire.id, wire]))
    : null;
  const notesById = input.transaction.noteIds.length > 1
    ? new Map((input.document.notes ?? []).map((note) => [note.id, note]))
    : null;
  const labelsById = input.transaction.netLabelIds.length > 1
    ? new Map((input.document.netLabels ?? []).map((label) => [label.id, label]))
    : null;
  const activeInstance = input.transaction.activeComponentId
    ? componentsById.get(input.transaction.activeComponentId)
    : null;
  const activeNote = input.transaction.activeNoteId
    ? notesById?.get(input.transaction.activeNoteId)
      ?? (input.document.notes ?? []).find((note) => note.id === input.transaction.activeNoteId)
    : null;
  const activeStart = input.transaction.activeComponentId
    ? input.transaction.startCenters.get(input.transaction.activeComponentId)
    : input.transaction.activeNoteId
      ? input.transaction.startNotePositions.get(input.transaction.activeNoteId)
      : input.transaction.startPointer;
  const activePoint = activeInstance
    ? { x: activeInstance.x, y: activeInstance.y }
    : activeNote
      ? { x: activeNote.x, y: activeNote.y }
      : input.transaction.currentPointer;
  if (!activePoint || !activeStart) return result;

  const delta = snapPoint({ x: activePoint.x - activeStart.x, y: activePoint.y - activeStart.y });

  const previousPinPoints = new Map<string, Map<string, Point>>();
  const nextPinPoints = new Map<string, Map<string, Point>>();
  input.transaction.componentIds.forEach((componentId) => {
    const instance = componentsById.get(componentId);
    const start = input.transaction.startCenters.get(componentId);
    if (!instance || !start) return;

    if (componentId !== input.transaction.activeComponentId) {
      const center = { x: start.x + delta.x, y: start.y + delta.y };
      const next = isLibraryShapeType(instance.type)
        ? snapLibraryShapeCenterToVertices(instance, center)
        : snapPoint(center);
      if (!samePoint({ x: instance.x, y: instance.y }, next)) {
        instance.x = next.x;
        instance.y = next.y;
        result.movedComponentIds.add(componentId);
        result.changed = true;
      }
    }

    previousPinPoints.set(componentId, input.transaction.currentPinPoints.get(componentId) ?? componentPinPoints(instance));
    nextPinPoints.set(componentId, componentPinPoints(instance));
  });

  nextPinPoints.forEach((points, componentId) => input.transaction.currentPinPoints.set(componentId, points));

  const nextJunctionPoints = new Map(Array.from(input.transaction.startJunctionPoints, ([id, point]) => [
    id,
    snapPoint({ x: point.x + delta.x, y: point.y + delta.y })
  ]));
  if (input.moveBehavior === "stretch") {
    applySelectedJunctionMoveTopology(
      input.document,
      input.transaction.selectedJunctionMoveTopology,
      input.transaction.currentJunctionPoints,
      nextJunctionPoints,
      wiresById ?? undefined
    ).forEach((wireId) => {
      result.updatedWireIds.add(wireId);
      result.changed = true;
    });
  }
  const movedJunctionAppearanceKeys = moveSelectedJunctionAppearances(
    input.document,
    input.transaction.currentJunctionPoints,
    nextJunctionPoints
  );
  if (Array.from(nextJunctionPoints).some(([id, point]) => !samePoint(input.transaction.currentJunctionPoints.get(id) ?? point, point))) {
    result.changed = true;
  }
  input.transaction.currentJunctionPoints = clonePointMap(nextJunctionPoints);
  result.transformedJunctionIds = Array.from(nextJunctionPoints.values(), junctionId);

  input.transaction.wireIds.forEach((wireId) => {
    const wire = wiresById?.get(wireId) ?? input.document.wires.find((candidate) => candidate.id === wireId);
    const startPath = input.transaction.startWirePaths.get(wireId);
    if (!wire || !startPath) return;
    const nextPath = startPath.map((point) => snapPoint({ x: point.x + delta.x, y: point.y + delta.y }));
    if (samePath(wire.points, nextPath)) return;
    moveJunctionAppearancesWithPath(input.document, wire.points, nextPath, {
      excludeAppearanceKeys: movedJunctionAppearanceKeys
    });
    wire.points = normalizeWirePath(nextPath);
    result.updatedWireIds.add(wireId);
    result.changed = true;
  });

  if (input.moveBehavior === "stretch") {
    applyWireMoveTopology(input.document, input.transaction.wireMoveTopology, previousPinPoints, nextPinPoints, wiresById ?? undefined).forEach((wireId) => {
      result.updatedWireIds.add(wireId);
      result.changed = true;
    });
  }

  input.transaction.noteIds.forEach((noteId) => {
    const note = notesById?.get(noteId) ?? (input.document.notes ?? []).find((candidate) => candidate.id === noteId);
    const start = input.transaction.startNotePositions.get(noteId);
    if (!note || !start) return;
    const next = snapPoint({ x: start.x + delta.x, y: start.y + delta.y });
    if (samePoint({ x: note.x, y: note.y }, next)) return;
    note.x = next.x;
    note.y = next.y;
    result.movedNoteIds.add(noteId);
    result.changed = true;
  });

  input.transaction.netLabelIds.forEach((labelId) => {
    const label = labelsById?.get(labelId) ?? (input.document.netLabels ?? []).find((candidate) => candidate.id === labelId);
    const start = input.transaction.startNetLabelAttachments.get(labelId);
    if (!label || !start) return;
    const next = snapPoint({ x: start.point.x + delta.x, y: start.point.y + delta.y });
    if (samePoint(label.attachment.point, next)) return;
    label.attachment.point = next;
    result.movedNetLabelIds.add(labelId);
    result.changed = true;
  });

  return result;
}

function emptySelectionMoveTransactionResult(): SelectionMoveTransactionResult {
  return {
    changed: false,
    movedComponentIds: new Set(),
    updatedWireIds: new Set(),
    movedNoteIds: new Set(),
    movedNetLabelIds: new Set(),
    transformedJunctionIds: []
  };
}

function moveSelectedJunctionAppearances(
  document: SchematicDocument,
  previousPoints: ReadonlyMap<string, Point>,
  nextPoints: ReadonlyMap<string, Point>
) {
  const moves = new Map<string, Point>();
  const movedKeys = new Set<string>();
  previousPoints.forEach((point, id) => {
    const next = nextPoints.get(id);
    if (next && !samePoint(point, next)) {
      moves.set(pointKey(point), next);
      movedKeys.add(pointKey(next));
    }
  });
  if (moves.size === 0) return movedKeys;
  moveJunctionAppearances(
    document,
    (point) => moves.get(pointKey(point)) ?? point,
    (point) => moves.has(pointKey(point))
  );
  return movedKeys;
}

function clonePointMap(points: ReadonlyMap<string, Point>) {
  return new Map(Array.from(points, ([id, point]) => [id, { ...point }]));
}
