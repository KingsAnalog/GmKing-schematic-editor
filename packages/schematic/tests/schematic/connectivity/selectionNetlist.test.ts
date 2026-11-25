import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { buildSchematicSelectionNetlist } from "../../../src/schematic/selection/selectionNetlist";
import type { NetLabel, SchematicDocument } from "../../../src/schematic/types";
import { fixtureComponent, fixtureWire, twoResistorsStraightWireDoc } from "../support/fixtures";

describe("schematic selection netlist", () => {
  it("formats one connected selected circuit as one subcircuit", () => {
    const document = twoResistorsStraightWireDoc();

    expect(buildSchematicSelectionNetlist(document, ["R1", "R2"])).toEqual({
      text: [
        "subckt copied_sub_circuit()",
        "",
        "    R1 (R1_P R1_N) resistor",
        "    R2 (R1_N R2_N) resistor",
        "",
        "ends copied_sub_circuit"
      ].join("\n"),
      subcircuitCount: 1,
      componentCount: 2
    });
  });

  it("splits disconnected selected circuits into numbered subcircuits", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [
        fixtureComponent("resistor", "R1", 200, 200),
        fixtureComponent("resistor", "R2", 360, 200),
        fixtureComponent("resistor", "R3", 200, 400),
        fixtureComponent("resistor", "R4", 360, 400)
      ],
      wires: [
        fixtureWire("upper", [{ x: 240, y: 200 }, { x: 320, y: 200 }]),
        fixtureWire("lower", [{ x: 240, y: 400 }, { x: 320, y: 400 }])
      ],
      junctions: []
    });

    expect(buildSchematicSelectionNetlist(document, ["R1", "R2", "R3", "R4"])?.text).toBe([
      "subckt copied_sub_circuit1()",
      "",
      "    R1 (R1_P R1_N) resistor",
      "    R2 (R1_N R2_N) resistor",
      "",
      "ends copied_sub_circuit1",
      "",
      "",
      "subckt copied_sub_circuit2()",
      "",
      "    R3 (R3_P R3_N) resistor",
      "    R4 (R3_N R4_N) resistor",
      "",
      "ends copied_sub_circuit2"
    ].join("\n"));
  });

  it("uses valid same-name labels to group physically separate selected components", () => {
    const labels: NetLabel[] = [
      { id: "left-label", name: "OUT", attachment: { wireId: "left", point: { x: 140, y: 200 } } },
      { id: "right-label", name: "OUT", attachment: { wireId: "right", point: { x: 440, y: 200 } } }
    ];
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      notes: [],
      components: [fixtureComponent("resistor", "R1", 200, 200), fixtureComponent("resistor", "R2", 500, 200)],
      wires: [
        fixtureWire("left", [{ x: 120, y: 200 }, { x: 160, y: 200 }]),
        fixtureWire("right", [{ x: 420, y: 200 }, { x: 460, y: 200 }])
      ],
      junctions: [],
      netLabels: labels
    });

    const exported = buildSchematicSelectionNetlist(document, ["R1", "R2"]);
    expect(exported?.subcircuitCount).toBe(1);
    expect(exported?.text).toContain("    R1 (OUT R1_N) resistor");
    expect(exported?.text).toContain("    R2 (OUT R2_N) resistor");
  });

  it("uses semantic D G S B ordering for four-pin MOS instances", () => {
    const pmos = fixtureComponent("pmos", "MP_REF", 200, 200);
    pmos.variantId = "4pin-current";
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [], components: [pmos], wires: [], junctions: [] });

    expect(buildSchematicSelectionNetlist(document, [pmos.id])?.text).toContain(
      "    MP_REF (MP_REF_D MP_REF_G MP_REF_S MP_REF_B) pmos"
    );
  });

  it("uses semantic C B E ordering for both BJT layouts", () => {
    const npn = fixtureComponent("npn", "Q1", 200, 200);
    const pnp = fixtureComponent("pnp", "Q2", 400, 200);
    const document: SchematicDocument = fixtureDocument({
       junctionAppearances: [], netLabels: [], notes: [],
      components: [npn, pnp], wires: [], junctions: []
    });

    const text = buildSchematicSelectionNetlist(document, [npn.id, pnp.id])?.text ?? "";
    expect(text).toContain("    Q1 (Q1_C Q1_B Q1_E) npn");
    expect(text).toContain("    Q2 (Q2_C Q2_B Q2_E) pnp");
  });

  it("omits a pin-free pure rectangle from the electrical netlist", () => {
    const rectangle = fixtureComponent("rectangle", "XBOX", 200, 200);
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [rectangle],
      wires: [],
      junctions: []
    });

    expect(buildSchematicSelectionNetlist(document, [rectangle.id])).toBeNull();
  });

  it("ignores temporary and non-instance symbols and returns null without devices", () => {
    const resistor = { ...fixtureComponent("resistor", "R1", 200, 200), temporarilyDeleted: true };
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [resistor, fixtureComponent("gnd", "GND1", 100, 100), fixtureComponent("vdd", "VDD1", 300, 100)],
      wires: [],
      junctions: []
    });

    expect(buildSchematicSelectionNetlist(document, document.components.map((component) => component.id))).toBeNull();
  });
});
