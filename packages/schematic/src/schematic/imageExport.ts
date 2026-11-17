const SVG_MIME = "image/svg+xml";
const PNG_MIME = "image/png";
const MAX_PNG_DIMENSION = 8192;
const MAX_PNG_AREA = 48_000_000;

export interface SchematicSvgImage {
  svg: string;
  width: number;
  height: number;
}

/** Uses a single scale for both axes, including very large diagrams. */
export function schematicPngSize(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Invalid schematic image dimensions.");
  }
  const scale = Math.min(2, MAX_PNG_DIMENSION / width, MAX_PNG_DIMENSION / height,
    Math.sqrt(MAX_PNG_AREA / width / height));
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale))
  };
}

export async function rasterizeSchematicSvg(
  exported: SchematicSvgImage,
  ownerDocument: Document,
  options: { backgroundColor?: string } = {}
): Promise<Blob> {
  const ownerWindow = ownerDocument.defaultView;
  if (!ownerWindow) throw new Error("Image rendering window is unavailable.");
  const size = schematicPngSize(exported.width, exported.height);
  const canvas = ownerDocument.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas rendering is unavailable.");

  // Chromium needs a data URL for SVGs containing HTML notes.
  const usesDataUrl = exported.svg.includes("<foreignObject");
  const url = usesDataUrl
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(exported.svg)}`
    : ownerWindow.URL.createObjectURL(new Blob([exported.svg], { type: SVG_MIME }));
  try {
    const image = new ownerWindow.Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("SVG image could not be loaded."));
      image.src = url;
    });
    if (options.backgroundColor) {
      context.fillStyle = options.backgroundColor;
      context.fillRect(0, 0, size.width, size.height);
    }
    context.drawImage(image, 0, 0, size.width, size.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG export failed.")), PNG_MIME);
    });
  } finally {
    if (!usesDataUrl) ownerWindow.URL.revokeObjectURL(url);
  }
}

export async function writeSchematicImageClipboard(
  ownerDocument: Document,
  entries: Record<string, Blob>
) {
  const ownerWindow = ownerDocument.defaultView;
  const clipboard = ownerWindow?.navigator.clipboard;
  const ClipboardItemCtor = ownerWindow?.ClipboardItem;
  if (!clipboard?.write || !ClipboardItemCtor) throw new Error("Image clipboard is unavailable.");
  await clipboard.write([new ClipboardItemCtor(entries)]);
}
