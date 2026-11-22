import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { analyzeSchematic } from "../../../src/schematic/analysis/analysis";
import { extractNetlist } from "../../../src/schematic/netlist";
import { resolveSchematicNets, validateNetLabelName } from "../../../src/schematic/netResolution";
import type { NetLabel, Point, SchematicDocument, Wire } from "../../../src/schematic/types";
import { fixtureComponent } from "../support/fixtures";

function wire(id: string, start: Point, end: Point, temporarilyDeleted = false): Wire {
  return { id, points: [start, end], routeMode: "orthogonal", temporarilyDeleted };
}

function label(id: string, name: string, wireId: string, point: Point): NetLabel {
  return { id, name, attachment: { wireId, point } };
}

function document(wires: Wire[], netLabels: NetLabel[] = []): SchematicDocument {
  return fixtureDocument({

    junctionAppearances: [],
    notes: [], components: [], wires, junctions: [], netLabels });
}

describe("schematic net resolution", () => {
  it("validates and normalizes label names", () => {
    expect(validateNetLabelName("  CLK<1>  ")).toEqual({ valid: true, name: "CLK<1>" });
    expect(validateNetLabelName("OUT<07:0>")).toEqual({ valid: true, name: "OUT<7:0>" });
    expect(validateNetLabelName("OUT<3:>")).toMatchObject({ valid: false });
    expect(validateNetLabelName("OUT<256:0>")).toMatchObject({ valid: false });
    expect(validateNetLabelName("CLK 1").valid).toBe(false);
    expect(validateNetLabelName("\u0000CLK").valid).toBe(false);
  });

  it("keeps malformed persisted labels out of electrical resolution", () => {
    const doc = document(
      [wire("wire", { x: 0, y: 0 }, { x: 80, y: 0 })],
      [label("invalid", "BAD NAME", "wire", { x: 20, y: 0 }), label("trimmed", "  OUT  ", "wire", { x: 60, y: 0 })]
    );
    const resolution = resolveSchematicNets(doc);

    expect(resolution.labelStates.get("invalid")?.status).toBe("conflict");
    expect(resolution.labelStates.get("invalid")?.message).toContain("Whitespace is not allowed");
    expect(resolution.labelStates.get("trimmed")?.status).toBe("valid");
    expect(resolution.wireNetNames.get("wire")).toBe("OUT");
  });

  it("uses deterministic component-pin names and geometric pure-wire fallbacks", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [fixtureComponent("nmos", "M10", 200, 200), fixtureComponent("nmos", "M2", 200, 200)],
      wires: [
        wire("later", { x: 400, y: 100 }, { x: 440, y: 100 }),
        wire("earlier", { x: 20, y: 100 }, { x: 60, y: 100 })
      ],
      junctions: []
    });
    const resolution = resolveSchematicNets(doc);

    expect(resolution.nets.has("M2_D")).toBe(true);
    expect(resolution.nets.has("M2_G")).toBe(true);
    expect(resolution.nets.has("M2_S")).toBe(true);
    expect(resolution.wireNetNames.get("earlier")).toBe("NET_1");
    expect(resolution.wireNetNames.get("later")).toBe("NET_2");
    expect(resolution.nets.has("0")).toBe(false);
  });

  it("connects separate physical nets through valid case-sensitive labels", () => {
    const doc = document(
      [wire("left", { x: 0, y: 0 }, { x: 40, y: 0 }), wire("right", { x: 200, y: 0 }, { x: 240, y: 0 })],
      [label("l1", "OUT", "left", { x: 20, y: 0 }), label("l2", "OUT", "right", { x: 220, y: 0 })]
    );
    const resolution = resolveSchematicNets(doc);

    expect(resolution.nets.size).toBe(1);
    expect(resolution.wireNetNames.get("left")).toBe("OUT");
    expect(resolution.wireNetNames.get("right")).toBe("OUT");
    expect(resolution.labelStates.get("l1")?.status).toBe("valid");
    expect(resolution.labelStates.get("l2")?.status).toBe("valid");

    doc.netLabels![1].name = "out";
    const caseSensitive = resolveSchematicNets(doc);
    expect(caseSensitive.nets.has("OUT")).toBe(true);
    expect(caseSensitive.nets.has("out")).toBe(true);
  });

  it("keeps the earliest name on one physical net and promotes the next label after deletion", () => {
    const doc = document(
      [wire("shared", { x: 0, y: 0 }, { x: 80, y: 0 }), wire("remote", { x: 200, y: 0 }, { x: 240, y: 0 })],
      [
        label("winner", "A", "shared", { x: 20, y: 0 }),
        label("loser", "B", "shared", { x: 60, y: 0 }),
        label("remote-b", "B", "remote", { x: 220, y: 0 })
      ]
    );
    const resolution = resolveSchematicNets(doc);
    expect(resolution.labelStates.get("winner")?.status).toBe("valid");
    expect(resolution.labelStates.get("loser")?.status).toBe("conflict");
    expect(resolution.wireNetNames.get("shared")).toBe("A");
    expect(resolution.wireNetNames.get("remote")).toBe("B");

    doc.netLabels = doc.netLabels!.filter((candidate) => candidate.id !== "winner");
    const promoted = resolveSchematicNets(doc);
    expect(promoted.labelStates.get("loser")?.status).toBe("valid");
    expect(promoted.nets.size).toBe(1);
    expect(promoted.wireNetNames.get("shared")).toBe("B");
  });

  it("merges disconnected and overlapping bundles by bit name and connects single-bit taps", () => {
    const branches = ["trunk", "remote", "slice", "tap", "other", "scalar"].map((id, index) =>
      wire(id, { x: 0, y: index * 60 }, { x: 100, y: index * 60 }));
    const names = ["OUT<7:0>", "OUT<0:7>", "OUT<4:2>", "OUT<3>", "OUT<5>", "OUT"];
    const doc = document(branches, names.map((name, index) =>
      label("label-" + index, name, branches[index].id, { x: 40, y: index * 60 })));
    const result = resolveSchematicNets(doc);

    expect([...result.busWireIds]).toEqual(["trunk", "remote", "slice"]);
    expect(result.labelStates.get("label-0")?.netNames).toEqual(["OUT<7>", "OUT<6>", "OUT<5>", "OUT<4>", "OUT<3>", "OUT<2>", "OUT<1>", "OUT<0>"]);
    expect(result.labelStates.get("label-1")?.netNames).toEqual(["OUT<0>", "OUT<1>", "OUT<2>", "OUT<3>", "OUT<4>", "OUT<5>", "OUT<6>", "OUT<7>"]);
    expect(result.nets.get("OUT<3>")?.wireIds).toEqual(["trunk", "remote", "slice", "tap"]);
    expect(result.nets.get("OUT<5>")?.wireIds).toEqual(["trunk", "remote", "other"]);
    expect(result.nets.get("OUT")?.wireIds).toEqual(["scalar"]);
    expect(result.nets.size).toBe(9);
  });

  it("keeps label conflicts out of blocking netlist diagnostics", () => {
    const doc = document(
      [wire("shared", { x: 0, y: 0 }, { x: 80, y: 0 })],
      [label("winner", "A", "shared", { x: 20, y: 0 }), label("loser", "B", "shared", { x: 60, y: 0 })]
    );

    const netlist = extractNetlist(doc);
    expect(netlist.nets.has("A")).toBe(true);
    expect(netlist.nets.has("B")).toBe(false);
    expect(netlist.diagnostics).toEqual([]);
  });

  it("merges label 0 into ground and marks other ground labels as conflicts", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      notes: [],
      components: [fixtureComponent("gnd", "GND1", 40, 20)],
      wires: [
        wire("ground", { x: 40, y: 0 }, { x: 80, y: 0 }),
        wire("remote", { x: 200, y: 0 }, { x: 240, y: 0 })
      ],
      junctions: [],
      netLabels: [
        label("bad-ground", "VSS", "ground", { x: 60, y: 0 }),
        label("zero", "0", "remote", { x: 220, y: 0 })
      ]
    });
    const resolution = resolveSchematicNets(doc);
    expect(resolution.wireNetNames.get("ground")).toBe("0");
    expect(resolution.wireNetNames.get("remote")).toBe("0");
    expect(resolution.labelStates.get("bad-ground")?.status).toBe("conflict");
    expect(resolution.hasReferenceGround).toBe(true);
    expect(resolution.nets.get("0")?.physicalRoots).toHaveLength(2);
    expect(resolution.nets.get("0")?.wireIds.sort()).toEqual(["ground", "remote"]);
  });

  it("deduplicates automatic names without electrically merging them", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      notes: [],
      components: [fixtureComponent("resistor", "R1", 100, 100)],
      wires: [wire("explicit", { x: 300, y: 100 }, { x: 340, y: 100 })],
      junctions: [],
      netLabels: [label("explicit-name", "R1_P", "explicit", { x: 320, y: 100 })]
    });
    const resolution = resolveSchematicNets(doc);
    expect(resolution.nets.has("R1_P")).toBe(true);
    expect(resolution.nets.has("R1_P_2")).toBe(true);
  });

  it("deactivates labels with temporarily deleted supporting wires", () => {
    const doc = document(
      [wire("active", { x: 0, y: 0 }, { x: 40, y: 0 }), wire("inactive", { x: 200, y: 0 }, { x: 240, y: 0 }, true)],
      [label("active-label", "N", "active", { x: 20, y: 0 }), label("inactive-label", "N", "inactive", { x: 220, y: 0 })]
    );
    const resolution = resolveSchematicNets(doc);
    expect(resolution.labelStates.get("inactive-label")?.status).toBe("inactive");
    expect(resolution.nets.get("N")?.physicalRoots).toHaveLength(1);
  });

  it("uses resolved names in netlists and blocks analysis without reference ground", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [fixtureComponent("resistor", "R1", 100, 100)],
      wires: [],
      junctions: []
    });
    expect(Array.from(extractNetlist(doc).nets.keys())).toEqual(expect.arrayContaining(["R1_P", "R1_N"]));
    const result = analyzeSchematic(doc, { inputP: "R1_P", inputN: "R1_N", outputP: "R1_P", outputN: "R1_N" });
    expect(result.ok).toBe(false);
    expect(result.diagnostics.join(" ")).toContain("No reference ground");
  });

  it("indexes large disconnected documents without changing deterministic net names", () => {
    const componentCount = 2_500;
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: Array.from({ length: componentCount }, (_, index) =>
        fixtureComponent("resistor", `R${index + 1}`, index * 100, 0)
      ),
      wires: [],
      junctions: []
    });

    const resolution = resolveSchematicNets(doc);
    const netlist = extractNetlist(doc, resolution);

    expect(resolution.nets.size).toBe(componentCount * 2);
    expect(resolution.nets.has("R1_P")).toBe(true);
    expect(resolution.nets.has(`R${componentCount}_N`)).toBe(true);
    expect(netlist.pins).toHaveLength(componentCount * 2);
    expect(netlist.components.at(-1)?.pins).toEqual({
      p: `R${componentCount}_P`,
      n: `R${componentCount}_N`
    });
  });
});
