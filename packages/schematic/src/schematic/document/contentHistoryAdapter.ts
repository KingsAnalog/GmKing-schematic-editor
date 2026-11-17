import { createSnapshotHistory } from "../../shared/history";
import { contentFromDocument } from "./documentModel";
import type { SchematicContent } from "../types";

export const SCHEMATIC_CONTENT_HISTORY_MAX_DEPTH = 256;

export interface SchematicContentHistoryAdapter {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  push(content: SchematicContent): boolean;
  undo(): SchematicContent | null;
  redo(): SchematicContent | null;
  resetBaseline(content: SchematicContent): void;
}

export function createSchematicContentHistoryAdapter(
  initialContent: SchematicContent
): SchematicContentHistoryAdapter {
  // Edit/import boundaries normalize content. History must preserve that content,
  // not run topology transformations again while copying or restoring it.
  const history = createSnapshotHistory(initialContent, {
    clone: content => contentFromDocument({ ...content, junctions: [] }),
    maxDepth: SCHEMATIC_CONTENT_HISTORY_MAX_DEPTH
  });
  return {
    get canUndo() {
      return history.canUndo;
    },
    get canRedo() {
      return history.canRedo;
    },
    push(content) {
      return history.push(content);
    },
    undo() {
      return history.undo();
    },
    redo() {
      return history.redo();
    },
    resetBaseline(content) {
      history.reset(content);
    }
  };
}
