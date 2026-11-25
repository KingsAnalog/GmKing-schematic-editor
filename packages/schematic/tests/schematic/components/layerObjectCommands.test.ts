import { describe, expect, it } from "vitest";
import {
  applyLayerAssignment,
  applyLayerObjectMove,
  planLayerAssignment,
  planLayerObjectMove
} from "../../../src/schematic/layerObjectCommands";
import { buildSchematicLayerObjectTree } from "../../../src/schematic/layerObjectTreeModel";
import {
  contentFromDocument,
  createEmptySchematicDocument,
  documentFromContent
} from "../../../src/schematic/document/documentModel";
import { buildConnectivity } from "../../../src/schematic/connectivity";
import { applyNormalizedDocumentWires } from "../../../src/schematic/document/documentWires";
import { fixtureDocument } from "../support/fixtureDocument";
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

  it("moves different object types to the top of one layer in their original stack order", () => {
    const document = createEmptySchematicDocument();
    document.layers!.push(
      { id: "layer-2", name: "Overlay", visible: true, locked: false },
      { id: "layer-3", name: "Target", visible: false, locked: false }
    );
    document.components.push({ ...fixtureComponent("rectangle", "X1", 0, 0), id: "shape" });
    document.wires.push(fixtureWire("wire", [{ x: 0, y: 0 }, { x: 40, y: 0 }]));
    document.netLabels.push({ id: "label", name: "OUT", attachment: { wireId: "wire", point: { x: 20, y: 0 } } });
    document.notes.push({ ...fixtureNote("note"), layerId: "layer-2" }, { ...fixtureNote("existing"), layerId: "layer-3" });
    const chosen = new Set(["wire", "shape", "note", "label"]);
    const plan = planLayerAssignment(document, chosen, "layer-3")!;
    expect([...plan.ids]).toEqual(["note", "label", "shape", "wire"]);
    applyLayerAssignment(document, plan);
    expect(objectIds(document)).toEqual(["note", "label", "shape", "wire", "existing"]);
    expect(document.components[0].values["layer:id"]).toBe("layer-3");
    expect([document.notes[0], document.netLabels[0], document.wires[0]].map(object => object.layerId))
      .toEqual(["layer-3", "layer-3", "layer-3"]);
    expect(buildSchematicLayerObjectTree(document)[0].objects.every(object => !object.displayed)).toBe(true);
  });

  it("rejects layer changes from and into locked layers", () => {
    const document = createEmptySchematicDocument();
    document.layers!.push({ id: "locked", name: "Locked", visible: true, locked: true });
    document.notes.push(fixtureNote("base"), { ...fixtureNote("locked-note"), layerId: "locked" });
    expect(planLayerAssignment(document, new Set(["base"]), "locked")).toBeNull();
    expect(planLayerAssignment(document, new Set(["base", "locked-note"]), "layer-1")).toBeNull();
    expect(planLayerAssignment(document, new Set(["locked-note"]), "layer-1")).toBeNull();
  });

  it("preserves separately styled wire identities after changing layers at a connected boundary", () => {
    const join = { x: 40, y: 0 };
    const document = fixtureDocument({
      layers: [
        { id: "layer-1", name: "Base", visible: true, locked: false },
        { id: "layer-2", name: "Upper", visible: true, locked: false }
      ],
      wires: [
        fixtureWire("wire-a", [{ x: 0, y: 0 }, join]),
        { ...fixtureWire("wire-b", [join, { x: 80, y: 0 }]), layerId: "layer-2" }
      ],
      netLabels: [{ id: "tag", name: "OUT", attachment: { wireId: "wire-a", point: { x: 20, y: 0 } } }]
    });
    const plan = planLayerAssignment(document, new Set(["wire-a"]), "layer-2")!;
    applyLayerAssignment(document, plan);
    applyNormalizedDocumentWires(document);
    expect(document.wires.map(wire => [wire.id, wire.layerId])).toEqual([["wire-a", "layer-2"], ["wire-b", "layer-2"]]);
    expect(document.netLabels[0].attachment.wireId).toBe("wire-a");
    const connectivity = buildConnectivity(document);
    expect(connectivity.rootOfWire("wire-a")).toBe(connectivity.rootOfWire("wire-b"));
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
