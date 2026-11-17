// @vitest-environment jsdom
import { fixtureDocument, authorFixture } from "../support/fixtureDocument";
import { afterEach, describe, expect, it } from "vitest";
import { getComponentVariants, PALETTE_ORDER, resolveComponentDef } from "../../../src/schematic/catalog";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { contentFromDocument, createEmptySchematicDocument } from "../../../src/schematic/document/documentModel";
import { createSchematicContentHistoryAdapter } from "../../../src/schematic/document/contentHistoryAdapter";
import { componentPinPoint } from "../../../src/schematic/netlist";
import { executeSchematicPropertyBatchCommand } from "../../../src/schematic/propertyBatchCommands";
import { buildSchematicPropertyPanelInput } from "../../../src/schematic/propertyPanelProjection";
import { SchematicPropertyPanelController } from "../../../src/schematic/propertyPanelController";
import { renderSchematicEditorSidebarProjection } from "../../../src/schematic/schematicEditorUiProjection";
import { parseSchematicContent, serializeSchematicContent } from "../../../src/schematic/schematicDocumentCodec";
import { renderSchematicSvgScene } from "../../../src/schematic/svgRenderer";
import { copySourceFromDocument } from "../../../src/schematic/copyModel";
import { fixtureComponent, fixtureWire } from "../support/fixtures";

afterEach(() => document.body.replaceChildren());

function fixture(count = 2) {
  const doc = createEmptySchematicDocument();
  const instance = fixtureComponent("spntSwitch", "S1", 200, 200);
  instance.variantId = `${count}-throw`;
  doc.components.push(instance);
    authorFixture(doc);
  const selection = { selectedIds: [instance.id], selectedNoteIds: [] };
  const throws = (count: number) => executeSchematicPropertyBatchCommand(doc, selection,
    { kind: "component-variant", variantId: `${count}-throw`, moveBehavior: "stretch" });
  const position = (value: string) => executeSchematicPropertyBatchCommand(doc, selection, { kind: "component-value", value });
  return { doc, instance, throws, position };
}

describe("single-pole multi-throw switch", () => {
  it.each([2, 3, 4, 16])("renders %i throws with stable IDs and grid pins in editor and SVG", count => {
    const f = fixture(count);
    expect(PALETTE_ORDER).toContain("spntSwitch");
    const def = resolveComponentDef(f.instance);
    const ids = ["common", ...Array.from({ length: count }, (_, i) => `throw${i + 1}`)];
    expect(def.pins.map(pin => pin.id)).toEqual(ids);
    expect(def.size).toEqual({ width: 100, height: count * 20 });
    const ys = def.pins.slice(1).map(pin => pin.y);
    expect(ys[0]).toBe(-ys.at(-1)!);
    expect(ys.slice(1).map((y, i) => y - ys[i])).toEqual(Array(count - 1).fill(20));
    for (const rotation of [0, 90, 180, 270]) {
      f.instance.rotation = rotation;
      f.instance.mirrored = true;
      for (const id of ids) {
        const point = componentPinPoint(f.instance, id);
        expect(Math.abs(point.x % 10)).toBe(0);
        expect(Math.abs(point.y % 10)).toBe(0);
      }
      expect(makeComponentCell(f.instance).getPorts().map((pin: { id: string }) => pin.id)).toEqual(ids);
    }
    f.position(String(count));
    const body = makeComponentCell(f.instance).attr("symbolBody/d");
    const svg = renderSchematicSvgScene(fixtureDocument({ components: [f.instance], wires: [], junctionPoints: [], netLabels: [], notes: [] }), { namespace: "spnt-test" });
    expect(svg?.svg).toContain(body);
    expect(copySourceFromDocument(f.doc).components[0].variantId).toBe(`${count}-throw`);
  });

  it("keeps attached wires on the same throw while expanding, and supports Undo/Redo", () => {
    const f = fixture();
    const start = componentPinPoint(f.instance, "throw1");
    f.doc.wires.push(fixtureWire("w1", [start, { x: start.x + 80, y: start.y }]));
    authorFixture(f.doc);
    const before = contentFromDocument(f.doc);
    const history = createSchematicContentHistoryAdapter(before);
    expect(f.throws(4)).toMatchObject({ changed: true, historyIntent: "push" });
    const moved = componentPinPoint(f.instance, "throw1");
    expect(f.doc.wires.some(wire => wire.points.some(point => point.x === moved.x && point.y === moved.y))).toBe(true);
    history.push(contentFromDocument(f.doc));
    expect(history.undo()).toEqual(before);
    expect(history.redo()?.components[0].variantId).toBe("4-throw");
  });

  it("opens a removed selection and persists the reduced count", () => {
    const f = fixture(4);
    f.position("4");
    const closed = makeComponentCell(f.instance).attr("symbolBody/d");
    expect(f.throws(2).changed).toBe(true);
    expect(f.instance.values.switchPosition).toBe("0");
    expect(makeComponentCell(f.instance).attr("symbolBody/d")).not.toBe(closed);
    const restored = parseSchematicContent(serializeSchematicContent(contentFromDocument(f.doc)));
    expect(restored.components[0]).toEqual(f.instance);
  });

  it("rejects invalid positions without partial changes", () => {
    const f = fixture(4);
    const before = structuredClone(f.doc);
    for (const invalid of ["-1", "5", "1.5", "bad"]) {
      expect(f.position(invalid)).toMatchObject({ changed: false, historyIntent: "none" });
    }
    expect(f.doc).toEqual(before);
    f.instance.values.switchPosition = "5";
    expect(() => serializeSchematicContent(contentFromDocument(f.doc))).toThrow();
  });

  it("edits Throws and Position through the shared property panel", () => {
    const f = fixture();
    const root = document.createElement("div");
    root.innerHTML = renderSchematicEditorSidebarProjection();
    document.body.append(root);
    const controller = new SchematicPropertyPanelController(root.querySelector("[data-schematic-property-editor]")!, {
      onComponentVariantChange: value => { f.throws(Number(value.split("-")[0])); sync(); },
      onComponentValueCommit: value => { f.position(value); sync(); }
    });
    function sync() {
      controller.sync(buildSchematicPropertyPanelInput({ document: f.doc, hasSelection: true,
        targets: fixtureDocument({ components: [f.instance], wires: [], notes: [], netLabels: [], junctionPoints: [] }) }));
    }
    controller.bind();
    sync();
    expect(root.querySelector("[data-property-variant-label]")?.textContent).toBe("Throws");
    const count = root.querySelector<HTMLSelectElement>("[data-property-variant]")!;
    expect(count.options.length).toBe(getComponentVariants("spntSwitch").length);
    count.value = "4-throw";
    count.dispatchEvent(new Event("change", { bubbles: true }));
    expect(resolveComponentDef(f.instance).pins).toHaveLength(5);
    const position = root.querySelector<HTMLInputElement>("[data-property-value]")!;
    position.focus();
    position.value = "3";
    position.dispatchEvent(new Event("input", { bubbles: true }));
    position.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(f.instance.values.switchPosition).toBe("3");
    controller.destroy();
  });
});
