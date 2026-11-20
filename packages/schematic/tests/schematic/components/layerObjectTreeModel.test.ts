import { describe, expect, it } from "vitest";
import { resolveLayerObjects } from "../../../src/schematic/layerObjectStateModel";
import { collectSelectionBoxHits } from "../../../src/schematic/selection/selectionBoxModel";
import { createEmptySchematicDocument } from "../../../src/schematic/document/documentModel";
import {
  buildSchematicLayerObjectTree,
  type SchematicLayerObjectNode
} from "../../../src/schematic/layerObjectTreeModel";
import { fixtureComponent, fixtureNote, fixtureWire } from "../support/fixtures";

function flatten(nodes: SchematicLayerObjectNode[]): SchematicLayerObjectNode[] {
  return nodes.flatMap(node => [node, ...flatten(node.children)]);
}

describe("schematic layer object tree", () => {
  it("lists every canvas object type and nests all component pins", () => {
    const document = createEmptySchematicDocument();
    const resistor = {
      ...fixtureComponent("resistor", "R1", 100, 100),
      id: "resistor-1",
      values: { "layer:id": "layer-2" }
    };
    const rectangle = { ...fixtureComponent("rectangle", "X1", 200, 100), id: "rectangle-1" };
    const triangle = { ...fixtureComponent("triangle", "X2", 300, 100), id: "triangle-1" };
    document.components.push(resistor, rectangle, triangle);
    document.wires.push(fixtureWire("wire-1", [{ x: 0, y: 0 }, { x: 100, y: 0 }]));
    document.junctions.push({ x: 40, y: 0 });
    document.netLabels.push({
      id: "label-1",
      name: "VOUT",
      attachment: { wireId: "wire-1", point: { x: 40, y: 0 } }
    });
    document.notes.push({ ...fixtureNote("note-1"), text: "Output stage" });
    document.inductorCouplings = [{
      id: "coupling-1",
      inductorAId: "L1",
      inductorBId: "L2",
      coefficient: "0.9",
      coefficientAuto: false,
      labelMode: "coefficient",
      showLabel: true,
      showArc: true,
      showCore: true,
      arcFlipped: false
    }];
    document.layers = [
      { id: "layer-1", name: "Base", visible: true, locked: false },
      { id: "layer-2", name: "Devices", visible: true, locked: false }
    ];

    const tree = buildSchematicLayerObjectTree(document);
    expect(tree.map(group => group.layer.id)).toEqual(["layer-2", "layer-1"]);
    expect(tree.map(group => group.objectCount)).toEqual([1, 7]);

    const upperObject = tree[0]!.objects[0]!;
    expect(upperObject).toMatchObject({
      id: "resistor-1",
      targetId: "resistor-1",
      targetType: "cell",
      kind: "component",
      label: "resistor R1"
    });
    expect(upperObject.children.length).toBeGreaterThan(0);
    expect(upperObject.children.every(pin =>
      pin.kind === "pin" && pin.targetId === "resistor-1" && pin.id.startsWith("pin:resistor-1:")
    )).toBe(true);

    const baseNodes = flatten(tree[1]!.objects);
    const allNodes = flatten(tree.flatMap(group => group.objects));
    expect(new Set(allNodes.map(node => node.kind))).toEqual(new Set([
      "component", "shape", "pin", "wire", "junction", "label", "note", "coupling"
    ]));
    expect(baseNodes.find(node => node.kind === "junction")?.id).toBe("junction-40-0");
    expect(baseNodes.find(node => node.kind === "label")?.label).toBe("Label VOUT");
    expect(baseNodes.find(node => node.kind === "note")?.label).toBe("Note Output stage");
    expect(baseNodes.find(node => node.id === "note-1")?.targetType).toBe("note");
  });

  it("uses the default layer for unassigned or invalid assignments and preserves z order", () => {
    const document = createEmptySchematicDocument();
    const lower = { ...fixtureComponent("rectangle", "X1", 0, 0), id: "lower" };
    const higher = {
      ...fixtureComponent("rectangle", "X2", 20, 0),
      id: "higher",
      values: { "layer:z": "3" }
    };
    const stale = {
      ...fixtureComponent("resistor", "R1", 40, 0),
      id: "stale",
      values: { "layer:id": "deleted-layer" },
      temporarilyDeleted: true
    };
    document.components.push(lower, higher, stale);

    const [group] = buildSchematicLayerObjectTree(document);
    expect(group?.layer.id).toBe("layer-1");
    expect(group?.objectCount).toBe(3);
    expect(group?.objects.slice(0, 2).map(node => node.id)).toEqual(["higher", "stale"]);
    expect(group?.objects.find(node => node.id === "stale")?.temporarilyDeleted).toBe(true);
  });

  it("projects independent visibility and new z states across object types", () => {
    const document = createEmptySchematicDocument();
    document.components.push({
      ...fixtureComponent("rectangle", "X1", 0, 0),
      id: "shape",
      values: { "layer:z": "10" }
    });
    document.wires.push(fixtureWire("wire", [{ x: 0, y: 0 }, { x: 40, y: 0 }]));
    document.notes.push(fixtureNote("note"));
    document.layerObjectStates = {
      shape: { z: 1 },
      wire: { z: 3 },
      note: { visible: false, z: 2 }
    };

    const [group] = buildSchematicLayerObjectTree(document);
    expect(group?.objects.map(object => object.id)).toEqual(["wire", "note", "shape"]);
    expect(group?.objects.find(object => object.id === "note")).toMatchObject({
      visible: false,
      visibilityEditable: true,
      reorderable: true
    });
  });

  it("only exposes pin visibility controls supported by the component", () => {
    const document = createEmptySchematicDocument();
    document.components.push({
      ...fixtureComponent("adc", "ADC1", 0, 0),
      id: "adc",
      values: { "pinVisible:out": "false" }
    });

    const component = buildSchematicLayerObjectTree(document)[0]?.objects[0];
    const input = component?.children.find(pin => pin.id === "pin:adc:in");
    const output = component?.children.find(pin => pin.id === "pin:adc:out");
    expect(input).toMatchObject({ visible: true, visibilityEditable: false, reorderable: false });
    expect(output).toMatchObject({ visible: false, visibilityEditable: true, reorderable: false });
  });

  it("keeps implicit assignments on the default layer when layers are reordered", () => {
    const document = createEmptySchematicDocument();
    document.layers!.unshift({ id: "layer-2", name: "Overlay", visible: true, locked: true });
    document.notes.push(fixtureNote("base-note"), { ...fixtureNote("overlay-note"), layerId: "layer-2" });
    document.wires.push({ ...fixtureWire("overlay-wire", [{ x: 0, y: 0 }, { x: 100, y: 0 }]), layerId: "layer-2" });
    document.netLabels.push({
      id: "base-label", name: "OUT", layerId: "missing",
      attachment: { wireId: "overlay-wire", point: { x: 0, y: 0 } }
    });
    const projection = resolveLayerObjects(document);
    expect(projection.layerOf("base-note").id).toBe("layer-1");
    expect(projection.layerOf("base-label").id).toBe("layer-1");
    expect(projection.layerOf("overlay-wire").id).toBe("layer-2");
    expect(projection.displayed("overlay-wire")).toBe(true);
    expect(projection.selectable("overlay-wire")).toBe(false);
    const tree = buildSchematicLayerObjectTree(document, projection);
    expect(tree[0].objects.map(object => object.id)).toEqual(["base-note", "base-label"]);
    expect(tree[1].objects.map(object => object.id)).toEqual(["overlay-note", "overlay-wire"]);
    const hits = collectSelectionBoxHits(document, { x: -1000, y: -1000 }, { x: 1000, y: 1000 });
    expect(hits.ids).toEqual(["base-label"]);
    expect(hits.noteIds).toEqual(["base-note"]);
  });

  it("returns an empty tree row for a new document", () => {
    const tree = buildSchematicLayerObjectTree(createEmptySchematicDocument());
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ objectCount: 0, objects: [] });
  });
});
