import { buildConnectivity, type ConnectivityResult } from "./connectivity";
import { pointKey, snapPoint } from "./geometry";
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
  const physicalRoots = Array.from(connectivity.groups.keys());
  const electrical = new RootUnionFind(physicalRoots);
  const groundRoots = new Set(
    connectivity.pins
      .filter((pin) => pin.componentType === "gnd" || pin.pinRole === "gnd")
      .map((pin) => connectivity.rootOf(pin.nodeKey))
  );
  unionAll(electrical, groundRoots);

  const labels = document.netLabels ?? [];
  const labelStates = new Map<string, ResolvedNetLabel>();
  const activeLabelsByRoot = new Map<string, Array<{ label: NetLabel; name: string }>>();
  const wireById = new Map<string, SchematicContent["wires"][number]>();
  document.wires.forEach((wire) => {
    if (!wireById.has(wire.id)) wireById.set(wire.id, wire);
  });
  const activeWireRoots = document.wires
    .filter((wire) => !wire.temporarilyDeleted)
    .map((wire) => ({ wire, physicalRoot: connectivity.rootOfWire(wire.id) ?? undefined }));
  const physicalRootByActiveWireId = new Map<string, string>();
  activeWireRoots.forEach(({ wire, physicalRoot }) => {
    if (physicalRoot && !physicalRootByActiveWireId.has(wire.id)) {
      physicalRootByActiveWireId.set(wire.id, physicalRoot);
    }
  });
  labels.forEach((label) => {
    const wire = wireById.get(label.attachment.wireId);
    const point = snapPoint(label.attachment.point);
    const physicalRoot = wire && !wire.temporarilyDeleted && pointOnPath(point, wire.points)
      ? physicalRootByActiveWireId.get(wire.id)
      : undefined;
    if (!physicalRoot) {
      labelStates.set(label.id, {
        label,
        status: "inactive",
        message: wire?.temporarilyDeleted
          ? "The supporting wire is temporarily deleted."
          : "The label is not attached to an active wire."
      });
      return;
    }
    const validation = validateNetLabelName(label.name);
    if (!validation.valid) {
      labelStates.set(label.id, {
        label,
        status: "conflict",
        physicalRoot,
        message: validation.message
      });
      return;
    }
    const rootLabels = activeLabelsByRoot.get(physicalRoot);
    if (rootLabels) rootLabels.push({ label, name: validation.name });
    else activeLabelsByRoot.set(physicalRoot, [{ label, name: validation.name }]);
  });

  const validNameByRoot = new Map<string, string>();
  activeLabelsByRoot.forEach((rootLabels, root) => {
    const winnerName = groundRoots.has(root) ? "0" : rootLabels[0]?.name;
    if (winnerName !== undefined) validNameByRoot.set(root, winnerName);
    rootLabels.forEach(({ label, name }) => {
      if (name === winnerName) {
        labelStates.set(label.id, { label, status: "valid", physicalRoot: root });
      } else {
        labelStates.set(label.id, {
          label,
          status: "conflict",
          physicalRoot: root,
          message: groundRoots.has(root)
            ? `Ground is always named 0; ${name} is ignored.`
            : `${winnerName} is the earlier label on this physical net; ${name} is ignored.`
        });
      }
    });
  });

  const firstRootByExplicitName = new Map<string, string>();
  const firstGroundRoot = groundRoots.values().next().value;
  if (firstGroundRoot) firstRootByExplicitName.set("0", firstGroundRoot);
  validNameByRoot.forEach((name, root) => {
    const existing = firstRootByExplicitName.get(name);
    if (existing) electrical.union(existing, root);
    else firstRootByExplicitName.set(name, root);
  });

  const rootsByElectricalGroup = new Map<string, string[]>();
  const electricalGroupByPhysicalRoot = new Map<string, string>();
  physicalRoots.forEach((root) => {
    const group = electrical.find(root);
    electricalGroupByPhysicalRoot.set(root, group);
    const roots = rootsByElectricalGroup.get(group);
    if (roots) roots.push(root);
    else rootsByElectricalGroup.set(group, [root]);
  });
  const electricalGroupForRoot = (root: string) =>
    electricalGroupByPhysicalRoot.get(root) ?? electrical.find(root);
  const firstPointByElectricalGroup = new Map<string, Point>();
  rootsByElectricalGroup.forEach((roots, group) => {
    firstPointByElectricalGroup.set(group, firstPointForRoots(roots, connectivity));
  });
  const firstPointForGroup = (group: string) =>
    firstPointByElectricalGroup.get(group)
    ?? { x: Number.POSITIVE_INFINITY, y: Number.POSITIVE_INFINITY };
  const sortedGroups = Array.from(rootsByElectricalGroup.entries())
    .sort(([firstGroup], [secondGroup]) =>
      comparePoints(firstPointForGroup(firstGroup), firstPointForGroup(secondGroup))
    )
    .map(([, roots]) => roots);

  const pinsByElectricalGroup = new Map<string, NetlistPin[]>();
  connectivity.pins.forEach((pin) => {
    const physicalRoot = connectivity.rootOf(pin.nodeKey);
    const group = electricalGroupForRoot(physicalRoot);
    const pins = pinsByElectricalGroup.get(group);
    if (pins) pins.push(pin);
    else pinsByElectricalGroup.set(group, [pin]);
  });

  const wireIdsByElectricalGroup = new Map<string, string[]>();
  activeWireRoots.forEach(({ wire, physicalRoot }) => {
    if (!physicalRoot) return;
    const group = electricalGroupForRoot(physicalRoot);
    const wireIds = wireIdsByElectricalGroup.get(group);
    if (wireIds) wireIds.push(wire.id);
    else wireIdsByElectricalGroup.set(group, [wire.id]);
  });

  const explicitNames = new Set<string>();
  const groupExplicitNames = new Map<string, string>();
  sortedGroups.forEach((roots) => {
    const group = electricalGroupForRoot(roots[0]);
    const name = roots.some((root) => groundRoots.has(root))
      ? "0"
      : roots.map((root) => validNameByRoot.get(root)).find((candidate): candidate is string => candidate !== undefined);
    if (!name) return;
    groupExplicitNames.set(group, name);
    explicitNames.add(name);
  });

  const nameByElectricalGroup = new Map<string, string>();
  const usedNames = new Set(explicitNames);
  let pureWireIndex = 0;
  sortedGroups.forEach((roots) => {
    const group = electricalGroupForRoot(roots[0]);
    const explicitName = groupExplicitNames.get(group);
    if (explicitName) {
      nameByElectricalGroup.set(group, explicitName);
      return;
    }
    const pins = pinsByElectricalGroup.get(group) ?? [];
    let baseName = automaticPinName(pins);
    if (!baseName) baseName = `NET_${++pureWireIndex}`;
    const name = uniqueName(baseName, usedNames);
    usedNames.add(name);
    nameByElectricalGroup.set(group, name);
  });

  const nameByPhysicalRoot = new Map<string, string>();
  physicalRoots.forEach((root) => {
    const group = electricalGroupForRoot(root);
    nameByPhysicalRoot.set(root, nameByElectricalGroup.get(group) ?? root);
  });

  const wireNetNames = new Map<string, string>();
  activeWireRoots.forEach(({ wire, physicalRoot }) => {
    const name = physicalRoot ? nameByPhysicalRoot.get(physicalRoot) : undefined;
    if (name) wireNetNames.set(wire.id, name);
  });
  const junctionNetNames = new Map<string, string>();
  connectivity.junctions.forEach((point) => {
    const names = new Set(connectivity.rootsAtPoint(point).map((root) => nameByPhysicalRoot.get(root)).filter(Boolean));
    if (names.size === 1) junctionNetNames.set(pointKey(point), Array.from(names)[0] as string);
  });
  const pinNetNames = new Map<string, string>();
  connectivity.pins.forEach((pin) => {
    const name = nameByPhysicalRoot.get(connectivity.rootOf(pin.nodeKey));
    if (name) pinNetNames.set(pinKey(pin.componentId, pin.pinId), name);
  });

  labelStates.forEach((state, id) => {
    if (!state.physicalRoot) return;
    labelStates.set(id, { ...state, netName: nameByPhysicalRoot.get(state.physicalRoot) });
  });

  const validLabelIdsByElectricalGroup = new Map<string, string[]>();
  labels.forEach((label) => {
    const state = labelStates.get(label.id);
    if (state?.status !== "valid" || !state.physicalRoot) return;
    const group = electricalGroupForRoot(state.physicalRoot);
    const labelIds = validLabelIdsByElectricalGroup.get(group);
    if (labelIds) labelIds.push(label.id);
    else validLabelIdsByElectricalGroup.set(group, [label.id]);
  });

  const nets = new Map<string, ResolvedNet>();
  sortedGroups.forEach((roots) => {
    const group = electricalGroupForRoot(roots[0]);
    const name = nameByPhysicalRoot.get(roots[0]);
    if (!name) return;
    const points = uniquePoints(roots.flatMap((root) => connectivity.groups.get(root) ?? []));
    const pins = pinsByElectricalGroup.get(group) ?? [];
    const wireIds = wireIdsByElectricalGroup.get(group) ?? [];
    const labelIds = validLabelIdsByElectricalGroup.get(group) ?? [];
    nets.set(name, {
      name,
      physicalRoots: roots,
      points,
      pins,
      wireIds,
      labelIds,
      explicit: groupExplicitNames.has(group)
    });
  });

  return {
    connectivity,
    nets,
    nameByPhysicalRoot,
    wireNetNames,
    junctionNetNames,
    pinNetNames,
    labelStates,
    hasReferenceGround: nets.has("0")
  };
}

export function netNameForJunction(resolution: NetResolution, point: Point) {
  return resolution.junctionNetNames.get(pointKey(snapPoint(point))) ?? "";
}

export function netNameForPin(resolution: NetResolution, componentId: string, pinId: string) {
  return resolution.pinNetNames.get(pinKey(componentId, pinId)) ?? "";
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

function unionAll(unionFind: RootUnionFind, roots: Iterable<string>) {
  let first: string | undefined;
  for (const root of roots) {
    if (first === undefined) first = root;
    else unionFind.union(first, root);
  }
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
