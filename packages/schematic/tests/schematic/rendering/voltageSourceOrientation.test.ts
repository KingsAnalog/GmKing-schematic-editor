import { describe, expect, it } from "vitest";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { resolveComponentVisualModel } from "../../../src/schematic/componentVisualModel";
import { renderComponentSvg } from "../../../src/schematic/componentSvgRenderer";
import { symbolPath } from "../../../src/schematic/symbols/symbolRegistry";
import { componentPinPoint } from "../../../src/schematic/netlist";
import { fixtureComponent } from "../support/fixtures";

describe("voltage source waveform orientation", () => {
  it.each(["sine", "pulse", "exp", "bit", "pwl", "ramp-up", "ramp-down"])(
    "keeps %s upright independently of the terminals in editor, preview, and SVG",
    view => {
      const source = fixtureComponent("voltageSource", "V1", 100, 100);
      source.variantId = view.startsWith("ramp-") ? "ramp" : view;
      if (view.startsWith("ramp-")) source.values["vsource:ramp:direction"] = view.slice(5);
      const initial = resolveComponentVisualModel(source);
      const glyph = initial.symbolContentLayout!.paths[0].d;
      // Separating the graphic must preserve the original unrotated symbol exactly.
      expect(`${initial.path} ${glyph}`).toBe(symbolPath(initial.def.symbol, initial.def.size.width, initial.def.size.height));

      for (const rotation of [0, 90, 180, 270]) {
        for (const mirrored of [false, true]) {
          source.rotation = rotation;
          source.mirrored = mirrored;
          for (const preview of [false, true]) {
            const model = resolveComponentVisualModel(source, { preview });
            const cell = makeComponentCell(source, { preview });
            const content = model.symbolContentLayout!.paths[0];
            expect(content.d).toBe(glyph);
            expect(content.counterRotation).toEqual({ degrees: rotation, x: 50, y: 28 });
            const transform = `translate(${-model.frameBox.x} ${-model.frameBox.y})`
              + (rotation ? ` rotate(${-rotation} 50 28)` : "");
            expect(cell.attr("symbolContentPath0/transform")).toBe(transform);
            expect(cell.attr("symbolContentPath0/d")).toBe(glyph);
            expect(cell.angle()).toBe(rotation);
            const svg = renderComponentSvg(source, { preview });
            expect(svg).toContain(`d="${glyph}" transform="${transform}"`);
          }
          const p = componentPinPoint(source, "p");
          const n = componentPinPoint(source, "n");
          expect(Math.hypot(n.x - p.x, n.y - p.y)).toBe(80);
          if (rotation === 90 || rotation === 270) expect(p.x).toBe(n.x);
          else expect(p.y).toBe(n.y);
        }
      }
    }
  );

  it("keeps DC polarity marks attached to the source terminals", () => {
    const source = fixtureComponent("voltageSource", "Vdc", 0, 0);
    source.rotation = 90;
    expect(resolveComponentVisualModel(source).symbolContentLayout).toBeNull();
    expect(makeComponentCell(source).attr("symbolBody/d")).toBe(symbolPath("voltageSource", 100, 56));
  });
});
