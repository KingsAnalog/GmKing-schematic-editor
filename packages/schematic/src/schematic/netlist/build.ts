import { extractNetlist } from "../netlist";
import { resolveSchematicNets, type NetResolution } from "../netResolution";
import { parseEngineeringValue } from "../../shared/engineeringUnits";
import {
  isVoltageSourceType,
  voltageSourcePairCount,
  voltageSourceType,
  type VoltageSourceType
} from "../voltageSourceModel";
import type {
  ComponentInstance,
  ComponentType,
  ExtractedNetlist,
  SchematicDocument
} from "../types";
import type {
  NetlistBuildOptions,
  NetlistDesign,
  NetlistDiagnostic,
  NetlistInstance,
  NetlistParameter
} from "./model";
import {
  defaultDeviceConfig,
  normalizeDeviceConfig,
  type DeviceKind,
  type NetlistDeviceConfig
} from "./profiles";

const SKIP_TYPES = new Set<ComponentType>(["gnd", "vdd", "annotation", "rectangle", "triangle", "polyline", "arc", "circle", "polygon"]);
const PASSIVE_TYPES = new Set<ComponentType>(["resistor", "capacitor", "inductor"]);
const SOURCE_TYPES = new Set<ComponentType>(["voltageSource", "currentSource", "battery"]);
const MOS_TYPES = new Set<ComponentType>(["nmos", "pmos"]);
const BJT_TYPES = new Set<ComponentType>(["npn", "pnp"]);
const SUPPORTED_TYPES = new Set<ComponentType>([
  ...SKIP_TYPES,
  ...PASSIVE_TYPES,
  ...SOURCE_TYPES,
  ...MOS_TYPES,
  ...BJT_TYPES,
  "iprobe"
]);

const REF_PREFIX: Partial<Record<ComponentType, string>> = {
  resistor: "R",
  capacitor: "C",
  inductor: "L",
  voltageSource: "V",
  battery: "V",
  currentSource: "I",
  npn: "Q",
  pnp: "Q"
};

const PASSIVE_DEFAULT: Record<"resistor" | "capacitor" | "inductor", string> = {
  resistor: "1k",
  capacitor: "1p",
  inductor: "1n"
};

const PASSIVE_PARAM: Record<"resistor" | "capacitor" | "inductor", string> = {
  resistor: "r",
  capacitor: "c",
  inductor: "l"
};

