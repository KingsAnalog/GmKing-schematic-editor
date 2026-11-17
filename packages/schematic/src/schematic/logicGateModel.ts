import type {
  ComponentType,
  ComponentVariantDef,
  PinDef,
  TerminalClass
} from "./types";

export const LOGIC_GATE_TYPES = ["and", "nand", "or", "nor", "xor", "xnor"] as const;
export type LogicGateType = (typeof LOGIC_GATE_TYPES)[number];

export const LOGIC_GATE_INPUT_COUNTS = [2, 3, 4] as const;
export type LogicGateInputCount = (typeof LOGIC_GATE_INPUT_COUNTS)[number];

export const DEFAULT_LOGIC_GATE_INPUT_COUNT: LogicGateInputCount = 2;
export const LOGIC_GATE_INPUT_PIN_X = -40;
export const LOGIC_GATE_OUTPUT_PIN_X = 60;
export const LOGIC_GATE_WIDTH = 120;

export function isLogicGateType(type: ComponentType): type is LogicGateType {
  return (LOGIC_GATE_TYPES as readonly ComponentType[]).includes(type);
}

export function logicGateInputOffsets(inputCount: LogicGateInputCount) {
  if (inputCount === 2) return [-20, 20] as const;
  if (inputCount === 3) return [-20, 0, 20] as const;
  return [-40, -20, 20, 40] as const;
}

export function logicGateSize(inputCount: LogicGateInputCount) {
  return {
    width: LOGIC_GATE_WIDTH,
    height: inputCount === 4 ? 120 : 80
  };
}

export function logicGatePins(inputCount: LogicGateInputCount): PinDef[] {
  const labels = ["A", "B", "C", "D"];
  return [
    ...logicGateInputOffsets(inputCount).map((y, index): PinDef => ({
      id: `in${index + 1}`,
      label: labels[index],
      role: "in",
      x: LOGIC_GATE_INPUT_PIN_X,
      y
    })),
    { id: "out", label: "Y", role: "out", x: LOGIC_GATE_OUTPUT_PIN_X, y: 0 }
  ];
}

export function logicGateVariantId(inputCount: LogicGateInputCount) {
  return `${inputCount}-input`;
}

export function logicGateSymbolId(type: LogicGateType, inputCount: LogicGateInputCount) {
  return `${type}-${inputCount}`;
}

export function logicGateVariants(type: LogicGateType): ComponentVariantDef[] {
  return LOGIC_GATE_INPUT_COUNTS.map((inputCount) => ({
    id: logicGateVariantId(inputCount),
    label: String(inputCount),
    terminalClass: logicGateTerminalClass(inputCount),
    size: logicGateSize(inputCount),
    pins: logicGatePins(inputCount),
    symbol: logicGateSymbolId(type, inputCount)
  }));
}

export function parseLogicGateSymbol(symbol: string): {
  type: LogicGateType;
  inputCount: LogicGateInputCount;
} | null {
  const match = /^(and|nand|or|nor|xor|xnor)-(2|3|4)$/.exec(symbol);
  if (!match) return null;
  return {
    type: match[1] as LogicGateType,
    inputCount: Number(match[2]) as LogicGateInputCount
  };
}

function logicGateTerminalClass(inputCount: LogicGateInputCount): TerminalClass {
  if (inputCount === 2) return "threeTerminal";
  if (inputCount === 3) return "fourTerminal";
  return "fiveTerminal";
}
