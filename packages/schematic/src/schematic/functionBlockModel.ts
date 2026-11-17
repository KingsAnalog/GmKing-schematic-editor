import {
  boxedComponentBodyBounds,
  boxedComponentPinPoint,
  boxedComponentSize,
  boxedHorizontalPins,
  type BoxedComponentSize
} from "./boxedComponentModel";
import {
  layoutSymbolContent,
  symbolFraction,
  symbolLine,
  symbolTextRun,
  type SymbolContentLayout,
  type SymbolContentSpec,
  type SymbolGraphicContentSpec,
  type SymbolLineContentSpec,
  type SymbolTextRun
} from "./symbolContentModel";
import { boxedFrameSymbol, boxedLeadSymbol } from "./symbols/boxedSymbols";
import { transmissionLineGeometry } from "./symbols/transmissionLineSymbols";
import { path, SYMBOL_STROKE_WIDTH } from "./symbols/symbolPrimitives";
import { SYMBOL_GRID_SIZE, type ComponentInstance, type ComponentType, type PinDef } from "./types";
import { componentClockForInstance, type ComponentClock } from "./clockModel";
import { splitComponentName, symbolicValueRuns } from "./componentNameFormat";
import {
  clockInputBubbleSymbol,
  clockInputLeadSymbol
} from "./symbols/clockSymbols";

export type FunctionBlockType = Extract<
  ComponentType,
  "integrator" | "differentiator" | "delay" | "filter"
>;
export type FunctionBlockTimeDomain = "continuous" | "discrete";
export type IntegratorView = "symbol" | "transfer" | "text";
export type DifferentiatorView = "symbol" | "transfer" | "text";
export type DelayView = "transfer" | "duration" | "text" | "transmission-line";
export type FilterView = "waves" | "response" | "text";
export type FunctionBlockView = IntegratorView | DifferentiatorView | DelayView | FilterView;

export type FilterKind = "lowpass" | "highpass" | "bandpass" | "bandstop";
export type FilterBand = "high" | "mid" | "low";

export interface FunctionBlockViewOption<View extends string = string> {
  id: View;
  label: string;
}

export interface FunctionBlockTimeDomainOption {
  value: FunctionBlockTimeDomain;
  label: string;
}

export interface FilterKindOption {
  value: FilterKind;
  label: string;
}

export type FilterKindMutationResult =
  | { kind: "noop"; reason: "unsupported" | "invalid" | "unchanged" }
  | { kind: "changed"; filterKind: FilterKind };

export type FunctionBlockTimeDomainMutationResult =
  | { kind: "noop"; reason: "unsupported" | "invalid" | "unchanged" }
  | { kind: "changed"; timeDomain: FunctionBlockTimeDomain };

export interface ResolvedFunctionBlockModel {
  type: FunctionBlockType;
  variantId: FunctionBlockView;
  timeDomain: FunctionBlockTimeDomain;
  filterKind: FilterKind;
  clock: ComponentClock;
  content: SymbolContentSpec;
  contentLayout: SymbolContentLayout;
  bodyWidthGrid: number;
  bodyHeightGrid: number;
  size: BoxedComponentSize;
  pins: readonly PinDef[];
  framePath: string;
  leadPath: string;
  clockBubblePath: string;
}

export const FILTER_KIND_VALUE_KEY = "filterKind";
export const DEFAULT_FILTER_KIND: FilterKind = "lowpass";
export const FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY = "timeDomain";
export const DEFAULT_FUNCTION_BLOCK_TIME_DOMAIN: FunctionBlockTimeDomain = "continuous";
export const FUNCTION_BLOCK_GAIN_VALUE_KEY = "gain";
export const DEFAULT_FUNCTION_BLOCK_GAIN = "1";
export const DELAY_VALUE_KEY = "delay";

export function defaultDelayValue(timeDomain: FunctionBlockTimeDomain = DEFAULT_FUNCTION_BLOCK_TIME_DOMAIN) {
  return timeDomain === "discrete" ? "1" : "ΔT";
}

export function delayValue(instance: Pick<ComponentInstance, "values">) {
  return instance.values[DELAY_VALUE_KEY]?.trim() || defaultDelayValue(functionBlockTimeDomainForInstance(instance));
}

