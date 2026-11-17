import {
  deleteSchematicDocumentSelection,
  toggleTemporaryDeletedSchematicIds,
  type SchematicDocumentOpResult
} from "./document/documentOps";
import type { SchematicSelectionProjection } from "./selection/selectionProjection";
import type { SchematicDocument } from "./types";

export type SchematicDeleteCommitOutcome =
  | {
      kind: "status";
      status: string;
    }
  | {
      kind: "commit";
      result: SchematicDocumentOpResult;
    };

export class SchematicDeleteCommitCoordinator {
  constructor(private readonly document: SchematicDocument) {}

  deleteSelection(selection: SchematicSelectionProjection): SchematicDeleteCommitOutcome {
    return this.outcome(deleteSchematicDocumentSelection(this.document, selection));
  }

  toggleTemporary(ids: Iterable<string>): SchematicDeleteCommitOutcome {
    return this.outcome(toggleTemporaryDeletedSchematicIds(this.document, ids));
  }

  private outcome(result: SchematicDocumentOpResult): SchematicDeleteCommitOutcome {
    return result.changed
      ? { kind: "commit", result }
      : { kind: "status", status: result.status };
  }
}
