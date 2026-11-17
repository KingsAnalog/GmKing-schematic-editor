import { pointKey } from "../geometry";
import { junctionId, junctionPointFromId } from "../junctionIdentity";
import { createSchematicSelectionState, type SchematicSelectionState } from "./selectionModel";
import { remapSelectedJunctionIds, type SchematicSelectionProjection } from "./selectionProjection";
import { transformSelectionPoint, type GroupTransformKind } from "./selectionTransformModel";

export interface SelectionTransformRemapInput {
  selection: SchematicSelectionState;
  transformedJunctionIds: Iterable<string>;
  projection: Pick<SchematicSelectionProjection, "junctionKeys" | "transformBounds">;
  kind: GroupTransformKind;
}

export function remapSelectionAfterGeometryTransform(input: SelectionTransformRemapInput): SchematicSelectionState {
  const { selection, transformedJunctionIds, projection, kind } = input;
  if (projection.junctionKeys.size === 0) return selection;

  const nextSelectedIds = remapSelectedJunctionIds(selection.selectedIds, transformedJunctionIds);
  return createSchematicSelectionState({
    selectedIds: nextSelectedIds,
    selectedNoteIds: selection.selectedNoteIds,
    primarySelectedId: remapPrimarySelectedId(selection, nextSelectedIds, projection, kind)
  });
}

function remapPrimarySelectedId(
  selection: SchematicSelectionState,
  nextSelectedIds: string[],
  projection: Pick<SchematicSelectionProjection, "junctionKeys" | "transformBounds">,
  kind: GroupTransformKind
) {
  const primarySelectedId = selection.primarySelectedId;
  if (!primarySelectedId) return null;

  const primaryPoint = junctionPointFromId(primarySelectedId);
  if (!primaryPoint) return primarySelectedId;
  if (!selection.selectedIds.has(primarySelectedId)) return primarySelectedId;
  if (!projection.junctionKeys.has(pointKey(primaryPoint))) return primarySelectedId;

  const nextCellSelection = new Set(nextSelectedIds);
  const bounds = projection.transformBounds;
  if (bounds) {
    const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
    const transformedPrimaryId = junctionId(transformSelectionPoint(primaryPoint, center, kind));
    if (nextCellSelection.has(transformedPrimaryId)) return transformedPrimaryId;
  }

  return nextSelectedIds.find((id) => junctionPointFromId(id) && nextCellSelection.has(id)) ?? null;
}
