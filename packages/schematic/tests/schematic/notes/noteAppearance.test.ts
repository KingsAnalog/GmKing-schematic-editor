// @vitest-environment jsdom
import { fixtureDocument } from "../support/fixtureDocument";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createSchematicNote, buildCopyPreviewNoteView } from "../../../src/schematic/notes/noteModel";
import { noteBackgroundColor, noteTextColor } from "../../../src/schematic/notes/noteAppearance";
import { createEmptySchematicDocument, contentFromDocument } from "../../../src/schematic/document/documentModel";
import { createSchematicContentHistoryAdapter } from "../../../src/schematic/document/contentHistoryAdapter";
import { parseSchematicContent, serializeSchematicContent } from "../../../src/schematic/schematicDocumentCodec";
import { executeSchematicPropertyBatchCommand } from "../../../src/schematic/propertyBatchCommands";
import { copySourceFromDocument } from "../../../src/schematic/copyModel";
import { renderSchematicDocumentSvg } from "../../../src/schematic/documentSvgRenderer";
import { buildSchematicSelectionSvg } from "../../../src/schematic/selection/selectionExport";
import { SchematicPropertyPanelController } from "../../../src/schematic/propertyPanelController";
import { renderSchematicEditorSidebarProjection } from "../../../src/schematic/schematicEditorUiProjection";
import { buildSchematicPropertyPanelInput } from "../../../src/schematic/propertyPanelProjection";
import { PAPER_COLOR_PRESETS, NOTE_BACKGROUND_COLOR_PRESETS } from "../../../src/shared/color";

afterEach(() => document.body.replaceChildren());

function fixture() {
  const doc = createEmptySchematicDocument();
  const note = createSchematicNote("note", { x: 0, y: 0 }, { text: "", fontSizePx: 14, anchor: "lowerLeft" });
  note.text = "Red text < &";
  doc.notes.push(note);
  const selection = { selectedIds: [], selectedNoteIds: [note.id] };
  return { doc, note, selection };
}

