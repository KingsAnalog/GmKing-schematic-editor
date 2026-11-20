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
