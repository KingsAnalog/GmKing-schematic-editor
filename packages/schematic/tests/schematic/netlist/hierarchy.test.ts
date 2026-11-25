import { describe, expect, it } from "vitest";
import { createSchematicDocument, contentFromDocument, documentFromContent } from "../../../src/schematic/document/documentModel";
import { componentPinPoint } from "../../../src/schematic/connectivity";
import { readSheetPort } from "../../../src/schematic/hierarchyPins";
import { blockFields, canReferenceSheet, decodeSchematicProject, refreshProjectSymbols, serializeSchematicProject, singleSheetProject, type SchematicProject } from "../../../src/schematic/schematicProject";
import { buildProjectNetlist } from "../../../src/schematic/netlist/project";
import { printNetlist } from "../../../src/schematic/netlist/print";
import type { ComponentInstance } from "../../../src/schematic/types";

const instance = (id: string, ref: string, type: ComponentInstance["type"], x: number, y: number, values = {}): ComponentInstance =>
  ({ id, ref, type, x, y, values, rotation: 0, mirrored: false });

function projectFixture() {
  const pIn = instance("in", "IN", "sheetPort", 100, 100, { "port:type": "input", "port:side": "left", "port:order": "0", "port:slot": "0" });
  const pOut = instance("out", "OUT", "sheetPort", 340, 100, { "port:type": "output", "port:side": "right", "port:order": "1", "port:slot": "0" });
  const resistor = instance("load", "R1", "resistor", 220, 100, { main: "2k" });
  const divider = {
    id: "divider", name: "divider",
    content: contentFromDocument(createSchematicDocument({ components: [pIn, resistor, pOut], wires: [
      { id: "in-wire", points: [componentPinPoint(pIn, "terminal"), componentPinPoint(resistor, "p")] },
      { id: "out-wire", points: [componentPinPoint(resistor, "n"), componentPinPoint(pOut, "terminal")] }
    ].map(wire => ({ ...wire, routeMode: "orthogonal" as const })) }))
  };
  const block = instance("block", "X1", "sheetBlock", 400, 240, blockFields(divider));
  const project = singleSheetProject("project", "Test", createSchematicDocument({
    components: [block],
    wires: ["in", "out"].map((id, index) => {
      const point = componentPinPoint(block, id);
      return { id, routeMode: "orthogonal", points: [point, { x: point.x + 60 * (index ? 1 : -1), y: point.y }] };
    })
  }));
  project.sheets.push(divider);
  return project;
}

function print(project: SchematicProject) {
  const netlist = buildProjectNetlist(project);
  return [printNetlist(netlist, "spice"), printNetlist(netlist, "spectre")] as const;
}

