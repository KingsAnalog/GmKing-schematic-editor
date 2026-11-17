import { connectionNodes } from "../connectionGraph";
import { pointKey, samePoint } from "../geometry";
import { wireBodyKindValues, appearanceForNormalizedWire } from "../wire/wireDecoration";
import type { Point, SchematicConnections, SchematicDocument, Wire } from "../types";

interface ConnectedSegment {
  wire: Wire;
  nodes: [string, string];
  line: string;
}

/** Normalize only conductors that actually share endpoints on the same straight line. */
export function normalizeConnectedWires(
  document: SchematicDocument,
  normalizeGroup: (wires: Wire[], splitPoints: Point[]) => Wire[]
): { wires: Wire[]; connections: SchematicConnections } {
  const graph = document.connections;
  const segments: ConnectedSegment[] = [];
  document.wires.forEach(wire => {
    for (let index = 1; index < wire.points.length; index++) {
      const start = wire.points[index - 1], end = wire.points[index];
      if (samePoint(start, end)) continue;
      segments.push({
        wire: { ...wire, points: [start, end], appearance: appearanceForNormalizedWire(wire, start, end) },
        nodes: [graph.wires[wire.id][index - 1], graph.wires[wire.id][index]],
        line: lineKey(start, end, wire)
      });
    }
  });
  const parents = segments.map((_, index) => index);
  const root = (index: number): number => parents[index] === index ? index : (parents[index] = root(parents[index]));
  const owners = new Map<string, number>();
  segments.forEach((segment, index) => segment.nodes.forEach(node => {
    const key = `${segment.line}@${node}`;
    const previous = owners.get(key);
    if (previous === undefined) owners.set(key, index);
    else parents[root(index)] = root(previous);
  }));
  const groups = new Map<number, ConnectedSegment[]>();
  segments.forEach((segment, index) => {
    const key = root(index);
    const group = groups.get(key) ?? [];
    group.push(segment);
    groups.set(key, group);
  });
  const allNodes = connectionNodes(document, true);
  const sourceWires = new Map(document.wires.map(wire => [wire.id, wire]));
  const retainedNodes = new Set<string>();
  allNodes.forEach(node => {
    const arms = new Set<string>(), kinds = new Set<string>();
    node.wires.forEach(end => {
      const wire = sourceWires.get(end.wireId)!;
      kinds.add(JSON.stringify([wire.routeMode, Boolean(wire.temporarilyDeleted), ...wireBodyKindValues(wire)]));
      [wire.points[end.index - 1], wire.points[end.index + 1]].forEach(neighbor => {
        if (!neighbor) return;
        const dx = neighbor.x - end.point.x, dy = neighbor.y - end.point.y, length = Math.hypot(dx, dy);
        arms.add(`${(dx / length).toFixed(9)},${(dy / length).toFixed(9)}`);
      });
    });
    if (node.pins.length || arms.size > 2 || kinds.size > 1) retainedNodes.add(node.id);
  });
  const wires: Wire[] = [];
  const bindings: SchematicConnections["wires"] = Object.create(null);
  const usedIds = new Set<string>();
  const append = (wire: Wire, nodes: string[]) => {
    let id = wire.id, suffix = 1;
    while (usedIds.has(id)) id = `${wire.id}-segment-${suffix++}`;
    usedIds.add(id);
    wires.push(id === wire.id ? wire : { ...wire, id });
    bindings[id] = nodes;
  };
  groups.forEach(group => {
    const nodesAtPoint = new Map<string, string>();
    group.forEach(segment => segment.wire.points.forEach((point, index) => {
      nodesAtPoint.set(pointKey(point), segment.nodes[index]);
    }));
    const splitPoints = [...nodesAtPoint].filter(([, id]) => retainedNodes.has(id));
    const normalized = normalizeGroup(group.map(segment => segment.wire), splitPoints.map(([key]) => parsePoint(key)));
    normalized.forEach(wire => {
      const nodes = wire.points.map(point => {
        const node = nodesAtPoint.get(pointKey(point));
        if (!node) throw new Error("Wire normalization lost a connection endpoint.");
        return node;
      });
      append(wire, nodes);
    });
  });
  return {
    wires,
    connections: {
      wires: bindings,
      pins: Object.fromEntries(Object.entries(graph.pins).map(([id, pins]) => [id, { ...pins }]))
    }
  };
}

function lineKey(start: Point, end: Point, wire: Wire) {
  let dx = end.x - start.x, dy = end.y - start.y;
  let a = Math.abs(dx), b = Math.abs(dy);
  while (b) [a, b] = [b, a % b];
  dx /= a; dy /= a;
  if (dx < 0 || (dx === 0 && dy < 0)) { dx = -dx; dy = -dy; }
  return JSON.stringify([dx, dy, dx * start.y - dy * start.x, wire.routeMode, Boolean(wire.temporarilyDeleted), ...wireBodyKindValues(wire)]);
}

function parsePoint(key: string): Point {
  const [x, y] = key.split(",").map(Number);
  return { x, y };
}
