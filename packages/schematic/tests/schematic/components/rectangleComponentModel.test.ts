import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { resolveComponentAnalysisModel } from "../../../src/schematic/analysis/componentAnalysisRegistry";
import { resolveComponentDef } from "../../../src/schematic/catalog";
import { analyzeSchematic } from "../../../src/schematic/analysis/analysis";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { buildCopySource, instantiateCopyAt } from "../../../src/schematic/copyModel";
import { libraryShapeVertices, snapLibraryShapeCenterToVertices } from "../../../src/schematic/libraryShapeGeometry";
import {
  RECTANGLE_HEIGHT_VALUE_KEY,
  RECTANGLE_WIDTH_VALUE_KEY,
  rectangleSettings,
  setRectangleProperty
} from "../../../src/schematic/rectangleComponentModel";
import { SYMBOL_STROKE_WIDTH } from "../../../src/schematic/symbols/symbolPrimitives";
import {
  parseSchematicDocumentFile,
  serializeSchematicDocumentFile
} from "../../../src/schematic/schematicDocumentFile";
import { fixtureComponent } from "../support/fixtures";
import { emptyDoc } from "../support/fixtures";

function expectTextAndPortFree(cell: ReturnType<typeof makeComponentCell>) {
  expect(cell.markup).not.toContain('"text"');
  expect(cell.prop("ports/items")).toEqual([]);
}

