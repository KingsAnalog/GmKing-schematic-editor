import { componentScale } from "./componentScaleModel";
import { rotatePoint, snapPoint } from "./geometry";
import { rectangleSettings } from "./rectangleComponentModel";
import { TRIANGLE_VERTICES, triangleSettings } from "./triangleComponentModel";
import { SYMBOL_GRID_SIZE, type ComponentInstance, type Point } from "./types";

function transformOutlinePoint(instance: ComponentInstance, center: Point, point: Point): Point {
  const scale = componentScale(instance);
  const mirrored = { x: (instance.mirrored ? -point.x : point.x) * scale, y: point.y * scale };
  const rotated = rotatePoint(mirrored, instance.rotation);
  return { x: center.x + rotated.x, y: center.y + rotated.y };
}

/** Visible outline vertices in world coordinates; the stored center is not a snap target. */
export function libraryShapeVertices(
  instance: ComponentInstance,
  center: Point = { x: instance.x, y: instance.y }
): Point[] {
  if (instance.type === "rectangle") {
    const settings = rectangleSettings(instance);
    const halfWidth = settings.widthGrid * SYMBOL_GRID_SIZE / 2;
    const halfHeight = settings.heightGrid * SYMBOL_GRID_SIZE / 2;
    return [
      { x: -halfWidth, y: -halfHeight },
      { x: halfWidth, y: -halfHeight },
      { x: halfWidth, y: halfHeight },
      { x: -halfWidth, y: halfHeight }
    ].map(point => transformOutlinePoint(instance, center, point));
  }
  if (instance.type === "triangle") {
    const settings = triangleSettings(instance);
    return TRIANGLE_VERTICES.map(vertex => transformOutlinePoint(instance, center, settings.vertices[vertex]));
  }
  return [];
}

/** Apply the outline vertices' shared grid correction to the stored cell center. */
export function snapLibraryShapeCenterToVertices(instance: ComponentInstance, center: Point): Point {
  const vertices = libraryShapeVertices(instance, center);
  if (vertices.length === 0) return snapPoint(center);
  const correction = vertices.reduce((total, vertex) => {
    const snapped = snapPoint(vertex);
    return { x: total.x + snapped.x - vertex.x, y: total.y + snapped.y - vertex.y };
  }, { x: 0, y: 0 });
  return {
    x: center.x + correction.x / vertices.length,
    y: center.y + correction.y / vertices.length
  };
}

/** Backwards-compatible names for callers that only handle rectangles. */
export const rectangleBodyVertices = libraryShapeVertices;
export const snapRectangleCenterToVertices = snapLibraryShapeCenterToVertices;
