import { describe, expect, it } from "vitest";
import { resolveComponentAnalysisModel } from "../../../src/schematic/analysis/componentAnalysisRegistry";
import { getComponentDef, resolveComponentDef } from "../../../src/schematic/catalog";
import { componentPinVisible } from "../../../src/schematic/componentPropertyModel";
import {
  componentCellAttrs,
  makeComponentCell
} from "../../../src/schematic/componentRenderer";
import { resolveComponentVisualModel } from "../../../src/schematic/componentVisualModel";
import {
  DEFAULT_DFF_SETTINGS,
  DFF_VALUE_KEYS,
  dffSettings
} from "../../../src/schematic/dffModel";
import {
  LOGIC_GATE_INPUT_COUNTS,
  LOGIC_GATE_TYPES,
  logicGateInputOffsets,
  logicGatePins,
  logicGateSize,
  logicGateVariantId
} from "../../../src/schematic/logicGateModel";
import {
  dffAccentStrokeWidth,
  dffAccentSymbol,
  dffBodySymbol,
  dffContentLayout,
  logicGateAccentStrokeWidth,
  logicGateAccentSymbol,
  logicGateBodySymbol,
  SYMBOL_STROKE_WIDTH
} from "../../../src/schematic/symbols/symbolBuilders";
import { fixtureComponent } from "../support/fixtures";

