import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEmptySchematicContent, renderSchematicDocumentSvg } from "@edahelper/schematic/core";
import type { SchematicEditorHandle } from "@edahelper/schematic/editor";
import { showSchematicExportMenu } from "../src/exports";
import { obsidianMockState, resetObsidianMockState } from "./obsidianMock";

describe("Obsidian schematic export menu", () => {
  beforeEach(() => resetObsidianMockState());
  afterEach(() => vi.restoreAllMocks());

  it("uses the shared Web copy labels", () => {
    showSchematicExportMenu({
      content: createEmptySchematicContent(),
      namespace: "menu-labels"
    }, { x: 0, y: 0 }, document);

    expect(obsidianMockState.menus[0].items.map((item) => item.title)).toEqual([
      "Copy as SVG",
      "Copy as PNG",
      "Copy as JSON",
      "Copy as SVG (include hidden objects)",
      "Copy as PNG (include hidden objects)"
    ]);
  });

  it("copies hidden objects only when the whole-document image action requests them", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { writeText } });
    const content = createEmptySchematicContent();
    content.notes.push({ id: "hidden-note", x: 0, y: 0, width: 140, format: "plain", text: "Hidden note" });
    content.layerObjectStates = { "hidden-note": { visible: false } };
    showSchematicExportMenu({ content, namespace: "hidden-export" }, { x: 0, y: 0 }, document);
    const actions = obsidianMockState.menus[0].items;
    actions.find(item => item.title === "Copy as SVG")?.onClick?.();
    actions.find(item => item.title === "Copy as SVG (include hidden objects)")?.onClick?.();

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(writeText.mock.calls[0][0]).not.toContain("Hidden note");
    expect(writeText.mock.calls[1][0]).toContain("Hidden note");
  });

  it("keeps successful JSON copies silent", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText }
    });
    showSchematicExportMenu({
      content: createEmptySchematicContent(),
      namespace: "silent-json"
    }, { x: 0, y: 0 }, document);

    obsidianMockState.menus[0].items[2].onClick?.();
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    expect(obsidianMockState.notices).toEqual([]);
  });

  it("still reports export failures", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error("Clipboard denied.")) }
    });
    showSchematicExportMenu({
      content: createEmptySchematicContent(),
      namespace: "failed-json"
    }, { x: 0, y: 0 }, document);

    obsidianMockState.menus[0].items[2].onClick?.();
    await vi.waitFor(() => expect(obsidianMockState.notices).toEqual(["Clipboard denied."]));
  });
});

describe("Obsidian image export in the owning window", () => {
  beforeEach(() => resetObsidianMockState());
  afterEach(() => vi.restoreAllMocks());

  function host() {
    const clipboard = { write: vi.fn().mockResolvedValue(undefined), writeText: vi.fn().mockResolvedValue(undefined) };
    const png = new Blob(["png"], { type: "image/png" });
    const context = { fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() };
    const canvas = { width: 0, height: 0, getContext: () => context, toBlob: (callback: (value: Blob) => void) => callback(png) };
    const ownerDocument = {
      createElement: () => canvas,
      defaultView: {
        navigator: { clipboard },
        URL: { createObjectURL: () => "blob:popout", revokeObjectURL: vi.fn() },
        ClipboardItem: class { constructor(readonly entries: Record<string, Blob>) {} },
        Image: class {
          onload?: () => void;
          set src(_value: string) { queueMicrotask(() => this.onload?.()); }
        }
      }
    } as unknown as Document;
    return { ownerDocument, clipboard, canvas, context, png };
  }

  it("falls back to SVG text when Electron rejects the SVG MIME", async () => {
    const runtime = host();
    runtime.clipboard.write.mockRejectedValue(new Error("Unsupported SVG MIME"));
    showSchematicExportMenu({ content: createEmptySchematicContent(), namespace: "svg-popout" }, { x: 0, y: 0 }, runtime.ownerDocument);
    obsidianMockState.menus[0].items[0].onClick?.();
    await vi.waitFor(() => expect(runtime.clipboard.writeText).toHaveBeenCalledOnce());
    expect(runtime.clipboard.writeText.mock.calls[0][0]).toContain("<svg");
    expect(runtime.clipboard.writeText.mock.calls[0][0]).not.toContain("<rect");
    expect(obsidianMockState.notices).toEqual([]);
  });

  it.each([false, true])("copies a proportional transparent PNG (selection: %s)", async (selection) => {
    const runtime = host();
    const content = createEmptySchematicContent();
    content.notes.push({ id: "large-note", x: 0, y: 0, width: 6000, height: 1000, format: "plain", text: "Wide schematic" });
    const exported = renderSchematicDocumentSvg(content, { namespace: "dimensions" });
    const editor = selection ? {
      hasExportableSelection: () => true,
      getSelectionContent: () => content,
      getSelectionExportInput: async () => ({ ...content, junctionPoints: [], presentationMode: true })
    } as unknown as SchematicEditorHandle : undefined;
    showSchematicExportMenu({ content, editor, namespace: "png-popout" }, { x: 0, y: 0 }, runtime.ownerDocument);
    obsidianMockState.menus[0].items[1].onClick?.();
    await vi.waitFor(() => expect(runtime.clipboard.write).toHaveBeenCalledOnce());
    expect(runtime.canvas.width).toBe(8192);
    expect(runtime.canvas.height).toBe(Math.floor(exported.height * 8192 / exported.width));
    expect(runtime.context.fillRect).not.toHaveBeenCalled();
    expect(runtime.clipboard.write).toHaveBeenCalledWith([expect.objectContaining({ entries: { "image/png": runtime.png } })]);
    expect(obsidianMockState.notices).toEqual([]);
  });
});

describe("paste menu item", () => {
  it("offers Paste only when the host supplies the action and closes the native menu before invoking it", () => {
    resetObsidianMockState();
    const onPaste = vi.fn();
    const visibility: boolean[] = [];
    showSchematicExportMenu({
      content: createEmptySchematicContent(), namespace: "blank-menu", onPaste
    }, { x: 0, y: 0 }, document, visible => visibility.push(visible));
    const menu = obsidianMockState.menus[0];
    expect(menu.items.map(item => item.title)).toEqual(["Paste schematic from clipboard"]);
    menu.items[0].onClick?.();
    expect(visibility).toEqual([true, false]);
    expect(onPaste).toHaveBeenCalledOnce();
  });
});
