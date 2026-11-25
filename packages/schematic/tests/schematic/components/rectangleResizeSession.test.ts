import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { RectangleResizeSession } from "../../../src/schematic/rectangleResizeSession";
import { rectangleSettings } from "../../../src/schematic/rectangleComponentModel";
import { libraryShapeVertices } from "../../../src/schematic/libraryShapeGeometry";
import { emptyDoc, fixtureComponent, fixtureWire } from "../support/fixtures";

describe("RectangleResizeSession", () => {
  it("keeps the opposite outline corner fixed without changing unrelated wires", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 200, 200);
    const document = fixtureDocument({
      ...emptyDoc(),
      components: [rectangle],
      wires: [fixtureWire("w1", [{ x: 0, y: 0 }, { x: 40, y: 0 }])]
    });
    const previousWire = structuredClone(document.wires[0]);
    const session = new RectangleResizeSession(document);

    expect(session.begin(rectangle.id, "nw")).toBe(true);
    expect(session.move({ x: 140, y: 160 })).toMatchObject({
      active: true,
      changed: true,
      componentId: rectangle.id
    });
    const resized = document.components[0];
    expect(rectangleSettings(resized)).toMatchObject({ widthGrid: 5, heightGrid: 3 });
    expect({ x: resized.x, y: resized.y }).toEqual({ x: 190, y: 190 });
    expect(libraryShapeVertices(resized)[2]).toEqual({ x: 240, y: 220 });
    expect(document.wires[0]).toEqual(previousWire);
    expect(session.commit()).toEqual({
      kind: "committed",
      changed: true,
      status: "Rectangle resized."
    });
  });

  it("resizes in 10 px half-unit steps while keeping the opposite vertex snapped", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 200, 200);
    const document = fixtureDocument({ components: [rectangle], wires: [] });
    const session = new RectangleResizeSession(document);

    session.begin(rectangle.id, "se");
    session.move({ x: 170, y: 190 });
    const resized = document.components[0];
    expect(rectangleSettings(resized)).toMatchObject({ widthGrid: 0.5, heightGrid: 0.5 });
    expect({ x: resized.x, y: resized.y }).toEqual({ x: 165, y: 185 });
    expect(libraryShapeVertices(resized)[0]).toEqual({ x: 160, y: 180 });
    for (const vertex of libraryShapeVertices(resized)) {
      expect(vertex.x % 10).toBe(0);
      expect(vertex.y % 10).toBe(0);
    }
  });

  it.each([
    {
      handle: "n" as const,
      pointer: { x: 350, y: 170 },
      settings: { widthGrid: 4, heightGrid: 2.5 },
      center: { x: 200, y: 195 },
      vertices: [{ x: 160, y: 170 }, { x: 240, y: 170 }, { x: 240, y: 220 }, { x: 160, y: 220 }]
    },
    {
      handle: "e" as const,
      pointer: { x: 260, y: 350 },
      settings: { widthGrid: 5, heightGrid: 2 },
      center: { x: 210, y: 200 },
      vertices: [{ x: 160, y: 180 }, { x: 260, y: 180 }, { x: 260, y: 220 }, { x: 160, y: 220 }]
    },
    {
      handle: "s" as const,
      pointer: { x: 350, y: 230 },
      settings: { widthGrid: 4, heightGrid: 2.5 },
      center: { x: 200, y: 205 },
      vertices: [{ x: 160, y: 180 }, { x: 240, y: 180 }, { x: 240, y: 230 }, { x: 160, y: 230 }]
    },
    {
      handle: "w" as const,
      pointer: { x: 140, y: 350 },
      settings: { widthGrid: 5, heightGrid: 2 },
      center: { x: 190, y: 200 },
      vertices: [{ x: 140, y: 180 }, { x: 240, y: 180 }, { x: 240, y: 220 }, { x: 140, y: 220 }]
    }
  ])("keeps the opposite $handle edge fixed and ignores perpendicular pointer motion", ({ handle, pointer, settings, center, vertices }) => {
    const rectangle = fixtureComponent("rectangle", "X1", 200, 200);
    const document = fixtureDocument({ components: [rectangle], wires: [] });
    const session = new RectangleResizeSession(document);

    expect(session.begin(rectangle.id, handle)).toBe(true);
    expect(session.move(pointer)).toMatchObject({ active: true, changed: true });
    expect(rectangleSettings(document.components[0])).toEqual(settings);
    expect(document.components[0]).toMatchObject(center);
    expect(libraryShapeVertices(document.components[0])).toEqual(vertices);
    expect(session.commit()).toMatchObject({ kind: "committed", changed: true });
  });

  it("interprets edge motion in rotated local coordinates", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 200, 200, 90);
    const document = fixtureDocument({ components: [rectangle], wires: [] });
    const session = new RectangleResizeSession(document);

    session.begin(rectangle.id, "e");
    session.move({ x: 130, y: 260 });
    expect(rectangleSettings(document.components[0])).toEqual({ widthGrid: 5, heightGrid: 2 });
    expect(document.components[0]).toMatchObject({ x: 200, y: 210 });
    expect(libraryShapeVertices(document.components[0])).toEqual([
      { x: 220, y: 160 }, { x: 220, y: 260 }, { x: 180, y: 260 }, { x: 180, y: 160 }
    ]);
  });

  it("does not snap the unchanged axis during an edge drag", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 205, 200);
    Object.assign(rectangle.values, { rectangleWidthGrid: "0.5", rectangleHeightGrid: "0.5" });
    const document = fixtureDocument({ components: [rectangle], wires: [] });
    const before = libraryShapeVertices(rectangle);
    const session = new RectangleResizeSession(document);

    session.begin(rectangle.id, "e");
    session.move({ x: 230, y: 350 });
    const after = libraryShapeVertices(document.components[0]);
    expect(rectangleSettings(document.components[0])).toEqual({ widthGrid: 1.5, heightGrid: 0.5 });
    expect(document.components[0]).toMatchObject({ x: 215, y: 200 });
    expect(after.map(point => point.y)).toEqual(before.map(point => point.y));
    expect(after.map(point => point.x)).toEqual([200, 230, 230, 200]);
  });

  it("interprets corner motion in rotated local coordinates", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 200, 200, 90);
    const document = { ...emptyDoc(), components: [rectangle] };
    const session = new RectangleResizeSession(document);

    session.begin(rectangle.id, "se");
    session.move({ x: 160, y: 260 });
    expect(rectangleSettings(document.components[0])).toMatchObject({
      widthGrid: 5,
      heightGrid: 3
    });
    expect({ x: document.components[0].x, y: document.components[0].y })
      .toEqual({ x: 190, y: 210 });
  });

  it("restores component geometry on cancellation", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 200, 200);
    const document = fixtureDocument({
      ...emptyDoc(),
      components: [rectangle],
      wires: []
    });
    const baseline = structuredClone(document);
    const session = new RectangleResizeSession(document);

    session.begin(rectangle.id, "se");
    session.move({ x: 320, y: 280 });
    expect(document).not.toEqual(baseline);
    expect(session.cancel()).toBe(true);
    expect(document).toEqual(baseline);
  });
});
