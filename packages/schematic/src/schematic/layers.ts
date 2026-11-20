import type { SchematicLayer } from "./types";

export type { SchematicLayer };

export const DEFAULT_LAYER_ID = "layer-1";

export function defaultLayers(): SchematicLayer[] {
  return [{ id: DEFAULT_LAYER_ID, name: "Layer 1", visible: true, locked: false }];
}

export function normalizeLayers(layers: readonly SchematicLayer[] | undefined): SchematicLayer[] {
  const source = layers?.length ? layers : defaultLayers();
  const seen = new Set<string>();
  return source.map((layer, index) => {
    const id = layer.id && !seen.has(layer.id) ? layer.id : `layer-${index + 1}`;
    seen.add(id);
    return {
      id,
      name: layer.name?.trim() || `Layer ${index + 1}`,
      visible: layer.visible !== false,
      locked: layer.locked === true
    };
  });
}

/** Ties implicit assignments to a stable layer ID regardless of display order. */
export function defaultSchematicLayer(layers: readonly SchematicLayer[]): SchematicLayer {
  return layers.find(layer => layer.id === DEFAULT_LAYER_ID)
    ?? layers.reduce((first, layer) => layer.id < first.id ? layer : first, layers[0]);
}

export function nextLayerId(layers: readonly SchematicLayer[]) {
  const ids = new Set(layers.map(layer => layer.id));
  let index = layers.length + 1;
  while (ids.has(`layer-${index}`)) index += 1;
  return `layer-${index}`;
}
