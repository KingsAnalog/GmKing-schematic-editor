// @vitest-environment jsdom
import "../support/testSymbolTemplate";
import { describe, expect, it, vi } from "vitest";
import { SchematicEditor } from "../../../src/schematic/editor";
import { createSchematicContentHistoryAdapter } from "../../../src/schematic/document/contentHistoryAdapter";
import { contentFromDocument } from "../../../src/schematic/document/documentModel";
import { SchematicSelectionSessionCoordinator } from "../../../src/schematic/selection/selectionSessionCoordinator";
import { SchematicTransientToolSessionCoordinator } from "../../../src/schematic/transientToolSessionCoordinator";
import { makeComponentCell } from "../../../src/schematic/componentRenderer";
import { renderSchematicEditorSidebarProjection } from "../../../src/schematic/schematicEditorUiProjection";
import { copySourceFromDocument, instantiateCopyAt, applyCopyPlacementToDocument } from "../../../src/schematic/copyModel";
import type { ComponentInstance, SchematicContent, SchematicDocument } from "../../../src/schematic/types";
import type { SchematicEditorCommand } from "../../../src/schematic/editorHandle";
import { fixtureDocument } from "../support/fixtureDocument";
import { fixtureComponent, fixtureWire } from "../support/fixtures";

function runtime() {
  const schematic = fixtureDocument({
    components: [fixtureComponent("resistor", "R1", 200, 200), fixtureComponent("switch", "S1", 400, 200)],
    wires: [fixtureWire("wire", [{ x: 240, y: 200 }, { x: 360, y: 200 }])]
  });
  const history = createSchematicContentHistoryAdapter(contentFromDocument(schematic));
  const selection = new SchematicSelectionSessionCoordinator(schematic);
  selection.setMixed(["R1", "wire"], []);
  const paletteEl = document.createElement("div");
  paletteEl.innerHTML = renderSchematicEditorSidebarProjection();
  const cells = new Map(schematic.components.map(component => [component.id, makeComponentCell(component)]));
  const transientHooks = {
    clearWireSegmentMove: vi.fn(), resetWireTool: vi.fn(), clearActiveNetPick: vi.fn(), clearDeleteHover: vi.fn(),
    clearPlacementPreview: vi.fn(), clearWirePreview: vi.fn(), clearCopyPreview: vi.fn(), clearCopyState: vi.fn(),
    clearLabelDocumentInteraction: vi.fn(), clearLabelState: vi.fn(), clearSelectionBox: vi.fn(),
    clearNotePointerInteractions: vi.fn(), clearCellGeometryInteraction: vi.fn(), updatePlacementPreview: vi.fn(),
    updateWirePreview: vi.fn(), updateCopyPreview: vi.fn(), updateLabelPreview: vi.fn()
  };
  const editor = Object.assign(Object.create(SchematicEditor.prototype), {
    document: schematic, options: { paletteEl }, destroyed: false,
    selectionSession: selection, presentationMode: false,
    hostFinishActiveEdits: vi.fn(), setStatus: vi.fn(), rebuildCounters: vi.fn(), emitStateChange: vi.fn(), recordExternalChange: vi.fn(),
    syncSelectionStyles: vi.fn(), renderPalette: vi.fn(), syncToolUi: vi.fn(),
    lifecycleController: new AbortController(),
    instanceSelector: { bind: vi.fn() }, propertyPanelController: { bind: vi.fn() }, toolbarController: null,
    transientToolSession: new SchematicTransientToolSessionCoordinator(transientHooks),
    hostBridge: { undo: () => history.undo(), redo: () => history.redo() },
    commitCurrentContent: vi.fn(() => history.push(contentFromDocument(schematic))),
    incrementalRenderer: { replaceComponent: vi.fn((component: ComponentInstance) => {
      cells.set(component.id, makeComponentCell(component, { symbolTemplate: schematic.symbolTemplate }));
    }) },
    renderDocument: vi.fn(() => schematic.components.forEach(component => cells.set(component.id, makeComponentCell(component, { symbolTemplate: schematic.symbolTemplate })))),
    setMixedSelection: (ids: string[], notes: string[]) => selection.setMixed(ids, notes)
  }) as {
    document: SchematicDocument; zoom: number; viewTranslate: { x: number; y: number };
    execute(command: SchematicEditorCommand): boolean;
    getSelectionContent(): SchematicContent | null;
    bindControllerEvents(): void;
    restoreHistoryContent(content: SchematicContent | null, origin: "undo" | "redo"): void;
    lifecycleController: AbortController;
    transientToolSession: SchematicTransientToolSessionCoordinator;
    commitCurrentContent: ReturnType<typeof vi.fn>;
  };
  Object.defineProperties(editor, { zoom: { value: 1.5 }, viewTranslate: { value: { x: 30, y: 40 } } });
  return { editor, history, schematic, selection, cells, paletteEl, transientHooks };
}

