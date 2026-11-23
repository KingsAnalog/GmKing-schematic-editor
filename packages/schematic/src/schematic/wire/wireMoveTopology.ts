import { resolveComponentDef } from "../catalog";
import {
  cloneConnections, connectGeometry, connectionIdFactory, connectionNodes, pinTouchesConnectedWire,
  wireNodeAtPoint, type ConnectionPin, type ConnectionWireEnd
} from "../connectionGraph";
import { componentPinPoint } from "../connectivity";
import { orthogonalRoute, pointKey, samePoint } from "../geometry";
import type { Point, SchematicConnections, SchematicDocument, Wire, WireAppearance } from "../types";
import { reserveAnchoredWireId, syncAnchoredWire } from "./wireAnchorModel";
import { wireBodyAppearance } from "./wireDecoration";
import {
  beginWireSegmentMove,
  projectWireSegmentMove,
  syncWireSegmentMoveTopology,
  wireSegmentMoveHasFixedJunction,
  type WireSegmentMoveTransaction
} from "./wireSegmentMoveModel";
import { clonePoints, normalizeWirePath, pointOnPath, rerouteWireEndpoint, samePath } from "./wireGeometry";

interface FrozenEndpointAttachment {
  kind: "endpoint";
  componentId: string;
  endpointIndex: number;
  pinId: string;
  fixedJunctionPath: Point[] | null;
  segmentMove: WireSegmentMoveTransaction | null;
  wireId: string;
}

interface FrozenBranchAttachment {
  kind: "branch";
  componentId: string;
  pinId: string;
  anchor: Point;
  wireId: string;
  appearance?: WireAppearance;
  routeMode?: Wire["routeMode"];
}

type FrozenPinAttachment = FrozenEndpointAttachment | FrozenBranchAttachment;

export interface FrozenWireMoveTopology {
  attachments: FrozenPinAttachment[];
  connections: SchematicConnections;
}

interface FrozenSelectedJunctionAttachment {
  junctionId: string;
  wireId: string;
}

export interface FrozenSelectedJunctionMoveTopology {
  attachments: FrozenSelectedJunctionAttachment[];
}

export interface TranslatedWireAnchor {
  wire: Wire;
  fixed: ConnectionPin | ConnectionWireEnd;
  movingWireId: string;
}

export function captureTranslatedWireAnchors(
  document: SchematicDocument,
  movingWireIds: ReadonlySet<string>,
  movingComponentIds: ReadonlySet<string>,
  junctionPoints: ReadonlyMap<string, Point>,
  junctionTopology: FrozenSelectedJunctionMoveTopology
): TranslatedWireAnchor[] {
  if (!movingWireIds.size) return [];
  const wires = new Map(document.wires.map(wire => [wire.id, wire]));
  const usedIds = new Set([
    ...wires.keys(),
    ...document.components.map(component => component.id),
    ...document.netLabels.map(label => label.id),
    ...document.notes.map(note => note.id),
    ...(document.inductorCouplings ?? []).map(coupling => coupling.id)
  ]);
  const following = new Set(junctionTopology.attachments.map(({ junctionId, wireId }) =>
    JSON.stringify([wireId, pointKey(junctionPoints.get(junctionId)!)])));
  const anchors: TranslatedWireAnchor[] = [];
  for (const node of connectionNodes(document).values()) {
    const moving = node.wires.find(end => movingWireIds.has(end.wireId));
    if (!moving) continue;
    const fixed = node.pins.find(pin => !movingComponentIds.has(pin.componentId))
      ?? node.wires.find(end => !movingWireIds.has(end.wireId)
        && !following.has(JSON.stringify([end.wireId, pointKey(end.point)])));
    if (!fixed) continue;
    const source = wires.get(moving.wireId)!;
    const layerId = source.layerId;
    const appearance = wireBodyAppearance(source);
    anchors.push({
      fixed,
      movingWireId: source.id,
      wire: {
        id: reserveAnchoredWireId(usedIds, `drag-${source.id}-node-${moving.index}`),
        routeMode: source.routeMode,
        points: [node.point],
        ...(layerId ? { layerId } : {}),
        ...(appearance ? { appearance } : {})
      }
    });
  }
  return anchors;
}

