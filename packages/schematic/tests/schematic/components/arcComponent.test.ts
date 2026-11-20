import { describe, expect, it } from "vitest";
import { ARC_POINTS_VALUE_KEY, createArcGeometry, setArcVertex } from "../../../src/schematic/arcComponentModel";
import { quadraticArc } from "../../../src/schematic/arcGeometry";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { renderSchematicDocumentSvg } from "../../../src/schematic/documentSvgRenderer";
import { libraryShapeVertices, snapLibraryShapeCenterToVertices } from "../../../src/schematic/libraryShapeGeometry";
import { buildStructuralNetlist } from "../../../src/schematic/netlist/build";
import { parseSchematicDocumentFile, serializeSchematicDocumentFile } from "../../../src/schematic/schematicDocumentFile";
import { fixtureDocument } from "../support/fixtureDocument";
import { fixtureComponent } from "../support/fixtures";

const start = { x: 0, y: 0 };
const end = { x: 100, y: 0 };

describe("Library arc", () => {
  it("passes through its shaping point, including across the chord and outside the endpoints", () => {
    const above = quadraticArc([start, end, { x: 50, y: -20 }])!;
    expect(above).toEqual({ control: { x: 50, y: -40 }, bounds: { x: 0, y: -20, width: 100, height: 20 } });
    const flat = quadraticArc([start, end, { x: 50, y: 0 }])!;
    expect(flat).toEqual({ control: { x: 50, y: 0 }, bounds: { x: 0, y: 0, width: 100, height: 0 } });
    expect(createArcGeometry([start, end, { x: 50, y: 0 }])).not.toBeNull();
    const outside = quadraticArc([start, end, { x: -20, y: 30 }])!;
    expect(outside.control).toEqual({ x: -90, y: 60 });
    expect(outside.bounds.x).toBeCloseTo(-28.928571);
    expect(outside.bounds.y).toBe(0);
    expect(outside.bounds.height).toBe(30);
    expect(createArcGeometry([start, start, { x: -20, y: 30 }])).toBeNull();
  });

  it("reshapes at one-pixel steps with rotated and mirrored endpoints fixed", () => {
    const shape = { ...fixtureComponent("arc", "X1", 200, 210, 90), scale: 2 as const, mirrored: true };
    const [start, end, through] = libraryShapeVertices(shape);
    const collinear = { x: start.x, y: through.y };
    expect(setArcVertex(shape, 2, collinear)).toBe(true);
    expect(libraryShapeVertices(shape)).toEqual([start, end, collinear]);
    const next = { x: collinear.x + 1, y: collinear.y - 1 };
    expect(setArcVertex(shape, 2, next)).toBe(true);
    expect(libraryShapeVertices(shape)).toEqual([start, end, next]);
    expect(setArcVertex(shape, 1, start)).toBe(false);

    const snapped = snapLibraryShapeCenterToVertices(shape, { x: shape.x + 12, y: shape.y + 18 });
    expect(libraryShapeVertices(shape, snapped)).toEqual([start, end, next].map(point => ({ x: point.x + 10, y: point.y + 20 })));
  });

  it("reuses previous arc points for the new geometry and exports the same path with exact bounds", () => {
    const shape = { ...fixtureComponent("arc", "X1", 50, 50), values: { arcPoints: "[[-50,-50],[50,-50],[0,50]]" } };
    const cell = makeComponentCell(shape);
    const path = cell.attr("symbolBody/d");
    expect(path).toBe("M 0 0 Q 50 200 100 0");
    expect(cell.attr("arcHit/d")).toBe(path);
    expect(cell.getPorts()).toEqual([]);
    const document = fixtureDocument({ components: [shape] });
    expect(buildStructuralNetlist(document)).toEqual(buildStructuralNetlist(fixtureDocument({})));

    const file = serializeSchematicDocumentFile(document);
    const restored = parseSchematicDocumentFile(file);
    expect(libraryShapeVertices(restored.components[0])).toEqual([start, end, { x: 50, y: 100 }]);
    const { svg, bounds } = renderSchematicDocumentSvg(restored, { namespace: "arc", padding: 0 });
    expect(svg).toContain(`d="${path}"`);
    expect(bounds).toEqual({ x: -2, y: -2, width: 104, height: 104 });
    const invalid = JSON.parse(file);
    invalid.schematic.components[0].values[ARC_POINTS_VALUE_KEY] = "[[0,0],[0,0],[20,0]]";
    expect(() => parseSchematicDocumentFile(JSON.stringify(invalid))).toThrow(/arcPoints/);
  });
});
