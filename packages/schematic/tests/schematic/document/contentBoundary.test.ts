import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import {
  contentFromDocument,
  documentFromContent
} from "../../../src/schematic/document/documentModel";
import type { SchematicContent, SchematicDocument } from "../../../src/schematic/types";

describe("schematic durable content boundary", () => {
  it("converts runtime documents without persisting or aliasing derived junctions", () => {
    const document: SchematicDocument = fixtureDocument({
      components: [],
      wires: [{
        id: "through",
        routeMode: "orthogonal",
        points: [{ x: 0, y: 0 }, { x: 80, y: 0 }]
      }, {
        id: "branch",
        routeMode: "orthogonal",
        points: [{ x: 40, y: 0 }, { x: 40, y: 40 }]
      }],
      junctions: [{ x: 999, y: 999 }],

      junctionAppearances: [],
      netLabels: [],
      notes: []
    });

    const content = contentFromDocument(document);
    const restored = documentFromContent(content);

    expect(content).not.toHaveProperty("junctions");
    expect(restored.junctions).toEqual([{ x: 40, y: 0 }]);
    restored.wires[0].points[0].x = 200;
    expect(content.wires[0].points[0].x).toBe(0);
    expect(document.wires[0].points[0].x).toBe(0);
  });

  it("accepts durable content without the derived junction field", () => {
    const content: SchematicContent = fixtureDocument({
      components: [],
      wires: [],

      junctionAppearances: [],
      netLabels: [],
      notes: []
    });

    expect(documentFromContent(content)).toEqual({ ...content, junctions: [] });
  });
});
