import type { ComponentInstance } from "./types";

export const CONVERTER_BITS_VALUE_KEY = "bits";
export const DEFAULT_CONVERTER_BITS = "k1";
export const DEFAULT_QUANTIZER_LEVELS = 4;
export const MAX_EXPLICIT_QUANTIZER_BITS = 5;

export function converterBitsValue(instance: Pick<ComponentInstance, "values">) {
  return (
    instance.values[CONVERTER_BITS_VALUE_KEY]
    ?? DEFAULT_CONVERTER_BITS
  ).trim();
}

export function converterBitsLabel(bits: unknown) {
  const normalized = typeof bits === "string" ? bits.trim() : "";
  if (!normalized) return "";
  return /^\d+$/.test(normalized) ? `${normalized}b` : `${normalized} b`;
}

export function quantizerLevelCount(bits: unknown) {
  const normalized = typeof bits === "string" ? bits.trim() : "";
  if (!/^[1-9]\d*$/.test(normalized)) return DEFAULT_QUANTIZER_LEVELS;
  const bitCount = Number(normalized);
  if (bitCount > MAX_EXPLICIT_QUANTIZER_BITS) return DEFAULT_QUANTIZER_LEVELS;
  return 2 ** bitCount;
}
