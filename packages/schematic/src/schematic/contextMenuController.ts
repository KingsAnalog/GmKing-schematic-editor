import {
  buildSchematicSelectionSvg as defaultBuildSchematicSelectionSvg,
  type SchematicSelectionExportInput,
  type SchematicSelectionSvgExport
} from "./selection/selectionExport";
import {
  copyPngToClipboard as defaultCopyPngToClipboard,
  copySvgToClipboard as defaultCopySvgToClipboard,
  downloadPng as defaultDownloadPng,
  downloadSvg as defaultDownloadSvg,
  rasterizeSvgToPngBlob as defaultRasterizeSvgToPngBlob
} from "./selection/selectionExportWebAdapter";
import {
  schematicContextMenuActions,
  SCHEMATIC_PASTE_MENU_LABEL,
  type SchematicContextMenuScope,
  type SchematicCopyFormat
} from "./contextMenuModel";

export type SchematicSelectionExportFormat = SchematicCopyFormat;

type ViewportSize = {
  width: number;
  height: number;
};

export interface SchematicSelectionExportCommandOptions {
  getExportInput: () => SchematicSelectionExportInput | Promise<SchematicSelectionExportInput>;
  getNetlistText?: () => string | null | Promise<string | null>;
  getJsonText?: () => string | null | Promise<string | null>;
  setStatus: (message: string) => void;
  buildSelectionSvg?: (input: SchematicSelectionExportInput) => SchematicSelectionSvgExport | null | Promise<SchematicSelectionSvgExport | null>;
  copySvgToClipboard?: (
    svg: string,
    options?: { pngFallback?: () => Blob | Promise<Blob> }
  ) => Promise<"svg" | "png" | void> | "svg" | "png" | void;
  copyPngToClipboard?: (blob: Blob) => Promise<void> | void;
  copyTextToClipboard?: (text: string) => Promise<void> | void;
  rasterizeSvgToPngBlob?: (exported: SchematicSelectionSvgExport) => Promise<Blob> | Blob;
  downloadSvg?: (svg: string) => void;
  downloadPng?: (blob: Blob) => void;
}

export interface SchematicContextMenuControllerOptions extends SchematicSelectionExportCommandOptions {
  onPaste?: () => void | Promise<void>;
  ownerDocument?: Document;
  viewport?: () => ViewportSize;
}

export class SchematicContextMenuController {
  readonly element: HTMLElement;
  private readonly ownerDocument: Document;

  constructor(private readonly options: SchematicContextMenuControllerOptions) {
    this.ownerDocument = options.ownerDocument ?? document;
    this.element = this.createContextMenu();
    this.ownerDocument.body.appendChild(this.element);
  }

  get hidden() {
    return this.element.hidden;
  }

  containsTarget(target: EventTarget | null) {
    return !!target && this.element.contains(target as Node);
  }

  show(clientX: number, clientY: number, scope: SchematicContextMenuScope = "selection") {
    this.element.querySelectorAll<HTMLElement>("[data-copy-export]").forEach(button => {
      const hidden = scope === "blank";
      button.hidden = hidden;
      button.style.display = hidden ? "none" : "";
    });
    const paste = this.element.querySelector<HTMLElement>("[data-paste-schematic]");
    if (paste) {
      const hidden = scope !== "blank";
      paste.hidden = hidden;
      paste.style.display = hidden ? "none" : "";
    }
    this.element.setAttribute("aria-label", scope === "blank" ? "Schematic clipboard menu" : "Schematic selection copy menu");
    this.element.hidden = false;
    this.element.style.left = "";
    this.element.style.top = "";
    const rect = this.element.getBoundingClientRect();
    const viewport = this.viewport();
    const x = Math.min(clientX, viewport.width - rect.width - 8);
    const y = Math.min(clientY, viewport.height - rect.height - 8);
    this.element.style.left = `${Math.max(8, x)}px`;
    this.element.style.top = `${Math.max(8, y)}px`;
  }

  close() {
    this.element.hidden = true;
  }

  async copySelectionAs(format: SchematicSelectionExportFormat) {
    this.close();
    await copySchematicSelectionAs(format, this.options);
  }

  destroy() {
    this.element.remove();
  }