describe("schematic hierarchy", () => {
  it("preserves formal pin names that differ only in case, including bus ranges", () => {
    const project = projectFixture();
    const child = project.sheets[1];
    const original = child.content.components.find(component => component.id === "out")!;
    const lowercase = { ...original, id: "lowercase", ref: "out", y: 180,
      values: { ...original.values, "port:order": "2", "port:slot": "1" } };
    const upperBus = { ...original, id: "upper-bus", ref: "DATA<1:0>", y: 260,
      values: { ...original.values, "port:order": "3", "port:slot": "2" } };
    const lowerBus = { ...upperBus, id: "lower-bus", ref: "data<1:0>", y: 340,
      values: { ...upperBus.values, "port:order": "4", "port:slot": "3" } };
    child.content = contentFromDocument(createSchematicDocument({
      ...child.content, components: [...child.content.components, lowercase, upperBus, lowerBus]
    }));
    refreshProjectSymbols(project);
    const restored = decodeSchematicProject(JSON.parse(serializeSchematicProject(project)));
    const design = buildProjectNetlist(restored);
    expect(design.sheets?.[0].ports).toEqual(["IN", "OUT", "out", "DATA_1", "DATA_0", "data_1", "data_0"]);
    expect(printNetlist(design, "spectre")).toContain("subckt divider (IN OUT out DATA_1 DATA_0 data_1 data_0)");
    expect(printNetlist(design, "spice")).toContain(".subckt divider IN OUT out_2 DATA_1 DATA_0 data_1_2 data_0_2");
  });

  it("expands hierarchy buses in declared order, nets scalar taps, and rejects direct width mismatches", () => {
    const childPort = instance("child-bus", "OUT<3:0>", "sheetPort", 80, 100, {
      "port:type": "output", "port:side": "right", "port:order": "0", "port:slot": "0"
    });
    const resistor = instance("child-res", "R1", "resistor", 350, 160, { main: "1k" });
    const terminal = componentPinPoint(childPort, "terminal");
    const positive = componentPinPoint(resistor, "p");
    const negative = componentPinPoint(resistor, "n");
    const wire = (id: string, first: typeof terminal, second: typeof terminal) =>
      ({ id, routeMode: "orthogonal" as const, points: [first, second] });
    const tag = (name: string, wireId: string, point: typeof terminal) =>
      ({ id: wireId + "-label", name, attachment: { wireId, point } });
    const child = {
      id: "bus_child", name: "bus_child",
      content: contentFromDocument(createSchematicDocument({ components: [childPort, resistor], wires: [
        wire("child-trunk", terminal, { x: 230, y: terminal.y }),
        wire("child-tap", { x: 260, y: positive.y }, positive),
        wire("literal-scalar", negative, { x: 450, y: negative.y })
      ], netLabels: [tag("OUT<2>", "child-tap", positive), tag("OUT_2", "literal-scalar", negative)] }))
    };
    const block = instance("parent-bus", "X1", "sheetBlock", 350, 200, blockFields(child));
    const endpoint = componentPinPoint(block, childPort.id);
    const parentWire = wire("parent-trunk", endpoint, { x: 600, y: endpoint.y });
    const parentTap = instance("parent-tap", "R2", "resistor", 450, 300, { main: "2k" });
    const tap = componentPinPoint(parentTap, "p");
    const ground = instance("tap-ground", "GND", "gnd", 550, 320);
    const project = singleSheetProject("bus", "Bus", createSchematicDocument({
      components: [block, parentTap, ground],
      wires: [parentWire, wire("parent-tap-wire", { x: 320, y: tap.y }, tap),
        wire("tap-return", componentPinPoint(parentTap, "n"), componentPinPoint(ground, "g"))],
      netLabels: [tag("DATA<0:3>", "parent-trunk", endpoint), tag("DATA<2>", "parent-tap-wire", tap)]
    }));
    project.sheets.push(child);
    const design = buildProjectNetlist(project);
    expect(design.diagnostics).toEqual([expect.objectContaining({ code: "SINGLE_PIN_NET", netName: "OUT_2" })]);
    expect(printNetlist(design, "spice")).toContain(".subckt bus_child OUT_3 OUT_2_2 OUT_1 OUT_0\n  R1 OUT_2_2 OUT_2 1k");
    expect(printNetlist(design, "spice")).toContain("X1 DATA_0 DATA_1 DATA_2 DATA_3 bus_child\n  R2 DATA_2");
    expect(printNetlist(design, "spectre")).toContain("X1 (DATA_0 DATA_1 DATA_2 DATA_3) bus_child");
    expect(print(decodeSchematicProject(JSON.parse(serializeSchematicProject(project))))).toEqual(print(project));

    const invalid = instance("invalid", "R3", "resistor", 640, endpoint.y, { main: "3k" });
    const content = project.sheets[0].content;
    project.sheets[0].content = contentFromDocument(createSchematicDocument({
      ...content, components: [...content.components, invalid]
    }));
    const mismatch = buildProjectNetlist(project);
    expect(mismatch.diagnostics).toContainEqual(expect.objectContaining({ code: "BUS_WIDTH_MISMATCH", componentId: invalid.id }));
    expect(mismatch.instances.find(item => item.componentId === invalid.id)?.nodes[0]).not.toMatch(/^DATA_/);
  });
  it("prints dependency-first SPICE and Spectre and round-trips the project package", () => {
    const project = projectFixture();
    const divider = project.sheets[1];
    const middle = instance("mid-x", "X1", "sheetBlock", 300, 300, blockFields(divider));
    const child = { id: "middle", name: "middle", content: contentFromDocument(createSchematicDocument({ components: [middle] })) };
    project.sheets.push(child);
    project.sheets[0].content.components.push(instance("top-x2", "X2", "sheetBlock", 800, 600, blockFields(child)));
    project.sheets[0].content.connections.pins["top-x2"] = {};
    const [spice, spectre] = print(project);
    expect(spice).toMatch(/\.subckt divider IN OUT\n  R1 IN OUT 2k/);
    expect(spice).toMatch(/X1 net\d+ net\d+ divider/);
    expect(spectre).toContain("subckt divider (IN OUT)\n  R1 (IN OUT) resistor r=2k");
    expect(spectre.indexOf("subckt divider")).toBeLessThan(spectre.indexOf("subckt middle"));
    expect(spectre.indexOf("subckt middle")).toBeLessThan(spectre.indexOf("subckt top"));
    expect(print(decodeSchematicProject(JSON.parse(serializeSchematicProject(project))))).toEqual([spice, spectre]);
    expect(canReferenceSheet(project, divider.id, "top")).toBe(false);
  });

  it("keeps parent wires and pin IDs when renaming, and leaves old ends open after moving or deleting a pin", () => {
    const project = projectFixture();
    const [top, divider] = project.sheets;
    const wires = structuredClone(top.content.wires);
    const wireBindings = structuredClone(top.content.connections.wires);
    const pOut = divider.content.components.find(component => component.id === "out")!;
    const original = structuredClone(top.content.connections.pins.block);
    pOut.ref = "VOUT";
    refreshProjectSymbols(project);
    expect(top.content.connections.pins.block).toEqual(original);
    expect(print(project)[0]).toContain(".subckt divider IN VOUT");
    pOut.values["port:side"] = "top";
    refreshProjectSymbols(project);
    expect(readSheetPort(pOut).order).toBe(1);
    expect(top.content.connections.pins.block.out).not.toBe(original.out);
    expect(top.content.connections.pins.block.in).toBe(original.in);
    expect(buildProjectNetlist(project).diagnostics).toContainEqual(expect.objectContaining({
      code: "UNBOUND_PORT", sheetId: "top", componentId: "block", pinId: "out"
    }));
    divider.content.components = divider.content.components.filter(component => component.id !== pOut.id);
    delete divider.content.connections.pins[pOut.id];
    refreshProjectSymbols(project);
    expect(top.content.connections.pins.block.out).toBeUndefined();
    expect(documentFromContent(top.content).wires).toEqual(wires);
    expect(top.content.connections.wires).toEqual(wireBindings);
    expect(decodeSchematicProject(JSON.parse(serializeSchematicProject(project))).sheets[0].content.wires).toEqual(wires);
  });

  it("rejects missing and cyclic sheet references while identifying the offending instance", () => {
    const project = projectFixture();
    project.sheets[0].content.components[0].values["sheet:target"] = "absent";
    expect(() => decodeSchematicProject(JSON.parse(serializeSchematicProject(project)))).toThrow(/MISSING_SHEET: top \/ X1/);
    project.sheets[0].content.components[0].values["sheet:target"] = "top";
    expect(() => decodeSchematicProject(JSON.parse(serializeSchematicProject(project)))).toThrow(/CYCLE: top \/ X1/);
  });
});
