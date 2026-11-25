import { buildConnectivity, type ConnectivityResult } from "./connectivity";
import { netMembers, parseBusName } from "./busName";
import { pointKey, snapPoint } from "./geometry";
import { blockPorts, PORT_TERMINAL, sheetPorts } from "./hierarchyPins";
import { pointOnPath } from "./wire/wireGeometry";
import type {
  NetLabel,
  NetlistPin,
  Point,
  SchematicContent,
  SchematicDocument
} from "./types";

export type NetLabelStatus = "valid" | "conflict" | "inactive";

export interface ResolvedNetLabel {
  label: NetLabel;
  status: NetLabelStatus;
  physicalRoot?: string;
  netName?: string;
  netNames?: readonly string[];
  message?: string;
}

export interface ResolvedNet {
  name: string;
  physicalRoots: string[];
  points: Point[];
  pins: NetlistPin[];
  wireIds: string[];
  labelIds: string[];
  explicit: boolean;
}

export interface NetResolution {
  connectivity: ConnectivityResult;
  nets: Map<string, ResolvedNet>;
  nameByPhysicalRoot: Map<string, string>;
  wireNetNames: Map<string, string>;
  junctionNetNames: Map<string, string>;
  pinNetNames: Map<string, string>;
  pinMembers: Map<string, string[]>;
  busWireIds: ReadonlySet<string>;
  widthMismatches: { pin: NetlistPin; expected: number; actual: number }[];
  labelStates: Map<string, ResolvedNetLabel>;
  hasReferenceGround: boolean;
}

class RootUnionFind {
  private readonly parents = new Map<string, string>();

  constructor(roots: Iterable<string>) {
    for (const root of roots) this.parents.set(root, root);
  }

  find(root: string): string {
    const parent = this.parents.get(root) ?? root;
    if (parent === root) return root;
    const resolved = this.find(parent);
    this.parents.set(root, resolved);
    return resolved;
  }

  union(first: string, second: string) {
    const firstRoot = this.find(first);
    const secondRoot = this.find(second);
    if (firstRoot !== secondRoot) this.parents.set(secondRoot, firstRoot);
  }
}

export function validateNetLabelName(value: string) {
  const name = value.trim();
  if (!name) return { valid: false as const, name, message: "Label name is required." };
  if (!/^[A-Za-z0-9_!<>[\]:+-]+$/.test(name)) {
    return {
      valid: false as const,
      name,
      message: "Use letters, digits, _, or ! < > [ ] : + -. Whitespace is not allowed."
    };
  }
  if (/[<>]/.test(name)) {
    const bus = parseBusName(name);
    if (!bus) {
      return { valid: false as const, name, message: "Use a bus name like OUT<7:0> or OUT<3>. A bus may contain up to 256 bits." };
    }
    return { valid: true as const, name: bus.name };
  }
  return { valid: true as const, name };
}

