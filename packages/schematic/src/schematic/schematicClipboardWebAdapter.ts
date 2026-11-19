import { parseSchematicDocumentFile } from "./schematicDocumentCodec";
import type { SchematicDocument } from "./types";

export interface SchematicClipboardTextReader {
  readText(): Promise<string>;
}

export async function readSchematicDocumentFromClipboard(
  clipboard: SchematicClipboardTextReader | null | undefined = systemClipboard()
): Promise<SchematicDocument> {
  if (!clipboard?.readText) {
    throw new Error("Text clipboard is not available.");
  }
  const source = await clipboard.readText();
  if (!source.trim()) {
    throw new Error("The clipboard does not contain schematic JSON.");
  }
  return parseSchematicDocumentFile(source);
}

function systemClipboard(): SchematicClipboardTextReader | null {
  if (typeof navigator === "undefined") return null;
  return navigator.clipboard ?? null;
}
