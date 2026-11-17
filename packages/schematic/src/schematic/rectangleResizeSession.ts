import { componentScale } from "./componentScaleModel";
import { buildVisibleJunctions } from "./connectivity";
import {
  cloneSchematicDocument
} from "./document/documentModel";
import { applyNormalizedDocumentWires } from "./document/documentWires";
import { componentPinPoints } from "./document/documentGeometryModel";
import { rotatePoint, snapPoint } from "./geometry";
import { remapNetLabelsAfterWirePathChange } from "./netLabelModel";
import { pruneJunctionAppearances } from "./networkColorModel";
import {
  normalizeRectangleSettings,
  rectangleSettings,
  rectangleSettingsValues,
  type RectangleSettings
} from "./rectangleComponentModel";
import { SYMBOL_GRID_SIZE, type Point, type SchematicDocument, type Wire } from "./types";
import {
  applyWireMoveTopology,
  captureWireMoveTopology
} from "./wire/wireMoveTopology";

export type RectangleResizeCorner = "nw" | "ne" | "se" | "sw";

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
  corner: RectangleResizeCorner;
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

  begin(componentId: string, corner: RectangleResizeCorner) {
    const component = this.document.components.find((candidate) =>
      candidate.id === componentId
      && candidate.type === "rectangle"
      && !candidate.temporarilyDeleted
    );
    if (!component) return false;
    const settings = rectangleSettings(component);
    const signs = cornerSigns(corner);
    const oppositeOffset = rotatePoint({
      x: -signs.x * settings.widthGrid * SYMBOL_GRID_SIZE * componentScale(component) / 2,
      y: -signs.y * settings.heightGrid * SYMBOL_GRID_SIZE * componentScale(component) / 2
    }, component.rotation);
    const baseline = cloneSchematicDocument(this.document);
    this.active = {
      baseline,
      baselineSignature: documentSignature(baseline),
      componentId,
      corner,
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
    const nextSettings = normalizeRectangleSettings({
      ...active.settings,
      widthGrid: Math.round(Math.abs(localDelta.x) / (SYMBOL_GRID_SIZE * componentScale(component))),
      heightGrid: Math.round(Math.abs(localDelta.y) / (SYMBOL_GRID_SIZE * componentScale(component)))
    });
    Object.assign(component.values, rectangleSettingsValues(nextSettings));

    const signs = cornerSigns(active.corner);
    const centerOffset = rotatePoint({
      x: signs.x * nextSettings.widthGrid * SYMBOL_GRID_SIZE * componentScale(component) / 2,
      y: signs.y * nextSettings.heightGrid * SYMBOL_GRID_SIZE * componentScale(component) / 2
    }, active.rotation);
    const center = snapPoint({
      x: active.opposite.x + centerOffset.x,
      y: active.opposite.y + centerOffset.y
    });
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

function cornerSigns(corner: RectangleResizeCorner) {
  return {
    x: corner === "nw" || corner === "sw" ? -1 : 1,
    y: corner === "nw" || corner === "ne" ? -1 : 1
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