export function resolveSchematicNets(
  document: SchematicDocument,
  connectivity?: ConnectivityResult
): NetResolution;
export function resolveSchematicNets(
  document: SchematicContent,
  connectivity?: ConnectivityResult
): NetResolution;
export function resolveSchematicNets(
  document: SchematicContent,
  connectivity: ConnectivityResult = buildConnectivity(document)
): NetResolution {
  type Pin = ConnectivityResult["pins"][number];
  interface Lane { id: string; root?: string; point?: Point }
  type ActiveLabel = { label: NetLabel; name: string; bits: readonly string[] };
  const allWires = new Map(document.wires.map(wire => [wire.id, wire]));
  const wires = document.wires.filter(wire => !wire.temporarilyDeleted);
  const labelStates = new Map<string, ResolvedNetLabel>();
  const labelsByRoot = new Map<string, ActiveLabel[]>();
  for (const label of document.netLabels ?? []) {
    const wire = allWires.get(label.attachment.wireId);
    const root = wire && !wire.temporarilyDeleted && pointOnPath(snapPoint(label.attachment.point), wire.points)
      ? connectivity.rootOfWire(wire.id) : null;
    if (!root) {
      labelStates.set(label.id, { label, status: "inactive", message: wire?.temporarilyDeleted
        ? "The supporting wire is temporarily deleted." : "The label is not attached to an active wire." });
      continue;
    }
    const validation = validateNetLabelName(label.name);
    if (!validation.valid) {
      labelStates.set(label.id, { label, physicalRoot: root, status: "conflict", message: validation.message });
      continue;
    }
    append(labelsByRoot, root, { label, name: validation.name, bits: netMembers(validation.name) });
  }

  const declaredPins = new Map<string, { width: number; name: string; formalBits?: readonly string[] }>();
  for (const port of sheetPorts(document.components)) {
    const bus = parseBusName(port.name);
    declaredPins.set(pinKey(port.id, PORT_TERMINAL), {
      width: bus?.bits.length ?? 1, name: bus?.name ?? port.name, formalBits: bus?.bits
    });
  }
  for (const component of document.components) {
    if (component.type !== "sheetBlock" || component.temporarilyDeleted) continue;
    for (const port of blockPorts(component)) {
      declaredPins.set(pinKey(component.id, port.id), { width: netMembers(port.name).length, name: port.name });
    }
  }

  const pinsByRoot = new Map<string, Pin[]>();
  for (const pin of connectivity.pins) append(pinsByRoot, connectivity.rootOf(pin.nodeKey), pin);
  const laneNames = new Map<string, string[]>();
  const lanes: Lane[] = [];
  const lanesByRoot = new Map<string, string[]>();
  const lanesByPin = new Map<string, string[]>();
  const bundleLabels = new Map<string, string>();
  const widthMismatches: NetResolution["widthMismatches"] = [];
  for (const root of connectivity.groups.keys()) {
    const rootPins = pinsByRoot.get(root) ?? [];
    const rootLabels = labelsByRoot.get(root) ?? [];
    const grounded = rootPins.some(pin => pin.componentType === "gnd" || pin.pinRole === "gnd");
    const firstDeclaredBus = rootPins.map(pin => declaredPins.get(pinKey(pin.componentId, pin.pinId)))
      .find(declaration => declaration && declaration.width > 1);
    const width = grounded ? 1 : firstDeclaredBus?.width ?? rootLabels[0]?.bits.length ?? 1;
    const laneIds = Array.from({ length: width }, () => {
      const id = String(lanes.length);
      lanes.push({ id, root });
      return id;
    });
    lanesByRoot.set(root, laneIds);

    const winner = rootLabels.find(entry => entry.bits.length === width && (!grounded || entry.name === "0"));
    const bundleName = winner?.name ?? firstDeclaredBus?.name;
    if (width > 1 && bundleName) bundleLabels.set(root, bundleName);
    if (grounded) append(laneNames, laneIds[0], "0");
    winner?.bits.forEach((name, index) => append(laneNames, laneIds[index], name));
    for (const entry of rootLabels) {
      const valid = entry.name === winner?.name;
      labelStates.set(entry.label.id, {
        label: entry.label, status: valid ? "valid" : "conflict", physicalRoot: root,
        message: valid ? undefined : grounded ? `Ground is always named 0; ${entry.name} is ignored.`
          : entry.bits.length !== width ? `Label ${entry.name} has ${entry.bits.length} bit(s); this wire carries ${width}.`
          : `${winner?.name} is the earlier label on this physical net; ${entry.name} is ignored.`
      });
    }

    for (const pin of rootPins) {
      const key = pinKey(pin.componentId, pin.pinId);
      const declaration = declaredPins.get(key);
      const expected = declaration?.width ?? 1;
      let pinLanes = laneIds;
      if (expected !== width) {
        widthMismatches.push({ pin, expected, actual: width });
        pinLanes = Array.from({ length: expected }, () => {
          const id = String(lanes.length);
          lanes.push({ id, point: pin.point });
          return id;
        });
      }
      lanesByPin.set(key, pinLanes);
      declaration?.formalBits?.forEach((name, index) => append(laneNames, pinLanes[index], name));
    }
  }

  const connected = new RootUnionFind(lanes.map(lane => lane.id));
  const firstLaneByName = new Map<string, string>();
  for (const [lane, names] of laneNames) {
    for (const name of names) {
      const first = firstLaneByName.get(name);
      if (first === undefined) firstLaneByName.set(name, lane);
      else connected.union(first, lane);
    }
  }
  const groups = new Map<string, Lane[]>();
  for (const lane of lanes) append(groups, connected.find(lane.id), lane);
  const pinsByGroup = new Map<string, Pin[]>();
  for (const pin of connectivity.pins) {
    const ids = lanesByPin.get(pinKey(pin.componentId, pin.pinId)) ?? [];
    for (const group of new Set(ids.map(id => connected.find(id)))) append(pinsByGroup, group, pin);
  }
  const wireIdsByRoot = new Map<string, string[]>();
  for (const { id } of wires) {
    const root = connectivity.rootOfWire(id);
    if (root) append(wireIdsByRoot, root, id);
  }
  const labelIdsByGroup = new Map<string, string[]>();
  for (const [id, state] of labelStates) {
    if (state.status !== "valid" || state.physicalRoot === undefined) continue;
    for (const group of new Set(lanesByRoot.get(state.physicalRoot)?.map(lane => connected.find(lane)))) {
      append(labelIdsByGroup, group, id);
    }
  }

  const sortedGroups = [...groups].map(([id, members]) => {
    const roots = [...new Set(members.flatMap(lane => lane.root === undefined ? [] : [lane.root]))];
    const firstPoint = members.reduce((first, lane) => lane.point && comparePoints(lane.point, first) < 0 ? lane.point : first,
      firstPointForRoots(roots, connectivity));
    return { id, members, roots, firstPoint };
  }).sort((a, b) => comparePoints(a.firstPoint, b.firstPoint));
  const usedNames = new Set(firstLaneByName.keys());
  const nets = new Map<string, ResolvedNet>();
  const nameByLane = new Map<string, string>();
  let pureWireIndex = 0;
  for (const { id, members, roots } of sortedGroups) {
    const aliases = members.flatMap(lane => laneNames.get(lane.id) ?? []);
    const explicit = aliases.includes("0") ? "0" : aliases[0];
    const pins = pinsByGroup.get(id) ?? [];
    const name = explicit ?? uniqueName(automaticPinName(pins) || `NET_${++pureWireIndex}`, usedNames);
    usedNames.add(name);
    for (const lane of members) nameByLane.set(lane.id, name);
    const points = uniquePoints([...roots.flatMap(root => connectivity.groups.get(root) ?? []),
      ...members.flatMap(lane => lane.point ? [lane.point] : [])]);
    nets.set(name, { name, physicalRoots: roots, points, pins,
      wireIds: roots.flatMap(root => wireIdsByRoot.get(root) ?? []),
      labelIds: labelIdsByGroup.get(id) ?? [], explicit: explicit !== undefined });
  }

  const membersFor = (ids: readonly string[] = []) => ids.map(id => nameByLane.get(id)!);
  const displayNameFor = (root: string) => {
    const names = membersFor(lanesByRoot.get(root));
    return names.length > 1 ? bundleLabels.get(root) ?? names.join(", ") : names[0];
  };
  const nameByPhysicalRoot = new Map<string, string>();
  const wireNetNames = new Map<string, string>();
  const busWireIds = new Set<string>();
  for (const [root, ids] of lanesByRoot) {
    const name = displayNameFor(root);
    if (name) nameByPhysicalRoot.set(root, name);
    for (const wire of wireIdsByRoot.get(root) ?? []) {
      if (name) wireNetNames.set(wire, name);
      if (ids.length > 1) busWireIds.add(wire);
    }
  }
  const junctionNetNames = new Map<string, string>();
  for (const point of connectivity.junctions) {
    const names = new Set(connectivity.rootsAtPoint(point)
      .filter(root => lanesByRoot.get(root)?.length === 1).map(root => nameByPhysicalRoot.get(root)).filter(Boolean));
    if (names.size === 1) junctionNetNames.set(pointKey(point), Array.from(names)[0]!);
  }
  const pinMembers = new Map<string, string[]>();
  const pinNetNames = new Map<string, string>();
  for (const [key, ids] of lanesByPin) {
    const names = membersFor(ids);
    pinMembers.set(key, names);
    if (names.length === 1) pinNetNames.set(key, names[0]);
  }
  for (const state of labelStates.values()) {
    if (!state.physicalRoot) continue;
    state.netName = displayNameFor(state.physicalRoot);
    state.netNames = membersFor(lanesByRoot.get(state.physicalRoot));
  }

  return { connectivity, nets, nameByPhysicalRoot, wireNetNames, junctionNetNames, pinNetNames,
    pinMembers, busWireIds, widthMismatches, labelStates, hasReferenceGround: nets.has("0") };
}

