import { describe, expect, it } from "vitest";
import { fixtureComponent, fixtureWire } from "../support/fixtures";
import { fixtureDocument } from "../support/fixtureDocument";
import { componentPinPoint } from "../../../src/schematic/connectivity";
import { buildStructuralNetlist, printNetlist } from "../../../src/schematic/netlist/index";
import type { ComponentInstance, Wire } from "../../../src/schematic/types";

function wireBetween(
  id: string,
  first: ComponentInstance,
  firstPin: string,
  second: ComponentInstance,
  secondPin: string
): Wire {
  return fixtureWire(id, [componentPinPoint(first, firstPin), componentPinPoint(second, secondPin)]);
}

function dividerDocument() {
  const v1 = fixtureComponent("voltageSource", "V1", 100, 100, 90);
  v1.variantId = "dc";
  v1.values.main = "1";
  const r1 = fixtureComponent("resistor", "R1", 300, 100);
  r1.values.main = "1k";
  const r2 = fixtureComponent("resistor", "R2", 300, 200);
  r2.values.main = "2k";
  const gnd = fixtureComponent("gnd", "GND1", 300, 260);
  return fixtureDocument({
    components: [v1, r1, r2, gnd],
    wires: [
      wireBetween("w1", v1, "p", r1, "p"),
      wireBetween("w2", r1, "n", r2, "p"),
      wireBetween("w3", r2, "n", gnd, "g"),
      wireBetween("w4", v1, "n", gnd, "g")
    ]
  });
}

function mosDocument() {
  const vdd = fixtureComponent("vdd", "VDD1", 300, 40);
  const nmos = fixtureComponent("nmos", "M1", 300, 120);
  nmos.variantId = "4pin-current";
  nmos.values["mos:w"] = "1u";
  nmos.values["mos:l"] = "0.15u";
  const gate = fixtureComponent("voltageSource", "VG", 100, 120);
  gate.variantId = "dc";
  gate.values.main = "0.7";
  const gnd = fixtureComponent("gnd", "GND1", 300, 220);
  return fixtureDocument({
    components: [vdd, nmos, gate, gnd],
    wires: [
      wireBetween("w1", vdd, "vdd", nmos, "d"),
      wireBetween("w2", gate, "p", nmos, "g"),
      wireBetween("w3", nmos, "s", gnd, "g"),
      wireBetween("w4", nmos, "b", gnd, "g"),
      wireBetween("w5", gate, "n", gnd, "g")
    ]
  });
}

describe("structural netlist", () => {
  it("prints a divider in SPICE and Spectre", () => {
    const design = buildStructuralNetlist(dividerDocument());
    expect(design.diagnostics.filter(d => d.severity === "error")).toEqual([]);
    expect(design.instances).toHaveLength(3);
    expect(printNetlist(design, "spice")).toBe([
      "* analog-tools structural netlist",
      "V1 net0 0 DC 1",
      "R1 net0 net1 1k",
      "R2 net1 0 2k",
      ""
    ].join("\n"));
    expect(printNetlist(design, "spectre")).toBe([
      "// analog-tools structural netlist",
      "simulator lang=spectre",
      "V1 (net0 0) vsource dc=1",
      "R1 (net0 net1) resistor r=1k",
      "R2 (net1 0) resistor r=2k",
      ""
    ].join("\n"));
  });

  it("prints a sky130 MOS with W/L", () => {
    const design = buildStructuralNetlist(mosDocument());
    expect(design.diagnostics.filter(d => d.severity === "error")).toEqual([]);
    const spice = printNetlist(design, "spice");
    expect(spice).toContain("sky130_fd_pr__nfet_01v8 w=1u l=0.15u");
    expect(spice).toMatch(/^XM1 /m);
    expect(printNetlist(design, "spectre")).toContain("M1 (");
  });

  it("reports unsupported devices and missing MOS parameters", () => {
    const inverter = fixtureComponent("inverter", "X1", 600, 100);
    const unsupported = buildStructuralNetlist(fixtureDocument({ components: [inverter], wires: [] }));
    expect(unsupported.diagnostics).toContainEqual(expect.objectContaining({
      code: "UNSUPPORTED_DEVICE",
      severity: "error",
      componentId: "X1"
    }));

    const document = mosDocument();
    const mos = document.components.find(component => component.type === "nmos")!;
    delete mos.values["mos:w"];
    const missing = buildStructuralNetlist(document);
    expect(missing.diagnostics).toContainEqual(expect.objectContaining({
      code: "MISSING_PARAM",
      componentId: "M1"
    }));
  });

  it("prints sine sources for both formats", () => {
    const document = dividerDocument();
    const source = document.components.find(component => component.type === "voltageSource")!;
    source.variantId = "sine";
    source.values["vsource:sine:dcLevel"] = "0";
    source.values["vsource:sine:amplitude"] = "1";
    source.values["vsource:sine:frequency"] = "1k";
    const design = buildStructuralNetlist(document);
    expect(design.diagnostics.filter(item => item.severity === "error")).toEqual([]);
    expect(printNetlist(design, "spice")).toContain("V1 net0 0 SIN(0 1 1k 0 0)");
    expect(printNetlist(design, "spectre")).toContain("V1 (net0 0) vsource sine dc=0 ampl=1 freq=1k delay=0");
  });

  it("is deterministic", () => {
    const document = dividerDocument();
    expect(buildStructuralNetlist(document)).toEqual(buildStructuralNetlist(document));
  });
});
