import { rasterizeSchematicSvg, writeSchematicImageClipboard } from "../imageExport";
import { downloadBlob } from "../../shared/download";
import { escapeAttribute } from "../uiUtils";
import type { SchematicSelectionSvgExport } from "./selectionExport";

const SVG_MIME = "image/svg+xml";
const PNG_MIME = "image/png";

export type SchematicSvgClipboardResult = "svg" | "png";

export interface SchematicSvgClipboardOptions {
  pngFallback?: () => Blob | Promise<Blob>;
}

export async function copySvgToClipboard(
  svg: string,
  options: SchematicSvgClipboardOptions = {}
): Promise<SchematicSvgClipboardResult> {
  const clipboard = navigator.clipboard;
  const ClipboardItemCtor = globalThis.ClipboardItem;
  if (!clipboard?.write || !ClipboardItemCtor) throw new Error("SVG clipboard is not available.");

  const textEntries = {
    "text/html": new Blob([svgClipboardHtml(svg)], { type: "text/html" }),
    "text/plain": new Blob([svg], { type: "text/plain" })
  };

  try {
    // Chromium's supports() result is not reliable for SVG on every platform.
    await writeSchematicImageClipboard(document, { [SVG_MIME]: svgToBlob(svg), ...textEntries });
    return "svg";
  } catch (svgError) {
    if (!options.pngFallback) throw svgError;
    const png = await options.pngFallback();
    await writeSchematicImageClipboard(document, { [PNG_MIME]: png });
    return "png";
  }
}

export async function copyPngToClipboard(blob: Blob) {
  const clipboard = navigator.clipboard;
  const ClipboardItemCtor = globalThis.ClipboardItem as
    | (typeof ClipboardItem & { supports?: (type: string) => boolean })
    | undefined;
  if (!clipboard?.write || !ClipboardItemCtor) throw new Error("PNG clipboard is not available.");
  if (ClipboardItemCtor.supports && !ClipboardItemCtor.supports(PNG_MIME)) {
    throw new Error("PNG clipboard MIME is not supported.");
  }
  await writeSchematicImageClipboard(document, { [PNG_MIME]: blob });
}

export function rasterizeSvgToPngBlob(exported: SchematicSelectionSvgExport) {
  return rasterizeSchematicSvg(exported, document);
}

export function downloadSvg(svg: string, filename = "schematic-selection.svg") {
  downloadBlob(svgToBlob(svg), filename);
}

export function downloadPng(blob: Blob, filename = "schematic-selection.png") {
  downloadBlob(blob, filename);
}

function svgClipboardHtml(svg: string) {
  const source = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return `<img src="${escapeAttribute(source)}" alt="Schematic selection" />`;
}

function svgToBlob(svg: string) {
  return new Blob([svg], { type: SVG_MIME });
}