export function supportsFunctionBlockGain(type: ComponentType) {
  return type === "integrator" || type === "differentiator";
}

export function functionBlockGain(instance: Pick<ComponentInstance, "values">) {
  return instance.values[FUNCTION_BLOCK_GAIN_VALUE_KEY]?.trim() || DEFAULT_FUNCTION_BLOCK_GAIN;
}

export const FUNCTION_BLOCK_BODY_HEIGHT_GRID = 2;
export const FUNCTION_BLOCK_MIN_BODY_WIDTH_GRID = 2;
export const FUNCTION_BLOCK_FRAME_STROKE_WIDTH = 2 * SYMBOL_STROKE_WIDTH;
export const FUNCTION_BLOCK_CONTENT_STROKE_WIDTH = SYMBOL_STROKE_WIDTH;
export const FUNCTION_BLOCK_CONTENT_HORIZONTAL_PADDING = 10;
export const FUNCTION_BLOCK_ACCUMULATOR_LINE_PADDING = SYMBOL_STROKE_WIDTH / 2;

export const FUNCTION_BLOCK_FORMULA_FONT_SIZE = 16;
export const FUNCTION_BLOCK_SCRIPT_FONT_SIZE = 10;
export const FUNCTION_BLOCK_LARGE_SYMBOL_FONT_SIZE = 24;
export const FUNCTION_BLOCK_WORD_FONT_SIZE = 16;
export const FUNCTION_BLOCK_FRACTION_FONT_SIZE = 13;
export const FUNCTION_BLOCK_FRACTION_SCRIPT_FONT_SIZE = 8;
export const FILTER_ABBREVIATION_FONT_SIZE = 16;

export const DELAY_CT_FORMULA_FONT_SIZE = 14;
export const DELAY_CT_SCRIPT_FONT_SIZE = 8;
export const DELAY_TEXT_FONT_SIZE = 13;
export const FUNCTION_BLOCK_TIME_DOMAIN_OPTIONS = [
  { value: "continuous", label: "CT" },
  { value: "discrete", label: "DT" }
] as const satisfies readonly FunctionBlockTimeDomainOption[];

export const INTEGRATOR_VIEW_OPTIONS = [
  { id: "symbol", label: "Symbol" },
  { id: "transfer", label: "Transfer" },
  { id: "text", label: "Text" }
] as const satisfies readonly FunctionBlockViewOption<IntegratorView>[];

export const DIFFERENTIATOR_VIEW_OPTIONS = [
  { id: "symbol", label: "Symbol" },
  { id: "transfer", label: "Transfer" },
  { id: "text", label: "Text" }
] as const satisfies readonly FunctionBlockViewOption<DifferentiatorView>[];

export const DELAY_VIEW_OPTIONS = [
  { id: "transfer", label: "Transfer" },
  { id: "duration", label: "ΔT" },
  { id: "text", label: "Text" },
  { id: "transmission-line", label: "transmission line" }
] as const satisfies readonly FunctionBlockViewOption<DelayView>[];

export const FILTER_VIEW_OPTIONS = [
  { id: "waves", label: "Waves" },
  { id: "response", label: "Response" },
  { id: "text", label: "Text" }
] as const satisfies readonly FunctionBlockViewOption<FilterView>[];

export const INTEGRATOR_STYLE_OPTIONS = INTEGRATOR_VIEW_OPTIONS;
export const DIFFERENTIATOR_STYLE_OPTIONS = DIFFERENTIATOR_VIEW_OPTIONS;
export const DELAY_STYLE_OPTIONS = DELAY_VIEW_OPTIONS;
export const FILTER_STYLE_OPTIONS = FILTER_VIEW_OPTIONS;

export const FILTER_KIND_OPTIONS = [
  { value: "lowpass", label: "Low-pass" },
  { value: "highpass", label: "High-pass" },
  { value: "bandpass", label: "Band-pass" },
  { value: "bandstop", label: "Band-stop" }
] as const satisfies readonly FilterKindOption[];

export const DEFAULT_FUNCTION_BLOCK_VIEW: Readonly<Record<FunctionBlockType, FunctionBlockView>> = {
  integrator: "symbol",
  differentiator: "symbol",
  delay: "transfer",
  filter: "response"
};

