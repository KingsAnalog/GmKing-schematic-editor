import { describe, expect, it } from "vitest";
import { circleSize, createCircleGeometry, setCircleAxis } from "../../../src/schematic/circleComponentModel";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { renderSchematicDocumentSvg } from "../../../src/schematic/documentSvgRenderer";
import { libraryShapeVertices, snapLibraryShapeCenterToVertices } from "../../../src/schematic/libraryShapeGeometry";
import { buildStructuralNetlist } from "../../../src/schematic/netlist/build";
import { createPolygonGeometry, setPolygonVertex } from "../../../src/schematic/polygonComponentModel";
import { parseSchematicDocumentFile, serializeSchematicDocumentFile } from "../../../src/schematic/schematicDocumentFile";
import { fixtureDocument } from "../support/fixtureDocument";
import { fixtureComponent } from "../support/fixtures";

describe("Closed Library shapes", () => {
  it("uses the exact radial distance between two grid points", () => {
    const center = { x: 150, y: 200 };
    const edge = { x: 180, y: 220 };
    const geometry = createCircleGeometry([center, edge])!;
    const circle = { ...fixtureComponent("circle", "X1", center.x, center.y), values: geometry.values };
    expect(geometry.center).toEqual(center);
    expect(circleSize(circle)).toEqual({ width: 2 * Math.hypot(30, 20), height: 2 * Math.hypot(30, 20) });
    expect(createCircleGeometry([center, center])).toBeNull();
  });

  it("adjusts only the dragged axis, preserving the opposite edge under rotation, mirror and scale", () => {
    const circle = { ...fixtureComponent("circle", "X1", 150, 200, 90), mirrored: true, scale: 2 as const };
    // Local right points upward on the canvas in this orientation. The bottom edge stays at y=280.
    expect(setCircleAxis(circle, 1, { x: 185, y: 100 })).toBe(true);
    expect(circleSize(circle)).toEqual({ width: 90, height: 80 });
    expect({ x: circle.x, y: circle.y }).toEqual({ x: 150, y: 190 });
    expect(circle.y + circleSize(circle).width).toBe(280);
    expect(snapLibraryShapeCenterToVertices(circle, { x: 162, y: 182 })).toEqual({ x: 160, y: 180 });
  });

  it("keeps polygon vertices ordered and leaves other vertices in place while editing", () => {
    const points = [{ x: 10, y: 20 }, { x: 100, y: 20 }, { x: 50, y: 60 }, { x: 80, y: 90 }];
    const { center, values } = createPolygonGeometry(points)!;
    const polygon = { ...fixtureComponent("polygon", "X2", center.x, center.y), values };
    const moved = { x: 60, y: 50 };
    expect(libraryShapeVertices(polygon)).toEqual(points);
    expect(setPolygonVertex(polygon, 2, moved)).toBe(true);
    expect(libraryShapeVertices(polygon)).toEqual([points[0], points[1], moved, points[3]]);
    expect(setPolygonVertex(polygon, 2, points[0])).toBe(false);
    expect(createPolygonGeometry([points[0], points[1], { x: 60, y: 20 }])).toBeNull();
  });

  it("round-trips both shapes and renders the same closed paths on the canvas and in SVG", () => {
    const circle = { ...fixtureComponent("circle", "X1", 150, 200),
      values: { circleRadiusX: "35", circleRadiusY: "25", libraryShapeFillEnabled: "true", libraryShapeFillColor: "#123abc" } };
    const polygon = fixtureComponent("polygon", "X2", 350, 200);
    const document = fixtureDocument({ components: [circle, polygon] });
    const file = serializeSchematicDocumentFile(document);
    const restored = parseSchematicDocumentFile(file);
    const { svg } = renderSchematicDocumentSvg(restored, { namespace: "closed-shapes" });
    for (const shape of restored.components) {
      const cell = makeComponentCell(shape);
      const path = cell.attr("symbolBody/d");
      expect(path).toMatch(/ Z$/);
      expect(svg).toContain(`d="${path}"`);
      expect(cell.getPorts()).toEqual([]);
    }
    expect(svg).toContain('fill="#123abc"');
    expect(buildStructuralNetlist(restored)).toEqual(buildStructuralNetlist(fixtureDocument({})));
    const invalid = JSON.parse(file);
    invalid.schematic.components[1].values.polygonPoints = "[[0,0],[10,10],[20,20]]";
    expect(() => parseSchematicDocumentFile(JSON.stringify(invalid))).toThrow(/polygonPoints/);
  });
});
