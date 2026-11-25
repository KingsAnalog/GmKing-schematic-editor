import { samePoint, snapPoint } from "../geometry";
import type { Point, SchematicContent, SchematicDocument, Wire } from "../types";
import { normalizeWirePath } from "../wire/wireGeometry";
import {
  appearanceForNormalizedWire,
  compactWireAppearance,
  resolvedWireAppearance,
  wireBodyKindValues
} from "../wire/wireDecoration";
import { remapNetLabelsAfterWireNormalization } from "../netLabelModel";
import { reconcileConnectionEdit, syncConnectionVertices } from "../connectionGraph";
import { buildConnectivity } from "../connectivity";
import { junctionId, junctionPointFromId } from "../junctionIdentity";
import { normalizeConnectedWires, type NormalizedWirePiece } from "./connectedDocumentWires";

interface SourceSegment {
  start: Point;
  end: Point;
  wire: Wire;
  order: number;
}

interface LineGroup {
  direction: Point;
  origin: Point;
  segments: SourceSegment[];
}

interface Interval {
  low: number;
  high: number;
}

export function normalizeDocumentWires(document: SchematicDocument): Wire[] {
  return normalizeConnectedWires(document, normalizeWireGroup).wires;
}

function normalizeWireGroup(wires: Wire[], splitPoints: Point[]): NormalizedWirePiece[] {
  const groups = groupCollinearSegments(expandSourceSegments(wires));
  return makeWireIdsUnique([...groups.values()].flatMap(group => atomicWiresForGroup(group, splitPoints)));
}

export function applyNormalizedDocumentWires(document: SchematicDocument): Wire[] {
  const previous = document.wires;
  syncConnectionVertices(document);
  const result = normalizeConnectedWires(document, normalizeWireGroup);
  const normalized = result.wires;
  remapNetLabelsAfterWireNormalization(document, previous, normalized, result.sourceIds, result.piecesBySource);
  const previousStates = document.layerObjectStates;
  if (previousStates) {
    const states = { ...previousStates };
    previous.forEach(wire => { delete states[wire.id]; });
    for (const [id, sourceId] of result.sourceIds) {
      if (Object.hasOwn(previousStates, sourceId)) states[id] = { ...previousStates[sourceId] };
    }
    document.layerObjectStates = Object.keys(states).length ? states : undefined;
  }
  document.wires = normalized;
  document.connections = result.connections;
  return normalized;
}

export function reconcileDocumentConnectionEdit(document: SchematicContent, before: SchematicContent) {
  const states = document.layerObjectStates;
  const tracked = states && Object.keys(states).some(junctionPointFromId)
    ? buildConnectivity(before).junctionNodes
    : null;
  reconcileConnectionEdit(document, before);
  if (!tracked || !states) return;

  const { junctionNodes, junctionMembers } = buildConnectivity(document);
  const stationary = new Set<string>();
  for (const [nodeId, point] of tracked) {
    const next = junctionNodes.get(nodeId);
    if (next && samePoint(point, next)) stationary.add(junctionId(point));
  }
  const nextStates = { ...states };
  const transfers: Array<[string, string]> = [];
  for (const [nodeId, from] of tracked) {
    const oldId = junctionId(from);
    if (!Object.hasOwn(states, oldId)) continue;
    const to = junctionNodes.get(nodeId);
    if (stationary.has(oldId) || (!to && junctionMembers.has(oldId))) continue;
    delete nextStates[oldId];
    if (to) transfers.push([oldId, junctionId(to)]);
  }
  for (const [oldId, newId] of transfers) {
    // A pre-existing junction at the destination keeps its own display state.
    if (!stationary.has(newId) && !Object.hasOwn(nextStates, newId)) nextStates[newId] = { ...states[oldId] };
  }
  document.layerObjectStates = Object.keys(nextStates).length ? nextStates : undefined;
}

function expandSourceSegments(wires: readonly Wire[]) {
  const segments: SourceSegment[] = [];
  wires.forEach((wire, wireIndex) => {
    const points = normalizeWirePath(wire.points);
    for (let segmentIndex = 0; segmentIndex < points.length - 1; segmentIndex += 1) {
      const start = points[segmentIndex];
      const end = points[segmentIndex + 1];
      if (samePoint(start, end)) continue;
      segments.push({ start, end, wire: { ...wire, points }, order: wireIndex * 1000 + segmentIndex });
    }
  });
  return segments;
}

