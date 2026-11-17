import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { resolveComponentDef } from "../../../src/schematic/catalog";
import { componentCellAttrs, makeComponentCell } from "../../../src/schematic/componentRenderer";
import {
  FILTER_KIND_VALUE_KEY,
  FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY
} from "../../../src/schematic/functionBlockModel";
import { componentPinPoint } from "../../../src/schematic/netlist";
import { buildSchematicSelectionSvg } from "../../../src/schematic/selection/selectionExport";
import { SYMBOL_STROKE_WIDTH } from "../../../src/schematic/symbols/symbolPrimitives";
import { fixtureComponent } from "../support/fixtures";

describe("fixed function block rendering", () => {
  it.each([0, 90, 180, 270])("renders the transmission line at %s degrees with 2a outlines and stable terminals", rotation => {
    const delay = fixtureComponent("delay", "DLY1", 100, 120, rotation);
    const pins = [componentPinPoint(delay, "in"), componentPinPoint(delay, "out")];
    delay.variantId = "transmission-line";
    for (const mirrored of [false, true]) {
      delay.mirrored = mirrored;
      const cell = makeComponentCell(delay);
      expect(cell.size()).toEqual({ width: 80, height: 40 });
      expect(cell.attr("symbolBody/strokeWidth")).toBe(2 * SYMBOL_STROKE_WIDTH);
      expect(cell.attr("symbolBody/d")).toContain("A 8 8");
      expect(cell.attr("symbolBody/d")).not.toContain("Z");
      expect(cell.attr("symbolPinMarks/d")).toBe("M 0 40 L 16 40 M 72 40 L 80 40");
      expect(cell.attr("symbolContentRun0/text") ?? "").toBe("");
      expect([componentPinPoint(delay, "in"), componentPinPoint(delay, "out")]).toEqual(mirrored ? [...pins].reverse() : pins);
    }
  });

  it("keeps internal content visible independently from the external instance label", () => {
    const integrator = fixtureComponent("integrator", "INT1", 100, 120);
    const hidden = makeComponentCell(integrator);

    expect(resolveComponentDef(integrator).size).toEqual({ width: 80, height: 80 });
    expect(hidden.size()).toEqual({ width: 80, height: 40 });
    expect(hidden.attr("symbolBody/strokeWidth")).toBe(2 * SYMBOL_STROKE_WIDTH);
    expect(hidden.attr("symbolPinMarks/strokeWidth")).toBe(SYMBOL_STROKE_WIDTH);
    expect(hidden.attr("symbolContentRun0/text")).toBe("∫");
    expect(hidden.attr("symbolContentRun0/opacity")).toBe(1);
    expect(hidden.attr("refLabel/opacity")).toBe(0);

    const shown = {
      ...integrator,
      values: { ...integrator.values, labelVisible: "true" }
    };
    expect(makeComponentCell(shown).attr("refLabel/opacity")).toBe(1);
    expect(makeComponentCell(shown).attr("symbolContentRun0/text")).toBe("∫");

    const preview = makeComponentCell(integrator, { preview: true });
    expect(preview.attr("symbolContentRun0/text")).toBe("∫");
    expect(preview.attr("symbolContentRun0/opacity")).toBeGreaterThan(0);
  });

  it("projects structured fractions, scripts, and filter graphics into JointJS slots", () => {
    const derivative = fixtureComponent("differentiator", "DIF0", 100, 120);
    const derivativeCell = makeComponentCell(derivative);
    expect(derivativeCell.attr("symbolContentPath0/d")).toContain("L");
    expect(derivativeCell.attr("symbolContentRun0/text")).toBe("d");
    expect(derivativeCell.attr("symbolContentRun1/text")).toBe("d");
    expect(derivativeCell.attr("symbolContentRun2/text")).toBe("t");

    const fraction = fixtureComponent("integrator", "INT2", 100, 120);
    fraction.variantId = "transfer";
    fraction.values[FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY] = "discrete";
    const fractionCell = makeComponentCell(fraction);
    expect(fractionCell.attr("symbolContentPath0/d")).toContain("L");
    expect(fractionCell.attr("symbolContentPath0/strokeWidth")).toBe(SYMBOL_STROKE_WIDTH);
    expect(fractionCell.attr("symbolContentRun0/text")).toBe("z");
    expect(fractionCell.attr("symbolContentRun1/text")).toBe("−1");
    expect(fractionCell.attr("symbolContentRun1/fontSize")).toBeLessThan(
      fractionCell.attr("symbolContentRun0/fontSize") as number
    );

    const delay = fixtureComponent("delay", "DLY1", 100, 120);
    delay.variantId = "transfer";
    const delayCell = makeComponentCell(delay);
    expect(delayCell.attr("symbolContentRun0/text")).toBe("e");
    expect(delayCell.attr("symbolContentRun1/text")).toBe("−");
    expect(delayCell.attr("symbolContentRun2/text")).toBe("s");
    expect(delayCell.attr("symbolContentRun2/fontStyle")).toBe("italic");

    const filter = fixtureComponent("filter", "FLT1", 100, 120);
    filter.variantId = "waves";
    filter.values[FILTER_KIND_VALUE_KEY] = "bandstop";
    const filterPath = makeComponentCell(filter).attr("symbolContentPath0/d") as string;
    expect(filterPath.match(/M -7/g)).toHaveLength(1);
  });

  it("swaps physical pins under mirroring without mirroring internal content", () => {
    const normal = fixtureComponent("filter", "FLT2", 200, 200);
    normal.variantId = "response";
    const mirrored = { ...normal, mirrored: true };

    const normalAttrs = componentCellAttrs(normal);
    const mirroredAttrs = componentCellAttrs(mirrored);
    expect(mirroredAttrs.symbolBody.transform).toContain("matrix(-1");
    expect(mirroredAttrs.symbolContentPath0).toEqual(normalAttrs.symbolContentPath0);

    const normalIn = componentPinPoint(normal, "in");
    const normalOut = componentPinPoint(normal, "out");
    const mirroredIn = componentPinPoint(mirrored, "in");
    const mirroredOut = componentPinPoint(mirrored, "out");
    expect(normalIn.x).toBeLessThan(normalOut.x);
    expect(mirroredIn.x).toBeGreaterThan(mirroredOut.x);

    const rotated = { ...normal, rotation: 90 as const };
    expect(makeComponentCell(rotated).angle()).toBe(90);
    expect(componentPinPoint(rotated, "in").y).toBeLessThan(componentPinPoint(rotated, "out").y);

    const differentiator = fixtureComponent("differentiator", "DIF1", 200, 200);
    const differentiatorCell = makeComponentCell(differentiator);
    const differentiatorDef = resolveComponentDef(differentiator);
    differentiatorDef.pins.forEach((pin) => {
      const port = differentiatorCell.getPort(pin.id)!;
      const args = port.args as { x: number; y: number };
      const position = differentiatorCell.position();
      expect({ x: position.x + args.x, y: position.y + args.y }).toEqual(
        componentPinPoint(differentiator, pin.id)
      );
    });
  });

  it("exports structured text, fraction lines, and graphics through the selection SVG path", () => {
    const accumulator = fixtureComponent("integrator", "INT3", 100, 100);
    accumulator.variantId = "transfer";
    accumulator.values[FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY] = "discrete";
    const response = fixtureComponent("filter", "FLT3", 260, 100);
    response.variantId = "response";
    response.values[FILTER_KIND_VALUE_KEY] = "bandpass";

    const exported = buildSchematicSelectionSvg(fixtureDocument({
      netLabels: [],
      components: [accumulator, response],
      wires: [],
      junctionPoints: [],
      notes: []
    }));

    expect(exported?.svg).toContain('data-selector="symbolContentPath0"');
    expect(exported?.svg).toContain('data-selector="symbolContentRun0"');
    expect(exported?.svg).toContain(">z</text>");
    expect(exported?.svg).toContain(">−1</text>");
    expect(exported?.svg).not.toContain(">INT3<");
    expect(exported?.svg).not.toContain(">FLT3<");
  });
});
