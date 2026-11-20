import { resolveComponentDef } from "./catalog";
import { componentPinNetlistRole } from "./pinConfigurationModel";
import { connectionNodes } from "./connectionGraph";
import { junctionId } from "./junctionIdentity";
import {
  pointKey,
  pointOnSegment,
  samePoint,
  snapPoint,
  rotatePoint,
  transformPin,
  wireSegments
} from "./geometry";
import type {
  ComponentInstance,
  NetlistPin,
  PinDef,
  Point,
  SchematicContent,
  SchematicDocument
} from "./types";

class UnionFind {
  private parents = new Map<string, string>();

  add(key: string) {
    if (!this.parents.has(key)) {
      this.parents.set(key, key);
    }
  }

  find(key: string): string {
    this.add(key);
    const parent = this.parents.get(key);
    if (!parent || parent === key) {
      return key;
    }
    const root = this.find(parent);
    this.parents.set(key, root);
    return root;
  }

  union(a: string, b: string) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) {
      this.parents.set(rootB, rootA);
    }
  }
}

interface ConnectivityPin extends NetlistPin {
  nodeKey: string;
}

export interface ConnectivityResult {
  pins: ConnectivityPin[];
  groups: Map<string, Point[]>;
  junctions: Point[];
  presentationJunctions: Point[];
  diagnostics: string[];
  junctionMembers: ReadonlyMap<string, ReadonlySet<string>>;
  rootOf(nodeKey: string): string;
  rootOfWire(wireId: string): string | null;
  rootsAtPoint(point: Point): string[];
}

export function componentPinPoint(instance: ComponentInstance, pinId: string): Point {
  const def = resolveComponentDef(instance);
  const pin = def.pins.find((candidate) => candidate.id === pinId);
  if (!pin) {
    throw new Error(`Unknown pin ${pinId} on ${instance.type}`);
  }
  return transformPin(instance, pin);
}

export function buildConnectivity(document: SchematicDocument): ConnectivityResult;
export function buildConnectivity(document: SchematicContent): ConnectivityResult;
export function buildConnectivity(document: SchematicContent): ConnectivityResult {
  return buildEndpointConnectivity(document);
}

export function buildVisibleJunctions(document: SchematicDocument): Point[];
export function buildVisibleJunctions(document: SchematicContent): Point[];
export function buildVisibleJunctions(document: SchematicContent): Point[] {
  return buildEndpointConnectivity(document).junctions;
}

export function presentationJunctions(document: SchematicDocument): Point[];
export function presentationJunctions(document: SchematicContent): Point[];
export function presentationJunctions(document: SchematicContent): Point[] {
  return buildConnectivity(document).presentationJunctions.map((point) => ({ ...point }));
}