export const FUNCTION_BLOCK_VIEW_OPTIONS: Readonly<
  Record<FunctionBlockType, readonly FunctionBlockViewOption[]>
> = {
  integrator: INTEGRATOR_VIEW_OPTIONS,
  differentiator: DIFFERENTIATOR_VIEW_OPTIONS,
  delay: DELAY_VIEW_OPTIONS,
  filter: FILTER_VIEW_OPTIONS
};

export const DEFAULT_FUNCTION_BLOCK_STYLE = DEFAULT_FUNCTION_BLOCK_VIEW;
export const FUNCTION_BLOCK_STYLE_OPTIONS = FUNCTION_BLOCK_VIEW_OPTIONS;

export const FILTER_WAVE_CROSSED_BANDS: Readonly<Record<FilterKind, readonly FilterBand[]>> = {
  lowpass: ["high", "mid"],
  highpass: ["mid", "low"],
  bandpass: ["high", "low"],
  bandstop: ["mid"]
};

export function isFunctionBlockType(type: ComponentType): type is FunctionBlockType {
  return type === "integrator"
    || type === "differentiator"
    || type === "delay"
    || type === "filter";
}

export function isFilterKind(value: unknown): value is FilterKind {
  return value === "lowpass"
    || value === "highpass"
    || value === "bandpass"
    || value === "bandstop";
}

export function isFunctionBlockTimeDomain(value: unknown): value is FunctionBlockTimeDomain {
  return value === "continuous" || value === "discrete";
}

export function parseFunctionBlockTimeDomain(value: unknown): FunctionBlockTimeDomain | null {
  return isFunctionBlockTimeDomain(value) ? value : null;
}

export function functionBlockTimeDomainForInstance(
  instance: Pick<ComponentInstance, "values">
): FunctionBlockTimeDomain {
  return parseFunctionBlockTimeDomain(instance.values[FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY])
    ?? DEFAULT_FUNCTION_BLOCK_TIME_DOMAIN;
}

export function setFunctionBlockTimeDomain(
  instance: Pick<ComponentInstance, "type" | "values">,
  value: unknown
): FunctionBlockTimeDomainMutationResult {
  if (!isFunctionBlockType(instance.type)) return { kind: "noop", reason: "unsupported" };
  const timeDomain = parseFunctionBlockTimeDomain(value);
  if (!timeDomain) return { kind: "noop", reason: "invalid" };

  const stored = instance.values[FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY];
  const canonicalStored = timeDomain === DEFAULT_FUNCTION_BLOCK_TIME_DOMAIN ? undefined : timeDomain;
  if (stored === canonicalStored) return { kind: "noop", reason: "unchanged" };
  if (canonicalStored === undefined) delete instance.values[FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY];
  else instance.values[FUNCTION_BLOCK_TIME_DOMAIN_VALUE_KEY] = canonicalStored;
  return { kind: "changed", timeDomain };
}

export function parseFilterKind(value: unknown): FilterKind | null {
  return isFilterKind(value) ? value : null;
}

export function filterKindForInstance(instance: Pick<ComponentInstance, "values">): FilterKind {
  return parseFilterKind(instance.values[FILTER_KIND_VALUE_KEY]) ?? DEFAULT_FILTER_KIND;
}

export function setFilterKind(
  instance: Pick<ComponentInstance, "type" | "values">,
  value: unknown
): FilterKindMutationResult {
  if (instance.type !== "filter") return { kind: "noop", reason: "unsupported" };
  const filterKind = parseFilterKind(value);
  if (!filterKind) return { kind: "noop", reason: "invalid" };

  const stored = instance.values[FILTER_KIND_VALUE_KEY];
  const canonicalStored = filterKind === DEFAULT_FILTER_KIND ? undefined : filterKind;
  if (stored === canonicalStored) return { kind: "noop", reason: "unchanged" };
  if (canonicalStored === undefined) delete instance.values[FILTER_KIND_VALUE_KEY];
  else instance.values[FILTER_KIND_VALUE_KEY] = canonicalStored;
  return { kind: "changed", filterKind };
}

