import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { componentPinPoint } from "../../../src/schematic/netlist";
import { RectangleResizeSession } from "../../../src/schematic/rectangleResizeSession";
import { rectangleSettings } from "../../../src/schematic/rectangleComponentModel";
import { emptyDoc, fixtureComponent, fixtureWire } from "../support/fixtures";

describe("RectangleResizeSession", () => {
  it("keeps the opposite body corner fixed and moves attached pin wires live", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 200, 200);
    const leftPin = componentPinPoint(rectangle, "left-1");
    const document = fixtureDocument({
      ...emptyDoc(),
      components: [rectangle],
      wires: [fixtureWire("w1", [{ x: 80, y: leftPin.y }, leftPin])]
    });
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
    expect(document.wires[0].points.at(-1)).toEqual(componentPinPoint(resized, "left-1"));
    expect(session.commit()).toEqual({
      kind: "committed",
      changed: true,
      status: "Rectangle resized."
    });
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

  it("restores component geometry and wires on cancellation", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 200, 200);
    const pin = componentPinPoint(rectangle, "right-1");
    const document = fixtureDocument({
      ...emptyDoc(),
      components: [rectangle],
      wires: [fixtureWire("w1", [pin, { x: 340, y: 200 }])]
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
