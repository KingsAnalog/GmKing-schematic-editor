import { SYMBOL_GRID_SIZE, type ComponentInstance, type ComponentVariantDef, type PinDef } from "./types";

export const DEFAULT_SPNT_THROW_COUNT = 2;
export const MAX_SPNT_THROW_COUNT = 16;
export const SPNT_POSITION_VALUE_KEY = "switchPosition";

export function spntThrowCount(instance: Pick<ComponentInstance, "variantId">) {
  const match = /^(\d+)-throw$/.exec(instance.variantId ?? "");
  const count = match ? Number(match[1]) : DEFAULT_SPNT_THROW_COUNT;
  return count >= 2 && count <= MAX_SPNT_THROW_COUNT ? count : DEFAULT_SPNT_THROW_COUNT;
}

export function validSpntPosition(instance: Pick<ComponentInstance, "variantId">, value: string) {
  return /^[0-9]+$/.test(value) && Number(value) <= spntThrowCount(instance);
}

export function spntPosition(instance: Pick<ComponentInstance, "variantId" | "values">) {
  const value = instance.values[SPNT_POSITION_VALUE_KEY] ?? "1";
  return validSpntPosition(instance, value) ? Number(value) : 0;
}

export function spntThrowY(count: number, index: number) {
  return (index - (count - 1) / 2) * SYMBOL_GRID_SIZE;
}

export function spntSize(count: number) {
  return { width: 100, height: count * SYMBOL_GRID_SIZE };
}

export function spntPins(count: number): PinDef[] {
  return [
    { id: "common", label: "COM", role: "io", x: -2 * SYMBOL_GRID_SIZE, y: 0 },
    ...Array.from({ length: count }, (_, index): PinDef => ({
      id: `throw${index + 1}`, label: String(index + 1), role: "io",
      x: 2 * SYMBOL_GRID_SIZE, y: spntThrowY(count, index)
    }))
  ];
}

export function spntSymbolId(count: number, position = 1) {
  return `spnt-${count}-${position}`;
}

export function parseSpntSymbol(symbol: string) {
  const match = /^spnt-(\d+)-(\d+)$/.exec(symbol);
  if (!match) return null;
  const count = Number(match[1]);
  const position = Number(match[2]);
  return count >= 2 && count <= MAX_SPNT_THROW_COUNT && position <= count ? { count, position } : null;
}

export function spntVariants(): ComponentVariantDef[] {
  return Array.from({ length: MAX_SPNT_THROW_COUNT - 1 }, (_, index) => {
    const count = index + 2;
    return {
      id: `${count}-throw`, label: String(count), terminalClass: "dynamic",
      size: spntSize(count), pins: spntPins(count), symbol: spntSymbolId(count)
    };
  });
}
