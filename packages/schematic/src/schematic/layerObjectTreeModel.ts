import { resolveComponentDef, resolveComponentPinOptions } from "./catalog";
import { isLibraryShapeType } from "./libraryShapeStyleModel";
import { junctionId } from "./junctionIdentity";
import { layerObjectVisible, layerObjectZ, resolveLayerObjects } from "./layerObjectStateModel";
import type { ComponentInstance, SchematicDocument, SchematicLayer } from "./types";

export type SchematicLayerObjectKind =
  | "component"
  | "shape"
  | "pin"
  | "wire"
  | "junction"
  | "label"
  | "note"
  | "coupling";

export interface SchematicLayerObjectNode {
  /** Unique row identity. Pins use a composite identity; other rows use the object id. */
  id: string;
  /** Existing selection target. A pin targets its parent component. */
  targetId: string;
  targetType: "cell" | "note";
  kind: SchematicLayerObjectKind;
  label: string;
  visible: boolean;
  visibilityEditable: boolean;
  displayed: boolean;
  reorderable: boolean;
  children: SchematicLayerObjectNode[];
  temporarilyDeleted: boolean;
}

export interface SchematicLayerObjectGroup {
  layer: SchematicLayer;
  objects: SchematicLayerObjectNode[];
  objectCount: number;
}

interface LayerObjectEntry {
  layerId: string;
  node: SchematicLayerObjectNode;
  z: number;
  sequence: number;
}

export function layerObjectStackIds(
  document: SchematicDocument, projection = resolveLayerObjects(document)
): string[] {
  return buildSchematicLayerObjectTree(document, projection).reverse()
    .flatMap(group => group.objects.reverse().map(object => object.id));
}

function componentNode(document: SchematicDocument, component: ComponentInstance, displayed: boolean): SchematicLayerObjectNode {
  const definition = resolveComponentDef(component);
  const shape = isLibraryShapeType(component.type);
  return {
    id: component.id,
    targetId: component.id,
    targetType: "cell",
    kind: shape ? "shape" : "component",
    label: `${definition.hotLabel} ${component.ref}`,
    visible: layerObjectVisible(document, component.id),
    displayed,
    visibilityEditable: true,
    reorderable: true,
    temporarilyDeleted: component.temporarilyDeleted === true,
    children: resolveComponentPinOptions(component).map((pin) => {
      const visibilityEditable = definition.editablePinVisibility === true
        && (!definition.editablePinVisibilityIds || definition.editablePinVisibilityIds.includes(pin.id));
      return {
        id: `pin:${component.id}:${pin.id}`,
        targetId: component.id,
        targetType: "cell",
        kind: "pin",
        label: `Pin ${pin.label}`,
        visible: definition.pins.some(candidate => candidate.id === pin.id),
        displayed,
        visibilityEditable,
        reorderable: false,
        children: [],
        temporarilyDeleted: false
      };
    })
  };
}

function noteLabel(text: string, id: string) {
  const firstLine = text.trim().split(/\r?\n/, 1)[0] ?? "";
  if (!firstLine) return `Note ${id}`;
  return `Note ${firstLine.length > 48 ? `${firstLine.slice(0, 47)}…` : firstLine}`;
}

/**
 * Projects every durable/derived canvas object into the existing logical layers.
 * The shared layer projection resolves all object membership.
 * Groups and top-level objects are presented top-most first. Pin rows remain
 * attached to their component and do not participate in stacking order.
 */
export function buildSchematicLayerObjectTree(
  document: SchematicDocument, projection = resolveLayerObjects(document)
): SchematicLayerObjectGroup[] {
  const { layers, layerOf, displayed } = projection;
  const entries: LayerObjectEntry[] = [];
  let sequence = 0;
  const add = (node: SchematicLayerObjectNode) => {
    const layerId = layerOf(node.id).id;
    entries.push({ node, layerId, z: layerObjectZ(document, node.id), sequence: sequence++ });
  };
  const topLevel = (
    id: string,
    kind: SchematicLayerObjectKind,
    label: string,
    targetType: "cell" | "note" = "cell",
    temporarilyDeleted = false
  ): SchematicLayerObjectNode => ({
    id,
    targetId: id,
    targetType,
    kind,
    label,
    visible: layerObjectVisible(document, id),
    displayed: displayed(id),
    visibilityEditable: true,
    reorderable: true,
    children: [],
    temporarilyDeleted
  });

  // Default ties preserve the renderer's established bottom-to-top type order.
  (document.inductorCouplings ?? []).forEach((coupling) => {
    add(topLevel(coupling.id, "coupling", `Inductor coupling ${coupling.id}`));
  });
  document.wires.forEach((wire) => {
    add(topLevel(wire.id, "wire", `Wire ${wire.id}`, "cell", wire.temporarilyDeleted === true));
  });
  document.components.forEach((component) => {
    add(componentNode(document, component, displayed(component.id)));
  });
  document.junctions.forEach((point) => {
    const id = junctionId(point);
    add(topLevel(id, "junction", `Junction (${point.x}, ${point.y})`));
  });
  (document.netLabels ?? []).forEach((label) => {
    add(topLevel(label.id, "label", `Label ${label.name}`));
  });
  (document.notes ?? []).forEach((note) => {
    add(topLevel(note.id, "note", noteLabel(note.text, note.id), "note"));
  });

  return [...layers].reverse().map((layer) => {
    const objects = entries
      .filter(entry => entry.layerId === layer.id)
      .sort((first, second) => second.z - first.z || second.sequence - first.sequence)
      .map(entry => entry.node);
    return { layer, objects, objectCount: objects.length };
  });
}
