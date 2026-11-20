import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import { resolveComponentAnalysisModel } from "../../../src/schematic/analysis/componentAnalysisRegistry";
import { resolveComponentDef } from "../../../src/schematic/catalog";
import { analyzeSchematic } from "../../../src/schematic/analysis/analysis";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { buildCopySource, instantiateCopyAt } from "../../../src/schematic/copyModel";
import { componentPinPoint } from "../../../src/schematic/netlist";
import {
  RECTANGLE_HEIGHT_VALUE_KEY,
  RECTANGLE_MAX_PIN_COUNT,
  RECTANGLE_WIDTH_VALUE_KEY,
  rectanglePins,
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

describe("rectangle component model", () => {
  it("resolves the default 4-by-2 body with one-grid leads and stable side order", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 200, 200);
    const def = resolveComponentDef(rectangle);

    expect(rectangleSettings(rectangle)).toEqual({
      widthGrid: 4,
      heightGrid: 2,
      leftPins: 1,
      rightPins: 1,
      topPins: 0,
      bottomPins: 0
    });
    expect(def).toMatchObject({
      terminalClass: "dynamic",
      centeredRefLabel: true,
      size: { width: 120, height: 80 },
      symbol: "rectangle"
    });
    expect(resolveComponentAnalysisModel(rectangle)).toBe("blackBox");
    expect(def.pins.map(({ id, role, x, y }) => ({ id, role, x, y }))).toEqual([
      { id: "left-1", role: "io", x: -60, y: 0 },
      { id: "right-1", role: "io", x: 60, y: 0 }
    ]);

    const cell = makeComponentCell(rectangle, { selected: true, resizeHandles: true });
    expect(cell.attr("symbolBody/d")).toBe("M 20 20 L 100 20 L 100 60 L 20 60 Z");
    expect(cell.attr("symbolBody/strokeWidth")).toBe(2 * SYMBOL_STROKE_WIDTH);
    expect(cell.attr("symbolPinMarks/d")).toBe("");
    expect(cell.attr("symbolPinMarks/strokeWidth")).toBe(SYMBOL_STROKE_WIDTH);
    expect(cell.attr("rectangleResizeNw/opacity")).toBe(1);
  });

  it("keeps 10 px increments for pin-free library rectangles through rendering and file round trips", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 200, 200);
    for (const property of ["leftPins", "rightPins", "topPins", "bottomPins"] as const) {
      setRectangleProperty(rectangle, property, 0);
    }
    rectangle.values[RECTANGLE_WIDTH_VALUE_KEY] = "1.5";
    rectangle.values[RECTANGLE_HEIGHT_VALUE_KEY] = "2";

    expect(rectangleSettings(rectangle)).toMatchObject({ widthGrid: 1.5, heightGrid: 2 });
    expect(resolveComponentDef(rectangle).size).toEqual({ width: 70, height: 80 });
    expect(makeComponentCell(rectangle).attr("symbolBody/d")).toBe("M 20 20 L 50 20 L 50 60 L 20 60 Z");

    const parsed = parseSchematicDocumentFile(
      serializeSchematicDocumentFile(fixtureDocument({ components: [rectangle] }))
    );
    expect(rectangleSettings(parsed.components[0])).toMatchObject({ widthGrid: 1.5, heightGrid: 2 });
  });

  it("distributes pins over integer slots, excludes corners, and keeps side ordering", () => {
    const pins = rectanglePins({
      widthGrid: 6,
      heightGrid: 6,
      leftPins: 4,
      rightPins: 2,
      topPins: 3,
      bottomPins: 1
    });

    expect(pins.map((pin) => pin.id)).toEqual([
      "left-1", "left-2", "left-3", "left-4",
      "right-1", "right-2",
      "top-1", "top-2", "top-3",
      "bottom-1"
    ]);
    expect(pins.filter((pin) => pin.id.startsWith("left-")).map((pin) => pin.y))
      .toEqual([-40, -10, 10, 40]);
    expect(pins.filter((pin) => pin.id.startsWith("top-")).map((pin) => pin.x))
      .toEqual([-40, 0, 40]);
  });

  it("expands capacity without shrinking and accepts the 1024-pin safety limit", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 0, 0);
    expect(setRectangleProperty(rectangle, "topPins", 5).kind).toBe("changed");
    expect(rectangleSettings(rectangle).widthGrid).toBe(6);
    expect(setRectangleProperty(rectangle, "topPins", 1).kind).toBe("changed");
    expect(rectangleSettings(rectangle).widthGrid).toBe(6);
    expect(setRectangleProperty(rectangle, "leftPins", RECTANGLE_MAX_PIN_COUNT).kind)
      .toBe("changed");
    expect(rectangleSettings(rectangle).heightGrid).toBe(1025);
    expect(resolveComponentDef(rectangle).pins.filter((pin) => pin.id.startsWith("left-")))
      .toHaveLength(RECTANGLE_MAX_PIN_COUNT);
    expect(setRectangleProperty(rectangle, "rightPins", RECTANGLE_MAX_PIN_COUNT + 1))
      .toEqual({ kind: "noop", reason: "invalid" });
  });

  it("accepts odd dimensions and centers pin pairs on the 10 px grid", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 210, 230);
    setRectangleProperty(rectangle, "width", 7);
    setRectangleProperty(rectangle, "height", 3);
    setRectangleProperty(rectangle, "leftPins", 2);
    setRectangleProperty(rectangle, "topPins", 5);
    expect(rectangleSettings(rectangle)).toMatchObject({ widthGrid: 7, heightGrid: 3 });
    const pins = resolveComponentDef(rectangle).pins;
    expect(pins.filter(pin => pin.id.startsWith("left-")).map(pin => pin.y)).toEqual([-10, 10]);
    expect(pins.filter(pin => pin.id.startsWith("top-")).map(pin => pin.x)).toEqual([-50, -30, 0, 30, 50]);
    for (const rotation of [0, 90, 180, 270]) {
      for (const mirrored of [false, true]) {
        Object.assign(rectangle, { rotation, mirrored });
        for (const pin of pins) {
          const point = componentPinPoint(rectangle, pin.id);
          expect(Math.abs(point.x % 10)).toBe(0);
          expect(Math.abs(point.y % 10)).toBe(0);
        }
      }
    }
  });

  it("only grows the body to three units when adding a second side pin", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 200, 200);
    setRectangleProperty(rectangle, "leftPins", 2);
    expect(rectangleSettings(rectangle).heightGrid).toBe(3);
    expect(resolveComponentDef(rectangle).pins.filter(pin => pin.id.startsWith("left-")).map(pin => pin.y))
      .toEqual([-10, 10]);
  });

  it("keeps pin IDs while rotation and mirroring transform their world positions", () => {
    const rectangle = fixtureComponent("rectangle", "X1", 200, 200, 90);
    rectangle.mirrored = true;
    const def = resolveComponentDef(rectangle);

    expect(componentPinPoint(rectangle, def.pins.find((pin) => pin.id === "left-1")!.id))
      .toEqual({ x: 200, y: 260 });
    expect(componentPinPoint(rectangle, def.pins.find((pin) => pin.id === "right-1")!.id))
      .toEqual({ x: 200, y: 140 });
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

  it("preserves rectangle settings through copy placement and file round trips", () => {
    const rectangle = fixtureComponent("rectangle", "XBOX", 200, 200);
    setRectangleProperty(rectangle, "width", 10);
    setRectangleProperty(rectangle, "topPins", 5);
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
  });
});
