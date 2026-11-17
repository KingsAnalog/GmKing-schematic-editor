import { SYMBOL_STROKE_WIDTH } from "./symbols/symbolPrimitives";

export type SymbolTextScript = "baseline" | "superscript" | "subscript";
export type SymbolTextStyle = "normal" | "italic";
export type SymbolTextWeight = 400 | 700;
export type SymbolTextAnchor = "start" | "middle";

export interface SymbolTextRun {
  text: string;
  fontSize: number;
  fontStyle?: SymbolTextStyle;
  fontWeight?: SymbolTextWeight;
  script?: SymbolTextScript;
}

export interface SymbolLineContentSpec {
  kind: "line";
  runs: readonly SymbolTextRun[];
  runGap?: number;
}

export interface SymbolFractionContentSpec {
  kind: "fraction";
  numerator: SymbolLineContentSpec;
  denominator: SymbolLineContentSpec;
  lineWidth?: number;
  linePadding?: number;
  lineGap?: number;
}

export interface SymbolGraphicPathSpec {
  d: string;
  strokeWidth?: number;
  fill?: "none" | "currentColor";
  lineCap?: "butt" | "round" | "square";
  lineJoin?: "miter" | "round" | "bevel";
}

export interface SymbolGraphicContentSpec {
  kind: "graphic";
  id: string;
  width: number;
  height: number;
  paths: readonly SymbolGraphicPathSpec[];
}

export type SymbolContentSpec =
  | SymbolLineContentSpec
  | SymbolFractionContentSpec
  | SymbolGraphicContentSpec;

export interface SymbolContentBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SymbolTextRunLayout {
  text: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  fontStyle: SymbolTextStyle;
  fontWeight: SymbolTextWeight;
  script: SymbolTextScript;
  textAnchor: SymbolTextAnchor;
  counterRotation?: number;
}

export interface SymbolPathLayout {
  scale?: number;
  d: string;
  translateX: number;
  translateY: number;
  strokeWidth: number;
  fill: "none" | "currentColor";
  lineCap: "butt" | "round" | "square";
  lineJoin: "miter" | "round" | "bevel";
  counterRotation?: {
    degrees: number;
    x: number;
    y: number;
  };
}

export interface SymbolContentLayout {
  bounds: SymbolContentBounds;
  runs: readonly SymbolTextRunLayout[];
  paths: readonly SymbolPathLayout[];
}

export interface SymbolContentCenter {
  x: number;
  y: number;
}

const DEFAULT_SCRIPT: SymbolTextScript = "baseline";
const DEFAULT_STYLE: SymbolTextStyle = "normal";
const DEFAULT_WEIGHT: SymbolTextWeight = 400;
// Matches the Arial bold visual baseline used by centered component labels.
const FONT_ASCENT_EM = 0.85;
const FONT_DESCENT_EM = 0.15;
const SUPERSCRIPT_BASELINE_SHIFT_EM = -0.42;
const SUBSCRIPT_BASELINE_SHIFT_EM = 0.3;

export function symbolTextRun(
  text: string,
  fontSize: number,
  options: Omit<SymbolTextRun, "text" | "fontSize"> = {}
): SymbolTextRun {
  return { text, fontSize, ...options };
}

export function symbolLine(
  runs: readonly SymbolTextRun[],
  runGap = 0
): SymbolLineContentSpec {
  return { kind: "line", runs, ...(runGap !== 0 ? { runGap } : {}) };
}

export function symbolFraction(
  numerator: SymbolLineContentSpec,
  denominator: SymbolLineContentSpec,
  options: Omit<SymbolFractionContentSpec, "kind" | "numerator" | "denominator"> = {}
): SymbolFractionContentSpec {
  return { kind: "fraction", numerator, denominator, ...options };
}

export function measureSymbolText(text: string, fontSize: number) {
  const normalizedSize = nonNegativeFinite(fontSize);
  return Array.from(text).reduce(
    (width, character) => width + approximateArialAdvanceEm(character) * normalizedSize,
    0
  );
}

