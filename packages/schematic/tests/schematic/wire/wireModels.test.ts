import { authorFixture, fixtureDocument, connectFixtureJunction } from "../support/fixtureDocument";
import { disconnectJunction, reconcileConnectionEdit } from "../../../src/schematic/connectionGraph";
import { describe, expect, it } from "vitest";
import { buildConnectivity, componentPinPoint } from "../../../src/schematic/connectivity";
import { applyNormalizedDocumentWires } from "../../../src/schematic/document/documentWires";
import { isHorizontal, isVertical } from "../../../src/schematic/geometry";
import {
  applyWireCommitToDocument,
  createEmptyWireRouteSession,
  finishWireRouteFromKeyboard,
  handleWireBlankRouteClick,
  handleWirePinRouteClick,
  wireRouteAppearance,
  wireRoutePointCount,
  wireRoutePreviewPath
} from "../../../src/schematic/wire/wireCreationModel";
import type { SchematicDocument, Wire } from "../../../src/schematic/types";
import {
  beginWireSegmentMove,
  projectWireSegmentMove,
  syncWireSegmentMoveTopology
} from "../../../src/schematic/wire/wireSegmentMoveModel";
import {
  resolvedWireAppearance,
  setWireDecoration,
  wireBodyAppearance,
  wireDigitalDecorationGeometry,
  wireEndpointDecorationGeometry
} from "../../../src/schematic/wire/wireDecoration";
import { wireEndpointConnections } from "../../../src/schematic/wire/wireEndpointConnection";
import {
  applyWireMoveTopology,
  captureWireMoveTopology
} from "../../../src/schematic/wire/wireMoveTopology";
import { fixtureComponent } from "../support/fixtures";

function createDocument(): SchematicDocument {
  return fixtureDocument({
    junctionAppearances: [],
    netLabels: [], components: [], wires: [], junctions: [],  notes: [] });
}

function applySegmentMove(document: SchematicDocument, wireId: string, startPointer: { x: number; y: number }, nextPointer: { x: number; y: number }) {
  const transaction = beginWireSegmentMove(document, wireId, startPointer);
  if (!transaction) throw new Error(`Could not begin move for ${wireId}`);
  const paths = projectWireSegmentMove(transaction, nextPointer);
  syncWireSegmentMoveTopology(document, transaction, paths);
  const active = document.wires.find((wire) => wire.id === wireId);
  const activePath = paths.get(wireId);
  if (!active || !activePath) throw new Error(`Missing active path for ${wireId}`);
  active.points = activePath;
  applyNormalizedDocumentWires(document);
}

function rotatePoint(point: { x: number; y: number }, quarterTurns: number) {
  let next = { ...point };
  for (let index = 0; index < quarterTurns; index += 1) next = { x: -next.y, y: next.x };
  return next;
}

function expectAtomicConnectedWires(document: SchematicDocument) {
  document.wires.forEach((wire) => {
    expect(wire.points).toHaveLength(2);
    expect(isHorizontal(wire.points[0], wire.points[1]) || isVertical(wire.points[0], wire.points[1])).toBe(true);
    expect(wire.points[0]).not.toEqual(wire.points[1]);
  });
  expect(buildConnectivity(document).groups.size).toBe(1);

  const intervalsByLine = new Map<string, Array<{ low: number; high: number }>>();
  document.wires.forEach((wire) => {
    const [start, end] = wire.points;
    const horizontal = isHorizontal(start, end);
    const key = `${horizontal ? "h" : "v"}:${horizontal ? start.y : start.x}`;
    const first = horizontal ? start.x : start.y;
    const second = horizontal ? end.x : end.y;
    intervalsByLine.set(key, [...(intervalsByLine.get(key) ?? []), { low: Math.min(first, second), high: Math.max(first, second) }]);
  });
  intervalsByLine.forEach((intervals) => {
    const ordered = intervals.sort((left, right) => left.low - right.low || left.high - right.high);
    ordered.slice(1).forEach((interval, index) => expect(interval.low).toBeGreaterThanOrEqual(ordered[index].high));
  });
}

