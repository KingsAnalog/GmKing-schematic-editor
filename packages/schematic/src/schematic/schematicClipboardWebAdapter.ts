import { parseSchematicDocumentFile } from "./schematicDocumentCodec";
import type { SchematicDocument } from "./types";

export interface SchematicClipboardTextReader {
  readText(): Promise<string>;
}

export async function readSchematicDocumentFromClipboard(
  clipboard: SchematicClipboardTextReader | null | undefined = systemClipboard()
): Promise<SchematicDocument> {
  return parseSchematicDocumentFile(await readSchematicClipboardText(clipboard));
}

export async function readSchematicClipboardText(
  clipboard: SchematicClipboardTextReader | null | undefined = systemClipboard()
) {
  if (!clipboard?.readText) {
    throw new Error("Text clipboard is not available.");
  }
  const source = await clipboard.readText();
  if (!source.trim()) {
    throw new Error("The clipboard does not contain schematic JSON.");
  }
  return source;
}

function systemClipboard(): SchematicClipboardTextReader | null {
  if (typeof navigator === "undefined") return null;
  return navigator.clipboard ?? null;
}