describe("rectangle pure library shape", () => {
  it("defines only the visible 4-by-2 outline with no pins or text nodes", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 200, 200);
    const def = resolveComponentDef(rectangle);

    expect(rectangleSettings(rectangle)).toEqual({ widthGrid: 4, heightGrid: 2 });
    expect(def).toMatchObject({
      terminalClass: "dynamic",
      size: { width: 80, height: 40 },
      symbol: "rectangle",
      pins: []
    });
    expect(def.centeredRefLabel).toBeUndefined();
    expect(resolveComponentAnalysisModel(rectangle)).toBe("blackBox");

    const cell = makeComponentCell(rectangle, { selected: true, resizeHandles: true });
    expect(cell.get("type")).toBe("eda.LibraryShape");
    expect(cell.attr("symbolBody/d")).toBe("M 0 0 L 80 0 L 80 40 L 0 40 Z");
    expect(cell.attr("symbolBody/strokeWidth")).toBe(2 * SYMBOL_STROKE_WIDTH);
    expect(cell.attr("rectangleResizeNw/opacity")).toBe(1);
    expectTextAndPortFree(cell);
  });

  it("places draggable handles at all four edge midpoints", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 200, 200);
    const cell = makeComponentCell(rectangle, { selected: true, resizeHandles: true });
    const expected = {
      N: { x: 36, y: -4, cursor: "ns-resize" },
      E: { x: 76, y: 16, cursor: "ew-resize" },
      S: { x: 36, y: 36, cursor: "ns-resize" },
      W: { x: -4, y: 16, cursor: "ew-resize" }
    };
    for (const [edge, expectedAttrs] of Object.entries(expected)) {
      const selector = `rectangleResize${edge}`;
      expect(cell.attr(`${selector}/x`)).toBe(expectedAttrs.x);
      expect(cell.attr(`${selector}/y`)).toBe(expectedAttrs.y);
      expect(cell.attr(`${selector}/cursor`)).toBe(expectedAttrs.cursor);
      expect(cell.attr(`${selector}/opacity`)).toBe(1);
      expect(cell.attr(`${selector}/pointerEvents`)).toBe("all");
      expect(cell.attr(`${selector}/data-rectangle-resize-handle`)).toBe(edge.toLowerCase());
      expect(makeComponentCell(rectangle, { resizeHandles: true, presentationMode: true }).attr(`${selector}/opacity`)).toBe(0);
    }
    expectTextAndPortFree(cell);
  });

  it("keeps 10 px dimensions through rendering and file round trips", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 215, 260);
    rectangle.values[RECTANGLE_WIDTH_VALUE_KEY] = "1.5";
    rectangle.values[RECTANGLE_HEIGHT_VALUE_KEY] = "2";

    expect(rectangleSettings(rectangle)).toEqual({ widthGrid: 1.5, heightGrid: 2 });
    expect(resolveComponentDef(rectangle).size).toEqual({ width: 30, height: 40 });
    const cell = makeComponentCell(rectangle);
    expect(cell.attr("symbolBody/d")).toBe("M 0 0 L 30 0 L 30 40 L 0 40 Z");
    expectTextAndPortFree(cell);

    const parsed = parseSchematicDocumentFile(
      serializeSchematicDocumentFile(fixtureDocument({ components: [rectangle] }))
    );
    expect(rectangleSettings(parsed.components[0])).toEqual({ widthGrid: 1.5, heightGrid: 2 });
    expect(resolveComponentDef(parsed.components[0]).pins).toEqual([]);
  });

  it("accepts half-unit dimensions and rejects unsupported legacy pin edits", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 200, 200);
    expect(setRectangleProperty(rectangle, "width", 1.5).kind).toBe("changed");
    expect(setRectangleProperty(rectangle, "height", 0.5).kind).toBe("changed");
    expect(rectangleSettings(rectangle)).toEqual({ widthGrid: 1.5, heightGrid: 0.5 });
    expect(setRectangleProperty(rectangle, "width", 1.25)).toEqual({ kind: "noop", reason: "invalid" });
    expect(setRectangleProperty(rectangle, "leftPins", 2)).toEqual({ kind: "noop", reason: "unsupported" });
    expect(resolveComponentDef(rectangle).pins).toEqual([]);
  });

  it("uses four transformed outline vertices for every rotation and mirror", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 215, 260);
    rectangle.values[RECTANGLE_WIDTH_VALUE_KEY] = "1.5";
    rectangle.values[RECTANGLE_HEIGHT_VALUE_KEY] = "2";
    expect(libraryShapeVertices(rectangle)).toEqual([
      { x: 200, y: 240 }, { x: 230, y: 240 }, { x: 230, y: 280 }, { x: 200, y: 280 }
    ]);
    for (const rotation of [0, 90, 180, 270]) {
      for (const mirrored of [false, true]) {
        const center = snapLibraryShapeCenterToVertices(
          { ...rectangle, rotation, mirrored },
          { x: 215, y: 260 }
        );
        Object.assign(rectangle, { rotation, mirrored, ...center });
        const vertices = libraryShapeVertices(rectangle);
        expect(vertices).toHaveLength(4);
        for (const vertex of vertices) {
          expect(vertex.x % 10).toBe(0);
          expect(vertex.y % 10).toBe(0);
        }
      }
    }
  });

  it("removes legacy pin and hidden-label values when loading old documents", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 200, 200);
    Object.assign(rectangle.values, {
      labelVisible: "true",
      "rectanglePinCount:left": "2",
      "rectanglePinCount:right": "2",
      "pinVisible:left-1": "true"
    });
    const parsed = parseSchematicDocumentFile(
      serializeSchematicDocumentFile(fixtureDocument({ components: [rectangle] }))
    ).components[0];
    expect(parsed.values["rectanglePinCount:left"]).toBeUndefined();
    expect(parsed.values["pinVisible:left-1"]).toBeUndefined();
    expect(parsed.values.labelVisible).toBeUndefined();
    expect(resolveComponentDef(parsed).pins).toEqual([]);
  });

  it("blocks symbolic analysis with a missing black-box model diagnostic", () => {
    const rectangle = fixtureComponent("rectangle", "XBOX", 200, 200);
    const result = analyzeSchematic(
      { ...emptyDoc(), components: [rectangle] },
      { inputP: "", inputN: "", outputP: "", outputN: "" }
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContain(
      "XBOX is a black box without a symbolic analysis model."
    );
  });

  it("preserves rectangle dimensions through copy placement and file round trips", () => {
    const rectangle = fixtureComponent("rectangle", "XBOX", 200, 200);
    setRectangleProperty(rectangle, "width", 10);
    setRectangleProperty(rectangle, "height", 3.5);
    const source = buildCopySource(fixtureDocument({
      components: [rectangle],
      wires: [],
      netLabels: [],
      notes: [],
      junctionPoints: [],
      junctionKeys: new Set(),
      junctionAppearances: []
    }));
    const copied = instantiateCopyAt(
      { source, anchor: { x: 200, y: 200 } },
      { x: 400, y: 300 },
      {
        preview: false,
        nextComponentRef: () => "X2",
        createId: () => "rectangle-copy"
      }
    ).components[0];

    expect(copied.ref).toBe("XBOX");
    expect(rectangleSettings(copied)).toEqual(rectangleSettings(rectangle));
    const parsed = parseSchematicDocumentFile(
      serializeSchematicDocumentFile(fixtureDocument({ components: [copied] }))
    );
    expect(rectangleSettings(parsed.components[0])).toEqual(rectangleSettings(rectangle));
    expect(resolveComponentDef(parsed.components[0]).pins).toEqual([]);
  });
});
