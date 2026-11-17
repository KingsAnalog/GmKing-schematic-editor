import { fixtureDocument, authorFixture } from "../support/fixtureDocument";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { describe, expect, it } from "vitest";
import { getComponentVariants, resolveComponentDef } from "../../../src/schematic/catalog";
import { createEmptySchematicDocument, contentFromDocument } from "../../../src/schematic/document/documentModel";
import { createSchematicContentHistoryAdapter } from "../../../src/schematic/document/contentHistoryAdapter";
import { parseSchematicContent, serializeSchematicContent } from "../../../src/schematic/schematicDocumentCodec";
import { executeSchematicPropertyBatchCommand } from "../../../src/schematic/propertyBatchCommands";
import { buildSchematicPropertyPanelInput } from "../../../src/schematic/propertyPanelProjection";
import { copySourceFromDocument } from "../../../src/schematic/copyModel";
import { voltageSourceFields, voltageSourceFieldValue, voltageSourcePairCount, MAX_PWL_PAIRS } from "../../../src/schematic/voltageSourceModel";
import { fixtureComponent, fixtureWire } from "../support/fixtures";

function fixture(type = "dc") {
  const document = createEmptySchematicDocument();
  const source = fixtureComponent("voltageSource", "V1", 100, 100);
  source.variantId = type;
  document.components.push(source);
    authorFixture(document);
  const selection = { selectedIds: [source.id], selectedNoteIds: [] };
  const field = (key: string, value: string) => executeSchematicPropertyBatchCommand(document, selection, { kind: "voltage-source-field", key, value });
  return { document, source, selection, field };
}

