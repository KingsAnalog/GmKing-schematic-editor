import type { Point, Wire } from "../types";
import { wireStrokeWidth } from "./wireDecoration";

interface Segment {
  wire: Wire;
  index: number;
  order: number;
  start: Point;
  dx: number;
  dy: number;
  length: number;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

interface Hop {
  distance: number;
  radius: number;
  lower: Segment;
  lowerDistance: number;
}

interface Span {
  start: number;
  end: number;
  bridge?: boolean;
}

const EPSILON = 1e-7;
const CIRCLE_CONTROL = 0.55228475;

/** Finds visual bridges between visible wires in bottom-to-top paint order. */
export function wireHopPaths(wires: readonly Wire[], junctions: readonly Point[]) {
  const segments = wires.flatMap((wire, order) => wire.temporarilyDeleted ? [] : wire.points.slice(1).map((end, index): Segment => {
    const start = wire.points[index];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    return {
      wire, index, order, start, dx, dy, length: Math.hypot(dx, dy),
      minX: Math.min(start.x, end.x), maxX: Math.max(start.x, end.x),
      minY: Math.min(start.y, end.y), maxY: Math.max(start.y, end.y)
    };
  })).sort((a, b) => a.minX - b.minX);
  const crossings = new Map<Segment, Hop[]>();
  const junctionKeys = new Set(junctions.map(({ x, y }) => pointKey(x, y)));

  for (const [index, first] of segments.entries()) {
    for (let next = index + 1; next < segments.length && segments[next].minX <= first.maxX; next++) {
      const second = segments[next];
      if (first.wire === second.wire || first.maxY < second.minY || second.maxY < first.minY) continue;
      const [lower, upper] = first.order < second.order ? [first, second] : [second, first];
      const hit = crossingDistance(upper, lower, junctionKeys);
      if (!hit) continue;
      const radius = Math.max(5, (wireStrokeWidth(upper.wire) + wireStrokeWidth(lower.wire)) / 2 + 2);
      const hops = crossings.get(upper) ?? [];
      hops.push({ ...hit, lower, radius });
      crossings.set(upper, hops);
    }
  }

  const spans = new Map<Segment, Span[]>();
  const byWire = new Map<string, Map<number, string[]>>();
  for (const segment of segments.sort((a, b) => b.order - a.order)) {
    const hops = crossings.get(segment) ?? [];
    const parts = spans.get(segment) ?? [];
    const distances = [...new Set(hops.map(hop => hop.distance))].sort((a, b) => a - b);
    for (const [index, distance] of distances.entries()) {
      const bridges = hops.filter(hop => hop.distance === distance);
      const before = index > 0 ? (distance - distances[index - 1]) / 2 : distance;
      const after = index + 1 < distances.length ? (distances[index + 1] - distance) / 2 : segment.length - distance;
      const limit = Math.min(before, after) - 0.5;
      const radius = Math.min(limit, ...bridges.map(hop => {
        const clearance = jumpClearance(segment, hop.lower);
        return Math.min(hop.radius, hop.lowerDistance - clearance, hop.lower.length - hop.lowerDistance - clearance);
      }));
      if (radius < Math.max(2, wireStrokeWidth(segment.wire) / 2 + 0.5)) continue;
      if (parts.some(part => distance - radius < part.end && distance + radius > part.start)) continue;
      parts.push({ start: distance - radius, end: distance + radius, bridge: true });
      for (const hop of bridges) {
        const halfGap = radius + jumpClearance(segment, hop.lower);
        const lowerParts = spans.get(hop.lower) ?? [];
        lowerParts.push({ start: hop.lowerDistance - halfGap, end: hop.lowerDistance + halfGap });
        spans.set(hop.lower, lowerParts);
      }
    }
    if (!parts.length) continue;
    const paths = byWire.get(segment.wire.id) ?? new Map<number, string[]>();
    paths.set(segment.index, segmentCommands(segment, parts));
    byWire.set(segment.wire.id, paths);
  }
  return new Map(wires.flatMap(wire => {
    const parts = byWire.get(wire.id);
    if (!parts) return [];
    const path = [`M ${svgPoint(wire.points[0])}`];
    wire.points.slice(1).forEach((end, index) => path.push(...(parts.get(index) ?? []), `L ${svgPoint(end)}`));
    return [[wire.id, path.join(" ")] as const];
  }));
}

function jumpClearance(upper: Segment, lower: Segment) {
  return (wireStrokeWidth(upper.wire) + wireStrokeWidth(lower.wire)) / 2 + 1;
}

function pointKey(x: number, y: number) {
  return `${Math.round(x / EPSILON)},${Math.round(y / EPSILON)}`;
}

function crossingDistance(upper: Segment, lower: Segment, junctions: ReadonlySet<string>) {
  const determinant = upper.dx * lower.dy - upper.dy * lower.dx;
  if (Math.abs(determinant) < EPSILON) return null;
  const x = lower.start.x - upper.start.x;
  const y = lower.start.y - upper.start.y;
  const t = (x * lower.dy - y * lower.dx) / determinant;
  const u = (x * upper.dy - y * upper.dx) / determinant;
  if (t <= EPSILON || t >= 1 - EPSILON || u <= EPSILON || u >= 1 - EPSILON) return null;
  if (junctions.has(pointKey(upper.start.x + t * upper.dx, upper.start.y + t * upper.dy))) return null;
  return { distance: t * upper.length, lowerDistance: u * lower.length };
}

function segmentCommands({ start, dx, dy, length }: Segment, parts: Span[]) {
  const ux = dx / length;
  const uy = dy / length;
  const direction = ux < -EPSILON || (Math.abs(ux) <= EPSILON && uy < 0) ? 1 : -1;
  const point = (along: number, offset = 0) => svgPoint({
    x: start.x + along * ux - offset * uy * direction,
    y: start.y + along * uy + offset * ux * direction
  });
  const ordered: Span[] = [];
  for (const part of parts.sort((a, b) => a.start - b.start)) {
    const last = ordered.at(-1);
    if (last && !last.bridge && !part.bridge && part.start <= last.end) {
      last.end = Math.max(last.end, part.end);
    } else {
      ordered.push(part);
    }
  }
  return ordered.flatMap(({ start, end, bridge }) => {
    if (!bridge) return [`L ${point(start)}`, `M ${point(end)}`];
    const distance = (start + end) / 2;
    const r = (end - start) / 2;
    const handle = r * CIRCLE_CONTROL;
    return [
      `L ${point(start)}`,
      `C ${point(start, handle)} ${point(distance - handle, r)} ${point(distance, r)}`,
      `C ${point(distance + handle, r)} ${point(end, handle)} ${point(end)}`
    ];
  });
}

function svgPoint({ x, y }: Point) {
  return `${Math.round(x * 1000) / 1000} ${Math.round(y * 1000) / 1000}`;
}
