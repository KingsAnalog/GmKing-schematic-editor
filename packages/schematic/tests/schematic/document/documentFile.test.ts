import { fixtureDocument, authorFixture } from "../support/fixtureDocument";
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadBlob } from "../../../src/shared/download";
import {
  createSchematicFile,
  MAX_SCHEMATIC_FILE_BYTES,
  parseSchematicDocumentFile,
  readSchematicDocumentFile,
  SCHEMATIC_FILE_FORMAT,
  schematicDocumentFilename,
  schematicDocumentTitleFromFilename,
  SchematicDocumentFileError,
  serializeSchematicDocumentFile,
  type SchematicFile
} from "../../../src/schematic/schematicDocumentFile";
import type { CopySource } from "../../../src/schematic/copyModel";
import { DFF_VALUE_KEYS } from "../../../src/schematic/dffModel";
import { COMPONENT_CLOCK_VALUE_KEY } from "../../../src/schematic/clockModel";
import type { ComponentInstance, SchematicDocument } from "../../../src/schematic/types";

function component(
  id = "component-1",
  ref = "R1",
  overrides: Partial<ComponentInstance> = {}
): ComponentInstance {
  return {
    id,
    type: "resistor",
    ref,
    x: 120,
    y: 0,
    rotation: 0,
    mirrored: false,
    values: { main: "10k", labelVisible: "false" },
    ...overrides
  };
}

function documentFixture(): SchematicDocument {
  const document: SchematicDocument = fixtureDocument({
    components: [{
      ...component(),
      appearance: { color: "#0072B2" },
      temporarilyDeleted: true
    }],
    wires: [
      {
        id: "horizontal",
        routeMode: "orthogonal",
        points: [{ x: 0, y: 0 }, { x: 80, y: 0 }],
        appearance: {
          variant: "signal",
          color: "#D55E00",
          lineWidth: "2a",
          startMarker: "arrow",
          digitalSlash: true,
          digitalLabel: "8"
        }
      },
      {
        id: "branch",
        routeMode: "orthogonal",
        points: [{ x: 40, y: 0 }, { x: 40, y: 40 }]
      },
      {
        id: "temporarily-deleted-wire",
        routeMode: "orthogonal",
        points: [{ x: 0, y: 80 }, { x: 80, y: 80 }],
        appearance: { variant: "wide", color: "#009E73" },
        temporarilyDeleted: true
      }
    ],
    junctions: [{ x: 999, y: 999 }],

    junctionAppearances: [{
      point: { x: 40, y: 0 },
      color: "#CC79A7"
    }],
    netLabels: [{
      id: "net-label-1",
      name: "OUT",
      attachment: {
        wireId: "horizontal",
        point: { x: 20, y: 0 }
      }
    }],
    notes: [{
      id: "note-1",
      x: 20,
      y: 120,
      width: 180,
      height: 60,
      format: "markdown",
      text: "**gain**",
      backgroundColor: null,
      fontSizePx: 16
    }]
  }, { joinAt: [{ x: 40, y: 0 }] });
  Object.assign(document, { selection: { ids: ["component-1"] }, viewport: { zoom: 4 } });
  Object.assign(document.components[0], { selected: true });
  Object.assign(document.components[0].appearance!, { hoverColor: "#ffffff" });
  Object.assign(document.wires[0].appearance!, { renderedStrokeWidth: 99 });
  return document;
}

function emptyFile(): SchematicFile {
  return createSchematicFile(fixtureDocument({}));
}

function authoredFile(file: SchematicFile): SchematicFile {
  return createSchematicFile(fixtureDocument(file.schematic));
}

function parseValue(value: unknown) {
  return parseSchematicDocumentFile(JSON.stringify(value));
}

function expectFileError(action: () => unknown, code: SchematicDocumentFileError["code"]) {
  try {
    action();
    throw new Error("Expected a SchematicDocumentFileError.");
  } catch (error) {
    expect(error).toBeInstanceOf(SchematicDocumentFileError);
    expect((error as SchematicDocumentFileError).code).toBe(code);
  }
}