export function projectTranslatedWireAnchors(anchors: readonly TranslatedWireAnchor[], delta: Point): TranslatedWireAnchor[] {
  if (!delta.x && !delta.y) return [];
  return anchors.map(({ wire, fixed, movingWireId }) => {
    const start = wire.points[0];
    const end = { x: start.x + delta.x, y: start.y + delta.y };
    const points = wire.routeMode === "freeAngle" ? [start, end] : normalizeWirePath(orthogonalRoute(start, end));
    return { wire: { ...wire, points }, fixed, movingWireId };
  });
}

export function applyTranslatedWireAnchors(document: SchematicDocument, anchors: readonly TranslatedWireAnchor[]) {
  const fresh = connectionIdFactory(document.connections);
  for (const { wire, fixed, movingWireId } of anchors) {
    const start = wire.points[0];
    const end = wire.points[wire.points.length - 1];
    const fixedNode = "pinId" in fixed
      ? document.connections.pins[fixed.componentId]?.[fixed.pinId]
      : wireNodeAtPoint(document, fixed.wireId, start);
    const movedNode = wireNodeAtPoint(document, movingWireId, end);
    if (fixedNode === undefined || movedNode === undefined || fixedNode === movedNode) continue;
    // Bind both original contacts directly. An extension crossing another net
    // must not create a connection along its route.
    document.connections.wires[wire.id] = wire.points.map((_, index) =>
      index === 0 ? fixedNode : index === wire.points.length - 1 ? movedNode : fresh());
    document.wires.push(wire);
  }
}

export function captureWireMoveTopology(
  document: SchematicDocument,
  movingComponentIds: ReadonlySet<string>,
  movingWireIds: ReadonlySet<string>
): FrozenWireMoveTopology {
  const attachments: FrozenPinAttachment[] = [];
  const usedWireIds = new Set(document.wires.map((wire) => wire.id));
  const activeWires = document.wires.filter((wire) => !wire.temporarilyDeleted && !movingWireIds.has(wire.id));
  const movingPinKeys = new Set(document.components
    .filter((component) => !component.temporarilyDeleted && movingComponentIds.has(component.id))
    .flatMap((component) =>
      resolveComponentDef(component).pins.map((pin) => pointKey(componentPinPoint(component, pin.id)))
    ));
  const stationaryPinKeys = new Set(document.components
    .filter((component) => !component.temporarilyDeleted && !movingComponentIds.has(component.id))
    .flatMap((component) =>
      resolveComponentDef(component).pins.map((pin) => pointKey(componentPinPoint(component, pin.id)))
    ));

  document.components
    .filter((component) => !component.temporarilyDeleted && movingComponentIds.has(component.id))
    .forEach((component) => {
      resolveComponentDef(component).pins.forEach((pin) => {
        const point = componentPinPoint(component, pin.id);
        const touchingWires = activeWires.filter((wire) => pointOnPath(point, wire.points)
          && pinTouchesConnectedWire(document, component.id, pin.id, wire.id));
        let hasFixedAnchor = false;
        touchingWires.forEach((wire) => {
          const first = wire.points[0];
          const last = wire.points[wire.points.length - 1];
          if (samePoint(point, first) || samePoint(point, last)) {
            const endpointIndex = samePoint(point, first) ? 0 : wire.points.length - 1;
            const segmentMove = wire.routeMode === "freeAngle"
              ? null
              : beginWireSegmentMove(document, wire.id, point, {
                  mobileEndpointKeys: movingPinKeys
                });
            const fixedJunctionEndpointIndex = endpointIndex === 0 ? wire.points.length - 1 : 0;
            const preserveFixedJunction = Boolean(
              segmentMove && wireSegmentMoveHasFixedJunction(segmentMove, fixedJunctionEndpointIndex)
            );
            attachments.push({
              kind: "endpoint",
              componentId: component.id,
              endpointIndex,
              pinId: pin.id,
              fixedJunctionPath: preserveFixedJunction ? clonePoints(wire.points) : null,
              segmentMove: preserveFixedJunction ? null : segmentMove,
              wireId: wire.id
            });
            return;
          }
          hasFixedAnchor = true;
          attachments.push({
            kind: "branch",
            componentId: component.id,
            pinId: pin.id,
            anchor: point,
            wireId: reserveAnchoredWireId(usedWireIds, `drag-${component.id}-${pin.id}`),
            appearance: wireBodyAppearance(wire),
            routeMode: wire.routeMode
          });
        });

        const pinNode = document.connections.pins[component.id]?.[pin.id];
        const sharesStationaryPin = document.components.some(other =>
          !other.temporarilyDeleted && !movingComponentIds.has(other.id)
          && Object.values(document.connections.pins[other.id] ?? {}).some(id => id === pinNode));
        if (!hasFixedAnchor && stationaryPinKeys.has(pointKey(point)) && sharesStationaryPin) {
          attachments.push({
            kind: "branch",
            componentId: component.id,
            pinId: pin.id,
            anchor: point,
            wireId: reserveAnchoredWireId(usedWireIds, `drag-${component.id}-${pin.id}`),
            appearance: { variant: "signal" }
          });
        }
      });
    });

  const connections = cloneConnections(document.connections);
  attachments.forEach(attachment => {
    if (attachment.kind !== "branch") return;
    const node = connections.pins[attachment.componentId]?.[attachment.pinId];
    if (node) connections.wires[attachment.wireId] = [node, node];
  });
  return { attachments, connections };
}

