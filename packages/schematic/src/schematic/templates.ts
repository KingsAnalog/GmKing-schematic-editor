import { getComponentDef } from "./catalog";
import { createSchematicDocument } from "./document/documentModel";
import { DEFAULT_MOS_VIEW_VARIANT_ID } from "./mosViewModel";
import { snapPoint } from "./geometry";
import type { ComponentInstance, ComponentType, Point, SchematicDocument, Wire, WireAppearance } from "./types";
import { componentVisualBounds, unionRects, wireVisualBounds } from "./view-geometry";

export type SchematicTemplateId = "common_source_nmos" | "inverter_mos" | "flipped_amp_diff";

export interface TemplateComponentSpec {
  type: ComponentType;
  x: number;
  y: number;
  rotation?: number;
  mirrored?: boolean;
  variantId?: string;
}

export interface TemplateWireSpec {
  points: Point[];
  appearance?: WireAppearance;
}

export interface SchematicTemplateDef {
  id: SchematicTemplateId;
  components: TemplateComponentSpec[];
  wires: TemplateWireSpec[];
}

export const SCHEMATIC_TEMPLATE_ORDER: SchematicTemplateId[] = ["common_source_nmos", "inverter_mos", "flipped_amp_diff"];

export const SCHEMATIC_TEMPLATES: Record<SchematicTemplateId, SchematicTemplateDef> = {
  common_source_nmos: {
    id: "common_source_nmos",
    components: [
      { type: "resistor", x: 0, y: -40, rotation: 90 },
      { type: "nmos", x: 0, y: 40, variantId: DEFAULT_MOS_VIEW_VARIANT_ID },
      { type: "gnd", x: 0, y: 100 }
    ],
    wires: []
  },
  inverter_mos: {
    id: "inverter_mos",
    components: [
      { type: "pmos", x: 0, y: -40, variantId: DEFAULT_MOS_VIEW_VARIANT_ID },
      { type: "nmos", x: 0, y: 40, variantId: DEFAULT_MOS_VIEW_VARIANT_ID },
      { type: "gnd", x: 0, y: 100 }
    ],
    wires: [
      { points: [{ x: -40, y: -40 }, { x: -40, y: 40 }] },
      { points: [{ x: -80, y: 0 }, { x: -40, y: 0 }] },
      { points: [{ x: 0, y: 0 }, { x: 60, y: 0 }] }
    ]
  },
  flipped_amp_diff: {
    id: "flipped_amp_diff",
    components: [
      { type: "diffAmp", x: 120, y: 0 },
      { type: "capacitor", x: 120, y: -120 },
      { type: "capacitor", x: 120, y: 120 },
      { type: "switch", x: 120, y: -180 },
      { type: "switch", x: 120, y: 180 }
    ],
    wires: [
      { points: [{ x: 40, y: -40 }, { x: 40, y: -120 }] },
      { points: [{ x: 40, y: -120 }, { x: 80, y: -120 }] },
      { points: [{ x: 160, y: -120 }, { x: 180, y: -120 }] },
      { points: [{ x: 180, y: -120 }, { x: 180, y: -40 }] },
      { points: [{ x: 80, y: -180 }, { x: 80, y: -120 }] },
      { points: [{ x: 160, y: -180 }, { x: 160, y: -120 }] },
      { points: [{ x: 40, y: 40 }, { x: 40, y: 120 }] },
      { points: [{ x: 40, y: 120 }, { x: 80, y: 120 }] },
      { points: [{ x: 160, y: 120 }, { x: 180, y: 120 }] },
      { points: [{ x: 180, y: 120 }, { x: 180, y: 40 }] },
      { points: [{ x: 80, y: 180 }, { x: 80, y: 120 }] },
      { points: [{ x: 160, y: 180 }, { x: 160, y: 120 }] }
    ]
  }
};

export function isSchematicTemplateId(value: string | undefined): value is SchematicTemplateId {
  return !!value && SCHEMATIC_TEMPLATE_ORDER.includes(value as SchematicTemplateId);
}

export function getSchematicTemplateDef(id: SchematicTemplateId) {
  return SCHEMATIC_TEMPLATES[id];
}

export function schematicTemplateBounds(template: SchematicTemplateDef) {
  return (
    unionRects([
      ...template.components.map((component, index) =>
        componentVisualBounds({
          id: `template-component-${index}`,
          type: component.type,
          variantId: component.variantId,
          ref: getComponentDef(component.type).hotLabel,
          x: component.x,
          y: component.y,
          rotation: component.rotation ?? 0,
          mirrored: component.mirrored ?? false,
          values: {}
        })
      ),
      ...template.wires.map((wire, index) =>
        wireVisualBounds({
          id: `template-wire-${index}`,
          points: wire.points,
          routeMode: "orthogonal",
          appearance: wire.appearance
        })
      )
    ]) ?? { x: 0, y: 0, width: 0, height: 0 }
  );
}

export function instantiateSchematicTemplate(
  id: SchematicTemplateId,
  anchor: Point,
  options: {
    createId: (kind: "component" | "wire", index: number) => string;
    nextRef: (type: ComponentType) => string;
  }
): SchematicDocument {
  const template = getSchematicTemplateDef(id);
  const bounds = schematicTemplateBounds(template);
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const delta = snapPoint({ x: anchor.x - center.x, y: anchor.y - center.y });
  const translate = (point: Point) => snapPoint({ x: point.x + delta.x, y: point.y + delta.y });
  const components = template.components.map((component, index): ComponentInstance => {
    const def = getComponentDef(component.type);
    const ref = options.nextRef(component.type);
    const values = { ...(def.defaultValues ?? {}) };
    if (def.valueKey === "main") values.main = ref;
    return {
      id: options.createId("component", index),
      type: component.type,
      variantId: component.variantId ?? def.defaultVariantId,
      ref,
      x: translate(component).x,
      y: translate(component).y,
      rotation: component.rotation ?? 0,
      mirrored: component.mirrored ?? false,
      values
    };
  });
  const wires = template.wires.map((wire, index): Wire => ({
    id: options.createId("wire", index),
    points: wire.points.map(translate),
    routeMode: "orthogonal",
    appearance: wire.appearance ? { ...wire.appearance } : undefined
  }));
  return createSchematicDocument({ components, wires });
}
