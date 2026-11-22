import { resolveComponentDef } from "./catalog";
import { hasUniquePortNames, netMembers } from "./busName";
import { connectionIdFactory } from "./connectionGraph";
import { contentFromDocument, createEmptySchematicContent } from "./document/documentModel";
import { samePoint, transformPin } from "./geometry";
import { blockPorts, PORT_IDENTIFIER, sheetPorts, type SheetPort } from "./hierarchyPins";
import { createSchematicFile, parseSchematicContent, SCHEMATIC_FILE_FORMAT } from "./schematicDocumentCodec";
import type { ComponentInstance, SchematicContent, SchematicDocument } from "./types";

export const SCHEMATIC_PROJECT_FORMAT = "analog-tools/schematic-project";
export interface SchematicSheet {
  id: string;
  name: string;
  content: SchematicContent;
}
export interface SchematicProject {
  format: typeof SCHEMATIC_PROJECT_FORMAT;
  version: 2;
  id: string;
  name: string;
  topSheetId: string;
  globalNets: string[];
  sheets: SchematicSheet[];
  testbenches: [];
}

export function singleSheetProject(id: string, name: string, document?: SchematicDocument): SchematicProject {
  const sheet: SchematicSheet = { id: "top", name: "top", content: document ? contentFromDocument(document) : createEmptySchematicContent() };
  return { format: SCHEMATIC_PROJECT_FORMAT, version: 2, id, name, topSheetId: sheet.id,
    globalNets: ["0"], sheets: [sheet], testbenches: [] };
}

export function isProjectFile(value: unknown) {
  return typeof value === "object" && value !== null && (value as Record<string, unknown>).format === SCHEMATIC_PROJECT_FORMAT;
}

export function blockTarget(block: ComponentInstance) {
  return block.type === "sheetBlock" ? block.values["sheet:target"] : undefined;
}

export function canReferenceSheet(project: SchematicProject, parent: string, target: string) {
  const sheets = new Map(project.sheets.map(sheet => [sheet.id, sheet]));
  if (!sheets.has(parent) || !sheets.has(target)) return false;
  const seen = new Set<string>();
  const pending = [target];
  while (pending.length) {
    const id = pending.pop()!;
    if (id === parent) return false;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const instance of sheets.get(id)?.content.components ?? []) {
      const next = blockTarget(instance);
      if (next) pending.push(next);
    }
  }
  return true;
}

/** Returns dependencies before callers and reports the offending instance for malformed imports. */
export function projectSheetOrder(project: SchematicProject) {
  const byId = new Map(project.sheets.map(sheet => [sheet.id, sheet]));
  const visiting = new Set<string>(), done = new Set<string>(), result: SchematicSheet[] = [];
  const visit = (sheet: SchematicSheet) => {
    if (done.has(sheet.id)) return;
    visiting.add(sheet.id);
    for (const component of sheet.content.components) {
      const targetId = blockTarget(component);
      if (!targetId) continue;
      const target = byId.get(targetId);
      const location = `${sheet.name} / ${component.ref}`;
      if (!target) throw new Error(`MISSING_SHEET: ${location} references ${targetId}.`);
      if (visiting.has(targetId)) throw new Error(`CYCLE: ${location} references ${target.name}.`);
      visit(target);
    }
    visiting.delete(sheet.id);
    done.add(sheet.id);
    result.push(sheet);
  };
  project.sheets.filter(sheet => sheet.id !== project.topSheetId).forEach(visit);
  const top = byId.get(project.topSheetId);
  if (!top) throw new Error("The project Top sheet is missing.");
  visit(top);
  return result;
}

export function blockFields(sheet: SchematicSheet): Record<string, string> {
  return { "sheet:target": sheet.id, "sheet:name": sheet.name, "sheet:ports": JSON.stringify(sheetPorts(sheet.content.components)) };
}

