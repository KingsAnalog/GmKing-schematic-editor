import { describe, expect, it } from "vitest";
import {
  applyLayerObjectMove,
  planLayerObjectMove
} from "../../../src/schematic/layerObjectCommands";
import { buildSchematicLayerObjectTree } from "../../../src/schematic/layerObjectTreeModel";
import {
  contentFromDocument,
  createEmptySchematicDocument,
  documentFromContent
} from "../../../src/schematic/document/documentModel";
import { fixtureComponent, fixtureNote, fixtureWire } from "../support/fixtures";

function objectIds(document: ReturnType<typeof createEmptySchematicDocument>) {
  return buildSchematicLayerObjectTree(document)[0]?.objects.map(object => object.id);
}

describe("layer object commands", () => {
  it("swaps adjacent objects and writes explicit integer stacking state", () => {
    const document = createEmptySchematicDocument();
    document.components.push(
      { ...fixtureComponent("rectangle", "X1", 0, 0), id: "bottom" },
      { ...fixtureComponent("triangle", "X2", 40, 0), id: "middle" }
    );
    document.notes.push(fixtureNote("top"));
    expect(objectIds(document)).toEqual(["top", "middle", "bottom"]);

    const plan = planLayerObjectMove(document, "layer-1", "middle", "up");
    expect(plan).toEqual({ middle: 3, top: 2, bottom: 1 });
    const next = documentFromContent((() => {
      const content = contentFromDocument(document);
      applyLayerObjectMove(content, plan!);
      return content;
    })());

    expect(objectIds(next)).toEqual(["middle", "top", "bottom"]);
    expect(next.layerObjectStates).toEqual({ middle: { z: 3 }, top: { z: 2 }, bottom: { z: 1 } });
  });

  it("keeps hidden objects in ordering and supports downward movement", () => {
    const document = createEmptySchematicDocument();
    document.wires.push(fixtureWire("wire", [{ x: 0, y: 0 }, { x: 40, y: 0 }]));
    document.notes.push(fixtureNote("note"));
    document.layerObjectStates = { note: { visible: false } };

    const plan = planLayerObjectMove(document, "layer-1", "note", "down");
    const content = contentFromDocument(document);
    applyLayerObjectMove(content, plan!);
    const next = documentFromContent(content);

    expect(objectIds(next)).toEqual(["wire", "note"]);
    expect(next.layerObjectStates).toEqual({ note: { visible: false, z: 1 }, wire: { z: 2 } });
    expect(buildSchematicLayerObjectTree(next)[0]?.objects[1]?.visible).toBe(false);
  });

  it("returns no plan at boundaries, for pins, or across layers", () => {
    const document = createEmptySchematicDocument();
    document.components.push({ ...fixtureComponent("resistor", "R1", 0, 0), id: "resistor" });
    document.wires.push(fixtureWire("wire", [{ x: 0, y: 0 }, { x: 40, y: 0 }]));

    expect(planLayerObjectMove(document, "layer-1", "wire", "down")).toBeNull();
    expect(planLayerObjectMove(document, "layer-1", "pin:resistor:p", "up")).toBeNull();
    expect(planLayerObjectMove(document, "missing", "wire", "up")).toBeNull();
  });
});
