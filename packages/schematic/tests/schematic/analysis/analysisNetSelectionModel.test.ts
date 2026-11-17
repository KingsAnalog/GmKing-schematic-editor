import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { resolveComponentDef } from "../../../src/schematic/catalog";
import {
  analysisPortLabel,
  nearestVoltageNet,
  normalizeAnalysisPortSelection,
  sortAnalysisNets,
  VOLTAGE_NET_NODE_PICK_RADIUS,
  VOLTAGE_NET_SEGMENT_PICK_RADIUS
} from "../../../src/schematic/analysis/analysisNetSelectionModel";
import { componentPinPoint } from "../../../src/schematic/netlist";
import type { SchematicDocument } from "../../../src/schematic/types";
import { fixtureComponent, fixtureWire } from "../support/fixtures";

describe("schematic analysis net-selection model", () => {
  it("labels analysis ports and fallback pick targets", () => {
    expect(analysisPortLabel("inputP")).toBe("Input +");
    expect(analysisPortLabel("inputN")).toBe("Input -");
    expect(analysisPortLabel("outputP")).toBe("Output +");
    expect(analysisPortLabel("outputN")).toBe("Output -");
    expect(analysisPortLabel(null)).toBe("analysis port");
  });

  it("sorts the reference net first", () => {
    expect(sortAnalysisNets(["n2", "n1", "0", "netA"])).toEqual(["0", "n1", "n2", "netA"]);
  });

  it("keeps valid selections and clears stale selections", () => {
    const selection = normalizeAnalysisPortSelection(
      { inputP: "n1", inputN: "stale", outputP: "0", outputN: "n2" },
      ["0", "n1", "n2"]
    );

    expect(selection).toEqual({ inputP: "n1", inputN: "", outputP: "0", outputN: "n2" });
  });

  it("picks the nearest wire segment", () => {
    const picked = nearestVoltageNet(straightWireDocument(), { x: 50, y: 8 });

    expect(picked?.net).toBe("NET_1");
    expect(picked?.distance).toBeCloseTo(8);
  });

  it("picks endpoints and generated junctions with the node threshold", () => {
    const endpointPick = nearestVoltageNet(straightWireDocument(), { x: -17, y: 0 });
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      wires: [
        fixtureWire("h", [
          { x: 0, y: 0 },
          { x: 100, y: 0 }
        ]),
        fixtureWire("branch", [
          { x: 50, y: 0 },
          { x: 50, y: 60 }
        ])
      ],
      junctions: []
    });
    const junctionPick = nearestVoltageNet(document, { x: 62.5, y: 12.5 });

    expect(endpointPick?.net).toBe("NET_1");
    expect(endpointPick?.distance).toBeCloseTo(17);
    expect(junctionPick?.net).toBe("NET_1");
    expect(document.junctions).toEqual([]);
  });

  it("ignores temporarily deleted wires", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      wires: [
        {
          ...fixtureWire("deleted", [
            { x: 0, y: 0 },
            { x: 100, y: 0 }
          ]),
          temporarilyDeleted: true
        }
      ],
      junctions: []
    });

    expect(nearestVoltageNet(document, { x: 50, y: 0 })).toBeNull();
  });

  it("rejects component-pin-only points without a wire", () => {
    const component = fixtureComponent("resistor", "R1", 100, 100);
    const pin = resolveComponentDef(component).pins[0];
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [component],
      wires: [],
      junctions: []
    });

    expect(nearestVoltageNet(document, componentPinPoint(component, pin.id))).toBeNull();
  });

  it("respects segment and node pick thresholds", () => {
    const document = straightWireDocument();

    expect(nearestVoltageNet(document, { x: 50, y: VOLTAGE_NET_SEGMENT_PICK_RADIUS })?.net).toBe("NET_1");
    expect(nearestVoltageNet(document, { x: 50, y: VOLTAGE_NET_SEGMENT_PICK_RADIUS + 0.1 })?.net).toBe("NET_1");
    expect(nearestVoltageNet(document, { x: 50, y: VOLTAGE_NET_NODE_PICK_RADIUS + 0.1 })).toBeNull();
    expect(nearestVoltageNet(document, { x: -VOLTAGE_NET_NODE_PICK_RADIUS, y: 0 })?.net).toBe("NET_1");
    expect(nearestVoltageNet(document, { x: -(VOLTAGE_NET_NODE_PICK_RADIUS + 0.1), y: 0 })).toBeNull();
  });
});

function straightWireDocument(): SchematicDocument {
  return fixtureDocument({

    junctionAppearances: [],
    netLabels: [],
    notes: [],
    components: [],
    wires: [
      fixtureWire("w1", [
        { x: 0, y: 0 },
        { x: 100, y: 0 }
      ])
    ],
    junctions: []
  });
}
