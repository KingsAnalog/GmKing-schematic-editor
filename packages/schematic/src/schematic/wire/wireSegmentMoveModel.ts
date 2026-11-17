import { componentPinPoints } from "../document/documentGeometryModel";
import { cloneConnections, connectGeometry, pinTouchesConnectedWire, syncConnectionVertices, wireNodeAtPoint, wiresJoinAtPoint } from "../connectionGraph";
import { isHorizontal, isVertical, pointKey, samePoint, snapPoint } from "../geometry";
import type { Point, SchematicConnections, SchematicDocument, Wire } from "../types";
import { reserveAnchoredWireId, syncAnchoredWire, type FrozenWireAnchor } from "./wireAnchorModel";
import { wireBodyAppearance } from "./wireDecoration";
import { clonePoints, normalizeWirePath, pointOnPath, rerouteWireEndpoint, samePath } from "./wireGeometry";

interface FollowingEndpoint {
  activeEndpointIndex: number;
  endpointIndex: number;
  routeMode: Wire["routeMode"];
  wireId: string;
}

interface FixedNodeAnchor extends FrozenWireAnchor {
  activeEndpointIndex: number;
  kind: "pin" | "junction";
}

interface RetainedJunctionAnchor {
  anchor: FrozenWireAnchor;
  followerEndpointIndex: number;
  followerFixedPoint: Point;
  followerWireId: string;
}

interface WireSegmentMoveTopology {
  followers: FollowingEndpoint[];
  fixedAnchors: FixedNodeAnchor[];
  retainedAnchors: RetainedJunctionAnchor[];
}

export interface WireSegmentMoveTransaction {
  activeWireId: string;
  moveAxis: "x" | "y" | "xy";
  initialPointer: Point;
  initialPaths: Map<string, Point[]>;
  wireSnapshots: Map<string, Wire>;
  topology: WireSegmentMoveTopology;
  connections: SchematicConnections;
}

export function wireSegmentMoveHasFixedJunction(transaction: WireSegmentMoveTransaction, endpointIndex: number) {
  return transaction.topology.fixedAnchors.some(
    (anchor) => anchor.kind === "junction" && anchor.activeEndpointIndex === endpointIndex
  );
}

interface BeginWireSegmentMoveOptions {
  mobileEndpointKeys?: ReadonlySet<string>;
}

