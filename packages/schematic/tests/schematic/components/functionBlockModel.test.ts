import { describe, expect, it } from "vitest";
import {
  DEFAULT_FILTER_KIND,
  DEFAULT_FUNCTION_BLOCK_TIME_DOMAIN,
  DEFAULT_FUNCTION_BLOCK_VIEW,
  DELAY_VIEW_OPTIONS,
  DELAY_CT_FORMULA_FONT_SIZE,
  DELAY_CT_SCRIPT_FONT_SIZE,
  DELAY_TEXT_FONT_SIZE,
  DIFFERENTIATOR_VIEW_OPTIONS,
  FILTER_ABBREVIATION_FONT_SIZE,
  FILTER_KIND_OPTIONS,
  FILTER_KIND_VALUE_KEY,
  FILTER_VIEW_OPTIONS,
  FILTER_WAVE_CROSSED_BANDS,
  FUNCTION_BLOCK_BODY_HEIGHT_GRID,
  FUNCTION_BLOCK_ACCUMULATOR_LINE_PADDING,
  FUNCTION_BLOCK_CONTENT_HORIZONTAL_PADDING,
  FUNCTION_BLOCK_FRACTION_FONT_SIZE,
  FUNCTION_BLOCK_FRACTION_SCRIPT_FONT_SIZE,
  FUNCTION_BLOCK_FRAME_STROKE_WIDTH,
  FUNCTION_BLOCK_LARGE_SYMBOL_FONT_SIZE,
  FUNCTION_BLOCK_TIME_DOMAIN_OPTIONS,
  FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY,
  INTEGRATOR_VIEW_OPTIONS,
  filterKindForInstance,
  filterResponseContent,
  filterWavesContent,
  functionBlockBodyWidthGrid,
  functionBlockTimeDomainForInstance,
  isFilterKind,
  isFunctionBlockTimeDomain,
  resolveFunctionBlockContent,
  resolveFunctionBlockModel,
  setFilterKind,
  setFunctionBlockTimeDomain,
  type FilterKind,
  type FunctionBlockTimeDomain,
  type FunctionBlockType
} from "../../../src/schematic/functionBlockModel";
import { transformPin } from "../../../src/schematic/geometry";
import {
  layoutSymbolContent,
  symbolFraction,
  symbolLine,
  symbolTextRun,
  type SymbolContentSpec,
  type SymbolTextRun
} from "../../../src/schematic/symbolContentModel";
import { rectangleFrameSymbol, rectangleLeadSymbol } from "../../../src/schematic/symbols/rectangleSymbols";
import { SYMBOL_STROKE_WIDTH } from "../../../src/schematic/symbols/symbolPrimitives";
import { SYMBOL_GRID_SIZE, type ComponentInstance, type PinDef } from "../../../src/schematic/types";
import { COMPONENT_CLOCK_VALUE_KEY } from "../../../src/schematic/clockModel";

const TIME_DOMAINS = FUNCTION_BLOCK_TIME_DOMAIN_OPTIONS.map(({ value }) => value);

