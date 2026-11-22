import type { NetlistDesign, NetlistFormat, NetlistInstance } from "./model";

export function printNetlist(design: NetlistDesign, format: NetlistFormat) {
  if (design.sheets) {
    const spice = format === "spice";
    const lines = spice ? ["* analog-tools hierarchical netlist"] : ["// analog-tools hierarchical netlist", "simulator lang=spectre"];
    const globals = design.globalNets?.filter(name => name !== "0").sort() ?? [];
    const globalAliases = spice ? spiceNodeAliases(globals) : new Map<string, string>();
    if (globals.length) lines.push(`${spice ? ".global" : "global"} ${globals.map(name => globalAliases.get(name) ?? name).join(" ")}`);
    for (const source of design.sheets) {
      const sheet = spice ? spiceNodes(source, globalAliases) : source;
      const header = spice ? subcktHeader(sheet, ".subckt")
        : sheet.ports.length ? `subckt ${sheet.name} (${sheet.ports.join(" ")})` : `subckt ${sheet.name}`;
      lines.push(header);
      if (sheet.parameters.length) lines.push(
        `  ${spice ? ".param" : "parameters"} ${sheet.parameters.map(p => `${p.name}=${spice ? spiceLiteral(p.value) : p.value}`).join(" ")}`
      );
      for (const instance of sheet.instances) lines.push(`  ${spice ? spiceInstance(instance, sheet) : spectreInstance(instance, sheet)}`);
      lines.push(`${spice ? ".ends" : "ends"} ${sheet.name}`, "");
    }
    return lines.join("\n");
  }
  return format === "spice" ? printSpice(design) : printSpectre(design);
}

export function printSpice(source: NetlistDesign) {
  const design = spiceNodes(source);
  const lines = ["* analog-tools structural netlist"];
  if (design.parameters.length > 0) {
    lines.push(`.param ${design.parameters.map(parameter => `${parameter.name}=${spiceLiteral(parameter.value)}`).join(" ")}`);
  }
  lines.push(subcktHeader(design, ".subckt"));
  design.instances.forEach((instance) => lines.push(`  ${spiceInstance(instance, design)}`));
  lines.push(`.ends ${design.name}`);
  return `${lines.join("\n")}\n`;
}

/** SPICE resolves node names without case. Keep each editor net unique at export. */
function spiceNodeAliases(names: readonly string[], inherited = new Map<string, string>(), groundPort?: string) {
  const aliases = new Map(inherited);
  if (groundPort) aliases.set(groundPort, groundPort);
  const used = new Set([...aliases.values()].map(name => name.toLowerCase()));
  // ngspice treats any spelling of gnd as node 0.
  used.add("gnd");
  const reserved = new Set([...names.map(name => name.toLowerCase()), ...used]);
  for (const name of names) {
    if (aliases.has(name)) continue;
    let alias = name;
    if (used.has(name.toLowerCase())) {
      let suffix = 2;
      do {
        alias = `${name}_${suffix++}`;
      } while (reserved.has(alias.toLowerCase()));
    }
    aliases.set(name, alias);
    used.add(alias.toLowerCase());
    reserved.add(alias.toLowerCase());
  }
  return aliases;
}

function spiceNodes(design: NetlistDesign, globals?: Map<string, string>): NetlistDesign {
  const aliases = spiceNodeAliases([...design.ports, ...design.instances.flatMap(instance => instance.nodes)], globals, design.groundPort);
  const emitted = (name: string) => aliases.get(name) ?? name;
  return { ...design, ports: design.ports.map(emitted), instances: design.instances.map(instance => ({
    ...instance, nodes: instance.nodes.map(emitted)
  })) };
}

export function printSpectre(design: NetlistDesign) {
  const lines = ["// analog-tools structural netlist", "simulator lang=spectre"];
  if (design.parameters.length > 0) {
    lines.push(`parameters ${design.parameters.map(parameter => `${parameter.name}=${parameter.value}`).join(" ")}`);
  }
  lines.push(design.ports.length ? `subckt ${design.name} (${design.ports.join(" ")})` : `subckt ${design.name}`);
  design.instances.forEach((instance) => lines.push(`  ${spectreInstance(instance, design)}`));
  lines.push(`ends ${design.name}`);
  return `${lines.join("\n")}\n`;
}

function subcktHeader(design: NetlistDesign, keyword: string) {
  return `${keyword} ${design.name}${design.ports.length ? ` ${design.ports.join(" ")}` : ""}`;
}

function spiceInstance(instance: NetlistInstance, design: NetlistDesign) {
  const nodes = instance.nodes.join(" ");
  if (instance.kind === "subckt") {
    const ref = instance.ref.toUpperCase().startsWith("X") ? instance.ref : `X${instance.ref}`;
    return [ref, nodes, instance.master].filter(Boolean).join(" ");
  }
  if (instance.kind === "mos") {
    const ref = instance.ref.toUpperCase().startsWith("X") ? instance.ref : `X${instance.ref}`;
    return `${ref} ${nodes} ${instance.master} ${formatParams(design, instance.params, ["w", "l", "m", "nf"], "spice")}`;
  }
  if (instance.kind === "bjt") {
    return `${instance.ref} ${nodes} ${instance.master}`;
  }
  if (instance.kind === "modeledPassive") {
    const ref = instance.ref.toUpperCase().startsWith("X") ? instance.ref : `X${instance.ref}`;
    const key = passiveParam(instance);
    return `${ref} ${nodes} ${instance.master} ${key}=${formatValue(design, instance.params[key], "spice")}`;
  }
  if (instance.kind === "probe") {
    return `${instance.ref} ${nodes} 0`;
  }
  if (instance.type === "resistor" || instance.type === "capacitor" || instance.type === "inductor") {
    return `${instance.ref} ${nodes} ${formatValue(design, instance.params.value, "spice")}`;
  }
  if (instance.kind === "source") {
    return `${instance.ref} ${nodes} ${spiceSource(instance, design)}`;
  }
  return `${instance.ref} ${nodes}`;
}

