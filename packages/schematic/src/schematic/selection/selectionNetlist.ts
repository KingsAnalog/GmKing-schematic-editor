import { resolveComponentDef } from "../catalog";
import { netNameForPin, resolveSchematicNets } from "../netResolution";
import type { ComponentInstance, PinDef, SchematicDocument } from "../types";

export interface SchematicSelectionNetlist {
  text: string;
  subcircuitCount: number;
  componentCount: number;
}

const NON_INSTANCE_TYPES = new Set(["gnd", "vdd", "annotation"]);
const MOS_PIN_ORDER = ["d", "g", "s", "b"];
const BJT_PIN_ORDER = ["c", "b", "e"];

export function buildSchematicSelectionNetlist(
  document: SchematicDocument,
  selectedComponentIds: Iterable<string>,
  baseName = "copied_sub_circuit"
): SchematicSelectionNetlist | null {
  const selectedIds = new Set(selectedComponentIds);
  const components = document.components.filter((component) =>
    selectedIds.has(component.id)
    && !component.temporarilyDeleted
    && isNetlistInstance(component)
  );
  if (components.length === 0) return null;

  const resolution = resolveSchematicNets(document);
  const entries = components.map((component) => {
    const def = resolveComponentDef(component);
    const pins = orderedNetlistPins(component, def.pins);
    const netNames = pins.map((pin) => netNameForPin(resolution, component.id, pin.id));
    return { component, cellName: def.hotLabel, netNames };
  });

  const groups = connectedComponentGroups(entries);
  const multiple = groups.length > 1;
  const blocks = groups.map((group, index) => {
    const name = `${baseName}${multiple ? index + 1 : ""}`;
    return renderSubcircuit(name, group);
  });
  return {
    text: blocks.join("\n\n\n"),
    subcircuitCount: groups.length,
    componentCount: components.length
  };
}

function isNetlistInstance(component: ComponentInstance) {
  return !NON_INSTANCE_TYPES.has(component.type) && resolveComponentDef(component).pins.length > 0;
}

function orderedNetlistPins(component: ComponentInstance, pins: PinDef[]) {
  const order = component.type === "nmos" || component.type === "pmos"
    ? MOS_PIN_ORDER
    : component.type === "npn" || component.type === "pnp"
      ? BJT_PIN_ORDER
      : null;
  if (!order) return pins;
  const byId = new Map(pins.map((pin) => [pin.id, pin]));
  return order.flatMap((id) => {
    const pin = byId.get(id);
    return pin ? [pin] : [];
  });
}

function connectedComponentGroups<T extends { component: ComponentInstance; netNames: string[] }>(entries: T[]) {
  const unionFind = new ComponentUnionFind(entries.map((entry) => entry.component.id));
  const firstComponentByNet = new Map<string, string>();
  entries.forEach((entry) => {
    new Set(entry.netNames.filter(Boolean)).forEach((name) => {
      const first = firstComponentByNet.get(name);
      if (first) unionFind.union(first, entry.component.id);
      else firstComponentByNet.set(name, entry.component.id);
    });
  });

  const groups = new Map<string, T[]>();
  entries.forEach((entry) => {
    const root = unionFind.find(entry.component.id);
    groups.set(root, [...(groups.get(root) ?? []), entry]);
  });
  return Array.from(groups.values());
}

function renderSubcircuit(
  name: string,
  entries: Array<{ component: ComponentInstance; cellName: string; netNames: string[] }>
) {
  // TODO: Populate subcircuit interface pins once selected boundary nets can be classified as inputs or outputs.
  const lines = [`subckt ${name}()`, ""];
  entries.forEach((entry) => lines.push(`    ${renderInstance(entry)}`));
  lines.push("", `ends ${name}`);
  return lines.join("\n");
}

function renderInstance(entry: { component: ComponentInstance; cellName: string; netNames: string[] }) {
  // TODO: Append editable instance parameters such as l=60n w=3.96u multi=1 nf=2 when they are modeled.
  return `${netlistToken(entry.component.ref)} (${entry.netNames.join(" ")}) ${entry.cellName}`;
}

function netlistToken(value: string) {
  const token = value.trim().replace(/[^A-Za-z0-9_!<>[\]:+-]/g, "_");
  return token || "instance";
}

class ComponentUnionFind {
  private readonly parents = new Map<string, string>();

  constructor(ids: Iterable<string>) {
    for (const id of ids) this.parents.set(id, id);
  }

  find(id: string): string {
    const parent = this.parents.get(id) ?? id;
    if (parent === id) return id;
    const root = this.find(parent);
    this.parents.set(id, root);
    return root;
  }

  union(first: string, second: string) {
    const firstRoot = this.find(first);
    const secondRoot = this.find(second);
    if (firstRoot !== secondRoot) this.parents.set(secondRoot, firstRoot);
  }
}