describe("schematic wire decorations", () => {
  it("resolves backward-compatible defaults and updates decorations without losing color", () => {
    const wire = {
      id: "decorated",
      routeMode: "orthogonal" as const,
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      appearance: { variant: "signal" as const, color: "#0072b2" }
    };

    expect(resolvedWireAppearance(wire)).toEqual({
      variant: "signal",
      color: "#0072b2",
      lineWidth: "a",
      startMarker: "default",
      endMarker: "default",
      digitalSlash: false,
      digitalLabel: ""
    });
    expect(setWireDecoration(wire, {
      startMarker: "arrow",
      endMarker: "circle",
      digitalSlash: true,
      digitalLabel: " 8 "
    })).toMatchObject({ kind: "changed" });
    expect(wire.appearance).toEqual({
      variant: "signal",
      color: "#0072b2",
      startMarker: "arrow",
      endMarker: "circle",
      digitalSlash: true,
      digitalLabel: " 8 "
    });
    expect(setWireDecoration(wire, { digitalLabel: " 8 " })).toEqual({
      kind: "noop",
      reason: "unchanged"
    });
  });

  it("copies only body styling onto generated attachment wires", () => {
    expect(wireBodyAppearance({
      appearance: {
        variant: "wide",
        color: "#336699",
        lineWidth: "2a",
        startMarker: "arrow",
        endMarker: "circle",
        digitalSlash: true,
        digitalLabel: "16"
      }
    })).toEqual({
      variant: "wide",
      color: "#336699",
      lineWidth: "2a"
    });
    expect(wireBodyAppearance({})).toBeUndefined();
  });

  it("uses exact a-scaled endpoint and digital geometry", () => {
    const wire = {
      id: "geometry",
      routeMode: "orthogonal" as const,
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      appearance: {
        variant: "signal" as const,
        startMarker: "arrow" as const,
        endMarker: "circle" as const,
        digitalSlash: true,
        digitalLabel: " 8 "
      }
    };

    expect(wireEndpointDecorationGeometry(wire, "start")).toEqual({
      endpoint: "start",
      marker: "arrow",
      center: { x: -24, y: 0 },
      strokeWidth: 2,
      polygon: [
        { x: -24, y: 0 },
        { x: 0, y: 6 },
        { x: 0, y: -6 }
      ]
    });
    expect(wireEndpointDecorationGeometry(wire, "end")).toEqual({
      endpoint: "end",
      marker: "circle",
      center: { x: 100, y: 0 },
      strokeWidth: 2,
      radius: 4
    });
    expect(wireDigitalDecorationGeometry(wire)).toEqual({
      center: { x: 50, y: 0 },
      slashStart: { x: 46, y: 4 },
      slashEnd: { x: 54, y: -4 },
      strokeWidth: 2,
      label: "8",
      labelPosition: { x: 58, y: -8 }
    });
  });

  it("scales a reversed vertical wide-wire arrow to a 36 by 72 triangle", () => {
    const wire = {
      id: "wide-vertical",
      routeMode: "orthogonal" as const,
      points: [{ x: 0, y: 100 }, { x: 0, y: 0 }],
      appearance: { variant: "wide" as const, startMarker: "arrow" as const }
    };

    expect(wireEndpointDecorationGeometry(wire, "start")).toEqual({
      endpoint: "start",
      marker: "arrow",
      center: { x: 0, y: 172 },
      strokeWidth: 6,
      polygon: [
        { x: 0, y: 172 },
        { x: 18, y: 100 },
        { x: -18, y: 100 }
      ]
    });
  });

  it("keeps a connected arrow tip on the symbol pin while dangling arrows extend outward", () => {
    const resistor = fixtureComponent("resistor", "R1", 100, 100);
    const pin = componentPinPoint(resistor, "p");
    const wire = {
      id: "pin-arrow",
      routeMode: "orthogonal" as const,
      points: [{ x: pin.x - 40, y: pin.y }, pin],
      appearance: { variant: "signal" as const, endMarker: "arrow" as const }
    };
    const document = createDocument();
    document.components.push(resistor);
    authorFixture(document);
    document.wires.push(wire);
    authorFixture(document);
    const connections = wireEndpointConnections(document, wire);

    expect(connections).toEqual({ start: false, end: true });
    expect(wireEndpointDecorationGeometry(wire, "end", {
      connected: connections.end
    })).toMatchObject({
      center: pin,
      polygon: [
        pin,
        { x: pin.x - 24, y: pin.y - 6 },
        { x: pin.x - 24, y: pin.y + 6 }
      ]
    });
    expect(wireEndpointDecorationGeometry(wire, "end")).toMatchObject({
      center: { x: pin.x + 24, y: pin.y }
    });
  });

  it("treats active wire continuations as connected but respects explicit disconnection and temporary deletion", () => {
    const arrowWire = {
      id: "arrow-wire",
      routeMode: "orthogonal" as const,
      points: [{ x: 0, y: 0 }, { x: 80, y: 0 }],
      appearance: { variant: "signal" as const, endMarker: "arrow" as const }
    };
    const continuation: Wire = {
      id: "continuation",
      routeMode: "orthogonal" as const,
      points: [{ x: 80, y: 0 }, { x: 80, y: 80 }]
    };
    const document = createDocument();
    document.wires.push(arrowWire, continuation);
    authorFixture(document);

    expect(wireEndpointConnections(document, arrowWire).end).toBe(true);

    disconnectJunction(document, { x: 80, y: 0 });
    expect(wireEndpointConnections(document, arrowWire).end).toBe(false);

    connectFixtureJunction(document, { x: 80, y: 0 });
    expect(wireEndpointConnections(document, arrowWire).end).toBe(true);
    continuation.temporarilyDeleted = true;
    expect(wireEndpointConnections(document, arrowWire).end).toBe(false);
  });

  it("doubles only the wire body while keeping decorations based on a", () => {
    const wire = {
      id: "double-width",
      routeMode: "orthogonal" as const,
      points: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      appearance: {
        variant: "signal" as const,
        lineWidth: "2a" as const,
        startMarker: "arrow" as const,
        endMarker: "circle" as const,
        digitalSlash: true
      }
    };

    expect(resolvedWireAppearance(wire).lineWidth).toBe("2a");
    expect(wireEndpointDecorationGeometry(wire, "start")).toMatchObject({
      center: { x: -24, y: 0 },
      strokeWidth: 2,
      polygon: [
        { x: -24, y: 0 },
        { x: 0, y: 6 },
        { x: 0, y: -6 }
      ]
    });
    expect(wireEndpointDecorationGeometry(wire, "end")).toMatchObject({
      radius: 4,
      strokeWidth: 2
    });
    expect(wireDigitalDecorationGeometry(wire)?.strokeWidth).toBe(2);
  });
});

