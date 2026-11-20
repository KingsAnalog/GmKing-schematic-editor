import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { JUNCTION_MARKER_DIAMETER, JUNCTION_MARKER_RADIUS } from "../../../src/schematic/renderer";
import {
  componentCellPosition,
  componentCenterFromCellPosition,
  componentFrameBox,
  componentVisualBounds,
  junctionVisualBounds,
  noteVisualBounds,
  schematicDocumentVisualBounds,
  unionRects,
  wireVisualBounds
} from "../../../src/schematic/view-geometry";
import type { SchematicDocument } from "../../../src/schematic/types";
import { emptyDoc, fixtureComponent, fixtureNote, fixtureWire } from "../support/fixtures";
import { resolveComponentDef } from "../../../src/schematic/catalog";
import { setRectangleProperty } from "../../../src/schematic/rectangleComponentModel";
import { setTriangleVertex } from "../../../src/schematic/triangleComponentModel";
import { libraryShapeVertices } from "../../../src/schematic/libraryShapeGeometry";
import { makeComponentCell, SymbolElementView } from "../../../src/schematic/componentRenderer";

describe("schematic view geometry", () => {
  it("drags rotated asymmetric frames by one grid step without shifting the other axis", () => {
    for (const type of ["switch", "inverter"] as const) {
      for (const rotation of [90, 270]) {
        for (const mirrored of [false, true]) {
          const component = fixtureComponent(type, "X1", 210, 250, rotation);
          Object.assign(component, { mirrored, variantId: type === "inverter" ? "variable" : "open" });
          const cell = makeComponentCell(component);
          const origin = cell.position();
          for (const delta of [{ x: 10, y: 0 }, { x: -10, y: 0 }, { x: 0, y: 10 }, { x: 0, y: -10 }]) {
            const position = (SymbolElementView.prototype as any).snapToGrid.call(
              { model: cell, paper: { options: { gridSize: 10 } } }, {}, origin.x + delta.x, origin.y + delta.y
            );
            expect(componentCenterFromCellPosition(component, position)).toEqual({ x: 210 + delta.x, y: 250 + delta.y });
          }
        }
      }
    }
  });

  it("fits an odd-sized pure rectangle frame to the grid without moving its center", () => {
    const component = fixtureComponent("rectangle", "X1", 210, 250);
    setRectangleProperty(component, "width", 5);
    setRectangleProperty(component, "height", 3);
    expect(componentFrameBox(resolveComponentDef(component))).toEqual({ x: 0, y: 0, width: 100, height: 60 });
    for (const rotation of [0, 90, 180, 270]) {
      for (const mirrored of [false, true]) {
        Object.assign(component, { rotation, mirrored });
        const position = componentCellPosition(component);
        expect(componentCenterFromCellPosition(component, position)).toEqual({ x: 210, y: 250 });
        expect(componentVisualBounds(component)).toEqual(rotation % 180 === 0
          ? { x: 160, y: 220, width: 100, height: 60 }
          : { x: 180, y: 200, width: 60, height: 100 });
      }
    }
  });

  it.each(["rectangle", "triangle"] as const)("uses the exact %s outline for its selection frame", type => {
    const component = fixtureComponent(type, "X1", 210, 250);
    if (type === "rectangle") {
      setRectangleProperty(component, "width", 0.5);
      setRectangleProperty(component, "height", 0.5);
    } else {
      expect(setTriangleVertex(component, "a", { x: 250, y: 120 }).kind).toBe("changed");
    }
    const definition = resolveComponentDef(component);
    const frame = componentFrameBox(definition);
    const cell = makeComponentCell(component);
    expect(frame).toEqual({ x: 0, y: 0, width: definition.size.width, height: definition.size.height });
    expect(cell.attr("frame")).toMatchObject({ x: 0, y: 0, width: frame.width, height: frame.height });
    if (type === "rectangle") expect(frame).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  it.each(["rectangle", "triangle"] as const)("uses every %s outline vertex as the snapping reference", type => {
    const initialCenter = { x: type === "rectangle" ? 215 : 210, y: 260 };
    const component = fixtureComponent(type, "X1", initialCenter.x, initialCenter.y);
    if (type === "rectangle") {
      component.values.rectangleWidthGrid = "1.5";
      component.values.rectangleHeightGrid = "2";
    }
    const cell = makeComponentCell(component);
    const origin = cell.position();
    const snapToGrid = (x: number, y: number) => (SymbolElementView.prototype as any).snapToGrid.call(
      { model: cell, paper: { options: { gridSize: 10 } } }, {}, x, y
    );

    const clicked = snapToGrid(origin.x, origin.y);
    const clickedCenter = componentCenterFromCellPosition(component, clicked);
    expect(clickedCenter).toEqual(initialCenter);
    const dragged = snapToGrid(origin.x + 10, origin.y + 10);
    const draggedCenter = componentCenterFromCellPosition(component, dragged);
    expect(draggedCenter).toEqual({ x: initialCenter.x + 10, y: initialCenter.y + 10 });
    for (const center of [clickedCenter, draggedCenter]) {
      const vertices = libraryShapeVertices({ ...component, ...center });
      expect(vertices).toHaveLength(type === "rectangle" ? 4 : 3);
      for (const vertex of vertices) {
        expect(vertex.x % 10).toBe(0);
        expect(vertex.y % 10).toBe(0);
      }
    }
  });

  it("unions active component, wire, junction, and note bounds", () => {
    const component = fixtureComponent("resistor", "R1", 100, 100);
    const wire = fixtureWire("w1", [
      { x: 140, y: 100 },
      { x: 220, y: 100 }
    ]);
    const junction = { x: 220, y: 100 };
    const note = fixtureNote("note-1", 260, 80);
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [component],
      wires: [wire],
      junctions: [junction],
      notes: [note]
    });

    expect(schematicDocumentVisualBounds(document, { includeNotes: true })).toEqual(
      unionRects([
        componentVisualBounds(component),
        wireVisualBounds(wire),
        junctionVisualBounds(junction),
        noteVisualBounds(note)
      ])
    );
  });

  it("includes visible temporarily deleted components and wires by default", () => {
    const activeComponent = fixtureComponent("resistor", "R1", 100, 100);
    const activeWire = fixtureWire("w1", [
      { x: 140, y: 100 },
      { x: 220, y: 100 }
    ]);
    const deletedComponent = {
      ...fixtureComponent("capacitor", "Cdel", 1200, 1200),
      temporarilyDeleted: true
    };
    const deletedWire = {
      ...fixtureWire("w-del", [
        { x: 1400, y: 1400 },
        { x: 1500, y: 1400 }
      ]),
      temporarilyDeleted: true
    };
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      notes: [],
      components: [activeComponent, deletedComponent],
      wires: [activeWire, deletedWire],
      junctions: []
    });

    expect(schematicDocumentVisualBounds(document)).toEqual(
      unionRects([
        componentVisualBounds(activeComponent),
        wireVisualBounds(activeWire),
        componentVisualBounds(deletedComponent),
        wireVisualBounds(deletedWire)
      ])
    );
    expect(schematicDocumentVisualBounds(document, { includeTemporarilyDeleted: false })).toEqual(
      unionRects([componentVisualBounds(activeComponent), wireVisualBounds(activeWire)])
    );
  });

  it("keeps notes controlled by includeNotes", () => {
    const component = fixtureComponent("resistor", "R1", 100, 100);
    const note = fixtureNote("note-1", 400, 200);
    const document: SchematicDocument = fixtureDocument({

      junctionAppearances: [],
      netLabels: [],
      components: [component],
      wires: [],
      junctions: [],
      notes: [note]
    });

    expect(schematicDocumentVisualBounds(document)).toEqual(componentVisualBounds(component));
    expect(schematicDocumentVisualBounds(document, { includeNotes: true })).toEqual(
      unionRects([componentVisualBounds(component), noteVisualBounds(note)])
    );
  });

  it("returns null for an empty document", () => {
    expect(schematicDocumentVisualBounds(emptyDoc())).toBeNull();
  });

  it("matches the existing junction marker radius and diameter", () => {
    const point = { x: 20, y: 40 };

    expect(junctionVisualBounds(point)).toEqual({
      x: point.x - JUNCTION_MARKER_RADIUS,
      y: point.y - JUNCTION_MARKER_RADIUS,
      width: JUNCTION_MARKER_DIAMETER,
      height: JUNCTION_MARKER_DIAMETER
    });
  });

  it("includes endpoint markers and digital labels in wire bounds", () => {
    const wire = fixtureWire("decorated", [
      { x: 0, y: 0 },
      { x: 100, y: 0 }
    ], {
      variant: "signal",
      startMarker: "arrow",
      endMarker: "circle",
      digitalSlash: true,
      digitalLabel: "8<"
    });

    expect(wireVisualBounds(wire)).toEqual({
      x: -24,
      y: -14,
      width: 129,
      height: 20
    });
  });
});
