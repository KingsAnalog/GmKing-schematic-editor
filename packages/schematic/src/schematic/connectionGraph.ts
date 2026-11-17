import { resolveComponentDef } from "./catalog";
import { pointKey, pointOnSegment, samePoint, segmentIntersection, snapPoint, transformPin, wireSegments } from "./geometry";
import type { Point, SchematicConnections, SchematicContent, Wire } from "./types";

export interface ConnectionWireEnd {
  wireId: string;
  index: number;
  point: Point;
}

export interface ConnectionPin {
  componentId: string;
  pinId: string;
  point: Point;
}

export interface PhysicalConnectionNode {
  id: string;
  point: Point;
  wires: ConnectionWireEnd[];
  pins: ConnectionPin[];
}

type Content = Pick<SchematicContent, "components" | "wires" | "connections">;

export function emptyConnections(): SchematicConnections {
  return { wires: Object.create(null), pins: Object.create(null) };
}

export function cloneConnections(connections: SchematicConnections): SchematicConnections {
  return {
    wires: Object.fromEntries(Object.entries(connections.wires).map(([id, nodes]) => [id, [...nodes]])),
    pins: Object.fromEntries(Object.entries(connections.pins).map(([id, pins]) => [id, { ...pins }]))
  };
}

export function connectionNodes(document: Content, includeInactive = false): Map<string, PhysicalConnectionNode> {
  const result = new Map<string, PhysicalConnectionNode>();
  const connections = document.connections;
  const node = (id: string, point: Point) => {
    let value = result.get(id);
    if (!value) {
      value = { id, point: snapPoint(point), wires: [], pins: [] };
      result.set(id, value);
    }
    return value;
  };
  document.wires.forEach(wire => {
    if (!includeInactive && wire.temporarilyDeleted) return;
    connections.wires[wire.id]?.forEach((id, index) => {
      const point = wire.points[index];
      if (point) node(id, point).wires.push({ wireId: wire.id, index, point });
    });
  });
  document.components.forEach(component => {
    if (!includeInactive && component.temporarilyDeleted) return;
    resolveComponentDef(component).pins.forEach(pin => {
      const id = connections.pins[component.id]?.[pin.id];
      if (!id) return;
      const point = transformPin(component, pin);
      node(id, point).pins.push({ componentId: component.id, pinId: pin.id, point });
    });
  });
  return result;
}

export function wireNodeAtPoint(document: Content, wireId: string, point: Point): string | undefined {
  const wire = document.wires.find(candidate => candidate.id === wireId);
  const index = wire?.points.findIndex(candidate => samePoint(candidate, point)) ?? -1;
  return index >= 0 ? document.connections.wires[wireId]?.[index] : undefined;
}

export function pinTouchesConnectedWire(document: Content, componentId: string, pinId: string, wireId: string): boolean {
  const node = document.connections.pins[componentId]?.[pinId];
  return !!node && !!document.connections.wires[wireId]?.includes(node);
}

export function wiresJoinAtPoint(document: Content, firstId: string, secondId: string, point: Point): boolean {
  const first = wireNodeAtPoint(document, firstId, point);
  return !!first && first === wireNodeAtPoint(document, secondId, point);
}

/** Prune removed objects and carry endpoint identities through path edits. No new contact is inferred. */
export function syncConnectionVertices(document: Content, before?: Content) {
  const connections = document.connections;
  const fresh = connectionIdFactory(connections);
  const oldWires = new Map(before?.wires.map(wire => [wire.id, wire]) ?? []);
  const nextWires: SchematicConnections["wires"] = Object.create(null);
  document.wires.forEach(wire => {
    const previous = connections.wires[wire.id] ?? [];
    const old = oldWires.get(wire.id);
    if (previous.length === wire.points.length) {
      nextWires[wire.id] = [...previous];
      return;
    }
    nextWires[wire.id] = wire.points.map((point, index) => {
      if (index === 0) return previous[0] ?? fresh();
      if (index === wire.points.length - 1) return previous[previous.length - 1] ?? fresh();
      const previousIndex = old?.points.findIndex(candidate => samePoint(point, candidate)) ?? -1;
      return previousIndex >= 0 ? previous[previousIndex] ?? fresh() : fresh();
    });
  });
  connections.wires = nextWires;
  const nextPins: SchematicConnections["pins"] = Object.create(null);
  document.components.forEach(component => {
    const previous = connections.pins[component.id] ?? {};
    nextPins[component.id] = Object.fromEntries(resolveComponentDef(component).pins.map(pin => [pin.id, previous[pin.id] ?? fresh()]));
  });
  connections.pins = nextPins;
}

/** Detaching a moved endpoint creates another node, even if it later occupies the same coordinate. */
function separateDisplacedNodes(document: Content) {
  const graph = document.connections;
  const fresh = connectionIdFactory(graph);
  connectionNodes(document, true).forEach(node => {
    const byPoint = new Map<string, string>();
    const at = (point: Point) => {
      const key = pointKey(point);
      let id = byPoint.get(key);
      if (!id) {
        id = byPoint.size === 0 ? node.id : fresh();
        byPoint.set(key, id);
      }
      return id;
    };
    node.wires.forEach(end => { graph.wires[end.wireId][end.index] = at(end.point); });
    node.pins.forEach(pin => { graph.pins[pin.componentId][pin.pinId] = at(pin.point); });
  });
}