describe("schematic wire creation model", () => {
  it("starts from a blank click and adds orthogonal bends", () => {
    const start = handleWireBlankRouteClick(createEmptyWireRouteSession(), { x: 13, y: 8 });

    expect(start).toMatchObject({
      kind: "pending",
      previewPoint: { x: 10, y: 10 },
      status: "Wire start 10, 10. Empty clicks add bends; click a pin or press Enter to finish."
    });
    if (start.kind !== "pending") throw new Error("expected pending start");
    expect(start.session.points).toEqual([{ x: 10, y: 10 }]);

    const bend = handleWireBlankRouteClick(start.session, { x: 61, y: 41 });
    expect(bend).toMatchObject({
      kind: "pending",
      previewPoint: { x: 60, y: 40 },
      status: "Bend added at 60, 40. Continue routing, click a pin to finish, or press Enter."
    });
    if (bend.kind !== "pending") throw new Error("expected pending bend");
    expect(bend.session.points).toEqual([
      { x: 10, y: 10 },
      { x: 60, y: 10 },
      { x: 60, y: 40 }
    ]);
  });

  it("starts from a pin click and finishes on a second pin click", () => {
    const start = handleWirePinRouteClick(createEmptyWireRouteSession(), { x: 40, y: 0 });
    expect(start.kind).toBe("pending");
    if (start.kind !== "pending") throw new Error("expected pending start");

    const finish = handleWirePinRouteClick(start.session, { x: 80, y: 40 });
    expect(finish).toEqual({
      kind: "commit",
      points: [
        { x: 40, y: 0 },
        { x: 80, y: 0 },
        { x: 80, y: 40 }
      ],
      routeMode: "orthogonal"
    });
  });

  it("validates Enter finish states without mutating the session", () => {
    const empty = createEmptyWireRouteSession("wide");
    expect(finishWireRouteFromKeyboard(empty, null)).toEqual({
      kind: "invalid",
      session: { variant: "wide", routeMode: "orthogonal", points: [] },
      status: "Click a start point before finishing a wire."
    });

    const start = handleWireBlankRouteClick(empty, { x: 0, y: 0 });
    if (start.kind !== "pending") throw new Error("expected pending start");
    expect(finishWireRouteFromKeyboard(start.session, { x: 0, y: 0 })).toEqual({
      kind: "invalid",
      session: { variant: "wide", routeMode: "orthogonal", points: [{ x: 0, y: 0 }] },
      status: "Move to a second point or click a bend before pressing Enter."
    });
    expect(start.session.points).toEqual([{ x: 0, y: 0 }]);

    expect(finishWireRouteFromKeyboard(start.session, { x: 40, y: 40 })).toEqual({
      kind: "commit",
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 }
      ],
      routeMode: "orthogonal"
    });
  });

  it("builds preview paths without changing route points", () => {
    const start = handleWireBlankRouteClick(createEmptyWireRouteSession(), { x: 0, y: 0 });
    if (start.kind !== "pending") throw new Error("expected pending start");

    expect(wireRoutePreviewPath(start.session, null)).toBeNull();
    expect(wireRoutePreviewPath(start.session, { x: 40, y: 40 })).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: 40 }
    ]);
    expect(start.session.points).toEqual([{ x: 0, y: 0 }]);
  });

  it("routes directly between grid points in free-angle mode", () => {
    const session = createEmptyWireRouteSession("signal", "freeAngle");
    const start = handleWireBlankRouteClick(session, { x: 3, y: 4 });
    if (start.kind !== "pending") throw new Error("expected pending start");

    expect(wireRoutePreviewPath(start.session, { x: 57, y: 43 })).toEqual([
      { x: 0, y: 0 },
      { x: 60, y: 40 }
    ]);
    const finish = handleWirePinRouteClick(start.session, { x: 57, y: 43 });
    expect(finish).toEqual({
      kind: "commit",
      points: [
        { x: 0, y: 0 },
        { x: 60, y: 40 }
      ],
      routeMode: "freeAngle"
    });
  });

  it("keeps route variant and exposes summary count and appearance", () => {
    const wide = createEmptyWireRouteSession("wide");
    expect(wireRouteAppearance(wide)).toEqual({ variant: "wide" });
    expect(wireRoutePointCount(wide)).toBe(0);

    const start = handleWireBlankRouteClick(wide, { x: 0, y: 0 });
    if (start.kind !== "pending") throw new Error("expected pending start");
    expect(start.session.variant).toBe("wide");
    expect(wireRouteAppearance(start.session)).toEqual({ variant: "wide" });
    expect(wireRoutePointCount(start.session)).toBe(1);
  });

  it("commits a multi-segment route as independent bend-to-bend wires", () => {
    const schematicDocument = createDocument();

    const commit = applyWireCommitToDocument(
      schematicDocument,
      [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 }
      ],
      { variant: "signal" },
      () => "wire-new"
    );

    expect(commit.kind).toBe("committed");
    if (commit.kind !== "committed") throw new Error("expected committed wire");
    expect(schematicDocument.wires).toHaveLength(2);
    expect(schematicDocument.wires[0]).toMatchObject({
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 }
      ],
      routeMode: "orthogonal",
      appearance: { variant: "signal" }
    });
    expect(schematicDocument.wires[1]).toMatchObject({
      points: [
        { x: 40, y: 0 },
        { x: 40, y: 40 }
      ],
      routeMode: "orthogonal",
      appearance: { variant: "signal" }
    });
    expect(schematicDocument.wires[0].id).toBeTruthy();
    expect(commit.wireId).toBe(schematicDocument.wires[0].id);
    expect(commit.status).toBe("Wire added. Click another start point or press Esc.");
  });

  it("commits and normalizes free-angle bends without converting their route mode", () => {
    const schematicDocument = createDocument();
    const commit = applyWireCommitToDocument(
      schematicDocument,
      [
        { x: 0, y: 0 },
        { x: 60, y: 40 },
        { x: 100, y: 40 }
      ],
      { variant: "signal" },
      () => "free-wire",
      "freeAngle"
    );

    expect(commit.kind).toBe("committed");
    expect(schematicDocument.wires).toEqual([
      {
        id: "free-wire",
        routeMode: "freeAngle",
        points: [{ x: 0, y: 0 }, { x: 60, y: 40 }],
        appearance: { variant: "signal" }
      },
      {
        id: "free-wire-segment-1",
        routeMode: "freeAngle",
        points: [{ x: 60, y: 40 }, { x: 100, y: 40 }],
        appearance: { variant: "signal" }
      }
    ]);
  });

  it("merges a newly drawn overlapping line into one selected wire object", () => {
    const schematicDocument = createDocument();
    schematicDocument.wires.push({
      id: "short",
      routeMode: "orthogonal",
      points: [
        { x: 40, y: 0 },
        { x: 80, y: 0 }
      ],
      appearance: { variant: "signal" }
    });

    const commit = applyWireCommitToDocument(
      schematicDocument,
      [
        { x: 0, y: 0 },
        { x: 120, y: 0 }
      ],
      { variant: "signal" },
      () => "wire-new"
    );

    expect(commit.kind).toBe("committed");
    if (commit.kind !== "committed") throw new Error("expected committed wire");
    expect(schematicDocument.wires).toEqual([
      {
        id: commit.wireId,
        routeMode: "orthogonal",
        points: [
          { x: 0, y: 0 },
          { x: 120, y: 0 }
        ],
        appearance: { variant: "signal" }
      }
    ]);
  });

  it("commits a wide wire with preserved appearance and status", () => {
    const schematicDocument = createDocument();
    const appearance = { variant: "wide" as const, color: "#f97316" };

    const commit = applyWireCommitToDocument(
      schematicDocument,
      [
        { x: 0, y: 0 },
        { x: 60, y: 0 }
      ],
      appearance,
      () => "wire-new"
    );

    expect(commit.kind).toBe("committed");
    if (commit.kind !== "committed") throw new Error("expected committed wire");
    expect(schematicDocument.wires).toHaveLength(1);
    expect(schematicDocument.wires[0].id).toBeTruthy();
    expect(schematicDocument.wires[0]).toMatchObject({
      points: [
        { x: 0, y: 0 },
        { x: 60, y: 0 }
      ],
      routeMode: "orthogonal",
      appearance
    });
    expect(commit.wireId).toBe(schematicDocument.wires[0].id);
    expect(commit.status).toBe("Wide wire added. Click another start point or press Esc.");
  });

  it("does not mutate the document for empty or degenerate wire paths", () => {
    const schematicDocument = createDocument();

    expect(applyWireCommitToDocument(schematicDocument, [], { variant: "signal" }, () => "wire-new")).toEqual({ kind: "none" });
    expect(applyWireCommitToDocument(schematicDocument, [{ x: 20, y: 20 }], { variant: "wide" }, () => "wire-new")).toEqual({ kind: "none" });
    expect(
      applyWireCommitToDocument(
        schematicDocument,
        [
          { x: 20, y: 20 },
          { x: 20, y: 20 }
        ],
        { variant: "signal" },
        () => "wire-new"
      )
    ).toEqual({ kind: "none" });
    expect(schematicDocument.wires).toEqual([]);
  });
});

