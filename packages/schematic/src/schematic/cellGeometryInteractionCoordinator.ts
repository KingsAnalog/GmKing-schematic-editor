import { applyComponentCellGeometry, applyWireCellGeometry } from "./cellGeometryModel";
import { componentPinPoints } from "./document/documentGeometryModel";
import { cloneSchematicDocument } from "./document/documentModel";
import { reconcileDocumentConnectionEdit } from "./document/documentWires";
import {
  applySelectionMoveDocumentOp,
  commitSelectionMoveDocumentOp,
  type SelectionMoveApplyDocumentOpResult,
  type SelectionMoveCommitDocumentOpResult
} from "./document/documentOps";
import type { SchematicGraphAdapter } from "./graphAdapter";
import {
  SchematicIncrementalRenderCoordinator,
  type SchematicIncrementalRenderCell
} from "./incrementalRenderCoordinator";
import { netLabelPosition, remapNetLabelsAfterWirePathChange, remapNetLabelsFromWireMoveSnapshot, snapshotNetLabelWires } from "./netLabelModel";
import {
  beginSelectionMoveTransaction,
  type SelectionMoveBehavior,
  type SelectionMoveTransaction
} from "./selection/selectionMoveTransaction";
import type { Point, SchematicDocument } from "./types";
import { projectWireSegmentMove, syncWireSegmentMoveTopology, type WireSegmentMoveTransaction } from "./wire/wireSegmentMoveModel";
import { componentCellPosition, componentCenterFromCellPosition } from "./view-geometry";

export interface SchematicCellGeometryInteractionCell extends SchematicIncrementalRenderCell {
  readonly id: string | number;
  position(): Point;
  position(x: number, y: number): unknown;
  source(): unknown;
  source(point: Point): unknown;
  target(): unknown;
  target(point: Point): unknown;
  vertices(): unknown;
  vertices(points: Point[]): unknown;
}

export interface CellGeometryInteractionBeginInput {
  activeComponentId: string;
  selectedIds: ReadonlySet<string>;
  selectedNoteIds?: ReadonlySet<string>;
}

export interface NoteGeometryInteractionBeginInput {
  activeNoteId: string;
  selectedIds: ReadonlySet<string>;
  selectedNoteIds: ReadonlySet<string>;
}

export interface WireSelectionInteractionBeginInput {
  activeWireId: string;
  pointer: Point;
  selectedIds: ReadonlySet<string>;
  selectedNoteIds: ReadonlySet<string>;
}

export interface CellGeometryInteractionLiveResult {
  geometryChanged: boolean;
  selectionMove: SelectionMoveApplyDocumentOpResult | null;
  changedLabelIds: Set<string>;
  requestJunctionRefresh: boolean;
}

export interface CellGeometryInteractionFinalizeResult {
  commit: SelectionMoveCommitDocumentOpResult;
  selectionMove: SelectionMoveApplyDocumentOpResult | null;
  changedLabelIds: Set<string>;
}

export interface CellGeometryInteractionCancelResult {
  restoredJunctionIds: string[];
}

export interface SchematicCellGeometryInteractionCoordinatorOptions<
  Cell extends SchematicCellGeometryInteractionCell = SchematicCellGeometryInteractionCell
> {
  document: SchematicDocument;
  graphAdapter: SchematicGraphAdapter<Cell>;
  incrementalRenderer: SchematicIncrementalRenderCoordinator<Cell>;
}

export class SchematicCellGeometryInteractionCoordinator<
  Cell extends SchematicCellGeometryInteractionCell = SchematicCellGeometryInteractionCell