export function layoutSymbolContent(
  spec: SymbolContentSpec,
  center: SymbolContentCenter = { x: 0, y: 0 }
): SymbolContentLayout {
  const raw = spec.kind === "line"
    ? layoutLine(spec)
    : spec.kind === "fraction"
      ? layoutFraction(spec)
      : layoutGraphic(spec);
  const rawCenterX = raw.bounds.x + raw.bounds.width / 2;
  const rawCenterY = raw.bounds.y + raw.bounds.height / 2;
  return translateLayout(raw, finite(center.x) - rawCenterX, finite(center.y) - rawCenterY);
}

function layoutLine(spec: SymbolLineContentSpec): SymbolContentLayout {
  const normalizedRuns = spec.runs
    .filter((run) => run.text.length > 0)
    .map(normalizeRun);
  if (normalizedRuns.length === 0) return emptyLayout();

  const referenceFontSize = Math.max(
    ...normalizedRuns.filter((run) => run.script === "baseline").map((run) => run.fontSize),
    ...normalizedRuns.map((run) => run.fontSize)
  );
  const gap = nonNegativeFinite(spec.runGap ?? 0);
  let cursor = 0;
  const runs = normalizedRuns.map((run, index): SymbolTextRunLayout => {
    const width = measureSymbolText(run.text, run.fontSize);
    const y = run.script === "superscript"
      ? SUPERSCRIPT_BASELINE_SHIFT_EM * referenceFontSize
      : run.script === "subscript"
        ? SUBSCRIPT_BASELINE_SHIFT_EM * referenceFontSize
        : 0;
    const layout = { ...run, x: cursor + width / 2, y, width, textAnchor: "middle" as const };
    cursor += width;
    if (index < normalizedRuns.length - 1) cursor += gap;
    return layout;
  });
  return {
    bounds: textRunBounds(runs),
    runs,
    paths: []
  };
}

function layoutFraction(spec: SymbolFractionContentSpec): SymbolContentLayout {
  const lineWidth = positiveFinite(spec.lineWidth ?? SYMBOL_STROKE_WIDTH, SYMBOL_STROKE_WIDTH);
  const linePadding = nonNegativeFinite(spec.linePadding ?? SYMBOL_STROKE_WIDTH);
  const lineGap = nonNegativeFinite(spec.lineGap ?? SYMBOL_STROKE_WIDTH);
  const numerator = layoutLine(spec.numerator);
  const denominator = layoutLine(spec.denominator);
  const dividerWidth = Math.max(numerator.bounds.width, denominator.bounds.width) + 2 * linePadding;
  const numeratorX = -numerator.bounds.x - numerator.bounds.width / 2;
  const numeratorY = -lineWidth / 2 - lineGap - (numerator.bounds.y + numerator.bounds.height);
  const denominatorX = -denominator.bounds.x - denominator.bounds.width / 2;
  const denominatorY = lineWidth / 2 + lineGap - denominator.bounds.y;
  const placedNumerator = translateLayout(numerator, numeratorX, numeratorY);
  const placedDenominator = translateLayout(denominator, denominatorX, denominatorY);
  const divider: SymbolPathLayout = {
    d: `M ${-dividerWidth / 2} 0 L ${dividerWidth / 2} 0`,
    translateX: 0,
    translateY: 0,
    strokeWidth: lineWidth,
    fill: "none",
    lineCap: "butt",
    lineJoin: "miter"
  };
  const dividerBounds = {
    x: -dividerWidth / 2 - lineWidth / 2,
    y: -lineWidth / 2,
    width: dividerWidth + lineWidth,
    height: lineWidth
  };
  return {
    bounds: unionBounds([
      placedNumerator.bounds,
      placedDenominator.bounds,
      dividerBounds
    ]),
    runs: [...placedNumerator.runs, ...placedDenominator.runs],
    paths: [divider]
  };
}