/** Refreshes per-instance pin projections without editing any parent wire vertices or node bindings. */
export function refreshProjectSymbols(project: SchematicProject) {
  const byId = new Map(project.sheets.map(sheet => [sheet.id, sheet]));
  for (const { content } of project.sheets) {
    const fresh = connectionIdFactory(content.connections);
    for (const instance of content.components) {
      const target = instance.type === "sheetBlock" ? byId.get(blockTarget(instance) ?? "") : undefined;
      if (!target) continue;
      const fields = blockFields(target);
      if (Object.entries(fields).every(([key, value]) => instance.values[key] === value)) continue;
      const priorWidths = new Map(blockPorts(instance).map(port => [port.id, netMembers(port.name).length]));
      const previous = new Map(resolveComponentDef(instance).pins.map(pin => [pin.id, transformPin(instance, pin)]));
      const bindings = content.connections.pins[instance.id] ?? {};
      Object.assign(instance.values, fields);
      const currentPorts = new Map(blockPorts(instance).map(port => [port.id, port]));
      content.connections.pins[instance.id] = Object.fromEntries(resolveComponentDef(instance).pins.map(pin => {
        const old = previous.get(pin.id);
        const currentPort = currentPorts.get(pin.id);
        const unchanged = old && samePoint(old, transformPin(instance, pin)) &&
          currentPort && priorWidths.get(pin.id) === netMembers(currentPort.name).length;
        return [pin.id, (unchanged && bindings[pin.id]) || fresh()];
      }));
    }
  }
}

export function serializeSchematicProject(project: SchematicProject) {
  return JSON.stringify({ ...project, sheets: project.sheets.map(sheet => ({
    id: sheet.id, name: sheet.name, ports: sheetPorts(sheet.content.components),
    content: createSchematicFile(sheet.content).schematic
  })) }, null, 2) + "\n";
}

export function decodeSchematicProject(value: unknown): SchematicProject {
  if (!isProjectFile(value)) throw new Error("This file is not a schematic project.");
  const source = value as SchematicProject;
  if (source.version !== 2 || typeof source.id !== "string" || !source.id
    || typeof source.name !== "string" || !source.name.trim() || source.name.length > 128
    || !Array.isArray(source.globalNets) || !source.globalNets.includes("0")
    || source.globalNets.some(net => typeof net !== "string" || (net !== "0" && !PORT_IDENTIFIER.test(net)))
    || !Array.isArray(source.testbenches) || source.testbenches.length !== 0 || !Array.isArray(source.sheets)) {
    throw new Error("Unsupported or invalid schematic project.");
  }
  const ids = new Set<string>(), names = new Set<string>();
  const sheets = source.sheets.map((sheet: SchematicSheet & { ports?: SheetPort[] }) => {
    if (!sheet || typeof sheet.id !== "string" || !sheet.id || ids.has(sheet.id)
      || typeof sheet.name !== "string" || !PORT_IDENTIFIER.test(sheet.name) || names.has(sheet.name.toLowerCase())) {
      throw new Error("A project requires unique sheet IDs and valid, unique sheet names.");
    }
    ids.add(sheet.id);
    names.add(sheet.name.toLowerCase());
    const content = parseSchematicContent(JSON.stringify({ format: SCHEMATIC_FILE_FORMAT, schematic: sheet.content }));
    const ports = sheetPorts(content.components);
    if (!hasUniquePortNames(ports.map(port => port.name))
      || new Set(ports.map(port => port.order)).size !== ports.length
      || new Set(ports.map(port => `${port.direction}:${port.slot}`)).size !== ports.length) {
      throw new Error(`${sheet.name} has duplicate pin names, positions or indices.`);
    }
    if (sheet.ports !== undefined && (!Array.isArray(sheet.ports) || sheet.ports.length !== ports.length ||
      ports.some((port, index) => {
        const declared = sheet.ports![index];
        return !declared || declared.id !== port.id || declared.name !== port.name || declared.type !== port.type ||
          declared.direction !== port.direction || declared.order !== port.order || declared.slot !== port.slot;
      }))) {
      throw new Error(`${sheet.name} has an inconsistent port list.`);
    }
    for (const block of content.components.filter(component => component.type === "sheetBlock")) {
      if (new Set(blockPorts(block).map(port => port.id)).size !== blockPorts(block).length) {
        throw new Error(`${sheet.name} / ${block.ref} has duplicate pins.`);
      }
    }
    return { id: sheet.id, name: sheet.name, content };
  });
  const project: SchematicProject = { format: SCHEMATIC_PROJECT_FORMAT, version: 2,
    id: source.id, name: source.name, topSheetId: source.topSheetId, globalNets: [...new Set(source.globalNets)], sheets, testbenches: [] };
  projectSheetOrder(project);
  refreshProjectSymbols(project);
  return project;
}
