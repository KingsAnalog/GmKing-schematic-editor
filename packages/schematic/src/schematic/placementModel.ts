import { getComponentDef } from "./catalog";
import { connectGeometry } from "./connectionGraph";
import { createSchematicDocument } from "./document/documentModel";
import { PREVIEW_COMPONENT_ID } from "./previewIds";
import { instantiateSchematicTemplate, isSchematicTemplateId, type SchematicTemplateId } from "./templates";
import type { ComponentInstance, ComponentType, Point, SchematicDocument } from "./types";

export type PlacementIdFactory = (kind: "component" | "wire", index: number) => string;
export type PlacementRefFactory = (type: ComponentType) => string;

export interface BuildPlacedComponentOptions {
  id: string;
  ref: string;
  rotation: number;
  mirrored: boolean;
}

export interface BuildPlacementPreviewOptions {
  rotation: number;
  mirrored: boolean;
}

export interface BuildTemplatePlacementOptions {
  createId: PlacementIdFactory;
  nextRef: PlacementRefFactory;
}

export interface BuildPlacementCommitOptions extends BuildTemplatePlacementOptions {
  rotation: number;
  mirrored: boolean;
}

export interface PlacementCommit {
  fragment: SchematicDocument;
  selectedIds: string[];
  status: string;
}

export function applyPlacementCommitToDocument(document: SchematicDocument, commit: PlacementCommit) {
  document.components.push(...commit.fragment.components);
  document.wires.push(...commit.fragment.wires);
  connectGeometry(document, {
    wireIds: new Set(commit.fragment.wires.map(wire => wire.id)),
    componentIds: new Set(commit.fragment.components.map(component => component.id))
  });
}

export function buildPlacedComponent(type: ComponentType, point: Point, options: BuildPlacedComponentOptions): ComponentInstance {
  const def = getComponentDef(type);
  const values = { ...(def.defaultValues ?? {}) };
  if (def.valueKey === "main") values.main = options.ref;
  return {
    id: options.id,
    type,
    variantId: def.defaultVariantId,
    ref: options.ref,
    x: point.x,
    y: point.y,
    rotation: options.rotation,
    mirrored: options.mirrored,
    values
  };
}

function buildPlacementPreviewComponent(type: ComponentType, point: Point, options: BuildPlacementPreviewOptions): ComponentInstance {
  const def = getComponentDef(type);
  return {
    id: PREVIEW_COMPONENT_ID,
    type,
    variantId: def.defaultVariantId,
    ref: def.hotLabel,
    x: point.x,
    y: point.y,
    rotation: options.rotation,
    mirrored: options.mirrored,
    values: { ...(def.defaultValues ?? {}) }
  };
}

export function buildTemplatePlacement(templateId: SchematicTemplateId, point: Point, options: BuildTemplatePlacementOptions): SchematicDocument {
  return instantiateSchematicTemplate(templateId, point, {
    createId: options.createId,
    nextRef: options.nextRef
  });
}

export function buildPlacementCommit(item: ComponentType | SchematicTemplateId, point: Point, options: BuildPlacementCommitOptions): PlacementCommit {
  if (isSchematicTemplateId(item)) {
    const fragment = buildTemplatePlacement(item, point, {
      createId: options.createId,
      nextRef: options.nextRef
    });
    return {
      fragment,
      selectedIds: [...fragment.components.map((component) => component.id), ...fragment.wires.map((wire) => wire.id)],
      status: `${item} placed as ${fragment.components.length} components and ${fragment.wires.length} wires.`
    };
  }

  const def = getComponentDef(item);
  const ref = options.nextRef(item);
  const component = buildPlacedComponent(item, point, {
    id: options.createId("component", 0),
    ref,
    rotation: options.rotation,
    mirrored: options.mirrored
  });
  return {
    fragment: createSchematicDocument({ components: [component] }),
    selectedIds: [component.id],
    status: `${component.ref} placed. Continue moving and clicking to place more ${def.hotLabel} instances.`
  };
}

function buildTemplatePlacementPreviewFragment(templateId: SchematicTemplateId, point: Point): SchematicDocument {
  return instantiateSchematicTemplate(templateId, point, {
    createId: (kind, index) => `preview-template-${kind}-${index}`,
    nextRef: (type) => getComponentDef(type).hotLabel
  });
}

export function buildPlacementPreviewFragment(item: ComponentType | SchematicTemplateId, point: Point, options: BuildPlacementPreviewOptions): SchematicDocument {
  if (isSchematicTemplateId(item)) return buildTemplatePlacementPreviewFragment(item, point);
  return createSchematicDocument({
    components: [buildPlacementPreviewComponent(item, point, options)],
  });
}