export function beginWireSegmentMove(
  document: SchematicDocument,
  wireId: string,
  pointer: Point,
  options: BeginWireSegmentMoveOptions = {}
): WireSegmentMoveTransaction | null {
  const activeWire = document.wires.find((wire) => wire.id === wireId);
  if (!activeWire || activeWire.points.length !== 2) return null;
  const [start, end] = activeWire.points;
  const moveAxis = segmentMoveAxis(start, end);
  if (!moveAxis) return null;

  const followers: FollowingEndpoint[] = [];
  const collinearEndpointIndices = new Set<number>();
  const initialPaths = new Map<string, Point[]>([[wireId, clonePoints(activeWire.points)]]);
  const wireSnapshots = new Map<string, Wire>([[wireId, cloneWire(activeWire)]]);
  document.wires.forEach((wire) => {
    if (wire.id === wireId || wire.points.length !== 2) return;
    if (Boolean(wire.temporarilyDeleted) !== Boolean(activeWire.temporarilyDeleted)) return;
    if (!segmentMoveAxis(wire.points[0], wire.points[1])) return;
    wire.points.forEach((point, endpointIndex) => {
      activeWire.points.forEach((activePoint, activeEndpointIndex) => {
        if (!samePoint(point, activePoint)) return;
        if (!wiresJoinAtPoint(document, wire.id, activeWire.id, activePoint)) return;
        if (segmentsParallel(start, end, wire.points[0], wire.points[1])) {
          collinearEndpointIndices.add(activeEndpointIndex);
          return;
        }
        followers.push({
          activeEndpointIndex,
          endpointIndex,
          routeMode: wire.routeMode,
          wireId: wire.id
        });
        initialPaths.set(wire.id, clonePoints(wire.points));
        wireSnapshots.set(wire.id, cloneWire(wire));
      });
    });
  });
  const usedWireIds = new Set(document.wires.map((wire) => wire.id));
  const pinAnchors: FixedNodeAnchor[] = activeWire.points.flatMap((point, activeEndpointIndex) => {
    if (activeWire.temporarilyDeleted || options.mobileEndpointKeys?.has(pointKey(point))) return [];
    const touchesPin = document.components.some((component) =>
      !component.temporarilyDeleted && Array.from(componentPinPoints(component)).some(([pinId, pinPoint]) =>
        samePoint(pinPoint, point) && pinTouchesConnectedWire(document, component.id, pinId, activeWire.id))
    );
    if (!touchesPin) return [];
    return [{
      kind: "pin" as const,
      activeEndpointIndex,
      anchor: { ...point },
      wireId: reserveAnchoredWireId(usedWireIds, `drag-${wireId}-pin-${activeEndpointIndex}`),
      routeMode: activeWire.routeMode,
      appearance: wireBodyAppearance(activeWire),
      temporarilyDeleted: activeWire.temporarilyDeleted
    }];
  });
  const pinAnchorEndpointIndices = new Set(pinAnchors.map((anchor) => anchor.activeEndpointIndex));
  const junctionAnchors: FixedNodeAnchor[] = Array.from(collinearEndpointIndices)
    .filter((activeEndpointIndex) =>
      !pinAnchorEndpointIndices.has(activeEndpointIndex) &&
      !options.mobileEndpointKeys?.has(pointKey(activeWire.points[activeEndpointIndex]))
    )
    .map((activeEndpointIndex) => ({
      kind: "junction" as const,
      activeEndpointIndex,
      anchor: { ...activeWire.points[activeEndpointIndex] },
      wireId: reserveAnchoredWireId(usedWireIds, `drag-${wireId}-junction-${activeEndpointIndex}`),
      routeMode: activeWire.routeMode,
      appearance: wireBodyAppearance(activeWire),
      temporarilyDeleted: activeWire.temporarilyDeleted
    }));
  const retainedAnchors = captureRetainedJunctionAnchors(document, followers, initialPaths);
  const connections = cloneConnections(document.connections);
  [...pinAnchors, ...junctionAnchors].forEach(anchor => {
    const node = wireNodeAtPoint(document, wireId, anchor.anchor);
    if (node) connections.wires[anchor.wireId] = [node, node];
  });
  retainedAnchors.forEach(retained => {
    // A collapsed bridge hands its stationary end to the follower that replaces it.
    connections.wires[retained.followerWireId].push(...(connections.wires[retained.anchor.wireId] ?? []));
  });

  return {
    activeWireId: wireId,
    moveAxis,
    initialPointer: snapPoint(pointer),
    initialPaths,
    wireSnapshots,
    connections,
    topology: {
      followers,
      fixedAnchors: [...pinAnchors, ...junctionAnchors],
      retainedAnchors
    }
  };
}

function segmentMoveAxis(start: Point, end: Point): "x" | "y" | "xy" | null {
  if (samePoint(start, end)) return null;
  return isHorizontal(start, end) ? "y" : isVertical(start, end) ? "x" : "xy";
}

export function projectWireSegmentMove(transaction: WireSegmentMoveTransaction, pointer: Point) {
  const nextPointer = snapPoint(pointer);
  const delta = transaction.moveAxis === "xy"
    ? {
        x: nextPointer.x - transaction.initialPointer.x,
        y: nextPointer.y - transaction.initialPointer.y
      }
    : nextPointer[transaction.moveAxis] - transaction.initialPointer[transaction.moveAxis];
  const paths = new Map(Array.from(transaction.initialPaths, ([wireId, points]) => [wireId, clonePoints(points)]));
  const activePath = paths.get(transaction.activeWireId);
  if (!activePath) return paths;

  activePath.forEach((point) => {
    if (transaction.moveAxis === "xy" && typeof delta !== "number") {
      point.x += delta.x;
      point.y += delta.y;
      return;
    }
    if (transaction.moveAxis !== "xy" && typeof delta === "number") {
      point[transaction.moveAxis] += delta;
    }
  });
  transaction.topology.followers.forEach((attachment) => {
    const attachedPath = paths.get(attachment.wireId);
    const nextNode = activePath[attachment.activeEndpointIndex];
    const previousEndpoint = attachedPath?.[attachment.endpointIndex];
    if (!attachedPath || !previousEndpoint || !nextNode) return;
    paths.set(
      attachment.wireId,
      rerouteWireEndpoint(attachedPath, previousEndpoint, nextNode, {
        routeMode: attachment.routeMode
      })
    );
  });
  return paths;
}

