import { describe, expect, it } from "vitest";
import { resolveComponentDef } from "../../../src/schematic/catalog";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { renderComponentSvg } from "../../../src/schematic/componentSvgRenderer";
import { componentValueIssue } from "../../../src/schematic/componentValueSchema";
import { libraryShapeVertices } from "../../../src/schematic/libraryShapeGeometry";
import { executeSchematicPropertyBatchCommand } from "../../../src/schematic/propertyBatchCommands";
import { ShapeResizeSession } from "../../../src/schematic/shapeResizeSession";
import { parseSchematicDocumentFile, serializeSchematicDocumentFile } from "../../../src/schematic/schematicDocumentFile";
import { TRIANGLE_VERTICES, setTrianglePinCount, setTriangleVertex, triangleVertexWorldPoint } from "../../../src/schematic/triangleComponentModel";
import { fixtureDocument } from "../support/fixtureDocument";
import { fixtureComponent } from "../support/fixtures";

function expectTextAndPortFree(cell: ReturnType<typeof makeComponentCell>) {
  expect(cell.markup).not.toContain('"text"');
  expect(cell.prop("ports/items")).toEqual([]);
}

describe("triangle pure library shape", () => {
  it("defines only three outline vertices with no pins or text nodes", () => {
    const component = fixtureComponent("triangle", "X1", 200, 200);
    const definition = resolveComponentDef(component);
    expect(definition.pins).toEqual([]);
    expect(definition.centeredRefLabel).toBeUndefined();
    expect(definition.editablePinVisibility).toBeUndefined();
    expect(Object.keys(component.values).some(key => key.includes("Pin") || key.startsWith("pinVisible:"))).toBe(false);

    const cell = makeComponentCell(component, { selected: true, resizeHandles: true });
    expect(cell.get("type")).toBe("eda.LibraryShape");
    expect(cell.attr("symbolBody/d")).toBe("M 40 0 L 80 80 L 0 80 Z");
    expect(cell.attr("symbolBody/strokeWidth")).toBe(4);
    expectTextAndPortFree(cell);
    const svg = renderComponentSvg(component);
    expect(svg).toContain(`d="${cell.attr("symbolBody/d")}"`);
    expect(svg).not.toContain("<text");
    expect(svg).not.toContain("data-pin-id");
    for (const vertex of ["A", "B", "C"]) {
      expect(cell.attr(`triangleResize${vertex}/opacity`)).toBe(1);
      expect(makeComponentCell(component, { resizeHandles: true, presentationMode: true }).attr(`triangleResize${vertex}/opacity`)).toBe(0);
    }
    expect(svg).not.toContain("Drag vertex");
  });

  it.each([0, 90, 180, 270])("moves exactly one vertex on-grid at %s degrees, including mirrors", rotation => {
    for (const mirrored of [false, true]) for (const vertex of TRIANGLE_VERTICES) {
      const component = fixtureComponent("triangle", "X1", 200, 200, rotation);
      component.mirrored = mirrored;
      const before = Object.fromEntries(TRIANGLE_VERTICES.map(id => [id, triangleVertexWorldPoint(component, id)]));
      const target = { x: before[vertex].x + 33, y: before[vertex].y - 17 };
      expect(setTriangleVertex(component, vertex, target).kind).toBe("changed");
      for (const id of TRIANGLE_VERTICES) {
        const actual = triangleVertexWorldPoint(component, id);
        const expected = id === vertex ? { x: before[id].x + 30, y: before[id].y - 20 } : before[id];
        expect(actual.x).toBeCloseTo(expected.x);
        expect(actual.y).toBeCloseTo(expected.y);
      }
      expect(component.x % 5).toBe(0);
      expect(component.y % 5).toBe(0);
      expect(componentValueIssue(component)).toBeNull();
      expect(resolveComponentDef(component).pins).toEqual([]);
      const cell = makeComponentCell(component);
      expect(renderComponentSvg(component)).toContain(`d="${cell.attr("symbolBody/d")}"`);
      expectTextAndPortFree(cell);
    }
  });

  it("keeps odd-span outlines and frames aligned through repeated half-grid recentering", () => {
    const component = fixtureComponent("triangle", "X1", 200, 200);
    expect(setTriangleVertex(component, "a", { x: 240, y: 170 }).kind).toBe("changed");
    expect(component).toMatchObject({ x: 200, y: 205 });
    expect(TRIANGLE_VERTICES.map(vertex => triangleVertexWorldPoint(component, vertex))).toEqual([
      { x: 240, y: 170 },
      { x: 240, y: 240 },
      { x: 160, y: 240 }
    ]);
    expect(resolveComponentDef(component).size).toEqual({ width: 80, height: 70 });
    expect(makeComponentCell(component).attr("symbolBody/d")).toBe("M 80 0 L 80 70 L 0 70 Z");
    expect(makeComponentCell(component).attr("frame/height")).toBe(70);
    expect(componentValueIssue(component)).toBeNull();

    expect(setTriangleVertex(component, "a", { x: 240, y: 180 }).kind).toBe("changed");
    expect(component).toMatchObject({ x: 200, y: 210 });
    expect(resolveComponentDef(component).size).toEqual({ width: 80, height: 60 });
    expect(makeComponentCell(component).attr("symbolBody/d")).toBe("M 80 0 L 80 60 L 0 60 Z");
    expect(makeComponentCell(component).attr("frame/height")).toBe(60);
    expect(componentValueIssue(component)).toBeNull();
  });

  it("rejects collapsed shapes and legacy pin edits without changing geometry", () => {
    const component = fixtureComponent("triangle", "X1", 200, 200);
    const document = fixtureDocument({ components: [component] });
    const baseline = structuredClone(document);
    const selection = { selectedIds: [component.id], selectedNoteIds: [] };
    expect(executeSchematicPropertyBatchCommand(document, selection, { kind: "triangle-vertex", vertex: "a", point: { x: 200, y: 240 } }).kind).toBe("rejected");
    expect(setTrianglePinCount(component, "bc", 2)).toEqual({ kind: "noop", reason: "unsupported" });
    expect(document).toEqual(baseline);
    component.values["triangleVertex:a:y"] = "40";
    expect(componentValueIssue(component)).not.toBeNull();
  });

  it("supports repeated preview, commit and cancellation without electrical connections", () => {
    const component = fixtureComponent("triangle", "X1", 200, 200);
    const document = fixtureDocument({ components: [component] });
    const session = new ShapeResizeSession(document);
    expect(session.begin(component.id, "a")).toBe(true);
    for (const point of [{ x: 250, y: 100 }, { x: 150, y: 90 }, { x: 210, y: 70 }]) {
      expect(session.move(point).changed).toBe(true);
      expect(resolveComponentDef(document.components[0]).pins).toEqual([]);
    }
    expect(session.commit()).toMatchObject({ changed: true, status: "Triangle reshaped." });
    const committed = structuredClone(document);
    session.begin(component.id, "b");
    session.move({ x: 300, y: 300 });
    expect(document).not.toEqual(committed);
    expect(session.cancel()).toBe(true);
    expect(document).toEqual(committed);
  });

  it("returns to the original geometry without retaining intermediate state", () => {
    const component = fixtureComponent("triangle", "X1", 200, 200);
    const document = fixtureDocument({ components: [component] });
    const baseline = structuredClone(document);
    const session = new ShapeResizeSession(document);
    session.begin(component.id, "a");
    session.move({ x: 100, y: 80 });
    session.move({ x: 200, y: 160 });
    expect(document).toEqual(baseline);
    expect(session.commit().changed).toBe(false);
  });

  it("snaps the three outline vertices rather than the stored center", () => {
    const component = fixtureComponent("triangle", "X1", 210, 260);
    for (const vertex of libraryShapeVertices(component)) {
      expect(vertex.x % 10).toBe(0);
      expect(vertex.y % 10).toBe(0);
    }
    expect(libraryShapeVertices(component)).toHaveLength(3);
    expect(resolveComponentDef(component).pins).toEqual([]);
  });

  it("removes legacy pin and hidden-label values during file round trips", () => {
    const component = fixtureComponent("triangle", "X1", 200, 200);
    Object.assign(component.values, {
      labelVisible: "true",
      "trianglePinCount:ab": "3",
      "pinVisible:a": "true",
      "pinMode:a": "output"
    });
    const parsed = parseSchematicDocumentFile(
      serializeSchematicDocumentFile(fixtureDocument({ components: [component] }))
    ).components[0];
    expect(parsed.values["trianglePinCount:ab"]).toBeUndefined();
    expect(parsed.values["pinVisible:a"]).toBeUndefined();
    expect(parsed.values["pinMode:a"]).toBeUndefined();
    expect(parsed.values.labelVisible).toBeUndefined();
    expect(resolveComponentDef(parsed).pins).toEqual([]);
    expectTextAndPortFree(makeComponentCell(parsed));
  });
});
