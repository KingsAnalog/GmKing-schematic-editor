import { buildSchematicLayerObjectTree } from "./layerObjectTreeModel";
import { setLayerObjectZ } from "./layerObjectStateModel";
import type { SchematicContent, SchematicDocument } from "./types";

export type LayerObjectMoveDirection = "up" | "down";

/** Plans one adjacent move in the top-most-first Objects panel. */
export function planLayerObjectMove(
  document: SchematicDocument,
  layerId: string,
  objectId: string,
  direction: LayerObjectMoveDirection
): Record<string, number> | null {
  const objects = buildSchematicLayerObjectTree(document)
    .find(group => group.layer.id === layerId)?.objects;
  if (!objects) return null;
  const index = objects.findIndex(object => object.id === objectId);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= objects.length) return null;

  const reordered = [...objects];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  return Object.fromEntries(reordered.map((object, index) => [object.id, reordered.length - index]));
}

export function applyLayerObjectMove(
  document: SchematicContent,
  plan: Readonly<Record<string, number>>
) {
  Object.entries(plan).forEach(([id, z]) => setLayerObjectZ(document, id, z));
}