function layoutGraphic(spec: SymbolGraphicContentSpec): SymbolContentLayout {
  const width = nonNegativeFinite(spec.width);
  const height = nonNegativeFinite(spec.height);
  return {
    bounds: { x: -width / 2, y: -height / 2, width, height },
    runs: [],
    paths: spec.paths.map((graphicPath): SymbolPathLayout => ({
      d: graphicPath.d,
      translateX: 0,
      translateY: 0,
      strokeWidth: positiveFinite(graphicPath.strokeWidth ?? SYMBOL_STROKE_WIDTH, SYMBOL_STROKE_WIDTH),
      fill: graphicPath.fill ?? "none",
      lineCap: graphicPath.lineCap ?? "round",
      lineJoin: graphicPath.lineJoin ?? "round"
    }))
  };
}

function normalizeRun(run: SymbolTextRun) {
  return {
    text: run.text,
    fontSize: positiveFinite(run.fontSize, 1),
    fontStyle: run.fontStyle ?? DEFAULT_STYLE,
    fontWeight: run.fontWeight ?? DEFAULT_WEIGHT,
    script: run.script ?? DEFAULT_SCRIPT
  };
}

function textRunBounds(runs: readonly SymbolTextRunLayout[]): SymbolContentBounds {
  if (runs.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const left = Math.min(...runs.map((run) => run.x - run.width / 2));
  const right = Math.max(...runs.map((run) => run.x + run.width / 2));
  const top = Math.min(...runs.map((run) => run.y - FONT_ASCENT_EM * run.fontSize));
  const bottom = Math.max(...runs.map((run) => run.y + FONT_DESCENT_EM * run.fontSize));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function unionBounds(bounds: readonly SymbolContentBounds[]): SymbolContentBounds {
  if (bounds.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
  const left = Math.min(...bounds.map((bound) => bound.x));
  const top = Math.min(...bounds.map((bound) => bound.y));
  const right = Math.max(...bounds.map((bound) => bound.x + bound.width));
  const bottom = Math.max(...bounds.map((bound) => bound.y + bound.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function translateLayout(layout: SymbolContentLayout, dx: number, dy: number): SymbolContentLayout {
  return {
    bounds: {
      x: layout.bounds.x + dx,
      y: layout.bounds.y + dy,
      width: layout.bounds.width,
      height: layout.bounds.height
    },
    runs: layout.runs.map((run) => ({ ...run, x: run.x + dx, y: run.y + dy })),
    paths: layout.paths.map((path) => ({
      ...path,
      translateX: path.translateX + dx,
      translateY: path.translateY + dy
    }))
  };
}

function emptyLayout(): SymbolContentLayout {
  return { bounds: { x: 0, y: 0, width: 0, height: 0 }, runs: [], paths: [] };
}

function approximateArialAdvanceEm(character: string) {
  if (/\p{M}/u.test(character)) return 0;
  if (/\p{Nd}/u.test(character)) return 0.556;
  if (character === " ") return 0.278;
  if (character === "/") return 0.278;
  if (character === "(" || character === ")") return 0.333;
  if (character === "+" || character === "−" || character === "-") return 0.584;
  if (character === "∫") return 0.45;
  if (character === "Σ" || character === "Δ") return 0.722;
  if (/[A-Z]/.test(character)) {
    if (character === "I") return 0.278;
    if (character === "M") return 0.833;
    if (character === "W") return 0.944;
    if (character === "G" || character === "O" || character === "Q") return 0.778;
    return 0.722;
  }
  if (/[a-z]/.test(character)) {
    if (character === "i" || character === "j" || character === "l") return 0.278;
    if (character === "f" || character === "r" || character === "t") return 0.389;
    if (character === "m") return 0.833;
    if (character === "w") return 0.778;
    return 0.556;
  }
  if (/\p{L}/u.test(character)) return 0.6;
  return 0.556;
}

function nonNegativeFinite(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function positiveFinite(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}
