import type { ComponentDef, ComponentInstance, ComponentType } from "./types";

export type ComponentScale = 0.5 | 1 | 2;
export const COMPONENT_SCALES = [0.5, 1, 2] as const;

export function componentScale(instance: Pick<ComponentInstance, "scale">): ComponentScale {
  return instance.scale ?? 1;
}

export function supportsComponentScale(type: ComponentType, scale: unknown): scale is ComponentScale {
  return COMPONENT_SCALES.some(value => value === scale)
    && (scale !== 0.5 || !["rectangle", "triangle", "polyline", "spntSwitch"].includes(type));
}

export function setComponentScale(instance: ComponentInstance, scale: unknown) {
  if (!supportsComponentScale(instance.type, scale)) return { kind: "noop", reason: "unsupported" } as const;
  if (componentScale(instance) === scale) return { kind: "noop", reason: "unchanged" } as const;
  if (scale === 1) delete instance.scale;
  else instance.scale = scale;
  return { kind: "changed" } as const;
}

/** Catalog geometry stays in design units; resolved geometry uses document units. */
export function scaleComponentDefinition(def: ComponentDef, scale: number): ComponentDef {
  if (scale === 1) return def;
  return {
    ...def,
    geometryScale: (def.geometryScale ?? 1) * scale,
    size: { width: def.size.width * scale, height: def.size.height * scale },
    pins: def.pins.map(pin => ({ ...pin, x: pin.x * scale, y: pin.y * scale })),
    ...(def.bodyPolygon ? { bodyPolygon: def.bodyPolygon.map(point => ({ x: point.x * scale, y: point.y * scale })) } : {}),
    ...(def.bodyPolyline ? { bodyPolyline: def.bodyPolyline.map(point => ({ x: point.x * scale, y: point.y * scale })) } : {})
  };
}
