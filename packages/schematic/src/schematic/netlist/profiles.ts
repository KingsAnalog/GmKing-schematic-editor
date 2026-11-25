export const PROCESS_IDS = ["sky130", "gf180mcu", "ihp-sg13g2", "custom"] as const;
export type ProcessId = (typeof PROCESS_IDS)[number];
export const DEFAULT_NETLIST_PROCESS: ProcessId = "sky130";
export const NETLIST_MODEL_VALUE_KEY = "netlist:model";
export const MAX_NETLIST_MODEL_LENGTH = 256;
export type DeviceKind = "nmos" | "pmos" | "npn" | "pnp" | "resistor" | "capacitor" | "inductor";

export interface NetlistDeviceConfig {
  process: ProcessId;
  devices: Record<DeviceKind, string>;
}

export interface ProcessProfile {
  id: ProcessId;
  label: string;
  options: Record<DeviceKind, readonly string[]>;
  defaults: Record<DeviceKind, string>;
}

export const DEVICE_KINDS: readonly DeviceKind[] = [
  "nmos", "pmos", "npn", "pnp", "resistor", "capacitor", "inductor"
];

export const DEVICE_LABELS: Record<DeviceKind, string> = {
  nmos: "NMOS",
  pmos: "PMOS",
  npn: "NPN",
  pnp: "PNP",
  resistor: "R",
  capacitor: "C",
  inductor: "L"
};

const DEFAULT_NAMES: Record<DeviceKind, string> = {
  nmos: "NMOS",
  pmos: "PMOS",
  npn: "NPN",
  pnp: "PNP",
  resistor: "R",
  capacitor: "C",
  inductor: "L"
};

export const PROCESS_PROFILES: Record<ProcessId, ProcessProfile> = {
  sky130: {
    id: "sky130",
    label: "SkyWater SKY130",
    options: {
      nmos: [
        "sky130_fd_pr__nfet_01v8",
        "sky130_fd_pr__nfet_01v8_lvt",
        "sky130_fd_pr__nfet_03v3_nvt",
        "sky130_fd_pr__nfet_05v0_nvt",
        "sky130_fd_pr__nfet_20v0_nvt"
      ],
      pmos: [
        "sky130_fd_pr__pfet_01v8",
        "sky130_fd_pr__pfet_01v8_lvt",
        "sky130_fd_pr__pfet_01v8_hvt",
        "sky130_fd_pr__pfet_05v0_nvt"
      ],
      npn: ["sky130_fd_pr__npn_05v5_W0p68L0p68", "sky130_fd_pr__npn_05v5_W1p00L1p00"],
      pnp: ["sky130_fd_pr__pnp_05v5_W0p68L0p68", "sky130_fd_pr__pnp_05v5_W1p00L1p00"],
      resistor: [
        "R",
        "sky130_fd_pr__res_generic_po",
        "sky130_fd_pr__res_generic_nwell",
        "sky130_fd_pr__res_generic_nd",
        "sky130_fd_pr__res_generic_pd",
        "sky130_fd_pr__res_high_po",
        "sky130_fd_pr__res_xhigh_po"
      ],
      capacitor: [
        "C",
        "sky130_fd_pr__cap_mim_m3_1",
        "sky130_fd_pr__cap_mim_m3_2",
        "sky130_fd_pr__cap_mim_m4_1",
        "sky130_fd_pr__cap_var_lvt"
      ],
      inductor: ["L", "sky130_fd_pr__ind_03_90", "sky130_fd_pr__ind_04_90"]
    },
    defaults: {
      nmos: "sky130_fd_pr__nfet_01v8",
      pmos: "sky130_fd_pr__pfet_01v8",
      npn: "sky130_fd_pr__npn_05v5_W0p68L0p68",
      pnp: "sky130_fd_pr__pnp_05v5_W0p68L0p68",
      resistor: "R",
      capacitor: "C",
      inductor: "L"
    }
  },
  gf180mcu: {
    id: "gf180mcu",
    label: "GlobalFoundries GF180MCU",
    options: {
      nmos: [
        "gf180mcu_fd_pr__nfet_03v3_nvt",
        "gf180mcu_fd_pr__nfet_05v0_nvt",
        "gf180mcu_fd_pr__nfet_06v0_nvt",
        "gf180mcu_fd_pr__nfet_03v3_nvt_dss"
      ],
      pmos: [
        "gf180mcu_fd_pr__pfet_03v3_nvt",
        "gf180mcu_fd_pr__pfet_05v0_nvt",
        "gf180mcu_fd_pr__pfet_06v0_nvt",
        "gf180mcu_fd_pr__pfet_03v3_nvt_dss"
      ],
      npn: ["gf180mcu_fd_pr__npn_10p00x10p00", "gf180mcu_fd_pr__npn_05p00x05p00"],
      pnp: ["gf180mcu_fd_pr__pnp_10p00x10p00", "gf180mcu_fd_pr__pnp_05p00x05p00"],
      resistor: [
        "R",
        "gf180mcu_fd_pr__res_generic_po",
        "gf180mcu_fd_pr__res_generic_nwell",
        "gf180mcu_fd_pr__res_generic_nd",
        "gf180mcu_fd_pr__res_generic_pd",
        "gf180mcu_fd_pr__res_high_po"
      ],
      capacitor: [
        "C",
        "gf180mcu_fd_pr__cap_mim_1f0_m4m5_noshield",
        "gf180mcu_fd_pr__cap_mim_2f0_m4m5_noshield",
        "gf180mcu_fd_pr__cap_moscap_3v3"
      ],
      inductor: ["L"]
    },
    defaults: {
      nmos: "gf180mcu_fd_pr__nfet_03v3_nvt",
      pmos: "gf180mcu_fd_pr__pfet_03v3_nvt",
      npn: "gf180mcu_fd_pr__npn_10p00x10p00",
      pnp: "gf180mcu_fd_pr__pnp_10p00x10p00",
      resistor: "R",
      capacitor: "C",
      inductor: "L"
    }
  },
  "ihp-sg13g2": {
    id: "ihp-sg13g2",
    label: "IHP SG13G2",
    options: {
      nmos: ["sg13_lv_nmos", "sg13_hv_nmos"],
      pmos: ["sg13_lv_pmos", "sg13_hv_pmos"],
      npn: ["npn13G2", "npn13G2L", "npn13G2V"],
      pnp: ["pnp13G2"],
      resistor: ["R", "rppd", "rnnd", "rhigh", "rlow"],
      capacitor: ["C", "cap_cmim", "cap_rfcmim"],
      inductor: ["L", "ind_std", "ind_thick"]
    },
    defaults: {
      nmos: "sg13_lv_nmos",
      pmos: "sg13_lv_pmos",
      npn: "npn13G2",
      pnp: "pnp13G2",
      resistor: "R",
      capacitor: "C",
      inductor: "L"
    }
  },
  custom: {
    id: "custom",
    label: "Custom",
    options: {
      nmos: ["NMOS"],
      pmos: ["PMOS"],
      npn: ["NPN"],
      pnp: ["PNP"],
      resistor: ["R"],
      capacitor: ["C"],
      inductor: ["L"]
    },
    defaults: { ...DEFAULT_NAMES }
  }
};