export function netNameForJunction(resolution: NetResolution, point: Point) {
  return resolution.junctionNetNames.get(pointKey(snapPoint(point))) ?? "";
}

export function netNameForPin(resolution: NetResolution, componentId: string, pinId: string) {
  return resolution.pinNetNames.get(pinKey(componentId, pinId)) ?? "";
}

export function netMembersForPin(resolution: NetResolution, componentId: string, pinId: string) {
  return resolution.pinMembers.get(pinKey(componentId, pinId)) ?? [];
}

function append<T>(map: Map<string, T[]>, key: string, item: T) {
  const entries = map.get(key);
  if (entries) entries.push(item);
  else map.set(key, [item]);
}

function automaticPinName(pins: NetlistPin[]) {
  const candidates = pins
    .filter((pin) => pin.pinRole !== "gnd")
    .map((pin) => ({ pin, tier: pin.pinRole === "p" || pin.pinRole === "n" ? 1 : 0 }))
    .sort((a, b) =>
      a.tier - b.tier
      || naturalCompare(a.pin.componentRef, b.pin.componentRef)
      || naturalCompare(a.pin.pinId, b.pin.pinId)
    );
  const first = candidates[0]?.pin;
  if (!first) return "";
  return `${sanitizeToken(first.componentRef)}_${sanitizeToken(first.pinId).toUpperCase()}`;
}