export interface ConnectionEditOptions {
  wireIds: ReadonlySet<string>;
  componentIds: ReadonlySet<string>;
  /** A moved/copied group keeps its own internal connections, including deliberate disconnections. */
  preserveInternal?: boolean;
  before?: Content;
  /** Stretching may reconnect only participants of the same original physical node. */
  retained?: SchematicConnections;
}

/** Connect only contacts authored by this edit. Rendering, saving and history never call this. */
export function connectGeometry(document: Content, options: ConnectionEditOptions) {
  syncConnectionVertices(document, options.before);
  separateDisplacedNodes(document);
  const graph = document.connections;
  const fresh = connectionIdFactory(graph);
  const parent = new Map<string, string>();
  const root = (id: string): string => {
    const next = parent.get(id);
    if (!next) return id;
    const result = root(next);
    parent.set(id, result);
    return result;
  };
  const join = (a: string, b: string) => {
    const first = root(a), second = root(b);
    if (first !== second) parent.set(second, first);
  };
  const tap = (wire: Wire, point: Point) => {
    let index = wire.points.findIndex(candidate => samePoint(candidate, point));
    if (index < 0) {
      index = wire.points.findIndex((end, i) => i > 0 && pointOnSegment(point, wire.points[i - 1], end, true));
      if (index < 0) throw new Error("Connection point is outside its wire.");
      wire.points.splice(index, 0, { ...point });
      graph.wires[wire.id].splice(index, 0, fresh());
    }
    return graph.wires[wire.id][index];
  };
  const activeWires = document.wires.filter(wire => !wire.temporarilyDeleted);
  const oldWires = new Map(options.before?.wires.map(wire => [wire.id, wire]) ?? []);
  const oldComponents = new Map(options.before?.components.map(component => [component.id, component]) ?? []);
  const hadPin = (componentId: string, pinId: string) => {
    const component = oldComponents.get(componentId);
    return !!component && resolveComponentDef(component).pins.some(pin => pin.id === pinId);
  };
  const priorWireContact = (a: Wire, b: Wire, point: Point) => {
    const oldA = oldWires.get(a.id), oldB = oldWires.get(b.id);
    return oldA && oldB && onWire(point, oldA) && onWire(point, oldB);
  };
  activeWires.forEach(wire => {
    if (!options.wireIds.has(wire.id)) return;
    const firstAtPoint = new Map<string, string>();
    wire.points.forEach((point, index) => {
      const key = pointKey(point), node = graph.wires[wire.id][index];
      const previous = firstAtPoint.get(key);
      if (previous) join(previous, node);
      else firstAtPoint.set(key, node);
    });
  });
  for (let ai = 0; ai < activeWires.length; ai++) {
    const a = activeWires[ai];
    for (let bi = ai + 1; bi < activeWires.length; bi++) {
      const b = activeWires[bi];
      const changedA = options.wireIds.has(a.id), changedB = options.wireIds.has(b.id);
      if (!changedA && !changedB) continue;
      if (options.retained && !options.retained.wires[a.id]?.some(id => options.retained!.wires[b.id]?.includes(id))) continue;
      if (options.preserveInternal && changedA && changedB
        && (!options.before || (oldWires.has(a.id) && oldWires.has(b.id)))) continue;
      const contacts = new Map<string, Point>();
      wireSegments(a).forEach(sa => wireSegments(b).forEach(sb => {
        const point = segmentIntersection(sa.start, sa.end, sb.start, sb.end);
        if (point) {
          if (pointOnSegment(point, sa.start, sa.end, true) && pointOnSegment(point, sb.start, sb.end, true)) return;
          contacts.set(pointKey(point), point);
        } else {
          [sa.start, sa.end, sb.start, sb.end].forEach(candidate => {
            if (pointOnSegment(candidate, sa.start, sa.end) && pointOnSegment(candidate, sb.start, sb.end)) contacts.set(pointKey(candidate), candidate);
          });
        }
      }));
      contacts.forEach(point => {
        if (priorWireContact(a, b, point)) return;
        const id = tap(a, point);
        join(id, tap(b, point));
      });
    }
  }
  const pins = document.components.filter(component => !component.temporarilyDeleted).flatMap(component =>
    resolveComponentDef(component).pins.map(pin => ({ component, pinId: pin.id, point: transformPin(component, pin) }))
  );
  pins.forEach(pin => {
    activeWires.forEach(wire => {
      const changedPin = options.componentIds.has(pin.component.id), changedWire = options.wireIds.has(wire.id);
      if (!changedPin && !changedWire) return;
      if (options.preserveInternal && changedPin && changedWire
        && (!options.before || (hadPin(pin.component.id, pin.pinId) && oldWires.has(wire.id)))) return;
      if (options.retained && !options.retained.wires[wire.id]?.includes(options.retained.pins[pin.component.id]?.[pin.pinId])) return;
      if (!onWire(pin.point, wire)) return;
      const oldWire = oldWires.get(wire.id), oldComponent = oldComponents.get(pin.component.id);
      const oldPin = oldComponent && resolveComponentDef(oldComponent).pins.find(candidate => candidate.id === pin.pinId);
      if (oldWire && oldPin && oldComponent && samePoint(transformPin(oldComponent, oldPin), pin.point) && onWire(pin.point, oldWire)) return;
      join(graph.pins[pin.component.id][pin.pinId], tap(wire, pin.point));
    });
  });
  for (let a = 0; a < pins.length; a++) for (let b = a + 1; b < pins.length; b++) {
    const first = pins[a], second = pins[b];
    const changedA = options.componentIds.has(first.component.id), changedB = options.componentIds.has(second.component.id);
    if (!changedA && !changedB) continue;
    if (options.preserveInternal && changedA && changedB
      && (!options.before || (hadPin(first.component.id, first.pinId) && hadPin(second.component.id, second.pinId)))) continue;
    if (options.retained && options.retained.pins[first.component.id]?.[first.pinId] !== options.retained.pins[second.component.id]?.[second.pinId]) continue;
    if (!samePoint(first.point, second.point)) continue;
    const oldA = oldComponents.get(first.component.id), oldB = oldComponents.get(second.component.id);
    const pa = oldA && resolveComponentDef(oldA).pins.find(pin => pin.id === first.pinId);
    const pb = oldB && resolveComponentDef(oldB).pins.find(pin => pin.id === second.pinId);
    if (oldA && oldB && pa && pb && samePoint(transformPin(oldA, pa), transformPin(oldB, pb))) continue;
    join(graph.pins[first.component.id][first.pinId], graph.pins[second.component.id][second.pinId]);
  }
  Object.values(graph.wires).forEach(nodes => nodes.forEach((id, index) => { nodes[index] = root(id); }));
  Object.values(graph.pins).forEach(pins => Object.keys(pins).forEach(id => { pins[id] = root(pins[id]); }));
}

