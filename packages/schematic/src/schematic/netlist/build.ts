import { extractNetlist } from "../netlist";
import { resolveSchematicNets, type NetResolution } from "../netResolution";
import {
  parseEngineeringValue
} from "../../shared/engineeringUnits";
import {
  isVoltageSourceType,
  voltageSourcePairCount,
  voltageSourceType,
  type VoltageSourceType
} from "../voltageSourceModel";
import type { ComponentInstance, ComponentType, ExtractedNetlist, SchematicDocument } from "../types";
import type {
  NetlistDesign,
  NetlistDiagnostic,
  NetlistInstance,
  NetlistBuildOptions
} from "./model";
import { SKY130_PROFILE } from "./sky130";

const SKIP_TYPES = new Set<ComponentType>(["gnd", "vdd", "annotation", "rectangle", "triangle"]);
const PASSIVE_TYPES = new Set<ComponentType>(["resistor", "capacitor", "inductor"]);
const SOURCE_TYPES = new Set<ComponentType>(["voltageSource", "currentSource", "battery"]);
const MOS_TYPES = new Set<ComponentType>(["nmos", "pmos"]);
const SUPPORTED_TYPES = new Set<ComponentType>([
  ...SKIP_TYPES,
  ...PASSIVE_TYPES,
  ...SOURCE_TYPES,
  ...MOS_TYPES,
  "iprobe"
]);

