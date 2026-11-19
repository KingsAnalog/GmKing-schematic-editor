import { describe, expect, it } from "vitest";
import { resolveComponentDef } from "../../../src/schematic/catalog";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { renderComponentSvg } from "../../../src/schematic/componentSvgRenderer";
import { componentValueIssue } from "../../../src/schematic/componentValueSchema";
import { componentPinPoint } from "../../../src/schematic/netlist";
import { setComponentPinVisibility } from "../../../src/schematic/pinConfigurationModel";
import { executeSchematicPropertyBatchCommand } from "../../../src/schematic/propertyBatchCommands";
import { ShapeResizeSession } from "../../../src/schematic/shapeResizeSession";
import { parseSchematicDocumentFile, serializeSchematicDocumentFile } from "../../../src/schematic/schematicDocumentFile";
import { TRIANGLE_VERTICES, setTrianglePinCount, setTriangleVertex, trianglePinGeometry, triangleSettings, triangleVertexWorldPoint } from "../../../src/schematic/triangleComponentModel";
import { fixtureDocument } from "../support/fixtureDocument";
import { fixtureComponent, fixtureWire } from "../support/fixtures";

describe("triangle component", () => {
  it("supports an amp-like horizontal triangle with a vertex output and a side input", () => {
    const component = fixtureComponent("triangle", "X1", 200, 200, 90);
    setTrianglePinCount(component, "ab", 0);
    setTrianglePinCount(component, "ca", 0);
    setTrianglePinCount(component, "bc", 1);
    expect(setComponentPinVisibility(component, "a", true).kind).toBe("changed");
    expect(resolveComponentDef(component).pins.map(pin => pin.id)).toEqual(["bc-1", "a"]);
    expect(componentPinPoint(component, "bc-1")).toEqual({ x: 140, y: 200 });
    expect(componentPinPoint(component, "a")).toEqual({ x: 260, y: 200 });
    expect(makeComponentCell(component).attr("symbolPinMarks/d")).toBe("");
    const svg = renderComponentSvg(component);
    expect(svg).not.toContain('data-selector="symbolPinMarks"');
    const document = fixtureDocument({ components: [component] });
    expect(parseSchematicDocumentFile(serializeSchematicDocumentFile(document)).components).toEqual(document.components);
  });

  it.each([0, 90, 180, 270])("keeps vertex pins and attached wires on-grid while reshaping at %s degrees", rotation => {
    for (const mirrored of [false, true]) for (const vertex of TRIANGLE_VERTICES) {
      const component = fixtureComponent("triangle", "X1", 200, 200, rotation);
      component.mirrored = mirrored;
      setComponentPinVisibility(component, vertex, true);
      const pin = componentPinPoint(component, vertex);
      const document = fixtureDocument({ components: [component], wires: [fixtureWire("wire", [pin, { x: pin.x + 100, y: pin.y }])] });
      const session = new ShapeResizeSession(document);
      const point = triangleVertexWorldPoint(component, vertex);
      session.begin(component.id, vertex);
      expect(session.move({ x: point.x + 30, y: point.y - 20 }).changed).toBe(true);
      const moved = componentPinPoint(document.components[0], vertex);
      expect(moved.x % 10).toBe(0);
      expect(moved.y % 10).toBe(0);
      expect(document.wires[0].points[0]).toEqual(moved);
      expect(document.connections.pins[component.id][vertex]).toBe(document.connections.wires[document.wires[0].id][0]);
      expect(session.commit().changed).toBe(true);
      expect(componentValueIssue(document.components[0])).toBeNull();
    }
  });

  it("shares an editable triangle and leads across the editor and export", () => {
    const component = fixtureComponent("triangle", "X1", 200, 200);
    const cell = makeComponentCell(component, { selected: true, resizeHandles: true });
    expect(resolveComponentDef(component).pins.map(pin => pin.id)).toEqual(["ab-1", "ca-1"]);
    expect(cell.attr("symbolBody/d")).toBe("M 60 20 L 100 100 L 20 100 Z");
    expect(cell.attr("symbolBody/strokeWidth")).toBe(4);
    expect(cell.attr("symbolPinMarks/strokeWidth")).toBe(2);
    const svg = renderComponentSvg(component);
    expect(svg).toContain(`d="${cell.attr("symbolBody/d")}"`);
    expect(svg).not.toContain('data-selector="symbolPinMarks"');
    for (const vertex of ["A", "B", "C"]) {
      expect(cell.attr(`triangleResize${vertex}/opacity`)).toBe(1);
      expect(makeComponentCell(component, { resizeHandles: true, presentationMode: true }).attr(`triangleResize${vertex}/opacity`)).toBe(0);
    }
    expect(cell.attr("rectangleResizeNw/opacity")).toBe(0);
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
      expect(component.x % 10).toBe(0);
      expect(component.y % 10).toBe(0);
      expect(componentValueIssue(component)).toBeNull();
      for (const pin of resolveComponentDef(component).pins) {
        const point = componentPinPoint(component, pin.id);
        expect(point.x % 10).toBe(0);
        expect(point.y % 10).toBe(0);
      }
      const cell = makeComponentCell(component);
      expect(renderComponentSvg(component)).toContain(`d="${cell.attr("symbolBody/d")}"`);
    }
  });

  it("configures each edge independently and keeps saved pin IDs and geometry", () => {
    const component = fixtureComponent("triangle", "X1", 200, 200);
    setTrianglePinCount(component, "ab", 3);
    setTrianglePinCount(component, "bc", 2);
    setTrianglePinCount(component, "ca", 0);
    expect(triangleSettings(component).pins).toEqual({ ab: 3, bc: 2, ca: 0 });
    expect(resolveComponentDef(component).pins.map(pin => pin.id)).toEqual(["ab-1", "ab-2", "ab-3", "bc-1", "bc-2"]);
    for (const { contact, pin } of trianglePinGeometry(triangleSettings(component))) {
      const edge = pin.id.slice(0, 2);
      const settings = triangleSettings(component);
      const from = settings.vertices[edge[0] as "a" | "b" | "c"];
      const to = settings.vertices[edge[1] as "a" | "b" | "c"];
      expect((pin.x - contact.x) * (to.x - from.x) + (pin.y - contact.y) * (to.y - from.y)).toBeCloseTo(0);
    }
    setTriangleVertex(component, "a", { x: 160, y: 90 });
    const document = fixtureDocument({ components: [component] });
    expect(parseSchematicDocumentFile(serializeSchematicDocumentFile(document)).components).toEqual(document.components);
  });

  it("rejects collapsed shapes and overlapping pin endpoints without changing the document", () => {
    const component = fixtureComponent("triangle", "X1", 200, 200);
    const document = fixtureDocument({ components: [component] });
    const baseline = structuredClone(document);
    const selection = { selectedIds: [component.id], selectedNoteIds: [] };
    expect(executeSchematicPropertyBatchCommand(document, selection, { kind: "triangle-vertex", vertex: "a", point: { x: 200, y: 240 } }).kind).toBe("rejected");
    expect(executeSchematicPropertyBatchCommand(document, selection, { kind: "triangle-pins", edge: "bc", value: 100 }).kind).toBe("rejected");
    expect(document).toEqual(baseline);
    component.values["triangleVertex:a:y"] = "40";
    expect(componentValueIssue(component)).not.toBeNull();
  });

  it("keeps connected wires attached through repeated preview, commit and cancellation", () => {
    const component = fixtureComponent("triangle", "X1", 200, 200);
    const pin = componentPinPoint(component, "ab-1");
    const document = fixtureDocument({ components: [component], wires: [fixtureWire("wire", [pin, { x: 400, y: pin.y }])] });
    const baseline = structuredClone(document);
    const session = new ShapeResizeSession(document);
    expect(session.begin(component.id, "a")).toBe(true);
    for (const point of [{ x: 250, y: 100 }, { x: 150, y: 90 }, { x: 210, y: 70 }]) {
      expect(session.move(point).changed).toBe(true);
      expect(document.wires[0].points[0]).toEqual(componentPinPoint(document.components[0], "ab-1"));
      expect(document.connections.pins[component.id]["ab-1"]).toBe(document.connections.wires[document.wires[0].id][0]);
    }
    expect(session.commit()).toMatchObject({ changed: true, status: "Triangle reshaped." });
    const committed = structuredClone(document);
    session.begin(component.id, "b");
    session.move({ x: 300, y: 300 });
    expect(document).not.toEqual(committed);
    expect(session.cancel()).toBe(true);
    expect(document).toEqual(committed);
    expect(document).not.toEqual(baseline);
  });

  it("returns to the original geometry without retaining intermediate wire bends", () => {
    const component = fixtureComponent("triangle", "X1", 200, 200);
    const pin = componentPinPoint(component, "ab-1");
    const document = fixtureDocument({ components: [component], wires: [fixtureWire("wire", [pin, { x: 400, y: pin.y }])] });
    const baseline = structuredClone(document);
    const session = new ShapeResizeSession(document);
    session.begin(component.id, "a");
    session.move({ x: 100, y: 80 });
    session.move({ x: 200, y: 160 });
    expect(document).toEqual(baseline);
    expect(session.commit().changed).toBe(false);
  });

  it("removes disabled edge pins from the connection graph while retaining wires", () => {
    const component = fixtureComponent("triangle", "X1", 200, 200);
    const pin = componentPinPoint(component, "ca-1");
    const document = fixtureDocument({ components: [component], wires: [fixtureWire("wire", [{ x: 80, y: pin.y }, pin])] });
    const result = executeSchematicPropertyBatchCommand(document, { selectedIds: [component.id], selectedNoteIds: [] }, { kind: "triangle-pins", edge: "ca", value: 0 });
    expect(result.kind).toBe("changed");
    expect(document.connections.pins[component.id]["ca-1"]).toBeUndefined();
    expect(document.wires[0].points.at(-1)).toEqual(pin);
    expect(() => serializeSchematicDocumentFile(document)).not.toThrow();
  });
});
