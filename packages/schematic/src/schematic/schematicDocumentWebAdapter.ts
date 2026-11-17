import { downloadBlob } from "../shared/download";
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

export function downloadSchematicDocumentFile(document: SchematicDocument, title: string) {
  downloadBlob(
    new Blob([serializeSchematicDocumentFile(document)], { type: SCHEMATIC_FILE_MIME }),
    schematicDocumentFilename(title)
  );
}