export function syncWireSegmentMoveTopology(
  document: SchematicDocument,
  transaction: WireSegmentMoveTransaction,
  paths: ReadonlyMap<string, Point[]>
) {
  const updatedWireIds = new Set<string>();
  const active = document.wires.find(wire => wire.id === transaction.activeWireId);
  const activePath = paths.get(transaction.activeWireId);
  if (active && activePath && !samePath(active.points, activePath)) {
    active.points = clonePoints(activePath);
    updatedWireIds.add(active.id);
  }
  syncFollowingWirePaths(document, transaction, paths).forEach((wireId) => updatedWireIds.add(wireId));
  syncFixedNodeAnchors(document, transaction, paths).forEach((wireId) => updatedWireIds.add(wireId));
  syncRetainedJunctionAnchors(document, transaction, paths).forEach((wireId) => updatedWireIds.add(wireId));
  syncConnectionVertices(document, { ...document, wires: [...transaction.wireSnapshots.values()] });
  connectGeometry(document, {
    wireIds: new Set([...transaction.initialPaths.keys(), ...updatedWireIds]), componentIds: new Set(),
    retained: retainedConnectionsForMove(transaction, paths)
  });
  return updatedWireIds;
}

function retainedConnectionsForMove(transaction: WireSegmentMoveTransaction, paths: ReadonlyMap<string, Point[]>) {
  const parent = new Map<string, string>();
  const root = (id: string): string => parent.has(id) ? root(parent.get(id)!) : id;
  paths.forEach((points, wireId) => {
    if (!points.length || !points.every(point => samePoint(point, points[0]))) return;
    const nodes = transaction.connections.wires[wireId];
    if (!nodes || nodes.length < 2) return;
    const first = root(nodes[0]), second = root(nodes[1]);
    if (first !== second) parent.set(second, first);
  });
  if (!parent.size) return transaction.connections;
  // A collapsed conductor still connects its two original nodes. Contract that
  // edge only for this frame, so stretching it out again restores the original
  // contact permissions instead of connecting unrelated touching conductors.
  const retained = cloneConnections(transaction.connections);
  Object.values(retained.wires).forEach(nodes => nodes.forEach((id, index) => { nodes[index] = root(id); }));
  Object.values(retained.pins).forEach(pins => Object.keys(pins).forEach(id => { pins[id] = root(pins[id]); }));
  return retained;
}

function syncFollowingWirePaths(
  document: SchematicDocument,
  transaction: WireSegmentMoveTransaction,
  paths: ReadonlyMap<string, Point[]>
) {
  const updatedWireIds = new Set<string>();
  transaction.initialPaths.forEach((_initialPath, wireId) => {
    if (wireId === transaction.activeWireId) return;
    const projectedPath = normalizeWirePath(paths.get(wireId) ?? []);
    const existingIndex = document.wires.findIndex((wire) => wire.id === wireId);

    if (projectedPath.length < 2) {
      if (existingIndex >= 0) {
        document.wires.splice(existingIndex, 1);
        updatedWireIds.add(wireId);
      }
      return;
    }

    if (existingIndex >= 0) {
      if (!samePath(document.wires[existingIndex].points, projectedPath)) {
        document.wires[existingIndex].points = projectedPath;
        updatedWireIds.add(wireId);
      }
      return;
    }

    const snapshot = transaction.wireSnapshots.get(wireId);
    if (!snapshot) return;
    document.wires.push({ ...cloneWire(snapshot), points: projectedPath });
    updatedWireIds.add(wireId);
  });
  return updatedWireIds;
}

function syncFixedNodeAnchors(
  document: SchematicDocument,
  transaction: WireSegmentMoveTransaction,
  paths: ReadonlyMap<string, Point[]>
) {
  const updatedWireIds = new Set<string>();
  const activePath = paths.get(transaction.activeWireId);
  if (!activePath) return updatedWireIds;

  transaction.topology.fixedAnchors.forEach((anchor) => {
    const nextPoint = activePath[anchor.activeEndpointIndex];
    if (!nextPoint) return;
    if (anchor.kind === "pin") {
      if (syncAnchoredWire(document, anchor, nextPoint)) updatedWireIds.add(anchor.wireId);
      return;
    }
    const followerPaths = transaction.topology.followers
      .filter((attachment) => attachment.activeEndpointIndex === anchor.activeEndpointIndex)
      .map((attachment) => paths.get(attachment.wireId) ?? []);
    const oldJunctionStillCovered = followerPaths.some((path) => pointOnPath(anchor.anchor, path));
    const nearestFollowerPoint = followerPaths
      .flat()
      .reduce<Point | null>((nearest, point) => {
        if (!nearest) return point;
        return pointDistance(anchor.anchor, point) < pointDistance(anchor.anchor, nearest) ? point : nearest;
      }, null);
    const anchorTarget = oldJunctionStillCovered ? anchor.anchor : nearestFollowerPoint ?? nextPoint;
    if (syncAnchoredWire(document, anchor, anchorTarget)) updatedWireIds.add(anchor.wireId);
  });
  return updatedWireIds;
}