export function functionBlockViewOptions(type: FunctionBlockType) {
  return FUNCTION_BLOCK_VIEW_OPTIONS[type];
}

export function normalizeFunctionBlockView(
  type: FunctionBlockType,
  variantId: string | undefined
): FunctionBlockView {
  const options = FUNCTION_BLOCK_VIEW_OPTIONS[type];
  return options.some((option) => option.id === variantId)
    ? variantId as FunctionBlockView
    : DEFAULT_FUNCTION_BLOCK_VIEW[type];
}

export function resolveFunctionBlockContent(
  type: FunctionBlockType,
  variantId?: string,
  timeDomain: FunctionBlockTimeDomain = DEFAULT_FUNCTION_BLOCK_TIME_DOMAIN,
  filterKind = DEFAULT_FILTER_KIND,
  gain = DEFAULT_FUNCTION_BLOCK_GAIN,
  delay?: string
): SymbolContentSpec {
  const view = normalizeFunctionBlockView(type, variantId);
  const normalizedTimeDomain = isFunctionBlockTimeDomain(timeDomain)
    ? timeDomain
    : DEFAULT_FUNCTION_BLOCK_TIME_DOMAIN;
  const normalizedGain = gain.trim() || DEFAULT_FUNCTION_BLOCK_GAIN;
  if (type === "integrator") return integratorContent(view as IntegratorView, normalizedTimeDomain, normalizedGain);
  if (type === "differentiator") {
    return differentiatorContent(view as DifferentiatorView, normalizedTimeDomain, normalizedGain);
  }
  if (type === "delay") return delayContent(view as DelayView, normalizedTimeDomain, delay?.trim() || defaultDelayValue(normalizedTimeDomain));
  return filterContent(view as FilterView, filterKind);
}

export function functionBlockBodyWidthGrid(content: SymbolContentSpec) {
  const contentWidth = layoutSymbolContent(content).bounds.width;
  const paddedContentWidth = contentWidth + FUNCTION_BLOCK_CONTENT_HORIZONTAL_PADDING;
  if (paddedContentWidth <= FUNCTION_BLOCK_MIN_BODY_WIDTH_GRID * SYMBOL_GRID_SIZE) {
    return FUNCTION_BLOCK_MIN_BODY_WIDTH_GRID;
  }
  const minimum = Math.max(
    FUNCTION_BLOCK_MIN_BODY_WIDTH_GRID,
    Math.ceil(paddedContentWidth / SYMBOL_GRID_SIZE)
  );
  return Math.ceil(minimum / 2) * 2;
}

function usesCompactDiscreteTransfer(
  type: FunctionBlockType,
  variantId: FunctionBlockView,
  timeDomain: FunctionBlockTimeDomain
) {
  return timeDomain === "discrete"
    && variantId === "transfer"
    && (type === "integrator" || type === "differentiator");
}

