import { describe, expect, it } from "vitest";
import { resolveComponentDef } from "../../../src/schematic/catalog";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { renderSchematicDocumentSvg } from "../../../src/schematic/documentSvgRenderer";
import { libraryShapeVertices } from "../../../src/schematic/libraryShapeGeometry";
import { libraryShapeStyle, setLibraryShapeStyleProperty } from "../../../src/schematic/libraryShapeStyleModel";
import { buildStructuralNetlist } from "../../../src/schematic/netlist/build";
import { createPolylineGeometry, POLYLINE_POINTS_VALUE_KEY, setPolylineVertex } from "../../../src/schematic/polylineComponentModel";
import { parseSchematicDocumentFile, serializeSchematicDocumentFile } from "../../../src/schematic/schematicDocumentFile";
import { fixtureDocument } from "../support/fixtureDocument";
import { fixtureComponent } from "../support/fixtures";

describe("Library polyline", () => {
  it("centers horizontal lines and validates persisted vertices", () => {
    const geometry = createPolylineGeometry([{ x: 100, y: 200 }, { x: 110, y: 200 }])!;
    const shape = { ...fixtureComponent("polyline", "X1", 0, 0), ...geometry.center, values: geometry.values };
    expect(shape).toMatchObject({ x: 105, y: 200 });
    expect(libraryShapeVertices(shape)).toEqual([{ x: 100, y: 200 }, { x: 110, y: 200 }]);
    const document = fixtureDocument({ components: [shape] });
    const file = serializeSchematicDocumentFile(document);
    const restored = parseSchematicDocumentFile(file).components[0];
    expect(restored.values).toEqual(shape.values);
    expect(libraryShapeVertices(restored)).toEqual(libraryShapeVertices(shape));
    const invalid = JSON.parse(file);
    invalid.schematic.components[0].values[POLYLINE_POINTS_VALUE_KEY] = "[[0,0],[0,0]]";
    expect(() => parseSchematicDocumentFile(JSON.stringify(invalid))).toThrow(/polylinePoints/);
  });

  it("moves just the requested vertex on a scaled, rotated, and mirrored line", () => {
    const shape = { ...fixtureComponent("polyline", "X1", 200, 200, 90), scale: 2 as const, mirrored: true };
    const vertices = libraryShapeVertices(shape);
    expect(setPolylineVertex(shape, 1, { x: 261, y: 248 })).toBe(true);
    const target = { x: 260, y: 250 };
    expect(libraryShapeVertices(shape)).toEqual([vertices[0], target, ...vertices.slice(2)]);
    expect(setPolylineVertex(shape, 1, vertices[0])).toBe(false);
    expect(libraryShapeVertices(shape)[1]).toEqual(target);
  });

  it("shares independently styled arrowheads between canvas and SVG without affecting the netlist", () => {
    const shape = fixtureComponent("polyline", "X1", 200, 200);
    const empty = fixtureDocument({});
    const artwork = fixtureDocument({ components: [shape] });
    expect(resolveComponentDef(shape).pins).toEqual([]);
    expect(buildStructuralNetlist(artwork)).toEqual(buildStructuralNetlist(empty));
    expect(setLibraryShapeStyleProperty(shape, "fillEnabled", true)).toEqual({ kind: "noop", reason: "unsupported" });
    shape.values.libraryShapeEndArrow = "true";
    expect(libraryShapeStyle(shape).endArrow).toBe("filled");
    const end = makeComponentCell(shape).attr("symbolMarker/d");
    expect(end.match(/M /g)).toHaveLength(1);
    expect(setLibraryShapeStyleProperty(shape, "startArrow", "open").kind).toBe("changed");
    expect(setLibraryShapeStyleProperty(shape, "startArrowSize", "large").kind).toBe("changed");
    const both = makeComponentCell(shape).attr("symbolMarker/d");
    expect(both).toMatch(new RegExp("M .*M "));
    expect(both.endsWith(end)).toBe(true);
    const document = fixtureDocument({ components: [shape] });
    const restored = parseSchematicDocumentFile(serializeSchematicDocumentFile(document));
    const { svg } = renderSchematicDocumentSvg(restored, { namespace: "polyline" });
    expect(svg).toContain(`d="${both}"`);
    expect(svg).not.toContain("<text");
    expect(libraryShapeStyle(restored.components[0])).toMatchObject({ startArrow: "open", startArrowSize: "large", endArrow: "filled" });
  });

  it("renders the solid ASME arrow with Visio proportions and scales it in the canvas and export", () => {
    const geometry = createPolylineGeometry([{ x: 0, y: 0 }, { x: 200, y: 0 }])!;
    const shape = { ...fixtureComponent("polyline", "X1", 0, 0), ...geometry.center, values: geometry.values };
    setLibraryShapeStyleProperty(shape, "endArrow", "filled");
    const ordinary = makeComponentCell(shape).attr("symbolMarker/d");
    setLibraryShapeStyleProperty(shape, "endArrow", "asmeFilled");
    const medium = makeComponentCell(shape).attr("symbolMarker/d");
    expect(medium).not.toBe(ordinary);
    const [tipX, tipY, baseX, baseY, otherBaseX, otherBaseY] = medium.match(/[-.\d]+/g).map(Number);
    expect([tipX, tipY]).toEqual([200, 5]);
    expect(baseX).toBe(otherBaseX);
    const strokeWidth = libraryShapeStyle(shape).strokeWidth;
    expect(tipX - baseX).toBeCloseTo(6 * strokeWidth);
    expect(Math.abs(baseY - otherBaseY)).toBeCloseTo(4 * strokeWidth);

    setLibraryShapeStyleProperty(shape, "endArrowSize", "large");
    const large = makeComponentCell(shape).attr("symbolMarker/d");
    expect(large).not.toBe(medium);
    const file = serializeSchematicDocumentFile(fixtureDocument({ components: [shape] }));
    const restored = parseSchematicDocumentFile(file);
    expect(libraryShapeStyle(restored.components[0])).toMatchObject({ endArrow: "asmeFilled", endArrowSize: "large" });
    expect(renderSchematicDocumentSvg(restored, { namespace: "asme" }).svg).toContain(`d="${large}"`);
  });

  it("ends a thick shaft inside both arrowheads, leaving the tips at the original grid points", () => {
    const geometry = createPolylineGeometry([{ x: 0, y: 0 }, { x: 10, y: 0 }])!;
    const shape = { ...fixtureComponent("polyline", "X1", 0, 0), ...geometry.center, values: geometry.values };
    setLibraryShapeStyleProperty(shape, "strokeWidth", 40);
    setLibraryShapeStyleProperty(shape, "startArrow", "filled");
    setLibraryShapeStyleProperty(shape, "endArrow", "filled");
    const cell = makeComponentCell(shape);
    const shaft = cell.attr("symbolBody/d").match(/[-.\d]+/g).map(Number);
    expect(shaft[0]).toBeGreaterThan(0);
    expect(shaft[0]).toBeLessThan(shaft[2]);
    expect(shaft[2]).toBeLessThan(10);
    expect(cell.attr("symbolMarker/d")).toMatch(/^M 0 5 .*Z M 10 5 /);
    expect(cell.attr("polylineHit/d")).toBe("M 0 5 L 10 5");
  });
});
