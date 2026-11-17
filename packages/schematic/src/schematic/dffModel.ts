import type { ComponentInstance, PinDef } from "./types";
import { isClockEdge, type ClockEdge } from "./clockModel";

export type DffClockEdge = ClockEdge;
export type DffControlMode = "none" | "synchronous" | "asynchronous";
export type DffActiveLevel = "high" | "low";
export type DffSettingProperty =
  | "clockEdge"
  | "setMode"
  | "setActiveLevel"
  | "resetMode"
  | "resetActiveLevel";

export interface DffSettings {
  clockEdge: DffClockEdge;
  setMode: DffControlMode;
  setActiveLevel: DffActiveLevel;
  resetMode: DffControlMode;
  resetActiveLevel: DffActiveLevel;
}

export const DFF_VALUE_KEYS: Record<DffSettingProperty, string> = {
  clockEdge: "dffClockEdge",
  setMode: "dffSetMode",
  setActiveLevel: "dffSetActiveLevel",
  resetMode: "dffResetMode",
  resetActiveLevel: "dffResetActiveLevel"
};

export const DEFAULT_DFF_SETTINGS: DffSettings = {
  clockEdge: "rising",
  setMode: "none",
  setActiveLevel: "high",
  resetMode: "none",
  resetActiveLevel: "high"
};

const CLOCK_OPTIONS = [{ value: "rising", label: "Rising" }, { value: "falling", label: "Falling" }] as const;
const MODE_OPTIONS = [{ value: "none", label: "Off" }, { value: "synchronous", label: "Sync" }, { value: "asynchronous", label: "Async" }] as const;
const LEVEL_OPTIONS = [{ value: "high", label: "High" }, { value: "low", label: "Low" }] as const;
export const DFF_SETTING_OPTIONS = {
  clockEdge: CLOCK_OPTIONS, setMode: MODE_OPTIONS, resetMode: MODE_OPTIONS,
  setActiveLevel: LEVEL_OPTIONS, resetActiveLevel: LEVEL_OPTIONS
} as const;

export const DFF_SIZE = { width: 140, height: 180 };

export function isDffClockEdge(value: unknown): value is DffClockEdge {
  return isClockEdge(value);
}

export function isDffControlMode(value: unknown): value is DffControlMode {
  return MODE_OPTIONS.some(option => option.value === value);
}

export function isDffActiveLevel(value: unknown): value is DffActiveLevel {
  return LEVEL_OPTIONS.some(option => option.value === value);
}

export function isDffSettingProperty(value: unknown): value is DffSettingProperty {
  return value === "clockEdge"
    || value === "setMode"
    || value === "setActiveLevel"
    || value === "resetMode"
    || value === "resetActiveLevel";
}

export function dffSettings(instance: Pick<ComponentInstance, "values">): DffSettings {
  return {
    clockEdge: isDffClockEdge(instance.values[DFF_VALUE_KEYS.clockEdge])
      ? instance.values[DFF_VALUE_KEYS.clockEdge] as DffClockEdge
      : DEFAULT_DFF_SETTINGS.clockEdge,
    setMode: isDffControlMode(instance.values[DFF_VALUE_KEYS.setMode])
      ? instance.values[DFF_VALUE_KEYS.setMode] as DffControlMode
      : DEFAULT_DFF_SETTINGS.setMode,
    setActiveLevel: isDffActiveLevel(instance.values[DFF_VALUE_KEYS.setActiveLevel])
      ? instance.values[DFF_VALUE_KEYS.setActiveLevel] as DffActiveLevel
      : DEFAULT_DFF_SETTINGS.setActiveLevel,
    resetMode: isDffControlMode(instance.values[DFF_VALUE_KEYS.resetMode])
      ? instance.values[DFF_VALUE_KEYS.resetMode] as DffControlMode
      : DEFAULT_DFF_SETTINGS.resetMode,
    resetActiveLevel: isDffActiveLevel(instance.values[DFF_VALUE_KEYS.resetActiveLevel])
      ? instance.values[DFF_VALUE_KEYS.resetActiveLevel] as DffActiveLevel
      : DEFAULT_DFF_SETTINGS.resetActiveLevel
  };
}

export function dffPins(settings: DffSettings): PinDef[] {
  const pins: PinDef[] = [
    { id: "d", label: "D", role: "in", x: -60, y: -20 },
    { id: "clk", label: "CLK", role: "clk", x: -60, y: 20 },
    { id: "q", label: "Q", role: "out", x: 60, y: -20 },
    { id: "qbar", label: "Q bar", role: "outN", x: 60, y: 20 }
  ];
  if (settings.setMode !== "none") {
    pins.push(settings.setMode === "synchronous"
      ? { id: "set", label: "SET", role: "set", x: -60, y: -40 }
      : { id: "set", label: "SET", role: "set", x: 0, y: -60 });
  }
  if (settings.resetMode !== "none") {
    pins.push(settings.resetMode === "synchronous"
      ? { id: "reset", label: "RST", role: "reset", x: -60, y: 40 }
      : { id: "reset", label: "RST", role: "reset", x: 0, y: 60 });
  }
  return pins;
}

export function setDffSetting(
  instance: ComponentInstance,
  property: DffSettingProperty,
  value: string
) {
  if (instance.type !== "dff" || !isDffSettingValue(property, value)) {
    return { kind: "noop", reason: "unsupported" } as const;
  }
  const current = dffSettings(instance)[property];
  if (current === value) return { kind: "noop", reason: "unchanged" } as const;
  const key = DFF_VALUE_KEYS[property];
  if (value === DEFAULT_DFF_SETTINGS[property]) delete instance.values[key];
  else instance.values[key] = value;
  return { kind: "changed", property, value } as const;
}

export function isDffSettingValue(
  property: DffSettingProperty,
  value: unknown
): value is DffSettings[DffSettingProperty] {
  if (property === "clockEdge") return isDffClockEdge(value);
  if (property === "setMode" || property === "resetMode") return isDffControlMode(value);
  return isDffActiveLevel(value);
}
