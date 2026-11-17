import { describe, expect, it } from "vitest";
import { buildSchematicSelectionSvg } from "../../../src/schematic/selection/selectionExport";
import { renderSchematicDocumentSvg } from "../../../src/schematic/documentSvgRenderer";
import { componentVisualBounds } from "../../../src/schematic/view-geometry";
import type { ComponentInstance } from "../../../src/schematic/types";
import { fixtureDocument } from "../support/fixtureDocument";

const leftDiode: ComponentInstance = {
  type: "diode", ref: "ndio_18", x: 180, y: 360, rotation: 270, mirrored: false,
  appearance: { color: "#0000ff" }, id: "99fa1b04-6241-4cc8-b558-9274e7f85acb", values: {}
};

describe("exported component text bounds", () => {
  it("includes the user's left diode name before adding export padding", () => {
    const input = fixtureDocument({ components: [leftDiode], junctionPoints: [] });
    const exported = buildSchematicSelectionSvg(input)!;
    // The label ends at x=164 and its 11px Arial bold text starts near x=124.
    // The old viewBox started at x=136, cutting off the beginning of ndio_18.
    expect(exported.bounds.x).toBeLessThanOrEqual(123.762);
    expect(exported.viewBox.x).toBeLessThanOrEqual(123.762 - 24);
    expect(exported.svg).toContain(">ndio_18</text>");
    expect(exported.clipboardSvg).toContain(`viewBox="${exported.svg.match(/viewBox="([^"]+)"/)![1]}"`);
    const whole = renderSchematicDocumentSvg(input, { namespace: "diode", presentationMode: false });
    expect(whole.viewBox).toEqual(exported.viewBox);
  });

  it.each([0, 90, 180, 270])("fits a long label at %s degrees with either mirror state", rotation => {
    for (const mirrored of [false, true]) {
      const diode = { ...leftDiode, ref: "WWWWWWWWWWWWWWWW_", rotation, mirrored };
      const input = fixtureDocument({ components: [diode], junctionPoints: [] });
      const before = JSON.stringify(input);
      const exported = buildSchematicSelectionSvg({ ...input, padding: 0 })!;
      // The underscore keeps this name literal: sixteen 11px W glyphs need at least 166px.
      expect(exported.viewBox.width).toBeGreaterThanOrEqual(166);
      expect(JSON.stringify(input)).toBe(before);
    }
  });

  it("includes displayed values even when the component name is hidden", () => {
    const resistor: ComponentInstance = {
      ...leftDiode, type: "resistor", ref: "R1", rotation: 90,
      values: { labelVisible: "false", valueVisible: "true", main: "WWWWWWWWWWWWWWWW" }
    };
    expect(buildSchematicSelectionSvg({ ...fixtureDocument({ components: [resistor], junctionPoints: [] }), padding: 0 })!.viewBox.width)
      .toBeGreaterThanOrEqual(166);
  });

  it("does not enlarge the exported area for hidden names", () => {
    const hidden = { ...leftDiode, ref: "WWWWWWWWWWWWWWWW", values: { labelVisible: "false" } };
    expect(buildSchematicSelectionSvg(fixtureDocument({ components: [hidden], junctionPoints: [] }))!.bounds)
      .toEqual(componentVisualBounds(hidden));
  });
});
