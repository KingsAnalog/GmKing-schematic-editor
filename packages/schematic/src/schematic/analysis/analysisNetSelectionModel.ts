import { pointKey, wireSegments } from "../geometry";
import { resolveSchematicNets } from "../netResolution";
import type { AnalysisPortSelection, Point, SchematicDocument } from "../types";

export const VOLTAGE_NET_SEGMENT_PICK_RADIUS = 12;
export const VOLTAGE_NET_NODE_PICK_RADIUS = 18;

export interface VoltageNetPick {
  net: string;
  distance: number;
}

export function analysisPortLabel(field: keyof AnalysisPortSelection | null) {
  if (field === "inputP") return "Input +";
  if (field === "inputN") return "Input -";
  if (field === "outputP") return "Output +";
  if (field === "outputN") return "Output -";
  return "analysis port";
}

export function sortAnalysisNets(nets: Iterable<string>) {
  return Array.from(nets).sort((a, b) => (a === "0" ? -1 : b === "0" ? 1 : a.localeCompare(b)));
}

export function normalizeAnalysisPortSelection(selection: AnalysisPortSelection, nets: Iterable<string>): AnalysisPortSelection {
  const availableNets = new Set(nets);
  return {
    inputP: availableNets.has(selection.inputP) ? selection.inputP : "",
    inputN: availableNets.has(selection.inputN) ? selection.inputN : "",
    outputP: availableNets.has(selection.outputP) ? selection.outputP : "",
    outputN: availableNets.has(selection.outputN) ? selection.outputN : ""
  };
}

export function nearestVoltageNet(document: SchematicDocument, point: Point): VoltageNetPick | null {
  const workingDocument = {
    ...document,
    junctions: document.junctions.map((junction) => ({ ...junction }))
  };
  const resolution = resolveSchematicNets(workingDocument);
  const activeWires = workingDocument.wires.filter((wire) => !wire.temporarilyDeleted);

  let bestNet = "";
  let bestDistance = Number.POSITIVE_INFINITY;
  activeWires.forEach((wire) => {
    if (resolution.busWireIds.has(wire.id)) return;
    const net = resolution.wireNetNames.get(wire.id);
    if (!net) return;
    wireSegments(wire).forEach((segment) => {
      const distance = distanceToSegment(point, segment.start, segment.end);
      if (distance >= bestDistance) return;
      bestNet = net;
      bestDistance = distance;
    });
  });

  if (bestNet && bestDistance <= VOLTAGE_NET_SEGMENT_PICK_RADIUS) {
    return { net: bestNet, distance: bestDistance };
  }

  const wirePointKeys = new Set<string>();
  activeWires.forEach((wire) => {
    if (!resolution.busWireIds.has(wire.id)) wire.points.forEach((point) => wirePointKeys.add(pointKey(point)));
  });
  workingDocument.junctions.forEach((junction) => {
    if (resolution.junctionNetNames.has(pointKey(junction))) wirePointKeys.add(pointKey(junction));
  });

  resolution.nets.forEach((resolvedNet, net) => {
    if (resolvedNet.wireIds.length && resolvedNet.wireIds.every(id => resolution.busWireIds.has(id))) return;
    const points = resolvedNet.points;
    points.forEach((candidate) => {
      if (!wirePointKeys.has(pointKey(candidate))) return;
      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y);
      if (distance < bestDistance) {
        bestNet = net;
        bestDistance = distance;
      }
    });
  });

  return bestNet && bestDistance <= VOLTAGE_NET_NODE_PICK_RADIUS ? { net: bestNet, distance: bestDistance } : null;
}

function distanceToSegment(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1);
  const projection = { x: start.x + t * dx, y: start.y + t * dy };
  return Math.hypot(point.x - projection.x, point.y - projection.y);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
