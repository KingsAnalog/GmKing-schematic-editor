import { describe, expect, it } from "vitest";
import { componentExportBounds } from "../../../src/schematic/componentExportBounds";
import { createSchematicDocument } from "../../../src/schematic/document/documentModel";
import { renderSchematicDocumentSvg } from "../../../src/schematic/documentSvgRenderer";
import { parseSchematicDocumentFile, serializeSchematicDocumentFile } from "../../../src/schematic/schematicDocumentCodec";
import { renderComponentSvg } from "../../../src/schematic/componentSvgRenderer";
import { defaultShapeValues, resolveShapeGeometry } from "../../../src/schematic/shapeModel";
import { renderShapeSvg } from "../../../src/schematic/shapeSvgRenderer";
import type { ComponentInstance } from "../../../src/schematic/types";

function shape(kind: "rectangle" | "triangle" | "ellipse" | "polyline" | "polygon" | "arc"): ComponentInstance {
  return {
    id: `shape-${kind}`,
    type: "annotation",
    ref: "S1",
    x: 100,
    y: 80,
    rotation: 0,
    mirrored: false,
    values: defaultShapeValues(kind, "layer-1", 1)
  };
}

describe("free shape rendering", () => {
  it("renders a rounded rectangle with a corner radius", () => {
    const instance = shape("rectangle");
    instance.values["shape:radius"] = "20";
    const geometry = resolveShapeGeometry(instance);
    expect(geometry.path).toContain("Q");
    expect(geometry.width).toBe(140);
    const svg = renderShapeSvg(instance);
    expect(svg).toContain('data-shape-kind="rectangle"');
    expect(svg).toContain(" Q ");
    expect(svg).toContain('fill="#e8f0fb"');
  });

  it("renders triangle, ellipse, polyline, polygon and arc paths", () => {
    expect(resolveShapeGeometry(shape("triangle")).path).toContain(" Z");
    expect(resolveShapeGeometry(shape("ellipse")).path).toContain(" A ");
    expect(resolveShapeGeometry(shape("polyline")).path).not.toContain(" Z");
    expect(resolveShapeGeometry(shape("polygon")).path).toContain(" Z");
    expect(resolveShapeGeometry(shape("arc")).path).toContain(" A ");
  });

  it("uses the shape renderer in component SVG and export bounds", () => {
    const instance = shape("rectangle");
    expect(renderComponentSvg(instance)).toContain('data-shape-id="shape-rectangle"');
    const bounds = componentExportBounds(instance);
    expect(bounds.width).toBe(140);
    expect(bounds.height).toBe(90);
  });

  it("renders shapes in the read-only document SVG", () => {
    const instance = shape("rectangle");
    const document = createSchematicDocument({
      components: [instance],
      layers: [{ id: "layer-1", name: "Layer 1", visible: true, locked: false }]
    });
    const render = renderSchematicDocumentSvg(document, { namespace: "shape-test" });
    expect(render.svg).toContain(`data-shape-id="${instance.id}"`);
    expect(render.svg).toContain('data-shape-kind="rectangle"');
  });

  it("omits shapes on hidden layers from the read-only SVG", () => {
    const instance = shape("rectangle");
    const document = createSchematicDocument({
      components: [instance],
      layers: [{ id: "layer-1", name: "Hidden", visible: false, locked: false }]
    });
    const render = renderSchematicDocumentSvg(document, { namespace: "hidden-layer" });
    expect(render.svg).not.toContain(`data-shape-id="${instance.id}"`);
  });

  it("round trips layer definitions and shape values", () => {
    const instance = shape("rectangle");
    const document = createSchematicDocument({
      components: [instance],
      layers: [
        { id: "layer-1", name: "Background", visible: true, locked: false },
        { id: "layer-2", name: "Annotations", visible: true, locked: true }
      ]
    });
    const parsed = parseSchematicDocumentFile(serializeSchematicDocumentFile(document));
    expect(parsed.layers).toEqual(document.layers);
    const parsedShape = parsed.components.find(component => component.id === instance.id);
    expect(parsedShape?.values["shape:kind"]).toBe("rectangle");
    expect(parsedShape?.values["shape:layerId"]).toBe("layer-1");
    expect(parsedShape?.values["shape:radius"]).toBe("12");
  });

  it("reflects geometry edits in the path", () => {
    const instance = shape("triangle");
    instance.values["shape:width"] = "220";
    const geometry = resolveShapeGeometry(instance);
    expect(geometry.width).toBe(220);
    expect(geometry.path).toContain("110");
  });
});