  private createContextMenu() {
    const menu = this.ownerDocument.createElement("div");
    menu.className = "schematic-context-menu";
    menu.hidden = true;
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Schematic selection copy menu");
    menu.append(...schematicContextMenuActions("selection")
      .filter((action) => action.kind === "copy")
      .map((action) => this.createMenuButton(action.format, action.label)));
    if (this.options.onPaste) {
      const paste = this.ownerDocument.createElement("button");
      paste.type = "button";
      paste.setAttribute("role", "menuitem");
      paste.dataset.pasteSchematic = "";
      paste.textContent = SCHEMATIC_PASTE_MENU_LABEL;
      paste.hidden = true;
      menu.append(paste);
    }
    menu.addEventListener("click", (event) => {
      const paste = (event.target as HTMLElement).closest("[data-paste-schematic]");
      if (paste) {
        event.preventDefault();
        event.stopPropagation();
        this.close();
        void this.options.onPaste?.();
        return;
      }
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-copy-export]");
      const format = exportFormatFromDataset(button?.dataset.copyExport);
      if (!format) return;
      event.preventDefault();
      event.stopPropagation();
      void this.copySelectionAs(format);
    });
    menu.addEventListener("contextmenu", (event) => event.preventDefault());
    return menu;
  }

  private createMenuButton(format: SchematicSelectionExportFormat, label: string) {
    const button = this.ownerDocument.createElement("button");
    button.type = "button";
    button.setAttribute("role", "menuitem");
    button.dataset.copyExport = format;
    button.textContent = label;
    return button;
  }

  private viewport() {
    return this.options.viewport?.() ?? { width: window.innerWidth, height: window.innerHeight };
  }
}

export async function copySchematicSelectionAs(format: SchematicSelectionExportFormat, options: SchematicSelectionExportCommandOptions) {
  if (format === "netlist" || format === "json") {
    try {
      const text = await (format === "netlist" ? options.getNetlistText?.() : options.getJsonText?.());
      if (!text) {
        options.setStatus(
          format === "netlist"
            ? "Select netlistable schematic components before copying."
            : "Select schematic objects before copying as JSON."
        );
        return;
      }
      await (options.copyTextToClipboard ?? copyTextToClipboard)(text);
      options.setStatus(
        format === "netlist"
          ? "Copied selected schematic netlist to clipboard."
          : "Copied selected schematic JSON to clipboard."
      );
    } catch (error) {
      options.setStatus(
        `Could not copy selected schematic ${format === "netlist" ? "netlist" : "JSON"}: ${errorMessage(error)}`
      );
    }
    return;
  }

  const buildSelectionSvg = options.buildSelectionSvg ?? defaultBuildSchematicSelectionSvg;
  const copySvgToClipboard = options.copySvgToClipboard ?? defaultCopySvgToClipboard;
  const copyPngToClipboard = options.copyPngToClipboard ?? defaultCopyPngToClipboard;
  const rasterizeSvgToPngBlob = options.rasterizeSvgToPngBlob ?? defaultRasterizeSvgToPngBlob;
  const downloadSvg = options.downloadSvg ?? defaultDownloadSvg;
  const downloadPng = options.downloadPng ?? defaultDownloadPng;

  const exported = await buildSelectionSvg(await options.getExportInput());
  if (!exported) {
    options.setStatus("Select schematic objects before copying.");
    return;
  }

  if (format === "svg") {
    try {
      const clipboardResult = await copySvgToClipboard(exported.clipboardSvg ?? exported.svg, {
        pngFallback: () => rasterizeSvgToPngBlob(exported)
      });
      options.setStatus(
        clipboardResult === "png"
          ? "SVG clipboard unavailable; copied selected schematic PNG instead."
          : "Copied selected schematic SVG to clipboard."
      );
    } catch {
      downloadSvg(exported.svg);
      options.setStatus("Clipboard unavailable; downloaded selected schematic SVG.");
    }
    return;
  }

  let pngBlob: Blob | null = null;
  try {
    pngBlob = await rasterizeSvgToPngBlob(exported);
    await copyPngToClipboard(pngBlob);
    options.setStatus("Copied selected schematic PNG to clipboard.");
  } catch (error) {
    if (pngBlob) {
      downloadPng(pngBlob);
      options.setStatus("Clipboard unavailable; downloaded selected schematic PNG.");
    } else {
      options.setStatus(`Could not export selected schematic PNG: ${errorMessage(error)}`);
    }
  }
}

function exportFormatFromDataset(value: string | undefined): SchematicSelectionExportFormat | null {
  return value === "svg" || value === "png" || value === "netlist" || value === "json" ? value : null;
}

async function copyTextToClipboard(text: string) {
  if (!navigator.clipboard?.writeText) throw new Error("Text clipboard is not available.");
  await navigator.clipboard.writeText(text);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