export function applyWireMoveTopology(
  document: SchematicDocument,
  topology: FrozenWireMoveTopology,
  previousPinPoints: Map<string, Map<string, Point>>,
  nextPinPoints: Map<string, Map<string, Point>>,
  wiresById?: ReadonlyMap<string, Wire>
) {
  const updatedWireIds = new Set<string>();
  topology.attachments.filter((attachment): attachment is FrozenBranchAttachment => attachment.kind === "branch").forEach((attachment) => {
    const previousPoint = previousPinPoints.get(attachment.componentId)?.get(attachment.pinId);
    const nextPoint = nextPinPoints.get(attachment.componentId)?.get(attachment.pinId);
    if (!previousPoint || !nextPoint || samePoint(previousPoint, nextPoint)) return;

    syncAnchoredWire(document, attachment, nextPoint);
    updatedWireIds.add(attachment.wireId);
  });

  const endpointsByWire = new Map<string, FrozenEndpointAttachment[]>();
  topology.attachments
    .filter((attachment): attachment is FrozenEndpointAttachment => attachment.kind === "endpoint")
    .forEach((attachment) => {
      endpointsByWire.set(attachment.wireId, [...(endpointsByWire.get(attachment.wireId) ?? []), attachment]);
    });
  endpointsByWire.forEach((attachments, wireId) => {
    const wire = wiresById?.get(wireId) ?? document.wires.find((candidate) => candidate.id === wireId);
    if (!wire) return;

    const movedAttachments = attachments.filter((attachment) => {
      const previousPoint = previousPinPoints.get(attachment.componentId)?.get(attachment.pinId);
      const nextPoint = nextPinPoints.get(attachment.componentId)?.get(attachment.pinId);
      return previousPoint && nextPoint && !samePoint(previousPoint, nextPoint);
    });
    if (movedAttachments.length === 0) return;

    let nextPath: Point[] | null = null;
    movedAttachments.forEach((attachment) => {
      const nextPoint = nextPinPoints.get(attachment.componentId)?.get(attachment.pinId);
      if (!nextPoint || !attachment.segmentMove) return;
      const projectedPaths = projectWireSegmentMove(attachment.segmentMove, nextPoint);
      syncWireSegmentMoveTopology(document, attachment.segmentMove, projectedPaths)
        .forEach((updatedWireId) => updatedWireIds.add(updatedWireId));
      nextPath ??= projectedPaths.get(wireId) ?? null;
    });
    const fixedAttachment = attachments.find(attachment => attachment.fixedJunctionPath);
    if (!nextPath && fixedAttachment?.fixedJunctionPath) {
      // Rebuild from the gesture's original segment, never from bends left by
      // earlier pointer events. A selected junction may have moved separately;
      // translate the baseline to its current anchor before stretching the pin.
      const initialPath = fixedAttachment.fixedJunctionPath;
      const anchorAtEnd = fixedAttachment.endpointIndex === 0;
      const initialAnchor = initialPath[anchorAtEnd ? initialPath.length - 1 : 0];
      const anchor = wire.points[anchorAtEnd ? wire.points.length - 1 : 0] ?? initialAnchor;
      nextPath = initialPath.map(point => ({
        x: point.x + anchor.x - initialAnchor.x,
        y: point.y + anchor.y - initialAnchor.y
      }));
    }
    nextPath ??= wire.points;

    movedAttachments.forEach((attachment) => {
      const previousPoint = previousPinPoints.get(attachment.componentId)?.get(attachment.pinId);
      const nextPoint = nextPinPoints.get(attachment.componentId)?.get(attachment.pinId);
      if (!previousPoint || !nextPoint) return;
      const currentEndpointIndex = attachment.endpointIndex === 0 ? 0 : Math.max(0, (nextPath?.length ?? 1) - 1);
      const projectedEndpoint = nextPath?.[currentEndpointIndex] ?? previousPoint;
      nextPath = rerouteWireEndpoint(nextPath ?? wire.points, projectedEndpoint, nextPoint, {
        preserveOppositeEndpointDirection: Boolean(attachment.fixedJunctionPath),
        routeMode: wire.routeMode
      });
    });
    if (!nextPath || samePath(wire.points, nextPath)) return;
    wire.points = nextPath;
    updatedWireIds.add(wire.id);
  });
  if (updatedWireIds.size) connectGeometry(document, {
    wireIds: updatedWireIds,
    componentIds: new Set(topology.attachments.map(attachment => attachment.componentId)),
    retained: topology.connections
  });
  return updatedWireIds;
}