describe("symbol template commands", () => {
  it("switches the whole document once, preserving geometry, selection and viewport through undo/redo", () => {
    const { editor, schematic, history, selection, cells } = runtime();
    const before = contentFromDocument(schematic);
    expect(editor.execute({ kind: "symbol-template", templateId: "abidi" })).toBe(true);
    expect(editor.commitCurrentContent).toHaveBeenCalledOnce();
    expect(contentFromDocument(schematic)).toEqual({ ...before, symbolTemplate: "abidi" });
    expect([...cells.values()].every(cell => cell.attr("symbolBody/d") === "M 33 33 L 47 43 L 57 33")).toBe(true);
    expect([...selection.selectedIds]).toEqual(["R1", "wire"]);
    editor.restoreHistoryContent(history.undo(), "undo");
    expect(contentFromDocument(schematic)).toEqual(before);
    expect([...selection.selectedIds]).toEqual(["R1", "wire"]);
    editor.restoreHistoryContent(history.redo(), "redo");
    expect(schematic.symbolTemplate).toBe("abidi");
    expect([...selection.selectedIds]).toEqual(["R1", "wire"]);
    expect(editor.zoom).toBe(1.5);
    expect(editor.viewTranslate).toEqual({ x: 30, y: 40 });
    expect(editor.getSelectionContent()?.symbolTemplate).toBe("abidi");
  });

  it.each(["place", "wire", "copy"] as const)("cancels pending %s previews without placing them", mode => {
    const { editor, schematic, transientHooks } = runtime();
    const before = contentFromDocument(schematic);
    editor.transientToolSession.setMode(mode);
    editor.execute({ kind: "symbol-template", templateId: "abidi" });
    expect(editor.transientToolSession.mode).toBe("select");
    expect(transientHooks.clearPlacementPreview).toHaveBeenCalledOnce();
    expect(transientHooks.clearWirePreview).toHaveBeenCalledOnce();
    expect(transientHooks.clearCellGeometryInteraction).toHaveBeenCalledWith("rollback");
    expect(contentFromDocument(schematic)).toEqual({ ...before, symbolTemplate: "abidi" });
  });

  it("routes the shared select through the command and rejects unknown/no-op choices without history", () => {
    const { editor, history, paletteEl } = runtime();
    editor.bindControllerEvents();
    const select = paletteEl.querySelector<HTMLSelectElement>("[data-symbol-template]")!;
    select.value = "abidi";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(editor.document.symbolTemplate).toBe("abidi");
    editor.commitCurrentContent.mockClear();
    expect(editor.execute({ kind: "symbol-template", templateId: "abidi" })).toBe(false);
    expect(editor.execute({ kind: "symbol-template", templateId: "unknown" as "razavi" })).toBe(false);
    expect(paletteEl.querySelector("[data-symbol-template-error]")?.textContent).toContain("Unknown symbol template");
    expect(editor.commitCurrentContent).not.toHaveBeenCalled();
    expect(history.undo()?.symbolTemplate).toBe("razavi");
    expect(history.undo()).toBeNull();
    editor.lifecycleController.abort();
  });

  it("does not retain a template change rejected by host history", () => {
    const { editor, schematic, history } = runtime();
    editor.commitCurrentContent.mockReturnValue(false);
    expect(editor.execute({ kind: "symbol-template", templateId: "abidi" })).toBe(false);
    expect(schematic.symbolTemplate).toBe("razavi");
    expect(history.canUndo).toBe(false);
  });

  it("keeps the destination document template when pasting a differently styled source", () => {
    const { editor, schematic } = runtime();
    editor.execute({ kind: "symbol-template", templateId: "abidi" });
    const source = copySourceFromDocument(schematic);
    expect(source.symbolTemplate).toBe("abidi");
    const target = fixtureDocument({ components: [], wires: [] });
    let nextId = 0;
    const copy = instantiateCopyAt({ source, anchor: { x: 200, y: 200 } }, { x: 600, y: 200 }, {
      preview: false, createId: () => `copy-${++nextId}`, nextComponentRef: () => `X${nextId}`
    });
    applyCopyPlacementToDocument(target, copy);
    expect(target.symbolTemplate).toBe("razavi");
    expect(target.components).toHaveLength(2);
    expect(makeComponentCell(target.components[0], target).attr("symbolBody/d")).not.toBe("M 33 33 L 47 43 L 57 33");
  });
});
