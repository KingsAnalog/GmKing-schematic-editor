import { buildSchematicLayerObjectTree } from "./layerObjectTreeModel";
import { setLayerObjectZ } from "./layerObjectStateModel";
import type { SchematicContent, SchematicDocument } from "./types";

export function projectLayerAssignment(document: SchematicDocument, selectedIds: ReadonlySet<string>) {
  const groups = buildSchematicLayerObjectTree(document);
  const objects = groups.flatMap(({ layer, objects }) => objects.flatMap(object =>
    selectedIds.has(object.id) && (object.kind === "component" || object.kind === "shape"
      || object.kind === "wire" || object.kind === "label" || object.kind === "note")
      ? [{ id: object.id, layer, displayed: object.displayed }]
      : []
  ));
  return { groups, objects };
}

export function planLayerAssignment(
  document: SchematicDocument, selectedIds: ReadonlySet<string>, targetLayerId: string
) {
  const { groups, objects } = projectLayerAssignment(document, selectedIds);
  const target = groups.find(group => group.layer.id === targetLayerId);
  if (!target || target.layer.locked || objects.some(object => object.layer.locked || !object.displayed)
    || !objects.some(object => object.layer.id !== targetLayerId)) return null;
  const ids = new Set(objects.map(object => object.id));
  const order = [...ids, ...target.objects.filter(object => !ids.has(object.id)).map(object => object.id)];
  return { target: target.layer, ids, z: Object.fromEntries(order.map((id, index) => [id, order.length - index])) };
}

export function applyLayerAssignment(document: SchematicContent, plan: NonNullable<ReturnType<typeof planLayerAssignment>>) {
  document.components.forEach(component => {
    if (plan.ids.has(component.id)) component.values["layer:id"] = plan.target.id;
  });
  for (const objects of [document.wires, document.netLabels, document.notes]) {
    objects.forEach(object => {
      if (plan.ids.has(object.id)) object.layerId = plan.target.id;
    });
  }
  applyLayerObjectMove(document, plan.z);
}

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