function sanitizeToken(value: string) {
  return value.replace(/[^A-Za-z0-9_]/g, "_") || "_";
}

function naturalCompare(first: string, second: string) {
  return first.localeCompare(second, undefined, { numeric: true, sensitivity: "case" });
}

function uniqueName(baseName: string, usedNames: Set<string>) {
  if (!usedNames.has(baseName)) return baseName;
  let suffix = 2;
  while (usedNames.has(`${baseName}_${suffix}`)) suffix += 1;
  return `${baseName}_${suffix}`;
}

function firstPointForRoots(roots: string[], connectivity: ConnectivityResult) {
  let first: Point | undefined;
  roots.forEach((root) => {
    connectivity.groups.get(root)?.forEach((point) => {
      const snapped = snapPoint(point);
      if (!first || comparePoints(snapped, first) < 0) first = snapped;
    });
  });
  return first ?? { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY };
}

function comparePoints(first: Point, second: Point) {
  return first.x === second.x ? first.y - second.y : first.x - second.x;
}

function uniquePoints(points: Point[]) {
  const byKey = new Map<string, Point>();
  points.forEach((point) => byKey.set(pointKey(snapPoint(point)), snapPoint(point)));
  return Array.from(byKey.values()).sort(comparePoints);
}

function pinKey(componentId: string, pinId: string) {
  return `${componentId}:${pinId}`;
}