describe("schematic wire segment movement", () => {
  describe("free-angle translation", () => {
    it("moves a diagonal segment in two dimensions and keeps an orthogonal follower orthogonal", () => {
      const schematicDocument: SchematicDocument = fixtureDocument({

        junctionAppearances: [],
        netLabels: [],
        notes: [],
        components: [],
        junctions: [],
        wires: [
          {
            id: "diagonal",
            routeMode: "freeAngle",
            points: [{ x: 0, y: 0 }, { x: 40, y: 40 }]
          },
          {
            id: "orthogonal-follower",
            routeMode: "orthogonal",
            points: [{ x: 40, y: 40 }, { x: 40, y: 100 }]
          }
        ]
      });
      const transaction = beginWireSegmentMove(schematicDocument, "diagonal", { x: 20, y: 20 });
      if (!transaction) throw new Error("expected diagonal move transaction");

      const paths = projectWireSegmentMove(transaction, { x: 40, y: 20 });
      expect(paths.get("diagonal")).toEqual([
        { x: 20, y: 0 },
        { x: 60, y: 40 }
      ]);
      expect(paths.get("orthogonal-follower")).toEqual([
        { x: 60, y: 40 },
        { x: 40, y: 40 },
        { x: 40, y: 100 }
      ]);
      expect(paths.get("orthogonal-follower")?.slice(1).every((point, index, points) => {
        const previous = index === 0 ? paths.get("orthogonal-follower")?.[0] : points[index - 1];
        return previous && (previous.x === point.x || previous.y === point.y);
      })).toBe(true);
    });

    it("stretches only the attached endpoint when a component moves", () => {
      const resistor = fixtureComponent("resistor", "R1", 40, 0);
      const rightPin = componentPinPoint(resistor, "n");
      const schematicDocument: SchematicDocument = fixtureDocument({

        junctionAppearances: [],
        netLabels: [],
        notes: [],
        components: [resistor],
        junctions: [],
        wires: [{
          id: "diagonal",
          routeMode: "freeAngle",
          points: [rightPin, { x: rightPin.x + 60, y: rightPin.y + 40 }]
        }]
      });
      const topology = captureWireMoveTopology(
        schematicDocument,
        new Set([resistor.id]),
        new Set()
      );
      const previousPins = new Map([[
        resistor.id,
        new Map([
          ["p", componentPinPoint(resistor, "p")],
          ["n", rightPin]
        ])
      ]]);
      resistor.y += 20;
      const nextPins = new Map([[
        resistor.id,
        new Map([
          ["p", componentPinPoint(resistor, "p")],
          ["n", componentPinPoint(resistor, "n")]
        ])
      ]]);

      applyWireMoveTopology(schematicDocument, topology, previousPins, nextPins);

      expect(schematicDocument.wires).toEqual([{
        id: "diagonal",
        routeMode: "freeAngle",
        points: [
          { x: rightPin.x, y: rightPin.y + 20 },
          { x: rightPin.x + 60, y: rightPin.y + 40 }
        ]
      }]);
    });
  });

  describe("junction endpoint propagation", () => {
    it("moves a junction with the selected segment and every attached endpoint", () => {
      const schematicDocument: SchematicDocument = fixtureDocument({

        junctionAppearances: [],
        netLabels: [],
        notes: [],
        components: [],
        wires: [
          { id: "m", routeMode: "orthogonal", points: [{ x: 200, y: 60 }, { x: 400, y: 60 }] },
          { id: "n", routeMode: "orthogonal", points: [{ x: 400, y: 60 }, { x: 400, y: 200 }] },
          { id: "k", routeMode: "orthogonal", points: [{ x: 400, y: 200 }, { x: 200, y: 200 }] },
          { id: "right", routeMode: "orthogonal", points: [{ x: 600, y: 200 }, { x: 400, y: 200 }] }
        ],
        junctions: []
      });

      const transaction = beginWireSegmentMove(schematicDocument, "n", { x: 400, y: 120 });
      const paths = projectWireSegmentMove(transaction!, { x: 440, y: 120 });

    expect(transaction).toMatchObject({ activeWireId: "n", moveAxis: "x" });
      expect(paths.get("m")).toEqual([{ x: 200, y: 60 }, { x: 440, y: 60 }]);
      expect(paths.get("n")).toEqual([{ x: 440, y: 60 }, { x: 440, y: 200 }]);
      expect(paths.get("k")).toEqual([{ x: 440, y: 200 }, { x: 200, y: 200 }]);
      expect(paths.get("right")).toEqual([{ x: 600, y: 200 }, { x: 440, y: 200 }]);
    });

    it("keeps a collinear continuation stationary at a four-arm junction", () => {
      const schematicDocument: SchematicDocument = fixtureDocument({

        junctionAppearances: [],
        netLabels: [],
        notes: [],
        components: [],
        wires: [
          { id: "m", routeMode: "orthogonal", points: [{ x: 200, y: 60 }, { x: 400, y: 60 }] },
          { id: "n", routeMode: "orthogonal", points: [{ x: 400, y: 60 }, { x: 400, y: 200 }] },
          { id: "k", routeMode: "orthogonal", points: [{ x: 400, y: 200 }, { x: 200, y: 200 }] },
          { id: "j", routeMode: "orthogonal", points: [{ x: 600, y: 200 }, { x: 400, y: 200 }] },
          { id: "p", routeMode: "orthogonal", points: [{ x: 400, y: 300 }, { x: 400, y: 200 }] }
        ],
        junctions: []
      });

      const transaction = beginWireSegmentMove(schematicDocument, "n", { x: 400, y: 120 });
      const paths = projectWireSegmentMove(transaction!, { x: 440, y: 120 });

      expect(paths.get("k")).toEqual([{ x: 440, y: 200 }, { x: 200, y: 200 }]);
      expect(paths.get("j")).toEqual([{ x: 600, y: 200 }, { x: 440, y: 200 }]);
      expect(paths.has("p")).toBe(false);
      expect(schematicDocument.wires.find((wire) => wire.id === "p")?.points).toEqual([
        { x: 400, y: 300 },
        { x: 400, y: 200 }
      ]);
    });

  });

  describe("component pin anchor lifecycle", () => {
    it.each([0, 1, 2, 3].flatMap(turns => [false, true].map(reverse => ({ turns, reverse }))))(
      "keeps the pin connection across consecutive arm drags (rotation $turns, reversed $reverse)",
      ({ turns, reverse }) => {
        const point = (x: number, y: number) => rotatePoint({ x, y }, turns);
        const center = point(240, 300);
        const resistor = fixtureComponent("resistor", "R1", center.x, center.y, turns * 90);
        const wire = (id: string, points: Array<{ x: number; y: number }>): Wire => ({
          id, routeMode: "orthogonal", points: reverse ? [...points].reverse() : points
        });
        const document = fixtureDocument({ components: [resistor], wires: [
          wire("upper", [point(400, 200), point(400, 300)]),
          wire("lower", [point(400, 300), point(400, 460)]),
          wire("feed", [point(280, 300), point(400, 300)])
        ] });
        const move = (id: string, from: { x: number; y: number }, to: { x: number; y: number }) => {
          const before = structuredClone(document);
          const transaction = beginWireSegmentMove(document, id, from)!;
          syncWireSegmentMoveTopology(document, transaction, projectWireSegmentMove(transaction, to));
          reconcileConnectionEdit(document, before);
          applyNormalizedDocumentWires(document);
        };
        const assertConnectedToPin = (stage: string) => {
          const graph = buildConnectivity(document);
          const pinRoot = graph.rootOf("p:R1:n");
          document.wires.forEach(wire => expect(graph.rootOfWire(wire.id), `${stage}: ${wire.id} must stay connected to R1.n`).toBe(pinRoot));
        };
        move("upper", point(400, 240), point(280, 240));
        expect(document.wires).toHaveLength(3);
        assertConnectedToPin("first release");
        const upperAfterFirstMove = structuredClone(document.wires.find(wire => wire.id === "upper"));
        const beforeSecondMove = structuredClone(document);
        const transaction = beginWireSegmentMove(document, "lower", point(400, 400))!;
        // Approach the pin, collapse the horizontal bridge, then move out again
        // without releasing the mouse. Geometry and connectivity must both hold.
        for (const x of [380, 340, 280, 320, 280]) {
          syncWireSegmentMoveTopology(document, transaction, projectWireSegmentMove(transaction, point(x, 400)));
          const lower = document.wires.find(wire => wire.id === "lower")!;
          expect(lower.points).toEqual(reverse ? [point(x, 460), point(x, 300)] : [point(x, 300), point(x, 460)]);
          expect(document.wires.find(wire => wire.id === "upper")).toEqual(upperAfterFirstMove);
          const bridges = document.wires.filter(wire => wire.id !== "upper" && wire.id !== "lower");
          expect(bridges).toHaveLength(x === 280 ? 0 : 1);
          if (bridges.length) expect(bridges[0].points).toEqual(expect.arrayContaining([point(280, 300), point(x, 300)]));
          assertConnectedToPin(`held at ${x}`);
        }
        reconcileConnectionEdit(document, beforeSecondMove);
        applyNormalizedDocumentWires(document);
        expect(document.wires).toHaveLength(2);
        assertConnectedToPin("second release");
      }
    );

    it("does not join an isolated touching conductor while a bridge collapses and expands", () => {
      const document = fixtureDocument({ components: [fixtureComponent("resistor", "R1", 240, 300)], wires: [
        { id: "upper", routeMode: "orthogonal", points: [{ x: 280, y: 200 }, { x: 280, y: 300 }] },
        { id: "lower", routeMode: "orthogonal", points: [{ x: 400, y: 300 }, { x: 400, y: 460 }] },
        { id: "drag-upper-junction-1", routeMode: "orthogonal", points: [{ x: 400, y: 300 }, { x: 280, y: 300 }] },
        { id: "isolated", routeMode: "freeAngle", points: [{ x: 280, y: 300 }, { x: 240, y: 240 }] }
      ] });
      document.connections.wires.isolated = ["isolated-start", "isolated-end"];
      const transaction = beginWireSegmentMove(document, "lower", { x: 400, y: 400 })!;
      for (const x of [340, 280, 320]) {
        syncWireSegmentMoveTopology(document, transaction, projectWireSegmentMove(transaction, { x, y: 400 }));
        const graph = buildConnectivity(document);
        expect(graph.rootOfWire("lower")).toBe(graph.rootOf("p:R1:n"));
        expect(graph.rootOfWire("isolated")).not.toBe(graph.rootOf("p:R1:n"));
      }
    });

    it("keeps one arrow on the dragged source segment across pin-anchor creation and removal", () => {
      const baseWireId = "612617c2-91d9-466d-8e8c-9642680c3c15";
      const schematicDocument: SchematicDocument = fixtureDocument({

        junctionAppearances: [],
        netLabels: [],
        notes: [],
        components: [fixtureComponent("capacitor", "C8", 3800, -1720, 90)],
        wires: [
          {
            id: baseWireId,
            routeMode: "orthogonal",
            points: [{ x: 3720, y: -1680 }, { x: 3800, y: -1680 }],
            appearance: { variant: "signal", endMarker: "arrow" }
          },
          {
            id: `${baseWireId}-segment-1`,
            routeMode: "orthogonal",
            points: [{ x: 3800, y: -1680 }, { x: 3880, y: -1680 }],
            appearance: { variant: "signal" }
          }
        ],
        junctions: []
      });

      applySegmentMove(
        schematicDocument,
        baseWireId,
        { x: 3760, y: -1680 },
        { x: 3760, y: -1660 }
      );

      const raisedArrowWire = schematicDocument.wires.find((wire) =>
        wire.appearance?.endMarker === "arrow" || wire.appearance?.startMarker === "arrow"
      );
      const pinAnchor = schematicDocument.wires.find((wire) => wire.id.startsWith(`drag-${baseWireId}-pin-`));
      expect(schematicDocument.wires.filter((wire) =>
        wire.appearance?.endMarker === "arrow" || wire.appearance?.startMarker === "arrow"
      )).toHaveLength(1);
      expect(raisedArrowWire).toMatchObject({
        id: baseWireId,
        points: [{ x: 3720, y: -1660 }, { x: 3800, y: -1660 }],
        appearance: { variant: "signal", endMarker: "arrow" }
      });
      expect(pinAnchor).toMatchObject({
        points: [{ x: 3800, y: -1680 }, { x: 3800, y: -1660 }],
        appearance: { variant: "signal" }
      });
      expect(pinAnchor?.appearance?.startMarker).toBeUndefined();
      expect(pinAnchor?.appearance?.endMarker).toBeUndefined();
      expect(pinAnchor?.appearance?.digitalSlash).toBeUndefined();
      expect(wireEndpointConnections(schematicDocument, raisedArrowWire!).end).toBe(true);

      applySegmentMove(
        schematicDocument,
        baseWireId,
        { x: 3760, y: -1660 },
        { x: 3760, y: -1680 }
      );

      expect(schematicDocument.wires).toHaveLength(2);
      expect(schematicDocument.wires.filter((wire) =>
        wire.appearance?.endMarker === "arrow" || wire.appearance?.startMarker === "arrow"
      )).toEqual([expect.objectContaining({
        id: baseWireId,
        points: [{ x: 3720, y: -1680 }, { x: 3800, y: -1680 }],
        appearance: { variant: "signal", endMarker: "arrow" }
      })]);
    });

    it("keeps a component pin connected when moving its attached segment", () => {
      const schematicDocument: SchematicDocument = fixtureDocument({

        junctionAppearances: [],
        netLabels: [],
        notes: [],
        components: [fixtureComponent("nmos", "M1", 200, 100)],
        wires: [
          { id: "m", routeMode: "orthogonal", points: [{ x: 200, y: 60 }, { x: 400, y: 60 }] },
          { id: "n", routeMode: "orthogonal", points: [{ x: 400, y: 60 }, { x: 400, y: 200 }] }
        ],
        junctions: []
      });

      const transaction = beginWireSegmentMove(schematicDocument, "m", { x: 300, y: 60 });
      const paths = projectWireSegmentMove(transaction!, { x: 300, y: 20 });
      const updatedWireIds = syncWireSegmentMoveTopology(schematicDocument, transaction!, paths);

      expect(paths.get("m")).toEqual([{ x: 200, y: 20 }, { x: 400, y: 20 }]);
      expect(paths.get("n")).toEqual([{ x: 400, y: 20 }, { x: 400, y: 200 }]);
      expect(updatedWireIds).toEqual(new Set(["m", "n", "drag-m-pin-0"]));
      expect(schematicDocument.wires.find((wire) => wire.id === "drag-m-pin-0")?.points).toEqual([
        { x: 200, y: 60 },
        { x: 200, y: 20 }
      ]);
    });

    it("removes a pin anchor when the moved segment returns to the pin", () => {
      const schematicDocument: SchematicDocument = fixtureDocument({

        junctionAppearances: [],
        netLabels: [],
        notes: [],
        components: [fixtureComponent("nmos", "M1", 200, 100)],
        wires: [
          { id: "m", routeMode: "orthogonal", points: [{ x: 200, y: 20 }, { x: 400, y: 20 }] },
          { id: "n", routeMode: "orthogonal", points: [{ x: 400, y: 20 }, { x: 400, y: 200 }] },
          { id: "anchor", routeMode: "orthogonal", points: [{ x: 200, y: 60 }, { x: 200, y: 20 }] }
        ],
        junctions: []
      });

      const transaction = beginWireSegmentMove(schematicDocument, "m", { x: 300, y: 20 });
      const returnedPaths = projectWireSegmentMove(transaction!, { x: 300, y: 60 });
      const removedIds = syncWireSegmentMoveTopology(schematicDocument, transaction!, returnedPaths);

      expect(removedIds).toEqual(new Set(["m", "n", "anchor"]));
      expect(schematicDocument.wires.some((wire) => wire.id === "anchor")).toBe(false);

      const raisedPaths = projectWireSegmentMove(transaction!, { x: 300, y: 20 });
      const restoredIds = syncWireSegmentMoveTopology(schematicDocument, transaction!, raisedPaths);
      expect(restoredIds).toEqual(new Set(["m", "n", "anchor"]));
      expect(schematicDocument.wires.find((wire) => wire.id === "anchor")?.points).toEqual([
        { x: 200, y: 60 },
        { x: 200, y: 20 }
      ]);
    });

  });

  describe("fixed junction preservation", () => {
    it("preserves the old junction when moving one of two collinear arms", () => {
      const schematicDocument: SchematicDocument = fixtureDocument({

        junctionAppearances: [],
        netLabels: [],
        notes: [],
        components: [],
        wires: [
          { id: "n", routeMode: "orthogonal", points: [{ x: 400, y: 60 }, { x: 400, y: 200 }] },
          { id: "k", routeMode: "orthogonal", points: [{ x: 400, y: 200 }, { x: 200, y: 200 }] },
          { id: "j", routeMode: "orthogonal", points: [{ x: 600, y: 200 }, { x: 400, y: 200 }] }
        ],
        junctions: []
      });

      const transaction = beginWireSegmentMove(schematicDocument, "j", { x: 500, y: 200 });
      const paths = projectWireSegmentMove(transaction!, { x: 500, y: 160 });
      const updatedWireIds = syncWireSegmentMoveTopology(schematicDocument, transaction!, paths);

      expect(schematicDocument.wires.find((wire) => wire.id === "n")?.points).toEqual([
        { x: 400, y: 60 },
        { x: 400, y: 160 }
      ]);
      expect(updatedWireIds).toEqual(new Set(["j", "n", "drag-j-junction-1"]));
      expect(schematicDocument.wires.find((wire) => wire.id === "drag-j-junction-1")?.points).toEqual([
        { x: 400, y: 200 },
        { x: 400, y: 160 }
      ]);
    });

  });

  describe("topology isolation boundaries", () => {
    it("does not attach wires or pins across a deliberately disconnected node", () => {
      const schematicDocument: SchematicDocument = fixtureDocument({
        junctionAppearances: [],
        netLabels: [],
        notes: [],
        components: [fixtureComponent("nmos", "M1", 200, 100)],
        wires: [
          { id: "m", routeMode: "orthogonal", points: [{ x: 200, y: 60 }, { x: 400, y: 60 }] },
          { id: "n", routeMode: "orthogonal", points: [{ x: 400, y: 60 }, { x: 400, y: 200 }] }
        ],
        junctions: [],

      }, { disconnectAt: [{ x: 200, y: 60 }, { x: 400, y: 60 }] });

      const transaction = beginWireSegmentMove(schematicDocument, "m", { x: 300, y: 60 });

      expect(Array.from(transaction!.initialPaths.keys())).toEqual(["m"]);
      expect(transaction!.topology.fixedAnchors).toEqual([]);
    });

    it("keeps active and temporarily deleted wire topology independent", () => {
      const activeDocument: SchematicDocument = fixtureDocument({

        junctionAppearances: [],
        netLabels: [],
        notes: [],
        components: [],
        wires: [
          { id: "active", routeMode: "orthogonal", points: [{ x: 200, y: 60 }, { x: 400, y: 60 }] },
          { id: "deleted", routeMode: "orthogonal", points: [{ x: 400, y: 60 }, { x: 400, y: 200 }], temporarilyDeleted: true }
        ],
        junctions: []
      });
      const deletedDocument: SchematicDocument = fixtureDocument({

        junctionAppearances: [],
        netLabels: [],
        notes: [],
        components: [fixtureComponent("nmos", "M1", 200, 100)],
        wires: [
          { id: "deleted", routeMode: "orthogonal", points: [{ x: 200, y: 60 }, { x: 400, y: 60 }], temporarilyDeleted: true },
          { id: "active", routeMode: "orthogonal", points: [{ x: 400, y: 60 }, { x: 400, y: 200 }] }
        ],
        junctions: []
      });

      const activeTransaction = beginWireSegmentMove(activeDocument, "active", { x: 300, y: 60 });
      const deletedTransaction = beginWireSegmentMove(deletedDocument, "deleted", { x: 300, y: 60 });

      expect(Array.from(activeTransaction!.initialPaths.keys())).toEqual(["active"]);
      expect(Array.from(deletedTransaction!.initialPaths.keys())).toEqual(["deleted"]);
      expect(deletedTransaction!.topology.fixedAnchors).toEqual([]);
    });

  });

  describe("fixed junction span selection", () => {
    it("creates fixed-junction anchors at both ends of a middle segment", () => {
      const schematicDocument: SchematicDocument = fixtureDocument({

        junctionAppearances: [],
        netLabels: [],
        notes: [],
        components: [],
        wires: [
          { id: "middle", routeMode: "orthogonal", points: [{ x: 200, y: 200 }, { x: 400, y: 200 }] },
          { id: "left", routeMode: "orthogonal", points: [{ x: 0, y: 200 }, { x: 200, y: 200 }] },
          { id: "right", routeMode: "orthogonal", points: [{ x: 600, y: 200 }, { x: 400, y: 200 }] },
          { id: "leftStem", routeMode: "orthogonal", points: [{ x: 200, y: 60 }, { x: 200, y: 200 }] },
          { id: "rightStem", routeMode: "orthogonal", points: [{ x: 400, y: 60 }, { x: 400, y: 200 }] }
        ],
        junctions: []
      });

      const transaction = beginWireSegmentMove(schematicDocument, "middle", { x: 300, y: 200 });
      const paths = projectWireSegmentMove(transaction!, { x: 300, y: 160 });
      const updatedWireIds = syncWireSegmentMoveTopology(schematicDocument, transaction!, paths);

      expect(updatedWireIds).toEqual(new Set([
        "middle",
        "leftStem",
        "rightStem",
        "drag-middle-junction-0",
        "drag-middle-junction-1"
      ]));
      expect(schematicDocument.wires.find((wire) => wire.id === "drag-middle-junction-0")?.points).toEqual([
        { x: 200, y: 200 },
        { x: 200, y: 160 }
      ]);
      expect(schematicDocument.wires.find((wire) => wire.id === "drag-middle-junction-1")?.points).toEqual([
        { x: 400, y: 200 },
        { x: 400, y: 160 }
      ]);
    });

    it("does not add a junction anchor when an outward stretch still covers the old node", () => {
      const schematicDocument: SchematicDocument = fixtureDocument({

        junctionAppearances: [],
        netLabels: [],
        notes: [],
        components: [],
        wires: [
          { id: "n", routeMode: "orthogonal", points: [{ x: 400, y: 60 }, { x: 400, y: 200 }] },
          { id: "k", routeMode: "orthogonal", points: [{ x: 400, y: 200 }, { x: 200, y: 200 }] },
          { id: "j", routeMode: "orthogonal", points: [{ x: 600, y: 200 }, { x: 400, y: 200 }] }
        ],
        junctions: []
      });

      const transaction = beginWireSegmentMove(schematicDocument, "j", { x: 500, y: 200 });
      const paths = projectWireSegmentMove(transaction!, { x: 500, y: 240 });
      syncWireSegmentMoveTopology(schematicDocument, transaction!, paths);

      expect(schematicDocument.wires.some((wire) => wire.id.startsWith("drag-j-junction-"))).toBe(false);
      expect(schematicDocument.wires.find((wire) => wire.id === "n")?.points).toEqual([
        { x: 400, y: 60 },
        { x: 400, y: 200 },
        { x: 400, y: 240 }
      ]);
    });

    it("uses the opposite stem to preserve a four-way junction without an extra anchor", () => {
      const schematicDocument: SchematicDocument = fixtureDocument({

        junctionAppearances: [],
        netLabels: [],
        notes: [],
        components: [],
        wires: [
          { id: "n", routeMode: "orthogonal", points: [{ x: 400, y: 60 }, { x: 400, y: 200 }] },
          { id: "p", routeMode: "orthogonal", points: [{ x: 400, y: 300 }, { x: 400, y: 200 }] },
          { id: "k", routeMode: "orthogonal", points: [{ x: 400, y: 200 }, { x: 200, y: 200 }] },
          { id: "j", routeMode: "orthogonal", points: [{ x: 600, y: 200 }, { x: 400, y: 200 }] }
        ],
        junctions: []
      });

      const transaction = beginWireSegmentMove(schematicDocument, "j", { x: 500, y: 200 });
      const paths = projectWireSegmentMove(transaction!, { x: 500, y: 160 });
      syncWireSegmentMoveTopology(schematicDocument, transaction!, paths);

      expect(schematicDocument.wires.some((wire) => wire.id.startsWith("drag-j-junction-"))).toBe(false);
      expect(schematicDocument.wires.find((wire) => wire.id === "p")?.points).toEqual([
        { x: 400, y: 300 },
        { x: 400, y: 200 },
        { x: 400, y: 160 }
      ]);
    });

  });

  describe("symmetry and normalized topology invariants", () => {
    it("preserves atomic connected topology across rotations, endpoint order, and inward or outward moves", () => {
      for (let quarterTurns = 0; quarterTurns < 4; quarterTurns += 1) {
        for (const reverseActive of [false, true]) {
          for (const moveDirection of [-1, 1]) {
            const rotate = (x: number, y: number) => rotatePoint({ x, y }, quarterTurns);
            const activePoints = [rotate(80, 0), rotate(0, 0)];
            if (reverseActive) activePoints.reverse();
            const schematicDocument: SchematicDocument = fixtureDocument({

              junctionAppearances: [],
              netLabels: [],
              notes: [],
              components: [],
              wires: [
                { id: "stem", routeMode: "orthogonal", points: [rotate(0, -80), rotate(0, 0)] },
                { id: "fixedArm", routeMode: "orthogonal", points: [rotate(0, 0), rotate(-80, 0)] },
                { id: "activeArm", routeMode: "orthogonal", points: activePoints }
              ],
              junctions: []
            });
            const startPointer = rotate(40, 0);
            const nextPointer = rotate(40, moveDirection * 40);

            applySegmentMove(schematicDocument, "activeArm", startPointer, nextPointer);

            expectAtomicConnectedWires(schematicDocument);
            expect(schematicDocument.wires).toHaveLength(4);
          }
        }
      }
    });

    it("avoids overlapping metadata variants when an arm moves past the opposite stem endpoint", () => {
      const schematicDocument: SchematicDocument = fixtureDocument({

        junctionAppearances: [],
        netLabels: [],
        notes: [],
        components: [],
        wires: [
          { id: "stem", routeMode: "orthogonal", points: [{ x: 0, y: -80 }, { x: 0, y: 0 }] },
          { id: "fixedArm", routeMode: "orthogonal", points: [{ x: 0, y: 0 }, { x: -80, y: 0 }] },
          {
            id: "activeArm",
            routeMode: "orthogonal",
            points: [{ x: 80, y: 0 }, { x: 0, y: 0 }],
            appearance: { variant: "wide", color: "#336699" }
          }
        ],
        junctions: []
      });

      applySegmentMove(schematicDocument, "activeArm", { x: 40, y: 0 }, { x: 40, y: -120 });

      expectAtomicConnectedWires(schematicDocument);

      applySegmentMove(schematicDocument, "activeArm", { x: 40, y: -120 }, { x: 40, y: 0 });

      expectAtomicConnectedWires(schematicDocument);
      expect(schematicDocument.wires).toHaveLength(3);
    });

    it("moves a vertical segment only along its perpendicular axis", () => {
      const schematicDocument: SchematicDocument = fixtureDocument({

        junctionAppearances: [],
        netLabels: [],
        notes: [],
        components: [],
        wires: [{ id: "vertical", routeMode: "orthogonal", points: [{ x: 40, y: 20 }, { x: 40, y: 100 }] }],
        junctions: []
      });
      const transaction = beginWireSegmentMove(schematicDocument, "vertical", { x: 40, y: 60 });

      expect(transaction).toMatchObject({ moveAxis: "x" });
      expect(projectWireSegmentMove(transaction!, { x: 80, y: 140 }).get("vertical")).toEqual([
        { x: 80, y: 20 },
        { x: 80, y: 100 }
      ]);
    });
  });
});
