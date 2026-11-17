import { resolveComponentDef } from "../catalog";
import { pinTouchesConnectedWire } from "../connectionGraph";
import { pointKey, samePoint } from "../geometry";
import { componentPinPoint } from "../netlist";
import { moveJunctionAppearances } from "../networkColorModel";
import type { ComponentInstance, Point, SchematicDocument } from "../types";
import { pointOnPath, rerouteWireEndpoint, samePath, uniformPathDelta } from "../wire/wireGeometry";

export function componentPinPoints(instance: ComponentInstance) {
  const def = resolveComponentDef(instance);
  return new Map(def.pins.map((pin) => [pin.id, componentPinPoint(instance, pin.id)]));
}

export function stretchAttachedWireEndpoints(document: SchematicDocument, instance: ComponentInstance, oldPinPoints: Map<string, Point>, options: { excludeWireIds?: Set<string> } = {}) {
  const updated = new Set<string>();
  const def = resolveComponentDef(instance);
  def.pins.forEach((pin) => {
    const oldPoint = oldPinPoints.get(pin.id);
    if (!oldPoint) return;
    const nextPoint = componentPinPoint(instance, pin.id);
    if (samePoint(oldPoint, nextPoint)) return;
    document.wires.forEach((wire) => {
      if (options.excludeWireIds?.has(wire.id)) return;
      if (!pinTouchesConnectedWire(document, instance.id, pin.id, wire.id)) return;
      const nextPath = rerouteWireEndpoint(wire.points, oldPoint, nextPoint, {
        routeMode: wire.routeMode
      });
      if (!samePath(nextPath, wire.points)) {
        moveJunctionAppearancesWithPath(document, wire.points, nextPath);
        wire.points = nextPath;
        updated.add(wire.id);
      }
    });
  });
  return updated;
}

export function moveJunctionAppearancesWithPath(
  document: SchematicDocument,
  previousPoints: Point[],
  nextPoints: Point[],
  options: { excludeAppearanceKeys?: ReadonlySet<string> } = {}
) {
  const delta = uniformPathDelta(previousPoints, nextPoints);
  if (!delta) return;
  moveJunctionAppearances(
    document,
    (point) => ({ x: point.x + delta.x, y: point.y + delta.y }),
    (point) => !options.excludeAppearanceKeys?.has(pointKey(point)) && pointOnPath(point, previousPoints)
  );
}
