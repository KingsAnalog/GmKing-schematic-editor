import { pointKey, pointOnSegment, snapPoint, wireSegments } from "./geometry";
import { GRID_SIZE, type NetLabel, type Point, type SchematicDocument, type Wire } from "./types";

export const NET_LABEL_FONT_SIZE = 12;
export const NET_LABEL_OFFSET_X = 6;
export const NET_LABEL_OFFSET_Y = -18;
export const NET_LABEL_HEIGHT = 18;

export function netLabelWidth(name: string) {
  return Math.max(24, Math.ceil(name.length * 7.2 + 4));
}

export function netLabelPosition(label: NetLabel) {
  return {
    x: label.attachment.point.x + NET_LABEL_OFFSET_X,
    y: label.attachment.point.y + NET_LABEL_OFFSET_Y
  };
}

export function netLabelAttachmentPointFromPosition(position: Point) {
  return snapPoint({ x: position.x - NET_LABEL_OFFSET_X, y: position.y - NET_LABEL_OFFSET_Y });
}

export function netLabelVisualBounds(label: NetLabel) {
  const position = netLabelPosition(label);
  return { x: position.x, y: position.y, width: netLabelWidth(label.name), height: NET_LABEL_HEIGHT };
}

export function wireAttachmentAtPoint(document: SchematicDocument, point: Point, preferredWireId?: string | null) {
  const snapped = snapPoint(point);
  const candidates = document.wires.filter(
    (wire) => !wire.temporarilyDeleted && wireSegments(wire).some((segment) => pointOnSegment(snapped, segment.start, segment.end))
  );
  const wire = candidates.find((candidate) => candidate.id === preferredWireId) ?? candidates[0];
  return wire ? { wireId: wire.id, point: snapped } : null;
}

export function bindStandaloneNetLabelsAtPoint(
  document: SchematicDocument,
  labels: readonly NetLabel[],
  point: Point
) {
  const standalone = labels.filter((label) => !label.attachment.wireId);
  if (standalone.length === 0) return true;
  const attachment = wireAttachmentAtPoint(document, point);
  if (!attachment) return false;
  standalone.forEach((label) => {
    label.attachment = { wireId: attachment.wireId, point: { ...attachment.point } };
  });
  return true;
}

export function remapNetLabelsAfterWireNormalization(
  document: SchematicDocument,
  previousWires: readonly Wire[],
  normalizedWires: readonly Wire[],
  sourceIds: ReadonlyMap<string, string>,
  piecesBySource: ReadonlyMap<string, Wire[]>
) {
  const previousById = new Map(previousWires.map((wire) => [wire.id, wire]));
  document.netLabels.forEach((label) => {
    if (!label.attachment.wireId) return;
    const previous = previousById.get(label.attachment.wireId);
    const point = snapPoint(label.attachment.point);
    const sourceId = label.attachment.wireId;
    const candidates = (piecesBySource.get(sourceId) ?? []).filter(wire => pointOnWire(point, wire));
    const next = candidates.find(wire => wire.id === sourceId && sourceIds.get(wire.id) === sourceId)
      ?? candidates.find(wire => sourceIds.get(wire.id) === sourceId)
      ?? candidates[0]
      ?? normalizedWires.find(wire => sameWireKind(previous, wire) && pointOnWire(point, wire))
      ?? normalizedWires.find(wire => pointOnWire(point, wire));
    if (next) label.attachment = { wireId: next.id, point };
  });
}

export function remapNetLabelsAfterWirePathChange(document: SchematicDocument, previousWires: readonly Wire[]) {
  const previousById = new Map(previousWires.map((wire) => [wire.id, wire]));
  document.netLabels.forEach((label) => {
    if (!label.attachment.wireId) return;
    const previous = previousById.get(label.attachment.wireId);
    const next = document.wires.find((wire) => wire.id === label.attachment.wireId);
    if (!previous || !next || next.temporarilyDeleted || pointOnWire(label.attachment.point, next)) return;
    const translated = uniformTranslation(previous, next);
    label.attachment.point = translated
      ? snapPoint({ x: label.attachment.point.x + translated.x, y: label.attachment.point.y + translated.y })
      : mappedPointOnChangedWire(label.attachment.point, previous, next) ?? nearestPointOnWire(label.attachment.point, next);
  });
}

export function remapNetLabelsFromWireMoveSnapshot(document: SchematicDocument, snapshot: SchematicDocument) {
  if (!document.netLabels.length) return;
  const originalLabels = new Map(snapshot.netLabels.map(label => [label.id, label]));
  const originalWires = new Map(snapshot.wires.map(wire => [wire.id, wire]));
  const currentWires = new Map(document.wires.map(wire => [wire.id, wire]));
  document.netLabels.forEach(label => {
    const original = originalLabels.get(label.id);
    if (!original?.attachment.wireId) return;
    // Always project from the start of the gesture. A shortened wire may grow
    // back, and intermediate grid rounding must not permanently move its label.
    label.attachment = { ...original.attachment, point: { ...original.attachment.point } };
    if (currentWires.has(label.attachment.wireId)) return;
    const nodes = snapshot.connections.wires[label.attachment.wireId] ?? [];
    for (const wire of document.wires) {
      const previous = originalWires.get(wire.id);
      if (!previous || wire.temporarilyDeleted) continue;
      const ends = snapshot.connections.wires[wire.id] ?? [];
      const endpoint = nodes.includes(ends[0]) ? 0
        : nodes.includes(ends[ends.length - 1]) ? wire.points.length - 1 : -1;
      if (endpoint < 0) continue;
      // A collapsed conductor hands the label to a surviving connected end.
      // Coordinate-only matching could bind it to an isolated crossing wire.
      label.attachment = { wireId: wire.id, point: { ...wire.points[endpoint] } };
      return;
    }
  });
  remapNetLabelsAfterWirePathChange(document, snapshot.wires);
}