function buildEndpointConnectivity(document: SchematicContent): ConnectivityResult {
  const uf = new UnionFind();
  const nodePoints = new Map<string, Point>();
  const wires = new Map(document.wires.filter(wire => !wire.temporarilyDeleted).map(wire => [wire.id, wire]));
  const components = new Map(document.components.filter(component => !component.temporarilyDeleted).map(component => [component.id, component]));
  const add = (key: string, point: Point) => { uf.add(key); nodePoints.set(key, snapPoint(point)); return key; };
  wires.forEach(wire => wire.points.forEach((point, index) => {
    const key = add(`w:${wire.id}:${index}`, point);
    if (index > 0) uf.union(`w:${wire.id}:0`, key);
  }));
  const pins: ConnectivityPin[] = [];
  components.forEach(component => resolveComponentDef(component).pins.forEach(pin => {
    const point = transformPin(component, pin);
    pins.push({
      componentId: component.id, componentRef: component.ref, componentType: component.type,
      pinId: pin.id, pinRole: componentPinNetlistRole(component, pin.id, pin.role), point,
      netId: "", nodeKey: add(`p:${component.id}:${pin.id}`, point)
    });
  }));
  const junctions: Point[] = [], presentationPoints: Point[] = [];
  const junctionMembers = new Map<string, Set<string>>();
  connectionNodes(document).forEach(node => {
    const members = [
      ...node.wires.map(end => `w:${end.wireId}:${end.index}`),
      ...node.pins.map(pin => `p:${pin.componentId}:${pin.pinId}`)
    ];
    members.slice(1).forEach(key => uf.union(members[0], key));
    const wireArms = new Set<string>();
    node.wires.forEach(end => {
      const wire = wires.get(end.wireId)!;
      const before = wire.points[end.index - 1], after = wire.points[end.index + 1];
      if (before) wireArms.add(directionKey(end.point, before));
      if (after) wireArms.add(directionKey(end.point, after));
    });
    const allArms = new Set(wireArms);
    node.pins.forEach(pin => {
      const component = components.get(pin.componentId)!;
      const def = resolveComponentDef(component).pins.find(candidate => candidate.id === pin.pinId)!;
      allArms.add(pinApproachDirectionKey(component, def));
    });
    const aligned = [...node.wires, ...node.pins].every(member => samePoint(member.point, node.point));
    if (!aligned) return;
    if (wireArms.size >= 3) junctions.push(node.point);
    if (allArms.size >= 3) {
      presentationPoints.push(node.point);
      const id = junctionId(node.point);
      const members = junctionMembers.get(id) ?? new Set<string>();
      // Prefer the physical conductors. Pin-only junctions follow their parent components.
      const owners = node.wires.length ? node.wires.map(wire => wire.wireId) : node.pins.map(pin => pin.componentId);
      owners.forEach(owner => members.add(owner));
      junctionMembers.set(id, members);
    }
  });
  const rootOfWire = (id: string) => wires.has(id) ? uf.find(`w:${id}:0`) : null;
  return {
    pins, groups: collectGroups(nodePoints, uf),
    junctions: uniquePoints(junctions).sort((a, b) => a.x - b.x || a.y - b.y),
    presentationJunctions: uniquePoints([...junctions, ...presentationPoints]).sort((a, b) => a.x - b.x || a.y - b.y),
    diagnostics: [], junctionMembers, rootOf: key => uf.find(key), rootOfWire,
    rootsAtPoint: point => [...new Set([
      ...[...wires.values()].filter(wire => wireSegments(wire).some(segment => pointOnSegment(point, segment.start, segment.end))).map(wire => rootOfWire(wire.id)!),
      ...pins.filter(pin => samePoint(pin.point, point)).map(pin => uf.find(pin.nodeKey))
    ])]
  };
}

function pinApproachDirectionKey(instance: ComponentInstance, pin: PinDef) {
  const horizontal = Math.abs(pin.x) >= Math.abs(pin.y) && pin.x !== 0;
  const localDirection = horizontal
    ? { x: -Math.sign(pin.x), y: 0 }
    : { x: 0, y: -Math.sign(pin.y) };
  const mirroredDirection = instance.mirrored
    ? { x: -localDirection.x, y: localDirection.y }
    : localDirection;
  const direction = rotatePoint(mirroredDirection, instance.rotation);
  return directionKey({ x: 0, y: 0 }, direction);
}

function collectGroups(nodePoints: Map<string, Point>, uf: UnionFind) {
  const groups = new Map<string, Point[]>();
  nodePoints.forEach((point, nodeKey) => {
    const root = uf.find(nodeKey);
    groups.set(root, uniquePoints([...(groups.get(root) ?? []), point]));
  });
  groups.forEach((points, root) => {
    groups.set(root, points.sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x)));
  });
  return groups;
}

function uniquePoints(points: Point[]) {
  const seen = new Set<string>();
  const result: Point[] = [];
  points.forEach((point) => {
    const snapped = snapPoint(point);
    const key = pointKey(snapped);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(snapped);
  });
  return result;
}

function directionKey(from: Point, to: Point) {
  const dx = Math.round(to.x - from.x);
  const dy = Math.round(to.y - from.y);
  const divisor = greatestCommonDivisor(Math.abs(dx), Math.abs(dy));
  if (divisor > 0) return `${dx / divisor},${dy / divisor}`;
  return "0,0";
}

function greatestCommonDivisor(first: number, second: number): number {
  let a = first;
  let b = second;
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}
