import type { ComponentType } from "../types";
import type { VoltageSourceType } from "../voltageSourceModel";
import type { NetlistDeviceConfig } from "./profiles";

export type NetlistFormat = "spice" | "spectre";
export type NetlistSeverity = "error" | "warning" | "info";

export interface NetlistDiagnostic {
  code: string;
  severity: NetlistSeverity;
  message: string;
  componentId?: string;
  pinId?: string;
  netName?: string;
  sheetId?: string;
}

export interface NetlistParameter {
  name: string;
  value: string;
}

export interface NetlistInstance {
  componentId: string;
  ref: string;
  master: string;
  type: ComponentType;
  kind: "primitive" | "mos" | "source" | "probe" | "bjt" | "modeledPassive" | "subckt";
  nodes: string[];
  params: Record<string, string>;
  sourceKind?: VoltageSourceType | "dc";
}

export interface NetlistDesign {
  name: string;
  ports: string[];
  parameters: NetlistParameter[];
  instances: NetlistInstance[];
  diagnostics: NetlistDiagnostic[];
  groundPort?: string;
  sheets?: NetlistDesign[];
  globalNets?: string[];
}

export interface NetlistBuildOptions {
  config?: Partial<NetlistDeviceConfig>;
  hierarchy?: boolean;
}

export function hasNetlistErrors(design: NetlistDesign) {
  return design.diagnostics.some(diagnostic => diagnostic.severity === "error");
}
