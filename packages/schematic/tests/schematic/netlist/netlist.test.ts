import { describe, expect, it } from "vitest";
import { fixtureComponent, fixtureWire } from "../support/fixtures";
import { fixtureDocument } from "../support/fixtureDocument";
import { componentPinPoint } from "../../../src/schematic/connectivity";
import {
  buildStructuralNetlist,
  defaultDeviceConfig,
  printNetlist
} from "../../../src/schematic/netlist/index";
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
  it("prints a divider as one subckt with a ground port", () => {
    const design = buildStructuralNetlist(dividerDocument());
    expect(design.diagnostics.filter(d => d.severity === "error")).toEqual([]);
    expect(design.instances).toHaveLength(3);
    expect(design.ports).toEqual(["GND"]);
    expect(printNetlist(design, "spice")).toBe([
      "* analog-tools structural netlist",
      ".subckt schematic GND",
      "  V1 net0 GND DC 1",
      "  R1 net0 net1 1k",
      "  R2 net1 GND 2k",
      ".ends schematic",
      ""
    ].join("\n"));
    expect(printNetlist(design, "spectre")).toBe([
      "// analog-tools structural netlist",
      "simulator lang=spectre",
      "subckt schematic (GND)",
      "  V1 (net0 GND) vsource dc=1",
      "  R1 (net0 net1) resistor r=1k",
      "  R2 (net1 GND) resistor r=2k",
      "ends schematic",
      ""
    ].join("\n"));
  });

  it("prints a sky130 MOS with VDD/GND ports and W/L", () => {
    const design = buildStructuralNetlist(mosDocument());
    expect(design.diagnostics.filter(d => d.severity === "error")).toEqual([]);
    expect(design.ports).toEqual(["VDD", "GND"]);
    const spice = printNetlist(design, "spice");
    expect(spice).toContain(".subckt schematic VDD GND");
    expect(spice).toContain("sky130_fd_pr__nfet_01v8 w=1u l=0.15u");
    expect(spice).toMatch(/^\s+XM1 /m);
    expect(printNetlist(design, "spectre")).toContain("M1 (");
  });

  it("turns canvas net labels into subckt ports", () => {
    const document = dividerDocument();
    const wire = document.wires.find(item => item.id === "w1")!;
    const [first, second] = wire.points;
    document.netLabels = [{
      id: "label-vin",
      name: "VIN",
      attachment: {
        wireId: wire.id,
        point: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
      }
    }];
    const design = buildStructuralNetlist(document);
    expect(design.ports).toEqual(["VIN", "GND"]);
    expect(printNetlist(design, "spice")).toContain(".subckt schematic VIN GND");
    expect(printNetlist(design, "spice")).toContain("V1 VIN GND DC 1");
  });

  it("emits unresolved values as parameters with defaults", () => {
    const document = dividerDocument();
    document.components.find(component => component.ref === "R1")!.values.main = "R";
    const design = buildStructuralNetlist(document);
    expect(design.parameters).toContainEqual({ name: "R", value: "1k" });
    const spice = printNetlist(design, "spice");
    expect(spice).toContain(".param R=1k");
    expect(spice).toContain("R1 net0 net1 {R}");
    expect(printNetlist(design, "spectre")).toContain("R1 (net0 net1) resistor r=R");
  });

  it("still generates a netlist for floating pins and keeps the error", () => {
    const original = dividerDocument();
    const document = fixtureDocument({
      components: original.components,
      wires: original.wires.filter(wire => wire.id !== "w3" && wire.id !== "w4")
    });
    const design = buildStructuralNetlist(document);
    expect(design.instances).toHaveLength(3);
    expect(design.diagnostics).toContainEqual(expect.objectContaining({ code: "FLOATING_PIN", severity: "error" }));
    const spice = printNetlist(design, "spice");
    expect(spice).toContain(".subckt schematic GND");
    expect(spice).toMatch(/R2 net\d+ net\d+ 2k/);
  });

  it("reports unsupported devices and defaults missing MOS parameters", () => {
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
      code: "DEFAULT_PARAM",
      componentId: "M1"
    }));
    expect(missing.parameters).toContainEqual({ name: "M1_W", value: "1u" });
    expect(printNetlist(missing, "spice")).toContain("w={M1_W}");
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
    expect(printNetlist(design, "spice")).toContain("V1 net0 GND SIN(0 1 1k 0 0)");
    expect(printNetlist(design, "spectre")).toContain("V1 (net0 GND) vsource sine dc=0 ampl=1 freq=1k delay=0");
  });

  it("uses the selected process device for modeled passives", () => {
    const config = defaultDeviceConfig("sky130");
    config.devices.resistor = "sky130_fd_pr__res_generic_po";
    const design = buildStructuralNetlist(dividerDocument(), { config });
    expect(printNetlist(design, "spice")).toContain("XR1 net0 net1 sky130_fd_pr__res_generic_po r=1k");
    expect(printNetlist(design, "spectre")).toContain("R1 (net0 net1) sky130_fd_pr__res_generic_po r=1k");
  });

  it("defaults a 3-terminal MOS bulk to its source and exposes supply ports", () => {
    const vdd = fixtureComponent("vdd", "VDD1", 300, 40);
    const nmos = fixtureComponent("nmos", "M1", 300, 120);
    nmos.values["mos:w"] = "1u";
    nmos.values["mos:l"] = "0.15u";
    const gnd = fixtureComponent("gnd", "GND1", 300, 220);
    const document = fixtureDocument({
      components: [vdd, nmos, gnd],
      wires: [
        wireBetween("w1", vdd, "vdd", nmos, "d"),
        wireBetween("w2", nmos, "g", gnd, "g"),
        wireBetween("w3", nmos, "s", gnd, "g")
      ]
    });
    const design = buildStructuralNetlist(document);
    expect(design.ports).toEqual(["VDD", "GND"]);
    expect(design.diagnostics).toContainEqual(expect.objectContaining({ code: "BULK_DEFAULTED", severity: "warning" }));
    expect(design.diagnostics.filter(item => item.severity === "error")).toEqual([]);
    expect(printNetlist(design, "spice")).toContain("XM1 VDD GND GND GND");
  });

  it("prints BJTs with the selected process model", () => {
    const npn = fixtureComponent("npn", "Q1", 300, 100);
    const document = fixtureDocument({ components: [npn], wires: [] });
    const design = buildStructuralNetlist(document, {
      config: {
        process: "sky130",
        devices: {
          nmos: "sky130_fd_pr__nfet_01v8",
          pmos: "sky130_fd_pr__pfet_01v8",
          npn: "sky130_fd_pr__npn_05v5_W0p68L0p68",
          pnp: "sky130_fd_pr__pnp_05v5_W0p68L0p68",
          resistor: "R",
          capacitor: "C",
          inductor: "L"
        }
      }
    });
    expect(printNetlist(design, "spice")).toContain("Q1 net0 net1 net2 sky130_fd_pr__npn_05v5_W0p68L0p68");
  });

  it("is deterministic", () => {
    const document = dividerDocument();
    expect(buildStructuralNetlist(document)).toEqual(buildStructuralNetlist(document));
  });

  it("reports empty and malformed custom model names while retaining the instance", () => {
    for (const [name, code] of [["", "MISSING_MODEL"], ["name with spaces", "INVALID_MODEL"]]) {
      const config = defaultDeviceConfig("custom");
      config.devices.nmos = name;
      const design = buildStructuralNetlist(mosDocument(), { config });
      expect(design.diagnostics).toContainEqual(expect.objectContaining({ componentId: "M1", code, severity: "error" }));
      expect(design.instances).toContainEqual(expect.objectContaining({ componentId: "M1", master: "NMOS" }));
      expect(printNetlist(design, "spice")).toMatch(/XM1 .* NMOS w=/);
    }
  });

  it("reports case-only instance and net collisions without joining distinct nets", () => {
    const document = dividerDocument();
    const wireA = document.wires.find(wire => wire.id === "w1")!;
    const wireB = document.wires.find(wire => wire.id === "w2")!;
    document.netLabels = [
      { id: "label-input", name: "INPUT", attachment: { wireId: wireA.id, point: wireA.points[0] } },
      { id: "label-input-lower", name: "input", attachment: { wireId: wireB.id, point: wireB.points[0] } }
    ];
    document.components.push({ ...fixtureComponent("resistor", "R3", 600, 260), ref: "r1" });
    const design = buildStructuralNetlist(document);
    expect(design.diagnostics).toContainEqual(expect.objectContaining({ code: "NAME_COLLISION" }));
    expect(design.diagnostics).toContainEqual(expect.objectContaining({ code: "DUPLICATE_REF", componentId: "R3" }));
    const resistor = design.instances.find(instance => instance.ref === "R1")!;
    expect(new Set(resistor.nodes.map(node => node.toLowerCase())).size).toBe(2);
  });

  it("keeps exportable instances when the bulk is floating or source waveform is unknown", () => {
    const original = mosDocument();
    const document = fixtureDocument({
      components: original.components,
      wires: original.wires.filter(wire => wire.id !== "w4")
    });
    document.components.find(component => component.ref === "VG")!.variantId = "unknown-waveform";
    const design = buildStructuralNetlist(document);
    expect(design.diagnostics).toContainEqual(expect.objectContaining({ code: "BULK_UNCONNECTED", componentId: "M1", pinId: "b" }));
    expect(design.diagnostics).toContainEqual(expect.objectContaining({ code: "UNSUPPORTED_SOURCE", componentId: "VG" }));
    expect(design.instances.map(instance => instance.ref)).toEqual(["M1"]);
    expect(printNetlist(design, "spectre")).toMatch(/M1 \([^)]*net\d+\)/);
  });

  it("rejects invalid MOS parameter bounds and prints native unit suffixes", () => {
    const document = mosDocument();
    const mos = document.components.find(component => component.ref === "M1")!;
    Object.assign(mos.values, { "mos:w": "-1u", "mos:l": "0", "mos:m": "1.5", "mos:nf": "9007199254740993" });
    const invalid = buildStructuralNetlist(document);
    expect(invalid.diagnostics.filter(item => item.code === "INVALID_VALUE" && item.componentId === "M1")).toHaveLength(4);
    expect(printNetlist(invalid, "spice")).toContain("w={M1_W} l={M1_L}");
    const divider = dividerDocument();
    divider.components.find(component => component.ref === "R1")!.values.main = "2 M";
    divider.components.find(component => component.ref === "R2")!.values.main = "4 µ";
    const design = buildStructuralNetlist(divider);
    expect(printNetlist(design, "spice")).toMatch(/R1 \S+ \S+ 2meg/);
    expect(printNetlist(design, "spice")).toMatch(/R2 \S+ \S+ 4u/);
    expect(printNetlist(design, "spectre")).toContain("resistor r=2M");
  });
});