export function resolveFunctionBlockModel(
  instance: Pick<ComponentInstance, "type" | "variantId" | "values">
): ResolvedFunctionBlockModel | null {
  if (!isFunctionBlockType(instance.type)) return null;
  const type = instance.type;
  const timeDomain = functionBlockTimeDomainForInstance(instance);
  const filterKind = type === "filter" ? filterKindForInstance(instance) : DEFAULT_FILTER_KIND;
  const variantId = normalizeFunctionBlockView(type, instance.variantId);
  const clock = componentClockForInstance(instance);
  const gain = functionBlockGain(instance);
  const delay = delayValue(instance);
  const content = resolveFunctionBlockContent(type, variantId, timeDomain, filterKind, gain, delay);
  const bodyWidthGrid = type === "filter" || (type === "delay" && (delay === defaultDelayValue(timeDomain) || variantId === "transmission-line" || variantId === "text"))
    ? FUNCTION_BLOCK_MIN_BODY_WIDTH_GRID
    : gain === DEFAULT_FUNCTION_BLOCK_GAIN && usesCompactDiscreteTransfer(type, variantId, timeDomain)
    ? FUNCTION_BLOCK_MIN_BODY_WIDTH_GRID
    : functionBlockBodyWidthGrid(content);
  const size = boxedComponentSize(bodyWidthGrid, FUNCTION_BLOCK_BODY_HEIGHT_GRID);
  const pins = boxedHorizontalPins(size);
  if (clock !== "none") {
    pins.push({
      id: "clk",
      label: "clk",
      role: "clk",
      ...boxedComponentPinPoint(size, "bottom")
    });
  }
  const contentLayout = layoutSymbolContent(content, { x: size.width / 2, y: size.height / 2 });
  const transmission = type === "delay" && variantId === "transmission-line"
    ? transmissionLineGeometry(size.width, size.height) : null;
  const clockBodyBottom = transmission?.bottom ?? boxedComponentBodyBounds(size.width, size.height).bottom;
  const sidedPins = pins.filter((pin) => pin.id !== "clk").map((pin) => ({
    pin,
    side: pin.id === "in" ? "left" as const : "right" as const
  }));
  return {
    type,
    variantId,
    timeDomain,
    filterKind,
    clock,
    content,
    contentLayout,
    bodyWidthGrid,
    bodyHeightGrid: FUNCTION_BLOCK_BODY_HEIGHT_GRID,
    size,
    pins,
    framePath: transmission?.body ?? boxedFrameSymbol(size.width, size.height),
    leadPath: path([
      transmission?.leads ?? boxedLeadSymbol(size.width, size.height, sidedPins),
      clockInputLeadSymbol(
        size.width / 2,
        clockBodyBottom,
        size.width / 2,
        size.height,
        clock
      )
    ]),
    clockBubblePath: clockInputBubbleSymbol(
      size.width / 2,
      clockBodyBottom,
      size.width / 2,
      size.height,
      clock
    )
  };
}

export function filterWavesContent(filterKind: FilterKind): SymbolGraphicContentSpec {
  const bandY: Record<FilterBand, number> = { high: -10, mid: 0, low: 10 };
  const waves = (["high", "mid", "low"] as const).map((band) => frequencyWavePath(bandY[band]));
  const strikes = FILTER_WAVE_CROSSED_BANDS[filterKind].map((band) => {
    const y = bandY[band];
    return `M -7 ${y + 4} L 7 ${y - 4}`;
  });
  return {
    kind: "graphic",
    id: `filter-waves-${filterKind}`,
    width: 30,
    height: 30,
    paths: [{
      d: [...waves, ...strikes].join(" "),
      strokeWidth: FUNCTION_BLOCK_CONTENT_STROKE_WIDTH,
      fill: "none",
      lineCap: "round",
      lineJoin: "round"
    }]
  };
}

export function filterResponseContent(filterKind: FilterKind): SymbolGraphicContentSpec {
  const responsePath: Record<FilterKind, string> = {
    lowpass: "M -15 -6 L 3 -6 L 15 7",
    highpass: "M -15 7 L -3 -6 L 15 -6",
    bandpass: "M -15 7 L -5 -6 L 5 -6 L 15 7",
    bandstop: "M -15 -6 L -5 6 L 5 6 L 15 -6"
  };
  return {
    kind: "graphic",
    id: `filter-response-${filterKind}`,
    width: 32,
    height: 18,
    paths: [{
      d: responsePath[filterKind],
      strokeWidth: FUNCTION_BLOCK_CONTENT_STROKE_WIDTH,
      fill: "none",
      lineCap: "round",
      lineJoin: "round"
    }]
  };
}

function integratorContent(
  view: IntegratorView,
  timeDomain: FunctionBlockTimeDomain,
  gain: string
): SymbolContentSpec {
  if (view === "symbol") return largeSymbol(timeDomain === "continuous" ? "∫" : "Σ");
  if (view === "transfer" && timeDomain === "continuous") {
    return fraction(
      symbolicValueRuns(gain, FUNCTION_BLOCK_FRACTION_FONT_SIZE, FUNCTION_BLOCK_FRACTION_SCRIPT_FONT_SIZE),
      [italic("s", FUNCTION_BLOCK_FRACTION_FONT_SIZE)]
    );
  }
  if (view === "transfer") {
    return fraction(
      [
        ...gainFactor(gain, FUNCTION_BLOCK_FRACTION_FONT_SIZE, FUNCTION_BLOCK_FRACTION_SCRIPT_FONT_SIZE),
        ...discreteZInverse(FUNCTION_BLOCK_FRACTION_FONT_SIZE, FUNCTION_BLOCK_FRACTION_SCRIPT_FONT_SIZE)
      ],
      [
        upright("1−", FUNCTION_BLOCK_FRACTION_FONT_SIZE),
        ...discreteZInverse(FUNCTION_BLOCK_FRACTION_FONT_SIZE, FUNCTION_BLOCK_FRACTION_SCRIPT_FONT_SIZE)
      ],
      { linePadding: FUNCTION_BLOCK_ACCUMULATOR_LINE_PADDING }
    );
  }
  return word("Integrator");
}

