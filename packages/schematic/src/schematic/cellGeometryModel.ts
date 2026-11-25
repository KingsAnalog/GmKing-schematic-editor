import { samePoint, snapPoint } from "./geometry";
import { moveJunctionAppearancesWithPath, stretchAttachedWireEndpoints } from "./document/documentGeometryModel";
import type { SelectionMoveBehavior } from "./selection/selectionMoveTransaction";
import type { Point, SchematicDocument } from "./types";
import { normalizeWirePath, samePath } from "./wire/wireGeometry";
import { isLibraryShapeType } from "./libraryShapeStyleModel";
import { snapLibraryShapeCenterToVertices } from "./libraryShapeGeometry";

export interface ComponentCellGeometryInput {
  document: SchematicDocument;
  componentId: string;
  nextCenter: Point;
  oldPinPoints: Map<string, Point>;
  moveBehavior: SelectionMoveBehavior;
  excludedWireIds?: Set<string>;
}

export interface ComponentCellGeometryResult {
  changed: boolean;
  updatedWireIds: Set<string>;
}

export interface WireCellGeometryInput {
  document: SchematicDocument;
  wireId: string;
  points: readonly unknown[];
}

export interface WireCellGeometryResult {
  changed: boolean;
}

export function applyComponentCellGeometry(input: ComponentCellGeometryInput): ComponentCellGeometryResult {
  const updatedWireIds = new Set<string>();
  const instance = input.document.components.find((component) => component.id === input.componentId);
  if (!instance) return { changed: false, updatedWireIds };

  const next = isLibraryShapeType(instance.type)
    ? snapLibraryShapeCenterToVertices(instance, input.nextCenter)
    : snapPoint(input.nextCenter);
  if (samePoint({ x: instance.x, y: instance.y }, next)) return { changed: false, updatedWireIds };

  instance.x = next.x;
  instance.y = next.y;

  if (input.moveBehavior === "stretch") {
    stretchAttachedWireEndpoints(input.document, instance, input.oldPinPoints, { excludeWireIds: input.excludedWireIds }).forEach((wireId) => {
      updatedWireIds.add(wireId);
    });
  }

  return { changed: true, updatedWireIds };
}

export function applyWireCellGeometry(input: WireCellGeometryInput): WireCellGeometryResult {
  const wire = input.document.wires.find((candidate) => candidate.id === input.wireId);
  if (!wire) return { changed: false };

  const nextPath = normalizeWirePath(input.points.map(toFinitePoint).filter((point): point is Point => !!point));
  if (nextPath.length < 2 || samePath(wire.points, nextPath)) return { changed: false };

  moveJunctionAppearancesWithPath(input.document, wire.points, nextPath);
  wire.points = nextPath;
  return { changed: true };
}

function toFinitePoint(point: unknown): Point | null {
  const candidate = point as Partial<Point> | null | undefined;
  const x = Number(candidate?.x);
  const y = Number(candidate?.y);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}
