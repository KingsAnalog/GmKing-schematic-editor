import { hasUniquePortNames, isPortName } from "../busName";
import { COMPONENT_CATALOG, isValidComponentVariant, resolveComponentDef } from "../catalog";
import { componentSupportsProperty, componentValueIssue } from "../componentValueSchema";
import { connectGeometry } from "../connectionGraph";
import { contentFromDocument, createEmptySchematicContent, documentFromContent } from "../document/documentModel";
import { applyNetLabelPlacementDocumentOp, applyWireCommitDocumentOp } from "../document/documentOps";
import { reconcileDocumentConnectionEdit } from "../document/documentWires";
import { samePoint, transformPin } from "../geometry";
import { nextPortSlot, PORT_SIDES, PORT_TYPES, readSheetPort, sheetPorts, type PortSide, type PortType } from "../hierarchyPins";
import { resolveLayerObjects } from "../layerObjectStateModel";
import { defaultSchematicLayer, normalizeLayers } from "../layers";
import { wireAttachmentAtPoint } from "../netLabelModel";
import { netMembersForPin, netNameForPin, resolveSchematicNets, validateNetLabelName } from "../netResolution";
import { blockFields, canReferenceSheet, projectSheetOrder, refreshProjectSymbols, type SchematicProject } from "../schematicProject";
import { buildPlacedComponent } from "../placementModel";
import { GRID_SIZE, type ComponentInstance, type ComponentType, type ComponentVariantId, type Point, type SchematicDocument } from "../types";

type Fields = Record<string, unknown>;
export interface AgentTransaction {
  requestId: string;
  baseRevision: number;
  dryRun: boolean;
  operations: Fields[];
}

export const AGENT_ACTIONS = {
  "add-component": "{sheetId, component:{type, ref, x, y, id?, rotation?, mirrored?, variantId?, values?}}",
  "add-wire": "{sheetId, points:[{x,y}, ...], id?, variant?:'signal'|'wide'}",
  "add-net-label": "{sheetId, label:{name, point:{x,y}, wireId?, id?}}",
  "set-values": "{sheetId, componentId, values:{propertyKey:string}}",
  "add-sheet": "{id?, name}",
  "add-sheet-instance": "{sheetId, targetSheetId, id?, ref, x, y, rotation?, mirrored?}",
  "set-port": "{sheetId, port:{id?, name, type, direction, order?, x?, y?}} (existing id updates a port; new ports require x and y)",
  "remove-port": "{sheetId, portId}"
};