function differentiatorContent(
  view: DifferentiatorView,
  timeDomain: FunctionBlockTimeDomain,
  gain: string
): SymbolContentSpec {
  if (view === "symbol" && timeDomain === "continuous") {
    return fraction(
      [italic("d", FUNCTION_BLOCK_FRACTION_FONT_SIZE)],
      [
        italic("d", FUNCTION_BLOCK_FRACTION_FONT_SIZE),
        italic("t", FUNCTION_BLOCK_FRACTION_FONT_SIZE)
      ]
    );
  }
  if (view === "symbol") return largeSymbol("Δ");
  if (view === "transfer" && timeDomain === "continuous") {
    return symbolLine([
      ...gainFactor(gain, FUNCTION_BLOCK_FORMULA_FONT_SIZE, FUNCTION_BLOCK_SCRIPT_FONT_SIZE),
      italic("s", FUNCTION_BLOCK_FORMULA_FONT_SIZE)
    ]);
  }
  if (view === "transfer") {
    return symbolLine([
      ...gainFactor(gain, FUNCTION_BLOCK_FORMULA_FONT_SIZE, FUNCTION_BLOCK_SCRIPT_FONT_SIZE),
      ...(gain === DEFAULT_FUNCTION_BLOCK_GAIN ? [] : [upright("(", FUNCTION_BLOCK_FORMULA_FONT_SIZE)]),
      upright("1−", FUNCTION_BLOCK_FORMULA_FONT_SIZE),
      ...discreteZInverse(FUNCTION_BLOCK_FORMULA_FONT_SIZE, FUNCTION_BLOCK_SCRIPT_FONT_SIZE),
      ...(gain === DEFAULT_FUNCTION_BLOCK_GAIN ? [] : [upright(")", FUNCTION_BLOCK_FORMULA_FONT_SIZE)])
    ]);
  }
  return word("Differentiator");
}

function gainFactor(gain: string, fontSize: number, scriptFontSize: number): SymbolTextRun[] {
  if (gain === DEFAULT_FUNCTION_BLOCK_GAIN) return [];
  const needsParentheses = splitComponentName(gain).literal && !Number.isFinite(Number(gain));
  return [
    ...(needsParentheses ? [upright("(", fontSize)] : []),
    ...symbolicValueRuns(gain, fontSize, scriptFontSize),
    ...(needsParentheses ? [upright(")", fontSize)] : []),
    upright("·", fontSize)
  ];
}

function delayContent(view: DelayView, timeDomain: FunctionBlockTimeDomain, value: string): SymbolContentSpec {
  if (view === "transmission-line") return { kind: "graphic", id: "transmission-line", width: 0, height: 0, paths: [] };
  const normalized = value.replace(/-/g, "−");
  const numeric = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+−]?\d+)?$/.test(normalized);
  const atomic = numeric || /^[\p{L}_][\p{L}\p{N}_]*$/u.test(normalized);
  const grouped = atomic ? normalized : `(${normalized})`;
  if (view === "transfer" && timeDomain === "continuous") {
    return symbolLine([
      italic("e", DELAY_CT_FORMULA_FONT_SIZE),
      superscript("−", DELAY_CT_SCRIPT_FONT_SIZE),
      superscript("s", DELAY_CT_SCRIPT_FONT_SIZE, "italic"),
      ...(numeric ? [superscript("·", DELAY_CT_SCRIPT_FONT_SIZE)] : []),
      ...delayParameterRuns(grouped, DELAY_CT_SCRIPT_FONT_SIZE, true)
    ]);
  }
  if (view === "transfer") {
    return symbolLine([
      italic("z", FUNCTION_BLOCK_FORMULA_FONT_SIZE),
      ...(numeric ? [superscript(`−${normalized}`, FUNCTION_BLOCK_SCRIPT_FONT_SIZE)] : [
        superscript("−", FUNCTION_BLOCK_SCRIPT_FONT_SIZE),
        ...delayParameterRuns(grouped, FUNCTION_BLOCK_SCRIPT_FONT_SIZE, true)
      ])
    ]);
  }
  if (view === "duration") {
    return symbolLine(delayParameterRuns(normalized, FUNCTION_BLOCK_FORMULA_FONT_SIZE));
  }
  return symbolLine([upright("Delay", DELAY_TEXT_FONT_SIZE)]);
}

