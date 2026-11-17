import type { ComponentInstance } from "./types";

export const VOLTAGE_SOURCE_TYPES = ["dc", "sine", "pulse", "exp", "bit", "pwl", "ramp", "noise"] as const;
export type VoltageSourceType = typeof VOLTAGE_SOURCE_TYPES[number];
export interface VoltageSourceField {
  key: string;
  label: string;
  type?: "number";
  options?: readonly string[];
  min?: number;
  max?: number;
}
export const DEFAULT_PWL_PAIRS = 2;
export const MAX_PWL_PAIRS = 1024;

const field = (type: VoltageSourceType, name: string, label: string): VoltageSourceField =>
  ({ key: `vsource:${type}:${name}`, label });
const FIELDS: Record<VoltageSourceType, readonly VoltageSourceField[]> = {
  dc: [{ key: "main", label: "DC voltage" }],
  noise: [{ key: "main", label: "Amplitude" }],
  sine: [
    field("sine", "frequencyName", "Frequency name 1"),
    field("sine", "frequency", "Frequency 1"),
    field("sine", "amplitude", "Amplitude 1 (Vpk)"),
    field("sine", "phase", "Phase for Sinusoid 1"),
    field("sine", "dcLevel", "Sine DC level"),
    field("sine", "delay", "Delay time")
  ],
  pulse: [
    field("pulse", "frequencyName", "Frequency name 1"),
    field("pulse", "delay", "Delay time"),
    field("pulse", "zeroValue", "Zero value"),
    field("pulse", "oneValue", "One value"),
    field("pulse", "period", "Period of waveform"),
    field("pulse", "riseTime", "Rise time"),
    field("pulse", "fallTime", "Fall time"),
    { ...field("pulse", "edgeType", "Type of rising & falling edge"), options: ["", "linear", "halfsine"] },
    field("pulse", "pulseWidth", "Pulse width")
  ],
  exp: [
    field("exp", "zeroValue", "Zero value"),
    field("exp", "oneValue", "One value"),
    field("exp", "riseStart", "Rise time start"),
    field("exp", "riseConstant", "Rise time constant"),
    field("exp", "fallStart", "Fall time start"),
    field("exp", "fallConstant", "Fall time constant"),
    field("exp", "period", "Exp period")
  ],
  bit: [
    field("bit", "delay", "Delay time"),
    field("bit", "zeroValue", "Zero value"),
    field("bit", "oneValue", "One value"),
    field("bit", "period", "Period of waveform"),
    field("bit", "riseTime", "Rise time"),
    field("bit", "fallTime", "Fall time"),
    field("bit", "riseDelay", "Rise delay"),
    field("bit", "fallDelay", "Fall delay")
  ],
  ramp: [
    { ...field("ramp", "direction", "Direction"), options: ["up", "down"] },
    field("ramp", "lowValue", "Low voltage"),
    field("ramp", "highValue", "High voltage"),
    field("ramp", "delay", "Delay time"),
    field("ramp", "duration", "Ramp duration")
  ],
  pwl: [
    { ...field("pwl", "pairs", "Number of PWL/Time pairs"), type: "number", min: 1, max: MAX_PWL_PAIRS },
    field("pwl", "delay", "Delay time"),
    field("pwl", "dcOffset", "DC offset")
  ]
};

export function voltageSourceType(instance: ComponentInstance) { return instance.variantId ?? "dc"; }
export function isVoltageSourceType(type: string): type is VoltageSourceType {
  return (VOLTAGE_SOURCE_TYPES as readonly string[]).includes(type);
}
export function voltageSourcePairCount(instance: ComponentInstance) {
  const count = Number(instance.values["vsource:pwl:pairs"] ?? DEFAULT_PWL_PAIRS);
  return Number.isInteger(count) && count >= 1 && count <= MAX_PWL_PAIRS ? count : DEFAULT_PWL_PAIRS;
}

/** Zero pairs is used only to project a selection with mixed pair counts. */
export function voltageSourceFields(type: string, pairs = DEFAULT_PWL_PAIRS): readonly VoltageSourceField[] {
  if (!isVoltageSourceType(type)) return [];
  if (type !== "pwl") return FIELDS[type];
  const count = Math.max(0, Math.min(MAX_PWL_PAIRS, Math.trunc(pairs) || 0));
  return [
    FIELDS.pwl[0],
    ...Array.from({ length: count }, (_, index) => [
      field("pwl", `time${index + 1}`, `Time ${index + 1}`),
      field("pwl", `voltage${index + 1}`, `Voltage ${index + 1}`)
    ]).flat(),
    ...FIELDS.pwl.slice(1)
  ];
}

export function voltageSourceFieldValue(instance: ComponentInstance, key: string): string {
  if (key === "vsource:ramp:direction") return instance.values[key] ?? "up";
  if (key === "vsource:pwl:pairs") return String(voltageSourcePairCount(instance));
  return instance.values[key] ?? "";
}

/** Text expressions and engineering suffixes remain strings; only structural fields are constrained. */
export function validVoltageSourceFieldValue(key: string, value: string) {
  if (key === "main") return true;
  const definition = Object.values(FIELDS).flat().find(entry => entry.key === key);
  if (!definition) {
    const pair = /^vsource:pwl:(?:time|voltage)([1-9][0-9]*)$/.exec(key);
    return !!pair && Number(pair[1]) <= MAX_PWL_PAIRS;
  }
  if (definition.options) return definition.options.includes(value);
  if (definition.type === "number") {
    return value === "" || (/^[0-9]+$/.test(value) && Number(value) >= 1 && Number(value) <= MAX_PWL_PAIRS);
  }
  return true;
}

export function setVoltageSourceField(instance: ComponentInstance, key: string, value: string) {
  if (instance.type !== "voltageSource"
    || typeof key !== "string" || typeof value !== "string"
    || !voltageSourceFields(voltageSourceType(instance), voltageSourcePairCount(instance)).some(entry => entry.key === key)
    || !validVoltageSourceFieldValue(key, value.trim())) {
    return { kind: "noop", reason: "invalid-value" } as const;
  }
  let next = value.trim();
  if (key === "vsource:pwl:pairs") next = String(next === "" ? DEFAULT_PWL_PAIRS : Number(next));
  if (voltageSourceFieldValue(instance, key) === next) return { kind: "noop", reason: "unchanged" } as const;
  // Preserve values of inactive types and hidden PWL pairs when switching type or reducing the count.
  if (next) instance.values[key] = next;
  else delete instance.values[key];
  return { kind: "changed" } as const;
}

export function voltageSourceDisplayValue(instance: ComponentInstance) {
  const type = voltageSourceType(instance);
  const key = type === "sine" ? "vsource:sine:amplitude"
    : type === "pulse" || type === "exp" || type === "bit" ? `vsource:${type}:oneValue`
    : type === "pwl" ? "vsource:pwl:dcOffset"
    : type === "ramp" ? `vsource:ramp:${voltageSourceFieldValue(instance, "vsource:ramp:direction") === "down" ? "lowValue" : "highValue"}` : "main";
  return voltageSourceFieldValue(instance, key);
}
