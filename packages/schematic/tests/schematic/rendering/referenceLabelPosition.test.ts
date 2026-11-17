import { describe, expect, it } from "vitest";
import { resolveComponentVisualModel } from "../../../src/schematic/componentVisualModel";
import { componentSymbolBounds } from "../../../src/schematic/view-geometry";
import { fixtureComponent } from "../support/fixtures";

describe("compact two-terminal reference labels", () => {
  it.each(["resistor", "capacitor", "inductor", "switch", "impedance", "voltageSource", "currentSource", "battery"] as const)(
    "keeps the %s label 2 px from the drawn outline through all rotations and mirroring", type => {
      for (const rotation of [0, 90, 180, 270]) {
        for (const mirrored of [false, true]) {
          const component = { ...fixtureComponent(type, "X1", 200, 200, rotation), mirrored };
          const model = resolveComponentVisualModel(component);
          const label = model.refLabelAttrs.refLabel;
          const centerOffset = rotation % 180 === 90 ? 11 * 0.35 : 0;
          const anchorY = label.y - centerOffset + model.frameBox.y;
          expect(componentSymbolBounds(model.def).y - anchorY).toBeCloseTo(2);
          expect(label.transform).toBe(rotation ? `rotate(${-rotation} ${label.x} ${label.y - centerOffset})` : "");
        }
      }
    }
  );

  it("keeps tapped and coupled inductor labels on the opposite side with the compact margin", () => {
    const component = fixtureComponent("inductor", "L1", 200, 200);
    component.values.inductorTap = "top";
    const model = resolveComponentVisualModel(component);
    const bounds = componentSymbolBounds(model.def);
    expect(model.refLabelAttrs.refLabel.y + model.frameBox.y).toBeCloseTo(bounds.y + bounds.height + 2);
    const flipped = resolveComponentVisualModel(component, { flipReferenceLabelSide: true });
    expect(flipped.refLabelAttrs.refLabel.y + flipped.frameBox.y).toBeCloseTo(model.def.size.height - bounds.y - bounds.height - 2);
  });
});
