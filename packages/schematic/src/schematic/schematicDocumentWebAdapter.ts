import { downloadBlob } from "../shared/download";
import { renderSchematicDocumentSvg, type SchematicDocumentSvgOptions } from "./documentSvgRenderer";
import { rasterizeSchematicSvg } from "./imageExport";
import {
  assertSchematicDocumentFileSize,
  parseSchematicDocumentFile,
  SCHEMATIC_FILE_MIME,
  schematicDocumentFilename,
  schematicDocumentTitleFromFilename,
  serializeSchematicDocumentFile
} from "./schematicDocumentCodec";
import type { SchematicDocument } from "./types";

export interface ImportedSchematicDocumentFile {
  title: string;
  document: SchematicDocument;
}

export interface SchematicDocumentFileLike {
  readonly name: string;
  readonly size: number;
  text(): Promise<string>;
}

export async function readSchematicDocumentFile(
  file: SchematicDocumentFileLike
): Promise<ImportedSchematicDocumentFile> {
  assertSchematicDocumentFileSize(file.size);
  return {
    title: schematicDocumentTitleFromFilename(file.name),
    document: parseSchematicDocumentFile(await file.text())
  };
}

export function downloadSchematicDocumentFile(document: SchematicDocument, title: string, ownerDocument?: Document) {
  downloadBlob(
    new Blob([serializeSchematicDocumentFile(document)], { type: SCHEMATIC_FILE_MIME }),
    schematicDocumentFilename(title),
    ownerDocument
  );
}

export async function downloadSchematicDocumentImage(
  document: SchematicDocument,
  title: string,
  format: "svg" | "png",
  options: Pick<SchematicDocumentSvgOptions, "includeHidden" | "presentationMode">,
  ownerDocument: Document
) {
  const image = renderSchematicDocumentSvg(document, { ...options, namespace: "schematic-export" });
  const blob = format === "svg"
    ? new Blob([image.svg], { type: "image/svg+xml" })
    : await rasterizeSchematicSvg(image, ownerDocument);
  const stem = schematicDocumentFilename(title).replace(/\.sch\.json$/i, "");
  downloadBlob(blob, `${stem}.${format}`, ownerDocument);
}
