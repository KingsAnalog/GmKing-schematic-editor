import { buildPlacementSummaryPlacement, type PlacementProjectionItem } from "../placementProjection";
import type { SchematicPropertyPanelInput } from "../propertyPanelController";
import {
  buildSchematicPropertyPanelInput,
  type SchematicPropertySelectionTargets
} from "../propertyPanelProjection";
import type { NetResolution } from "../netResolution";
import {
  buildSchematicSelectionStatus,
  buildSchematicSelectionSummary,
  type SchematicSelectionContents,
  type SchematicSelectionSummary,
  type SelectionMoveBehavior,
  type SelectionSummaryMode
} from "./selectionSummary";
import type { SchematicDocument, WireVariant } from "../types";

export interface SchematicSelectionUiProjectionInput {
  mode: SelectionSummaryMode;
  selection: SchematicSelectionContents;
  propertyPanel: {
    document: SchematicDocument;
    targets: SchematicPropertySelectionTargets;
    hasSelection: boolean;
    resolution?: NetResolution;
    couplingPickSourceId?: string | null;
  };
  activePlacementItem: PlacementProjectionItem | null;
  wire: {
    variant: WireVariant;
    routePointCount: number;
  };
  copy: {
    hasSource: boolean;
  };
  moveHasSource?: boolean;
  moveBehavior: SelectionMoveBehavior;
}

export interface SchematicSelectionUiProjection {
  selection: SchematicSelectionContents;
  propertyPanel: SchematicPropertyPanelInput;
  summary: SchematicSelectionSummary;
  status: string;
}

export function buildSchematicSelectionUiProjection(input: SchematicSelectionUiProjectionInput): SchematicSelectionUiProjection {
  const propertyPanel = buildSchematicPropertyPanelInput({
    document: input.propertyPanel.document,
    targets: input.propertyPanel.targets,
    hasSelection: input.propertyPanel.hasSelection,
    resolution: input.propertyPanel.resolution,
    couplingPickSourceId: input.propertyPanel.couplingPickSourceId
  });

  return {
    selection: input.selection,
    propertyPanel,
    summary: buildSchematicSelectionSummary({
      mode: input.mode,
      selection: input.selection,
      placement: buildPlacementSummaryPlacement(input.activePlacementItem),
      wire: input.wire,
      copy: input.copy,
      move: { behavior: input.moveBehavior, hasSource: !!input.moveHasSource }
    }),
    status: buildSchematicSelectionStatus({
      selection: input.selection,
      moveBehavior: input.moveBehavior
    })
  };
}
