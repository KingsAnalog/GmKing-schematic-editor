import { authorFixture, fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import {
  executeSchematicPropertyBatchCommand,
  type SchematicPropertyBatchCommand
} from "../../../src/schematic/propertyBatchCommands";
import type { ComponentInstance, SchematicDocument } from "../../../src/schematic/types";
import { fixtureComponent, fixtureWire } from "../support/fixtures";

function documentWith(component: ComponentInstance): SchematicDocument {
  return fixtureDocument({

    junctionAppearances: [],
    netLabels: [],
    notes: [],
    components: [component],
    wires: [],
    junctions: []
  });
}

describe("executeSchematicPropertyBatchCommand", () => {
  it("updates cell and ref values with the required render scope and counter rebuilds", () => {
    const component = fixtureComponent("resistor", "R1", 100, 100);
    const document = documentWith(component);

    const cell = executeSchematicPropertyBatchCommand(document, { selectedIds: [component.id], selectedNoteIds: [] }, { kind: "component-cell", type: "capacitor" });
    expect(cell).toMatchObject({
      changed: true, historyIntent: "push",
      renderScope: "document",
      rebuildCounters: true
    });
    expect(document.components[0]).toBe(component);

    expect(component).toMatchObject({ type: "capacitor", ref: "C1" });

    const ref = executeSchematicPropertyBatchCommand(document, { selectedIds: [component.id], selectedNoteIds: [] }, { kind: "component-ref", ref: " C7 " });
    expect(component.ref).toBe("C7");
    expect(ref).toMatchObject({
      changed: true, historyIntent: "push",
      renderScope: "incremental",
      rebuildCounters: true
    });
    expect(document.components[0]).toBe(component);
  });

  it("keeps variants component-scoped when pin geometry is unchanged", () => {
    const component = fixtureComponent("switch", "S1", 100, 100);
    const document = documentWith(component);
    document.wires.push(fixtureWire("w1", [{ x: 20, y: 100 }, { x: 80, y: 100 }]));
    authorFixture(document);
    const beforeWires = structuredClone(document.wires);

    const outcome = executeSchematicPropertyBatchCommand(document, { selectedIds: [component.id], selectedNoteIds: [] }, {
      kind: "component-variant",
      variantId: "closed",
      moveBehavior: "stretch"
    });

    expect(outcome).toMatchObject({
      changed: true, historyIntent: "push",
      renderScope: "incremental",
      rebuildCounters: false
    });
    expect(document.components[0]).toBe(component);
    expect(document.wires).toEqual(beforeWires);
  });

  it("uses document rendering when a variant changes the pin geometry", () => {
    const component = fixtureComponent("nmos", "M1", 100, 100);
    const document = documentWith(component);

    const outcome = executeSchematicPropertyBatchCommand(document, { selectedIds: [component.id], selectedNoteIds: [] }, {
      kind: "component-mos-view",
      patch: { pins: "4pin", arrow: "current" },
      moveBehavior: "stretch"
    });

    expect(outcome).toMatchObject({
      changed: true, historyIntent: "push",
      renderScope: "document",
      rebuildCounters: false
    });
  });

  it.each([
    {
      label: "color",
      component: () => fixtureComponent("resistor", "R1", 0, 0),
      command: { kind: "component-color", color: "#0072b2" } as const
    },
    {
      label: "value",
      component: () => fixtureComponent("resistor", "R1", 0, 0),
      command: { kind: "component-value", value: "10k" } as const
    },
    {
      label: "label visibility",
      component: () => fixtureComponent("resistor", "R1", 0, 0),
      command: { kind: "component-label-visibility", visible: false } as const
    },
    {
      label: "gain polarity",
      component: () => fixtureComponent("amp", "A1", 0, 0),
      command: { kind: "component-gain-polarity", polarity: "negative" } as const
    },
    {
      label: "pin visibility",
      component: () => fixtureComponent("plus", "SUM1", 0, 0),
      command: { kind: "component-pin-visibility", pinId: "left", visible: false } as const
    },
    {
      label: "pin mode",
      component: () => fixtureComponent("plus", "SUM1", 0, 0),
      command: { kind: "component-pin-mode", pinId: "left", mode: "negative" } as const
    },
    {
      label: "pin symbol visibility",
      component: () => fixtureComponent("plus", "SUM1", 0, 0),
      command: { kind: "component-pin-symbol-visibility", pinId: "left", visible: false } as const
    }
  ])("keeps successful $label commands component-scoped", ({ component: createComponent, command }) => {
    const component = createComponent();
    const outcome = executeSchematicPropertyBatchCommand(documentWith(component), { selectedIds: [component.id], selectedNoteIds: [] }, command);

    expect(outcome.changed).toBe(true);
    expect(outcome.targets.componentIds).toEqual([component.id]);
    expect(outcome.renderScope).toBe("incremental");
    expect(outcome.rebuildCounters).toBe(false);
  });

  it.each([
    {
      label: "cell",
      component: () => fixtureComponent("resistor", "R1", 0, 0),
      command: { kind: "component-cell", type: "resistor" } as const
    },
    {
      label: "variant",
      component: () => fixtureComponent("switch", "S1", 0, 0),
      command: { kind: "component-variant", variantId: "open", moveBehavior: "stretch" } as const
    },
    {
      label: "ref",
      component: () => fixtureComponent("resistor", "R1", 0, 0),
      command: { kind: "component-ref", ref: "R1" } as const
    },
    {
      label: "color",
      component: () => fixtureComponent("resistor", "R1", 0, 0),
      command: { kind: "component-color", color: "invalid" } as const
    },
    {
      label: "value",
      component: () => fixtureComponent("resistor", "R1", 0, 0),
      command: { kind: "component-value", value: "R1" } as const
    },
    {
      label: "label visibility",
      component: () => fixtureComponent("resistor", "R1", 0, 0),
      command: { kind: "component-label-visibility", visible: true } as const
    },
    {
      label: "gain polarity",
      component: () => fixtureComponent("amp", "A1", 0, 0),
      command: { kind: "component-gain-polarity", polarity: "default" } as const
    },
    {
      label: "pin visibility",
      component: () => fixtureComponent("plus", "SUM1", 0, 0),
      command: { kind: "component-pin-visibility", pinId: "left", visible: true } as const
    },
    {
      label: "pin mode",
      component: () => fixtureComponent("plus", "SUM1", 0, 0),
      command: { kind: "component-pin-mode", pinId: "left", mode: "positive" } as const
    },
    {
      label: "pin symbol visibility",
      component: () => fixtureComponent("plus", "SUM1", 0, 0),
      command: { kind: "component-pin-symbol-visibility", pinId: "left", visible: true } as const
    }
  ] satisfies Array<{
    label: string;
    component: () => ComponentInstance;
    command: SchematicPropertyBatchCommand;
  }>)("does not mutate the live document for $label no-ops", ({ component: createComponent, command }) => {
    const component = createComponent();
    const document = documentWith(component);
    const before = structuredClone(document);

    const outcome = executeSchematicPropertyBatchCommand(document, { selectedIds: [component.id], selectedNoteIds: [] }, command);

    expect(outcome.changed).toBe(false);
    expect(outcome.rebuildCounters).toBe(false);
    expect(document).toEqual(before);
  });
});