export function reconcileConnectionEdit(document: Content, before: Content, preserveInternal = true) {
  const oldWires = new Map(before.wires.map(wire => [wire.id, wire]));
  const oldComponents = new Map(before.components.map(component => [component.id, component]));
  const wireIds = new Set(document.wires.filter(wire => JSON.stringify(wire.points) !== JSON.stringify(oldWires.get(wire.id)?.points)
    || wire.temporarilyDeleted !== oldWires.get(wire.id)?.temporarilyDeleted).map(wire => wire.id));
  const componentIds = new Set(document.components.filter(component => {
    const old = oldComponents.get(component.id);
    return !old || component.x !== old.x || component.y !== old.y || component.rotation !== old.rotation || component.mirrored !== old.mirrored
      || component.temporarilyDeleted !== old.temporarilyDeleted || JSON.stringify(resolveComponentDef(component).pins) !== JSON.stringify(resolveComponentDef(old).pins);
  }).map(component => component.id));
  connectGeometry(document, { wireIds, componentIds, preserveInternal, before });
}

/** Disconnect branches while retaining each straight-through conductor. */
export function disconnectJunction(document: Content, point: Point) {
  const graph = document.connections;
  const fresh = connectionIdFactory(graph);
  const wires = new Map(document.wires.map(wire => [wire.id, wire]));
  connectionNodes(document).forEach(node => {
    if (!samePoint(node.point, point)) return;
    const axes = new Map<string, string>();
    node.wires.forEach(end => {
      const wire = wires.get(end.wireId)!;
      const neighbor = wire.points[end.index === 0 ? 1 : end.index - 1];
      if (!neighbor) return;
      const dx = neighbor.x - point.x, dy = neighbor.y - point.y;
      const length = Math.hypot(dx, dy);
      const sign = dx < 0 || (dx === 0 && dy < 0) ? -1 : 1;
      const axis = `${(sign * dx / length).toFixed(9)},${(sign * dy / length).toFixed(9)}`;
      let id = axes.get(axis);
      if (!id) { id = fresh(); axes.set(axis, id); }
      graph.wires[end.wireId][end.index] = id;
    });
    node.pins.forEach(pin => { graph.pins[pin.componentId][pin.pinId] = fresh(); });
  });
}

export function connectionIdFactory(graph: SchematicConnections) {
  const used = new Set([...Object.values(graph.wires).flat(), ...Object.values(graph.pins).flatMap(pins => Object.values(pins))]);
  let sequence = 0;
  return () => {
    let id: string;
    do { id = `node-${sequence++}`; } while (used.has(id));
    used.add(id);
    return id;
  };
}

export function onWire(point: Point, wire: Wire) {
  return wireSegments(wire).some(segment => pointOnSegment(point, segment.start, segment.end));
}
