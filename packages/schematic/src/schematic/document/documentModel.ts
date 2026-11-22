import { getComponentDef, isValidComponentVariant, resolveComponentDef } from "../catalog";
import { DEFAULT_SYMBOL_TEMPLATE, resolveSymbolTemplate } from "../symbolTemplateModel";
import { isProcessId } from "../netlist/profiles";
import { applyNormalizedDocumentWires } from "./documentWires";
import { cloneConnections, emptyConnections, connectGeometry } from "../connectionGraph";
import { normalizeMarkdownNoteWidth } from "../notes/noteSizing";
import { defaultLayers } from "../layers";
import { normalizeLayerObjectStates } from "../layerObjectStateModel";
import { snapPoint } from "../geometry";
import {
  deriveSchematicTopology,
  type SchematicDerivedTopology
} from "../topology";
import { DEFAULT_COMPONENT_COLOR } from "../componentPropertyModel";
import { normalizeHexColor } from "../../shared/color";
import { normalizeJunctionAppearances, normalizeWireColors } from "../networkColorModel";
import {
  rectangleSettings,
  rectangleSettingsValues
} from "../rectangleComponentModel";
import {
  isTransistorComponentType,
  TRANSISTOR_CIRCLE_VALUE_KEY
} from "../transistorCircleModel";
import {
  normalizeInductorCouplings,
  normalizeInductorValues
} from "../inductorCouplingModel";
import type {
  NetLabel,
  SchematicContent,
  SchematicDocument,
  SchematicNote
} from "../types";

export function createEmptySchematicDocument(): SchematicDocument {
  return {
    symbolTemplate: DEFAULT_SYMBOL_TEMPLATE,
    components: [],
    wires: [],
    junctions: [],
    connections: emptyConnections(),
    junctionAppearances: [],
    netLabels: [],
    notes: [],
    layers: defaultLayers()
  };
}

export function createEmptySchematicContent(): SchematicContent {
  return contentFromDocument(createEmptySchematicDocument());
}

/** Author a new circuit from geometry. Loading saved content never calls this. */
export function createSchematicDocument(input: Partial<Omit<SchematicDocument, "connections" | "junctions">> = {}): SchematicDocument {
  const document = { ...createEmptySchematicDocument(), ...structuredClone(input) };
  document.symbolTemplate = resolveSymbolTemplate(document.symbolTemplate).id;
  document.components.forEach(component => Object.assign(component, snapPoint(component)));
  document.wires.forEach(wire => { wire.points = wire.points.map(point => snapPoint(point)); });
  connectGeometry(document, {
    wireIds: new Set(document.wires.map(wire => wire.id)),
    componentIds: new Set(document.components.map(component => component.id))
  });
  return document;
}

export function isEmptySchematicDocument(document: SchematicDocument) {
  return (
    document.components.length === 0
    && document.wires.length === 0
    && document.junctions.length === 0
    && document.junctionAppearances.length === 0
    && document.netLabels.length === 0
    && document.notes.length === 0
  );
}

export function cloneSchematicDocument(document: SchematicDocument): SchematicDocument {
  return JSON.parse(JSON.stringify(document)) as SchematicDocument;
}

export function contentFromDocument(document: SchematicDocument): SchematicContent {
  const snapshot = cloneSchematicDocument(document);
  const couplings = snapshot.inductorCouplings ?? [];
  const layerObjectStates = normalizeLayerObjectStates(snapshot.layerObjectStates);
  return {
    symbolTemplate: resolveSymbolTemplate(snapshot.symbolTemplate).id,
    ...(snapshot.display ? { display: snapshot.display } : {}),
    ...(snapshot.netlistProcess && isProcessId(snapshot.netlistProcess) ? { netlistProcess: snapshot.netlistProcess } : {}),
    components: snapshot.components,
    wires: snapshot.wires,
    connections: snapshot.connections,
    ...(couplings.length > 0 ? { inductorCouplings: couplings } : {}),
    junctionAppearances: snapshot.junctionAppearances,
    netLabels: snapshot.netLabels,
    notes: snapshot.notes,
    layers: snapshot.layers ?? defaultLayers(),
    ...(layerObjectStates ? { layerObjectStates } : {})
  };
}

export function normalizeSchematicContent(content: SchematicContent): SchematicContent {
  return contentFromDocument(restoreSchematicDocument({
    ...structuredClone(content),
    junctions: []
  }));
}

export function materializeSchematicDocument(
  content: SchematicContent,
  topology?: SchematicDerivedTopology
): SchematicDocument {
  const normalized = normalizeSchematicContent(content);
  const derived = topology ?? deriveSchematicTopology(normalized);
  return {
    ...normalized,
    junctions: derived.junctions.map((point) => ({ ...point }))
  };
}

export function documentFromContent(content: SchematicContent): SchematicDocument {
  return materializeSchematicDocument(content);
}

