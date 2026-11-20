import { fixtureDocument, authorFixture, connectFixtureJunction } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { componentCustomColor } from "../../../src/schematic/componentPropertyModel";
import { resolveComponentDef } from "../../../src/schematic/catalog";
import { applyNormalizedDocumentWires } from "../../../src/schematic/document/documentWires";
import { createSchematicDocumentHistoryAdapter } from "../support/documentHistory";
import { junctionId } from "../../../src/schematic/renderer";
import { componentPinPoint } from "../../../src/schematic/netlist";
import { rectangleSettings } from "../../../src/schematic/rectangleComponentModel";
import {
  filterKindForInstance,
  functionBlockTimeDomainForInstance
} from "../../../src/schematic/functionBlockModel";
import { DFF_VALUE_KEYS, dffSettings } from "../../../src/schematic/dffModel";
import {
  executeSchematicPropertyBatchCommand,
  type SchematicPropertyBatchCommand
} from "../../../src/schematic/propertyBatchCommands";
import {
  junctionCustomColor,
  wireCustomColor
} from "../../../src/schematic/networkColorModel";
import {
  noteFontSizePx,
  noteWidthPx
} from "../../../src/schematic/notes/noteSizing";
import { resolvedWireAppearance } from "../../../src/schematic/wire/wireDecoration";
import type {
  ComponentInstance,
  NetLabel,
  Point,
  SchematicDocument,
  SchematicNote,
  Wire
} from "../../../src/schematic/types";
import {
  emptyDoc,
  fixtureComponent,
  fixtureNote,
  fixtureWire
} from "../support/fixtures";

function documentWith(input: {
  components?: ComponentInstance[];
  wires?: Wire[];
  junctions?: Point[];
  netLabels?: NetLabel[];
  notes?: SchematicNote[];
}): SchematicDocument {
  return fixtureDocument({
    ...emptyDoc(),
    components: input.components ?? [],
    wires: input.wires ?? [],
    junctions: input.junctions ?? [],
    netLabels: input.netLabels ?? [],
    notes: input.notes ?? []
  });
}

function graphSelection(...selectedIds: string[]) {
  return { selectedIds, selectedNoteIds: [] };
}

function noteSelection(...selectedNoteIds: string[]) {
  return { selectedIds: [], selectedNoteIds };
}

