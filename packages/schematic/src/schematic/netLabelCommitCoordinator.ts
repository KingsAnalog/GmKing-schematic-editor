import {
  applyNetLabelPlacementDocumentOp,
  type SchematicDocumentOpResult
} from "./document/documentOps";
import { SchematicNetLabelToolController } from "./netLabelToolController";
import type { Point, SchematicDocument } from "./types";

export type SchematicNetLabelCommitOutcome =
  | {
      kind: "status";
      status: string;
      focusInput: boolean;
    }
  | {
      kind: "commit";
      result: SchematicDocumentOpResult;
    };

export class SchematicNetLabelCommitCoordinator {
  constructor(
    private readonly document: SchematicDocument,
    private readonly labelTool: SchematicNetLabelToolController,
    private readonly createId: () => string
  ) {}

  commitPlacement(point: Point, preferredWireId?: string): SchematicNetLabelCommitOutcome {
    const placement = this.labelTool.preparePlacement(
      this.document,
      point,
      preferredWireId,
      this.createId
    );
    if (placement.kind === "unarmed") {
      return {
        kind: "status",
        status: "Enter a valid label name in the Property Editor and press Enter first.",
        focusInput: true
      };
    }
    if (placement.kind === "invalid-target") {
      return {
        kind: "status",
        status: "Net labels can only be placed on an active wire or junction.",
        focusInput: false
      };
    }
    return {
      kind: "commit",
      result: applyNetLabelPlacementDocumentOp(this.document, placement.label)
    };
  }
}