function fields(value: unknown, description: string): Fields {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${description} must be an object.`);
  return value as Fields;
}

function label(value: unknown, description: string, max = 128) {
  if (typeof value !== "string" || !value || value.length > max || value.trim() !== value || /[\x00-\x1f]/.test(value)) {
    throw new Error(`Invalid ${description}.`);
  }
  return value;
}

function id(value: unknown, description: string) {
  const name = label(value, description);
  if (!/^[A-Za-z0-9_][A-Za-z0-9_.:-]*$/.test(name) || name === "__proto__" || Object.hasOwn(Object.prototype, name)) {
    throw new Error(`Invalid ${description}.`);
  }
  return name;
}

function point(value: unknown): Point {
  const { x, y } = fields(value, "point");
  if (typeof x !== "number" || typeof y !== "number" || !Number.isSafeInteger(x) || !Number.isSafeInteger(y)
    || Math.abs(x) > 1_000_000 || Math.abs(y) > 1_000_000 || x % GRID_SIZE !== 0 || y % GRID_SIZE !== 0) {
    throw new Error(`Coordinates must be on the ${GRID_SIZE}px grid and within ±1000000.`);
  }
  return { x, y };
}

export function readAgentTransaction(value: unknown): AgentTransaction {
  const transaction = fields(value, "transaction");
  if (transaction.apiVersion !== "1.0" || typeof transaction.baseRevision !== "number" ||
    !Number.isSafeInteger(transaction.baseRevision) || transaction.baseRevision < 0 ||
    (transaction.dryRun !== undefined && typeof transaction.dryRun !== "boolean") ||
    !Array.isArray(transaction.operations) || transaction.operations.length < 1 || transaction.operations.length > 500) {
    throw new Error("Expected apiVersion 1.0, baseRevision, optional dryRun, and 1–500 operations.");
  }
  return {
    requestId: id(transaction.requestId, "request ID"),
    baseRevision: transaction.baseRevision,
    dryRun: transaction.dryRun === true,
    operations: transaction.operations.map(operation => fields(operation, "operation"))
  };
}

function createObjectId(value: unknown, project: SchematicProject, createId: () => string) {
  if (value === undefined) return createId();
  const objectId = id(value, "object ID");
  if (project.sheets.some(sheet => sheet.id === objectId || objects(sheet.content).some(item => item.id === objectId))) {
    throw new Error(`Object ID ${objectId} already exists.`);
  }
  return objectId;
}

function refInSheet(document: SchematicDocument, value: unknown) {
  const ref = id(value, "reference");
  if (document.components.some(component => component.type !== "sheetPort" && component.ref.toLowerCase() === ref.toLowerCase())) {
    throw new Error(`Reference ${ref} already exists on this sheet.`);
  }
  return ref;
}

function setValues(component: ComponentInstance, value: unknown) {
  if (component.type === "sheetPort" || component.type === "sheetBlock") throw new Error("Use the hierarchy operations for ports and sheet instances.");
  const valueKey = resolveComponentDef(component).valueKey;
  for (const [key, field] of Object.entries(fields(value, "values"))) {
    if (Object.hasOwn(Object.prototype, key) || key.startsWith("layer:") ||
      (key !== valueKey && !componentSupportsProperty(component, key)) ||
      typeof field !== "string" || field.length > 1024) throw new Error(`Invalid property ${key} for ${component.type}.`);
    component.values[key] = field;
  }
  const issue = componentValueIssue(component);
  if (issue) throw new Error(`Property ${issue.key} requires ${issue.expected}.`);
}

function placement(document: SchematicDocument, input: Fields, type: ComponentType, objectId: string) {
  const { rotation = 0, mirrored = false } = input;
  if (typeof rotation !== "number" || ![0, 90, 180, 270].includes(rotation) || typeof mirrored !== "boolean") {
    throw new Error("Invalid orientation.");
  }
  return buildPlacedComponent(type, point(input), { id: objectId, ref: refInSheet(document, input.ref), rotation, mirrored });
}

function attachComponent(document: SchematicDocument, component: ComponentInstance) {
  requirePlacementLayer(document);
  document.components.push(component);
  connectGeometry(document, { componentIds: new Set([component.id]), wireIds: new Set() });
}

function requirePlacementLayer(document: SchematicDocument) {
  const layer = defaultSchematicLayer(normalizeLayers(document.layers));
  if (layer.locked) throw new Error("The default layer is locked.");
  return layer.id;
}

function setPort(document: SchematicDocument, input: Fields, newId: () => string) {
  const existing = document.components.find(component => component.type === "sheetPort" && component.id === input.id);
  const prior = existing && readSheetPort(existing);
  const others = sheetPorts(document.components).filter(port => port.id !== prior?.id);
  const name = label(input.name ?? prior?.name, "port name");
  const type = (input.type ?? prior?.type) as PortType;
  const direction = (input.direction ?? prior?.direction) as PortSide;
  const order = input.order ?? prior?.order ?? Math.max(-1, ...others.map(port => port.order)) + 1;
  if (!isPortName(name) || !hasUniquePortNames([...others.map(port => port.name), name]) ||
    !PORT_TYPES.includes(type) || !PORT_SIDES.includes(direction) ||
    typeof order !== "number" || !Number.isSafeInteger(order) || order < 0) throw new Error("Invalid or duplicate port.");
  const slot = prior?.direction === direction ? prior.slot : nextPortSlot(others, direction);
  const position = existing && input.x === undefined && input.y === undefined ? existing : point(input);
  const values = { "port:type": type, "port:side": direction, "port:order": String(order), "port:slot": String(slot) };
  if (existing) {
    Object.assign(existing, { x: position.x, y: position.y, ref: name, values: { ...existing.values, ...values } });
    return;
  }
  attachComponent(document, { id: newId(), type: "sheetPort", ref: name,
    x: position.x, y: position.y, rotation: 0, mirrored: false, values });
}

function applyOperation(project: SchematicProject, operation: Fields, createId: () => string) {
  const objectId = (candidate?: unknown) => createObjectId(candidate, project, createId);
  if (operation.op === "add-sheet") {
    const name = label(operation.name, "sheet name");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ||
      project.sheets.some(sheet => sheet.name.toLowerCase() === name.toLowerCase())) throw new Error("Invalid or duplicate sheet name.");
    project.sheets.push({ id: objectId(operation.id), name, content: createEmptySchematicContent() });
    return;
  }
  const sheet = project.sheets.find(item => item.id === operation.sheetId);
  if (!sheet) throw new Error("Unknown sheet.");
  const document = documentFromContent(sheet.content);
  switch (operation.op) {
    case "add-component": {
      const input = fields(operation.component, "component");
      const type = input.type as ComponentType;
      if (typeof type !== "string" || !Object.hasOwn(COMPONENT_CATALOG, type) || type === "sheetBlock" || type === "sheetPort") {
        throw new Error("Unknown component type.");
      }
      const component = placement(document, input, type, objectId(input.id));
      if (input.variantId !== undefined) {
        if (typeof input.variantId !== "string" || !isValidComponentVariant(type, input.variantId as ComponentVariantId)) throw new Error("Invalid component variant.");
        component.variantId = input.variantId as ComponentVariantId;
      }
      if (input.values !== undefined) setValues(component, input.values);
      attachComponent(document, component);
      break;
    }
    case "add-wire": {
      if (!Array.isArray(operation.points) || operation.points.length < 2 || operation.points.length > 512 ||
        (operation.variant !== undefined && operation.variant !== "wide" && operation.variant !== "signal")) throw new Error("Expected a valid wire path and variant.");
      const points = operation.points.map(point);
      if (!points.some(candidate => !samePoint(candidate, points[0]))) throw new Error("Wire endpoints must be distinct.");
      const wireId = objectId(operation.id);
      if (!applyWireCommitDocumentOp(document, points, { variant: operation.variant ?? "signal" }, () => wireId,
        undefined, requirePlacementLayer(document)).committed) {
        throw new Error("The path did not create a wire.");
      }
      break;
    }
    case "add-net-label": {
      const input = fields(operation.label, "label");
      const name = label(input.name, "net name", 256);
      const validation = validateNetLabelName(name);
      if (!validation.valid) throw new Error(validation.message);
      const attachment = wireAttachmentAtPoint(document, point(input.point), input.wireId === undefined ? undefined : id(input.wireId, "wire ID"));
      if (!attachment || (input.wireId !== undefined && attachment.wireId !== input.wireId) ||
        !resolveLayerObjects(document).selectable(attachment.wireId)) throw new Error("No editable wire at the label point.");
      applyNetLabelPlacementDocumentOp(document, { id: objectId(input.id), name, attachment, layerId: requirePlacementLayer(document) });
      break;
    }
    case "set-values": {
      const component = document.components.find(item => item.id === operation.componentId);
      if (!component) throw new Error("Unknown component.");
      if (!resolveLayerObjects(document).selectable(component.id)) throw new Error("The component is hidden or locked.");
      setValues(component, operation.values);
      break;
    }
    case "add-sheet-instance": {
      const target = project.sheets.find(item => item.id === operation.targetSheetId);
      if (!target || !canReferenceSheet(project, sheet.id, target.id)) throw new Error("Unknown target or circular reference.");
      const component = placement(document, operation, "sheetBlock", objectId(operation.id));
      component.values = blockFields(target);
      attachComponent(document, component);
      break;
    }
    case "set-port": {
      const input = fields(operation.port, "port");
      setPort(document, input, () => objectId(input.id));
      break;
    }
    case "remove-port": {
      const index = document.components.findIndex(item => item.type === "sheetPort" && item.id === operation.portId);
      if (index < 0) throw new Error("Unknown port.");
      document.components.splice(index, 1);
      break;
    }
    default: throw new Error("Unknown operation.");
  }
  reconcileDocumentConnectionEdit(document, sheet.content);
  sheet.content = contentFromDocument(document);
  if (operation.op === "set-port" || operation.op === "remove-port") refreshProjectSymbols(project);
}

export class AgentOperationError extends Error {
  constructor(readonly opIndex: number, readonly op: unknown, cause: unknown) {
    super(`operations[${opIndex}] (${typeof op === "string" ? op : "unknown"}): ${cause instanceof Error ? cause.message : "Invalid operation."}`);
  }
}

export function planAgentTransaction(project: SchematicProject, transaction: AgentTransaction, createId: () => string) {
  const draft = structuredClone(project);
  transaction.operations.forEach((operation, index) => {
    try { applyOperation(draft, operation, createId); }
    catch (cause) { throw new AgentOperationError(index, operation.op, cause); }
  });
  projectSheetOrder(draft);
  refreshProjectSymbols(draft);
  return { draft, changes: describeChanges(project, draft) };
}

function objects(content: SchematicProject["sheets"][number]["content"]) {
  return [...content.components, ...content.wires, ...content.netLabels, ...content.notes, ...(content.inductorCouplings ?? [])];
}

function describeChanges(before: SchematicProject, after: SchematicProject) {
  return after.sheets.flatMap(sheet => {
    const original = before.sheets.find(item => item.id === sheet.id);
    const old = new Map(original ? objects(original.content).map(item => [item.id, item]) : []);
    const next = new Map(objects(sheet.content).map(item => [item.id, item]));
    const added = [...next.keys()].filter(id => !old.has(id));
    const removed = [...old.keys()].filter(id => !next.has(id));
    const changed = [...next.keys()].filter(id => old.has(id) && JSON.stringify(old.get(id)) !== JSON.stringify(next.get(id)));
    return !original || added.length || removed.length || changed.length ? [{
      sheetId: sheet.id, sheetAdded: !original, added, removed, changed
    }] : [];
  });
}

export function agentProjectSnapshot(project: SchematicProject, sheetId: string, revision: number) {
  return {
    apiVersion: "1.0", revision, activeSheetId: sheetId,
    project: { id: project.id, name: project.name, topSheetId: project.topSheetId, globalNets: project.globalNets },
    grid: GRID_SIZE, actions: AGENT_ACTIONS,
    catalog: Object.entries(COMPONENT_CATALOG).filter(([type]) => type !== "sheetPort" && type !== "sheetBlock").map(([type, definition]) => ({
      type, name: definition.label, defaults: definition.defaultValues,
      pins: definition.pins.map(({ id, label, x, y }) => ({ id, label, x, y }))
    })),
    sheets: project.sheets.map(sheet => {
      const document = documentFromContent(sheet.content);
      const resolution = resolveSchematicNets(document);
      return {
        id: sheet.id, name: sheet.name, ports: sheetPorts(document.components), wires: document.wires, labels: document.netLabels,
        components: document.components.filter(item => !item.temporarilyDeleted).map(component => ({
          ...component,
          pins: resolveComponentDef(component).pins.map(pin => ({
            id: pin.id, label: pin.label, role: pin.role, point: transformPin(component, pin),
            net: netNameForPin(resolution, component.id, pin.id),
            netMembers: netMembersForPin(resolution, component.id, pin.id)
          }))
        })),
        nets: [...resolution.nets.values()].map(net => ({
          name: net.name, wireIds: net.wireIds, labels: net.labelIds,
          pins: net.pins.map(pin => ({ componentId: pin.componentId, pinId: pin.pinId }))
        }))
      };
    })
  };
}
