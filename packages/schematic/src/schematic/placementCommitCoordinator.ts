import type { CopyLayerTarget } from "./copyModel";
import { SchematicCopyController } from "./copyController";
import {
  applyCopyPlacementDocumentOp,
  applyPlacementCommitDocumentOp,
  type SchematicDocumentOpResult
} from "./document/documentOps";
import { bindStandaloneNetLabelsAtPoint } from "./netLabelModel";
import type { InstancePaletteItem } from "./instanceSelector";
import { SchematicPlacementToolController } from "./placementToolController";
import type { ComponentType, Point, SchematicDocument } from "./types";

export interface SchematicPlacementCommitFactories {
  createId(): string;
  nextComponentRef(type: ComponentType): string;
}

export type SchematicPlacementCommitOutcome =
  | {
      kind: "status";
      status: string;
    }
  | {
      kind: "commit";
      source: "placement" | "copy";
      result: SchematicDocumentOpResult;
      previewPoint: Point;
      nextPlacementItem: InstancePaletteItem | null;
      syncToolUiAfterPreview: boolean;
    };

export class SchematicPlacementCommitCoordinator {
  constructor(
    private readonly document: SchematicDocument,
    private readonly placementTool: SchematicPlacementToolController,
    private readonly copyTool: SchematicCopyController,
    private readonly factories: SchematicPlacementCommitFactories
  ) {}

  commitPlacement(point: Point, layerId?: string): SchematicPlacementCommitOutcome {
    const commit = this.placementTool.buildCommit(point, {
      createId: this.factories.createId,
      nextRef: this.factories.nextComponentRef
    });
    if (!commit) {
      return {
        kind: "status",
        status: "Type a valid component or template name before placing."
      };
    }

    if (layerId !== undefined) {
      commit.fragment.components.forEach(component => { component.values["layer:id"] = layerId; });
      commit.fragment.wires.forEach(wire => { wire.layerId = layerId; });
    }
    return this.commitOutcome(
      "placement",
      applyPlacementCommitDocumentOp(this.document, commit),
      point,
      false
    );
  }

  commitCopy(point: Point, target?: CopyLayerTarget): SchematicPlacementCommitOutcome {
    const placement = this.copyTool.preparePlacement(point, this.factories, this.document, target);
    if (!placement.ok) {
      return {
        kind: "status",
        status: placement.status
      };
    }
    bindStandaloneNetLabelsAtPoint(this.document, placement.copied.netLabels ?? [], point);

    const result = applyCopyPlacementDocumentOp(this.document, placement.copied);
    if (!result.changed) {
      return {
        kind: "status",
        status: result.status
      };
    }
    return this.commitOutcome("copy", result, placement.previewPoint, true);
  }

  private commitOutcome(
    source: "placement" | "copy",
    result: SchematicDocumentOpResult,
    previewPoint: Point,
    syncToolUiAfterPreview: boolean
  ): SchematicPlacementCommitOutcome {
    return {
      kind: "commit",
      source,
      result,
      previewPoint,
      nextPlacementItem: this.placementTool.activeItem,
      syncToolUiAfterPreview
    };
  }
}