export function restoreSchematicDocument(document: SchematicDocument): SchematicDocument {
  const restored = cloneSchematicDocument(document);
  restored.symbolTemplate = resolveSymbolTemplate(restored.symbolTemplate).id;
  restored.junctionAppearances = normalizeJunctionAppearances(restored.junctionAppearances);
  restored.netLabels = restored.netLabels.map(normalizeNetLabel);
  restored.notes = restored.notes.map(normalizeSchematicNote);
  restored.layerObjectStates = normalizeLayerObjectStates(restored.layerObjectStates);
  normalizeComponentValues(restored);
  normalizeComponentVariants(restored);
  normalizeComponentAppearances(restored);
  normalizeInductorCouplings(restored);
  normalizeWireColors(restored);
  applyNormalizedDocumentWires(restored);
  return restored;
}

export function assignRestoredSchematicDocument(target: SchematicDocument, source: SchematicDocument) {
  target.symbolTemplate = resolveSymbolTemplate(source.symbolTemplate).id;
  target.display = source.display && { ...source.display };
  target.netlistProcess = source.netlistProcess;
  target.components = source.components;
  target.wires = source.wires;
  target.connections = cloneConnections(source.connections);
  target.inductorCouplings = source.inductorCouplings;
  target.junctions = source.junctions;
  target.junctionAppearances = normalizeJunctionAppearances(source.junctionAppearances);
  target.netLabels = source.netLabels.map(normalizeNetLabel);
  target.notes = source.notes.map(normalizeSchematicNote);
  target.layers = (source.layers ?? defaultLayers()).map(layer => ({ ...layer }));
  target.layerObjectStates = normalizeLayerObjectStates(source.layerObjectStates);
  normalizeComponentValues(target);
  normalizeComponentVariants(target);
  normalizeComponentAppearances(target);
  normalizeInductorCouplings(target);
  normalizeWireColors(target);
  applyNormalizedDocumentWires(target);
}

function normalizeNetLabel(label: NetLabel): NetLabel {
  return {
    id: String(label.id),
    ...(label.layerId === undefined ? {} : { layerId: label.layerId }),
    ...(label.fontFamily === undefined ? {} : { fontFamily: label.fontFamily }),
    name: String(label.name),
    attachment: {
      wireId: String(label.attachment.wireId),
      point: snapPoint(label.attachment.point)
    }
  };
}

export function rebuildComponentRefCounters(document: SchematicDocument) {
  const counters = new Map<string, number>();
  document.components.forEach((component) => {
    const def = resolveComponentDef(component);
    const prefix = def.valuePrefix ?? def.label;
    const suffix = Number.parseInt(component.ref.replace(prefix, ""), 10);
    if (Number.isFinite(suffix)) {
      counters.set(prefix, Math.max(counters.get(prefix) ?? 0, suffix));
    }
  });
  return counters;
}

function normalizeComponentVariants(document: SchematicDocument) {
  document.components.forEach((component) => {
    const def = getComponentDef(component.type);
    if (!def.variants?.length) {
      delete component.variantId;
      return;
    }
    if (!component.variantId || !isValidComponentVariant(component.type, component.variantId)) {
      component.variantId = def.defaultVariantId ?? def.variants[0].id;
    }
  });
}

function normalizeComponentValues(document: SchematicDocument) {
  document.components.forEach((component) => {
    component.values = { ...component.values };
    normalizeInductorValues(component);
    if (component.type === "rectangle") {
      Object.assign(component.values, rectangleSettingsValues(rectangleSettings(component)));
    }
    if (component.type === "rectangle" || component.type === "triangle") {
      // Pure outlines never retain legacy electrical-pin or invisible-label state.
      Object.keys(component.values).forEach(key => {
        if (key === "labelVisible"
          || key === "valueVisible"
          || key.startsWith("rectanglePinCount:")
          || key.startsWith("trianglePinCount:")
          || key.startsWith("pinVisible:")
          || key.startsWith("pinSymbolVisible:")
          || key.startsWith("pinMode:")) {
          delete component.values[key];
        }
      });
    }
    if (
      !isTransistorComponentType(component.type)
      || component.values[TRANSISTOR_CIRCLE_VALUE_KEY] !== "true"
    ) {
      delete component.values[TRANSISTOR_CIRCLE_VALUE_KEY];
    }
  });
}

function normalizeComponentAppearances(document: SchematicDocument) {
  document.components.forEach((component) => {
    const color = normalizeHexColor(component.appearance?.color);
    if (!color || color === DEFAULT_COMPONENT_COLOR) {
      delete component.appearance;
      return;
    }
    component.appearance = { color };
  });
}

function normalizeSchematicNote(note: SchematicNote): SchematicNote {
  return {
    ...note,
    width: note.format === "markdown" ? normalizeMarkdownNoteWidth(note.width) : note.width
  };
}
