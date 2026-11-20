import { normalizeLayers } from "./layers";
import type {
  SchematicContent,
  SchematicLayerObjectState,
  SchematicLayerObjectStates
} from "./types";

type LayerObjectStateContent = Pick<SchematicContent, "components" | "layers" | "layerObjectStates">;

export function normalizeLayerObjectStates(
  states: SchematicLayerObjectStates | undefined
): SchematicLayerObjectStates | undefined {
  if (!states) return undefined;
  const normalized: SchematicLayerObjectStates = {};
  Object.entries(states).forEach(([id, state]) => {
    if (!id || !state) return;
    const next: SchematicLayerObjectState = {};
    if (state.visible === false) next.visible = false;
    if (typeof state.z === "number" && Number.isFinite(state.z)) next.z = state.z;
    if (Object.keys(next).length > 0) normalized[id] = next;
  });
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function layerObjectZ(document: LayerObjectStateContent, id: string) {
  const stored = document.layerObjectStates?.[id]?.z;
  if (typeof stored === "number" && Number.isFinite(stored)) return stored;
  const component = document.components.find(candidate => candidate.id === id);
  const legacy = Number(component?.values["layer:z"] ?? 0);
  return Number.isFinite(legacy) ? legacy : 0;
}

export function layerObjectVisible(document: LayerObjectStateContent, id: string) {
  return document.layerObjectStates?.[id]?.visible !== false;
}

export function layerObjectDisplayed(document: LayerObjectStateContent, id: string) {
  if (!layerObjectVisible(document, id)) return false;
  const layers = normalizeLayers(document.layers);
  const component = document.components.find(candidate => candidate.id === id);
  const layerId = component?.values["layer:id"] ?? layers[0]?.id ?? "layer-1";
  return layers.find(layer => layer.id === layerId)?.visible !== false;
}

export function setLayerObjectVisible(
  document: Pick<SchematicContent, "layerObjectStates">,
  id: string,
  visible: boolean
) {
  const current = document.layerObjectStates?.[id];
  if ((current?.visible !== false) === visible) return false;
  const states = { ...document.layerObjectStates };
  const next = { ...current };
  if (visible) delete next.visible;
  else next.visible = false;
  updateState(states, id, next);
  document.layerObjectStates = Object.keys(states).length > 0 ? states : undefined;
  return true;
}

export function setLayerObjectZ(
  document: Pick<SchematicContent, "layerObjectStates">,
  id: string,
  z: number
) {
  if (!Number.isFinite(z)) return false;
  const states = { ...document.layerObjectStates };
  const next = { ...states[id], z };
  updateState(states, id, next);
  document.layerObjectStates = states;
  return true;
}

function updateState(
  states: SchematicLayerObjectStates,
  id: string,
  state: SchematicLayerObjectState
) {
  if (Object.keys(state).length > 0) states[id] = state;
  else delete states[id];
}
