import { describe, expect, it } from "vitest";
import { createEmptySchematicContent, createEmptySchematicDocument, contentFromDocument, assignRestoredSchematicDocument } from "../../../src/schematic/document/documentModel";
import { parseSchematicContent, serializeSchematicContent, SchematicDocumentFileError } from "../../../src/schematic/schematicDocumentCodec";
import { resolveSymbolTemplate, SYMBOL_TEMPLATES } from "../../../src/schematic/symbolTemplateModel";
import { renderSchematicEditorSidebarProjection } from "../../../src/schematic/schematicEditorUiProjection";
import { getSymbolTemplateRenderer } from "../../../src/schematic/symbolTemplateRenderers";

describe("symbol template content and availability", () => {
  it("defaults missing fields to razavi and writes it on the next save", () => {
    const oldFile = JSON.parse(serializeSchematicContent(createEmptySchematicContent()));
    delete oldFile.schematic.symbolTemplate;
    const content = parseSchematicContent(JSON.stringify(oldFile));
    expect(content.symbolTemplate).toBe("razavi");
    expect(JSON.parse(serializeSchematicContent(content)).schematic.symbolTemplate).toBe("razavi");
    const target = createEmptySchematicDocument();
    assignRestoredSchematicDocument(target, { ...target, symbolTemplate: undefined });
    expect(contentFromDocument(target).symbolTemplate).toBe("razavi");
  });

  it.each(["abidi", "unknown", "", null, 12])("rejects unavailable or invalid template %s without fallback", value => {
    const file = JSON.parse(serializeSchematicContent(createEmptySchematicContent()));
    file.schematic.symbolTemplate = value;
    expect(() => parseSchematicContent(JSON.stringify(file))).toThrow(SchematicDocumentFileError);
    expect(() => parseSchematicContent(JSON.stringify(file))).toThrow(/symbolTemplate/);
    expect(() => resolveSymbolTemplate(value)).toThrow();
  });

  it("registers Abidi as not ready in the shared UI and renderer entry", () => {
    expect(SYMBOL_TEMPLATES).toEqual([
      { id: "razavi", label: "razavi", available: true },
      { id: "abidi", label: "abidi", available: false }
    ]);
    expect(renderSchematicEditorSidebarProjection()).toMatch(/<option value="abidi" disabled[^>]*>abidi \(not ready\)<\/option>/);
    expect(() => getSymbolTemplateRenderer("abidi")).toThrow(/not ready/);
  });
});
