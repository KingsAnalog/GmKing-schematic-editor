// @vitest-environment jsdom
import "../support/testSymbolTemplate";
import { describe, expect, it } from "vitest";
import { fixtureComponent, fixtureWire } from "../support/fixtures";
import { fixtureDocument } from "../support/fixtureDocument";
import { resolveComponentVisualModel } from "../../../src/schematic/componentVisualModel";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { renderComponentSvg } from "../../../src/schematic/componentSvgRenderer";
import { renderSchematicDocumentSvg } from "../../../src/schematic/documentSvgRenderer";
import { paletteItemPreview } from "../../../src/schematic/instanceSelector";
import { buildSelectionExportInput } from "../../../src/schematic/selection/selectionCopyExportModel";
import { buildSchematicSelectionSvg } from "../../../src/schematic/selection/selectionExport";
import { mountReadonlySchematicViewer } from "../../../src/schematic/viewer";
import { applySchematicCellSelectionStyles } from "../../../src/schematic/viewStyling";
import { SchematicPreviewRenderer } from "../../../src/schematic/previewRenderer";
import { extractNetlist } from "../../../src/schematic/netlist";
import { parseSchematicContent, serializeSchematicContent } from "../../../src/schematic/schematicDocumentCodec";
import { contentFromDocument } from "../../../src/schematic/document/documentModel";
import { persistSchematicDocumentSnapshot, readSchematicDocumentSnapshot } from "../../../src/schematic/workspaceAdapter";

const testPath = "M 33 33 L 47 43 L 57 33";

describe("document-local template rendering", () => {
  it("uses one appearance for editor, palette, preview, SVG and readonly viewer", () => {
    const component = fixtureComponent("switch", "S1", 200, 200);
    const doc = fixtureDocument({ symbolTemplate: "abidi", components: [component], wires: [] });
    const context = { symbolTemplate: doc.symbolTemplate };
    const model = resolveComponentVisualModel(component, context);
    const cell = makeComponentCell(component, context);
    expect(cell.attr("symbolBody/d")).toBe(testPath);
    expect(cell.attr("switchBladeHit/d")).toBe(model.switchBladePath);
    expect(cell.attr("symbolBody/strokeWidth")).toBe(3);
    expect(renderComponentSvg(component, context)).toContain(testPath);
    expect(paletteItemPreview("switch", context)).toContain(testPath);
    expect(paletteItemPreview("common_source_nmos", context)).toContain(testPath);
    expect(makeComponentCell(component, { ...context, preview: true }).attr("symbolBody/d")).toBe(testPath);
    const previews: ReturnType<typeof makeComponentCell>[] = [];
    const previewRenderer = new SchematicPreviewRenderer<ReturnType<typeof makeComponentCell>>({
      graphAdapter: { addCell: cell => { previews.push(cell); }, addCells: cells => { previews.push(...cells); } },
      noteLayerElement: document.createElement("div"),
      makeComponentCell: instance => makeComponentCell(instance, context), makeWireCell: () => { throw new Error("No wires in this fixture"); },
      symbolTemplate: () => doc.symbolTemplate, presentationMode: () => false,
      worldToScreenPoint: point => point, zoom: () => 1
    });
    previewRenderer.renderPlacement(doc);
    expect(previews[0].attr("symbolBody/d")).toBe(testPath);
    previewRenderer.renderCopy(doc);
    expect(previews.at(-1)!.attr("symbolBody/d")).toBe(testPath);
    const exportInput = buildSelectionExportInput({ ...doc, junctionPoints: [], junctionKeys: new Set() }, false, {}, {}, doc.connections, doc.symbolTemplate);
    expect(buildSchematicSelectionSvg(exportInput)?.svg).toContain(testPath);
    expect(renderSchematicDocumentSvg(doc, { namespace: "test" }).svg).toContain(testPath);
    const container = document.createElement("div");
    const viewer = mountReadonlySchematicViewer(container, doc, { resizeObserver: null });
    expect(container.innerHTML).toContain(testPath);
    viewer.update({ ...doc, symbolTemplate: "razavi" });
    expect(container.innerHTML).not.toContain(testPath);
    viewer.destroy();
    applySchematicCellSelectionStyles({ cells: [cell], document: doc, selectedIds: new Set([component.id]), hoverIds: new Set(), presentationMode: true });
    expect(cell.attr("symbolBody/d")).toBe(testPath);
    expect(cell.attr("frame/stroke")).toBe("#005f9e");
  });

  it("isolates two documents and preserves geometry, connections and netlist through save/reload", () => {
    const component = fixtureComponent("resistor", "R1", 200, 200);
    const doc = fixtureDocument({ components: [component], wires: [fixtureWire("w1", [{ x: 240, y: 200 }, { x: 300, y: 200 }])] });
    const before = contentFromDocument(doc);
    const netlist = extractNetlist(doc);
    const first = resolveComponentVisualModel(component);
    doc.symbolTemplate = "abidi";
    const second = resolveComponentVisualModel(component, doc);
    expect(second.def).toEqual(first.def);
    expect(second.frameBox).toEqual(first.frameBox);
    expect(contentFromDocument(doc)).toEqual({ ...before, symbolTemplate: "abidi" });
    expect(extractNetlist(doc)).toEqual(netlist);
    expect(parseSchematicContent(serializeSchematicContent(contentFromDocument(doc)))).toEqual(contentFromDocument(doc));
    const stored = new Map<string, string>();
    const storage = { getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => { stored.set(key, value); },
      removeItem: (key: string) => { stored.delete(key); } };
    persistSchematicDocumentSnapshot("first", { document: doc }, storage);
    persistSchematicDocumentSnapshot("second", { document: { ...doc, symbolTemplate: "razavi" } }, storage);
    expect(readSchematicDocumentSnapshot("first", storage)?.document?.symbolTemplate).toBe("abidi");
    expect(readSchematicDocumentSnapshot("second", storage)?.document?.symbolTemplate).toBe("razavi");
    expect(resolveComponentVisualModel(component).path).toBe(first.path);
    expect(resolveComponentVisualModel(component, doc).path).toBe(testPath);
  });
});
