import { connectFixtureJunction, fixtureDocument } from "../support/fixtureDocument";
import { disconnectJunction } from "../../../src/schematic/connectionGraph";
import { describe, expect, it } from "vitest";
import { extractNetlist } from "../../../src/schematic/netlist";
import { presentationJunctions } from "../../../src/schematic/connectivity";
import { transformPin } from "../../../src/schematic/geometry";
import { resolveComponentDef } from "../../../src/schematic/catalog";
import { deriveSchematicTopology } from "../../../src/schematic/topology";
import type { SchematicDocument } from "../../../src/schematic/types";
import { component, netAt } from "../support/testHelpers";

describe("schematic net extraction", () => {
  it("adds connected pin branch markers only to the presentation junction projection", () => {
    const throughResistor = component("resistor", "R1", 60, 100);
    const throughPin = transformPin(throughResistor, resolveComponentDef(throughResistor).pins[1]);
    const endpointPin = { x: 240, y: 100 };
    const cornerPin = { x: 440, y: 100 };
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [
        throughResistor,
        component("resistor", "R2", 200, 100),
        component("resistor", "R3", 280, 100),
        component("resistor", "R4", 400, 100),
        component("resistor", "R5", 440, 140, 90)
      ],
      junctions: [],
      wires: [
        {
          id: "through",
          routeMode: "orthogonal",
          points: [{ x: throughPin.x, y: throughPin.y - 40 }, { x: throughPin.x, y: throughPin.y + 40 }]
        },
        { id: "endpoint", routeMode: "orthogonal", points: [endpointPin, { x: endpointPin.x, y: endpointPin.y + 40 }] },
        {
          id: "corner",
          routeMode: "orthogonal",
          points: [{ x: cornerPin.x, y: cornerPin.y - 40 }, cornerPin, { x: cornerPin.x + 40, y: cornerPin.y }]
        }
      ]
    });

    extractNetlist(doc);

    expect(doc.junctions).toEqual([]);
    expect(presentationJunctions(doc)).toEqual([throughPin, endpointPin, cornerPin]);

    disconnectJunction(doc, endpointPin);
    extractNetlist(doc);
    expect(presentationJunctions(doc)).toEqual([throughPin, cornerPin]);
  });

  it("does not connect orthogonal X crossings by default", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      junctions: [],
      wires: [
        { id: "h", routeMode: "orthogonal", points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] },
        { id: "v", routeMode: "orthogonal", points: [{ x: 20, y: -20 }, { x: 20, y: 20 }] }
      ]
    });
    const netlist = extractNetlist(doc);
    expect(deriveSchematicTopology(doc).junctions).toHaveLength(0);
    expect(netlist.nets.size).toBe(2);
  });

  it("allows an intentional cross junction when a junction point is present", () => {
    const doc: SchematicDocument = fixtureDocument({
      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      junctions: [],

      wires: [
        { id: "h", routeMode: "orthogonal", points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] },
        { id: "v", routeMode: "orthogonal", points: [{ x: 20, y: -20 }, { x: 20, y: 20 }] }
      ]
    }, { joinAt: [{ x: 20, y: 0 }] });
    const netlist = extractNetlist(doc);
    expect(deriveSchematicTopology(doc).junctions).toEqual([{ x: 20, y: 0 }]);
    expect(netlist.nets.size).toBe(1);
  });

  it("does not treat a stale visible junction as user intent", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      junctions: [{ x: 20, y: 0 }],
      wires: [
        { id: "h", routeMode: "orthogonal", points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] },
        { id: "v", routeMode: "orthogonal", points: [{ x: 20, y: -20 }, { x: 20, y: 20 }] }
      ]
    });
    const netlist = extractNetlist(doc);
    expect(doc.junctions).toEqual([{ x: 20, y: 0 }]);
    expect(deriveSchematicTopology(doc).junctions).toHaveLength(0);
    expect(netlist.nets.size).toBe(2);
  });

  it("lets a junction disconnection split a cross back into independent nets", () => {
    const doc: SchematicDocument = fixtureDocument({
      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      junctions: [],

      wires: [
        { id: "h", routeMode: "orthogonal", points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] },
        { id: "v", routeMode: "orthogonal", points: [{ x: 20, y: -20 }, { x: 20, y: 20 }] }
      ]
    }, { joinAt: [{ x: 20, y: 0 }], disconnectAt: [{ x: 20, y: 0 }] });
    const netlist = extractNetlist(doc);
    expect(deriveSchematicTopology(doc).junctions).toHaveLength(0);
    expect(netlist.nets.size).toBe(2);
  });

  it("lets a deleted T junction disconnect the branch without cutting the through wire", () => {
    const doc: SchematicDocument = fixtureDocument({
      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      junctions: [],

      wires: [
        { id: "h", routeMode: "orthogonal", points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] },
        { id: "t", routeMode: "orthogonal", points: [{ x: 20, y: 0 }, { x: 20, y: 40 }] }
      ]
    }, { disconnectAt: [{ x: 20, y: 0 }] });
    const netlist = extractNetlist(doc);
    expect(deriveSchematicTopology(doc).junctions).toHaveLength(0);
    expect(netlist.nets.size).toBe(2);
    expect(netAt(doc, 0, 0)).toBe(netAt(doc, 40, 0));
    expect(netAt(doc, 20, 40)).not.toBe(netAt(doc, 0, 0));
  });

  it("does not let a real T junction turn a nearby bare X crossing into a connection", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      junctions: [],
      wires: [
        { id: "h", routeMode: "orthogonal", points: [{ x: 0, y: 0 }, { x: 120, y: 0 }] },
        { id: "bare-cross", routeMode: "orthogonal", points: [{ x: 40, y: -40 }, { x: 40, y: 40 }] },
        { id: "branch", routeMode: "orthogonal", points: [{ x: 80, y: 0 }, { x: 80, y: 40 }] }
      ]
    });
    const netlist = extractNetlist(doc);
    expect(deriveSchematicTopology(doc).junctions).toEqual([{ x: 80, y: 0 }]);
    expect(netlist.nets.size).toBe(2);
    expect(netAt(doc, 40, -40)).toBe(netAt(doc, 40, 40));
    expect(netAt(doc, 40, -40)).not.toBe(netAt(doc, 0, 0));
  });

  it("connects a cross when a fourth arm is drawn from an existing T junction", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      junctions: [],
      wires: [
        { id: "h", routeMode: "orthogonal", points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] },
        { id: "up", routeMode: "orthogonal", points: [{ x: 20, y: 0 }, { x: 20, y: -20 }] },
        { id: "down", routeMode: "orthogonal", points: [{ x: 20, y: 0 }, { x: 20, y: 20 }] }
      ]
    });
    const netlist = extractNetlist(doc);
    expect(deriveSchematicTopology(doc).junctions).toEqual([{ x: 20, y: 0 }]);
    expect(netlist.nets.size).toBe(1);
  });

  it("creates connection points for T-junctions", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      junctions: [],
      wires: [
        { id: "h", routeMode: "orthogonal", points: [{ x: 0, y: 0 }, { x: 40, y: 0 }] },
        { id: "t", routeMode: "orthogonal", points: [{ x: 20, y: 0 }, { x: 20, y: 40 }] }
      ]
    });
    const netlist = extractNetlist(doc);
    expect(deriveSchematicTopology(doc).junctions).toEqual([{ x: 20, y: 0 }]);
    expect(netlist.nets.size).toBe(1);
  });

  it("detects T-junctions against an existing L-shaped route", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      junctions: [],
      wires: [
        { id: "l", routeMode: "orthogonal", points: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 40 }] },
        { id: "branch", routeMode: "orthogonal", points: [{ x: 20, y: -20 }, { x: 20, y: 0 }] }
      ]
    });
    const netlist = extractNetlist(doc);
    expect(deriveSchematicTopology(doc).junctions).toEqual([{ x: 20, y: 0 }]);
    expect(netlist.nets.size).toBe(1);
  });

  it("shows a junction when three wire endpoints meet", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      junctions: [],
      wires: [
        { id: "left", routeMode: "orthogonal", points: [{ x: -20, y: 0 }, { x: 0, y: 0 }] },
        { id: "right", routeMode: "orthogonal", points: [{ x: 0, y: 0 }, { x: 20, y: 0 }] },
        { id: "down", routeMode: "orthogonal", points: [{ x: 0, y: 0 }, { x: 0, y: 20 }] }
      ]
    });
    const netlist = extractNetlist(doc);
    expect(deriveSchematicTopology(doc).junctions).toEqual([{ x: 0, y: 0 }]);
    expect(netlist.nets.size).toBe(1);
  });

  it("connects a diagonal endpoint to the middle of an orthogonal wire as a T junction", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      junctions: [],
      wires: [
        {
          id: "through",
          routeMode: "orthogonal",
          points: [{ x: 0, y: 40 }, { x: 80, y: 40 }]
        },
        {
          id: "diagonal",
          routeMode: "freeAngle",
          points: [{ x: 0, y: 0 }, { x: 40, y: 40 }]
        }
      ]
    });

    expect(extractNetlist(doc).nets.size).toBe(1);
    expect(deriveSchematicTopology(doc).junctions).toEqual([{ x: 40, y: 40 }]);
  });

  it("keeps diagonal interior X crossings separate unless an explicit junction exists", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      junctions: [],
      wires: [
        {
          id: "rising",
          routeMode: "freeAngle",
          points: [{ x: 0, y: 0 }, { x: 80, y: 80 }]
        },
        {
          id: "falling",
          routeMode: "freeAngle",
          points: [{ x: 0, y: 80 }, { x: 80, y: 0 }]
        }
      ]
    });

    expect(extractNetlist(doc).nets.size).toBe(2);
    expect(deriveSchematicTopology(doc).junctions).toEqual([]);

    connectFixtureJunction(doc, { x: 40, y: 40 });
    expect(extractNetlist(doc).nets.size).toBe(1);
    expect(deriveSchematicTopology(doc).junctions).toEqual([{ x: 40, y: 40 }]);
  });

  it("connects collinear overlapping free-angle wires", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      junctions: [],
      wires: [
        {
          id: "first",
          routeMode: "freeAngle",
          points: [{ x: 0, y: 0 }, { x: 80, y: 40 }]
        },
        {
          id: "second",
          routeMode: "freeAngle",
          points: [{ x: 40, y: 20 }, { x: 120, y: 60 }]
        }
      ]
    });

    expect(extractNetlist(doc).nets.size).toBe(1);
  });

  it("treats wide wires as electrically identical to normal wires", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      junctions: [],
      wires: [
        { id: "normal", routeMode: "orthogonal", points: [{ x: 0, y: 0 }, { x: 20, y: 0 }] },
        { id: "wide", routeMode: "orthogonal", appearance: { variant: "wide" }, points: [{ x: 20, y: 0 }, { x: 40, y: 0 }] }
      ]
    });
    const netlist = extractNetlist(doc);
    expect(netlist.nets.size).toBe(1);
  });

  it("excludes temporarily deleted objects from net extraction", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [component("resistor", "R1", 40, 0), component("gnd", "GND1", 80, 20)],
      junctions: [],
      wires: [{ id: "grounded", routeMode: "orthogonal", temporarilyDeleted: true, points: [{ x: 80, y: 0 }, { x: 0, y: 0 }] }]
    });
    const netlist = extractNetlist(doc);
    expect(netlist.pins.find((pin) => pin.componentRef === "R1" && pin.pinId === "p")?.netId).not.toBe("0");

    doc.components[0].temporarilyDeleted = true;
    const withoutR = extractNetlist(doc);
    expect(withoutR.components.some((candidate) => candidate.instance.ref === "R1")).toBe(false);
  });

  it("does not invent an implicit reference when no ground symbol is present", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [component("resistor", "R1", 40, 0)],
      junctions: [],
      wires: []
    });
    const netlist = extractNetlist(doc);
    expect(netlist.nets.has("0")).toBe(false);
  });

  it("does not report selected-style open port nets as floating errors", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [component("resistor", "R1", 60, 0)],
      junctions: [],
      wires: [{ id: "port", routeMode: "orthogonal", points: [{ x: 0, y: 0 }, { x: 20, y: 0 }] }]
    });
    const netlist = extractNetlist(doc);
    expect(netlist.diagnostics).toHaveLength(0);
  });

  it("keeps schematic notes out of net extraction", () => {
    const doc: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [component("resistor", "R1", 40, 0)],
      junctions: [],
      wires: [],
      notes: [
        {
          id: "note-1",
          x: 20,
          y: 20,
          width: 240,
          height: 80,
          anchor: "upperLeft",
          text: "R1 is intentionally floating"
        }
      ]
    });

    const netlist = extractNetlist(doc);
    expect(netlist.components.map((item) => item.instance.ref)).toEqual(["R1"]);
    expect(netlist.components.some((item) => item.instance.id === "note-1")).toBe(false);
    expect(netlist.pins.every((pin) => pin.componentId !== "note-1")).toBe(true);
  });
});