function groupCollinearSegments(segments: readonly SourceSegment[]) {
  const groups = new Map<string, LineGroup>();
  segments.forEach((segment) => {
    const direction = canonicalLineDirection(segment.start, segment.end);
    const lineOffset = direction.x * segment.start.y - direction.y * segment.start.x;
    const key = JSON.stringify([direction.x, direction.y, lineOffset, wireKindKey(segment.wire)]);
    const group = groups.get(key) ?? { direction, origin: segment.start, segments: [] };
    group.segments.push(segment);
    groups.set(key, group);
  });
  return groups;
}

function atomicWiresForGroup(group: LineGroup, topologyNodes: readonly Point[]) {
  const unions = mergeIntervals(group.segments.map((segment) => segmentInterval(segment, group)));
  return unions.flatMap((union) => {
    const unionSources = group.segments
      .filter((segment) => intervalsOverlap(segmentInterval(segment, group), union));
    const unionOwner = unionSources
      .reduce((latest, segment) => (segment.order > latest.order ? segment : latest));
    const atomicIntervals = splitInterval(union, group, topologyNodes);

    const wires = atomicIntervals.map((interval) => {
      const midpoint = (interval.low + interval.high) / 2;
      const owners = group.segments.filter((segment) => intervalContains(segmentInterval(segment, group), midpoint));
      const owner = owners.reduce(
        (latest, segment) => (segment.order > latest.order ? segment : latest),
        owners[0] ?? unionOwner
      );
      const direction = coordinate(owner.end, group) >= coordinate(owner.start, group) ? 1 : -1;
      const points = direction > 0
        ? [pointOnLine(group, interval.low), pointOnLine(group, interval.high)]
        : [pointOnLine(group, interval.high), pointOnLine(group, interval.low)];
      const appearanceSources = group.segments.filter((segment) =>
        intervalsOverlapInterior(segmentInterval(segment, group), interval)
      );
      return {
        sourceId: owner.wire.id,
        wire: {
          ...owner.wire,
          id: atomicWireBaseId(owner.wire.id),
          points,
          appearance: mergedAppearanceForAtomicWire(appearanceSources, owner, points[0], points[1], group)
        }
      };
    });
    // Anchor ordering to the spatially first interval. The last source's direction
    // can change on each pass when adjacent wires were drawn in opposite directions.
    const first = wires[0];
    if (first && coordinate(first.wire.points[1], group) < coordinate(first.wire.points[0], group)) wires.reverse();
    return wires;
  });
}

function mergedAppearanceForAtomicWire(
  sources: readonly SourceSegment[],
  owner: SourceSegment,
  atomicStart: Point,
  atomicEnd: Point,
  group: LineGroup
) {
  if (sources.length === 1) {
    return appearanceForNormalizedWire(sources[0].wire, atomicStart, atomicEnd);
  }

  const atomicInterval = pointInterval(atomicStart, atomicEnd, group);
  const atomicDirection = Math.sign(
    coordinate(atomicEnd, group) - coordinate(atomicStart, group)
  );
  let startMarker: ReturnType<typeof resolvedWireAppearance>["startMarker"] = "default";
  let endMarker: ReturnType<typeof resolvedWireAppearance>["endMarker"] = "default";
  let digitalSource: { appearance: ReturnType<typeof resolvedWireAppearance>; raw: Wire["appearance"] } | undefined;

  [...sources].sort((left, right) => left.order - right.order).forEach((source) => {
    const raw = appearanceForNormalizedWire(source.wire, source.start, source.end);
    const appearance = resolvedWireAppearance({ appearance: raw });
    const sourceDirection = Math.sign(
      coordinate(source.end, group) - coordinate(source.start, group)
    );
    const aligned = sourceDirection === atomicDirection;
    const sourceStartMarker = intervalContains(
      atomicInterval,
      coordinate(source.start, group)
    ) ? appearance.startMarker : "default";
    const sourceEndMarker = intervalContains(
      atomicInterval,
      coordinate(source.end, group)
    ) ? appearance.endMarker : "default";
    const candidateStart = aligned ? sourceStartMarker : sourceEndMarker;
    const candidateEnd = aligned ? sourceEndMarker : sourceStartMarker;
    if (candidateStart !== "default") startMarker = candidateStart;
    if (candidateEnd !== "default") endMarker = candidateEnd;
    if (appearance.digitalSlash) digitalSource = { appearance, raw };
  });

  const ownerAppearance = resolvedWireAppearance(owner.wire);
  if (
    !owner.wire.appearance &&
    startMarker === "default" &&
    endMarker === "default" &&
    !digitalSource
  ) {
    return undefined;
  }

  return compactWireAppearance({
    variant: ownerAppearance.variant,
    ...(ownerAppearance.color ? { color: ownerAppearance.color } : {}),
    lineWidth: ownerAppearance.lineWidth,
    startMarker,
    endMarker,
    digitalSlash: Boolean(digitalSource),
    ...(digitalSource?.raw?.digitalLabel !== undefined
      ? { digitalLabel: digitalSource.appearance.digitalLabel }
      : {})
  });
}