describe("single schematic document file codec", () => {
  it("persists coupling label visibility independently of its mode", () => {
    const file = emptyFile();
    file.schematic.components.push(
      component("l1", "L1", { type: "inductor" }),
      component("l2", "L2", { type: "inductor", x: 240 })
    );
    file.schematic.inductorCouplings = [{ showLabel: false,
      id: "k12",
      inductorAId: "l1",
      inductorBId: "l2",
      coefficient: "k12",
      coefficientAuto: true,
      labelMode: "coefficient",
      showArc: true,
      showCore: false,
      arcFlipped: false
    }];

    const restored = parseValue(authoredFile(file));
    expect(restored.inductorCouplings?.[0].showLabel).toBe(false);

    restored.inductorCouplings![0].labelMode = "ratio";
    restored.inductorCouplings![0].showLabel = true;
    restored.inductorCouplings![0].appearance = { color: "#005f9e" };
    const serialized = serializeSchematicDocumentFile(restored);
    expect(JSON.parse(serialized).schematic.inductorCouplings[0]).toMatchObject({
      labelMode: "ratio",
      showLabel: true,
      appearance: { color: "#005f9e" }
    });
    expect(parseSchematicDocumentFile(serialized).inductorCouplings?.[0].appearance)
      .toEqual({ color: "#005f9e" });
  });

  it("writes compact pretty JSON and omits derived and session state", () => {
    const document = documentFixture();

    const serialized = serializeSchematicDocumentFile(document);
    const spacious = `${JSON.stringify(createSchematicFile(document), null, 2)}\n`;
    const value = JSON.parse(serialized) as Record<string, unknown>;
    const schematic = value.schematic as Record<string, unknown>;
    const lines = serialized.trimEnd().split("\n");
    const componentBody = serialized
      .split('    "components": [\n')[1]
      .split('\n    ],\n    "wires":')[0];
    const componentLines = componentBody.split("\n");
    const wireBody = serialized
      .split('    "wires": [\n')[1]
      .split('\n    ],\n    "connections":')[0];
    const wireLines = wireBody.split("\n");
    const noteBody = serialized
      .split('    "notes": [\n')[1]
      .split("\n    ]\n  }\n}")[0];
    const noteLines = noteBody.split("\n");

    expect(serialized.endsWith("\n")).toBe(true);
    expect(serialized).toContain('\n  "format": "adc-helper/schematic",');
    expect(serialized).toContain('"points": [{"x": 0, "y": 0}, {"x": 40, "y": 0}, {"x": 80, "y": 0}]');
    expect(serialized).toContain('"point": {"x": 40, "y": 0}');
    expect(componentLines).toEqual([
      '      {"type": "resistor", "ref": "R1", "x": 120, "y": 0, "rotation": 0, "mirrored": false, "appearance": {"color": "#0072B2"}, "temporarilyDeleted": true, "id": "component-1",',
      '        "values": {"main": "10k", "labelVisible": "false"}}'
    ]);
    expect(wireLines).toHaveLength(document.wires.length);
    expect(wireLines.every((line) =>
      line.startsWith('      {"points": [')
      && line.includes('"routeMode": ')
      && (line.endsWith("}") || line.endsWith("},"))
    )).toBe(true);
    expect(wireLines[0]).toContain('"id": "horizontal"},');
    expect(wireLines[0].length).toBeGreaterThan(120);
    expect(noteLines).toEqual([
      '      {"x": 20, "y": 120, "width": 180, "height": 60, "format": "markdown", "backgroundColor": null, "fontSizePx": 16, "id": "note-1",',
      '        "text": "**gain**"}'
    ]);
    expect(lines.length).toBeLessThan(spacious.trimEnd().split("\n").length);
    expect(serializeSchematicDocumentFile(document)).toBe(serialized);
    expect(value).toMatchObject({
      format: SCHEMATIC_FILE_FORMAT
    });
    expect(Object.keys(schematic)).toEqual([
      "symbolTemplate",
      "components",
      "wires",
      "connections",
      "junctionAppearances",
      "netLabels",
      "layers",
      "notes"
    ]);
    expect(schematic).not.toHaveProperty("junctions");
    expect(schematic).not.toHaveProperty("selection");
    expect(schematic).not.toHaveProperty("viewport");
    const exportedComponent = (schematic.components as Array<Record<string, unknown>>)[0];
    const exportedWire = (schematic.wires as Array<Record<string, unknown>>)[0];
    expect(exportedComponent).not.toHaveProperty("selected");
    expect(exportedComponent.appearance).not.toHaveProperty("hoverColor");
    expect(exportedWire.appearance).not.toHaveProperty("renderedStrokeWidth");
    expect(document.junctions).toEqual([{ x: 999, y: 999 }]);
  });

  it("round trips per-object layer state and omits empty defaults", () => {
    const document = documentFixture();
    document.layerObjectStates = {
      "component-1": { visible: false, z: 3 },
      horizontal: { z: 2 },
      "note-1": { visible: true }
    };

    const serialized = serializeSchematicDocumentFile(document);
    const restored = parseSchematicDocumentFile(serialized);
    expect(restored.layerObjectStates).toEqual({
      "component-1": { visible: false, z: 3 },
      horizontal: { z: 2 },
      "horizontal-segment-1": { z: 2 }
    });
    expect(serialized).toContain('"layerObjectStates": {"component-1":');
    expect(serializeSchematicDocumentFile({ ...document, layerObjectStates: {} }))
      .not.toContain('"layerObjectStates"');
  });

  it("round trips assigned wire, label and note layers in the current document format", () => {
    const document = documentFixture();
    document.layers = [
      { id: "layer-1", name: "Base", visible: true, locked: false },
      { id: "layer-2", name: "Overlay", visible: true, locked: false }
    ];
    document.wires.forEach(wire => { wire.layerId = "layer-2"; });
    document.netLabels.forEach(label => { label.layerId = "layer-2"; });
    document.notes.forEach(note => { note.layerId = "layer-2"; });
    const file = serializeSchematicDocumentFile(document);
    const restored = parseSchematicDocumentFile(file);
    for (const objects of [restored.wires, restored.netLabels, restored.notes]) {
      expect(objects.length).toBeGreaterThan(0);
      expect(objects.every(object => object.layerId === "layer-2")).toBe(true);
    }
    expect(restored.wires.some(wire => wire.id === "horizontal-segment-1")).toBe(true);
    const normalized = serializeSchematicDocumentFile(restored);
    expect(serializeSchematicDocumentFile(parseSchematicDocumentFile(normalized))).toBe(normalized);
  });

  it("rejects malformed per-object layer state", () => {
    const invalidStates: unknown[] = [
      [],
      { "component-1": null },
      { "component-1": { visible: "false" } },
      { "component-1": { z: "3" } },
      { "component-1": { locked: true } },
      { "": { visible: false } },
      { constructor: { visible: false } }
    ];
    invalidStates.forEach((layerObjectStates) => {
      const file = emptyFile();
      file.schematic.layerObjectStates = layerObjectStates as never;
      expectFileError(() => parseValue(file), "invalid-schema");
    });
  });

  it("keeps empty collections inline and long note strings lossless", () => {
    const emptySerialized = serializeSchematicDocumentFile(emptyFile().schematic);
    const document = documentFixture();
    const longText = `gain "\u589e\u76ca" C:\\models\n${"long-note-".repeat(24)}`;
    document.notes[0].text = longText;

    const serialized = serializeSchematicDocumentFile(document);
    const restored = parseSchematicDocumentFile(serialized);

    expect(emptySerialized).toContain('"components": []');
    expect(emptySerialized).toContain('"wires": []');
    expect(emptySerialized).toContain('"notes": []');
    expect(serialized.trimEnd().split("\n").find((line) => line.includes('"text":'))?.length).toBeGreaterThan(120);
    expect((JSON.parse(serialized) as SchematicFile).schematic.notes[0].text).toBe(longText);
    expect(restored.notes[0].text).toBe(longText);
  });

  it("keeps component variants and values on semantic lines", () => {
    const document = documentFixture();
    const values = {
      main: "parameter_value_".repeat(12),
      labelVisible: "false"
    };
    document.components[0].variantId = "variable";
    document.components[0].values = values;

    const serialized = serializeSchematicDocumentFile(document);
    const valueLines = serialized.trimEnd().split("\n").filter((line) => line.includes('"values":'));

    expect(serialized).toContain('        "type": "resistor", "ref": "R1", "x": 120, "y": 0, "rotation": 0, "mirrored": false, "variantId": "variable",');
    expect(serialized).toContain('"temporarilyDeleted": true, "id": "component-1",\n        "values":');
    expect(valueLines).toHaveLength(1);
    expect(valueLines[0].length).toBeGreaterThan(120);
    expect((JSON.parse(serialized) as SchematicFile).schematic.components[0].values).toEqual(values);
  });

  it("round trips DFF settings and rejects invalid or misplaced DFF enums", () => {
    const document = documentFixture();
    const values = {
      [DFF_VALUE_KEYS.clockEdge]: "falling",
      [DFF_VALUE_KEYS.setMode]: "synchronous",
      [DFF_VALUE_KEYS.setActiveLevel]: "low",
      [DFF_VALUE_KEYS.resetMode]: "asynchronous",
      [DFF_VALUE_KEYS.resetActiveLevel]: "low"
    };
    document.components.push(component("dff-1", "X1", {
      type: "dff",
      x: 320,
      values
    }));
    authorFixture(document);

    const restored = parseSchematicDocumentFile(serializeSchematicDocumentFile(document));
    expect(restored.components.find((candidate) => candidate.id === "dff-1")?.values)
      .toEqual(values);

    const invalidValues = [
      [DFF_VALUE_KEYS.clockEdge, "both"],
      [DFF_VALUE_KEYS.setMode, "latched"],
      [DFF_VALUE_KEYS.setActiveLevel, "edge"],
      [DFF_VALUE_KEYS.resetMode, "latched"],
      [DFF_VALUE_KEYS.resetActiveLevel, "edge"]
    ] as const;
    invalidValues.forEach(([key, value]) => {
      const file = emptyFile();
      file.schematic.components.push(component("bad-dff", "X1", {
        type: "dff",
        values: { [key]: value }
      }));
      expectFileError(() => parseValue(file), "invalid-schema");
    });

    const misplaced = emptyFile();
    misplaced.schematic.components.push(component("bad-resistor", "R1", {
      values: { [DFF_VALUE_KEYS.clockEdge]: "falling" }
    }));
    expectFileError(() => parseValue(misplaced), "invalid-schema");
  });

  it("accepts only latest-format optional clocks without migrating legacy values or variants", () => {
    const latest = emptyFile();
    latest.schematic.components.push(component("adc-latest", "ADC1", {
      type: "adc",
      variantId: "quantizer",
      values: { [COMPONENT_CLOCK_VALUE_KEY]: "falling" }
    }));
    expect(parseValue(authoredFile(latest)).components[0]).toMatchObject({
      variantId: "quantizer",
      values: { [COMPONENT_CLOCK_VALUE_KEY]: "falling" }
    });

    ["noClock", "clocked"].forEach((clock) => {
      const legacyValue = emptyFile();
      legacyValue.schematic.components.push(component("adc-legacy", "ADC1", {
        type: "adc",
        variantId: "plain",
        values: { [COMPONENT_CLOCK_VALUE_KEY]: clock }
      }));
      expectFileError(() => parseValue(legacyValue), "invalid-schema");
    });

    ["plain-clocked", "quantizer-clocked"].forEach((variantId) => {
      const legacyVariant = emptyFile();
      legacyVariant.schematic.components.push(component("adc-legacy", "ADC1", {
        type: "adc",
        variantId,
        values: {}
      }));
      expectFileError(() => parseValue(legacyVariant), "invalid-schema");
    });

    const misplaced = emptyFile();
    misplaced.schematic.components.push(component("resistor-clock", "R1", {
      values: { [COMPONENT_CLOCK_VALUE_KEY]: "rising" }
    }));
    expectFileError(() => parseValue(misplaced), "invalid-schema");
  });

  it("keeps Note metadata on one unlimited line with the ID last", () => {
    const withoutHeight = documentFixture();
    delete withoutHeight.notes[0].height;

    const compacted = serializeSchematicDocumentFile(withoutHeight);

    expect(compacted).toContain(
      '      {"x": 20, "y": 120, "width": 180, "format": "markdown", "backgroundColor": null, "fontSizePx": 16, "id": "note-1",\n'
      + '        "text": "**gain**"}'
    );

    const overlong = documentFixture();
    overlong.notes[0] = {
      ...overlong.notes[0],
      x: Number.MAX_VALUE,
      y: Number.MAX_VALUE,
      width: Number.MAX_VALUE,
      height: Number.MAX_VALUE
    };
    const serialized = serializeSchematicDocumentFile(overlong);
    const max = String(Number.MAX_VALUE);

    const metadataLine = serialized.trimEnd().split("\n").find((line) =>
      line.startsWith(`      {"x": ${max}, "y": ${max},`)
    );
    expect(metadataLine?.length).toBeGreaterThan(120);
    expect(metadataLine).toContain('"id": "note-1",');
    expect((JSON.parse(serialized) as SchematicFile).schematic.notes[0]).toMatchObject({
      x: Number.MAX_VALUE,
      y: Number.MAX_VALUE,
      width: Number.MAX_VALUE,
      height: Number.MAX_VALUE
    });
    expect(() => parseSchematicDocumentFile(serialized)).not.toThrow();
  });

  it("round trips durable state, normalizes it, and recomputes derived junctions", () => {
    const restored = parseSchematicDocumentFile(serializeSchematicDocumentFile(documentFixture()));

    expect(restored.components[0]).toMatchObject({
      id: "component-1",
      ref: "R1",
      values: { main: "10k", labelVisible: "false" },
      appearance: { color: "#0072b2" },
      temporarilyDeleted: true
    });
    expect(restored.wires.find((wire) => wire.id === "horizontal")).toMatchObject({
      appearance: {
        variant: "signal",
        color: "#d55e00",
        lineWidth: "2a",
        startMarker: "arrow",
        digitalSlash: true,
        digitalLabel: "8"
      }
    });
    expect(restored.wires.find((wire) => wire.id === "temporarily-deleted-wire")).toMatchObject({
      appearance: { variant: "wide", color: "#009e73" },
      temporarilyDeleted: true
    });
    expect(restored.junctions).toEqual([{ x: 40, y: 0 }]);
    expect(restored.junctionAppearances).toEqual([{
      point: { x: 40, y: 0 },
      color: "#cc79a7"
    }]);
    expect(restored.netLabels).toEqual([{
      id: "net-label-1",
      name: "OUT",
      attachment: {
        wireId: "horizontal",
        point: { x: 20, y: 0 }
      }
    }]);
    expect(restored.notes).toEqual([{
      id: "note-1",
      x: 20,
      y: 120,
      width: 180,
      height: 60,
      format: "markdown",
      text: "**gain**",
      backgroundColor: null,
      fontSizePx: 16
    }]);
  });

  it("normalizes free-angle wires while preserving a separate diagonal wire", () => {
    const file = emptyFile();
    file.schematic.wires.push(
      {
        id: "free-angle",
        routeMode: "freeAngle",
        points: [{ x: 1, y: 1 }, { x: 39, y: 39 }],
        appearance: { variant: "signal", color: "#0072B2" }
      },
      {
        id: "diagonal",
        routeMode: "freeAngle",
        points: [{ x: 0, y: 80 }, { x: 40, y: 120 }],
        appearance: { variant: "wide" }
      }
    );
    file.schematic.netLabels.push({
      id: "diagonal-label",
      name: "BUS",
      attachment: {
        wireId: "free-angle",
        point: { x: 20, y: 20 }
      }
    });

    const restored = parseValue(authoredFile(file));

    expect(restored.wires).toEqual([
      {
        id: "free-angle",
        routeMode: "freeAngle",
        points: [{ x: 0, y: 0 }, { x: 40, y: 40 }],
        appearance: { variant: "signal", color: "#0072b2" }
      },
      {
        id: "diagonal",
        routeMode: "freeAngle",
        points: [{ x: 0, y: 80 }, { x: 40, y: 120 }],
        appearance: { variant: "wide" }
      }
    ]);
    expect(restored.netLabels[0].attachment).toEqual({
      wireId: "free-angle",
      point: { x: 20, y: 20 }
    });
  });

  it("preserves mixed route-mode order while normalizing supported topology", () => {
    const file = emptyFile();
    file.schematic.wires.push(
      {
        id: "free-first",
        routeMode: "freeAngle",
        points: [{ x: 1, y: 1 }, { x: 39, y: 39 }]
      },
      {
        id: "horizontal",
        routeMode: "orthogonal",
        points: [{ x: 0, y: 80 }, { x: 80, y: 80 }]
      },
      {
        id: "diagonal-middle",
        routeMode: "freeAngle",
        points: [{ x: 0, y: 160 }, { x: 40, y: 200 }]
      },
      {
        id: "branch",
        routeMode: "orthogonal",
        points: [{ x: 40, y: 80 }, { x: 40, y: 120 }]
      }
    );

    const restored = parseValue(authoredFile(file));

    expect(restored.wires.map((wire) => wire.id)).toEqual([
      "free-first",
      "horizontal",
      "horizontal-segment-1",
      "diagonal-middle",
      "branch"
    ]);
    expect(restored.wires.map((wire) => wire.points)).toEqual([
      [{ x: 0, y: 0 }, { x: 40, y: 40 }],
      [{ x: 0, y: 80 }, { x: 40, y: 80 }],
      [{ x: 40, y: 80 }, { x: 80, y: 80 }],
      [{ x: 0, y: 160 }, { x: 40, y: 200 }],
      [{ x: 40, y: 80 }, { x: 40, y: 120 }]
    ]);
    expect(restored.junctions).toEqual([{ x: 40, y: 80 }]);
  });

  it("creates an isolated current-format snapshot instead of retaining document arrays", () => {
    const document = documentFixture();
    const file = createSchematicFile(document);

    document.components[0].ref = "R-mutated";
    document.wires[0].points[0].x = 500;
    document.notes[0].text = "mutated";

    expect(file.schematic.components[0].ref).toBe("R1");
    expect(file.schematic.wires[0].points[0]).toEqual({ x: 0, y: 0 });
    expect(file.schematic.notes[0].text).toBe("**gain**");
  });

  it("serializes a CopySource-shaped durable collection without derived junctions", () => {
    const source: CopySource = fixtureDocument({
      components: [component("copied-component", "R7")],
      wires: [{
        id: "copied-wire",
        routeMode: "orthogonal",
        points: [{ x: 0, y: 40 }, { x: 80, y: 40 }]
      }],

      junctionAppearances: [],
      netLabels: [{
        id: "copied-label",
        name: "COPY",
        attachment: { wireId: "copied-wire", point: { x: 40, y: 40 } }
      }],
      notes: []
    });

    const serialized = serializeSchematicDocumentFile(source);
    const restored = parseSchematicDocumentFile(serialized);

    expect(JSON.parse(serialized).schematic).toEqual(createSchematicFile(source).schematic);
    expect(restored.components.map((candidate) => candidate.id)).toEqual(["copied-component"]);
    expect(restored.wires.map((candidate) => candidate.id)).toEqual(["copied-wire"]);
    expect(restored.netLabels).toEqual(source.netLabels);
  });

  it("round trips floating net labels with an empty wire ID", () => {
    const file = emptyFile();
    file.schematic.netLabels.push({
      id: "floating-label",
      name: "FLOAT",
      attachment: { wireId: "", point: { x: 41, y: 19 } }
    });

    const restored = parseSchematicDocumentFile(
      serializeSchematicDocumentFile(file.schematic)
    );

    expect(restored.netLabels).toEqual([{
      id: "floating-label",
      name: "FLOAT",
      attachment: { wireId: "", point: { x: 40, y: 20 } }
    }]);
  });

  it("serializes and parses duplicate component refs without changing them", () => {
    const document = documentFixture();
    document.components.push(component("component-2", "R1", { x: 200 }));
    authorFixture(document);

    const serialized = serializeSchematicDocumentFile(document);
    const envelope = JSON.parse(serialized) as SchematicFile;
    const restored = parseSchematicDocumentFile(serialized);

    expect(envelope.schematic.components.map((candidate) => candidate.ref)).toEqual(["R1", "R1"]);
    expect(restored.components.map((candidate) => candidate.ref)).toEqual(["R1", "R1"]);
    expect(restored.components.map((candidate) => candidate.id)).toEqual(["component-1", "component-2"]);
  });

  it("rejects raw documents, malformed envelopes, and version fields", () => {
    expectFileError(
      () => parseValue(fixtureDocument({ components: [], wires: [],  junctionAppearances: [], netLabels: [], notes: [] })),
      "invalid-schema"
    );
    expectFileError(
      () => parseValue({ ...emptyFile(), format: "adc-helper/workspace" }),
      "invalid-format"
    );
    for (const version of [1, 2, 3]) {
      expectFileError(() => parseValue({ ...emptyFile(), version }), "invalid-schema");
    }
    const missingConnections = structuredClone(emptyFile()) as {
      schematic: Partial<SchematicFile["schematic"]>;
    };
    delete missingConnections.schematic.connections;
    expectFileError(() => parseValue(missingConnections), "invalid-schema");
    const obsoleteFields = emptyFile();
    Object.assign(obsoleteFields.schematic, { junctionIntents: [] });
    expectFileError(() => parseValue(obsoleteFields), "invalid-schema");
    const missingNotes = emptyFile() as unknown as {
      schematic: Partial<SchematicFile["schematic"]>;
    };
    delete missingNotes.schematic.notes;
    expectFileError(() => parseValue(missingNotes), "invalid-schema");
  });

  it.each([
    ["unknown component type", (file: SchematicFile) => {
      file.schematic.components.push(component("bad-type") as ComponentInstance);
      (file.schematic.components[0] as { type: string }).type = "transformer";
    }],
    ["unknown component variant", (file: SchematicFile) => {
      file.schematic.components.push(component("bad-variant", "S1", {
        type: "switch",
        variantId: "half-open"
      }));
    }],
    ["invalid rotation", (file: SchematicFile) => {
      file.schematic.components.push(component("bad-rotation", "R1", { rotation: 45 }));
    }],
    ["invalid stored enum", (file: SchematicFile) => {
      file.schematic.components.push(component("bad-setting", "R1", {
        values: { gainPolarity: "sideways" }
      }));
    }],
    ["invalid function-block time domain", (file: SchematicFile) => {
      file.schematic.components.push(component("bad-domain", "INT1", {
        type: "integrator",
        variantId: "symbol",
        values: { timeDomain: "sampled" }
      }));
    }],
    ["unknown route mode", (file: SchematicFile) => {
      file.schematic.wires.push({
        id: "wire",
        routeMode: "orthogonal",
        points: [{ x: 0, y: 0 }, { x: 40, y: 0 }]
      });
      (file.schematic.wires[0] as { routeMode: string }).routeMode = "curved";
    }],
    ["unknown wire marker", (file: SchematicFile) => {
      file.schematic.wires.push({
        id: "wire",
        routeMode: "orthogonal",
        points: [{ x: 0, y: 0 }, { x: 40, y: 0 }],
        appearance: { variant: "signal", startMarker: "arrow" }
      });
      (file.schematic.wires[0].appearance as { startMarker: string }).startMarker = "diamond";
    }],
    ["unknown connection field", (file: SchematicFile) => {
      Object.assign(file.schematic.connections, { unexpected: true });
    }],
    ["unknown note format", (file: SchematicFile) => {
      file.schematic.notes.push({
        id: "note",
        x: 0,
        y: 0,
        width: 80,
        format: "plain",
        text: ""
      });
      (file.schematic.notes[0] as { format: string }).format = "html";
    }]
  ])("rejects %s", (_name, mutate) => {
    const file = emptyFile();
    mutate(file);
    expectFileError(() => parseValue(file), "invalid-schema");
  });

  it("rejects non-finite geometry before normalization", () => {
    const file = emptyFile();
    file.schematic.components.push(component());
    const serialized = JSON.stringify(file).replace('"x":120', '"x":1e400');

    expectFileError(() => parseSchematicDocumentFile(serialized), "invalid-schema");
  });

  it("rejects duplicate object IDs", () => {
    const duplicateId = emptyFile();
    duplicateId.schematic.components.push(component("shared-id", "R1"));
    duplicateId.schematic.wires.push({
      id: "shared-id",
      routeMode: "orthogonal",
      points: [{ x: 0, y: 0 }, { x: 40, y: 0 }]
    });
    expectFileError(() => parseValue(duplicateId), "invalid-schema");
  });

  it("rejects object ID collisions introduced by normalized wire splitting", () => {
    const file = emptyFile();
    file.schematic.components.push(component("wire-segment-1"));
    file.schematic.wires.push({
      id: "wire",
      routeMode: "orthogonal",
      points: [{ x: 0, y: 0 }, { x: 80, y: 0 }]
    });
    file.schematic.wires.push({ id: "branch", routeMode: "orthogonal", points: [{ x: 40, y: 0 }, { x: 40, y: 40 }] });
    authorFixture(Object.assign(file.schematic, { junctions: [] }));

    expectFileError(() => parseValue(file), "invalid-schema");
    expectFileError(
      () => serializeSchematicDocumentFile({ ...file.schematic, junctions: [] }),
      "invalid-schema"
    );
  });

  it("does not treat ID-less derived junctions or junction appearances as object ID collisions", () => {
    const file = emptyFile();
    file.schematic.wires.push(
      {
        id: "horizontal",
        routeMode: "orthogonal",
        points: [{ x: 0, y: 0 }, { x: 80, y: 0 }]
      },
      {
        id: "branch-1",
        routeMode: "orthogonal",
        points: [{ x: 20, y: 0 }, { x: 20, y: 40 }]
      },
      {
        id: "branch-2",
        routeMode: "orthogonal",
        points: [{ x: 60, y: 0 }, { x: 60, y: 40 }]
      }
    );
    file.schematic.junctionAppearances.push(
      { point: { x: 20, y: 0 }, color: "#0072B2" },
      { point: { x: 60, y: 0 }, color: "#D55E00" }
    );

    const restored = parseValue(authoredFile(file));

    expect(restored.junctions).toEqual([{ x: 20, y: 0 }, { x: 60, y: 0 }]);
    expect(restored.junctionAppearances).toHaveLength(2);
  });

  it("rejects missing wires and off-wire net label attachments", () => {
    const missing = emptyFile();
    missing.schematic.netLabels.push({
      id: "label",
      name: "OUT",
      attachment: { wireId: "missing", point: { x: 20, y: 0 } }
    });
    expectFileError(() => parseValue(missing), "invalid-schema");
    expectFileError(
      () => serializeSchematicDocumentFile(missing.schematic),
      "invalid-schema"
    );

    const detached = emptyFile();
    detached.schematic.wires.push({
      id: "wire",
      routeMode: "orthogonal",
      points: [{ x: 0, y: 0 }, { x: 80, y: 0 }]
    });
    detached.schematic.netLabels.push({
      id: "label",
      name: "OUT",
      attachment: { wireId: "wire", point: { x: 20, y: 40 } }
    });
    expectFileError(() => parseValue(detached), "invalid-schema");
    expectFileError(
      () => serializeSchematicDocumentFile(detached.schematic),
      "invalid-schema"
    );
  });

  it("rejects far collinear label points on short wires at large coordinate offsets", () => {
    const file = emptyFile();
    file.schematic.wires.push({
      id: "offset-wire",
      routeMode: "orthogonal",
      points: [{ x: 1e12, y: 0 }, { x: 1e12 + 20, y: 0 }]
    });
    file.schematic.netLabels.push({
      id: "far-label",
      name: "OUT",
      attachment: {
        wireId: "offset-wire",
        point: { x: 1e12 + 100_000, y: 0 }
      }
    });

    expectFileError(() => parseValue(file), "invalid-schema");
  });

  it("guards the 20 MiB limit before reading and while parsing", async () => {
    const text = vi.fn(async () => JSON.stringify(emptyFile()));
    const file = {
      name: "large.sch.json",
      size: MAX_SCHEMATIC_FILE_BYTES + 1,
      text
    };

    await expect(readSchematicDocumentFile(file)).rejects.toMatchObject({
      code: "file-too-large"
    });
    expect(text).not.toHaveBeenCalled();
    expectFileError(
      () => parseSchematicDocumentFile(" ".repeat(MAX_SCHEMATIC_FILE_BYTES + 1)),
      "file-too-large"
    );

    const oversized = emptyFile().schematic;
    oversized.notes.push({
      id: "oversized-note",
      x: 0,
      y: 0,
      width: 180,
      format: "plain",
      text: "x".repeat(MAX_SCHEMATIC_FILE_BYTES)
    });
    expectFileError(() => serializeSchematicDocumentFile(oversized), "file-too-large");
  });

  it("derives import titles and sanitizes export filenames", async () => {
    expect(schematicDocumentTitleFromFilename("Front End.SCH.JSON")).toBe("Front End");
    expect(schematicDocumentTitleFromFilename("C:\\imports\\adc.sch.json")).toBe("adc");
    expect(schematicDocumentTitleFromFilename(".sch.json")).toBe("Imported schematic");
    expect(schematicDocumentFilename("  ADC/Front:*End.sch.json  ")).toBe("ADC-Front-End.sch.json");
    expect(schematicDocumentFilename("CON")).toBe("_CON.sch.json");
    expect(schematicDocumentFilename(" ... ")).toBe("schematic.sch.json");

    const source = `${JSON.stringify(emptyFile(), null, 2)}\n`;
    await expect(readSchematicDocumentFile({
      name: "Imported Circuit.sCh.JsOn",
      size: new TextEncoder().encode(source).byteLength,
      text: async () => source
    })).resolves.toMatchObject({
      title: "Imported Circuit",
      document: {
        components: [],
        wires: [],
        junctions: []
      }
    });
  });
});