describe("fixed function block model", () => {
  it("preserves rectangle frame and lead geometry through the shared boxed helpers", () => {
    const pins: PinDef[] = [
      { id: "left-1", label: "left-1", role: "io", x: -60, y: 0 },
      { id: "right-1", label: "right-1", role: "io", x: 60, y: 0 },
      { id: "top-1", label: "top-1", role: "io", x: 0, y: -40 },
      { id: "bottom-1", label: "bottom-1", role: "io", x: 0, y: 40 }
    ];

    expect(rectangleFrameSymbol(120, 80)).toBe("M 20 20 L 100 20 L 100 60 L 20 60 Z");
    expect(rectangleLeadSymbol(120, 80, pins)).toBe(
      "M 0 40 L 20 40 M 120 40 L 100 40 M 60 0 L 60 20 M 60 80 L 60 60"
    );
  });

  it("resolves fixed two-terminal geometry on whole grid points", () => {
    const integral = resolveFunctionBlockModel(instance("integrator"));
    expect(integral).toMatchObject({
      type: "integrator",
      variantId: "symbol",
      timeDomain: "continuous",
      bodyWidthGrid: 2,
      bodyHeightGrid: FUNCTION_BLOCK_BODY_HEIGHT_GRID,
      size: { width: 4 * SYMBOL_GRID_SIZE, height: 4 * SYMBOL_GRID_SIZE },
      framePath: "M 20 20 L 60 20 L 60 60 L 20 60 Z",
      leadPath: "M 0 40 L 20 40 M 80 40 L 60 40"
    });
    expect(integral!.pins).toEqual([
      { id: "in", label: "Input", role: "in", x: -40, y: 0 },
      { id: "out", label: "Output", role: "out", x: 40, y: 0 }
    ]);
    expect(FUNCTION_BLOCK_FRAME_STROKE_WIDTH).toBe(2 * SYMBOL_STROKE_WIDTH);

    allModels().forEach(({ name, model, component }) => {
      expect(model.bodyWidthGrid % 2, name).toBe(0);
      expect(model.size.width % (2 * SYMBOL_GRID_SIZE), name).toBe(0);
      model.pins.forEach((pin) => {
        expect(Math.abs(pin.x % SYMBOL_GRID_SIZE), `${name}:${pin.id}:x`).toBe(0);
        expect(Math.abs(pin.y % SYMBOL_GRID_SIZE), `${name}:${pin.id}:y`).toBe(0);
        expect(transformPin(component, pin), `${name}:${pin.id}:world`).toEqual({
          x: component.x + pin.x,
          y: component.y + pin.y
        });
      });
    });
  });

  it("adds rising and falling clock pins to every function block", () => {
    (["integrator", "differentiator", "delay", "filter"] as const).forEach((type) => {
      const rising = resolveFunctionBlockModel(instance(type, undefined, {
        [COMPONENT_CLOCK_VALUE_KEY]: "rising"
      }))!;
      const falling = resolveFunctionBlockModel(instance(type, undefined, {
        [COMPONENT_CLOCK_VALUE_KEY]: "falling"
      }))!;
      const cx = rising.size.width / 2;
      expect(rising).toMatchObject({ clock: "rising" });
      expect(rising.pins.map((pin) => pin.id), type).toEqual(["in", "out", "clk"]);
      expect(rising.pins.at(-1), type).toMatchObject({ x: 0, y: rising.size.height / 2 });
      expect(rising.leadPath, type).toContain(
        `M ${cx} ${rising.size.height - SYMBOL_GRID_SIZE} L ${cx} ${rising.size.height}`
      );
      expect(falling).toMatchObject({ clock: "falling" });
      expect(falling.pins.map((pin) => pin.id), type).toEqual(["in", "out", "clk"]);
      expect(falling.leadPath, type).toContain(
        `M ${cx} ${falling.size.height - 8} L ${cx} ${falling.size.height}`
      );
      expect(falling.clockBubblePath, type).toContain("A 6 6");
      expect(falling.leadPath, type).not.toContain(
        `M ${cx} ${falling.size.height - SYMBOL_GRID_SIZE} L ${cx} ${falling.size.height}`
      );
    });
  });

  it("rounds content-derived body widths upward to an even grid count", () => {
    const differentiatorText = resolveFunctionBlockModel(instance("differentiator", "text"))!;
    const unrounded = Math.max(
      2,
      Math.ceil(
        (differentiatorText.contentLayout.bounds.width + FUNCTION_BLOCK_CONTENT_HORIZONTAL_PADDING)
          / SYMBOL_GRID_SIZE
      )
    );
    expect(differentiatorText.bodyWidthGrid).toBe(Math.ceil(unrounded / 2) * 2);
    expect(differentiatorText.size.width)
      .toBe((differentiatorText.bodyWidthGrid + 2) * SYMBOL_GRID_SIZE);
    expect(functionBlockBodyWidthGrid(differentiatorText.content) % 2).toBe(0);
  });

  it("publishes three views and maps every CT/DT integrator combination", () => {
    expect(INTEGRATOR_VIEW_OPTIONS.map(({ id }) => id)).toEqual(["symbol", "transfer", "text"]);
    expect(contentText(resolveFunctionBlockContent("integrator", "symbol", "continuous"))).toBe("∫");
    expect(contentText(resolveFunctionBlockContent("integrator", "symbol", "discrete"))).toBe("Σ");
    expect(contentText(resolveFunctionBlockContent("integrator", "transfer", "continuous"))).toBe("1s");
    expect(contentText(resolveFunctionBlockContent("integrator", "transfer", "discrete"))).toBe("z−11−z−1");
    TIME_DOMAINS.forEach((timeDomain) => {
      expect(contentText(resolveFunctionBlockContent("integrator", "text", timeDomain)))
        .toBe("Integrator");
    });
  });

  it("publishes three views and maps every CT/DT differentiator combination", () => {
    expect(DIFFERENTIATOR_VIEW_OPTIONS.map(({ id }) => id)).toEqual(["symbol", "transfer", "text"]);
    const continuousSymbol = resolveFunctionBlockContent("differentiator", "symbol", "continuous");
    expect(continuousSymbol.kind).toBe("fraction");
    if (continuousSymbol.kind !== "fraction") throw new Error("expected d/dt fraction");
    expect(contentText(continuousSymbol.numerator)).toBe("d");
    expect(contentText(continuousSymbol.denominator)).toBe("dt");
    expect(contentText(resolveFunctionBlockContent("differentiator", "symbol", "discrete"))).toBe("Δ");
    expect(contentText(resolveFunctionBlockContent("differentiator", "transfer", "continuous"))).toBe("s");
    expect(contentText(resolveFunctionBlockContent("differentiator", "transfer", "discrete"))).toBe("1−z−1");
    TIME_DOMAINS.forEach((timeDomain) => {
      expect(contentText(resolveFunctionBlockContent("differentiator", "text", timeDomain)))
        .toBe("Differentiator");
    });
  });

  it("publishes four views and defaults delay to its CT transfer", () => {
    expect(DELAY_VIEW_OPTIONS.map(({ id }) => id)).toEqual(["transfer", "duration", "text", "transmission-line"]);
    expect(DEFAULT_FUNCTION_BLOCK_VIEW.delay).toBe("transfer");
    expect(resolveFunctionBlockModel(instance("delay"))).toMatchObject({
      variantId: "transfer",
      timeDomain: "continuous"
    });
    expect(contentText(resolveFunctionBlockContent("delay", "transfer", "continuous"))).toBe("e−sΔT");
    expect(contentText(resolveFunctionBlockContent("delay", "transfer", "discrete"))).toBe("z−1");
    TIME_DOMAINS.forEach((timeDomain) => {
      expect(contentText(resolveFunctionBlockContent("delay", "duration", timeDomain))).toBe(timeDomain === "continuous" ? "ΔT" : "1");
      expect(contentText(resolveFunctionBlockContent("delay", "text", timeDomain))).toBe("Delay");
    });
  });

  it("keeps every view and domain within its resolved body", () => {
    allModels().forEach(({ name, model }) => {
      const bodyLeft = SYMBOL_GRID_SIZE;
      const bodyRight = model.size.width - SYMBOL_GRID_SIZE;
      const bodyTop = SYMBOL_GRID_SIZE;
      const bodyBottom = model.size.height - SYMBOL_GRID_SIZE;
      expect(model.contentLayout.bounds.x, name).toBeGreaterThanOrEqual(bodyLeft);
      expect(model.contentLayout.bounds.x + model.contentLayout.bounds.width, name)
        .toBeLessThanOrEqual(bodyRight);
      expect(model.contentLayout.bounds.y, name).toBeGreaterThanOrEqual(bodyTop);
      expect(model.contentLayout.bounds.y + model.contentLayout.bounds.height, name)
        .toBeLessThanOrEqual(bodyBottom);
    });
  });

  it("keeps compact formulas and graphics in a two-grid body", () => {
    const compactCases = [
      instance("integrator", "symbol"),
      instance("integrator", "transfer"),
      instance("differentiator", "symbol"),
      instance("integrator", "transfer", { [FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY]: "discrete" }),
      instance("differentiator", "transfer", { [FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY]: "discrete" }),
      instance("delay", "transfer", { [FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY]: "discrete" })
    ];

    compactCases.forEach((component) => {
      expect(resolveFunctionBlockModel(component)?.bodyWidthGrid, `${component.type}:${component.variantId}`)
        .toBe(2);
    });
  });

  it("keeps every delay view and domain in a fixed two-grid body", () => {
    TIME_DOMAINS.forEach((timeDomain) => {
      DELAY_VIEW_OPTIONS.forEach(({ id: view }) => {
        const model = resolveFunctionBlockModel(instance("delay", view, {
          [FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY]: timeDomain
        }))!;
        expect(model.bodyWidthGrid, `${view}:${timeDomain}`).toBe(2);
        expect(model.size, `${view}:${timeDomain}`).toEqual({
          width: 4 * SYMBOL_GRID_SIZE,
          height: 4 * SYMBOL_GRID_SIZE
        });
      });
    });
  });

  it("keeps every filter view, domain, and kind in a fixed two-grid body", () => {
    TIME_DOMAINS.forEach((timeDomain) => {
      FILTER_KIND_OPTIONS.forEach(({ value: filterKind }) => {
        FILTER_VIEW_OPTIONS.forEach(({ id: view }) => {
          const model = resolveFunctionBlockModel(instance("filter", view, {
            [FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY]: timeDomain,
            [FILTER_KIND_VALUE_KEY]: filterKind
          }))!;
          expect(model.bodyWidthGrid, `${view}:${timeDomain}:${filterKind}`).toBe(2);
          expect(model.size, `${view}:${timeDomain}:${filterKind}`).toEqual({
            width: 4 * SYMBOL_GRID_SIZE,
            height: 4 * SYMBOL_GRID_SIZE
          });
        });
      });
    });
  });

  it("centers large symbols with the shared middle-anchor layout", () => {
    const integral = resolveFunctionBlockModel(instance("integrator", "symbol"))!;
    const sigma = resolveFunctionBlockModel(instance("integrator", "symbol", {
      [FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY]: "discrete"
    }))!;
    const center = { x: integral.size.width / 2, y: integral.size.height / 2 };

    [integral, sigma].forEach((model) => {
      expect(model.contentLayout.bounds.x + model.contentLayout.bounds.width / 2)
        .toBeCloseTo(center.x, 10);
      expect(model.contentLayout.bounds.y + model.contentLayout.bounds.height / 2)
        .toBeCloseTo(center.y, 10);
      expect(model.contentLayout.runs).toEqual([
        expect.objectContaining({ textAnchor: "middle" })
      ]);
    });
  });

  it("uses the specified bold formula hierarchy and dedicated Unicode minus", () => {
    allModels().forEach(({ name, model }) => {
      model.contentLayout.runs.forEach((run) => expect(run.fontWeight, name).toBe(700));
    });

    const integral = resolveFunctionBlockContent("integrator", "symbol", "continuous");
    expect(contentRuns(integral)[0]).toMatchObject({ fontSize: FUNCTION_BLOCK_LARGE_SYMBOL_FONT_SIZE });

    const accumulator = resolveFunctionBlockContent("integrator", "transfer", "discrete");
    expect(accumulator.kind).toBe("fraction");
    if (accumulator.kind !== "fraction") throw new Error("expected a fraction");
    expect(accumulator.linePadding).toBe(FUNCTION_BLOCK_ACCUMULATOR_LINE_PADDING);
    expect(accumulator.numerator.runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ fontSize: FUNCTION_BLOCK_FRACTION_FONT_SIZE }),
      expect.objectContaining({ fontSize: FUNCTION_BLOCK_FRACTION_SCRIPT_FONT_SIZE, script: "superscript" })
    ]));

    const continuousDelay = resolveFunctionBlockContent("delay", "transfer", "continuous");
    expect(continuousDelay.kind).toBe("line");
    if (continuousDelay.kind !== "line") throw new Error("expected a line");
    expect(continuousDelay.runs[0].fontSize).toBe(DELAY_CT_FORMULA_FONT_SIZE);
    expect(continuousDelay.runs.slice(1).every(({ fontSize }) => fontSize === DELAY_CT_SCRIPT_FONT_SIZE))
      .toBe(true);
    expect(continuousDelay.runs[1]).toMatchObject({ text: "−", script: "superscript" });

    expect(contentRuns(resolveFunctionBlockContent("delay", "text", "continuous"))[0].fontSize)
      .toBe(DELAY_TEXT_FONT_SIZE);
    expect(contentRuns(resolveFunctionBlockContent("filter", "text", "continuous", "lowpass"))[0].fontSize)
      .toBe(FILTER_ABBREVIATION_FONT_SIZE);
  });

  it("supports future structured formulas without adding current component properties", () => {
    const future: Record<string, SymbolContentSpec> = {
      "K/s": symbolFraction(
        symbolLine([italic("K", 13)]),
        symbolLine([italic("s", 13)])
      ),
      "1/sRC": symbolFraction(
        symbolLine([upright("1", 13)]),
        symbolLine([italic("sRC", 13)])
      ),
      "ΔT_c": symbolLine([
        italic("ΔT", 16),
        symbolTextRun("c", 10, { fontStyle: "italic", fontWeight: 700, script: "subscript" })
      ]),
      "z^-3": symbolLine([
        italic("z", 16),
        symbolTextRun("−3", 10, { fontWeight: 700, script: "superscript" })
      ]),
      "LPF_1": symbolLine([
        upright("LPF", 16),
        symbolTextRun("1", 10, { fontWeight: 700, script: "subscript" })
      ])
    };

    Object.entries(future).forEach(([name, spec]) => {
      const layout = layoutSymbolContent(spec, { x: 100, y: 50 });
      expect(layout.bounds.width, name).toBeGreaterThan(0);
      expect(layout.bounds.height, name).toBeGreaterThan(0);
      expect(layout.bounds.x + layout.bounds.width / 2, name).toBeCloseTo(100, 10);
      expect(layout.bounds.y + layout.bounds.height / 2, name).toBeCloseTo(50, 10);
      expect(layout.runs.every(({ fontWeight }) => fontWeight === 700), name).toBe(true);
    });
    expect(future["K/s"].kind).toBe("fraction");
    expect(layoutSymbolContent(future["ΔT_c"]).runs[1].script).toBe("subscript");
    expect(layoutSymbolContent(future["z^-3"]).runs[1].text).toBe("−3");
    expect(layoutSymbolContent(future["LPF_1"]).runs[1].script).toBe("subscript");
  });

  it("maps every filter view, time domain, and kind combination", () => {
    expect(FILTER_VIEW_OPTIONS.map(({ id }) => id)).toEqual(["waves", "response", "text"]);
    const kinds = FILTER_KIND_OPTIONS.map(({ value }) => value);
    expect(kinds).toEqual(["lowpass", "highpass", "bandpass", "bandstop"]);
    expect(FILTER_WAVE_CROSSED_BANDS).toEqual({
      lowpass: ["high", "mid"],
      highpass: ["mid", "low"],
      bandpass: ["high", "low"],
      bandstop: ["mid"]
    });

    TIME_DOMAINS.forEach((timeDomain) => {
      kinds.forEach((filterKind) => {
        expect(filterWavesContent(filterKind).id).toBe(`filter-waves-${filterKind}`);
        expect(filterResponseContent(filterKind).id).toBe(`filter-response-${filterKind}`);
        FILTER_VIEW_OPTIONS.forEach(({ id: view }) => {
          const content = resolveFunctionBlockContent("filter", view, timeDomain, filterKind);
          const model = resolveFunctionBlockModel(instance("filter", view, {
            [FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY]: timeDomain,
            [FILTER_KIND_VALUE_KEY]: filterKind
          }))!;
          expect(model).toMatchObject({ filterKind, timeDomain, variantId: view });
          expect(model.content).toEqual(content);
          expect(model.contentLayout.bounds.height).toBeLessThanOrEqual(2 * SYMBOL_GRID_SIZE);
        });
      });
    });

    expect(filterWavesContent("bandstop").paths[0].d.match(/M -7/g)).toHaveLength(1);
    expect(filterWavesContent("lowpass").paths[0].d.match(/M -7/g)).toHaveLength(2);
    expect(filterWavesContent("lowpass").paths[0].d.match(/C /g)).toHaveLength(6);
    expect(filterWavesContent("lowpass")).toMatchObject({
      width: 30,
      height: 30
    });
    expect(filterWavesContent("lowpass").paths[0].d)
      .toContain("M -14 -10 C -9 -15 -5 -15 0 -10 C 5 -5 9 -5 14 -10");
  });

  it("parses and canonically stores CT/DT for every function block", () => {
    expect(DEFAULT_FUNCTION_BLOCK_TIME_DOMAIN).toBe("continuous");
    expect(FUNCTION_BLOCK_TIME_DOMAIN_OPTIONS).toEqual([
      { value: "continuous", label: "CT" },
      { value: "discrete", label: "DT" }
    ]);
    expect(isFunctionBlockTimeDomain("continuous")).toBe(true);
    expect(isFunctionBlockTimeDomain("discrete")).toBe(true);
    expect(isFunctionBlockTimeDomain("invalid")).toBe(false);

    (["integrator", "differentiator", "delay", "filter"] as const).forEach((type) => {
      const component = instance(type);
      expect(functionBlockTimeDomainForInstance(component), type).toBe("continuous");
      expect(setFunctionBlockTimeDomain(component, "discrete"), type)
        .toEqual({ kind: "changed", timeDomain: "discrete" });
      expect(component.values, type).toEqual({ [FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY]: "discrete" });
      expect(setFunctionBlockTimeDomain(component, "discrete"), type)
        .toEqual({ kind: "noop", reason: "unchanged" });
      expect(setFunctionBlockTimeDomain(component, "continuous"), type)
        .toEqual({ kind: "changed", timeDomain: "continuous" });
      expect(component.values, type).toEqual({});
    });

    expect(setFunctionBlockTimeDomain(instance("integrator"), "invalid"))
      .toEqual({ kind: "noop", reason: "invalid" });
    const unsupported = { ...instance("integrator"), type: "resistor" as const };
    expect(setFunctionBlockTimeDomain(unsupported, "discrete"))
      .toEqual({ kind: "noop", reason: "unsupported" });
  });

  it("parses and canonically stores filter kind", () => {
    const filter = instance("filter");
    expect(DEFAULT_FILTER_KIND).toBe("lowpass");
    expect(filterKindForInstance(filter)).toBe("lowpass");
    expect(isFilterKind("bandpass")).toBe(true);
    expect(isFilterKind("invalid")).toBe(false);

    expect(setFilterKind(filter, "bandpass")).toEqual({ kind: "changed", filterKind: "bandpass" });
    expect(filter.values).toEqual({ [FILTER_KIND_VALUE_KEY]: "bandpass" });
    expect(setFilterKind(filter, "bandpass")).toEqual({ kind: "noop", reason: "unchanged" });
    expect(setFilterKind(filter, "lowpass")).toEqual({ kind: "changed", filterKind: "lowpass" });
    expect(filter.values).toEqual({});
    expect(setFilterKind(filter, "invalid")).toEqual({ kind: "noop", reason: "invalid" });
    expect(setFilterKind(instance("delay"), "highpass")).toEqual({ kind: "noop", reason: "unsupported" });

    filter.values[FILTER_KIND_VALUE_KEY] = "legacy-invalid";
    expect(filterKindForInstance(filter)).toBe(DEFAULT_FILTER_KIND);
    expect(setFilterKind(filter, DEFAULT_FILTER_KIND)).toEqual({ kind: "changed", filterKind: "lowpass" });
    expect(filter.values).toEqual({});
  });
});

