import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { buildConnectivity, buildVisibleJunctions } from "../../../src/schematic/connectivity";
import type { Point, SchematicDocument, Wire } from "../../../src/schematic/types";

function wire(id: string, points: Wire["points"], temporarilyDeleted = false): Wire {
  return { id, points, routeMode: "orthogonal", temporarilyDeleted };
}

function documentWith(wires: Wire[], edits: { joinAt?: Point[]; disconnectAt?: Point[] } = {}): SchematicDocument {
  return fixtureDocument({ wires }, edits);
}

describe("live schematic junction calculation", () => {
  it.each([
    {
      name: "T junction",
      document: documentWith([
        wire("horizontal", [{ x: 0, y: 0 }, { x: 80, y: 0 }]),
        wire("branch", [{ x: 40, y: 0 }, { x: 40, y: 40 }])
      ]),
      expected: [{ x: 40, y: 0 }]
    },
    {
      name: "unconnected X crossing",
      document: documentWith([
        wire("horizontal", [{ x: 0, y: 20 }, { x: 80, y: 20 }]),
        wire("vertical", [{ x: 40, y: 0 }, { x: 40, y: 40 }])
      ]),
      expected: []
    },
    {
      name: "explicit X crossing",
      document: documentWith(
        [
          wire("horizontal", [{ x: 0, y: 20 }, { x: 80, y: 20 }]),
          wire("vertical", [{ x: 40, y: 0 }, { x: 40, y: 40 }])
        ],
        { joinAt: [{ x: 40, y: 20 }] }
      ),
      expected: [{ x: 40, y: 20 }]
    },
    {
      name: "disconnected T crossing",
      document: documentWith(
        [
          wire("horizontal", [{ x: 0, y: 0 }, { x: 80, y: 0 }]),
          wire("branch", [{ x: 40, y: 0 }, { x: 40, y: 40 }])
        ],
        { disconnectAt: [{ x: 40, y: 0 }] }
      ),
      expected: []
    },
    {
      name: "temporarily deleted branch",
      document: documentWith([
        wire("horizontal", [{ x: 0, y: 0 }, { x: 80, y: 0 }]),
        wire("branch", [{ x: 40, y: 0 }, { x: 40, y: 40 }], true)
      ]),
      expected: []
    }
  ])("matches connectivity for $name", ({ document, expected }) => {
    expect(buildVisibleJunctions(document)).toEqual(expected);
    expect(buildVisibleJunctions(document)).toEqual(buildConnectivity(document).junctions);
  });

  it("matches full connectivity across a dense multi-net document", () => {
    const wires: Wire[] = [];
    for (let group = 0; group < 20; group += 1) {
      const y = group * 80;
      wires.push(
        wire(`h-${group}`, [{ x: 0, y }, { x: 160, y }]),
        wire(`b1-${group}`, [{ x: 40, y }, { x: 40, y: y + 40 }]),
        wire(`b2-${group}`, [{ x: 80, y }, { x: 80, y: y + 40 }]),
        wire(`b3-${group}`, [{ x: 120, y }, { x: 120, y: y + 40 }])
      );
    }
    const document = documentWith(wires);

    expect(buildVisibleJunctions(document)).toEqual(buildConnectivity(document).junctions);
    expect(buildVisibleJunctions(document)).toHaveLength(60);
  });
});
