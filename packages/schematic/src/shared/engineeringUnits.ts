export type EngineeringPrefix = "G" | "M" | "k" | "" | "m" | "u" | "n" | "p" | "f";

export interface ParseEngineeringOptions {
  baseUnit?: string;
  allowPrefixOnly?: boolean;
}

export interface FormatEngineeringOptions {
  unit?: string;
  precision?: number;
  prefixes?: EngineeringPrefix[];
}

const PREFIX_MULTIPLIERS: Record<EngineeringPrefix, number> = {
  G: 1e9,
  M: 1e6,
  k: 1e3,
  "": 1,
  m: 1e-3,
  u: 1e-6,
  n: 1e-9,
  p: 1e-12,
  f: 1e-15
};

const DISPLAY_PREFIXES: EngineeringPrefix[] = ["G", "M", "k", "", "m", "u", "n", "p", "f"];
const NUMBER_PATTERN = /^([+-]?(?:(?:\d+(?:\.\d*)?)|(?:\.\d+))(?:[eE][+-]?\d+)?)\s*([A-Za-z\u00b5\u03bc\s]*)$/;

function normalizeMicro(text: string) {
  return text.replace(/\u00b5|\u03bc/g, "u");
}

export function engineeringMultiplier(prefix: EngineeringPrefix) {
  return PREFIX_MULTIPLIERS[prefix];
}

export function scaleByEngineeringPrefix(value: number, prefix: EngineeringPrefix) {
  return value * engineeringMultiplier(prefix);
}

function isEngineeringPrefix(value: string): value is EngineeringPrefix {
  return Object.prototype.hasOwnProperty.call(PREFIX_MULTIPLIERS, value);
}

function suffixMultiplier(rawSuffix: string, options: ParseEngineeringOptions) {
  const suffix = normalizeMicro(rawSuffix.replace(/\s+/g, ""));
  const baseUnit = options.baseUnit ? normalizeMicro(options.baseUnit) : "";
  const allowPrefixOnly = options.allowPrefixOnly ?? true;

  if (suffix === "") {
    return 1;
  }

  if (baseUnit && suffix.endsWith(baseUnit)) {
    const prefix = suffix.slice(0, -baseUnit.length);
    return isEngineeringPrefix(prefix) ? engineeringMultiplier(prefix) : null;
  }

  if (allowPrefixOnly && isEngineeringPrefix(suffix)) {
    return engineeringMultiplier(suffix);
  }

  return null;
}

export function parseEngineeringValue(raw: unknown, options: ParseEngineeringOptions = {}) {
  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }

  if (typeof raw !== "string") {
    return null;
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const match = NUMBER_PATTERN.exec(trimmed);
  if (!match) {
    return null;
  }

  const numeric = Number(match[1]);
  const multiplier = suffixMultiplier(match[2] ?? "", options);
  if (!Number.isFinite(numeric) || multiplier === null) {
    return null;
  }

  return numeric * multiplier;
}

function formatSignificant(value: number, precision: number) {
  const rounded = Number(value.toPrecision(precision));
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

export function formatEngineeringValue(value: number, options: FormatEngineeringOptions = {}) {
  const unit = options.unit ?? "";
  const precision = options.precision ?? 4;
  if (!Number.isFinite(value)) {
    return `--${unit}`;
  }

  if (value === 0) {
    return `0${unit}`;
  }

  const absValue = Math.abs(value);
  const prefixes = options.prefixes ?? DISPLAY_PREFIXES;
  const prefix =
    prefixes.find((candidate) => {
      const multiplier = engineeringMultiplier(candidate);
      return absValue >= multiplier || candidate === prefixes[prefixes.length - 1];
    }) ?? "";
  const scaled = value / engineeringMultiplier(prefix);
  return `${formatSignificant(scaled, precision)}${prefix}${unit}`;
}
