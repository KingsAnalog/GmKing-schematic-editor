import { createSnapshotHistory } from "../../../src/shared/history";
import { cloneSchematicDocument, restoreSchematicDocument } from "../../../src/schematic/document/documentModel";
import type { SchematicDocument } from "../../../src/schematic/types";

export const SCHEMATIC_DOCUMENT_HISTORY_MAX_DEPTH = 256;

export interface SchematicDocumentHistoryAdapter {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  push(document: SchematicDocument): boolean;
  undo(): SchematicDocument | null;
  redo(): SchematicDocument | null;
  resetBaseline(document: SchematicDocument): void;
}

export function createSchematicDocumentHistoryAdapter(initialDocument: SchematicDocument): SchematicDocumentHistoryAdapter {
  const history = createSnapshotHistory(initialDocument, { clone: cloneSchematicDocument, maxDepth: SCHEMATIC_DOCUMENT_HISTORY_MAX_DEPTH });
  return {
    get canUndo() {
      return history.canUndo;
    },
    get canRedo() {
      return history.canRedo;
    },
    push(document) {
      return history.push(document);
    },
    undo() {
      return history.undo();
    },
    redo() {
      return history.redo();
    },
    resetBaseline(document) {
      history.reset(normalizeHistoryDocument(document));
    }
  };
}

function normalizeHistoryDocument(document: SchematicDocument) {
  return restoreSchematicDocument(document);
}
