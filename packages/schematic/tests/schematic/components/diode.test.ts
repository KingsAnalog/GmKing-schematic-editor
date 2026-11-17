import { describe, expect, it } from "vitest";
import { getComponentDef, PALETTE_ORDER } from "../../../src/schematic/catalog";
import { ComponentRefAllocator } from "../../../src/schematic/componentRefAllocator";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { renderComponentSvg } from "../../../src/schematic/componentSvgRenderer";
import { componentPinPoint, extractNetlist } from "../../../src/schematic/netlist";
import { paletteSymbolPreview } from "../../../src/schematic/instanceSelector";
import { buildPlacedComponent } from "../../../src/schematic/placementModel";
import { parseSchematicDocumentFile, serializeSchematicDocumentFile } from "../../../src/schematic/schematicDocumentFile";
import { buildSchematicSelectionNetlist } from "../../../src/schematic/selection/selectionNetlist";
import { SYMBOL_STROKE_WIDTH } from "../../../src/schematic/symbols/symbolPrimitives";
import { fixtureDocument } from "../support/fixtureDocument";
import { fixtureWire } from "../support/fixtures";

function diode(rotation = 0, mirrored = false) {
  return buildPlacedComponent("diode", { x: 200, y: 200 }, {
    id: "d1", ref: "D1", rotation, mirrored
  });
}

describe("diode", () => {
  it("uses standard two-terminal spacing and allocates D references", () => {
    const def = getComponentDef("diode");
    expect(PALETTE_ORDER).toContain("diode");
    expect(def.size).toEqual(getComponentDef("resistor").size);
    expect(def.pins).toEqual([
      { id: "a", label: "A", role: "p", x: -40, y: 0 },
      { id: "k", label: "K", role: "n", x: 40, y: 0 }
    ]);
    const refs = new ComponentRefAllocator();
    expect(refs.next("diode")).toBe("D1");
    expect(refs.next("diode")).toBe("D2");
  });

  it("shares its anode-to-cathode artwork across the canvas, palette and SVG", () => {
    const cell = makeComponentCell(diode());
    const leads = "M 10 28 L 38 28 M 62 28 L 90 28";
    const body = "M 38 16 L 62 28 L 38 40 Z M 62 16 L 62 40";
    expect(cell.attr("symbolBody/d")).toBe(leads);
    expect(cell.attr("symbolAccent/d")).toBe(body);
    expect(cell.attr("symbolBody/strokeWidth")).toBe(SYMBOL_STROKE_WIDTH);
    expect(cell.attr("symbolAccent/strokeWidth")).toBe(2 * SYMBOL_STROKE_WIDTH);
    const svg = renderComponentSvg(diode());
    expect(svg).toContain(`d="${body}"`);
    expect(svg).toContain(`d="${leads}"`);
    expect(paletteSymbolPreview("diode")).toContain(`d="${body}"`);
  });

  it.each([0, 90, 180, 270])("preserves polarity, wiring and saved data at %s degrees, including mirrors", rotation => {
    for (const mirrored of [false, true]) {
      const component = diode(rotation, mirrored);
      const a = componentPinPoint(component, "a");
      const k = componentPinPoint(component, "k");
      const direction = mirrored ? -1 : 1;
      const offsets = [
        { x: -40, y: 0 }, { x: 0, y: -40 }, { x: 40, y: 0 }, { x: 0, y: 40 }
      ];
      const offset = offsets[rotation / 90];
      expect(a).toEqual({ x: 200 + direction * offset.x, y: 200 + direction * offset.y });
      expect(k).toEqual({ x: 200 - direction * offset.x, y: 200 - direction * offset.y });
      const document = fixtureDocument({ components: [component], wires: [a, k].map((point, index) =>
        fixtureWire(`w${index}`, [point, { x: 200 + 2 * (point.x - 200), y: 200 + 2 * (point.y - 200) }])
      ) });
      const restored = parseSchematicDocumentFile(serializeSchematicDocumentFile(document));
      expect(restored.components).toEqual(document.components);
      expect(restored.connections).toEqual(document.connections);
      const netlist = extractNetlist(restored);
      const pins = netlist.components[0].pins;
      expect(Object.keys(pins)).toEqual(["a", "k"]);
      expect(pins.a).not.toBe(pins.k);
      expect(buildSchematicSelectionNetlist(document, [component.id])?.text)
        .toContain(`D1 (${pins.a} ${pins.k}) diode`);
    }
  });
});