> {
  private readonly affectedGraphIds = new Set<string>();
  private readonly affectedNoteIds = new Set<string>();
  private readonly snappingCellIds = new Set<string>();
  private selectionMove: SelectionMoveTransaction | null = null;
  private liveGeometryDirty = false;
  private documentGeneration = 0;
  private activeInteractionGeneration: number | null = null;
  private activeGraphId: string | null = null;
  private activeNoteId: string | null = null;
  private interactionDocumentSnapshot: SchematicDocument | null = null;

  constructor(private readonly options: SchematicCellGeometryInteractionCoordinatorOptions<Cell>) {}

  beginComponentMove(input: CellGeometryInteractionBeginInput) {
    this.clearInteractionState();
    this.selectionMove = beginSelectionMoveTransaction({
      document: this.options.document,
      activeComponentId: input.activeComponentId,
      selectedIds: input.selectedIds,
      selectedNoteIds: input.selectedNoteIds
    });
    if (this.selectionMove) {
      this.activeInteractionGeneration = this.documentGeneration;
      this.activeGraphId = input.activeComponentId;
      this.interactionDocumentSnapshot = cloneSchematicDocument(this.options.document);
    }
    return this.selectionMove !== null;
  }

  beginNoteMove(input: NoteGeometryInteractionBeginInput) {
    this.clearInteractionState();
    this.selectionMove = beginSelectionMoveTransaction({
      document: this.options.document,
      activeNoteId: input.activeNoteId,
      selectedIds: input.selectedIds,
      selectedNoteIds: input.selectedNoteIds
    });
    if (this.selectionMove) {
      this.activeInteractionGeneration = this.documentGeneration;
      this.activeNoteId = input.activeNoteId;
      this.interactionDocumentSnapshot = cloneSchematicDocument(this.options.document);
    }
    return this.selectionMove !== null;
  }

  beginWireMove(wireId: string) {
    this.clearInteractionState();
    const wire = this.options.document.wires.find((candidate) => candidate.id === wireId);
    const cell = this.options.graphAdapter.getCell(wireId);
    if (!wire || !cell || stringCellValue(cell, "wireId") !== wireId) return false;
    this.activeInteractionGeneration = this.documentGeneration;
    this.activeGraphId = wireId;
    this.interactionDocumentSnapshot = cloneSchematicDocument(this.options.document);
    return true;
  }

  beginWireSelectionMove(input: WireSelectionInteractionBeginInput) {
    if (!this.beginWireMove(input.activeWireId)) return false;
    this.selectionMove = beginSelectionMoveTransaction({ document: this.options.document, ...input });
    return this.selectionMove !== null;
  }

  syncWireSegmentMove(transaction: WireSegmentMoveTransaction, pointer: Point): CellGeometryInteractionLiveResult | null {
    if (this.activeInteractionGeneration !== this.documentGeneration
      || this.activeGraphId !== transaction.activeWireId || this.selectionMove) return null;
    const previousLabels = snapshotLabelAttachments(this.options.document);
    const paths = projectWireSegmentMove(transaction, pointer);
    const updatedWireIds = syncWireSegmentMoveTopology(this.options.document, transaction, paths);
    if (this.interactionDocumentSnapshot) {
      remapNetLabelsFromWireMoveSnapshot(this.options.document, this.interactionDocumentSnapshot);
    }
    const changedLabelIds = changedLabelAttachmentIds(this.options.document, previousLabels);
    // The document is already updated. Project every affected wire under the guard,
    // and record the edit here instead of depending on graph change callbacks.
    this.options.incrementalRenderer.updateWireCellsFromDocument(updatedWireIds);
    this.projectLabelCells(changedLabelIds);
    const geometryChanged = updatedWireIds.size > 0;
    if (geometryChanged) {
      this.liveGeometryDirty = true;
      updatedWireIds.forEach(id => this.affectedGraphIds.add(id));
      this.recordAffectedIds(transaction.activeWireId, null, changedLabelIds);
    }
    return { geometryChanged, selectionMove: null, changedLabelIds, requestJunctionRefresh: geometryChanged };
  }

  syncWireSelectionMove(wireId: string, pointer: Point, moveBehavior: SelectionMoveBehavior): CellGeometryInteractionLiveResult | null {
    if (this.activeInteractionGeneration !== this.documentGeneration
      || this.activeGraphId !== wireId || this.selectionMove?.activeWireId !== wireId) return null;
    this.selectionMove.currentPointer = { ...pointer };
    const result = this.syncSelectionDocumentAndGraph(moveBehavior);
    const requestJunctionRefresh = Boolean(result.selectionMove?.changed);
    if (requestJunctionRefresh) {
      this.liveGeometryDirty = true;
      this.recordAffectedIds(wireId, result.selectionMove, result.changedLabelIds);
    }
    return { ...result, geometryChanged: false, requestJunctionRefresh };
  }

  cancelActiveInteraction() {
    const snapshot = this.interactionDocumentSnapshot;
    if (this.activeInteractionGeneration === null || !snapshot) return null;
    const restoredJunctionIds = [...(this.selectionMove?.junctionIds ?? [])];
    this.documentGeneration += 1;
    this.clearInteractionState();
    this.snappingCellIds.clear();
    assignInteractionSnapshot(this.options.document, snapshot);
    return { restoredJunctionIds };
  }

  invalidateAgainstDocument() {
    this.documentGeneration += 1;
    this.clearInteractionState();
    this.snappingCellIds.clear();
  }

  syncLive(cell: Cell | null | undefined, moveBehavior: SelectionMoveBehavior): CellGeometryInteractionLiveResult | null {
    if (
      !cell
      || this.options.incrementalRenderer.isApplyingDocumentGeometry
      || !this.isCurrentGraphInteractionCell(cell)
      || graphId(cell) !== this.activeGraphId
      || this.activeInteractionGeneration !== this.documentGeneration
      || cell.get("preview")
      || cell.get("junction")
      || cell.get("netLabelId")
    ) {
      return null;
    }

    const result = this.syncDocumentAndGraph(cell, moveBehavior);
    const requestJunctionRefresh = result.geometryChanged || Boolean(result.selectionMove?.changed);
    if (requestJunctionRefresh) {
      this.liveGeometryDirty = true;
      this.recordAffectedIds(graphId(cell), result.selectionMove, result.changedLabelIds);
    }
    return { ...result, requestJunctionRefresh };
  }

  finalize(cell: Cell | null | undefined, moveBehavior: SelectionMoveBehavior): CellGeometryInteractionFinalizeResult | null {
    if (
      !cell
      || this.options.incrementalRenderer.isApplyingDocumentGeometry
      || !this.isCurrentGraphInteractionCell(cell)
      || graphId(cell) !== this.activeGraphId
      || cell.get("preview")
      || cell.get("junction")
      || cell.get("netLabelId")
    ) {
      return null;
    }
    if (this.activeInteractionGeneration !== this.documentGeneration) return null;

    const result = this.syncDocumentAndGraph(cell, moveBehavior);
    const activeComponentId = stringCellValue(cell, "componentId");
    this.recordAffectedIds(graphId(cell), result.selectionMove, result.changedLabelIds);
    const commit = commitSelectionMoveDocumentOp({
      geometryChanged: result.geometryChanged,
      selectionMoveChanged: result.selectionMove?.changed ?? false,
      liveGeometryDirty: this.liveGeometryDirty,
      activeComponentId,
      affectedGraphIds: this.affectedGraphIds,
      affectedNoteIds: this.affectedNoteIds
    });
    if (commit.changed && this.interactionDocumentSnapshot) {
      reconcileDocumentConnectionEdit(this.options.document, this.interactionDocumentSnapshot);
    }
    this.clearInteractionState();
    return { commit, selectionMove: result.selectionMove, changedLabelIds: result.changedLabelIds };
  }

  syncNoteMove(
    activeNoteId: string,
    changedNoteIds: readonly string[],
    moveBehavior: SelectionMoveBehavior
  ): CellGeometryInteractionLiveResult | null {
    if (!this.isCurrentNoteInteraction(activeNoteId)) return null;
    const result = this.syncSelectionDocumentAndGraph(moveBehavior);
    const geometryChanged = changedNoteIds.length > 0;
    const requestJunctionRefresh = Boolean(result.selectionMove?.changed);
    if (geometryChanged || requestJunctionRefresh) {
      this.liveGeometryDirty = true;
      this.recordAffectedIds(null, result.selectionMove, result.changedLabelIds);
      changedNoteIds.forEach((noteId) => this.affectedNoteIds.add(noteId));
    }
    return { ...result, geometryChanged, requestJunctionRefresh };
  }

  finalizeNoteMove(
    changedNoteIds: readonly string[],
    moveBehavior: SelectionMoveBehavior
  ): CellGeometryInteractionFinalizeResult | null {
    const activeNoteId = this.activeNoteId;
    if (!activeNoteId) return null;
    if (!this.isCurrentNoteInteraction(activeNoteId)) return null;
    const result = this.syncSelectionDocumentAndGraph(moveBehavior);
    this.recordAffectedIds(null, result.selectionMove, result.changedLabelIds);
    changedNoteIds.forEach((noteId) => this.affectedNoteIds.add(noteId));
    const commit = commitSelectionMoveDocumentOp({
      geometryChanged: changedNoteIds.length > 0,
      selectionMoveChanged: result.selectionMove?.changed ?? false,
      liveGeometryDirty: this.liveGeometryDirty,
      affectedGraphIds: this.affectedGraphIds,
      affectedNoteIds: this.affectedNoteIds
    });
    if (commit.changed && this.interactionDocumentSnapshot) {
      reconcileDocumentConnectionEdit(this.options.document, this.interactionDocumentSnapshot);
    }
    this.clearInteractionState();
    return { commit, selectionMove: result.selectionMove, changedLabelIds: result.changedLabelIds };
  }

  private syncDocumentAndGraph(
    cell: Cell,
    moveBehavior: SelectionMoveBehavior
  ): Omit<CellGeometryInteractionLiveResult, "requestJunctionRefresh"> {
    if (this.selectionMove?.activeWireId && this.selectionMove.activeWireId === stringCellValue(cell, "wireId")) {
      return { geometryChanged: false, ...this.syncSelectionDocumentAndGraph(moveBehavior) };
    }
    const previousWires = snapshotNetLabelWires(this.options.document);
    const previousLabels = snapshotLabelAttachments(this.options.document);
    this.snapComponentCell(cell);
    const geometryChanged = this.syncCellGeometry(cell, moveBehavior);
    const selectionMove = this.syncSelectionMove(cell, moveBehavior);
    remapNetLabelsAfterWirePathChange(this.options.document, previousWires);
    const changedLabelIds = changedLabelAttachmentIds(this.options.document, previousLabels);
    this.projectLabelCells(changedLabelIds);
    return { geometryChanged, selectionMove, changedLabelIds };
  }

  private syncSelectionDocumentAndGraph(
    moveBehavior: SelectionMoveBehavior
  ): Omit<CellGeometryInteractionLiveResult, "geometryChanged" | "requestJunctionRefresh"> {
    const previousWires = snapshotNetLabelWires(this.options.document);
    const previousLabels = snapshotLabelAttachments(this.options.document);
    const selectionMove = this.selectionMove
      ? applySelectionMoveDocumentOp(this.options.document, this.selectionMove, moveBehavior)
      : null;
    remapNetLabelsAfterWirePathChange(this.options.document, previousWires);
    const changedLabelIds = changedLabelAttachmentIds(this.options.document, previousLabels);
    if (selectionMove?.changed) this.projectSelectionMoveGraphCells(selectionMove);
    this.projectLabelCells(changedLabelIds);
    return { selectionMove, changedLabelIds };
  }

  private syncCellGeometry(cell: Cell, moveBehavior: SelectionMoveBehavior) {
    const componentChanged = this.syncComponentGeometry(cell, moveBehavior);
    const wireChanged = this.syncWireGeometry(cell);
    return componentChanged || wireChanged;
  }

  private syncComponentGeometry(cell: Cell, moveBehavior: SelectionMoveBehavior) {
    const componentId = stringCellValue(cell, "componentId");
    if (!componentId) return false;
    const instance = this.options.document.components.find((component) => component.id === componentId);
    if (!instance) return false;

    const isSelectionMoveActive = this.selectionMove?.activeComponentId === componentId;
    const result = applyComponentCellGeometry({
      document: this.options.document,
      componentId,
      nextCenter: componentCenterFromCellPosition(instance, cell.position()),
      oldPinPoints: clonePinPoints(this.selectionMove?.currentPinPoints.get(componentId)) ?? componentPinPoints(instance),
      moveBehavior: isSelectionMoveActive ? "moveOnly" : moveBehavior,
      excludedWireIds: isSelectionMoveActive ? new Set(this.selectionMove?.wireIds ?? []) : undefined
    });
    if (result.changed) {
      this.options.incrementalRenderer.updateWireCellsFromDocument(result.updatedWireIds);
    }
    return result.changed;
  }

  private syncWireGeometry(cell: Cell) {
    const wireId = stringCellValue(cell, "wireId");
    if (!wireId || !this.options.document.wires.some((wire) => wire.id === wireId)) return false;
    const vertices = cell.vertices();
    return applyWireCellGeometry({
      document: this.options.document,
      wireId,
      points: [cell.source(), ...(Array.isArray(vertices) ? vertices : []), cell.target()]
    }).changed;
  }

  private syncSelectionMove(cell: Cell, moveBehavior: SelectionMoveBehavior) {
    const activeComponentId = stringCellValue(cell, "componentId");
    if (!this.selectionMove || activeComponentId !== this.selectionMove.activeComponentId) return null;
    const result = applySelectionMoveDocumentOp(this.options.document, this.selectionMove, moveBehavior);
    if (result?.changed) this.projectSelectionMoveGraphCells(result);
    return result;
  }

  private projectSelectionMoveGraphCells(result: SelectionMoveApplyDocumentOpResult) {
    this.options.incrementalRenderer.runWithDocumentGeometryGuard(() => {
      const componentsById = result.movedComponentIds.size > 1
        ? new Map(this.options.document.components.map((component) => [component.id, component]))
        : null;
      result.movedComponentIds.forEach((componentId) => {
        const component = componentsById?.get(componentId)
          ?? this.options.document.components.find((candidate) => candidate.id === componentId);
        const cell = this.options.graphAdapter.getCell(componentId);
        if (!component || !cell) return;
        const position = componentCellPosition(component);
        cell.position(position.x, position.y);
      });
    });
    this.options.incrementalRenderer.updateWireCellsFromDocument(result.updatedWireIds);
  }

  private projectLabelCells(labelIds: ReadonlySet<string>) {
    if (labelIds.size === 0) return;
    const labels = this.options.document.netLabels ?? [];
    const labelsById = labelIds.size > 1
      ? new Map(labels.map((label) => [label.id, label]))
      : null;
    this.options.incrementalRenderer.runWithDocumentGeometryGuard(() => {
      labelIds.forEach((labelId) => {
        const label = labelsById?.get(labelId) ?? labels.find((candidate) => candidate.id === labelId);
        const cell = this.options.graphAdapter.getCell(labelId);
        if (!label || !cell) return;
        const position = netLabelPosition(label);
        cell.position(position.x, position.y);
      });
    });
  }

  private snapComponentCell(cell: Cell) {
    const componentId = stringCellValue(cell, "componentId");
    if (!componentId) return;
    const cellId = String(cell.id);
    if (this.snappingCellIds.has(cellId)) return;
    const instance = this.options.document.components.find((component) => component.id === componentId);
    if (!instance) return;
    const position = cell.position();
    const center = componentCenterFromCellPosition(instance, position);
    const snappedPosition = componentCellPosition({ ...instance, x: center.x, y: center.y });
    if (
      Math.round(position.x) === Math.round(snappedPosition.x)
      && Math.round(position.y) === Math.round(snappedPosition.y)
    ) {
      return;
    }

    this.snappingCellIds.add(cellId);
    try {
      cell.position(snappedPosition.x, snappedPosition.y);
    } finally {
      this.snappingCellIds.delete(cellId);
    }
  }

  private isCurrentGraphInteractionCell(cell: Cell) {
    const id = graphId(cell);
    return Boolean(id && this.options.graphAdapter.getCell(id) === cell);
  }

  private isCurrentNoteInteraction(noteId: string) {
    return (
      this.activeInteractionGeneration === this.documentGeneration
      && this.activeNoteId === noteId
      && this.selectionMove?.activeNoteId === noteId
      && (this.options.document.notes ?? []).some((note) => note.id === noteId)
    );
  }

  private recordAffectedIds(
    activeGraphId: string | null,
    selectionMove: SelectionMoveApplyDocumentOpResult | null,
    changedLabelIds: ReadonlySet<string>
  ) {
    if (activeGraphId) this.affectedGraphIds.add(activeGraphId);
    selectionMove?.affectedGraphIds.forEach((id) => this.affectedGraphIds.add(id));
    selectionMove?.affectedNoteIds.forEach((id) => this.affectedNoteIds.add(id));
    changedLabelIds.forEach((id) => this.affectedGraphIds.add(id));
  }

  private clearInteractionState() {
    this.selectionMove = null;
    this.liveGeometryDirty = false;
    this.activeInteractionGeneration = null;
    this.activeGraphId = null;
    this.activeNoteId = null;
    this.interactionDocumentSnapshot = null;
    this.affectedGraphIds.clear();
    this.affectedNoteIds.clear();
  }
}