function spiceSource(instance: NetlistInstance, design: NetlistDesign) {
  const params = instance.params;
  const value = (key: string) => formatValue(design, params[key], "spice");
  if (params.dc !== undefined) return `DC ${value("dc")}`;
  if (instance.sourceKind === "sine") {
    return `SIN(${value("vo")} ${value("va")} ${value("freq")} ${value("td")} ${value("theta")})`;
  }
  if (instance.sourceKind === "pulse") {
    return `PULSE(${value("v1")} ${value("v2")} ${value("td")} ${value("tr")} ${value("tf")} ${value("pw")} ${value("per")})`;
  }
  if (instance.sourceKind === "exp") {
    return `EXP(${value("v1")} ${value("v2")} ${value("td1")} ${value("tau1")} ${value("td2")} ${value("tau2")})`;
  }
  if (instance.sourceKind === "pwl") {
    const points = params.pwl.split(" ").map(point => formatValue(design, point, "spice"));
    return `PWL(${points.join(" ")})`;
  }
  return "DC 0";
}

function spectreInstance(instance: NetlistInstance, design: NetlistDesign) {
  const nodes = instance.nodes.join(" ");
  if (instance.kind === "subckt") return `${instance.ref} (${nodes}) ${instance.master}`;
  if (instance.kind === "mos") {
    return `${instance.ref} (${nodes}) ${instance.master} ${formatParams(design, instance.params, ["w", "l", "m", "nf"], "spectre")}`;
  }
  if (instance.kind === "bjt") {
    return `${instance.ref} (${nodes}) ${instance.master}`;
  }
  if (instance.kind === "modeledPassive") {
    const key = passiveParam(instance);
    return `${instance.ref} (${nodes}) ${instance.master} ${key}=${formatValue(design, instance.params[key], "spectre")}`;
  }
  if (instance.kind === "probe") {
    return `${instance.ref} (${nodes}) vsource dc=0`;
  }
  if (instance.type === "resistor") {
    return `${instance.ref} (${nodes}) resistor r=${formatValue(design, instance.params.value, "spectre")}`;
  }
  if (instance.type === "capacitor") {
    return `${instance.ref} (${nodes}) capacitor c=${formatValue(design, instance.params.value, "spectre")}`;
  }
  if (instance.type === "inductor") {
    return `${instance.ref} (${nodes}) inductor l=${formatValue(design, instance.params.value, "spectre")}`;
  }
  if (instance.kind === "source") {
    return `${instance.ref} (${nodes}) ${instance.type === "currentSource" ? "isource" : "vsource"} ${spectreSource(instance, design)}`;
  }
  return `${instance.ref} (${nodes})`;
}

function spectreSource(instance: NetlistInstance, design: NetlistDesign) {
  const params = instance.params;
  const value = (key: string) => formatValue(design, params[key], "spectre");
  if (params.dc !== undefined) return `dc=${value("dc")}`;
  if (instance.sourceKind === "sine") {
    return `sine dc=${value("vo")} ampl=${value("va")} freq=${value("freq")} delay=${value("td")}`;
  }
  if (instance.sourceKind === "pulse") {
    return `pulse val0=${value("v1")} val1=${value("v2")} delay=${value("td")} rise=${value("tr")} fall=${value("tf")} width=${value("pw")} period=${value("per")}`;
  }
  if (instance.sourceKind === "exp") {
    return `exp val0=${value("v1")} val1=${value("v2")} delay1=${value("td1")} tau1=${value("tau1")} delay2=${value("td2")} tau2=${value("tau2")}`;
  }
  if (instance.sourceKind === "pwl") {
    return `pwl (${value("pwl")})`;
  }
  return "dc=0";
}

function passiveParam(instance: NetlistInstance) {
  return instance.type === "capacitor" ? "c" : instance.type === "inductor" ? "l" : "r";
}

function formatParams(
  design: NetlistDesign,
  values: Record<string, string>,
  order: readonly string[],
  format: "spice" | "spectre"
) {
  return order
    .filter(key => values[key] !== undefined)
    .map(key => `${key}=${formatValue(design, values[key], format)}`)
    .join(" ");
}

function formatValue(design: NetlistDesign, value: string | undefined, format: "spice" | "spectre") {
  if (value === undefined) return "";
  if (format === "spice" && design.parameters.some(parameter => parameter.name === value)) {
    return `{${value}}`;
  }
  return format === "spice" ? spiceLiteral(value) : value;
}

function spiceLiteral(value: string) {
  // The editor's uppercase M is mega, while SPICE treats both M and m as milli.
  return value.replace(/([0-9.])M$/, "$1meg");
}
