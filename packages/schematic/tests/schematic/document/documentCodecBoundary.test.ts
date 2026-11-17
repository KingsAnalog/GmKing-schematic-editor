import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import * as codec from "../../../src/schematic/schematicDocumentCodec";
import type { SchematicContent } from "../../../src/schematic/types";

describe("schematic codec boundary", () => {
  it("round trips durable content through the DOM-free codec entrypoint", () => {
    const content: SchematicContent = fixtureDocument({
      components: [],
      wires: [{
        id: "wire-1",
        routeMode: "orthogonal",
        points: [{ x: 0, y: 0 }, { x: 40, y: 0 }]
      }],

      junctionAppearances: [],
      netLabels: [],
      notes: []
    });
    const before = structuredClone(content);

    const restored = codec.parseSchematicDocumentFile(
      codec.serializeSchematicDocumentFile(content)
    );

    expect(content).toEqual(before);
    expect(restored.wires).toEqual(content.wires);
    expect(restored.junctions).toEqual([]);
  });

  it("does not expose browser file, Blob, download, or clipboard adapters", () => {
    expect(codec).not.toHaveProperty("readSchematicDocumentFile");
    expect(codec).not.toHaveProperty("downloadSchematicDocumentFile");
    expect(codec).not.toHaveProperty("readSchematicDocumentFromClipboard");
  });

  it("round trips transistor circles and rejects the setting on non-transistors", () => {
    const content: SchematicContent = fixtureDocument({
      components: [{
        id: "Q1", type: "npn", ref: "Q1", x: 40, y: 40,
        rotation: 0, mirrored: false, values: { transistorCircle: "true" }
      }],
      wires: [],  junctionAppearances: [], netLabels: [], notes: []
    });

    const restored = codec.parseSchematicDocumentFile(codec.serializeSchematicContent(content));
    expect(restored.components[0]).toMatchObject({ type: "npn", values: { transistorCircle: "true" } });

    const invalid = structuredClone(content);
    invalid.components[0].type = "resistor";
    expect(() => codec.parseSchematicDocumentFile(codec.serializeSchematicContent(invalid))).toThrow(
      /setting for an NMOS, PMOS, NPN, or PNP transistor/
    );
  });

  it("round trips Show value and validates it as a boolean setting", () => {
    const content: SchematicContent = fixtureDocument({
      components: [{
        id: "R1", type: "resistor", ref: "R1", x: 40, y: 40,
        rotation: 0, mirrored: false, values: { main: "1k", valueVisible: "true" }
      }],
      wires: [],  junctionAppearances: [], netLabels: [], notes: []
    });
    const restored = codec.parseSchematicDocumentFile(codec.serializeSchematicContent(content));
    expect(restored.components[0].values.valueVisible).toBe("true");

    content.components[0].values.valueVisible = "yes";
    expect(() => codec.parseSchematicDocumentFile(codec.serializeSchematicContent(content)))
      .toThrow(/expected one of true, false/i);
  });
});