describe("plain Note appearance", () => {
  it("defaults plain notes to transparent and respects an explicit fill", () => {
    const { note } = fixture();
    expect(noteBackgroundColor(note)).toBeNull();
    note.backgroundColor = "#ff0000";
    expect(noteBackgroundColor(note)).toBe("#ff0000");
    expect(noteTextColor(note)).toBe("#111111");
  });

  it("preserves text color through history, file round-trip and copy", () => {
    const { doc, note, selection } = fixture();
    const history = createSchematicContentHistoryAdapter(contentFromDocument(doc));
    const result = executeSchematicPropertyBatchCommand(doc, selection, { kind: "note-text-color", color: " #FF0000 " });
    expect(result).toMatchObject({ changed: true, historyIntent: "push", targets: { noteIds: ["note"] } });
    history.push(contentFromDocument(doc));
    expect(history.undo()?.notes[0].textColor).toBeUndefined();
    expect(history.redo()?.notes[0].textColor).toBe("#ff0000");
    const restored = parseSchematicContent(serializeSchematicContent(contentFromDocument(doc)));
    expect(restored.notes[0].textColor).toBe("#ff0000");
    expect(copySourceFromDocument(doc).notes[0].textColor).toBe("#ff0000");
    expect(buildCopyPreviewNoteView(note, { screenPoint: { x: 0, y: 0 }, zoom: 1 }).style)
      .toMatchObject({ color: "#ff0000", backgroundColor: "transparent" });
  });

  it("rejects invalid colors without changing a selection and supports default black", () => {
    const { doc, note, selection } = fixture();
    expect(executeSchematicPropertyBatchCommand(doc, selection, { kind: "note-text-color", color: "red;bad" }).changed).toBe(false);
    expect(note.textColor).toBeUndefined();
    executeSchematicPropertyBatchCommand(doc, selection, { kind: "note-text-color", color: "#ff0000" });
    executeSchematicPropertyBatchCommand(doc, selection, { kind: "note-text-color", color: "#111111" });
    expect(note.textColor).toBeUndefined();
    note.textColor = "invalid";
    expect(() => serializeSchematicContent(contentFromDocument(doc))).toThrow();
  });

  it("renders the same transparent background and colored text in portable and rich SVG", () => {
    const { doc, note } = fixture();
    note.textColor = "#ff0000";
    const portable = renderSchematicDocumentSvg(doc, { namespace: "color", backgroundColor: null }).svg;
    const parsed = new DOMParser().parseFromString(portable, "image/svg+xml");
    expect(parsed.querySelector("[data-note-id] > rect")?.getAttribute("fill")).toBe("none");
    expect(parsed.querySelector("[data-note-id]")?.getAttribute("color")).toBe("#ff0000");
    const rich = buildSchematicSelectionSvg(fixtureDocument({ components: [], wires: [], junctionPoints: [], netLabels: [], notes: [note] }))!.svg;
    expect(rich).toContain('color="#ff0000"');
    expect(rich).toContain("Red text &lt; &amp;");
  });

  it("preserves fill color and opacity through a toggle and file round-trip, and exports only the background with opacity", () => {
    const { doc, note, selection } = fixture();
    const apply = (command: Parameters<typeof executeSchematicPropertyBatchCommand>[2]) =>
      executeSchematicPropertyBatchCommand(doc, selection, command);
    expect(apply({ kind: "note-fill-enabled", enabled: true }).changed).toBe(true);
    expect(apply({ kind: "note-background", color: "#ff0000" }).changed).toBe(true);
    expect(apply({ kind: "note-fill-opacity", value: "0.35" }).changed).toBe(true);
    expect(apply({ kind: "note-fill-enabled", enabled: false }).changed).toBe(true);
    expect(parseSchematicContent(serializeSchematicContent(contentFromDocument(doc))).notes[0])
      .toMatchObject({ backgroundEnabled: false, backgroundColor: "#ff0000", backgroundOpacity: 0.35 });
    expect(buildCopyPreviewNoteView(note, { screenPoint: { x: 0, y: 0 }, zoom: 1 }).style.backgroundColor).toBe("transparent");
    expect(apply({ kind: "note-fill-enabled", enabled: true }).changed).toBe(true);
    const svg = renderSchematicDocumentSvg(doc, { namespace: "fill", backgroundColor: null }).svg;
    const parsed = new DOMParser().parseFromString(svg, "image/svg+xml");
    const background = parsed.querySelector("[data-note-id] > rect");
    expect(background?.getAttribute("fill")).toBe("#ff0000");
    expect(background?.getAttribute("fill-opacity")).toBe("0.35");
    expect(background?.parentElement?.hasAttribute("opacity")).toBe(false);
  });

  it("exposes red in shared wire, fill and text palettes and dispatches the text-color control", () => {
    expect(PAPER_COLOR_PRESETS.some(preset => preset.color === "#ff0000")).toBe(true);
    expect(NOTE_BACKGROUND_COLOR_PRESETS.some(preset => preset.color === "#ff0000")).toBe(true);
    const root = document.createElement("div");
    root.innerHTML = renderSchematicEditorSidebarProjection();
    document.body.append(root);
    const change = vi.fn();
    const controller = new SchematicPropertyPanelController(root.querySelector("[data-schematic-property-editor]")!, { onNoteTextColorChange: change });
    const { doc, note } = fixture();
    controller.bind();
    controller.sync(buildSchematicPropertyPanelInput({ document: doc, hasSelection: true, targets: fixtureDocument({
      components: [], wires: [], junctionPoints: [], notes: [note], netLabels: []
    }) }));
    expect((root.querySelector("[data-property-note-text-color-row]") as HTMLElement).hidden).toBe(false);
    expect(root.querySelector("[data-note-background-swatch='default']")?.getAttribute("aria-pressed")).toBe("true");
    root.querySelector<HTMLButtonElement>("[data-note-text-color-swatch='#ff0000']")!.click();
    expect(change).toHaveBeenCalledWith("#ff0000");
    expect(root.querySelector("[data-network-color-swatch='#ff0000']")).not.toBeNull();
    expect(root.querySelector("[data-note-background-swatch='#ff0000']")).not.toBeNull();
    controller.destroy();
  });
});
