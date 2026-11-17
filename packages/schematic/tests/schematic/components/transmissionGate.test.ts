import { describe, expect, it } from "vitest";
import { getComponentDef, PALETTE_ORDER } from "../../../src/schematic/catalog";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { renderComponentSvg } from "../../../src/schematic/componentSvgRenderer";
import { componentPinPoint } from "../../../src/schematic/netlist";
import { netNameForPin, resolveSchematicNets } from "../../../src/schematic/netResolution";
import { componentLocalFrameBox } from "../../../src/schematic/view-geometry";
import { paletteSymbolPreview } from "../../../src/schematic/instanceSelector";
import { buildPlacedComponent } from "../../../src/schematic/placementModel";
import { parseSchematicDocumentFile, serializeSchematicDocumentFile } from "../../../src/schematic/schematicDocumentFile";
import { buildSchematicSelectionNetlist } from "../../../src/schematic/selection/selectionNetlist";
import { buildCopySource, instantiateCopyAt } from "../../../src/schematic/copyModel";
import { SYMBOL_STROKE_WIDTH } from "../../../src/schematic/symbols/symbolPrimitives";
import { fixtureDocument } from "../support/fixtureDocument";
import { fixtureWire } from "../support/fixtures";

function gate(rotation = 0, mirrored = false) {
  return buildPlacedComponent("transmissionGate", { x: 200, y: 200 }, {
    id: "tg", ref: "TG1", rotation, mirrored
  });
}

describe("transmission gate", () => {
  it("occupies four by four grid cells with four separate terminals", () => {
    const def = getComponentDef("transmissionGate");
    expect(PALETTE_ORDER).toContain("transmissionGate");
    expect(def).toMatchObject({ hotLabel: "transmission_gate", aliases: ["pass_gate"], size: { width: 80, height: 80 } });
    expect(def.pins.map(({ id, role, x, y }) => ({ id, role, x, y }))).toEqual([
      { id: "a", role: "io", x: -40, y: 0 },
      { id: "b", role: "io", x: 40, y: 0 },
      { id: "enbar", role: "ctrlN", x: 0, y: -40 },
      { id: "en", role: "ctrlP", x: 0, y: 40 }
    ]);
    expect(componentLocalFrameBox(gate())).toEqual({ x: 0, y: 0, width: 80, height: 80 });
  });

  it("uses 2a for both triangles and the inverted-control bubble, and a for the leads in every renderer", () => {
    const cell = makeComponentCell(gate());
    expect(cell.attr("symbolBody/strokeWidth")).toBe(SYMBOL_STROKE_WIDTH);
    expect(cell.attr("symbolAccent/strokeWidth")).toBe(2 * SYMBOL_STROKE_WIDTH);
    expect(cell.attr("symbolAccent/d")).toContain("M 16 16 L 64 40 L 16 64 Z");
    expect(cell.attr("symbolAccent/d")).toContain("M 64 16 L 16 40 L 64 64 Z");
    expect(cell.attr("symbolAccent/d")).toContain("A 6 6");
    expect(cell.attr("symbolBody/d")).toBe("M 0 40 L 16 40 M 64 40 L 80 40 M 40 0 L 40 16 M 40 52 L 40 80");
    const svg = renderComponentSvg(gate());
    expect(svg).toMatch(/data-selector="symbolBody"[^>]*stroke-width="2"/);
    expect(svg).toMatch(/data-selector="symbolAccent"[^>]*stroke-width="4"/);
    const preview = paletteSymbolPreview("transmissionGate");
    expect(preview).toContain('viewBox="0 0 80 80"');
    expect(preview).toContain('stroke-width="4"');
    expect(preview).toContain("A 6 6");
  });

  it.each([0, 90, 180, 270])("keeps all four pins on the grid and isolated at %s degrees and when mirrored", rotation => {
    for (const mirrored of [false, true]) {
      const component = gate(rotation, mirrored);
      const pins = getComponentDef("transmissionGate").pins.map(pin => ({ id: pin.id, point: componentPinPoint(component, pin.id) }));
      expect(new Set(pins.map(({ point }) => `${point.x}:${point.y}`)).size).toBe(4);
      const document = fixtureDocument({ components: [component], wires: pins.map(({ id, point }) => fixtureWire(id, [
        point, { x: 200 + (point.x - 200) * 3, y: 200 + (point.y - 200) * 3 }
      ])) });
      const nets = resolveSchematicNets(document);
      expect(new Set(pins.map(({ id }) => netNameForPin(nets, component.id, id))).size).toBe(4);
      const restored = parseSchematicDocumentFile(serializeSchematicDocumentFile(document));
      expect(restored.components).toEqual(document.components);
      expect(restored.connections).toEqual(document.connections);
      pins.forEach(({ point }) => {
        expect(point.x % 20).toBe(0);
        expect(point.y % 20).toBe(0);
      });
    }
  });

  it("copies and exports its canonical identity and terminal order", () => {
    const component = gate();
    const document = fixtureDocument({ components: [component], junctionPoints: [], junctionKeys: new Set<string>() });
    const copied = instantiateCopyAt({ source: buildCopySource(document), anchor: { x: 200, y: 200 } }, { x: 400, y: 400 }, {
      preview: false, nextComponentRef: () => "TG2", createId: () => "copy"
    });
    expect(copied.components[0]).toMatchObject({ type: "transmissionGate", ref: "TG2", x: 400, y: 400 });
    expect(buildSchematicSelectionNetlist(document, [component.id])?.text)
      .toContain("TG1 (TG1_A TG1_B TG1_ENBAR TG1_EN) transmission_gate");
  });
});