function delayParameterRuns(value: string, fontSize: number, exponent = false): SymbolTextRun[] {
  // Keep short math expressions typeset while bounding the number of text slots.
  // Longer expressions remain complete as a single literal run in both renderers.
  const tokens = value === "ΔT" ? ["Δ", "T"] : value.match(/\p{L}+|[^\p{L}]+/gu) ?? [value];
  return (tokens.length <= 8 ? tokens : [value]).map(text => symbolTextRun(text, fontSize, {
    fontStyle: /^\p{L}+$/u.test(text) ? "italic" : "normal",
    fontWeight: 700,
    ...(exponent ? { script: "superscript" as const } : {})
  }));
}

function filterContent(view: FilterView, filterKind: FilterKind): SymbolContentSpec {
  const normalizedKind = isFilterKind(filterKind) ? filterKind : DEFAULT_FILTER_KIND;
  if (view === "waves") return filterWavesContent(normalizedKind);
  if (view === "response") return filterResponseContent(normalizedKind);
  const abbreviation: Record<FilterKind, string> = {
    lowpass: "LPF",
    highpass: "HPF",
    bandpass: "BPF",
    bandstop: "BSF"
  };
  return symbolLine([
    upright(abbreviation[normalizedKind], FILTER_ABBREVIATION_FONT_SIZE, { fontWeight: 700 })
  ]);
}

function fraction(
  numerator: readonly SymbolTextRun[],
  denominator: readonly SymbolTextRun[],
  options: { linePadding?: number } = {}
) {
  return symbolFraction(
    symbolLine(numerator),
    symbolLine(denominator),
    {
      lineWidth: FUNCTION_BLOCK_CONTENT_STROKE_WIDTH,
      linePadding: options.linePadding ?? FUNCTION_BLOCK_CONTENT_STROKE_WIDTH,
      lineGap: FUNCTION_BLOCK_CONTENT_STROKE_WIDTH
    }
  );
}

function largeSymbol(text: string): SymbolLineContentSpec {
  return symbolLine([upright(text, FUNCTION_BLOCK_LARGE_SYMBOL_FONT_SIZE)]);
}

function word(text: string): SymbolLineContentSpec {
  return symbolLine([upright(text, FUNCTION_BLOCK_WORD_FONT_SIZE)]);
}

function discreteZInverse(fontSize: number, scriptFontSize: number): SymbolTextRun[] {
  return [
    italic("z", fontSize),
    superscript("−1", scriptFontSize)
  ];
}

function upright(
  text: string,
  fontSize: number,
  options: Omit<SymbolTextRun, "text" | "fontSize" | "fontStyle"> = {}
) {
  return symbolTextRun(text, fontSize, { ...options, fontStyle: "normal", fontWeight: 700 });
}

function italic(
  text: string,
  fontSize: number,
  options: Omit<SymbolTextRun, "text" | "fontSize" | "fontStyle"> = {}
) {
  return symbolTextRun(text, fontSize, { ...options, fontStyle: "italic", fontWeight: 700 });
}

function superscript(text: string, fontSize: number, fontStyle: "normal" | "italic" = "normal") {
  return symbolTextRun(text, fontSize, { fontStyle, fontWeight: 700, script: "superscript" });
}

function frequencyWavePath(y: number) {
  return [
    `M -14 ${y}`,
    `C -9 ${y - 5} -5 ${y - 5} 0 ${y}`,
    `C 5 ${y + 5} 9 ${y + 5} 14 ${y}`
  ].join(" ");
}
