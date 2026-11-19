import type { NetlistDesign, NetlistFormat, NetlistInstance } from "./model";

export function printNetlist(design: NetlistDesign, format: NetlistFormat) {
  return format === "spice" ? printSpice(design) : printSpectre(design);
}

export function printSpice(design: NetlistDesign) {
  const lines = ["* analog-tools structural netlist"];
  design.instances.forEach((instance) => lines.push(spiceInstance(instance)));
  return `${lines.join("\n")}\n`;
}

export function printSpectre(design: NetlistDesign) {
  const lines = ["// analog-tools structural netlist", "simulator lang=spectre"];
  design.instances.forEach((instance) => lines.push(spectreInstance(instance)));
  return `${lines.join("\n")}\n`;
}

function spiceInstance(instance: NetlistInstance) {
  const nodes = instance.nodes.join(" ");
  if (instance.kind === "mos") {
    const ref = instance.ref.toUpperCase().startsWith("X") ? instance.ref : `X${instance.ref}`;
    return `${ref} ${nodes} ${instance.master} ${params(instance.params, ["w", "l", "m", "nf"])}`;
  }
  if (instance.kind === "probe") {
    return `${instance.ref} ${nodes} 0`;
  }
  if (instance.type === "resistor" || instance.type === "capacitor" || instance.type === "inductor") {
    return `${instance.ref} ${nodes} ${instance.params.value}`;
  }
  if (instance.kind === "source") {
    return `${instance.ref} ${nodes} ${spiceSource(instance)}`;
  }
  return `${instance.ref} ${nodes}`;
}

function spiceSource(instance: NetlistInstance) {
  const params = instance.params;
  if (params.dc !== undefined) return `DC ${params.dc}`;
  if (instance.sourceKind === "sine") {
    return `SIN(${params.vo} ${params.va} ${params.freq} ${params.td} ${params.theta})`;
  }
  if (instance.sourceKind === "pulse") {
    return `PULSE(${params.v1} ${params.v2} ${params.td} ${params.tr} ${params.tf} ${params.pw} ${params.per})`;
  }
  if (instance.sourceKind === "exp") {
    return `EXP(${params.v1} ${params.v2} ${params.td1} ${params.tau1} ${params.td2} ${params.tau2})`;
  }
  if (instance.sourceKind === "pwl") {
    return `PWL(${params.pwl})`;
  }
  return "DC 0";
}

function spectreInstance(instance: NetlistInstance) {
  const nodes = instance.nodes.join(" ");
  if (instance.kind === "mos") {
    return `${instance.ref} (${nodes}) ${instance.master} ${params(instance.params, ["w", "l", "m", "nf"])}`;
  }
  if (instance.kind === "probe") {
    return `${instance.ref} (${nodes}) vsource dc=0`;
  }
  if (instance.type === "resistor") {
    return `${instance.ref} (${nodes}) resistor r=${instance.params.value}`;
  }
  if (instance.type === "capacitor") {
    return `${instance.ref} (${nodes}) capacitor c=${instance.params.value}`;
  }
  if (instance.type === "inductor") {
    return `${instance.ref} (${nodes}) inductor l=${instance.params.value}`;
  }
  if (instance.kind === "source") {
    return `${instance.ref} (${nodes}) ${instance.type === "currentSource" ? "isource" : "vsource"} ${spectreSource(instance)}`;
  }
  return `${instance.ref} (${nodes})`;
}

function spectreSource(instance: NetlistInstance) {
  const params = instance.params;
  if (params.dc !== undefined) return `dc=${params.dc}`;
  if (instance.sourceKind === "sine") {
    return `sine dc=${params.vo} ampl=${params.va} freq=${params.freq} delay=${params.td}`;
  }
  if (instance.sourceKind === "pulse") {
    return `pulse val0=${params.v1} val1=${params.v2} delay=${params.td} rise=${params.tr} fall=${params.tf} width=${params.pw} period=${params.per}`;
  }
  if (instance.sourceKind === "exp") {
    return `exp val0=${params.v1} val1=${params.v2} delay1=${params.td1} tau1=${params.tau1} delay2=${params.td2} tau2=${params.tau2}`;
  }
  if (instance.sourceKind === "pwl") {
    return `pwl (${params.pwl})`;
  }
  return "dc=0";
}

function params(values: Record<string, string>, order: readonly string[]) {
  return order
    .filter(key => values[key] !== undefined)
    .map(key => `${key}=${values[key]}`)
    .join(" ");
}
