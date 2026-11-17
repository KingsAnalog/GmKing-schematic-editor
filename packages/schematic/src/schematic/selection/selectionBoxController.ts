import { shapes } from "@joint/core";
import {
  buildSelectionBoxGeometry,
  collectSelectionBoxHits,
  type SelectionBoxGeometry,
  type SelectionBoxHitResult
} from "./selectionBoxModel";
import type { Point, SchematicDocument } from "../types";
import { selectionBoxBodyAttrs } from "../viewStyling";

export const SELECTION_BOX_ID = "selection-box";

export type SelectionBoxCell = shapes.standard.Rectangle;

export function createSelectionBoxCell(geometry: SelectionBoxGeometry): SelectionBoxCell {
  const { rect, containOnly } = geometry;
  const cell = new shapes.standard.Rectangle({
    id: SELECTION_BOX_ID,
    position: { x: rect.x, y: rect.y },
    size: { width: rect.width, height: rect.height },
    attrs: {
      body: selectionBoxBodyAttrs(containOnly),
      label: { text: "" }
    }
  });
  cell.set("preview", true);
  return cell;
}

export function updateSelectionBoxCell(cell: SelectionBoxCell, geometry: SelectionBoxGeometry) {
  const { rect, containOnly } = geometry;
  cell.position(rect.x, rect.y);
  cell.resize(rect.width, rect.height);
  cell.attr({
    body: selectionBoxBodyAttrs(containOnly)
  });
}

export interface SelectionBoxGraphAdapter<Cell> {
  addCell(cell: Cell): void;
  removeCell(id: string): void;
}

export interface SelectionBoxListenerCallbacks {
  add(): void;
  remove(): void;
}

export interface SelectionBoxControllerOptions<Cell = SelectionBoxCell> {
  graphAdapter: SelectionBoxGraphAdapter<Cell>;
  listeners?: SelectionBoxListenerCallbacks;
  createCell?: (geometry: SelectionBoxGeometry) => Cell;
  updateCell?: (cell: Cell, geometry: SelectionBoxGeometry) => void;
}

export interface FinishedSelectionBoxRuntime {
  selectionBox: SelectionBoxHitResult;
  additive: boolean;
}

export class SchematicSelectionBoxController<Cell = SelectionBoxCell> {
  private selectionBoxCell: Cell | null = null;
  private dragSelectStart: Point | null = null;
  private dragSelectAdditive = false;
  private listenersAttached = false;
  private readonly createCell: (geometry: SelectionBoxGeometry) => Cell;
  private readonly updateCell: (cell: Cell, geometry: SelectionBoxGeometry) => void;

  constructor(private readonly options: SelectionBoxControllerOptions<Cell>) {
    this.createCell = (options.createCell ?? createSelectionBoxCell) as (geometry: SelectionBoxGeometry) => Cell;
    this.updateCell = (options.updateCell ?? updateSelectionBoxCell) as (cell: Cell, geometry: SelectionBoxGeometry) => void;
  }

  isActive() {
    return this.dragSelectStart !== null;
  }

  startPoint() {
    return this.dragSelectStart ? { ...this.dragSelectStart } : null;
  }

  isAdditive() {
    return this.dragSelectAdditive;
  }

  start(point: Point, additive: boolean) {
    this.dragSelectStart = { ...point };
    this.dragSelectAdditive = additive;
    this.attachListeners();
  }

  update(point: Point): SelectionBoxGeometry | null {
    if (!this.dragSelectStart) return null;
    const geometry = buildSelectionBoxGeometry(this.dragSelectStart, point);
    if (!this.selectionBoxCell) {
      this.selectionBoxCell = this.createCell(geometry);
      this.options.graphAdapter.addCell(this.selectionBoxCell);
      return geometry;
    }
    this.updateCell(this.selectionBoxCell, geometry);
    return geometry;
  }

  finish(
    document: SchematicDocument,
    point: Point,
    visibleJunctions: readonly Point[] = document.junctions
  ): FinishedSelectionBoxRuntime | null {
    if (!this.dragSelectStart) return null;
    const additive = this.dragSelectAdditive;
    const selectionBox = collectSelectionBoxHits(document, this.dragSelectStart, point, visibleJunctions);
    this.cancel();
    return { selectionBox, additive };
  }

  cancel() {
    this.removeSelectionBox();
    this.detachListeners();
  }

  clearTransient() {
    if (this.dragSelectStart || this.selectionBoxCell) {
      this.cancel();
      return;
    }
    this.removeSelectionBox();
  }

  forgetCell() {
    this.selectionBoxCell = null;
  }

  private removeSelectionBox() {
    this.options.graphAdapter.removeCell(SELECTION_BOX_ID);
    this.selectionBoxCell = null;
    this.dragSelectStart = null;
    this.dragSelectAdditive = false;
  }

  private attachListeners() {
    if (this.listenersAttached) return;
    this.options.listeners?.add();
    this.listenersAttached = true;
  }

  private detachListeners() {
    if (!this.listenersAttached) return;
    this.options.listeners?.remove();
    this.listenersAttached = false;
  }
}