function allModels() {
  const cases: Array<{
    type: FunctionBlockType;
    view: string;
    timeDomain: FunctionBlockTimeDomain;
    filterKind?: FilterKind;
  }> = [];
  TIME_DOMAINS.forEach((timeDomain) => {
    INTEGRATOR_VIEW_OPTIONS.forEach(({ id: view }) => cases.push({ type: "integrator", view, timeDomain }));
    DIFFERENTIATOR_VIEW_OPTIONS.forEach(({ id: view }) => cases.push({ type: "differentiator", view, timeDomain }));
    DELAY_VIEW_OPTIONS.forEach(({ id: view }) => cases.push({ type: "delay", view, timeDomain }));
    FILTER_VIEW_OPTIONS.forEach(({ id: view }) => {
      FILTER_KIND_OPTIONS.forEach(({ value: filterKind }) => {
        cases.push({ type: "filter", view, timeDomain, filterKind });
      });
    });
  });
  return cases.map(({ type, view, timeDomain, filterKind }) => {
    const component = instance(type, view, {
      [FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY]: timeDomain,
      ...(filterKind ? { [FILTER_KIND_VALUE_KEY]: filterKind } : {})
    });
    component.x = 200;
    component.y = 100;
    const model = resolveFunctionBlockModel(component)!;
    return { name: `${type}:${view}:${timeDomain}:${filterKind ?? "default"}`, model, component };
  });
}

function instance(
  type: FunctionBlockType,
  variantId?: string,
  values: Record<string, string> = {}
): ComponentInstance {
  return {
    id: `${type}-1`,
    type,
    ...(variantId ? { variantId } : {}),
    ref: "X1",
    x: 0,
    y: 0,
    rotation: 0,
    mirrored: false,
    values
  };
}

function contentRuns(spec: SymbolContentSpec): readonly SymbolTextRun[] {
  if (spec.kind === "line") return spec.runs;
  if (spec.kind === "fraction") return [...spec.numerator.runs, ...spec.denominator.runs];
  return [];
}

function contentText(spec: SymbolContentSpec) {
  return contentRuns(spec).map(({ text }) => text).join("");
}

function upright(text: string, fontSize: number) {
  return symbolTextRun(text, fontSize, { fontStyle: "normal", fontWeight: 700 });
}

function italic(text: string, fontSize: number) {
  return symbolTextRun(text, fontSize, { fontStyle: "italic", fontWeight: 700 });
}
