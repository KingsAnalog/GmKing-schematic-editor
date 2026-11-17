import nerdamer from "nerdamer/all";
import { expect } from "vitest";
import { getComponentDef } from "../../../src/schematic/catalog";
import { extractNetlist } from "../../../src/schematic/netlist";
import { instantiateSchematicTemplate, type SchematicTemplateId } from "../../../src/schematic/templates";
import type { ComponentInstance, ComponentType, SchematicDocument } from "../../../src/schematic/types";

export function component(type: ComponentType, ref: string, x: number, y: number, rotation = 0): ComponentInstance {
  const def = getComponentDef(type);
  const values = { ...(def.defaultValues ?? {}) };
  if (def.valueKey === "main") values.main = ref;
  return {
    id: ref,
    type,
    variantId: def.defaultVariantId,
    ref,
    x,
    y,
    rotation,
    mirrored: false,
    values
  };
}

export function templateFragment(id: SchematicTemplateId, x = 100, y = 100) {
  const counters = new Map<string, number>();
  return instantiateSchematicTemplate(id, { x, y }, {
    createId: (kind, index) => `${id}-${kind}-${index}`,
    nextRef: (type) => {
      const def = getComponentDef(type);
      const prefix = def.valuePrefix ?? def.label;
      const index = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, index);
      return def.valuePrefix ? `${def.valuePrefix}${index}` : `${def.label}${index}`;
    }
  });
}

export function netAt(doc: SchematicDocument, x: number, y: number) {
  const key = `${x},${y}`;
  const netlist = extractNetlist(doc);
  for (const [net, points] of netlist.nets) {
    if (points.some((point) => `${point.x},${point.y}` === key)) {
      return net;
    }
  }
  throw new Error(`No net at ${key}`);
}

export function pinNet(doc: SchematicDocument, componentRef: string, pinId: string) {
  const netlist = extractNetlist(doc);
  const pin = netlist.pins.find((candidate) => candidate.componentRef === componentRef && candidate.pinId === pinId);
  if (!pin) throw new Error(`No ${componentRef}.${pinId} pin`);
  return pin.netId;
}

function evaluateExpression(expression: string, values: Record<string, number>) {
  let parsed = nerdamer(expression);
  Object.entries(values).forEach(([name, value]) => {
    parsed = parsed.sub(name, String(value));
  });
  return Number(parsed.evaluate().text());
}

export function expectEquivalentBySamples(actual: string, expected: string) {
  const samples = [
    { R1: 1.7, R2: 2.3, R3: 3.1, C1: 0.11, C2: 0.17, C3: 0.23, Aop1: 8.5, Ad1: 4.4, Gm1: 0.8, RL: 5.6, s: 0.37 },
    { R1: 4.2, R2: 1.6, R3: 2.8, C1: 0.07, C2: 0.13, C3: 0.19, Aop1: 12.1, Ad1: 6.2, Gm1: 1.3, RL: 2.4, s: 1.4 }
  ];
  samples.forEach((sample) => {
    const actualValue = evaluateExpression(actual, sample);
    const expectedValue = evaluateExpression(expected, sample);
    const tolerance = 1e-8 * Math.max(1, Math.abs(expectedValue));
    expect(Math.abs(actualValue - expectedValue)).toBeLessThan(tolerance);
  });
}
