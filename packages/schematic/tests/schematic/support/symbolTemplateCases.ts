import { COMPONENT_CATALOG, getComponentVariants } from "../../../src/schematic/catalog";
import type { ComponentInstance, ComponentType } from "../../../src/schematic/types";

/** Shared visual-regression matrix; excludes document metadata and host state. */
export function symbolTemplateCases(type: ComponentType): ComponentInstance[] {
  const definition = COMPONENT_CATALOG[type];
  const variants = getComponentVariants(type);
  return (variants.length ? variants.map(variant => variant.id) : [undefined]).flatMap(variantId =>
    [0, 90, 180, 270].flatMap(rotation => [false, true].flatMap(mirrored => [false, true].map(detailed => ({
      id: `baseline-${type}`, type, ref: `${definition.valuePrefix ?? "X"}1`,
      variantId, x: 200, y: 200, rotation, mirrored,
      values: { ...definition.defaultValues, ...(detailed ? {
        labelVisible: "true", valueVisible: "true",
        ...(["nmos", "pmos"].includes(type) ? { mosThickGate: "true", transistorCircle: "true" } : {})
      } : {}) }
    }))))
  );
}