describe("Blob download helper", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("clicks a hidden download link and revokes the object URL after the delay", () => {
    vi.useFakeTimers();
    const click = vi.fn();
    const remove = vi.fn();
    const appendChild = vi.fn();
    const createObjectURL = vi.fn(() => "blob:schematic");
    const revokeObjectURL = vi.fn();
    const link = {
      href: "",
      download: "",
      style: { display: "" },
      click,
      remove
    };
    vi.stubGlobal("document", {
      defaultView: { setTimeout, URL: { createObjectURL, revokeObjectURL } },
      createElement: vi.fn(() => link),
      body: { appendChild }
    });
    const blob = new Blob(["{}"], { type: "application/json" });

    downloadBlob(blob, "adc.sch.json");

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(link).toMatchObject({
      href: "blob:schematic",
      download: "adc.sch.json",
      hidden: true
    });
    expect(appendChild).toHaveBeenCalledWith(link);
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:schematic");
  });

  it("removes the link and revokes the object URL when clicking throws", () => {
    vi.useFakeTimers();
    const click = vi.fn(() => {
      throw new Error("download blocked");
    });
    const remove = vi.fn();
    const createObjectURL = vi.fn(() => "blob:failed-download");
    const revokeObjectURL = vi.fn();
    const link = {
      href: "",
      download: "",
      style: { display: "" },
      click,
      remove
    };
    vi.stubGlobal("document", {
      defaultView: { setTimeout, URL: { createObjectURL, revokeObjectURL } },
      createElement: vi.fn(() => link),
      body: { appendChild: vi.fn() }
    });

    expect(() => downloadBlob(new Blob(["{}"]), "adc.sch.json")).toThrow("download blocked");
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:failed-download");
  });
});
