import { describe, expect, it } from "vitest";
import { buildCopySource, instantiateCopyAt } from "../../../src/schematic/copyModel";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { componentValueIssue } from "../../../src/schematic/componentValueSchema";
import { renderComponentSvg } from "../../../src/schematic/componentSvgRenderer";
import {
  DEFAULT_LIBRARY_SHAPE_STYLE,
  LIBRARY_SHAPE_STROKE_WIDTH_VALUE_KEY,
  libraryShapeStyle,
  setLibraryShapeStyleProperty,
  type LibraryShapeStyleProperty,
  type LibraryShapeStyleValue
} from "../../../src/schematic/libraryShapeStyleModel";
import {
  parseSchematicDocumentFile,
  serializeSchematicDocumentFile
} from "../../../src/schematic/schematicDocumentFile";
import { rectangleFrameSymbol } from "../../../src/schematic/symbols/rectangleSymbols";
import { fixtureDocument } from "../support/fixtureDocument";
import { fixtureComponent } from "../support/fixtures";

describe("library shape style model", () => {
  it("uses compact defaults and normalizes every supported property", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 200, 200);
    expect(libraryShapeStyle(rectangle)).toEqual(DEFAULT_LIBRARY_SHAPE_STYLE);

    const changes: [LibraryShapeStyleProperty, LibraryShapeStyleValue, string][] = [
      ["strokeWidth", 2.5, "2.5"],
      ["lineStyle", "dashDot", "dashDot"],
      ["cornerRadius", 6.5, "6.5"],
      ["fillEnabled", true, "true"],
      ["fillColor", "#12ABef", "#12abef"],
      ["fillOpacity", 0.35, "0.35"]
    ];
    for (const [property, value, stored] of changes) {
      expect(setLibraryShapeStyleProperty(rectangle, property, value).kind).toBe("changed");
      const key = {
        strokeWidth: "libraryShapeStrokeWidth",
        lineStyle: "libraryShapeLineStyle",
        cornerRadius: "libraryShapeCornerRadius",
        fillEnabled: "libraryShapeFillEnabled",
        fillColor: "libraryShapeFillColor",
        fillOpacity: "libraryShapeFillOpacity"
      }[property];
      expect(rectangle.values[key]).toBe(stored);
    }
    expect(componentValueIssue(rectangle)).toBeNull();

    for (const property of Object.keys(DEFAULT_LIBRARY_SHAPE_STYLE) as LibraryShapeStyleProperty[]) {
      expect(setLibraryShapeStyleProperty(
        rectangle,
        property,
        DEFAULT_LIBRARY_SHAPE_STYLE[property]
      ).kind).toBe("changed");
    }
    expect(Object.keys(rectangle.values).filter(key => key.startsWith("libraryShape"))).toEqual([]);
  });

  it("rejects invalid or unsupported values without changing the document", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 200, 200);
    const triangle = fixtureComponent("triangle", "X2", 300, 200);
    for (const [property, value] of [
      ["strokeWidth", 1.25],
      ["strokeWidth", 0],
      ["lineStyle", "unknown"],
      ["cornerRadius", -1],
      ["fillEnabled", "yes"],
      ["fillColor", "white"],
      ["fillOpacity", 1.5]
    ] as const) {
      expect(setLibraryShapeStyleProperty(rectangle, property, value)).toEqual({ kind: "noop", reason: "invalid" });
    }
    expect(setLibraryShapeStyleProperty(triangle, "cornerRadius", 4)).toEqual({ kind: "noop", reason: "unsupported" });
    expect(setLibraryShapeStyleProperty(fixtureComponent("resistor", "R1", 0, 0), "fillEnabled", true))
      .toEqual({ kind: "noop", reason: "unsupported" });

    rectangle.values[LIBRARY_SHAPE_STROKE_WIDTH_VALUE_KEY] = "1.25";
    expect(componentValueIssue(rectangle)?.key).toBe(LIBRARY_SHAPE_STROKE_WIDTH_VALUE_KEY);
    triangle.values.libraryShapeCornerRadius = "4";
    expect(componentValueIssue(triangle)?.key).toBe("libraryShapeCornerRadius");
  });

  it("preserves non-default styles through copy and document round trips", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 200, 200);
    setLibraryShapeStyleProperty(rectangle, "strokeWidth", 3.5);
    setLibraryShapeStyleProperty(rectangle, "lineStyle", "dotted");
    setLibraryShapeStyleProperty(rectangle, "cornerRadius", 8);
    setLibraryShapeStyleProperty(rectangle, "fillEnabled", true);
    setLibraryShapeStyleProperty(rectangle, "fillColor", "#fedcba");
    setLibraryShapeStyleProperty(rectangle, "fillOpacity", 0.4);
    const document = fixtureDocument({
      components: [rectangle],
      wires: [],
      netLabels: [],
      notes: [],
      junctionPoints: [],
      junctionKeys: new Set<string>(),
      junctionAppearances: []
    });
    const copied = instantiateCopyAt(
      { source: buildCopySource(document), anchor: { x: 200, y: 200 } },
      { x: 400, y: 300 },
      { preview: false, nextComponentRef: () => "X2", createId: () => "rectangle-copy" }
    ).components[0];
    expect(libraryShapeStyle(copied)).toEqual(libraryShapeStyle(rectangle));

    const restored = parseSchematicDocumentFile(serializeSchematicDocumentFile(document)).components[0];
    expect(libraryShapeStyle(restored)).toEqual(libraryShapeStyle(rectangle));
    expect(componentValueIssue(restored)).toBeNull();
  });

  it("renders identical JointJS and SVG styles and clamps rounded corners", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 200, 200);
    rectangle.values.libraryShapeStrokeWidth = "2.5";
    rectangle.values.libraryShapeLineStyle = "dashDot";
    rectangle.values.libraryShapeCornerRadius = "100";
    rectangle.values.libraryShapeFillEnabled = "true";
    rectangle.values.libraryShapeFillColor = "#123abc";
    rectangle.values.libraryShapeFillOpacity = "0.35";

    const cell = makeComponentCell(rectangle);
    expect(cell.attr("symbolBody/fill")).toBe("#123abc");
    expect(cell.attr("symbolBody/fillOpacity")).toBe(0.35);
    expect(cell.attr("symbolBody/strokeWidth")).toBe(2.5);
    expect(cell.attr("symbolBody/strokeDasharray")).toBe("12 5 2 5");
    expect(cell.attr("symbolBody/d")).toBe(rectangleFrameSymbol(80, 40, 0, 20));
    expect(cell.attr("symbolBody/d")).toContain(" Q ");

    const svg = renderComponentSvg(rectangle);
    expect(svg).toContain('fill="#123abc"');
    expect(svg).toContain('fill-opacity="0.35"');
    expect(svg).toContain('stroke-width="2.5"');
    expect(svg).toContain('stroke-dasharray="12 5 2 5"');

    const triangle = fixtureComponent("triangle", "X2", 400, 200);
    triangle.values.libraryShapeLineStyle = "dashed";
    triangle.values.libraryShapeFillEnabled = "true";
    expect(makeComponentCell(triangle).attr("symbolBody/strokeDasharray")).toBe("12 6");
    expect(renderComponentSvg(triangle)).toContain('fill="#ffffff"');
    expect(renderComponentSvg(triangle)).not.toContain("fill-opacity");
  });

  it("keeps the legacy default outline and serialization unchanged", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 200, 200);
    expect(makeComponentCell(rectangle).attr("symbolBody/d")).toBe("M 0 0 L 80 0 L 80 40 L 0 40 Z");
    expect(makeComponentCell(rectangle).attr("symbolBody/fill")).toBe("none");
    expect(makeComponentCell(rectangle).attr("symbolBody/strokeDasharray")).toBe("none");
    expect(renderComponentSvg(rectangle)).not.toContain("stroke-dasharray");
    expect(renderComponentSvg(rectangle)).not.toContain("fill-opacity");
  });
});
