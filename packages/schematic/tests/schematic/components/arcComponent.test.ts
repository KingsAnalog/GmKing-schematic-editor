import { describe, expect, it } from "vitest";
import { ARC_POINTS_VALUE_KEY, createArcGeometry, setArcVertex } from "../../../src/schematic/arcComponentModel";
import { quadraticArc } from "../../../src/schematic/arcGeometry";
import { libraryShapeStyle } from "../../../src/schematic/libraryShapeStyleModel";
import { arcArtwork } from "../../../src/schematic/symbols/arcSymbols";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { renderSchematicDocumentSvg } from "../../../src/schematic/documentSvgRenderer";
import { libraryShapeVertices, snapLibraryShapeCenterToVertices } from "../../../src/schematic/libraryShapeGeometry";
import { buildStructuralNetlist } from "../../../src/schematic/netlist/build";
import { parseSchematicDocumentFile, serializeSchematicDocumentFile } from "../../../src/schematic/schematicDocumentFile";
import { fixtureDocument } from "../support/fixtureDocument";
import { fixtureComponent } from "../support/fixtures";

const start = { x: 0, y: 0 };
const end = { x: 100, y: 0 };
const coordinates = (path: string) => path.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi)!.map(Number);

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

  it("sets each arrow tip at its endpoint and trims the shaft along the original Bézier curve", () => {
    const shape = { ...fixtureComponent("arc", "X1", 50, 50), values: {
      arcPoints: "[[-50,-50],[50,-50],[0,50]]",
      libraryShapeStartArrow: "asmeFilled", libraryShapeStartArrowSize: "small",
      libraryShapeEndArrow: "filled", libraryShapeEndArrowSize: "large"
    } };
    const cell = makeComponentCell(shape);
    const markers = cell.attr("symbolMarker/d") as string;
    const [startMarker, endMarker] = markers.split(" Z").filter(Boolean).map(coordinates);
    expect(startMarker.slice(0, 2)).toEqual([0, 0]);
    expect(endMarker.slice(0, 2)).toEqual([100, 0]);
    const shaft = cell.attr("symbolBody/d") as string;
    const [startX, startY, , , endX, endY] = coordinates(shaft);
    const join = ([tipX, tipY, x0, y0, x1, y1]: number[]) => ({
      x: tipX + 0.95 * ((x0 + x1) / 2 - tipX),
      y: tipY + 0.95 * ((y0 + y1) / 2 - tipY)
    });
    expect(startX).toBeCloseTo(join(startMarker).x, 6);
    expect(startY).toBeCloseTo(join(startMarker).y, 6);
    expect(endX).toBeCloseTo(join(endMarker).x, 6);
    expect(endY).toBeCloseTo(join(endMarker).y, 6);
    const originalY = (x: number) => 400 * (x / 100) * (1 - x / 100);
    expect(startX).toBeGreaterThan(0);
    expect(endX).toBeLessThan(100);
    expect(startY).toBeCloseTo(originalY(startX));
    expect(endY).toBeCloseTo(originalY(endX));
    expect(cell.attr("arcHit/d")).toBe("M 0 0 Q 50 200 100 0");

    const document = fixtureDocument({ components: [shape] });
    const restored = parseSchematicDocumentFile(serializeSchematicDocumentFile(document));
    expect(libraryShapeStyle(restored.components[0])).toMatchObject({
      startArrow: "asmeFilled", startArrowSize: "small", endArrow: "filled", endArrowSize: "large"
    });
    const { svg } = renderSchematicDocumentSvg(restored, { namespace: "arc-arrows", padding: 0 });
    expect(svg).toContain(`d="${markers}"`);
    expect(svg).toContain(`d="${shaft}"`);
  });

  it("keeps equal ASME head dimensions when one endpoint turns sharply", () => {
    const shape = { ...fixtureComponent("arc", "X1", 70, 20), values: {
      arcPoints: "[[-70,0],[70,0],[-35,-17]]",
      libraryShapeStartArrow: "asmeFilled", libraryShapeEndArrow: "asmeFilled"
    } };
    const markers = makeComponentCell(shape).attr("symbolMarker/d") as string;
    const heads = markers.split(" Z").filter(Boolean).map(coordinates);
    expect(heads).toHaveLength(2);
    for (const [tipX, tipY, baseX1, baseY1, baseX2, baseY2] of heads) {
      expect(Math.hypot((baseX1 + baseX2) / 2 - tipX, (baseY1 + baseY2) / 2 - tipY)).toBeCloseTo(24);
      expect(Math.hypot(baseX1 - baseX2, baseY1 - baseY2)).toBeCloseTo(16);
    }
  });

  it("keeps the first join when a collinear curve doubles back", () => {
    const style = libraryShapeStyle({
      type: "arc", values: { libraryShapeStartArrow: "asmeFilled" }
    });
    const artwork = arcArtwork(0, 0, [start, end, { x: -15, y: 0 }], style);
    const [shaftStartX,, controlX] = coordinates(artwork.path);
    expect(shaftStartX).toBeCloseTo(-22.8);
    expect(controlX).toBeLessThan(shaftStartX);
  });

  it("keeps arrows for short arcs with coincident controls and includes wide heads in rotated exports", () => {
    const short = [start, { x: 10, y: 0 }, { x: 2.5, y: 0 }];
    const shape = { ...fixtureComponent("arc", "X1", 200, 200, 90), mirrored: true, scale: 2 as const, values: {
      arcPoints: "[[-100,0],[100,0],[0,0]]",
      libraryShapeStartArrow: "asmeFilled", libraryShapeStartArrowSize: "extraLarge",
      libraryShapeEndArrow: "open"
    } };
    const style = libraryShapeStyle(shape);
    const { path, markers } = arcArtwork(10, 10, short, style);
    expect(markers.match(/M /g)).toHaveLength(2);
    expect(coordinates(path).every(Number.isFinite)).toBe(true);
    const [from, , , , to] = coordinates(path);
    expect(from).toBeGreaterThan(5);
    expect(to).toBeGreaterThan(from);
    expect(to).toBeLessThan(15);

    const document = fixtureDocument({ components: [shape] });
    const withArrows = renderSchematicDocumentSvg(document, { namespace: "rotated-arc", padding: 0 });
    const withoutArrows = renderSchematicDocumentSvg(fixtureDocument({
      components: [{ ...shape, values: { arcPoints: shape.values.arcPoints } }]
    }), { namespace: "rotated-arc", padding: 0 });
    if (!withArrows.bounds || !withoutArrows.bounds) throw new Error("Expected bounds for each arc export");
    expect(withArrows.bounds.x).toBeLessThan(withoutArrows.bounds.x);
    expect(withArrows.bounds.width).toBeGreaterThan(withoutArrows.bounds.width);
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
