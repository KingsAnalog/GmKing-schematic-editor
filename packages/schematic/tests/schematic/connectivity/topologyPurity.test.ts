import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { extractNetlist } from "../../../src/schematic/netlist";
import { deriveSchematicTopology } from "../../../src/schematic/topology";
import type { SchematicContent, SchematicDocument } from "../../../src/schematic/types";

function branchedContent(): SchematicContent {
  return fixtureDocument({
    components: [],
    wires: [
      {
        id: "through",
        routeMode: "orthogonal",
        points: [{ x: 0, y: 0 }, { x: 80, y: 0 }]
      },
      {
        id: "branch",
        routeMode: "orthogonal",
        points: [{ x: 40, y: 0 }, { x: 40, y: 40 }]
      }
    ],

    junctionAppearances: [],
    netLabels: [],
    notes: []
  });
}

describe("schematic topology derivation", () => {
  it("derives connectivity, net resolution, and junctions without durable-content mutation", () => {
    const content = branchedContent();
    const before = structuredClone(content);

    const first = deriveSchematicTopology(content);
    const second = deriveSchematicTopology(content);

    expect(content).toEqual(before);
    expect(first.junctions).toEqual([{ x: 40, y: 0 }]);
    expect(first.netResolution.connectivity).toBe(first.connectivity);
    expect(second.junctions).toEqual(first.junctions);
    expect(Array.from(second.netResolution.nets.keys())).toEqual(
      Array.from(first.netResolution.nets.keys())
    );
  });

  it("keeps both the compatibility document and a supplied derived resolution unchanged", () => {
    const document: SchematicDocument = {
      ...branchedContent(),
      junctions: [{ x: 999, y: 999 }]
    };
    const topology = deriveSchematicTopology(document);
    const documentBefore = structuredClone(document);
    const pinsBefore = structuredClone(topology.netResolution.connectivity.pins);

    const netlist = extractNetlist(document, topology.netResolution);

    expect(document).toEqual(documentBefore);
    expect(topology.netResolution.connectivity.pins).toEqual(pinsBefore);
    expect(netlist.pins).not.toBe(topology.netResolution.connectivity.pins);
  });

  it("uses the shared topology pipeline for the default netlist resolution", () => {
    const content = branchedContent();
    const before = structuredClone(content);

    const netlist = extractNetlist(content);
    const topology = deriveSchematicTopology(content);

    expect(content).toEqual(before);
    expect(Array.from(netlist.nets.entries())).toEqual(
      Array.from(topology.netResolution.nets, ([name, net]) => [name, net.points])
    );
  });
});
