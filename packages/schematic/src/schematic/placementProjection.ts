import { getComponentDef } from "./catalog";
import type { SchematicSelectionSummaryPlacement } from "./selection/selectionSummary";
import { isSchematicTemplateId, type SchematicTemplateId } from "./templates";
import type { ComponentType } from "./types";

export type PlacementProjectionItem = ComponentType | SchematicTemplateId;

export function buildPlacementStatusMessage(item: PlacementProjectionItem | null): string {
  if (!item) return "Type a component or template name to place.";
  if (isSchematicTemplateId(item)) {
    return `Placing ${item}. Move to preview, click grid points to place, Esc cancels.`;
  }
  return `Placing ${getComponentDef(item).hotLabel}. Move to preview, click grid points to place, r rotates preview, Esc cancels.`;
}

export function buildPlacementSummaryPlacement(item: PlacementProjectionItem | null): SchematicSelectionSummaryPlacement {
  if (!item) return { kind: "invalid" };
  if (isSchematicTemplateId(item)) return { kind: "template", id: item };
  const def = getComponentDef(item);
  return { kind: "component", hotLabel: def.hotLabel, label: def.label };
}