function intervalsOverlap(first: Interval, second: Interval) {
  return first.low <= second.high && second.low <= first.high;
}

function intervalsOverlapInterior(first: Interval, second: Interval) {
  return first.low < second.high && second.low < first.high;
}

function intervalContains(interval: Interval, value: number) {
  return value >= interval.low && value <= interval.high;
}

function mergeIntervals(intervals: Interval[]) {
  const ordered = intervals.sort((left, right) => left.low - right.low || left.high - right.high);
  const merged: Interval[] = [];
  ordered.forEach((interval) => {
    const previous = merged[merged.length - 1];
    if (!previous || interval.low > previous.high) {
      merged.push({ ...interval });
      return;
    }
    previous.high = Math.max(previous.high, interval.high);
  });
  return merged;
}

function splitInterval(interval: Interval, group: LineGroup, topologyNodes: readonly Point[]) {
  const splitCoordinates = new Set([interval.low, interval.high]);
  topologyNodes.forEach((point) => {
    if (!pointOnGroupLine(point, group)) return;
    const value = coordinate(point, group);
    if (value > interval.low && value < interval.high) splitCoordinates.add(value);
  });
  const ordered = Array.from(splitCoordinates).sort((left, right) => left - right);
  return ordered.slice(1).map((high, index) => ({ low: ordered[index], high }));
}

function segmentInterval(segment: SourceSegment, group: LineGroup): Interval {
  return pointInterval(segment.start, segment.end, group);
}

function pointInterval(firstPoint: Point, secondPoint: Point, group: LineGroup): Interval {
  const first = coordinate(firstPoint, group);
  const second = coordinate(secondPoint, group);
  return { low: Math.min(first, second), high: Math.max(first, second) };
}

function coordinate(point: Point, group: LineGroup) {
  return point.x * group.direction.x + point.y * group.direction.y;
}

function pointOnLine(group: LineGroup, value: number): Point {
  const originValue = coordinate(group.origin, group);
  const lengthSquared = group.direction.x ** 2 + group.direction.y ** 2;
  const scale = (value - originValue) / lengthSquared;
  return snapPoint({
    x: group.origin.x + group.direction.x * scale,
    y: group.origin.y + group.direction.y * scale
  });
}

function pointOnGroupLine(point: Point, group: LineGroup) {
  return group.direction.x * (point.y - group.origin.y)
    === group.direction.y * (point.x - group.origin.x);
}

function canonicalLineDirection(start: Point, end: Point): Point {
  let dx = Math.round(end.x - start.x);
  let dy = Math.round(end.y - start.y);
  const divisor = greatestCommonDivisor(Math.abs(dx), Math.abs(dy));
  dx /= divisor;
  dy /= divisor;
  if (dx < 0 || (dx === 0 && dy < 0)) {
    dx = -dx;
    dy = -dy;
  }
  return { x: dx, y: dy };
}

function greatestCommonDivisor(first: number, second: number): number {
  let a = first;
  let b = second;
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function wireKindKey(wire: Wire) {
  return JSON.stringify([
    wire.routeMode,
    Boolean(wire.temporarilyDeleted),
    ...wireBodyKindValues(wire)
  ]);
}

function atomicWireBaseId(id: string) {
  let baseId = id;
  while (/-segment-\d+$/.test(baseId)) baseId = baseId.replace(/-segment-\d+$/, "");
  return baseId;
}

function makeWireIdsUnique(pieces: NormalizedWirePiece[]) {
  const usedIds = new Set<string>();
  return pieces.map(({ wire, sourceId }) => {
    let id = wire.id;
    let suffix = 1;
    while (usedIds.has(id)) id = `${wire.id}-segment-${suffix++}`;
    usedIds.add(id);
    return { sourceId, wire: id === wire.id ? wire : { ...wire, id } };
  });
}
