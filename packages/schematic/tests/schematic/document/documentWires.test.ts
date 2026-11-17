import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { buildConnectivity } from "../../../src/schematic/connectivity";
import { applyNormalizedDocumentWires, normalizeDocumentWires } from "../../../src/schematic/document/documentWires";
import type { Point, SchematicDocument, Wire, WireAppearance } from "../../../src/schematic/types";

function wire(id: string, points: Point[], options: { appearance?: WireAppearance; temporarilyDeleted?: boolean } = {}): Wire {
  return {
    id,
    routeMode: "orthogonal",
    points: points.map((point) => ({ ...point })),
    ...(options.appearance ? { appearance: options.appearance } : {}),
    ...(options.temporarilyDeleted ? { temporarilyDeleted: true } : {})
  };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

describe("schematic document wires", () => {
  it("normalizes document wires as a pure computation", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      wires: [wire("w-route", [{ x: 3, y: 2 }, { x: 79, y: 1 }, { x: 81, y: 42 }])],
      junctions: []
    });
    const originalWires = clone(document.wires);
    const originalWireRefs = [...document.wires];

    const normalized = normalizeDocumentWires(document);

    expect(normalized).not.toBe(document.wires);
    expect(document.wires).toEqual(originalWires);
    expect(document.wires[0]).toBe(originalWireRefs[0]);
    expect(normalized.map((candidate) => candidate.id)).toEqual(["w-route", "w-route-segment-1"]);
    expect(normalized[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 80, y: 0 }
    ]);
    expect(normalized[1].points).toEqual([
      { x: 80, y: 0 },
      { x: 80, y: 40 }
    ]);
  });

  it("normalizes free-angle wires while preserving a separate diagonal wire and mixed source order", () => {
    const freeAngle: Wire = {
      id: "free-angle",
      routeMode: "freeAngle",
      points: [{ x: 1, y: 1 }, { x: 39, y: 39 }]
    };
    const metro: Wire = {
      id: "diagonal",
      routeMode: "freeAngle",
      points: [{ x: 0, y: 160 }, { x: 40, y: 200 }]
    };
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [{
        id: "diagonal-label",
        name: "BUS",
        attachment: { wireId: freeAngle.id, point: { x: 20, y: 20 } }
      }],
      notes: [],
      components: [],
      wires: [
        freeAngle,
        wire("horizontal", [{ x: 0, y: 80 }, { x: 80, y: 80 }]),
        metro,
        wire("branch", [{ x: 40, y: 80 }, { x: 40, y: 120 }])
      ],
      junctions: []
    });
    const original = clone(document);

    const normalized = normalizeDocumentWires(document);

    expect(normalized.map((candidate) => candidate.id)).toEqual([
      "free-angle",
      "horizontal",
      "horizontal-segment-1",
      "diagonal",
      "branch"
    ]);
    expect(normalized[0]).toMatchObject({
      routeMode: "freeAngle",
      points: [{ x: 0, y: 0 }, { x: 40, y: 40 }]
    });
    expect(normalized[3]).toEqual(metro);
    expect(document).toEqual(original);

    applyNormalizedDocumentWires(document);
    expect(document.netLabels[0].attachment).toEqual({
      wireId: "free-angle",
      point: { x: 20, y: 20 }
    });
  });

  it("merges collinear free-angle continuations", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      junctions: [],
      wires: [
        {
          id: "first",
          routeMode: "freeAngle",
          points: [{ x: 0, y: 0 }, { x: 40, y: 20 }],
          appearance: { variant: "signal" }
        },
        {
          id: "second",
          routeMode: "freeAngle",
          points: [{ x: 40, y: 20 }, { x: 80, y: 40 }],
          appearance: { variant: "signal" }
        }
      ]
    });

    expect(normalizeDocumentWires(document)).toEqual([{
      id: "second",
      routeMode: "freeAngle",
      points: [{ x: 0, y: 0 }, { x: 80, y: 40 }],
      appearance: { variant: "signal" }
    }]);
  });

  it("keeps a free-angle endpoint arrow at the extended outer end across repeated normalization", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      junctions: [],
      wires: [
        {
          id: "decorated",
          routeMode: "freeAngle",
          points: [{ x: 0, y: 0 }, { x: 40, y: 20 }],
          appearance: { variant: "signal", endMarker: "arrow" }
        },
        {
          id: "continuation",
          routeMode: "freeAngle",
          points: [{ x: 40, y: 20 }, { x: 80, y: 40 }],
          appearance: { variant: "signal" }
        }
      ]
    });

    applyNormalizedDocumentWires(document);
    const firstPass = clone(document.wires);
    applyNormalizedDocumentWires(document);

    expect(document.wires).toEqual(firstPass);
    expect(document.wires).toHaveLength(1);
    expect(document.wires.filter((candidate) => candidate.appearance?.endMarker === "arrow"))
      .toEqual([expect.objectContaining({ points: [{ x: 0, y: 0 }, { x: 80, y: 40 }] })]);
  });

  it("writes merged collinear wires back only through the explicit helper", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      wires: [
        wire("short", [{ x: 40, y: 0 }, { x: 80, y: 0 }]),
        wire("long", [{ x: 0, y: 0 }, { x: 120, y: 0 }])
      ],
      junctions: []
    });
    const originalWires = document.wires;

    const normalized = applyNormalizedDocumentWires(document);

    expect(document.wires).toBe(normalized);
    expect(document.wires).not.toBe(originalWires);
    expect(document.wires).toEqual([wire("long", [{ x: 0, y: 0 }, { x: 120, y: 0 }])]);
  });

  it("splits polylines at bends and does not merge wires with different metadata", () => {
    const appearance: WireAppearance = { variant: "wide", color: "#336699" };
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      wires: [
        wire("w-l", [{ x: 0, y: 100 }, { x: 80, y: 100 }, { x: 80, y: 180 }], {
          appearance,
          temporarilyDeleted: true
        }),
        wire("signal", [{ x: 0, y: 200 }, { x: 80, y: 200 }]),
        wire("wide", [{ x: 40, y: 200 }, { x: 120, y: 200 }], { appearance })
      ],
      junctions: []
    });

    const normalized = applyNormalizedDocumentWires(document);

    expect(normalized.map((candidate) => candidate.id)).toEqual(["w-l", "w-l-segment-1", "signal", "signal-segment-1", "wide", "wide-segment-1"]);
    const connected = buildConnectivity(document);
    expect(connected.rootOfWire("signal")).toBe(connected.rootOfWire("wide"));
    expect(new Set(normalized.map((candidate) => candidate.id)).size).toBe(normalized.length);
    expect(normalized[0].points).toEqual([
      { x: 0, y: 100 },
      { x: 80, y: 100 }
    ]);
    expect(normalized[1].points).toEqual([
      { x: 80, y: 100 },
      { x: 80, y: 180 }
    ]);
    expect(normalized[0].appearance).toBe(appearance);
    expect(normalized[0].temporarilyDeleted).toBe(true);
    expect(normalized[1].appearance).toBe(appearance);
    expect(normalized[1].temporarilyDeleted).toBe(true);
  });

  it("splits collinear coverage at a three-arm junction without overlapping segments", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      wires: [
        wire("x", [{ x: 200, y: 140 }, { x: 200, y: 260 }]),
        wire("mnk", [{ x: 200, y: 60 }, { x: 400, y: 60 }, { x: 400, y: 200 }, { x: 200, y: 200 }]),
        wire("right", [{ x: 600, y: 200 }, { x: 400, y: 200 }])
      ],
      junctions: []
    });

    const normalized = normalizeDocumentWires(document);
    const paths = normalized.map((candidate) => candidate.points.map((point) => `${point.x},${point.y}`).join("->"));

    expect(paths).toEqual([
      "200,140->200,200",
      "200,200->200,260",
      "200,60->400,60",
      "400,60->400,200",
      "600,200->400,200",
      "400,200->200,200"
    ]);
  });

  it("keeps endpoint markers only on original outer endpoints when topology splits a wire", () => {
    const appearance: WireAppearance = {
      variant: "signal",
      startMarker: "arrow",
      endMarker: "circle",
      digitalSlash: true,
      digitalLabel: "12"
    };
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      wires: [
        wire("long", [{ x: 0, y: 0 }, { x: 120, y: 0 }], { appearance }),
        wire("branch", [{ x: 60, y: 0 }, { x: 60, y: 40 }])
      ],
      junctions: []
    });

    const normalized = applyNormalizedDocumentWires(document);
    const horizontal = normalized.filter((candidate) => candidate.points[0].y === 0 && candidate.points[1].y === 0);

    expect(horizontal).toHaveLength(2);
    expect(horizontal[0].appearance).toEqual({
      variant: "signal",
      startMarker: "arrow",
      digitalSlash: true,
      digitalLabel: "12"
    });
    expect(horizontal[1].appearance).toEqual({
      variant: "signal",
      endMarker: "circle",
      digitalSlash: true,
      digitalLabel: "12"
    });

    applyNormalizedDocumentWires(document);
    const markers = document.wires.map((candidate) => ({
      start: candidate.appearance?.startMarker,
      end: candidate.appearance?.endMarker
    }));
    expect(markers.filter((marker) => marker.start === "arrow")).toHaveLength(1);
    expect(markers.filter((marker) => marker.end === "circle")).toHaveLength(1);
  });

  it("merges a default continuation into a decorated wire and carries decorations to the new outer ends", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      wires: [
        wire("decorated", [{ x: 0, y: 0 }, { x: 60, y: 0 }], {
          appearance: {
            variant: "signal",
            startMarker: "arrow",
            endMarker: "circle",
            digitalSlash: true,
            digitalLabel: "8"
          }
        }),
        wire("continuation", [{ x: 60, y: 0 }, { x: 120, y: 0 }], {
          appearance: { variant: "signal" }
        })
      ],
      junctions: []
    });

    expect(applyNormalizedDocumentWires(document)).toEqual([
      {
        id: "continuation",
        routeMode: "orthogonal",
        points: [{ x: 0, y: 0 }, { x: 120, y: 0 }],
        appearance: {
          variant: "signal",
          startMarker: "arrow",
          endMarker: "circle",
          digitalSlash: true,
          digitalLabel: "8"
        }
      }
    ]);
  });

  it("keeps an arrow on its original segment when a component pin splits a collinear run", () => {
    const baseWireId = "612617c2-91d9-466d-8e8c-9642680c3c15";
    const document: SchematicDocument = fixtureDocument({
      components: [{
        type: "capacitor",
        ref: "C8",
        x: 3800,
        y: -1720,
        rotation: 90,
        mirrored: false,
        variantId: "fixed",
        id: "d0e76dd2-beac-4fc6-8806-6359a550cab1",
        values: { main: "C8" }
      }],
      wires: [
        wire(baseWireId, [
          { x: 3720, y: -1680 },
          { x: 3800, y: -1680 }
        ], {
          appearance: { variant: "signal", endMarker: "arrow" }
        }),
        wire(`${baseWireId}-segment-1`, [
          { x: 3800, y: -1680 },
          { x: 3880, y: -1680 }
        ], {
          appearance: { variant: "signal" }
        })
      ],

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      junctions: []
    });
    const expected = clone(document.wires);

    applyNormalizedDocumentWires(document);
    expect(document.wires).toEqual(expected);
    expect(document.wires[0].appearance?.endMarker).toBe("arrow");
    expect(document.wires[1].appearance?.endMarker).toBeUndefined();

    applyNormalizedDocumentWires(document);
    expect(document.wires).toEqual(expected);
  });

  it("keeps endpoint decoration on its physical side when extending a wire backward", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      wires: [
        wire("decorated", [{ x: 0, y: 0 }, { x: 60, y: 0 }], {
          appearance: {
            variant: "signal",
            startMarker: "arrow",
            endMarker: "circle"
          }
        }),
        wire("backward-continuation", [{ x: 0, y: 0 }, { x: -60, y: 0 }], {
          appearance: { variant: "signal" }
        })
      ],
      junctions: []
    });

    expect(applyNormalizedDocumentWires(document)).toEqual([
      {
        id: "backward-continuation",
        routeMode: "orthogonal",
        points: [{ x: 60, y: 0 }, { x: -60, y: 0 }],
        appearance: {
          variant: "signal",
          startMarker: "circle",
          endMarker: "arrow"
        }
      }
    ]);
  });

  it("keeps an interior X crossing disconnected by default", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      wires: [
        wire("horizontal", [{ x: 0, y: 100 }, { x: 200, y: 100 }]),
        wire("vertical", [{ x: 100, y: 0 }, { x: 100, y: 200 }])
      ],
      junctions: []
    });

    const normalized = applyNormalizedDocumentWires(document);

    expect(normalized).toHaveLength(2);
    expect(buildConnectivity(document).groups.size).toBe(2);
  });

  it("splits and connects both axes at an explicit X junction", () => {
    const document: SchematicDocument = fixtureDocument({
      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      wires: [
        wire("horizontal", [{ x: 0, y: 100 }, { x: 200, y: 100 }]),
        wire("vertical", [{ x: 100, y: 0 }, { x: 100, y: 200 }])
      ],
      junctions: [],

    }, { joinAt: [{ x: 100, y: 100 }] });

    const normalized = applyNormalizedDocumentWires(document);

    expect(normalized).toHaveLength(4);
    expect(buildConnectivity(document).groups.size).toBe(1);
  });

  it("keeps a disconnected T endpoint separate without splitting the through wire", () => {
    const document: SchematicDocument = fixtureDocument({
      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      wires: [
        wire("horizontal", [{ x: 0, y: 100 }, { x: 200, y: 100 }]),
        wire("vertical", [{ x: 100, y: 0 }, { x: 100, y: 100 }])
      ],
      junctions: [],

    }, { disconnectAt: [{ x: 100, y: 100 }] });

    const normalized = applyNormalizedDocumentWires(document);

    expect(normalized).toHaveLength(2);
    expect(buildConnectivity(document).groups.size).toBe(2);
  });
});