export function captureSelectedJunctionMoveTopology(
  document: SchematicDocument,
  junctionPoints: ReadonlyMap<string, Point>,
  movingWireIds: ReadonlySet<string>
): FrozenSelectedJunctionMoveTopology {
  const attachments: FrozenSelectedJunctionAttachment[] = [];
  junctionPoints.forEach((point, junctionId) => {
    document.wires.forEach((wire) => {
      if (movingWireIds.has(wire.id) || wire.temporarilyDeleted) return;
      const first = wire.points[0];
      const last = wire.points[wire.points.length - 1];
      if (!samePoint(point, first) && !samePoint(point, last)) return;
      attachments.push({ junctionId, wireId: wire.id });
    });
  });
  return { attachments };
}

export function applySelectedJunctionMoveTopology(
  document: SchematicDocument,
  topology: FrozenSelectedJunctionMoveTopology,
  previousPoints: ReadonlyMap<string, Point>,
  nextPoints: ReadonlyMap<string, Point>,
  wiresById?: ReadonlyMap<string, Wire>
) {
  const updatedWireIds = new Set<string>();
  topology.attachments.forEach((attachment) => {
    const previousPoint = previousPoints.get(attachment.junctionId);
    const nextPoint = nextPoints.get(attachment.junctionId);
    const wire = wiresById?.get(attachment.wireId) ?? document.wires.find((candidate) => candidate.id === attachment.wireId);
    if (!previousPoint || !nextPoint || !wire || samePoint(previousPoint, nextPoint)) return;
    const nextPath = rerouteWireEndpoint(wire.points, previousPoint, nextPoint, {
      preserveMovedEndpointDirection: true,
      routeMode: wire.routeMode
    });
    if (samePath(wire.points, nextPath)) return;
    wire.points = nextPath;
    updatedWireIds.add(wire.id);
  });
  return updatedWireIds;
}