export function processProfile(process: ProcessId): ProcessProfile {
  return PROCESS_PROFILES[process] ?? PROCESS_PROFILES[DEFAULT_NETLIST_PROCESS];
}

export function isProcessId(value: string): value is ProcessId {
  return (PROCESS_IDS as readonly string[]).includes(value);
}

export function isDeviceKind(type: string): type is DeviceKind {
  return (DEVICE_KINDS as readonly string[]).includes(type);
}

export function isNetlistModelText(value: string) {
  return value.length <= MAX_NETLIST_MODEL_LENGTH && !/[\r\n]/.test(value);
}

export function defaultDeviceConfig(process: ProcessId): NetlistDeviceConfig {
  const profile = processProfile(process);
  return {
    process,
    devices: DEVICE_KINDS.reduce((result, kind) => {
      result[kind] = profile.defaults[kind] || DEFAULT_NAMES[kind];
      return result;
    }, {} as Record<DeviceKind, string>)
  };
}

export function normalizeDeviceConfig(
  config: Partial<NetlistDeviceConfig> | null | undefined
): NetlistDeviceConfig {
  const process = config?.process && isProcessId(config.process) ? config.process : DEFAULT_NETLIST_PROCESS;
  const defaults = defaultDeviceConfig(process);
  const devices = { ...defaults.devices };
  DEVICE_KINDS.forEach((kind) => {
    const selected = config?.devices?.[kind]?.trim();
    if (selected || (process === "custom" && selected === "")) devices[kind] = selected;
  });
  return { process, devices };
}

export function deviceOptions(config: NetlistDeviceConfig, kind: DeviceKind) {
  const profile = processProfile(config.process);
  if (config.process === "custom") return [config.devices[kind]];
  return profile.options[kind];
}