export function snapshotNetLabelWires(document: SchematicDocument) {
  const attachedWireIds = new Set(
    document.netLabels
      .map((label) => label.attachment.wireId)
      .filter(Boolean)
  );
  if (attachedWireIds.size === 0) return [];
  return document.wires
    .filter((wire) => attachedWireIds.has(wire.id))
    .map((wire) => ({ ...wire, points: wire.points.map((point) => ({ ...point })) }));
}

function pointOnWire(point: Point, wire: Wire) {
  return wireSegments(wire).some((segment) => pointOnSegment(point, segment.start, segment.end));
}

function nearestPointOnWire(point: Point, wire: Wire) {
  let nearest = snapPoint(wire.points[0] ?? point);
  let distance = Number.POSITIVE_INFINITY;
  wireSegments(wire).forEach((segment) => {
    const projected = nearestGridPointOnSegment(point, segment.start, segment.end);
    const nextDistance = Math.hypot(projected.x - point.x, projected.y - point.y);
    if (nextDistance < distance) {
      distance = nextDistance;
      nearest = snapPoint(projected);
    }
  });
  return nearest;
}

function mappedPointOnChangedWire(point: Point, previous: Wire, next: Wire) {
  const previousSegments = wireSegments(previous).filter((segment) => pointOnSegment(point, segment.start, segment.end));
  const nextSegments = wireSegments(next);
  let bestPoint: Point | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  previousSegments.forEach((source) => {
    nextSegments.forEach((target) => {
      if (segmentOrientation(source) !== segmentOrientation(target)) return;
      const directScore = pointDistance(source.start, target.start) + pointDistance(source.end, target.end);
      const reverseScore = pointDistance(source.start, target.end) + pointDistance(source.end, target.start);
      const reverse = reverseScore < directScore;
      const score = Math.min(directScore, reverseScore);
      const fraction = segmentFraction(point, source);
      const mappedFraction = reverse ? 1 - fraction : fraction;
      const mapped = gridPointAtSegmentFraction(target.start, target.end, mappedFraction);
      if (score < bestScore) {
        bestPoint = mapped;
        bestScore = score;
      }
    });
  });
  return bestPoint;
}

function segmentOrientation(segment: { start: Point; end: Point }) {
  let dx = Math.round((segment.end.x - segment.start.x) / GRID_SIZE);
  let dy = Math.round((segment.end.y - segment.start.y) / GRID_SIZE);
  const divisor = greatestCommonDivisor(Math.abs(dx), Math.abs(dy));
  if (divisor === 0) return "point";
  dx /= divisor;
  dy /= divisor;
  if (dx < 0 || (dx === 0 && dy < 0)) {
    dx = -dx;
    dy = -dy;
  }
  return `${dx},${dy}`;
}

function segmentFraction(point: Point, segment: { start: Point; end: Point }) {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return 0;
  return clamp(
    ((point.x - segment.start.x) * dx + (point.y - segment.start.y) * dy) / lengthSquared,
    0,
    1
  );
}

function nearestGridPointOnSegment(point: Point, start: Point, end: Point) {
  return gridPointAtSegmentFraction(start, end, segmentFraction(point, { start, end }));
}

function gridPointAtSegmentFraction(start: Point, end: Point, fraction: number) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const steps = greatestCommonDivisor(
    Math.abs(Math.round(dx / GRID_SIZE)),
    Math.abs(Math.round(dy / GRID_SIZE))
  );
  if (steps === 0) return snapPoint(start);
  const step = Math.round(clamp(fraction, 0, 1) * steps);
  return snapPoint({
    x: start.x + dx * step / steps,
    y: start.y + dy * step / steps
  });
}

function greatestCommonDivisor(first: number, second: number): number {
  let a = first;
  let b = second;
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function pointDistance(first: Point, second: Point) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function uniformTranslation(previous: Wire, next: Wire) {
  if (previous.points.length !== next.points.length || previous.points.length === 0) return null;
  const delta = { x: next.points[0].x - previous.points[0].x, y: next.points[0].y - previous.points[0].y };
  return previous.points.every((point, index) => {
    const target = next.points[index];
    return target && pointKey({ x: point.x + delta.x, y: point.y + delta.y }) === pointKey(target);
  }) ? delta : null;
}

function sameWireKind(first: Wire | undefined, second: Wire) {
  if (!first) return true;
  return first.routeMode === second.routeMode
    && Boolean(first.temporarilyDeleted) === Boolean(second.temporarilyDeleted)
    && (first.appearance?.variant ?? "signal") === (second.appearance?.variant ?? "signal")
    && (first.appearance?.color ?? "") === (second.appearance?.color ?? "");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