function stringCellValue(cell: SchematicCellGeometryInteractionCell, key: string) {
  const value = cell.get(key);
  return typeof value === "string" && value ? value : null;
}

function graphId(cell: SchematicCellGeometryInteractionCell) {
  return stringCellValue(cell, "componentId") ?? stringCellValue(cell, "wireId");
}

function clonePinPoints(points: ReadonlyMap<string, Point> | undefined) {
  return points
    ? new Map(Array.from(points, ([pinId, point]) => [pinId, { ...point }]))
    : null;
}

function snapshotLabelAttachments(document: SchematicDocument) {
  return new Map((document.netLabels ?? []).map((label) => [
    label.id,
    {
      wireId: label.attachment.wireId,
      point: { ...label.attachment.point }
    }
  ]));
}

function changedLabelAttachmentIds(
  document: SchematicDocument,
  previous: ReadonlyMap<string, { wireId: string; point: Point }>
) {
  const changed = new Set<string>();
  (document.netLabels ?? []).forEach((label) => {
    const before = previous.get(label.id);
    if (
      !before
      || before.wireId !== label.attachment.wireId
      || before.point.x !== label.attachment.point.x
      || before.point.y !== label.attachment.point.y
    ) {
      changed.add(label.id);
    }
  });
  return changed;
}

function assignInteractionSnapshot(target: SchematicDocument, snapshot: SchematicDocument) {
  target.components = snapshot.components;
  target.wires = snapshot.wires;
  target.connections = snapshot.connections;
  target.junctions = snapshot.junctions;
  target.junctionAppearances = snapshot.junctionAppearances;
  target.netLabels = snapshot.netLabels;
  target.notes = snapshot.notes;
}
