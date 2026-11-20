import { DEFAULT_TRIANGLE_SETTINGS, TRIANGLE_VERTICES } from "../triangleComponentModel";
import type { Point } from "../types";
import { closedPolygonPath } from "./closedShapeSymbols";
import { line, path } from "./symbolPrimitives";

export function triangleFrameSymbol(width: number, height: number, vertices: readonly Point[] = TRIANGLE_VERTICES.map(id => DEFAULT_TRIANGLE_SETTINGS.vertices[id])) {
  return closedPolygonPath(width, height, vertices);
}

export function triangleLeadSymbol(width: number, height: number, leads: readonly { contact: Point; pin: Point }[]) {
  return path(leads.map(({ contact, pin }) => line(width / 2 + contact.x, height / 2 + contact.y, width / 2 + pin.x, height / 2 + pin.y)));
}