describe("voltage source configuration", () => {
  it("persists ramp direction and parameters, and restores the waveform through Undo/Redo", () => {
    const { source, document, field, selection } = fixture("ramp");
    expect(voltageSourceFieldValue(source, "vsource:ramp:direction")).toBe("up");
    expect(resolveComponentDef(source).symbol).toBe("voltageSource-ramp-up");
    field("vsource:ramp:lowValue", "0");
    field("vsource:ramp:highValue", "vref");
    field("vsource:ramp:delay", "1n");
    field("vsource:ramp:duration", "10u");
    const before = contentFromDocument(document);
    const history = createSchematicContentHistoryAdapter(before);
    const up = makeComponentCell(source).attr("symbolContentPath0/d");
    expect(field("vsource:ramp:direction", "down")).toMatchObject({ changed: true, historyIntent: "push" });
    expect(makeComponentCell(source).attr("symbolContentPath0/d")).not.toBe(up);
    history.push(contentFromDocument(document));
    expect(history.undo()).toEqual(before);
    expect(history.redo()?.components[0].values["vsource:ramp:direction"]).toBe("down");
    executeSchematicPropertyBatchCommand(document, selection, { kind: "component-variant", variantId: "dc", moveBehavior: "stretch" });
    executeSchematicPropertyBatchCommand(document, selection, { kind: "component-variant", variantId: "ramp", moveBehavior: "stretch" });
    const restored = parseSchematicContent(serializeSchematicContent(contentFromDocument(document))).components[0];
    expect(restored.values).toEqual(source.values);
    expect(resolveComponentDef(restored).symbol).toBe("voltageSource-ramp-down");
    expect(field("vsource:ramp:direction", "sideways")).toMatchObject({ changed: false, historyIntent: "none" });
    source.values["vsource:ramp:direction"] = "invalid";
    expect(() => serializeSchematicContent(contentFromDocument(document))).toThrow();
  });

  it.each(["dc", "sine", "pulse", "exp", "bit", "pwl", "ramp", "noise"])("renders %s with stable two-terminal geometry", type => {
    const { source } = fixture(type);
    source.rotation = 90;
    source.mirrored = true;
    const cell = makeComponentCell(source);
    expect(cell.getPorts().map((pin: { id: string }) => pin.id)).toEqual(["p", "n"]);
    expect(cell.attr("symbolBody/d")).toBeTruthy();
  });
  it.each([
    ["sine", ["Frequency name 1", "Frequency 1", "Amplitude 1 (Vpk)", "Phase for Sinusoid 1", "Sine DC level", "Delay time"]],
    ["pulse", ["Frequency name 1", "Delay time", "Zero value", "One value", "Period of waveform", "Rise time", "Fall time", "Type of rising & falling edge", "Pulse width"]],
    ["exp", ["Zero value", "One value", "Rise time start", "Rise time constant", "Fall time start", "Fall time constant", "Exp period"]],
    ["bit", ["Delay time", "Zero value", "One value", "Period of waveform", "Rise time", "Fall time", "Rise delay", "Fall delay"]]
  ])("provides the reference fields for %s", (type, labels) => {
    expect(voltageSourceFields(type as string).map(field => field.label)).toEqual(labels);
  });

  it("shows only current source types and hides the obsolete generic value editor", () => {
    const { document, source } = fixture("sine");
    const panel = buildSchematicPropertyPanelInput({
      document, hasSelection: true,
      targets: fixtureDocument({ components: [source], wires: [], notes: [], netLabels: [], junctionPoints: [] })
    }).component!;
    expect(panel.variants?.label).toBe("Source type");
    expect(panel.variants?.options.map(option => option.id)).toEqual(["dc", "sine", "pulse", "exp", "bit", "pwl", "ramp", "noise"]);
    expect(panel.value).toBeUndefined();
    expect(panel.sourceFields).toHaveLength(6);
  });

  it("rejects removed waveform types and persists the current sine amplitude", () => {
    for (const type of ["square", "triangle"]) {
      const { source, document } = fixture(type);
      source.values.main = "750m";
      expect(() => serializeSchematicContent(contentFromDocument(document))).toThrow(/variant/);
    }
    expect(getComponentVariants("voltageSource").some(variant => variant.id === "square")).toBe(false);
    const { source, field, document } = fixture("sine");
    field("vsource:sine:amplitude", "750m");
    expect(voltageSourceFieldValue(source, "vsource:sine:amplitude")).toBe("750m");
    expect(parseSchematicContent(serializeSchematicContent(contentFromDocument(document))).components[0].values["vsource:sine:amplitude"]).toBe("750m");
    field("vsource:sine:amplitude", "");
    expect(voltageSourceFieldValue(source, "vsource:sine:amplitude")).toBe("");
  });

  it("stores noise amplitude in the current schema and renders the waveform at every rotation", () => {
    const { source, field, document } = fixture("noise");
    expect(field("main", "Vn").changed).toBe(true);
    expect(voltageSourceFields("noise")).toEqual([{ key: "main", label: "Amplitude" }]);
    expect(parseSchematicContent(serializeSchematicContent(contentFromDocument(document))).components[0].variantId).toBe("noise");
    for (const rotation of [0, 90, 180, 270] as const) {
      source.rotation = rotation;
      expect(resolveComponentDef(source).symbol).toBe("voltageSource-noise");
      expect(makeComponentCell(source).attr("symbolContentPath0/d")).toContain("L");
    }
  });

  it("changes the PWL count dynamically without erasing hidden points", () => {
    const { source, field, document } = fixture("pwl");
    expect(voltageSourcePairCount(source)).toBe(2);
    expect(field("vsource:pwl:pairs", "5")).toMatchObject({ changed: true, historyIntent: "push" });
    expect(voltageSourceFields("pwl", voltageSourcePairCount(source)).map(field => field.label)).toEqual([
      "Number of PWL/Time pairs", "Time 1", "Voltage 1", "Time 2", "Voltage 2", "Time 3", "Voltage 3",
      "Time 4", "Voltage 4", "Time 5", "Voltage 5", "Delay time", "DC offset"
    ]);
    field("vsource:pwl:time5", "10n");
    field("vsource:pwl:voltage5", "vref/2");
    field("vsource:pwl:pairs", "1");
    expect(voltageSourceFields("pwl", voltageSourcePairCount(source))).toHaveLength(5);
    field("vsource:pwl:pairs", "5");
    const restored = parseSchematicContent(serializeSchematicContent(contentFromDocument(document)));
    expect(restored.components[0].values["vsource:pwl:time5"]).toBe("10n");
    expect(restored.components[0].values["vsource:pwl:voltage5"]).toBe("vref/2");
    expect(copySourceFromDocument(document).components[0].values).toEqual(source.values);
  });

  it.each(["0", "-1", "1.5", "NaN", String(MAX_PWL_PAIRS + 1)])("rejects invalid PWL count %s without mutation", value => {
    const { document, field } = fixture("pwl");
    const before = structuredClone(document);
    expect(field("vsource:pwl:pairs", value)).toMatchObject({ kind: "rejected", changed: false, historyIntent: "none" });
    expect(document).toEqual(before);
  });

  it("accepts both pulse edge types and rejects unsupported choices atomically", () => {
    const { source, field, document } = fixture("pulse");
    for (const edge of ["linear", "halfsine"]) {
      expect(field("vsource:pulse:edgeType", edge).changed).toBe(true);
      expect(source.values["vsource:pulse:edgeType"]).toBe(edge);
    }
    const before = structuredClone(document);
    expect(field("vsource:pulse:edgeType", "square").changed).toBe(false);
    expect(document).toEqual(before);
    source.values["vsource:pulse:edgeType"] = "invalid";
    expect(() => serializeSchematicContent(contentFromDocument(document))).toThrow();
  });

  it("preserves independent type settings and wires through type changes and Undo/Redo", () => {
    const { source, document, selection, field } = fixture("sine");
    document.wires.push(fixtureWire("w1", [{ x: 0, y: 100 }, { x: 60, y: 100 }]));
    authorFixture(document);
    const wires = structuredClone(document.wires);
    field("vsource:sine:frequency", "100Meg");
    const before = contentFromDocument(document);
    const history = createSchematicContentHistoryAdapter(before);
    field("vsource:sine:amplitude", "vref/2");
    history.push(contentFromDocument(document));
    expect(history.undo()).toEqual(before);
    expect(history.redo()?.components[0].values["vsource:sine:amplitude"]).toBe("vref/2");
    executeSchematicPropertyBatchCommand(document, selection, { kind: "component-variant", variantId: "pulse", moveBehavior: "stretch" });
    field("vsource:pulse:period", "10n");
    executeSchematicPropertyBatchCommand(document, selection, { kind: "component-variant", variantId: "sine", moveBehavior: "stretch" });
    expect(source.values["vsource:sine:frequency"]).toBe("100Meg");
    expect(source.values["vsource:pulse:period"]).toBe("10n");
    expect(document.wires).toEqual(wires);
  });

  it("does not partially apply a field to incompatible selected source types", () => {
    const { document, source } = fixture("sine");
    const second = fixtureComponent("voltageSource", "V2", 300, 100);
    second.variantId = "pulse";
    document.components.push(second);
    authorFixture(document);
    const before = structuredClone(document);
    const result = executeSchematicPropertyBatchCommand(document, { selectedIds: [source.id, second.id], selectedNoteIds: [] },
      { kind: "voltage-source-field", key: "vsource:sine:frequency", value: "100Meg" });
    expect(result.changed).toBe(false);
    expect(document).toEqual(before);
  });
});
