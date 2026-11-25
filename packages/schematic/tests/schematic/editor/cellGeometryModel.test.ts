import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { applyComponentCellGeometry, applyWireCellGeometry } from "../../../src/schematic/cellGeometryModel";
import { componentPinPoints } from "../../../src/schematic/document/documentGeometryModel";
import type { SchematicDocument } from "../../../src/schematic/types";
import { fixtureComponent, fixtureWire, twoResistorsStraightWireDoc } from "../support/fixtures";

describe("schematic cell geometry model", () => {
  it("leaves a component no-op unchanged and returns no updated wires", () => {
    const document = twoResistorsStraightWireDoc();
    const instance = document.components[0];
    const result = applyComponentCellGeometry({
      document,
      componentId: "R1",
      nextCenter: { x: 200, y: 200 },
      oldPinPoints: componentPinPoints(instance),
      moveBehavior: "stretch"
    });

    expect(result.changed).toBe(false);
    expect(Array.from(result.updatedWireIds)).toEqual([]);
    expect(instance).toMatchObject({ x: 200, y: 200 });
    expect(document.wires[0].points).toEqual([
      { x: 240, y: 200 },
      { x: 320, y: 200 }
    ]);
  });

  it("updates component instance coordinates when the center changes", () => {
    const document = twoResistorsStraightWireDoc();
    const instance = document.components[0];
    const result = applyComponentCellGeometry({
      document,
      componentId: "R1",
      nextCenter: { x: 240, y: 220 },
      oldPinPoints: componentPinPoints(instance),
      moveBehavior: "moveOnly"
    });

    expect(result.changed).toBe(true);
    expect(Array.from(result.updatedWireIds)).toEqual([]);
    expect(instance).toMatchObject({ x: 240, y: 220 });
  });

  it("keeps a half-grid rectangle center stationary on click and moves by grid-aligned vertices", () => {
    const instance = fixtureComponent("rectangle", "X1", 215, 260);
    instance.values.rectangleWidthGrid = "1.5";
    instance.values.rectangleHeightGrid = "2";
    const document = fixtureDocument({ components: [instance], wires: [] });
    const input = {
      document,
      componentId: instance.id,
      oldPinPoints: componentPinPoints(instance),
      moveBehavior: "moveOnly" as const
    };

    expect(applyComponentCellGeometry({ ...input, nextCenter: { x: 215, y: 260 } }).changed).toBe(false);
    expect(instance).toMatchObject({ x: 215, y: 260 });
    expect(applyComponentCellGeometry({ ...input, nextCenter: { x: 225, y: 270 } }).changed).toBe(true);
    expect(instance).toMatchObject({ x: 225, y: 270 });
  });

  it("keeps a half-grid triangle center stationary on click and moves by grid-aligned vertices", () => {
    const instance = fixtureComponent("triangle", "X1", 210, 260);
    const document = fixtureDocument({ components: [instance], wires: [] });
    const input = {
      document,
      componentId: instance.id,
      oldPinPoints: componentPinPoints(instance),
      moveBehavior: "moveOnly" as const
    };

    expect(applyComponentCellGeometry({ ...input, nextCenter: { x: 210, y: 260 } }).changed).toBe(false);
    expect(instance).toMatchObject({ x: 210, y: 260 });
    expect(applyComponentCellGeometry({ ...input, nextCenter: { x: 220, y: 270 } }).changed).toBe(true);
    expect(instance).toMatchObject({ x: 220, y: 270 });
  });

  it("stretches attached wire endpoints in stretch mode and returns updated wire ids", () => {
    const document = twoResistorsStraightWireDoc();
    const instance = document.components[0];
    const result = applyComponentCellGeometry({
      document,
      componentId: "R1",
      nextCenter: { x: 240, y: 200 },
      oldPinPoints: componentPinPoints(instance),
      moveBehavior: "stretch"
    });

    expect(result.changed).toBe(true);
    expect(Array.from(result.updatedWireIds)).toEqual(["w-r1-r2"]);
    expect(document.wires[0].points).toEqual([
      { x: 280, y: 200 },
      { x: 320, y: 200 }
    ]);
  });

  it("leaves attached wires in place in move-only mode", () => {
    const document = twoResistorsStraightWireDoc();
    const instance = document.components[0];
    const result = applyComponentCellGeometry({
      document,
      componentId: "R1",
      nextCenter: { x: 240, y: 200 },
      oldPinPoints: componentPinPoints(instance),
      moveBehavior: "moveOnly"
    });

    expect(result.changed).toBe(true);
    expect(Array.from(result.updatedWireIds)).toEqual([]);
    expect(document.wires[0].points).toEqual([
      { x: 240, y: 200 },
      { x: 320, y: 200 }
    ]);
  });

  it("does not stretch excluded selected wires during selection moves", () => {
    const document = twoResistorsStraightWireDoc();
    const instance = document.components[0];
    const result = applyComponentCellGeometry({
      document,
      componentId: "R1",
      nextCenter: { x: 240, y: 200 },
      oldPinPoints: componentPinPoints(instance),
      moveBehavior: "stretch",
      excludedWireIds: new Set(["w-r1-r2"])
    });

    expect(result.changed).toBe(true);
    expect(Array.from(result.updatedWireIds)).toEqual([]);
    expect(document.wires[0].points).toEqual([
      { x: 240, y: 200 },
      { x: 320, y: 200 }
    ]);
  });

  it("updates wire geometry from raw snapped normalized points", () => {
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      wires: [fixtureWire("w1", [{ x: 0, y: 0 }, { x: 40, y: 0 }])],
      junctions: []
    });
    const result = applyWireCellGeometry({
      document,
      wireId: "w1",
      points: [{ x: 3, y: 8 }, { x: 39, y: 8 }, { x: 39, y: 42 }]
    });

    expect(result.changed).toBe(true);
    expect(document.wires[0].points).toEqual([
      { x: 0, y: 10 },
      { x: 40, y: 10 },
      { x: 40, y: 40 }
    ]);
  });

  it("treats same-path and invalid wire geometry as no-ops", () => {
    const samePathDocument: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      wires: [fixtureWire("w1", [{ x: 0, y: 0 }, { x: 40, y: 0 }])],
      junctions: []
    });
    expect(
      applyWireCellGeometry({
        document: samePathDocument,
        wireId: "w1",
        points: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 40, y: 0 }]
      }).changed
    ).toBe(false);
    expect(samePathDocument.wires[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 }
    ]);

    const invalidDocument: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [],
      wires: [fixtureWire("w1", [{ x: 0, y: 0 }, { x: 40, y: 0 }])],
      junctions: []
    });
    expect(
      applyWireCellGeometry({
        document: invalidDocument,
        wireId: "w1",
        points: [{ x: Number.NaN, y: 0 }, { x: 20, y: "bad" }]
      }).changed
    ).toBe(false);
    expect(invalidDocument.wires[0].points).toEqual([
      { x: 0, y: 0 },
      { x: 40, y: 0 }
    ]);
  });

  it("moves junction intents only for uniform wire path moves", () => {
    const document: SchematicDocument = fixtureDocument({
      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [fixtureComponent("resistor", "R1", 0, 0)],
      wires: [fixtureWire("w1", [{ x: 0, y: 0 }, { x: 80, y: 0 }])],
      junctions: [{ x: 40, y: 0 }],

    }, { joinAt: [{ x: 40, y: 0 }] });

    expect(
      applyWireCellGeometry({
        document,
        wireId: "w1",
        points: [{ x: 20, y: 20 }, { x: 100, y: 20 }]
      }).changed
    ).toBe(true);

    expect(
      applyWireCellGeometry({
        document,
        wireId: "w1",
        points: [{ x: 20, y: 20 }, { x: 100, y: 60 }]
      }).changed
    ).toBe(true);

  });
});
