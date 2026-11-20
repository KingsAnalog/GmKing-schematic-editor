import { buildConnectivity, type ConnectivityResult } from "./connectivity";
import { junctionPointFromId } from "./junctionIdentity";
import { defaultSchematicLayer, normalizeLayers } from "./layers";
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

/** Resolves ownership and effective visibility for one document projection. */
export function resolveLayerObjects(
  document: SchematicContent,
  junctionMembers?: ConnectivityResult["junctionMembers"]
) {
  const layers = normalizeLayers(document.layers);
  const fallback = defaultSchematicLayer(layers);
  const byId = new Map(layers.map(layer => [layer.id, layer]));
  const order = new Map(layers.map((layer, index) => [layer.id, index]));
  const assignments = new Map<string, string | undefined>();
  document.components.forEach(component => assignments.set(component.id, component.values["layer:id"]));
  for (const objects of [document.wires, document.netLabels, document.notes]) {
    objects.forEach(object => assignments.set(object.id, object.layerId));
  }
  document.inductorCouplings?.forEach(coupling => assignments.set(coupling.id, undefined));

  const assignedLayer = (id: string) => byId.get(assignments.get(id) ?? "") ?? fallback;
  const assignedVisible = (id: string) => layerObjectVisible(document, id) && assignedLayer(id).visible;
  const membersFor = (id: string) => {
    if (assignments.has(id) || !junctionPointFromId(id)) return undefined;
    junctionMembers ??= buildConnectivity(document).junctionMembers;
    return junctionMembers.get(id);
  };
  const orderOf = (layerId: string) => order.get(layerId) ?? -1;
  const layerOf = (id: string) => {
    const members = membersFor(id);
    if (!members?.size) return assignedLayer(id);
    // A junction is stacked with its topmost visible conductor.
    const visible = [...members].filter(assignedVisible);
    return (visible.length ? visible : [...members]).map(assignedLayer)
      .reduce((highest, layer) => orderOf(layer.id) > orderOf(highest.id) ? layer : highest);
  };
  const displayed = (id: string) => {
    const members = membersFor(id);
    return members?.size
      ? layerObjectVisible(document, id) && [...members].some(assignedVisible)
      : assignedVisible(id);
  };
  const selectable = (id: string) => displayed(id) && !layerOf(id).locked;
  return { layers, layerOf, displayed, selectable };
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
