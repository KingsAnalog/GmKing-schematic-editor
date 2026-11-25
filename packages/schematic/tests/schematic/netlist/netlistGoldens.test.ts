import { describe, expect, it } from "vitest";
import { componentPinPoint } from "../../../src/schematic/connectivity";
import { buildStructuralNetlist, printNetlist } from "../../../src/schematic/netlist/index";
import { parseSchematicDocumentFile, serializeSchematicDocumentFile } from "../../../src/schematic/schematicDocumentFile";
import type { ComponentInstance } from "../../../src/schematic/types";
import { fixtureDocument } from "../support/fixtureDocument";
import { fixtureComponent, fixtureWire } from "../support/fixtures";

type Terminal = [ComponentInstance, string];

function circuit(components: ComponentInstance[], nets: Terminal[][]) {
  return fixtureDocument({
    components,
    wires: nets.flatMap((terminals, index) => terminals.map(([component, pin], terminal) =>
      ({ ...fixtureWire(`wire-${index}-${terminal}`, [componentPinPoint(component, pin), { x: 1600 + 100 * index, y: 500 }]), routeMode: "freeAngle" as const })
    ))
  });
}

function dc(ref: string, voltage: string, y: number) {
  const instance = fixtureComponent("voltageSource", ref, 100, y);
  instance.variantId = "dc";
  instance.values.main = voltage;
  return instance;
}

function nmos(ref: string, x: number, y: number) {
  const instance = fixtureComponent("nmos", ref, x, y);
  instance.variantId = "4pin-current";
  Object.assign(instance.values, { "mos:w": "2u", "mos:l": "0.15u", "mos:m": "2", "mos:nf": "4" });
  return instance;
}

function resistor(ref: string, x: number, y: number, ohms = "10k") {
  const instance = fixtureComponent("resistor", ref, x, y);
  instance.values.main = ohms;
  return instance;
}

function rcLowPass() {
  const input = dc("VIN", "1", 200);
  const load = resistor("R1", 300, 100);
  const cap = fixtureComponent("capacitor", "C1", 500, 200);
  const gnd = fixtureComponent("gnd", "GND1", 700, 320);
  cap.values.main = "100p";
  return circuit([input, load, cap, gnd], [
    [[input, "p"], [load, "p"]],
    [[load, "n"], [cap, "p"]],
    [[input, "n"], [cap, "n"], [gnd, "g"]]
  ]);
}

function commonSource() {
  const input = dc("VIN", "0.7", 280);
  const vdd = fixtureComponent("vdd", "VDD1", 500, 40);
  const load = resistor("R1", 500, 140);
  const mos = nmos("M1", 500, 280);
  const gnd = fixtureComponent("gnd", "GND1", 750, 400);
  return circuit([input, load, mos, vdd, gnd], [
    [[vdd, "vdd"], [load, "p"]],
    [[load, "n"], [mos, "d"]],
    [[input, "p"], [mos, "g"]],
    [[input, "n"], [mos, "s"], [mos, "b"], [gnd, "g"]]
  ]);
}

function differentialPair() {
  const a = dc("VIP", "0.71", 180);
  const b = dc("VIN", "0.69", 360);
  const vdd = fixtureComponent("vdd", "VDD1", 520, 40);
  const gnd = fixtureComponent("gnd", "GND1", 520, 420);
  const r1 = resistor("R1", 380, 140);
  const r2 = resistor("R2", 700, 140);
  const m1 = nmos("M1", 380, 270);
  const m2 = nmos("M2", 700, 270);
  const tail = fixtureComponent("currentSource", "I1", 520, 360);
  tail.values.main = "100u";
  return circuit([a, b, r1, r2, m1, m2, tail, vdd, gnd], [
    [[a, "p"], [m1, "g"]], [[b, "p"], [m2, "g"]],
    [[vdd, "vdd"], [r1, "p"], [r2, "p"]],
    [[r1, "n"], [m1, "d"]], [[r2, "n"], [m2, "d"]],
    [[m1, "s"], [m2, "s"], [tail, "p"]],
    [[a, "n"], [b, "n"], [m1, "b"], [m2, "b"], [tail, "n"], [gnd, "g"]]
  ]);
}

const identifier = "[A-Za-z_][A-Za-z0-9_]*";
const node = `(?:0|${identifier})`;
const number = "[+-]?(?:[0-9]+(?:\\.[0-9]*)?|\\.[0-9]+)(?:[eE][+-]?[0-9]+)?(?:meg|[TGMkmunpf])?";
const assignment = `${identifier}=${number}`;

/** Checks the syntax subset used by these linear and MOS reference circuits. */
function assertFixtureGrammar(text: string, format: "spice" | "spectre") {
  const lines = text.trimEnd().split("\n");
  if (format === "spice") {
    expect(lines.shift()).toMatch(/^\* [\x20-\x7e]+$/);
    expect(lines.shift()).toMatch(new RegExp(`^\\.subckt schematic(?: ${node})+$`));
    expect(lines.pop()).toBe(".ends schematic");
    const device = new RegExp(`^  (?:[RC][A-Za-z0-9_]+ ${node} ${node} ${number}|[VI][A-Za-z0-9_]+ ${node} ${node} DC ${number}|X[A-Za-z0-9_]+(?: ${node}){4} ${identifier}(?: ${assignment})+)$`);
    lines.forEach(line => expect(line).toMatch(device));
  } else {
    expect(lines.shift()).toMatch(/^\/\/ [\x20-\x7e]+$/);
    expect(lines.shift()).toBe("simulator lang=spectre");
    expect(lines.shift()).toMatch(new RegExp(`^subckt schematic \\(${node}(?: ${node})*\\)$`));
    expect(lines.pop()).toBe("ends schematic");
    const device = new RegExp(`^  ${identifier} \\(${node}(?: ${node})+\\) ${identifier}(?: ${assignment})+$`);
    lines.forEach(line => expect(line).toMatch(device));
  }
}

describe("R2 reference netlists", () => {
  it.each([
    ["rc-low-pass", rcLowPass],
    ["common-source", commonSource],
    ["differential-pair", differentialPair]
  ] as const)("%s matches both goldens and survives a document reload", async (name, fixture) => {
    const document = fixture();
    const reloaded = parseSchematicDocumentFile(serializeSchematicDocumentFile(document));
    const design = buildStructuralNetlist(document);
    expect(design.diagnostics.filter(entry => entry.severity === "error")).toEqual([]);
    for (const [format, extension] of [["spice", "sp"], ["spectre", "scs"]] as const) {
      const text = printNetlist(design, format);
      assertFixtureGrammar(text, format);
      await expect(text).toMatchFileSnapshot(`./golden/${name}.${extension}`);
      expect(printNetlist(buildStructuralNetlist(reloaded), format)).toBe(text);
    }
  });
});