describe("digital logic symbols", () => {
  it("shares 2/3/4-input geometry and stable pins across all six gate families", () => {
    LOGIC_GATE_TYPES.forEach((type) => {
      const base = getComponentDef(type);
      expect(base.valuePrefix).toBe(type.toUpperCase());
      expect(base.nameFormat).toBe("indexed");
      expect(base.defaultVariantId).toBe("2-input");
      expect(base.variants?.map((variant) => [variant.id, variant.label])).toEqual([
        ["2-input", "2"],
        ["3-input", "3"],
        ["4-input", "4"]
      ]);
      expect(resolveComponentAnalysisModel(fixtureComponent(type, "X1", 0, 0))).toBe("annotation");

      LOGIC_GATE_INPUT_COUNTS.forEach((inputCount) => {
        const instance = fixtureComponent(type, "X1", 200, 200);
        instance.variantId = logicGateVariantId(inputCount);
        const resolved = resolveComponentDef(instance);
        expect(resolved.size).toEqual(logicGateSize(inputCount));
        expect(resolved.pins).toEqual(logicGatePins(inputCount));
        expect(resolved.pins.slice(0, -1).map((pin) => pin.y))
          .toEqual([...logicGateInputOffsets(inputCount)]);
        expect(resolved.pins[0]).toMatchObject({ id: "in1", role: "in", x: -40 });
        expect(resolved.pins.at(-1)).toMatchObject({ id: "out", role: "out", x: 60, y: 0 });
        expect((resolved.pins.at(-1)?.x ?? 0) - resolved.pins[0].x).toBe(100);
        expect(makeComponentCell(instance).attr("frame/width")).toBe(100);
      });
    });
  });

  it("uses a 2a outline, 26a/46a input-side outer heights, and 8a inversion bubbles", () => {
    const a = SYMBOL_STROKE_WIDTH;
    const outlineWidth = logicGateAccentStrokeWidth();
    expect(outlineWidth).toBe(2 * a);

    LOGIC_GATE_INPUT_COUNTS.forEach((inputCount) => {
      const { width, height } = logicGateSize(inputCount);
      const cy = height / 2;
      const cx = width / 2 + 10;
      const halfPathHeight = inputCount === 4 ? 22 * a : 12 * a;
      const accent = logicGateAccentSymbol(width, height, "and");
      const body = logicGateBodySymbol(width, height, "and", inputCount);
      expect(width).toBe(120);
      expect(accent).toContain(`M ${cx - 15 * a} ${cy - halfPathHeight}`);
      expect(accent).toContain(`${cy + halfPathHeight}`);
      expect(2 * halfPathHeight + outlineWidth).toBe((inputCount === 4 ? 46 : 26) * a);
      logicGateInputOffsets(inputCount).forEach((offset) => {
        expect(body).toContain(`M ${width / 2 - 40} ${cy + offset}`);
      });
    });

    const nand = logicGateAccentSymbol(120, 80, "nand", 2);
    const bubbleRadius = 3 * a;
    expect(nand).toContain(`A ${bubbleRadius} ${bubbleRadius}`);
    expect(2 * (bubbleRadius + outlineWidth / 2)).toBe(8 * a);
  });

  it("renders distinct AND/OR/XOR outlines and inversion bubbles for matching gate pairs", () => {
    const symbols = Object.fromEntries(LOGIC_GATE_TYPES.map((type) => [
      type,
      logicGateAccentSymbol(120, 80, type, 2)
    ]));

    expect(symbols.and).not.toBe(symbols.or);
    expect(symbols.or).not.toBe(symbols.xor);
    expect(symbols.nand).toContain("A 6 6");
    expect(symbols.nor).toContain("A 6 6");
    expect(symbols.xnor).toContain("A 6 6");
    expect(symbols.and).not.toContain("A 6 6");
    expect(symbols.or).not.toContain("A 6 6");
    expect(symbols.xor).not.toContain("A 6 6");
    expect((symbols.xor.match(/M /g) ?? []).length)
      .toBe((symbols.or.match(/M /g) ?? []).length + 1);
  });

  it("stops XOR and XNOR input leads at the additional input arc", () => {
    const width = 120;
    const height = 80;
    const a = SYMBOL_STROKE_WIDTH;
    const bodyLeftX = width / 2 + 10 - 15 * a;
    const bodyHalfHeight = 12 * a;
    logicGateInputOffsets(2).forEach((offset) => {
      const normalized = Math.abs(offset) / bodyHalfHeight;
      const xorBoundaryX = bodyLeftX - 3 * a + 5 * a * (1 - normalized);
      const orBoundaryX = bodyLeftX + 5 * a * (1 - normalized);
      const y = height / 2 + offset;
      ["xor", "xnor"].forEach((type) => {
        const body = logicGateBodySymbol(width, height, type as "xor" | "xnor", 2);
        expect(body).toContain(`M 20 ${y} L ${xorBoundaryX} ${y}`);
        expect(body).not.toContain(`M 20 ${y} L ${orBoundaryX} ${y}`);
      });
    });
  });

  it("renders gate and DFF instance families as indexed labels", () => {
    const prefixes = {
      and: "AND",
      nand: "NAND",
      or: "OR",
      nor: "NOR",
      xor: "XOR",
      xnor: "XNOR",
      dff: "DFF"
    } as const;

    Object.entries(prefixes).forEach(([type, prefix]) => {
      const instance = fixtureComponent(type as keyof typeof prefixes, `${prefix}2`, 200, 200);
      const cell = makeComponentCell(instance);
      expect(getComponentDef(instance.type).nameFormat).toBe("indexed");
      expect(cell.attr("refLabelHead/text")).toBe(prefix);
      expect(cell.attr("refLabelTail/text")).toBe("2");
    });
  });

  it("uses the agreed default DFF body, pins, labels, and optional Q outputs", () => {
    const instance = fixtureComponent("dff", "X1", 200, 200);
    const def = resolveComponentDef(instance);
    const visible = new Set(["d", "clk", "q", "qbar"]);
    const cell = makeComponentCell(instance);

    expect(def.size).toEqual({ width: 140, height: 180 });
    expect(def.pins.map((pin) => ({ id: pin.id, role: pin.role, x: pin.x, y: pin.y }))).toEqual([
      { id: "d", role: "in", x: -60, y: -20 },
      { id: "clk", role: "clk", x: -60, y: 20 },
      { id: "q", role: "out", x: 60, y: -20 },
      { id: "qbar", role: "outN", x: 60, y: 20 }
    ]);
    expect(dffSettings(instance)).toEqual(DEFAULT_DFF_SETTINGS);
    expect(dffAccentStrokeWidth()).toBe(2 * SYMBOL_STROKE_WIDTH);
    expect(cell.attr("symbolAccent/strokeWidth")).toBe(2 * SYMBOL_STROKE_WIDTH);
    expect(cell.attr("symbolBody/d")).toBe(dffBodySymbol(140, 180, DEFAULT_DFF_SETTINGS, visible));
    expect(cell.attr("symbolAccent/d")).toBe(dffAccentSymbol(140, 180, DEFAULT_DFF_SETTINGS, visible));
    expect(String(cell.attr("symbolAccent/d")))
      .toContain("M 22 42 L 118 42 L 118 138 L 22 138 Z");
    expect(118 - 22 + 2 * SYMBOL_STROKE_WIDTH).toBe(100);
    expect(138 - 42 + 2 * SYMBOL_STROKE_WIDTH).toBe(100);
    expect(22 - SYMBOL_STROKE_WIDTH - 10).toBe(10);
    expect(130 - (118 + SYMBOL_STROKE_WIDTH)).toBe(10);
    const defaultContent = dffContentLayout(140, 180, DEFAULT_DFF_SETTINGS, visible);
    expect(defaultContent.runs.map((run) => run.text)).toEqual(["D", "Q", "Q"]);
    expect(defaultContent.runs.map((run) => [run.fontStyle, run.fontSize]))
      .toEqual([["italic", 25], ["italic", 25], ["italic", 25]]);
    expect(defaultContent.runs.map((run) => run.x)).toEqual([44, 96, 96]);

    const dqOnly = dffContentLayout(140, 180, DEFAULT_DFF_SETTINGS, new Set(["d", "clk", "q"]));
    expect(dqOnly.runs.map((run) => [run.text, run.fontStyle, run.fontSize]))
      .toEqual([["D", "italic", 30], ["Q", "italic", 30]]);

    instance.values["pinVisible:q"] = "false";
    instance.values["pinVisible:qbar"] = "false";
    const hiddenCell = makeComponentCell(instance);
    expect(componentPinVisible(instance, "q")).toBe(false);
    expect(componentPinVisible(instance, "qbar")).toBe(false);
    expect(hiddenCell.getPort("q")).toBeUndefined();
    expect(hiddenCell.getPort("qbar")).toBeUndefined();
    expect(String(hiddenCell.attr("symbolBody/d"))).not.toContain("M 108 70 L 130 70");
    expect(String(hiddenCell.attr("symbolAccent/d"))).not.toContain("A 6 6");
    expect(dffContentLayout(140, 180, DEFAULT_DFF_SETTINGS, new Set(["d", "clk"])).runs)
      .toMatchObject([{ text: "D", fontStyle: "italic", fontSize: 30 }]);
  });

  it("moves synchronous/asynchronous controls and marks falling/active-low pins with bubbles", () => {
    const instance = fixtureComponent("dff", "X2", 200, 200);
    instance.values[DFF_VALUE_KEYS.clockEdge] = "falling";
    instance.values[DFF_VALUE_KEYS.setMode] = "synchronous";
    instance.values[DFF_VALUE_KEYS.setActiveLevel] = "low";
    instance.values[DFF_VALUE_KEYS.resetMode] = "asynchronous";
    instance.values[DFF_VALUE_KEYS.resetActiveLevel] = "low";
    const settings = dffSettings(instance);
    const def = resolveComponentDef(instance);
    const visible = new Set(def.pins.map((pin) => pin.id));
    const body = dffBodySymbol(140, 180, settings, visible);
    const accent = dffAccentSymbol(140, 180, settings, visible);

    expect(def.pins.find((pin) => pin.id === "set")).toMatchObject({ x: -60, y: -40 });
    expect(def.pins.find((pin) => pin.id === "reset")).toMatchObject({ x: 0, y: 60 });
    expect(body).toContain("M 10 50 L 10 50");
    expect(body).toContain("M 70 150 L 70 150");
    expect(body).toContain("M 10 110 L 10 110");
    expect(accent).toContain("M 22 103 L 32 110 L 22 117");
    expect(accent).toContain("M 22 50 A 6 6");
    expect(accent).toContain("M 76 144 A 6 6");
    expect(accent.match(/A 6 6/g)).toHaveLength(8);

    const normal = dffContentLayout(140, 180, settings, visible);
    const mirrored = dffContentLayout(140, 180, settings, visible, true);
    expect(mirrored.runs.map((run) => run.x))
      .toEqual(normal.runs.map((run) => 140 - run.x));
    expect(normal.runs.map((run) => run.text)).toEqual(["D", "Q", "Q", "S", "R"]);
    expect(normal.runs.map((run) => run.fontSize)).toEqual([22, 22, 22, 18, 18]);
    const visualCenters = normal.runs.map((run) => run.y - run.fontSize * 0.35);
    expect(visualCenters.map(Math.round)).toEqual([76, 70, 110, 54, 124]);
    expect(visualCenters[3] - normal.runs[3].fontSize / 2).toBeGreaterThan(40);
    expect(visualCenters[4] + normal.runs[4].fontSize / 2).toBeLessThan(140);

    const layoutsByRotation = [0, 90, 180, 270].map((rotation) => ({
      rotation,
      layout: resolveComponentVisualModel({ ...instance, rotation }).symbolContentLayout
    }));
    expect(layoutsByRotation.map(({ layout }) => layout?.runs[0].counterRotation))
      .toEqual([0, 0, 180, 0]);
    expect(layoutsByRotation.map(({ layout }) => layout?.paths[0].counterRotation?.degrees))
      .toEqual([0, 0, 180, 0]);
    const halfTurnLayout = layoutsByRotation[2].layout!;
    const halfTurnPhysicalCenters = halfTurnLayout.runs.map((run) =>
      2 * 90 - run.y - run.fontSize * 0.35
    );
    expect(halfTurnPhysicalCenters.map(Math.round)).toEqual(
      visualCenters.map((center) => Math.round(2 * 90 - center))
    );

    [0, 90, 270].forEach((rotation) => {
      const attrs = componentCellAttrs({ ...instance, rotation });
      expect(attrs.symbolContentRun0.transform).toBe("");
      expect(attrs.symbolContentPath0.transform).not.toContain("rotate(");
    });

    const rotated = { ...instance, rotation: 180 };
    const rotatedAttrs = componentCellAttrs(rotated);
    expect(rotatedAttrs.symbolContentRun0.transform).toContain("rotate(-180");
    const rotatedCell = makeComponentCell(rotated);
    normal.runs.forEach((_, index) => {
      const selector = `symbolContentRun${index}`;
      const x = rotatedCell.attr(`${selector}/x`);
      const y = rotatedCell.attr(`${selector}/y`);
      expect(rotatedCell.attr(`${selector}/transform`))
        .toBe(`rotate(-180 ${x} ${y})`);
    });
    expect(rotatedCell.attr("symbolContentPath0/transform")).toContain("rotate(-180");
  });
});