const PASSIVE_MASTER: Record<"resistor" | "capacitor" | "inductor", string> = {
  resistor: "R",
  capacitor: "C",
  inductor: "L"
};

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function buildStructuralNetlist(
  document: SchematicDocument,
  options: NetlistBuildOptions = {}
): NetlistDesign {
  const config: NetlistDeviceConfig = normalizeDeviceConfig(options.config);
  const resolution = resolveSchematicNets(document);
  const extracted = extractNetlist(document, resolution);
  const diagnostics: NetlistDiagnostic[] = [];
  const instances: NetlistInstance[] = [];
  const refs = new Set<string>();
  const parameters: NetlistParameter[] = [];
  const parameterByLower = new Map<string, NetlistParameter>();

  const report = (
    code: string,
    severity: NetlistDiagnostic["severity"],
    message: string,
    componentId?: string,
    pinId?: string,
    netName?: string
  ) => {
    diagnostics.push({ code, severity, message, componentId, pinId, netName });
  };

  const portInfo = collectPorts(document, extracted, resolution);
  portInfo.invalid.forEach((name) => {
    report("INVALID_PORT_NAME", "error", `Port name "${name}" is not a valid SPICE identifier.`);
  });
  const { names: canonicalNames, nextName } = canonicalNetNames(
    extracted,
    resolution,
    portInfo.ports,
    portInfo.hasGnd ? "GND" : null,
    portInfo.hasVdd ? "VDD" : null
  );
  const canonical = (netName: string) => canonicalNames.get(netName) ?? netName;
  const syntheticNets = new Map<string, string>();
  const netForPin = (entry: ExtractedNetlist["components"][number], pinId: string) => {
    const internal = entry.pins[pinId] ?? "";
    if (internal) return canonical(internal);
    const key = `${entry.instance.id}:${pinId}`;
    let netName = syntheticNets.get(key);
    if (!netName) {
      netName = nextName();
      syntheticNets.set(key, netName);
    }
    return netName;
  };

  const addParameter = (rawName: string, value: string, componentId?: string) => {
    let name = rawName.trim();
    if (!IDENTIFIER.test(name)) {
      name = name.replace(/[^A-Za-z0-9_]/g, "_");
      if (!/^[A-Za-z_]/.test(name)) name = `p_${name}`;
    }
    const existing = parameterByLower.get(name.toLowerCase());
    if (existing) {
      if (existing.value !== value) {
        report(
          "PARAM_CONFLICT",
          "warning",
          `Parameter ${existing.name} keeps its first default ${existing.value}; ${value} was ignored.`,
          componentId
        );
      }
      return existing.name;
    }
    const parameter = { name, value };
    parameters.push(parameter);
    parameterByLower.set(name.toLowerCase(), parameter);
    return name;
  };

  const expression = (
    raw: string,
    fallbackName: string,
    fallbackValue: string,
    label: string,
    componentId: string,
    options: { positive?: boolean; silentEmpty?: boolean } = {}
  ) => {
    const value = raw.trim();
    if (value) {
      const parsed = parseEngineeringValue(value);
      if (parsed !== null && (!options.positive || parsed > 0)) return value;
      if (IDENTIFIER.test(value)) {
        return addParameter(value, fallbackValue, componentId);
      }
      report(
        "INVALID_VALUE",
        "error",
        `${label} "${value}" is not numeric; using parameter ${fallbackName}=${fallbackValue}.`,
        componentId
      );
    } else if (!options.silentEmpty) {
      report(
        "DEFAULT_PARAM",
        "warning",
        `${label} is empty; using parameter ${fallbackName}=${fallbackValue}.`,
        componentId
      );
    }
    return addParameter(fallbackName, fallbackValue, componentId);
  };

  for (const entry of extracted.components) {
    const { instance } = entry;
    if (instance.temporarilyDeleted || SKIP_TYPES.has(instance.type)) continue;
    const net = (pinId: string) => netForPin(entry, pinId);

    if (!IDENTIFIER.test(instance.ref)) {
      report("INVALID_REF", "error", `${instance.ref || "Instance"} has an invalid reference designator.`, instance.id);
      continue;
    }
    if (refs.has(instance.ref)) {
      report("DUPLICATE_REF", "error", `Reference ${instance.ref} is used more than once.`, instance.id);
      continue;
    }
    refs.add(instance.ref);

    if (!SUPPORTED_TYPES.has(instance.type)) {
      report(
        "UNSUPPORTED_DEVICE",
        "error",
        `${instance.ref} (${instance.type}) is not supported by the structural netlist.`,
        instance.id
      );
      continue;
    }

    if (!PASSIVE_TYPES.has(instance.type)
      && !SOURCE_TYPES.has(instance.type)
      && !MOS_TYPES.has(instance.type)
      && !BJT_TYPES.has(instance.type)
      && instance.type !== "iprobe") {
      continue;
    }

    const expectedPrefix = REF_PREFIX[instance.type];
    if (expectedPrefix && !instance.ref.toUpperCase().startsWith(expectedPrefix)) {
      report(
        "INVALID_REF_PREFIX",
        "error",
        `${instance.ref} must start with ${expectedPrefix} for ${instance.type}.`,
        instance.id
      );
      continue;
    }

    const pinNet = (pinId: string) => {
      const netName = net(pinId);
      const internal = entry.pins[pinId] ?? "";
      if (!internal) {
        report("FLOATING_PIN", "error", `${instance.ref}.${pinId} is not connected; using ${netName}.`, instance.id, pinId, netName);
      } else if (netName !== "0" && netName !== "GND" && !IDENTIFIER.test(netName)) {
        report(
          "INVALID_NET_NAME",
          "error",
          `Net "${netName}" on ${instance.ref}.${pinId} is not a valid SPICE identifier.`,
          instance.id,
          pinId,
          netName
        );
      }
      return netName;
    };

    if (PASSIVE_TYPES.has(instance.type)) {
      const passive = instance.type as "resistor" | "capacitor" | "inductor";
      const configKey: DeviceKind = passive;
      const selectedMaster = config.devices[configKey]?.trim() || PASSIVE_MASTER[passive];
      const value = expression(
        instance.values.main ?? "",
        `${instance.ref}_VALUE`,
        PASSIVE_DEFAULT[passive],
        `${instance.ref} value`,
        instance.id
      );
      const nodes = [pinNet("p"), pinNet("n")];
      if (selectedMaster.toUpperCase() === PASSIVE_MASTER[passive]) {
        instances.push({
          componentId: instance.id,
          ref: instance.ref,
          master: PASSIVE_MASTER[passive],
          type: instance.type,
          kind: "primitive",
          nodes,
          params: { value }
        });
      } else {
        instances.push({
          componentId: instance.id,
          ref: instance.ref,
          master: selectedMaster,
          type: instance.type,
          kind: "modeledPassive",
          nodes,
          params: { [PASSIVE_PARAM[passive]]: value }
        });
      }
      continue;
    }

    if (instance.type === "iprobe") {
      instances.push({
        componentId: instance.id,
        ref: instance.ref.toUpperCase().startsWith("V") ? instance.ref : `V${instance.ref}`,
        master: "vsource",
        type: "iprobe",
        kind: "probe",
        nodes: [pinNet("p"), pinNet("n")],
        params: { dc: "0" }
      });
      continue;
    }

    if (MOS_TYPES.has(instance.type)) {
      const mosType = instance.type === "pmos" ? "pmos" : "nmos";
      const master = config.devices[mosType]?.trim()
        || defaultDeviceConfig(config.process).devices[mosType];
      const bulkPinExists = entry.def.pins.some(pin => pin.id === "b");
      let bulk: string;
      if (!bulkPinExists) {
        bulk = net("s");
        report(
          "BULK_DEFAULTED",
          "warning",
          `${instance.ref} has no bulk pin; bulk follows source ${bulk}.`,
          instance.id,
          "b",
          bulk
        );
      } else {
        bulk = pinNet("b");
        if (!entry.pins.b) {
          report(
            "BULK_UNCONNECTED",
            "error",
            `${instance.ref} bulk is floating; using ${bulk}.`,
            instance.id,
            "b",
            bulk
          );
        }
      }
      const w = expression(
        instance.values["mos:w"] ?? "",
        `${instance.ref}_W`,
        "1u",
        `${instance.ref} W`,
        instance.id,
        { positive: true }
      );
      const l = expression(
        instance.values["mos:l"] ?? "",
        `${instance.ref}_L`,
        "0.15u",
        `${instance.ref} L`,
        instance.id,
        { positive: true }
      );
      const m = instance.values["mos:m"]?.trim() || "1";
      const nf = instance.values["mos:nf"]?.trim() || "1";
      if (!positiveInteger(m)) {
        report("INVALID_VALUE", "error", `${instance.ref} M must be a positive integer; using 1.`, instance.id);
      }
      if (!positiveInteger(nf)) {
        report("INVALID_VALUE", "error", `${instance.ref} NF must be a positive integer; using 1.`, instance.id);
      }
      const params: Record<string, string> = { w, l };
      if (positiveInteger(m) && m !== "1") params.m = m;
      if (positiveInteger(nf) && nf !== "1") params.nf = nf;
      instances.push({
        componentId: instance.id,
        ref: instance.ref,
        master,
        type: instance.type,
        kind: "mos",
        nodes: [pinNet("d"), pinNet("g"), pinNet("s"), bulk],
        params
      });
      continue;
    }

    if (BJT_TYPES.has(instance.type)) {
      const bjtType = instance.type === "pnp" ? "pnp" : "npn";
      const master = config.devices[bjtType]?.trim()
        || defaultDeviceConfig(config.process).devices[bjtType];
      instances.push({
        componentId: instance.id,
        ref: instance.ref,
        master,
        type: instance.type,
        kind: "bjt",
        nodes: [pinNet("c"), pinNet("b"), pinNet("e")],
        params: {}
      });
      continue;
    }

    if (SOURCE_TYPES.has(instance.type)) {
      const kind = instance.type === "currentSource" || instance.type === "battery"
        ? "dc"
        : voltageSourceType(instance);
      if (!isVoltageSourceType(kind) || !["dc", "sine", "pulse", "exp", "pwl"].includes(kind)) {
        report("UNSUPPORTED_SOURCE", "error", `${instance.ref} uses an unsupported source type "${kind}".`, instance.id);
        continue;
      }
      const source = sourceParameters(instance, kind, expression);
      if (!source) continue;
      const isCurrent = instance.type === "currentSource";
      instances.push({
        componentId: instance.id,
        ref: instance.ref,
        master: isCurrent ? "isource" : "vsource",
        type: instance.type,
        kind: "source",
        nodes: [pinNet("p"), pinNet("n")],
        params: source.params,
        sourceKind: source.kind
      });
      continue;
    }
  }

  resolution.nets.forEach((net) => {
    const netName = canonical(net.name);
    if (netName === "0" || netName === "GND" || net.pins.length !== 1) return;
    const pin = net.pins[0];
    if (SKIP_TYPES.has(pin.componentType) || !SUPPORTED_TYPES.has(pin.componentType)) return;
    if (net.wireIds.length === 0) {
      report(
        "FLOATING_PIN",
        "error",
        `${pin.componentId}.${pin.pinId} is not connected; using ${netName}.`,
        pin.componentId,
        pin.pinId,
        netName
      );
      return;
    }
    report("SINGLE_PIN_NET", "warning", `Net ${netName} has only one pin.`, undefined, undefined, netName);
  });

  return {
    name: "schematic",
    ports: portInfo.ports,
    parameters,
    instances,
    diagnostics
  };
}