const REF_PREFIX: Partial<Record<ComponentType, string>> = {
  resistor: "R",
  capacitor: "C",
  inductor: "L",
  voltageSource: "V",
  battery: "V",
  currentSource: "I",
  diode: "D",
  npn: "Q",
  pnp: "Q"
};

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function buildStructuralNetlist(
  document: SchematicDocument,
  options: NetlistBuildOptions = { process: "sky130" }
): NetlistDesign {
  void options;
  const resolution = resolveSchematicNets(document);
  const extracted = extractNetlist(document, resolution);
  const diagnostics: NetlistDiagnostic[] = [];
  const instances: NetlistInstance[] = [];
  const refs = new Set<string>();
  const canonicalNames = canonicalNetNames(extracted, resolution);
  const canonical = (netName: string) => canonicalNames.get(netName) ?? netName;

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

  for (const entry of extracted.components) {
    const { instance } = entry;
    if (instance.temporarilyDeleted || SKIP_TYPES.has(instance.type)) continue;
    const net = (pinId: string) => canonical(entry.pins[pinId] ?? "");

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

    const addPinDiagnostics = (pins: readonly string[]) => {
      let failed = false;
      pins.forEach((pinId) => {
        const netName = net(pinId);
        if (!netName) {
          report("FLOATING_PIN", "error", `${instance.ref} pin ${pinId} is not connected.`, instance.id, pinId);
          failed = true;
          return;
        }
        if (netName !== "0" && !IDENTIFIER.test(netName)) {
          report(
            "INVALID_NET_NAME",
            "error",
            `Net "${netName}" on ${instance.ref}.${pinId} is not a valid SPICE identifier.`,
            instance.id,
            pinId,
            netName
          );
          failed = true;
        }
      });
      return !failed;
    };

    if (PASSIVE_TYPES.has(instance.type)) {
      const value = instance.values.main?.trim() ?? "";
      if (!value) {
        report("MISSING_PARAM", "error", `${instance.ref} needs a value.`, instance.id);
        continue;
      }
      if (parseEngineeringValue(value, { baseUnit: instance.type === "resistor" ? "Ω" : undefined }) === null) {
        report("INVALID_VALUE", "error", `${instance.ref} has an unreadable value "${value}".`, instance.id);
        continue;
      }
      if (!addPinDiagnostics(["p", "n"])) continue;
      instances.push({
        componentId: instance.id,
        ref: instance.ref,
        master: instance.type,
        type: instance.type,
        kind: "primitive",
        nodes: [net("p"), net("n")],
        params: { value }
      });
      continue;
    }

    if (instance.type === "iprobe") {
      if (!addPinDiagnostics(["p", "n"])) continue;
      instances.push({
        componentId: instance.id,
        ref: instance.ref.toUpperCase().startsWith("V") ? instance.ref : `V${instance.ref}`,
        master: "vsource",
        type: "iprobe",
        kind: "probe",
        nodes: [net("p"), net("n")],
        params: { dc: "0" }
      });
      continue;
    }

    if (MOS_TYPES.has(instance.type)) {
      const device = instance.type === "nmos" ? SKY130_PROFILE.devices.nmos : SKY130_PROFILE.devices.pmos;
      const pins = ["d", "g", "s", "b"];
      const bulk = net("b");
      if (!bulk) {
        report("BULK_UNCONNECTED", "error", `${instance.ref} bulk terminal is not connected.`, instance.id, "b");
      }
      if (!addPinDiagnostics(pins.filter(pin => pin !== "b"))) continue;
      if (bulk && bulk !== "0" && !IDENTIFIER.test(bulk)) {
        report("INVALID_NET_NAME", "error", `Net "${bulk}" on ${instance.ref}.b is not a valid SPICE identifier.`, instance.id, "b", bulk);
        continue;
      }
      const w = instance.values["mos:w"]?.trim() ?? "";
      const l = instance.values["mos:l"]?.trim() ?? "";
      if (!w || !l) {
        report("MISSING_PARAM", "error", `${instance.ref} needs both W and L for sky130.`, instance.id);
        continue;
      }
      if (!positiveValue(w) || !positiveValue(l)) {
        report("INVALID_VALUE", "error", `${instance.ref} has invalid W/L values.`, instance.id);
        continue;
      }
      const m = instance.values["mos:m"]?.trim() || "1";
      const nf = instance.values["mos:nf"]?.trim() || "1";
      if (!positiveInteger(m) || !positiveInteger(nf)) {
        report("INVALID_VALUE", "error", `${instance.ref} has invalid M/NF values.`, instance.id);
        continue;
      }
      if (!bulk) continue;
      const params: Record<string, string> = { w, l };
      if (m !== "1") params.m = m;
      if (nf !== "1") params.nf = nf;
      instances.push({
        componentId: instance.id,
        ref: instance.ref,
        master: device.master,
        type: instance.type,
        kind: "mos",
        nodes: [net("d"), net("g"), net("s"), bulk],
        params
      });
      continue;
    }

    if (SOURCE_TYPES.has(instance.type)) {
      const kind = instance.type === "currentSource"
        ? "dc"
        : instance.type === "battery"
          ? "dc"
          : voltageSourceType(instance);
      if (!isVoltageSourceType(kind) && kind !== "dc") {
        report("UNSUPPORTED_SOURCE", "error", `${instance.ref} uses an unsupported source type.`, instance.id);
        continue;
      }
      if (!addPinDiagnostics(["p", "n"])) continue;
      const source = sourceParameters(instance, kind, report);
      if (!source) continue;
      const isCurrent = instance.type === "currentSource";
      instances.push({
        componentId: instance.id,
        ref: instance.ref,
        master: isCurrent ? "isource" : "vsource",
        type: instance.type,
        kind: "source",
        nodes: [net("p"), net("n")],
        params: source.params,
        sourceKind: source.kind
      });
      continue;
    }
  }

  resolution.nets.forEach((net) => {
    const netName = canonical(net.name);
    if (netName === "0" || net.pins.length !== 1) return;
    const pin = net.pins[0];
    if (SKIP_TYPES.has(pin.componentType) || !SUPPORTED_TYPES.has(pin.componentType)) return;
    if (net.wireIds.length === 0) {
      report(
        "FLOATING_PIN",
        "error",
        `${pin.componentId}.${pin.pinId} has no wire or connection.`,
        pin.componentId,
        pin.pinId,
        netName
      );
      return;
    }
    report("SINGLE_PIN_NET", "warning", `Net ${netName} has only one pin.`, undefined, undefined, netName);
  });

  return { name: "schematic", instances, diagnostics };
}

