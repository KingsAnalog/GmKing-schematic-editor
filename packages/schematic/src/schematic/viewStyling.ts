import { junctionCustomColor } from "./networkColorModel";
import { junctionPointFromId } from "./junctionIdentity";
import {
  componentCellAttrs,
  junctionBodyAttrs,
  netLabelTextAttrs,
  wireLineAttrs,
  wireSelectionHaloAttrs
} from "./renderer";
import { resolveSchematicNets, type NetResolution } from "./netResolution";
import type { ToolMode } from "./toolState";
import type { SchematicDocument } from "./types";
import { inductorCouplingCellAttrs } from "./inductorCouplingRenderer";
import { inductorCouplingFlipsReferenceLabel } from "./inductorCouplingGeometry";

export interface SchematicStyleCell {
  readonly id?: unknown;
  get(attribute: string): unknown;
  attr(attributes: unknown): void;
}

export interface SchematicPaperClassList {
  toggle(className: string, force?: boolean): boolean;
}

export interface SchematicPaperElement {
  readonly classList: SchematicPaperClassList;
}

export interface SchematicPresentationPaper<Grid> {
  clearGrid?: () => void;
  drawGrid?: (grid: Grid) => void;
}

export interface ApplySchematicCellSelectionStylesOptions {
  readonly cells: Iterable<SchematicStyleCell>;
  readonly document: SchematicDocument;
  readonly selectedIds: ReadonlySet<string>;
  readonly hoverIds: ReadonlySet<string>;
  readonly presentationMode: boolean;
  readonly resolution?: NetResolution;
}

export interface SetSchematicPresentationStateOptions<Grid> {
  readonly paperEl: SchematicPaperElement;
  readonly paper: SchematicPresentationPaper<Grid>;
  readonly presentationMode: boolean;
  readonly grid: Grid;
}

export function selectionBoxBodyAttrs(containOnly: boolean) {
  return {
    fill: containOnly ? "rgba(154, 86, 0, 0.06)" : "rgba(0, 95, 158, 0.08)",
    stroke: containOnly ? "#9a5600" : "#005f9e",
    strokeDasharray: containOnly ? "none" : "4 4",
    pointerEvents: "none"
  };
}

export function setSchematicPresentationClass(paperEl: SchematicPaperElement, presentationMode: boolean) {
  paperEl.classList.toggle("is-presentation", presentationMode);
}

export function setSchematicPresentationState<Grid>({
  paperEl,
  paper,
  presentationMode,
  grid
}: SetSchematicPresentationStateOptions<Grid>) {
  setSchematicPresentationClass(paperEl, presentationMode);
  if (presentationMode) {
    paper.clearGrid?.();
  } else {
    paper.drawGrid?.(grid);
  }
}

export function syncSchematicPaperModeClasses(paperEl: SchematicPaperElement, mode: ToolMode) {
  paperEl.classList.toggle("is-delete-mode", mode === "delete");
  paperEl.classList.toggle("is-temp-delete-mode", mode === "temp-delete");
}

export function applySchematicCellSelectionStyles({
  cells,
  document,
  selectedIds,
  hoverIds,
  presentationMode,
  resolution
}: ApplySchematicCellSelectionStylesOptions) {
  let netResolution = resolution;
  for (const cell of cells) {
    if (cell.get("preview")) continue;
    if (cell.get("junction")) {
      const id = String(cell.id);
      const selected = selectedIds.has(id) || hoverIds.has(id);
      const point = junctionPointFromId(id);
      cell.attr({ body: junctionBodyAttrs({
        selected,
        color: point ? junctionCustomColor(document, point) : null
      }) });
      continue;
    }

    const couplingId = cell.get("couplingId");
    if (typeof couplingId === "string" && couplingId.length > 0) {
      const coupling = (document.inductorCouplings ?? [])
        .find((candidate) => candidate.id === couplingId);
      if (!coupling) continue;
      const selected = selectedIds.has(couplingId) || hoverIds.has(couplingId);
      cell.attr(inductorCouplingCellAttrs(document, coupling, selected));
      continue;
    }

    const componentId = cell.get("componentId");
    const wireId = cell.get("wireId");
    const netLabelId = cell.get("netLabelId");
    if (typeof netLabelId === "string" && netLabelId.length > 0) {
      netResolution = netResolution ?? resolveSchematicNets(document);
      const selected = selectedIds.has(netLabelId) || hoverIds.has(netLabelId);
      const label = document.netLabels.find(candidate => candidate.id === netLabelId);
      cell.attr({ label: netLabelTextAttrs({
        selected, status: netResolution.labelStates.get(netLabelId)?.status,
        fontFamily: label?.fontFamily, documentFont: document.display?.textFont
      }) });
      continue;
    }
    if (typeof componentId === "string" && componentId.length > 0) {
      const instance = document.components.find((component) => component.id === componentId);
      if (!instance) continue;
      const selected = selectedIds.has(componentId) || hoverIds.has(componentId);
      cell.attr(componentCellAttrs(instance, {
        symbolTemplate: document.symbolTemplate,
        selected,
        presentationMode,
        flipReferenceLabelSide: inductorCouplingFlipsReferenceLabel(document, instance)
      }));
    }
    if (typeof wireId === "string" && wireId.length > 0) {
      const wire = document.wires.find((candidate) => candidate.id === wireId);
      if (!wire) continue;
      const selected = selectedIds.has(wireId) || hoverIds.has(wireId);
      const bus = netResolution?.busWireIds.has(wireId);
      cell.attr({
        line: wireLineAttrs(wire, { bus }),
        selectionHalo: wireSelectionHaloAttrs(wire, { selected, bus })
      });
    }
  }
}
