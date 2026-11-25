import { componentScale } from "./componentScaleModel";
import { snapLibraryShapeCenterToVertices } from "./libraryShapeGeometry";
import { buildVisibleJunctions } from "./connectivity";
import {
  cloneSchematicDocument
} from "./document/documentModel";
import { applyNormalizedDocumentWires } from "./document/documentWires";
import { componentPinPoints } from "./document/documentGeometryModel";
import { rotatePoint } from "./geometry";
import { remapNetLabelsAfterWirePathChange } from "./netLabelModel";
import { pruneJunctionAppearances } from "./networkColorModel";
import {
  normalizeRectangleSettings,
  RECTANGLE_FREE_SHAPE_MIN_SIZE_GRID,
  rectangleSettings,
  rectangleSettingsValues,
  type RectangleSettings
} from "./rectangleComponentModel";
import { GRID_SIZE, SYMBOL_GRID_SIZE, type Point, type SchematicDocument, type Wire } from "./types";
import {
  applyWireMoveTopology,
  captureWireMoveTopology
} from "./wire/wireMoveTopology";

export type RectangleResizeCorner = "nw" | "ne" | "se" | "sw";
export type RectangleResizeEdge = "n" | "e" | "s" | "w";
export type RectangleResizeHandle = RectangleResizeCorner | RectangleResizeEdge;

export interface RectangleResizePreviewResult {
  active: boolean;
  changed: boolean;
  componentId?: string;
}

export interface RectangleResizeCommitResult {
  kind: "inactive" | "committed";
  changed: boolean;
  status: string;
}

interface ActiveRectangleResize {
  baseline: SchematicDocument;
  baselineSignature: string;
  componentId: string;
  handle: RectangleResizeHandle;
  opposite: Point;
  rotation: number;
  settings: RectangleSettings;
}

export class RectangleResizeSession {
  private active: ActiveRectangleResize | null = null;

  constructor(private readonly document: SchematicDocument) {}

  get isActive() {
    return this.active !== null;
  }

  begin(componentId: string, handle: RectangleResizeHandle) {
    const component = this.document.components.find((candidate) =>
      candidate.id === componentId
      && candidate.type === "rectangle"
      && !candidate.temporarilyDeleted
    );
    if (!component) return false;
    const settings = rectangleSettings(component);
    const signs = resizeSigns(handle);
    const oppositeOffset = rotatePoint({
      x: -signs.x * settings.widthGrid * SYMBOL_GRID_SIZE * componentScale(component) / 2,
      y: -signs.y * settings.heightGrid * SYMBOL_GRID_SIZE * componentScale(component) / 2
    }, component.rotation);
    const baseline = cloneSchematicDocument(this.document);
    this.active = {
      baseline,
      baselineSignature: documentSignature(baseline),
      componentId,
      handle,
      opposite: {
        x: component.x + oppositeOffset.x,
        y: component.y + oppositeOffset.y
      },
      rotation: component.rotation,
      settings
    };
    return true;
  }

  move(pointer: Point): RectangleResizePreviewResult {
    const active = this.active;
    if (!active) return { active: false, changed: false };
    this.restoreBaseline(active);
    const component = this.document.components.find((candidate) =>
      candidate.id === active.componentId
    );
    if (!component) return { active: true, changed: false };

    const previousPinPoints = new Map([[
      component.id,
      componentPinPoints(component)
    ]]);
    const topology = captureWireMoveTopology(
      this.document,
      new Set([component.id]),
      new Set()
    );
    const previousWires = this.document.wires.map(cloneWire);
    const localDelta = rotatePoint({
      x: pointer.x - active.opposite.x,
      y: pointer.y - active.opposite.y
    }, -active.rotation);
    const signs = resizeSigns(active.handle);
    const scale = componentScale(component);
    const nextSettings = normalizeRectangleSettings({
      ...active.settings,
      widthGrid: signs.x === 0
        ? active.settings.widthGrid
        : Math.round(Math.abs(localDelta.x) / (GRID_SIZE * scale)) * RECTANGLE_FREE_SHAPE_MIN_SIZE_GRID,
      heightGrid: signs.y === 0
        ? active.settings.heightGrid
        : Math.round(Math.abs(localDelta.y) / (GRID_SIZE * scale)) * RECTANGLE_FREE_SHAPE_MIN_SIZE_GRID
    });
    Object.assign(component.values, rectangleSettingsValues(nextSettings));
    const centerOffset = rotatePoint({
      x: signs.x * nextSettings.widthGrid * SYMBOL_GRID_SIZE * scale / 2,
      y: signs.y * nextSettings.heightGrid * SYMBOL_GRID_SIZE * scale / 2
    }, active.rotation);
    const proposedCenter = {
      x: active.opposite.x + centerOffset.x,
      y: active.opposite.y + centerOffset.y
    };
    // Edge drags must not snap the unchanged perpendicular axis and shift adjacent edges.
    const center = signs.x === 0 || signs.y === 0
      ? proposedCenter
      : snapLibraryShapeCenterToVertices(component, proposedCenter);
    component.x = center.x;
    component.y = center.y;

    const nextPinPoints = new Map([[
      component.id,
      componentPinPoints(component)
    ]]);
    applyWireMoveTopology(
      this.document,
      topology,
      previousPinPoints,
      nextPinPoints
    );
    remapNetLabelsAfterWirePathChange(this.document, previousWires);
    applyNormalizedDocumentWires(this.document);
    this.document.junctions = buildVisibleJunctions(this.document);
    pruneJunctionAppearances(this.document);
    return {
      active: true,
      changed: documentSignature(this.document) !== active.baselineSignature,
      componentId: component.id
    };
  }

  commit(): RectangleResizeCommitResult {
    const active = this.active;
    if (!active) return { kind: "inactive", changed: false, status: "" };
    this.active = null;
    const changed = documentSignature(this.document) !== active.baselineSignature;
    return {
      kind: "committed",
      changed,
      status: changed ? "Rectangle resized." : ""
    };
  }

  cancel() {
    const active = this.active;
    if (!active) return false;
    this.active = null;
    this.restoreBaseline(active);
    return true;
  }

  private restoreBaseline(active: ActiveRectangleResize) {
    Object.assign(this.document, cloneSchematicDocument(active.baseline));
  }
}

function resizeSigns(handle: RectangleResizeHandle) {
  return {
    x: handle === "n" || handle === "s"
      ? 0
      : handle === "nw" || handle === "sw" || handle === "w" ? -1 : 1,
    y: handle === "e" || handle === "w"
      ? 0
      : handle === "nw" || handle === "ne" || handle === "n" ? -1 : 1
  };
}

function documentSignature(document: SchematicDocument) {
  return JSON.stringify(document);
}

function cloneWire(wire: Wire): Wire {
  return {
    ...wire,
    points: wire.points.map((point) => ({ ...point })),
    appearance: wire.appearance ? { ...wire.appearance } : undefined
  };
}
