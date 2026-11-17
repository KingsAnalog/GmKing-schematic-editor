import { Menu, Notice } from "obsidian";
import type { SchematicEditorHandle } from "@edahelper/schematic/editor";
import { schematicContextMenuActions, rasterizeSchematicSvg, writeSchematicImageClipboard } from "@edahelper/schematic/editor";
import {
  buildSchematicSelectionSvg,
  renderSchematicDocumentSvg,
  serializeSchematicContent,
  type SchematicContent
} from "@edahelper/schematic/core";

export interface SchematicExportSource {
  content: SchematicContent;
  editor?: SchematicEditorHandle;
  namespace: string;
  onPaste?: () => void;
}

export function showSchematicExportMenu(
  source: SchematicExportSource,
  position: { x: number; y: number },
  ownerDocument: Document,
  onVisibilityChange?: (visible: boolean) => void
) {
  const menu = new Menu().setUseNativeMenu(true);
  const selection = source.editor?.hasExportableSelection() === true;
  schematicContextMenuActions(source.onPaste ? "blank" : "selection", false).forEach((action) => {
    if (action.kind === "copy") {
      if (action.format === "netlist") return;
      const format = action.format;
      menu.addItem((item) => item
        .setTitle(action.label)
        .setIcon(action.format === "svg" ? "copy" : action.format === "png" ? "image" : "braces")
        .onClick(() => void runExport(format, source, ownerDocument, selection)));
      return;
    }
    menu.addItem((item) => item
      .setTitle(action.label)
      .setIcon("clipboard-paste")
      .onClick(() => { menu.hide(); source.onPaste?.(); }));
  });
  menu.onHide(() => onVisibilityChange?.(false));
  onVisibilityChange?.(true);
  menu.showAtPosition(position, ownerDocument);
  return menu;
}

async function runExport(
  format: "svg" | "png" | "json",
  source: SchematicExportSource,
  ownerDocument: Document,
  selection: boolean
) {
  try {
    const content = selection
      ? source.editor?.getSelectionContent() ?? source.content
      : source.content;
    if (format === "json") {
      await ownerDocument.defaultView?.navigator.clipboard.writeText(serializeSchematicContent(content));
      return;
    }
    const exported = selection && source.editor
      ? buildSchematicSelectionSvg(await source.editor.getSelectionExportInput())
      : renderSchematicDocumentSvg(content, {
          namespace: `${source.namespace}-export`,
          presentationMode: true,
          showGrid: false,
          backgroundColor: null
        });
    if (!exported) throw new Error("The selection does not contain exportable schematic objects.");
    if (format === "svg") {
      await copySvg(exported.svg, ownerDocument);
      return;
    }
    const png = await rasterizeSchematicSvg(exported, ownerDocument);
    await writeSchematicImageClipboard(ownerDocument, { "image/png": png });
  } catch (error) {
    console.error("Schematic export failed.", error);
    new Notice(error instanceof Error ? error.message : "Schematic export failed.");
  }
}

async function copySvg(svg: string, ownerDocument: Document) {
  const clipboard = ownerDocument.defaultView?.navigator.clipboard;
  if (!clipboard) throw new Error("Clipboard access is unavailable.");
  const ClipboardItemCtor = ownerDocument.defaultView?.ClipboardItem;
  if (typeof ClipboardItemCtor === "function" && typeof clipboard.write === "function") {
    try {
      await writeSchematicImageClipboard(ownerDocument, {
        "image/svg+xml": new Blob([svg], { type: "image/svg+xml" }),
        "text/plain": new Blob([svg], { type: "text/plain" })
      });
      return;
    } catch {
      // Some Electron clipboard versions reject image/svg+xml but accept text.
    }
  }
  await clipboard.writeText(svg);
}