function sourceParameters(
  instance: ComponentInstance,
  kind: VoltageSourceType,
  report: (code: string, severity: NetlistDiagnostic["severity"], message: string, componentId?: string) => void
): { kind: VoltageSourceType; params: Record<string, string> } | null {
  const value = (key: string) => instance.values[key]?.trim() ?? "";
  const fail = (message: string) => {
    report("MISSING_PARAM", "error", `${instance.ref} ${message}`, instance.id);
    return null;
  };
  if (kind === "dc") {
    const dc = value("main");
    if (!dc) return fail("needs a DC value.");
    return { kind, params: { dc } };
  }
  if (kind === "sine") {
    const amplitude = value("vsource:sine:amplitude");
    const frequency = value("vsource:sine:frequency");
    if (!amplitude || !frequency) return fail("needs sine amplitude and frequency.");
    return {
      kind,
      params: {
        vo: value("vsource:sine:dcLevel") || "0",
        va: amplitude,
        freq: frequency,
        td: value("vsource:sine:delay") || "0",
        theta: "0"
      }
    };
  }
  if (kind === "pulse") {
    const v1 = value("vsource:pulse:zeroValue");
    const v2 = value("vsource:pulse:oneValue");
    const period = value("vsource:pulse:period");
    if (!v1 || !v2 || !period) return fail("needs pulse zero/one values and period.");
    return {
      kind,
      params: {
        v1,
        v2,
        td: value("vsource:pulse:delay") || "0",
        tr: value("vsource:pulse:riseTime") || "0",
        tf: value("vsource:pulse:fallTime") || "0",
        pw: value("vsource:pulse:pulseWidth") || "0",
        per: period
      }
    };
  }
  if (kind === "exp") {
    const v1 = value("vsource:exp:zeroValue");
    const v2 = value("vsource:exp:oneValue");
    if (!v1 || !v2) return fail("needs exp zero/one values.");
    return {
      kind,
      params: {
        v1,
        v2,
        td1: value("vsource:exp:riseStart") || "0",
        tau1: value("vsource:exp:riseConstant") || "0",
        td2: value("vsource:exp:fallStart") || "0",
        tau2: value("vsource:exp:fallConstant") || "0"
      }
    };
  }
  if (kind === "pwl") {
    const pairs = voltageSourcePairCount(instance);
    const points: string[] = [];
    for (let index = 1; index <= pairs; index += 1) {
      const time = value(`vsource:pwl:time${index}`);
      const voltage = value(`vsource:pwl:voltage${index}`);
      if (!time || !voltage) return fail(`needs PWL pair ${index}.`);
      points.push(time, voltage);
    }
    return { kind, params: { pwl: points.join(" ") } };
  }
  report("UNSUPPORTED_SOURCE", "error", `${instance.ref} uses an unsupported source type "${kind}".`, instance.id);
  return null;
}

function canonicalNetNames(extracted: ExtractedNetlist, resolution: NetResolution) {
  const names = new Map<string, string>();
  const used = new Set<string>();
  const assign = (internal: string, name: string) => {
    if (!internal || names.has(internal)) return;
    names.set(internal, name);
    used.add(name.toLowerCase());
  };
  resolution.nets.forEach((net) => {
    if (net.name === "0") assign(net.name, "0");
    else if (net.explicit) assign(net.name, net.name);
  });
  extracted.components
    .filter(entry => entry.instance.type === "vdd")
    .forEach(entry => Object.values(entry.pins).forEach(internal => assign(internal, "VDD")));
  let index = 0;
  const nextName = () => {
    let candidate;
    do {
      candidate = `net${index++}`;
    } while (used.has(candidate.toLowerCase()));
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
  return names;
}

function positiveValue(value: string) {
  const parsed = parseEngineeringValue(value, { baseUnit: "m" });
  return parsed !== null && parsed > 0;
}

function positiveInteger(value: string) {
  return /^[1-9][0-9]*$/.test(value);
}
