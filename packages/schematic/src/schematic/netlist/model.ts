import type { ComponentType } from "../types";
import type { VoltageSourceType } from "../voltageSourceModel";

export type NetlistFormat = "spice" | "spectre";
export type NetlistSeverity = "error" | "warning" | "info";

export interface NetlistDiagnostic {
  code: string;
  severity: NetlistSeverity;
  message: string;
  componentId?: string;
  pinId?: string;
  netName?: string;
}

export interface NetlistInstance {
  componentId: string;
  ref: string;
  master: string;
  type: ComponentType;
  kind: "primitive" | "mos" | "source" | "probe";
  nodes: string[];
  params: Record<string, string>;
  sourceKind?: VoltageSourceType | "dc";
}

export interface NetlistDesign {
  name: string;
  instances: NetlistInstance[];
  diagnostics: NetlistDiagnostic[];
}

export interface NetlistBuildOptions {
  process: "sky130";
}

export interface MosProcessDevice {
  master: string;
  terminals: readonly string[];
  params: Readonly<Record<string, string>>;
  required: readonly string[];
}

export interface ProcessProfile {
  id: "sky130";
  label: string;
  devices: { nmos: MosProcessDevice; pmos: MosProcessDevice };
}

export function hasNetlistErrors(design: NetlistDesign) {
  return design.diagnostics.some(diagnostic => diagnostic.severity === "error");
}
