import {
  applyWireCommitDocumentOp,
  type SchematicDocumentOpResult
} from "../document/documentOps";
import type { Point, SchematicDocument } from "../types";
import {
  SchematicWireToolController,
  type SchematicWireRouteResult
} from "./wireToolController";

export type SchematicWireCommitOutcome =
  | {
      kind: "pending";
      previewPoint: Point;
      status: string;
    }
  | {
      kind: "status";
      status: string;
    }
  | {
      kind: "commit";
      result: SchematicDocumentOpResult;
    }
  | {
      kind: "none";
    };

export class SchematicWireCommitCoordinator {
  constructor(
    private readonly document: SchematicDocument,
    private readonly wireTool: SchematicWireToolController,
    private readonly createId: () => string,
    private readonly activeLayerId?: () => string
  ) {}

  applyBlankClick(point: Point): SchematicWireCommitOutcome {
    return this.applyRouteResult(this.wireTool.applyBlankClick(point));
  }

  applyPinClick(point: Point): SchematicWireCommitOutcome {
    return this.applyRouteResult(this.wireTool.applyPinClick(point));
  }

  finish(point: Point | null): SchematicWireCommitOutcome {
    return this.applyRouteResult(this.wireTool.finish(point));
  }

  private applyRouteResult(result: SchematicWireRouteResult): SchematicWireCommitOutcome {
    if (result.kind === "pending") return result;
    if (result.kind === "invalid") {
      return {
        kind: "status",
        status: result.status
      };
    }

    const commit = applyWireCommitDocumentOp(
      this.document,
      result.points,
      this.wireTool.appearance(),
      this.createId,
      result.routeMode,
      this.activeLayerId?.()
    );
    if (!commit.changed) return { kind: "none" };
    this.wireTool.reset();
    return {
      kind: "commit",
      result: commit
    };
  }
}