function sourceParameters(
  instance: ComponentInstance,
  kind: VoltageSourceType,
  expression: (
    raw: string,
    fallbackName: string,
    fallbackValue: string,
    label: string,
    componentId: string,
    options?: { positive?: boolean; silentEmpty?: boolean }
  ) => string
): { kind: VoltageSourceType; params: Record<string, string> } | null {
  const value = (key: string) => instance.values[key]?.trim() ?? "";
  const fallback = (suffix: string) => `${instance.ref}_${suffix}`;
  if (kind === "dc") {
    return {
      kind,
      params: {
        dc: expression(value("main"), fallback("DC"), "1", `${instance.ref} DC value`, instance.id)
      }
    };
  }
  if (kind === "sine") {
    return {
      kind,
      params: {
        vo: value("vsource:sine:dcLevel") || "0",
        va: expression(value("vsource:sine:amplitude"), fallback("VA"), "1", `${instance.ref} sine amplitude`, instance.id),
        freq: expression(value("vsource:sine:frequency"), fallback("FREQ"), "1k", `${instance.ref} sine frequency`, instance.id),
        td: value("vsource:sine:delay") || "0",
        theta: "0"
      }
    };
  }
  if (kind === "pulse") {
    return {
      kind,
      params: {
        v1: value("vsource:pulse:zeroValue") || "0",
        v2: value("vsource:pulse:oneValue") || "1",
        td: value("vsource:pulse:delay") || "0",
        tr: value("vsource:pulse:riseTime") || "0",
        tf: value("vsource:pulse:fallTime") || "0",
        pw: value("vsource:pulse:pulseWidth") || "0",
        per: value("vsource:pulse:period") || "1u"
      }
    };
  }
  if (kind === "exp") {
    return {
      kind,
      params: {
        v1: value("vsource:exp:zeroValue") || "0",
        v2: value("vsource:exp:oneValue") || "1",
        td1: value("vsource:exp:riseStart") || "0",
        tau1: value("vsource:exp:riseConstant") || "1n",
        td2: value("vsource:exp:fallStart") || "0",
        tau2: value("vsource:exp:fallConstant") || "1n"
      }
    };
  }
  if (kind === "pwl") {
    const pairs = voltageSourcePairCount(instance);
    const points: string[] = [];
    for (let index = 1; index <= pairs; index += 1) {
      points.push(value(`vsource:pwl:time${index}`) || String(index - 1));
      points.push(value(`vsource:pwl:voltage${index}`) || "0");
    }
    return { kind, params: { pwl: points.join(" ") } };
  }
  return null;
}