function syncRetainedJunctionAnchors(
  document: SchematicDocument,
  transaction: WireSegmentMoveTransaction,
  paths: ReadonlyMap<string, Point[]>
) {
  const updatedWireIds = new Set<string>();
  transaction.topology.retainedAnchors.forEach((retained) => {
    const followerPath = paths.get(retained.followerWireId);
    const movingPoint = followerPath?.[retained.followerEndpointIndex];
    if (!movingPoint) return;
    const target = retainedAnchorTarget(retained.followerFixedPoint, retained.anchor.anchor, movingPoint);
    if (syncAnchoredWire(document, retained.anchor, target)) updatedWireIds.add(retained.anchor.wireId);
  });
  return updatedWireIds;
}

function captureRetainedJunctionAnchors(
  document: SchematicDocument,
  followers: readonly FollowingEndpoint[],
  initialPaths: ReadonlyMap<string, Point[]>
) {
  const captured = new Map<string, RetainedJunctionAnchor>();
  followers.forEach((attachment) => {
    const attachmentPath = initialPaths.get(attachment.wireId);
    if (!attachmentPath || attachmentPath.length !== 2) return;
    const fixedPoint = attachmentPath[attachment.endpointIndex === 0 ? 1 : 0];
    document.wires.forEach((wire) => {
      // Active/following wires already have a projected path. Capturing one as
      // a retained bridge would overwrite that path, including its fixed end.
      if (initialPaths.has(wire.id)) return;
      if (captured.has(wire.id) || !isGeneratedJunctionAnchorId(wire.id) || wire.points.length !== 2) return;
      if (Boolean(wire.temporarilyDeleted) !== Boolean(document.wires.find((item) => item.id === attachment.wireId)?.temporarilyDeleted)) return;
      if (!segmentsParallel(attachmentPath[0], attachmentPath[1], wire.points[0], wire.points[1])) return;
      const fixedEndpointIndex = wire.points.findIndex((point) => samePoint(point, fixedPoint));
      if (fixedEndpointIndex < 0) return;
      const anchorEnd = wire.points[fixedEndpointIndex === 0 ? 1 : 0];
      captured.set(wire.id, {
        anchor: {
          anchor: { ...anchorEnd },
          wireId: wire.id,
          routeMode: wire.routeMode,
          appearance: wire.appearance,
          temporarilyDeleted: wire.temporarilyDeleted
        },
        followerEndpointIndex: attachment.endpointIndex,
        followerFixedPoint: { ...fixedPoint },
        followerWireId: attachment.wireId
      });
    });
  });
  return Array.from(captured.values());
}

function retainedAnchorTarget(fixedPoint: Point, anchorEnd: Point, movingPoint: Point) {
  const direction = { x: anchorEnd.x - fixedPoint.x, y: anchorEnd.y - fixedPoint.y };
  const anchorLengthSquared = direction.x ** 2 + direction.y ** 2;
  if (anchorLengthSquared === 0) return fixedPoint;
  const projection = (movingPoint.x - fixedPoint.x) * direction.x
    + (movingPoint.y - fixedPoint.y) * direction.y;
  if (projection <= 0) return fixedPoint;
  return projection >= anchorLengthSquared ? anchorEnd : movingPoint;
}

function segmentsParallel(aStart: Point, aEnd: Point, bStart: Point, bEnd: Point) {
  const a = { x: aEnd.x - aStart.x, y: aEnd.y - aStart.y };
  const b = { x: bEnd.x - bStart.x, y: bEnd.y - bStart.y };
  return a.x * b.y === a.y * b.x;
}

function isGeneratedJunctionAnchorId(id: string) {
  return /-junction-\d+(?:-\d+)?$/.test(id);
}

function pointDistance(first: Point, second: Point) {
  return Math.abs(first.x - second.x) + Math.abs(first.y - second.y);
}

function cloneWire(wire: Wire): Wire {
  return {
    ...wire,
    points: clonePoints(wire.points),
    appearance: wire.appearance ? { ...wire.appearance } : undefined
  };
}
