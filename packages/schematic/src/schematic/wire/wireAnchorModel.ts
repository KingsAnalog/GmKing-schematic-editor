import { orthogonalRoute, samePoint } from "../geometry";
import type { Point, SchematicDocument, Wire, WireAppearance } from "../types";
import { normalizeWirePath, samePath } from "./wireGeometry";

export interface FrozenWireAnchor {
  anchor: Point;
  wireId: string;
  appearance?: WireAppearance;
  routeMode?: Wire["routeMode"];
  temporarilyDeleted?: boolean;
}

export function syncAnchoredWire(document: SchematicDocument, attachment: FrozenWireAnchor, nextPoint: Point) {
  const existingIndex = document.wires.findIndex((wire) => wire.id === attachment.wireId);
  if (samePoint(attachment.anchor, nextPoint)) {
    if (existingIndex < 0) return false;
    document.wires.splice(existingIndex, 1);
    return true;
  }

  const points = normalizeWirePath(
    attachment.routeMode === "freeAngle"
      ? [attachment.anchor, nextPoint]
      : orthogonalRoute(attachment.anchor, nextPoint)
  );
  if (existingIndex >= 0) {
    if (samePath(document.wires[existingIndex].points, points)) return false;
    document.wires[existingIndex].points = points;
    return true;
  }

  document.wires.push({
    id: attachment.wireId,
    routeMode: attachment.routeMode ?? "orthogonal",
    points,
    appearance: attachment.appearance,
    temporarilyDeleted: attachment.temporarilyDeleted
  });
  return true;
}

export function reserveAnchoredWireId(usedIds: Set<string>, base: string) {
  let id = base;
  let suffix = 1;
  while (usedIds.has(id)) id = `${base}-${suffix++}`;
  usedIds.add(id);
  return id;
}
