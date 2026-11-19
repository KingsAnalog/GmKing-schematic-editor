export type SchematicLayerId = "wire" | "junction" | "label" | "component" | "pin" | "note" | "shape";

export interface SchematicLayerDefinition {
  id: SchematicLayerId;
  label: string;
}

export const SCHEMATIC_LAYERS: readonly SchematicLayerDefinition[] = [
  { id: "component", label: "Components" },
  { id: "shape", label: "Shapes" },
  { id: "wire", label: "Wires" },
  { id: "junction", label: "Junctions" },
  { id: "label", label: "Net Labels" },
  { id: "pin", label: "Pins" },
  { id: "note", label: "Notes" }
];

export function defaultLayerVisibility(): Record<SchematicLayerId, boolean> {
  return SCHEMATIC_LAYERS.reduce((result, layer) => {
    result[layer.id] = true;
    return result;
  }, {} as Record<SchematicLayerId, boolean>);
}