describe("executeSchematicPropertyBatchCommand", () => {
  it.each(["inductor", "resistor"] as const)("rejects a turns batch containing a non-layout %s before changing any inductor", type => {
    const layout = { ...fixtureComponent("inductor", "L1", 100, 100), variantId: "planar" };
    const other = fixtureComponent(type, "X2", 400, 100);
    const document = documentWith({ components: [layout, other] });
    const before = structuredClone(document);
    const result = executeSchematicPropertyBatchCommand(document, graphSelection(layout.id, other.id), {
      kind: "component-inductor-layout", layout: "single"
    });
    expect(result).toMatchObject({ kind: "rejected", historyIntent: "none", rejectionReason: "incompatible-selection" });
    expect(document).toEqual(before);
  });

  it("keeps function-block wires attached across a mixed View batch in move-only mode and one Undo/Redo", () => {
    const changing = fixtureComponent("integrator", "INT1", 200, 200);
    const alreadyText = fixtureComponent("integrator", "INT2", 600, 200);
    alreadyText.variantId = "text";
    const previousIn = componentPinPoint(changing, "in");
    const previousOut = componentPinPoint(changing, "out");
    const inputWire = fixtureWire("input-wire", [{ x: 80, y: 200 }, previousIn]);
    const outputWire = fixtureWire("output-wire", [previousOut, { x: 360, y: 200 }]);
    const document = documentWith(fixtureDocument({
      components: [changing, alreadyText],
      wires: [inputWire, outputWire]
    }));
    const history = createSchematicDocumentHistoryAdapter(document);

    const result = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(changing.id, alreadyText.id),
      { kind: "component-variant", variantId: "text", moveBehavior: "moveOnly" }
    );

    expect(result).toMatchObject({
      kind: "changed",
      historyIntent: "push",
      renderScope: "document",
      targets: {
        componentIds: [changing.id],
        wireIds: [inputWire.id, outputWire.id]
      }
    });
    const nextIn = componentPinPoint(changing, "in");
    const nextOut = componentPinPoint(changing, "out");
    expect(nextIn).not.toEqual(previousIn);
    expect(nextOut).not.toEqual(previousOut);
    expect(inputWire.points.at(-1)).toEqual(nextIn);
    expect(outputWire.points[0]).toEqual(nextOut);

    expect(history.push(document)).toBe(true);
    const undone = history.undo();
    expect(undone?.components.map((component) => component.variantId))
      .toEqual(["symbol", "text"]);
    expect(undone?.wires[0].points.at(-1)).toEqual(previousIn);
    expect(undone?.wires[1].points[0]).toEqual(previousOut);
    expect(history.undo()).toBeNull();

    const redone = history.redo();
    const redoneChanging = redone?.components.find((component) => component.id === changing.id);
    expect(redoneChanging?.variantId).toBe("text");
    expect(redone?.wires[0].points.at(-1)).toEqual(componentPinPoint(redoneChanging!, "in"));
    expect(redone?.wires[1].points[0]).toEqual(componentPinPoint(redoneChanging!, "out"));
    expect(history.redo()).toBeNull();
  });

  it("changes compact function-block Domain without moving attached geometry", () => {
    const integrator = fixtureComponent("integrator", "INT1", 200, 200);
    integrator.variantId = "transfer";
    const previousIn = componentPinPoint(integrator, "in");
    const previousOut = componentPinPoint(integrator, "out");
    const inputWire = fixtureWire("input-wire", [{ x: 80, y: 200 }, previousIn]);
    const outputWire = fixtureWire("output-wire", [previousOut, { x: 360, y: 200 }]);
    const label: NetLabel = {
      id: "output-label",
      name: "OUT",
      attachment: { wireId: outputWire.id, point: previousOut }
    };
    const document = documentWith(fixtureDocument({
      components: [integrator],
      wires: [inputWire, outputWire],
      netLabels: [label]
    }));
    const history = createSchematicDocumentHistoryAdapter(document);

    const result = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(integrator.id),
      { kind: "component-time-domain", timeDomain: "discrete" }
    );

    const nextIn = componentPinPoint(integrator, "in");
    const nextOut = componentPinPoint(integrator, "out");
    expect(result).toMatchObject({
      kind: "changed",
      historyIntent: "push",
      renderScope: "incremental",
      targets: {
        componentIds: [integrator.id],
        wireIds: [],
        netLabelIds: []
      }
    });
    expect(functionBlockTimeDomainForInstance(integrator)).toBe("discrete");
    expect(integrator.variantId).toBe("transfer");
    expect(nextIn).toEqual(previousIn);
    expect(nextOut).toEqual(previousOut);
    expect(inputWire.points.at(-1)).toEqual(previousIn);
    expect(outputWire.points[0]).toEqual(previousOut);
    expect(label.attachment.point).toEqual(previousOut);

    expect(history.push(document)).toBe(true);
    const undone = history.undo();
    const undoneIntegrator = undone?.components[0];
    expect(functionBlockTimeDomainForInstance(undoneIntegrator!)).toBe("continuous");
    expect(undoneIntegrator?.variantId).toBe("transfer");
    expect(undone?.wires[0].points.at(-1)).toEqual(previousIn);
    expect(undone?.wires[1].points[0]).toEqual(previousOut);
    expect(undone?.netLabels[0].attachment.point).toEqual(previousOut);
    expect(history.undo()).toBeNull();

    const redone = history.redo();
    const redoneIntegrator = redone?.components[0];
    expect(functionBlockTimeDomainForInstance(redoneIntegrator!)).toBe("discrete");
    expect(redoneIntegrator?.variantId).toBe("transfer");
    expect(redone?.wires[0].points.at(-1)).toEqual(componentPinPoint(redoneIntegrator!, "in"));
    expect(redone?.wires[1].points[0]).toEqual(componentPinPoint(redoneIntegrator!, "out"));
    expect(history.redo()).toBeNull();
  });

  it("changes Domain across function-block types and rejects mixed non-block selections atomically", () => {
    const integrator = fixtureComponent("integrator", "INT1", 80, 80);
    const delay = fixtureComponent("delay", "DLY1", 200, 80);
    delay.variantId = "text";
    const resistor = fixtureComponent("resistor", "R1", 320, 80);
    const document = documentWith({ components: [integrator, delay, resistor] });

    const changed = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(integrator.id, delay.id),
      { kind: "component-time-domain", timeDomain: "discrete" }
    );
    expect(changed).toMatchObject({
      kind: "changed",
      historyIntent: "push",
      targets: { componentIds: [integrator.id, delay.id] }
    });
    expect([integrator, delay].map(functionBlockTimeDomainForInstance))
      .toEqual(["discrete", "discrete"]);
    expect([integrator.variantId, delay.variantId]).toEqual(["symbol", "text"]);

    const before = structuredClone(document);
    const rejected = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(integrator.id, resistor.id),
      { kind: "component-time-domain", timeDomain: "continuous" }
    );
    expect(rejected).toMatchObject({
      kind: "rejected",
      rejectionReason: "incompatible-selection",
      historyIntent: "none"
    });
    expect(document).toEqual(before);
  });

  it("updates overlapping compact Domain blocks without creating false topology conflicts", () => {
    const first = fixtureComponent("integrator", "INT1", 200, 200);
    const second = fixtureComponent("integrator", "INT2", 200, 200);
    first.variantId = "transfer";
    second.variantId = "transfer";
    second.mirrored = true;
    const anchor = componentPinPoint(first, "out");
    const secondOut = componentPinPoint(second, "out");
    second.x += anchor.x - secondOut.x;
    expect(componentPinPoint(second, "out")).toEqual(anchor);
    const wire = fixtureWire("shared-anchor", [anchor, { x: anchor.x, y: anchor.y + 100 }]);
    const document = documentWith(fixtureDocument({ components: [first, second], wires: [wire] }));
    const previousWire = structuredClone(wire);

    const result = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(first.id, second.id),
      { kind: "component-time-domain", timeDomain: "discrete" }
    );

    expect(result).toMatchObject({
      kind: "changed",
      renderScope: "incremental",
      historyIntent: "push",
      targets: {
        componentIds: [first.id, second.id],
        wireIds: [],
        junctionPoints: [],
        netLabelIds: [],
        noteIds: []
      }
    });
    expect(wire).toEqual(previousWire);
    expect([first, second].map(functionBlockTimeDomainForInstance))
      .toEqual(["discrete", "discrete"]);
  });

  it("updates mixed compact and text Domain views without moving their shared anchor", () => {
    const moving = fixtureComponent("integrator", "INT1", 200, 200);
    const staying = fixtureComponent("integrator", "INT2", 200, 200);
    moving.variantId = "transfer";
    staying.variantId = "text";
    staying.mirrored = true;
    const anchor = componentPinPoint(moving, "out");
    const stayingOut = componentPinPoint(staying, "out");
    staying.x += anchor.x - stayingOut.x;
    expect(componentPinPoint(staying, "out")).toEqual(anchor);
    const wire = fixtureWire("shared-stationary-anchor", [
      anchor,
      { x: anchor.x, y: anchor.y + 100 }
    ]);
    const document = documentWith(fixtureDocument({ components: [moving, staying], wires: [wire] }));
    const previousWire = structuredClone(wire);

    const result = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(moving.id, staying.id),
      { kind: "component-time-domain", timeDomain: "discrete" }
    );

    expect(result).toMatchObject({
      kind: "changed",
      renderScope: "incremental",
      historyIntent: "push",
      targets: {
        componentIds: [moving.id, staying.id],
        wireIds: []
      }
    });
    expect(wire).toEqual(previousWire);
    expect([moving, staying].map(functionBlockTimeDomainForInstance))
      .toEqual(["discrete", "discrete"]);
  });

  it("changes Filter kind as one batch and rejects non-Filter selections", () => {
    const first = fixtureComponent("filter", "FLT1", 80, 80);
    const second = fixtureComponent("filter", "FLT2", 200, 80);
    const resistor = fixtureComponent("resistor", "R1", 320, 80);
    const document = documentWith({ components: [first, second, resistor] });
    const history = createSchematicDocumentHistoryAdapter(document);

    const changed = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(first.id, second.id),
      { kind: "component-filter-kind", filterKind: "bandpass" }
    );
    expect(changed).toMatchObject({
      kind: "changed",
      historyIntent: "push",
      renderScope: "incremental",
      changedIds: [first.id, second.id]
    });
    expect([filterKindForInstance(first), filterKindForInstance(second)])
      .toEqual(["bandpass", "bandpass"]);
    expect(history.push(document)).toBe(true);
    const undone = history.undo();
    expect(undone?.components.slice(0, 2).map(filterKindForInstance))
      .toEqual(["lowpass", "lowpass"]);
    expect(history.undo()).toBeNull();
    const redone = history.redo();
    expect(redone?.components.slice(0, 2).map(filterKindForInstance))
      .toEqual(["bandpass", "bandpass"]);
    expect(history.redo()).toBeNull();

    const before = structuredClone(document);
    const rejected = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(first.id, resistor.id),
      { kind: "component-filter-kind", filterKind: "highpass" }
    );
    expect(rejected).toMatchObject({
      kind: "rejected",
      rejectionReason: "incompatible-selection",
      historyIntent: "none"
    });
    expect(document).toEqual(before);
  });

  it("allows Filter kind changes at a shared anchor when its pin geometry is unchanged", () => {
    const first = fixtureComponent("filter", "FLT1", 200, 200);
    const second = fixtureComponent("filter", "FLT2", 200, 200);
    first.variantId = "text";
    second.variantId = "text";
    second.mirrored = true;
    const anchor = componentPinPoint(first, "out");
    const secondOut = componentPinPoint(second, "out");
    second.x += anchor.x - secondOut.x;
    expect(componentPinPoint(second, "out")).toEqual(anchor);
    const wire = fixtureWire("shared-filter-anchor", [
      anchor,
      { x: anchor.x, y: anchor.y + 100 }
    ]);
    const document = documentWith(fixtureDocument({ components: [first, second], wires: [wire] }));
    const previousWire = structuredClone(wire);

    const result = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(first.id, second.id),
      { kind: "component-filter-kind", filterKind: "bandpass" }
    );

    expect(result).toMatchObject({
      kind: "changed",
      historyIntent: "push",
      renderScope: "incremental",
      targets: { componentIds: [first.id, second.id], wireIds: [] }
    });
    expect([first, second].map(filterKindForInstance)).toEqual(["bandpass", "bandpass"]);
    expect(wire).toEqual(previousWire);
  });

  it("resizes pure rectangles without changing unrelated wires", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 200, 200);
    const document = documentWith(fixtureDocument({
      components: [rectangle],
      wires: [fixtureWire("unrelated-wire", [{ x: 0, y: 0 }, { x: 40, y: 0 }])]
    }));
    const previousWire = structuredClone(document.wires[0]);

    const result = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(rectangle.id),
      { kind: "rectangle-width", value: "8" }
    );
    expect(result).toMatchObject({
      kind: "changed",
      renderScope: "document",
      changedIds: [rectangle.id]
    });
    expect(rectangleSettings(rectangle).widthGrid).toBe(8);
    expect(document.wires[0]).toEqual(previousWire);
  });

  it("resizes every selected rectangle at a shared origin without pin topology conflicts", () => {
    const first = fixtureComponent("rectangle", "X1", 200, 200);
    const second = fixtureComponent("rectangle", "X2", 200, 200);
    second.mirrored = true;
    const document = documentWith(fixtureDocument({ components: [first, second], wires: [] }));

    const result = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(first.id, second.id),
      { kind: "rectangle-width", value: 8 }
    );

    expect(result).toMatchObject({ kind: "changed", historyIntent: "push" });
    expect([first, second].map((component) => rectangleSettings(component).widthGrid))
      .toEqual([8, 8]);
  });

  it("rejects legacy rectangle pin commands without changing the document", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 200, 200);
    const document = documentWith(fixtureDocument({ components: [rectangle], wires: [] }));
    const before = structuredClone(document);

    const result = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(rectangle.id),
      { kind: "rectangle-left-pins", value: 1 }
    );

    expect(result).toMatchObject({
      kind: "rejected",
      rejectionReason: "invalid-value",
      historyIntent: "none"
    });
    expect(document).toEqual(before);
  });

  it("assigns the exact same component name in document order and reports one history intent", () => {
    const first = fixtureComponent("resistor", "R1", 0, 0);
    const second = fixtureComponent("resistor", "R2", 80, 0);
    const document = documentWith({ components: [first, second] });

    const result = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(second.id, first.id),
      { kind: "component-ref", ref: " shared " }
    );

    expect(result).toMatchObject({
      kind: "changed",
      historyIntent: "push",
      renderScope: "incremental",
      rebuildCounters: true,
      changedIds: [first.id, second.id]
    });
    expect(document.components.map((component) => component.ref)).toEqual(["shared", "shared"]);
  });

  it("preserves the whole document for incompatible or stale selections", () => {
    const amp = fixtureComponent("amp", "A1", 0, 0);
    const resistor = fixtureComponent("resistor", "R1", 80, 0);
    const document = documentWith({ components: [amp, resistor] });
    const before = structuredClone(document);

    const incompatible = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(amp.id, resistor.id),
      { kind: "component-gain-polarity", polarity: "negative" }
    );
    expect(incompatible).toMatchObject({
      kind: "rejected",
      historyIntent: "none"
    });
    expect(document).toEqual(before);

    const stale = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(amp.id, "missing"),
      { kind: "component-label-visibility", visible: false }
    );
    expect(stale).toMatchObject({
      kind: "rejected",
      rejectionReason: "stale-selection",
      historyIntent: "none"
    });
    expect(document).toEqual(before);
  });

  it("updates compatible cross-type Value fields but rejects different displayed semantics", () => {
    const source = fixtureComponent("voltageSource", "V1", 0, 0);
    const battery = fixtureComponent("battery", "V2", 80, 0);
    const resistor = fixtureComponent("resistor", "R1", 160, 0);
    const document = documentWith({ components: [source, battery, resistor] });

    const changed = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(source.id, battery.id),
      { kind: "component-value", value: " 1.25 " }
    );
    expect(changed).toMatchObject({
      kind: "changed",
      changedIds: [source.id, battery.id]
    });
    expect(source.values.main).toBe("1.25");
    expect(battery.values.main).toBe("1.25");

    const before = structuredClone(document);
    const rejected = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(source.id, resistor.id),
      { kind: "component-value", value: "2" }
    );
    expect(rejected).toMatchObject({
      kind: "rejected",
      rejectionReason: "incompatible-selection"
    });
    expect(document).toEqual(before);
  });

  it("updates Show value for compatible Value-bearing components", () => {
    const first = fixtureComponent("resistor", "R1", 0, 0);
    const second = fixtureComponent("capacitor", "C1", 80, 0);
    const document = documentWith({ components: [first, second] });

    const changed = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(first.id, second.id),
      { kind: "component-value-visibility", visible: true }
    );
    expect(changed).toMatchObject({ kind: "changed", changedIds: [first.id, second.id] });
    expect(first.values.valueVisible).toBe("true");
    expect(second.values.valueVisible).toBe("true");
  });

  it("supports compatible cross-type Views and Clocks with the proper render scope", () => {
    const resistor = fixtureComponent("resistor", "R1", 0, 0);
    const capacitor = fixtureComponent("capacitor", "C1", 100, 0);
    const comparator = fixtureComponent("comparator", "CMP1", 200, 0);
    const differential = fixtureComponent("diffComparator", "DCMP1", 320, 0);
    const document = documentWith({
      components: [resistor, capacitor, comparator, differential]
    });

    const passive = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(resistor.id, capacitor.id),
      {
        kind: "component-variant",
        variantId: "variable",
        moveBehavior: "stretch"
      }
    );
    expect(passive).toMatchObject({
      kind: "changed",
      renderScope: "incremental",
      targets: { componentIds: [resistor.id, capacitor.id] }
    });

    const clocked = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(comparator.id, differential.id),
      {
        kind: "component-clock",
        clock: "rising"
      }
    );
    expect(clocked).toMatchObject({
      kind: "changed",
      renderScope: "document",
      targets: { componentIds: [comparator.id, differential.id] }
    });
    expect(comparator.values.clock).toBe("rising");
    expect(differential.values.clock).toBe("rising");
  });

  it("patches only the requested MOS dimension and normalizes gate-off Arrow=None to Source", () => {
    const none = {
      ...fixtureComponent("nmos", "M1", 0, 0),
      variantId: "3pin-gate"
    };
    const source = {
      ...fixtureComponent("nmos", "M2", 100, 0),
      variantId: "3pin-gate-current"
    };
    const bulk = {
      ...fixtureComponent("pmos", "M3", 200, 0),
      variantId: "3pin-gate-bulk"
    };
    const document = documentWith({ components: [none, source, bulk] });

    const result = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(none.id, source.id, bulk.id),
      {
        kind: "component-mos-view",
        patch: { gateStyle: false },
        moveBehavior: "stretch"
      }
    );

    expect(result.kind).toBe("changed");
    expect(document.components.map((component) => component.variantId)).toEqual([
      "3pin-current",
      "3pin-current",
      "3pin-bulk"
    ]);
  });

  it("swaps differential output semantics without moving the physical wires", () => {
    const amplifier = fixtureComponent("diffAmp", "DA1", 200, 200);
    amplifier.values.differentialOutputsSame = "true";
    const comparator = fixtureComponent("diffComparator", "DCMP1", 500, 200);
    const originalTopOutput = componentPinPoint(amplifier, "outp");
    const outputWire = fixtureWire("output-wire", [
      originalTopOutput,
      { x: originalTopOutput.x + 80, y: originalTopOutput.y }
    ]);
    const document = documentWith(fixtureDocument({
      components: [amplifier, comparator],
      wires: [outputWire]
    }));
    const history = createSchematicDocumentHistoryAdapter(document);

    const result = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(amplifier.id, comparator.id),
      { kind: "component-differential-outputs", same: false }
    );

    expect(result).toMatchObject({
      kind: "changed",
      historyIntent: "push",
      renderScope: "incremental",
      targets: { componentIds: [amplifier.id, comparator.id], wireIds: [] }
    });
    expect(amplifier.values.differentialOutputsSame).toBeUndefined();
    expect(resolveComponentDef(amplifier).pins.find((pin) => pin.x > 0 && pin.y === -40)?.id).toBe("outn");
    expect(resolveComponentDef(amplifier).pins.find((pin) => pin.x > 0 && pin.y === 40)?.id).toBe("outp");
    expect(outputWire.points[0]).toEqual(originalTopOutput);
    expect(componentPinPoint(amplifier, "outp")).not.toEqual(originalTopOutput);

    expect(history.push(document)).toBe(true);
    const undone = history.undo();
    expect(undone?.components[0].values.differentialOutputsSame).toBe("true");
    expect(resolveComponentDef(undone!.components[0]).pins.find((pin) => pin.x > 0 && pin.y === -40)?.id).toBe("outp");
    expect(undone?.wires[0].points[0]).toEqual(originalTopOutput);

    const singleEnded = fixtureComponent("opAmp", "OA1", 800, 200);
    document.components.push(singleEnded);
    authorFixture(document);
    expect(executeSchematicPropertyBatchCommand(
      document,
      graphSelection(amplifier.id, singleEnded.id),
      { kind: "component-differential-outputs", same: true }
    )).toMatchObject({ kind: "rejected", rejectionReason: "invalid-value" });
  });

  it("applies the shared transistor circle setting atomically without changing geometry", () => {
    const nmos = fixtureComponent("nmos", "M1", 0, 0);
    const npn = fixtureComponent("npn", "Q1", 100, 0);
    const document = documentWith({ components: [nmos, npn] });
    const beforePins = [componentPinPoint(nmos, "g"), componentPinPoint(npn, "b")];

    const enabled = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(nmos.id, npn.id),
      { kind: "component-transistor-circle", visible: true }
    );

    expect(enabled).toMatchObject({
      kind: "changed",
      historyIntent: "push",
      renderScope: "incremental",
      targets: { componentIds: [nmos.id, npn.id], wireIds: [] }
    });
    expect(document.components.map((item) => item.values.transistorCircle)).toEqual(["true", "true"]);
    expect([componentPinPoint(nmos, "g"), componentPinPoint(npn, "b")]).toEqual(beforePins);

    const disabled = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(nmos.id, npn.id),
      { kind: "component-transistor-circle", visible: false }
    );
    expect(disabled.kind).toBe("changed");
    expect(document.components.every((item) => item.values.transistorCircle === undefined)).toBe(true);
  });

  it("changes a compatible Cell batch atomically and allocates fresh refs in document order", () => {
    const first = fixtureComponent("resistor", "R7", 0, 0);
    const second = fixtureComponent("resistor", "R8", 80, 0);
    const document = documentWith({ components: [first, second] });

    const result = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(second.id, first.id),
      { kind: "component-cell", type: "capacitor" }
    );

    expect(result).toMatchObject({
      kind: "changed",
      renderScope: "document",
      rebuildCounters: true,
      status: "2 components changed cell.",
      targets: { componentIds: [first.id, second.id] }
    });
    expect(document.components.map((component) => [component.type, component.ref])).toEqual([
      ["capacitor", "C1"],
      ["capacitor", "C2"]
    ]);
  });

  it("preserves the detailed Cell status for a single selected component", () => {
    const resistor = fixtureComponent("resistor", "R7", 0, 0);
    const document = documentWith({ components: [resistor] });

    const result = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(resistor.id),
      { kind: "component-cell", type: "capacitor" }
    );

    expect(result).toMatchObject({
      kind: "changed",
      status: "R7 cell changed from resistor to capacitor as C1."
    });
  });

  it("keeps Wire Start/End tied to each stored path direction and gates Bits on Digital", () => {
    const first = fixtureWire("w1", [{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    const reverse = fixtureWire("w2", [{ x: 100, y: 20 }, { x: 0, y: 20 }]);
    const document = documentWith({ wires: [first, reverse] });

    const markers = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(first.id, reverse.id),
      { kind: "wire-decoration", patch: { startMarker: "arrow" } }
    );
    expect(markers).toMatchObject({
      kind: "changed",
      targets: { wireIds: [first.id, reverse.id] }
    });
    expect(first.points[0]).toEqual({ x: 0, y: 0 });
    expect(reverse.points[0]).toEqual({ x: 100, y: 20 });
    expect(resolvedWireAppearance(first).startMarker).toBe("arrow");
    expect(resolvedWireAppearance(reverse).startMarker).toBe("arrow");

    const before = structuredClone(document);
    const hiddenBits = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(first.id, reverse.id),
      { kind: "wire-decoration", patch: { digitalLabel: "8" } }
    );
    expect(hiddenBits).toMatchObject({
      kind: "rejected",
      rejectionReason: "incompatible-selection"
    });
    expect(document).toEqual(before);

    expect(executeSchematicPropertyBatchCommand(
      document,
      graphSelection(first.id, reverse.id),
      { kind: "wire-decoration", patch: { digitalSlash: true } }
    ).kind).toBe("changed");
    expect(executeSchematicPropertyBatchCommand(
      document,
      graphSelection(first.id, reverse.id),
      { kind: "wire-decoration", patch: { digitalLabel: "8" } }
    ).kind).toBe("changed");
    expect(document.wires.map((wire) => resolvedWireAppearance(wire).digitalLabel)).toEqual(["8", "8"]);
  });

  it("shares Ink Color across Component, Wire, and Junction and treats black as Default", () => {
    const component = fixtureComponent("resistor", "R1", 0, 0);
    const wire = fixtureWire("w1", [{ x: 40, y: 0 }, { x: 120, y: 0 }]);
    const junction = { x: 80, y: 0 };
    const document = documentWith(fixtureDocument({ components: [component], wires: [wire], junctions: [junction] }));

    const colored = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(component.id, wire.id, junctionId(junction)),
      { kind: "ink-color", color: "#0072B2" }
    );
    expect(colored).toMatchObject({
      kind: "changed",
      renderScope: "incremental",
      targets: {
        componentIds: [component.id],
        wireIds: [wire.id],
        junctionPoints: [junction]
      }
    });
    expect(componentCustomColor(component)).toBe("#0072b2");
    expect(wireCustomColor(wire)).toBe("#0072b2");
    expect(junctionCustomColor(document, junction)).toBe("#0072b2");

    const reset = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(component.id, wire.id, junctionId(junction)),
      { kind: "ink-color", color: "#111111" }
    );
    expect(reset.kind).toBe("changed");
    expect(componentCustomColor(component)).toBeNull();
    expect(wireCustomColor(wire)).toBeNull();
    expect(junctionCustomColor(document, junction)).toBeNull();
  });

  it("renames all selected Net Labels, allows matching names, and rejects invalid input atomically", () => {
    const labels: NetLabel[] = [
      { id: "label-a", name: "A", attachment: { wireId: "w1", point: { x: 20, y: 0 } } },
      { id: "label-b", name: "B", attachment: { wireId: "w2", point: { x: 20, y: 20 } } }
    ];
    const document = documentWith({
      wires: [
        fixtureWire("w1", [{ x: 0, y: 0 }, { x: 40, y: 0 }]),
        fixtureWire("w2", [{ x: 0, y: 20 }, { x: 40, y: 20 }])
      ],
      netLabels: labels
    });
    const before = structuredClone(document);

    const invalid = executeSchematicPropertyBatchCommand(
      document,
      graphSelection("label-a", "label-b"),
      { kind: "net-label-name", name: "bad name" }
    );
    expect(invalid).toMatchObject({
      kind: "rejected",
      rejectionReason: "invalid-value"
    });
    expect(document).toEqual(before);

    const renamed = executeSchematicPropertyBatchCommand(
      document,
      graphSelection("label-b", "label-a"),
      { kind: "net-label-name", name: " SHARED " }
    );
    expect(renamed).toMatchObject({
      kind: "changed",
      renderScope: "document",
      targets: { netLabelIds: ["label-a", "label-b"] }
    });
    expect(renamed.status).toContain("may merge networks");
    expect(labels.map((label) => label.name)).toEqual(["SHARED", "SHARED"]);
  });

  it("applies Note format, fill, size, and Markdown width to the complete group", () => {
    const first = fixtureNote("note-1");
    const second = { ...fixtureNote("note-2"), backgroundColor: null, fontSizePx: 20 };
    const document = documentWith({ notes: [first, second] });

    const unavailableWidth = executeSchematicPropertyBatchCommand(
      document,
      noteSelection(first.id, second.id),
      { kind: "note-width", value: 400 }
    );
    expect(unavailableWidth).toMatchObject({
      kind: "rejected",
      rejectionReason: "incompatible-selection"
    });

    expect(executeSchematicPropertyBatchCommand(
      document,
      noteSelection(second.id, first.id),
      { kind: "note-format", format: "markdown" }
    )).toMatchObject({
      kind: "changed",
      changedNoteIds: [first.id, second.id]
    });
    expect(executeSchematicPropertyBatchCommand(
      document,
      noteSelection(first.id, second.id),
      { kind: "note-width", value: "333" }
    ).kind).toBe("changed");
    expect(document.notes.map(noteWidthPx)).toEqual([340, 340]);

    expect(executeSchematicPropertyBatchCommand(
      document,
      noteSelection(first.id, second.id),
      { kind: "note-font-size", value: "18" }
    ).kind).toBe("changed");
    expect(document.notes.map(noteFontSizePx)).toEqual([18, 18]);

    expect(executeSchematicPropertyBatchCommand(
      document,
      noteSelection(first.id, second.id),
      { kind: "note-background", color: null }
    ).kind).toBe("changed");
    expect(document.notes.map((note) => note.backgroundColor)).toEqual([null, null]);
    expect(document.notes.map((note) => note.text)).toEqual(["rewrite note", "rewrite note"]);
  });

  it("updates common Pin fields and preserves temporarily deleted object participation", () => {
    const first = fixtureComponent("plus", "SUM1", 0, 0);
    const second = {
      ...fixtureComponent("plus", "SUM2", 100, 0),
      temporarilyDeleted: true
    };
    const document = documentWith({ components: [first, second] });

    const mode = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(first.id, second.id),
      {
        kind: "component-pin-mode",
        pinId: "left",
        mode: "negative"
      }
    );
    expect(mode).toMatchObject({
      kind: "changed",
      targets: { componentIds: [first.id, second.id] }
    });

    const symbol = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(first.id, second.id),
      {
        kind: "component-pin-symbol-visibility",
        pinId: "left",
        visible: false
      }
    );
    expect(symbol.kind).toBe("changed");
    expect(first.values["pinMode:left"]).toBe("negative");
    expect(second.values["pinMode:left"]).toBe("negative");
    expect(first.values["pinSymbolVisible:left"]).toBe("false");
    expect(second.values["pinSymbolVisible:left"]).toBe("false");
  });

  it("returns a true no-op without mutation or history when every target already matches", () => {
    const first = fixtureComponent("resistor", "R1", 0, 0);
    const second = fixtureComponent("resistor", "R1", 80, 0);
    second.id = "component-2";
    const document = documentWith({ components: [first, second] });
    const before = structuredClone(document);

    const result = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(first.id, second.id),
      { kind: "component-ref", ref: "R1" }
    );

    expect(result).toEqual({
      kind: "unchanged",
      changed: false,
      historyIntent: "none",
      renderScope: "none",
      rebuildCounters: false,
      status: "",
      changedIds: [],
      changedNoteIds: [],
      changedJunctionPoints: [],
      targets: {
        componentIds: [],
        wireIds: [],
        junctionPoints: [],
        netLabelIds: [],
        noteIds: []
      }
    });
    expect(document).toEqual(before);
  });

  it("treats an implicit default Note fill as equal to transparent for plain notes", () => {
    const first = { ...fixtureNote("note-1"), backgroundColor: undefined };
    const second = { ...fixtureNote("note-2"), backgroundColor: undefined };
    const document = documentWith({ notes: [first, second] });
    const before = structuredClone(document);

    const result = executeSchematicPropertyBatchCommand(
      document,
      noteSelection(first.id, second.id),
      { kind: "note-background", color: null }
    );

    expect(result).toMatchObject({
      kind: "unchanged",
      historyIntent: "none"
    });
    expect(document).toEqual(before);
    expect(document.notes.every((note) => note.backgroundColor === undefined)).toBe(true);
  });

  it("skips unchanged targets but only reports the objects actually changed", () => {
    const first = fixtureComponent("resistor", "R1", 0, 0);
    const second = fixtureComponent("resistor", "R2", 80, 0);
    first.appearance = { color: "#0072b2" };
    const document = documentWith({ components: [first, second] });

    const result = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(second.id, first.id),
      { kind: "component-color", color: "#0072b2" }
    );

    expect(result).toMatchObject({
      kind: "changed",
      changedIds: [second.id],
      targets: { componentIds: [second.id] }
    });
    expect(componentCustomColor(first)).toBe("#0072b2");
    expect(componentCustomColor(second)).toBe("#0072b2");
  });

  it("changes ADC Clock independently from its View", () => {
    const adc = fixtureComponent("adc", "ADC1", 200, 200);
    adc.variantId = "quantizer";
    const document = documentWith({ components: [adc] });

    const clocked = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(adc.id),
      { kind: "component-clock", clock: "rising" }
    );
    expect(clocked).toMatchObject({
      kind: "changed",
      renderScope: "document",
      targets: { componentIds: [adc.id] }
    });
    expect(adc.variantId).toBe("quantizer");
    expect(adc.values.clock).toBe("rising");
    expect(resolveComponentDef(adc)).toMatchObject({
      symbol: "adc-quantizer",
      terminalClass: "threeTerminal"
    });

    const noClock = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(adc.id),
      { kind: "component-clock", clock: "none" }
    );
    expect(noClock).toMatchObject({ kind: "changed", renderScope: "document" });
    expect(adc.variantId).toBe("quantizer");
    expect(resolveComponentDef(adc)).toMatchObject({
      symbol: "adc-quantizer",
      terminalClass: "twoTerminal"
    });
  });

  it("keeps a logic gate''s input count when Cell is changed from the Property Editor", () => {
    const nand = fixtureComponent("nand", "NAND1", 0, 0);
    nand.variantId = "3-input";
    const document = documentWith({ components: [nand] });

    const result = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(nand.id),
      { kind: "component-cell", type: "and" }
    );

    expect(result).toMatchObject({
      kind: "changed",
      status: "NAND1 cell changed from nand to and as AND1."
    });
    expect(nand).toMatchObject({ type: "and", ref: "AND1", variantId: "3-input" });
    expect(resolveComponentDef(nand).pins.map((pin) => pin.id))
      .toEqual(["in1", "in2", "in3", "out"]);
  });

  it("moves attached DFF control wires between synchronous and asynchronous pins", () => {
    const dff = fixtureComponent("dff", "X1", 200, 200);
    dff.values[DFF_VALUE_KEYS.setMode] = "synchronous";
    const previousSet = componentPinPoint(dff, "set");
    const wire = fixtureWire("set-wire", [{ x: 80, y: previousSet.y }, previousSet]);
    const document = documentWith(fixtureDocument({ components: [dff], wires: [wire] }));

    const result = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(dff.id),
      {
        kind: "component-dff-setting",
        property: "setMode",
        value: "asynchronous"
      }
    );

    expect(result).toMatchObject({
      kind: "changed",
      historyIntent: "push",
      renderScope: "document",
      targets: {
        componentIds: [dff.id],
        wireIds: [wire.id]
      }
    });
    expect(previousSet).toEqual({ x: 140, y: 160 });
    expect(componentPinPoint(dff, "set")).toEqual({ x: 200, y: 140 });
    expect(wire.points.at(-1)).toEqual({ x: 200, y: 140 });
    expect(dffSettings(dff).setMode).toBe("asynchronous");
  });

  it("updates non-geometric DFF settings incrementally and rejects non-DFF selections", () => {
    const dff = fixtureComponent("dff", "X1", 200, 200);
    const resistor = fixtureComponent("resistor", "R1", 400, 200);
    const document = documentWith({ components: [dff, resistor] });

    expect(executeSchematicPropertyBatchCommand(
      document,
      graphSelection(dff.id),
      {
        kind: "component-dff-setting",
        property: "clockEdge",
        value: "falling"
      }
    )).toMatchObject({
      kind: "changed",
      renderScope: "incremental",
      targets: { componentIds: [dff.id], wireIds: [] }
    });
    expect(dffSettings(dff).clockEdge).toBe("falling");

    const before = structuredClone(document);
    expect(executeSchematicPropertyBatchCommand(
      document,
      graphSelection(resistor.id),
      {
        kind: "component-dff-setting",
        property: "resetMode",
        value: "synchronous"
      }
    )).toMatchObject({
      kind: "rejected",
      rejectionReason: "incompatible-selection",
      historyIntent: "none"
    });
    expect(document).toEqual(before);
  });

  it.each([
    { kind: "component-ref", ref: "" },
    { kind: "component-color", color: "red" },
    { kind: "component-mos-view", patch: {}, moveBehavior: "stretch" }
  ] as SchematicPropertyBatchCommand[])("rejects invalid $kind values before mutating any target", (command) => {
    const first = fixtureComponent(command.kind === "component-mos-view" ? "nmos" : "resistor", "X1", 0, 0);
    const second = fixtureComponent(command.kind === "component-mos-view" ? "nmos" : "resistor", "X2", 80, 0);
    const document = documentWith({ components: [first, second] });
    const before = structuredClone(document);

    const result = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(first.id, second.id),
      command
    );

    expect(result).toMatchObject({
      kind: "rejected",
      historyIntent: "none"
    });
    expect(document).toEqual(before);
  });

  it("rolls back every partial mutation when topology apply throws", () => {
    const component = fixtureComponent("comparator", "CMP1", 100, 100);
    const wire = fixtureWire("w1", [{ x: 60, y: 100 }, { x: 140, y: 100 }]);
    const label: NetLabel = {
      id: "label-1",
      name: "OUT",
      attachment: { wireId: wire.id, point: { x: 80, y: 100 } }
    };
    const note = fixtureNote("note-1");
    const document = documentWith(fixtureDocument({
      components: [component],
      wires: [wire],
      junctions: [{ x: 80, y: 100 }],
      netLabels: [label],
      notes: [note]
    }));
    connectFixtureJunction(document, { x: 80, y: 100 });
    document.junctionAppearances = [{
      point: { x: 80, y: 100 },
      color: "#0072b2"
    }];
    const before = structuredClone(document);
    const originalArrays = {
      components: document.components,
      wires: document.wires,
      junctions: document.junctions,
      junctionAppearances: document.junctionAppearances,
      netLabels: document.netLabels,
      notes: document.notes
    };

    const result = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(component.id),
      {
        kind: "component-clock",
        clock: "rising"
      },
      {
        applyWireMoveTopology: (liveDocument) => {
          liveDocument.wires[0].points[0].x = 999;
          liveDocument.netLabels[0].name = "PARTIAL";
          liveDocument.notes[0].text = "PARTIAL";
          throw new Error("injected topology failure");
        }
      }
    );

    expect(result).toMatchObject({
      kind: "rejected",
      rejectionReason: "apply-failed",
      changed: false,
      historyIntent: "none",
      renderScope: "none",
      changedIds: [],
      changedNoteIds: []
    });
    expect(document).toEqual(before);
    expect(document.components).toBe(originalArrays.components);
    expect(document.wires).toBe(originalArrays.wires);
    expect(document.junctions).toBe(originalArrays.junctions);

    expect(document.junctionAppearances).toBe(originalArrays.junctionAppearances);
    expect(document.netLabels).toBe(originalArrays.netLabels);
    expect(document.notes).toBe(originalArrays.notes);
    expect(document.components[0]).toBe(component);
    expect(document.wires[0]).toBe(wire);
    expect(document.netLabels[0]).toBe(label);
    expect(document.notes[0]).toBe(note);
    expect(component.values.clock).toBeUndefined();
  });

  it("restores the original document and object identities when normalization throws", () => {
    const component = fixtureComponent("comparator", "CMP1", 100, 100);
    const wire = fixtureWire("w1", [{ x: 20, y: 100 }, { x: 180, y: 100 }]);
    const label: NetLabel = {
      id: "label-1",
      name: "OUT",
      attachment: { wireId: wire.id, point: { x: 60, y: 100 } }
    };
    const document = documentWith(fixtureDocument({
      components: [component],
      wires: [wire],
      junctions: [{ x: 60, y: 100 }],
      netLabels: [label]
    }));
    const before = structuredClone(document);
    const originalWireArray = document.wires;

    const result = executeSchematicPropertyBatchCommand(
      document,
      graphSelection(component.id),
      {
        kind: "component-clock",
        clock: "rising"
      },
      {
        applyNormalizedDocumentWires: (liveDocument) => {
          applyNormalizedDocumentWires(liveDocument);
          liveDocument.netLabels[0].name = "PARTIAL";
          throw new Error("injected normalization failure");
        }
      }
    );

    expect(result).toMatchObject({
      kind: "rejected",
      rejectionReason: "apply-failed",
      historyIntent: "none",
      targets: {
        componentIds: [],
        wireIds: [],
        junctionPoints: [],
        netLabelIds: [],
        noteIds: []
      }
    });
    expect(document).toEqual(before);
    expect(document.wires).toBe(originalWireArray);
    expect(document.components[0]).toBe(component);
    expect(document.wires[0]).toBe(wire);
    expect(document.netLabels[0]).toBe(label);
    expect(component.values.clock).toBeUndefined();
  });
});