function collectPorts(document: SchematicDocument, extracted: ExtractedNetlist, resolution: NetResolution) {
  const ports: string[] = [];
  const invalid: string[] = [];
  const seen = new Set<string>();
  const add = (name: string) => {
    if (!name || name === "0") return;
    if (!IDENTIFIER.test(name)) {
      invalid.push(name);
      return;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    ports.push(name);
  };
  document.netLabels.forEach((label) => {
    if (resolution.labelStates.get(label.id)?.status === "valid") add(label.name ?? "");
  });
  const hasGnd = extracted.components.some(entry => entry.instance.type === "gnd");
  const hasVdd = extracted.components.some(entry => entry.instance.type === "vdd");
  if (hasVdd) add("VDD");
  if (hasGnd) add("GND");
  return { ports, invalid, hasGnd, hasVdd };
}

function canonicalNetNames(
  extracted: ExtractedNetlist,
  resolution: NetResolution,
  ports: readonly string[],
  groundPort: string | null,
  vddPort: string | null
) {
  const names = new Map<string, string>();
  const used = new Set(ports.map(name => name.toLowerCase()));
  const assign = (internal: string, name: string) => {
    if (!internal || names.has(internal)) return;
    names.set(internal, name);
    used.add(name.toLowerCase());
  };
  resolution.nets.forEach((net) => {
    if (groundPort && net.name === "0") assign(net.name, groundPort);
    else if (net.explicit) assign(net.name, net.name);
  });
  extracted.components
    .filter(entry => entry.instance.type === "vdd")
    .forEach(entry => Object.values(entry.pins).forEach(internal => {
      if (vddPort) assign(internal, vddPort);
    }));
  let index = 0;
  const nextName = () => {
    let candidate;
    do {
      candidate = `net${index++}`;
    } while (used.has(candidate.toLowerCase()));
    used.add(candidate.toLowerCase());
    return candidate;
  };
  extracted.components.forEach((entry) => {
    entry.def.pins.forEach((pin) => {
      const internal = entry.pins[pin.id];
      if (internal && !names.has(internal)) assign(internal, nextName());
    });
  });
  resolution.nets.forEach((net) => {
    if (!names.has(net.name)) assign(net.name, nextName());
  });
  return { names, nextName };
}

function positiveInteger(value: string) {
  return /^[1-9][0-9]*$/.test(value);
}
