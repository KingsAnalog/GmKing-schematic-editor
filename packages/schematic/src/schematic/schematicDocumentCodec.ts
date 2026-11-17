import { supportsComponentScale } from "./componentScaleModel";
import stringify from "json-stringify-pretty-compact";
import { resolveSymbolTemplate } from "./symbolTemplateModel";
import { COMPONENT_CATALOG, isValidComponentVariant, resolveComponentDef } from "./catalog";
import { cloneConnections } from "./connectionGraph";
import { pointKey, snapPoint, transformPin } from "./geometry";
import { componentValueIssue } from "./componentValueSchema";
import {
  contentFromDocument,
  documentFromContent,
  restoreSchematicDocument
} from "./document/documentModel";
import { normalizeWirePath } from "./wire/wireGeometry";
import { isHexColor } from "../shared/color";
import type {
  ComponentAppearance,
  ComponentInstance,
  ComponentType,
  InductorCoupling,
  JunctionAppearance,
  NetLabel,
  Point,
  SchematicContent,
  SchematicConnections,
  SchematicDocument,
  SchematicNote,
  Wire,
  WireAppearance
} from "./types";

export const SCHEMATIC_FILE_FORMAT = "adc-helper/schematic";
export const SCHEMATIC_FILE_MIME = "application/json";
export const MAX_SCHEMATIC_FILE_BYTES = 20 * 1024 * 1024;

const DEFAULT_SCHEMATIC_FILENAME_STEM = "schematic";
const DEFAULT_IMPORTED_SCHEMATIC_TITLE = "Imported schematic";
const SCHEMATIC_JSON_INDENT = 2;
const SCHEMATIC_JSON_SCHEMATIC_FIELD_INDENT = " ".repeat(SCHEMATIC_JSON_INDENT * 2);
const SCHEMATIC_JSON_ITEM_INDENT = " ".repeat(SCHEMATIC_JSON_INDENT * 3);
const SCHEMATIC_JSON_ITEM_FIELD_INDENT = " ".repeat(SCHEMATIC_JSON_INDENT * 4);
const ENVELOPE_KEYS = ["format", "schematic"] as const;
const SCHEMATIC_KEYS = [
  "symbolTemplate",
  "components",
  "wires",
  "inductorCouplings",
  "connections",
  "junctionAppearances",
  "netLabels",
  "notes"
] as const;

export type SchematicDocumentFileSource = {
  readonly [Key in keyof SchematicContent]: Readonly<SchematicContent[Key]>;
} & {
  readonly junctions?: readonly Point[];
};

export interface SchematicFile {
  format: typeof SCHEMATIC_FILE_FORMAT;
  schematic: SchematicContent;
}

export type SchematicDocumentFileErrorCode =
  | "file-too-large"
  | "invalid-json"
  | "invalid-format"
  | "invalid-schema";

export class SchematicDocumentFileError extends Error {
  constructor(
    public readonly code: SchematicDocumentFileErrorCode,
    message: string
  ) {
    super(message);
    this.name = "SchematicDocumentFileError";
  }
}

export function createSchematicFile(document: SchematicDocumentFileSource): SchematicFile {
  const inductorCouplings = document.inductorCouplings ?? [];
  return {
    format: SCHEMATIC_FILE_FORMAT,
    schematic: {
      symbolTemplate: resolveSymbolTemplate(document.symbolTemplate).id,
      components: document.components.map(snapshotComponent),
      wires: document.wires.map(snapshotWire),
      ...(inductorCouplings.length > 0
        ? { inductorCouplings: inductorCouplings.map(snapshotInductorCoupling) }
        : {}),
      connections: cloneConnections(document.connections),
      junctionAppearances: document.junctionAppearances.map(snapshotJunctionAppearance),
      netLabels: document.netLabels.map(snapshotNetLabel),
      notes: document.notes.map(snapshotNote)
    }
  };
}

export function serializeSchematicDocumentFile(document: SchematicDocumentFileSource) {
  const file = createSchematicFile(document);
  normalizeDecodedSchematicContent(decodeSchematicFile(file));
  const source = `${formatSchematicFileJson(file)}\n`;
  assertSchematicDocumentFileSize(utf8ByteLength(source));
  return source;
}

export function serializeSchematicContent(content: SchematicContent) {
  return serializeSchematicDocumentFile(content);
}

function formatSchematicFileJson(file: SchematicFile) {
  return [
    "{",
    `  "format": ${JSON.stringify(file.format)},`,
    '  "schematic": {',
    `    "symbolTemplate": ${JSON.stringify(file.schematic.symbolTemplate)},`,
    ...formatSchematicComponents(file.schematic.components),
    ...formatSchematicWires(file.schematic.wires),
    ...(file.schematic.inductorCouplings
      ? [formatInlineSchematicCollection("inductorCouplings", file.schematic.inductorCouplings, true)]
      : []),
    `    "connections": ${stringifyInline(file.schematic.connections)},`,
    formatInlineSchematicCollection("junctionAppearances", file.schematic.junctionAppearances, true),
    formatInlineSchematicCollection("netLabels", file.schematic.netLabels, true),
    ...formatSchematicNotes(file.schematic.notes),
    "  }",
    "}"
  ].join("\n");
}

function formatSchematicComponents(components: readonly ComponentInstance[]) {
  if (components.length === 0) {
    return [`${SCHEMATIC_JSON_SCHEMATIC_FIELD_INDENT}"components": [],`];
  }
  return [
    `${SCHEMATIC_JSON_SCHEMATIC_FIELD_INDENT}"components": [`,
    ...components.flatMap((component, index) =>
      formatSchematicComponent(component, index < components.length - 1)
    ),
    `${SCHEMATIC_JSON_SCHEMATIC_FIELD_INDENT}],`
  ];
}

function formatSchematicComponent(component: ComponentInstance, trailingComma: boolean) {
  const suffix = trailingComma ? "," : "";
  const primaryFields = [
    `"type": ${JSON.stringify(component.type)}`,
    `"ref": ${JSON.stringify(component.ref)}`,
    `"x": ${JSON.stringify(component.x)}`,
    `"y": ${JSON.stringify(component.y)}`,
    `"rotation": ${JSON.stringify(component.rotation)}`,
    `"mirrored": ${JSON.stringify(component.mirrored)}`,
    ...(component.variantId !== undefined
      ? [`"variantId": ${JSON.stringify(component.variantId)}`]
      : []),
    ...(component.scale !== undefined ? [`"scale": ${component.scale}`] : []),
    ...(component.appearance !== undefined
      ? [`"appearance": ${stringifyInline(component.appearance)}`]
      : []),
    ...(component.temporarilyDeleted !== undefined
      ? [`"temporarilyDeleted": ${JSON.stringify(component.temporarilyDeleted)}`]
      : []),
    `"id": ${JSON.stringify(component.id)}`
  ];

  if (component.variantId !== undefined) {
    return [
      `${SCHEMATIC_JSON_ITEM_INDENT}{`,
      `${SCHEMATIC_JSON_ITEM_FIELD_INDENT}${primaryFields.join(", ")},`,
      `${SCHEMATIC_JSON_ITEM_FIELD_INDENT}"values": ${stringifyInline(component.values)}`,
      `${SCHEMATIC_JSON_ITEM_INDENT}}${suffix}`
    ];
  }
  return [
    `${SCHEMATIC_JSON_ITEM_INDENT}{${primaryFields.join(", ")},`,
    `${SCHEMATIC_JSON_ITEM_FIELD_INDENT}"values": ${stringifyInline(component.values)}}${suffix}`
  ];
}

function formatSchematicWires(wires: readonly Wire[]) {
  if (wires.length === 0) {
    return [`${SCHEMATIC_JSON_SCHEMATIC_FIELD_INDENT}"wires": [],`];
  }
  return [
    `${SCHEMATIC_JSON_SCHEMATIC_FIELD_INDENT}"wires": [`,
    ...wires.flatMap((wire, index) => {
      const fields = [
        `"points": ${stringifyInline(wire.points)}`,
        `"routeMode": ${JSON.stringify(wire.routeMode)}`,
        ...(wire.appearance !== undefined
          ? [`"appearance": ${stringifyInline(wire.appearance)}`]
          : []),
        ...(wire.temporarilyDeleted !== undefined
          ? [`"temporarilyDeleted": ${JSON.stringify(wire.temporarilyDeleted)}`]
          : []),
        `"id": ${JSON.stringify(wire.id)}`
      ];
      return [
        `${SCHEMATIC_JSON_ITEM_INDENT}{${fields.join(", ")}}${index < wires.length - 1 ? "," : ""}`
      ];
    }),
    `${SCHEMATIC_JSON_SCHEMATIC_FIELD_INDENT}],`
  ];
}

function formatInlineSchematicCollection(key: string, value: unknown, trailingComma: boolean) {
  return `${SCHEMATIC_JSON_SCHEMATIC_FIELD_INDENT}"${key}": ${stringifyInline(value)}${trailingComma ? "," : ""}`;
}

function formatSchematicNotes(notes: readonly SchematicNote[]) {
  if (notes.length === 0) {
    return [`${SCHEMATIC_JSON_SCHEMATIC_FIELD_INDENT}"notes": []`];
  }
  return [
    `${SCHEMATIC_JSON_SCHEMATIC_FIELD_INDENT}"notes": [`,
    ...notes.flatMap((note, index) => {
      const metadataFields = [
        `"x": ${JSON.stringify(note.x)}`,
        `"y": ${JSON.stringify(note.y)}`,
        `"width": ${JSON.stringify(note.width)}`,
        ...(note.height !== undefined ? [`"height": ${JSON.stringify(note.height)}`] : []),
        ...(note.rotation !== undefined ? [`"rotation": ${JSON.stringify(note.rotation)}`] : []),
        `"format": ${JSON.stringify(note.format)}`,
        ...(note.backgroundColor !== undefined
          ? [`"backgroundColor": ${JSON.stringify(note.backgroundColor)}`]
          : []),
        ...(note.textColor !== undefined ? [`"textColor": ${JSON.stringify(note.textColor)}`] : []),
        ...(note.fontSizePx !== undefined
          ? [`"fontSizePx": ${JSON.stringify(note.fontSizePx)}`]
          : []),
        `"id": ${JSON.stringify(note.id)}`
      ];
      return [
        `${SCHEMATIC_JSON_ITEM_INDENT}{${metadataFields.join(", ")},`,
        `${SCHEMATIC_JSON_ITEM_FIELD_INDENT}"text": ${JSON.stringify(note.text)}}${index < notes.length - 1 ? "," : ""}`
      ];
    }),
    `${SCHEMATIC_JSON_SCHEMATIC_FIELD_INDENT}]`
  ];
}

function stringifyInline(value: unknown) {
  return stringify(value, { indent: 0 });
}

export function parseSchematicContent(source: string): SchematicContent {
  assertSchematicDocumentFileSize(utf8ByteLength(source));
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new SchematicDocumentFileError("invalid-json", "The schematic file is not valid JSON.");
  }

  const schematic = decodeSchematicFile(value);
  return normalizeDecodedSchematicContent(schematic);
}

/** Parses durable content and materializes the runtime document shape. */
export function parseSchematicDocumentFile(source: string): SchematicDocument {
  return documentFromContent(parseSchematicContent(source));
}

function normalizeDecodedSchematicContent(schematic: SchematicContent) {
  const restored = restoreSchematicDocument({ ...schematic, junctions: [] });
  assertValidLabelAttachments(restored.netLabels, restored.wires);
  assertUniqueObjectIds(restored);
  return contentFromDocument(restored);
}

export function schematicDocumentFilename(title: string) {
  const withoutSuffix = title.trim().replace(/\.sch\.json$/i, "");
  let stem = withoutSuffix
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^[ .-]+|[ .-]+$/g, "");
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = `_${stem}`;
  if (!stem) stem = DEFAULT_SCHEMATIC_FILENAME_STEM;
  return `${stem}.sch.json`;
}

export function schematicDocumentTitleFromFilename(filename: string) {
  const basename = filename.split(/[\\/]/).pop()?.trim() ?? "";
  const title = basename.replace(/\.sch\.json$/i, "").trim();
  return title || DEFAULT_IMPORTED_SCHEMATIC_TITLE;
}

function decodeSchematicFile(value: unknown): SchematicContent {
  const envelope = requireObject(value, "$");
  requireExactKeys(envelope, ENVELOPE_KEYS, "$");
  if (envelope.format !== SCHEMATIC_FILE_FORMAT) {
    throw new SchematicDocumentFileError(
      "invalid-format",
      `Expected schematic file format "${SCHEMATIC_FILE_FORMAT}".`
    );
  }
  const source = requireObject(envelope.schematic, "$.schematic");
  requireExactKeys(source, SCHEMATIC_KEYS, "$.schematic", ["inductorCouplings", "symbolTemplate"]);
  let symbolTemplate;
  try {
    symbolTemplate = resolveSymbolTemplate(source.symbolTemplate).id;
  } catch (error) {
    throw new SchematicDocumentFileError("invalid-schema", `$.schematic.symbolTemplate: ${(error as Error).message}`);
  }
  const components = requireArray(source.components, "$.schematic.components")
    .map((component, index) => decodeComponent(component, `$.schematic.components[${index}]`));
  const wires = requireArray(source.wires, "$.schematic.wires")
    .map((wire, index) => decodeWire(wire, `$.schematic.wires[${index}]`));
  const inductorCouplings = hasOwn(source, "inductorCouplings")
    ? requireArray(source.inductorCouplings, "$.schematic.inductorCouplings")
        .map((coupling, index) => decodeInductorCoupling(
          coupling,
          `$.schematic.inductorCouplings[${index}]`
        ))
    : [];
  const connections = decodeConnections(source.connections, wires, components);
  const junctionAppearances = requireArray(source.junctionAppearances, "$.schematic.junctionAppearances")
    .map((appearance, index) => decodeJunctionAppearance(
      appearance,
      `$.schematic.junctionAppearances[${index}]`
    ));
  const netLabels = requireArray(source.netLabels, "$.schematic.netLabels")
    .map((label, index) => decodeNetLabel(label, `$.schematic.netLabels[${index}]`));
  const notes = requireArray(source.notes, "$.schematic.notes")
    .map((note, index) => decodeNote(note, `$.schematic.notes[${index}]`));

  assertUniqueObjectIds({ components, wires, inductorCouplings, netLabels, notes });
  assertValidInductorCouplings(inductorCouplings, components);
  assertValidLabelAttachments(netLabels, wires);
  return {
    symbolTemplate,
    components,
    wires,
    connections,
    ...(inductorCouplings.length > 0 ? { inductorCouplings } : {}),
    junctionAppearances,
    netLabels,
    notes
  };
}

function decodeComponent(value: unknown, path: string): ComponentInstance {
  const source = requireObject(value, path);
  requireExactKeys(
    source,
    ["id", "type", "variantId", "scale", "ref", "x", "y", "rotation", "mirrored", "values", "appearance", "temporarilyDeleted"],
    path,
    ["variantId", "scale", "appearance", "temporarilyDeleted"]
  );
  const type = requireComponentType(source.type, `${path}.type`);
  const variantId = optionalString(source, "variantId", path);
  if (!isValidComponentVariant(type, variantId)) {
    invalid(`${path}.variantId`, `known ${type} component variant`);
  }
  const rotation = requireEnum(source.rotation, [0, 90, 180, 270] as const, `${path}.rotation`);
  const values = decodeComponentValues(source.values, `${path}.values`);
  const component: ComponentInstance = {
    id: requireNonEmptyString(source.id, `${path}.id`),
    type,
    ...(variantId !== undefined ? { variantId } : {}),
    ref: requireNonEmptyString(source.ref, `${path}.ref`),
    x: requireFiniteNumber(source.x, `${path}.x`),
    y: requireFiniteNumber(source.y, `${path}.y`),
    rotation,
    mirrored: requireBoolean(source.mirrored, `${path}.mirrored`),
    values
  };
  if (hasOwn(source, "scale")) {
    if (!supportsComponentScale(type, source.scale)) invalid(`${path}.scale`, "a supported component size (0.5, 1 or 2)");
    component.scale = source.scale as ComponentInstance["scale"];
  }
  validateComponentValueEnums(component, path);
  if (hasOwn(source, "appearance")) {
    component.appearance = decodeComponentAppearance(source.appearance, `${path}.appearance`);
  }
  if (hasOwn(source, "temporarilyDeleted")) {
    component.temporarilyDeleted = requireBoolean(source.temporarilyDeleted, `${path}.temporarilyDeleted`);
  }
  return component;
}

function decodeComponentValues(value: unknown, path: string) {
  const source = requireObject(value, path);
  const values: Record<string, string> = {};
  Object.entries(source).forEach(([key, item]) => {
    if (!key || key === "__proto__" || key === "prototype" || key === "constructor") {
      invalid(path, "safe, non-empty component value keys");
    }
    values[key] = requireString(item, `${path}.${key}`);
  });
  return values;
}

function validateComponentValueEnums(component: ComponentInstance, path: string) {
  const issue = componentValueIssue(component);
  if (issue) invalid(`${path}.values.${issue.key}`, issue.expected);
}

function decodeComponentAppearance(value: unknown, path: string): ComponentAppearance {
  const source = requireObject(value, path);
  requireExactKeys(source, ["color"], path, ["color"]);
  return hasOwn(source, "color")
    ? { color: requireColor(source.color, `${path}.color`) }
    : {};
}

function decodeConnections(value: unknown, wires: Wire[], components: ComponentInstance[]): SchematicConnections {
  const path = "$.schematic.connections";
  const source = requireObject(value, path);
  requireExactKeys(source, ["wires", "pins"], path);
  const wireBindings = requireObject(source.wires, `${path}.wires`);
  const pinBindings = requireObject(source.pins, `${path}.pins`);
  requireExactKeys(wireBindings, wires.map(wire => wire.id), `${path}.wires`);
  requireExactKeys(pinBindings, components.map(component => component.id), `${path}.pins`);
  const positions = new Map<string, string>();
  const nodeAt = (value: unknown, point: Point, at: string) => {
    const id = requireNonEmptyString(value, at), key = pointKey(snapPoint(point));
    const previous = positions.get(id);
    if (previous !== undefined && previous !== key) invalid(at, "a connection node whose endpoints occupy the same grid position");
    positions.set(id, key);
    return id;
  };
  const graph: SchematicConnections = {
    wires: Object.fromEntries(wires.map(wire => {
      const at = `${path}.wires.${wire.id}`;
      const nodes = requireArray(wireBindings[wire.id], at);
      if (nodes.length !== wire.points.length) invalid(at, "one connection node per wire vertex");
      return [wire.id, nodes.map((node, index) => nodeAt(node, wire.points[index], `${at}[${index}]`))];
    })),
    pins: Object.fromEntries(components.map(component => {
      const at = `${path}.pins.${component.id}`;
      const bindings = requireObject(pinBindings[component.id], at);
      const pins = resolveComponentDef(component).pins;
      requireExactKeys(bindings, pins.map(pin => pin.id), at);
      return [component.id, Object.fromEntries(pins.map(pin => [pin.id, nodeAt(bindings[pin.id], transformPin(component, pin), `${at}.${pin.id}`)]))];
    }))
  };
  return graph;
}

function decodeWire(value: unknown, path: string): Wire {
  const source = requireObject(value, path);
  requireExactKeys(
    source,
    ["id", "points", "routeMode", "appearance", "temporarilyDeleted"],
    path,
    ["appearance", "temporarilyDeleted"]
  );
  const points = requireArray(source.points, `${path}.points`)
    .map((point, index) => decodePoint(point, `${path}.points[${index}]`));
  if (points.length < 2) invalid(`${path}.points`, "at least two finite points");
  if (normalizeWirePath(points).length < 2) {
    invalid(`${path}.points`, "at least two distinct grid-normalized points");
  }
  const routeMode = requireEnum(
    source.routeMode,
    ["orthogonal", "freeAngle"] as const,
    `${path}.routeMode`
  );
  if (
    routeMode === "orthogonal" &&
    points.slice(1).some((point, index) => point.x !== points[index].x && point.y !== points[index].y)
  ) {
    invalid(`${path}.points`, "an orthogonal path");
  }

  const wire: Wire = {
    id: requireNonEmptyString(source.id, `${path}.id`),
    points,
    routeMode
  };
  if (hasOwn(source, "appearance")) wire.appearance = decodeWireAppearance(source.appearance, `${path}.appearance`);
  if (hasOwn(source, "temporarilyDeleted")) {
    wire.temporarilyDeleted = requireBoolean(source.temporarilyDeleted, `${path}.temporarilyDeleted`);
  }
  return wire;
}

function decodeWireAppearance(value: unknown, path: string): WireAppearance {
  const source = requireObject(value, path);
  requireExactKeys(
    source,
    ["variant", "color", "lineWidth", "startMarker", "endMarker", "digitalSlash", "digitalLabel"],
    path,
    ["color", "lineWidth", "startMarker", "endMarker", "digitalSlash", "digitalLabel"]
  );
  return {
    variant: requireEnum(source.variant, ["signal", "wide"] as const, `${path}.variant`),
    ...(hasOwn(source, "color") ? { color: requireColor(source.color, `${path}.color`) } : {}),
    ...(hasOwn(source, "lineWidth")
      ? { lineWidth: requireEnum(source.lineWidth, ["a", "2a"] as const, `${path}.lineWidth`) }
      : {}),
    ...(hasOwn(source, "startMarker")
      ? {
          startMarker: requireEnum(
            source.startMarker,
            ["default", "arrow", "circle"] as const,
            `${path}.startMarker`
          )
        }
      : {}),
    ...(hasOwn(source, "endMarker")
      ? {
          endMarker: requireEnum(
            source.endMarker,
            ["default", "arrow", "circle"] as const,
            `${path}.endMarker`
          )
        }
      : {}),
    ...(hasOwn(source, "digitalSlash")
      ? { digitalSlash: requireBoolean(source.digitalSlash, `${path}.digitalSlash`) }
      : {}),
    ...(hasOwn(source, "digitalLabel")
      ? { digitalLabel: requireString(source.digitalLabel, `${path}.digitalLabel`) }
      : {})
  };
}

function decodeInductorCoupling(value: unknown, path: string): InductorCoupling {
  const source = requireObject(value, path);
  requireExactKeys(source, [
    "id",
    "inductorAId",
    "inductorBId",
    "coefficient",
    "coefficientAuto",
    "labelMode",
    "showLabel",
    "showArc",
    "showCore",
    "arcFlipped",
    "appearance"
  ], path, ["appearance"]);
  const labelMode = requireEnum(
    source.labelMode,
    ["coefficient", "ratio"] as const,
    `${path}.labelMode`
  );
  const coupling: InductorCoupling = {
    id: requireNonEmptyString(source.id, `${path}.id`),
    inductorAId: requireNonEmptyString(source.inductorAId, `${path}.inductorAId`),
    inductorBId: requireNonEmptyString(source.inductorBId, `${path}.inductorBId`),
    coefficient: requireNonEmptyString(source.coefficient, `${path}.coefficient`),
    coefficientAuto: requireBoolean(source.coefficientAuto, `${path}.coefficientAuto`),
    labelMode,
    showLabel: requireBoolean(source.showLabel, `${path}.showLabel`),
    showArc: requireBoolean(source.showArc, `${path}.showArc`),
    showCore: requireBoolean(source.showCore, `${path}.showCore`),
    arcFlipped: requireBoolean(source.arcFlipped, `${path}.arcFlipped`)
  };
  if (hasOwn(source, "appearance")) {
    coupling.appearance = decodeComponentAppearance(source.appearance, `${path}.appearance`);
  }
  return coupling;
}

function decodeJunctionAppearance(value: unknown, path: string): JunctionAppearance {
  const source = requireObject(value, path);
  requireExactKeys(source, ["point", "color"], path);
  return {
    point: decodePoint(source.point, `${path}.point`),
    color: requireColor(source.color, `${path}.color`)
  };
}

function decodeNetLabel(value: unknown, path: string): NetLabel {
  const source = requireObject(value, path);
  requireExactKeys(source, ["id", "name", "attachment"], path);
  const attachment = requireObject(source.attachment, `${path}.attachment`);
  requireExactKeys(attachment, ["wireId", "point"], `${path}.attachment`);
  return {
    id: requireNonEmptyString(source.id, `${path}.id`),
    name: requireNonEmptyString(source.name, `${path}.name`),
    attachment: {
      wireId: requireString(attachment.wireId, `${path}.attachment.wireId`),
      point: decodePoint(attachment.point, `${path}.attachment.point`)
    }
  };
}

function decodeNote(value: unknown, path: string): SchematicNote {
  const source = requireObject(value, path);
  requireExactKeys(
    source,
    ["id", "x", "y", "width", "height", "rotation", "format", "text", "backgroundColor", "textColor", "fontSizePx"],
    path,
    ["height", "rotation", "backgroundColor", "textColor", "fontSizePx"]
  );
  const width = requireFiniteNumber(source.width, `${path}.width`);
  if (width <= 0) invalid(`${path}.width`, "a positive finite number");
  const note: SchematicNote = {
    id: requireNonEmptyString(source.id, `${path}.id`),
    x: requireFiniteNumber(source.x, `${path}.x`),
    y: requireFiniteNumber(source.y, `${path}.y`),
    width,
    format: requireEnum(source.format, ["plain", "markdown"] as const, `${path}.format`),
    text: requireString(source.text, `${path}.text`)
  };
  if (hasOwn(source, "height")) {
    const height = requireFiniteNumber(source.height, `${path}.height`);
    if (height <= 0) invalid(`${path}.height`, "a positive finite number");
    note.height = height;
  }
  if (hasOwn(source, "backgroundColor")) {
    note.backgroundColor = source.backgroundColor === null
      ? null
      : requireColor(source.backgroundColor, `${path}.backgroundColor`);
  }
  if (hasOwn(source, "textColor")) note.textColor = requireColor(source.textColor, `${path}.textColor`);
  if (hasOwn(source, "fontSizePx")) {
    const fontSizePx = requireFiniteNumber(source.fontSizePx, `${path}.fontSizePx`);
    if (fontSizePx <= 0) invalid(`${path}.fontSizePx`, "a positive finite number");
    note.fontSizePx = fontSizePx;
  }
  if (hasOwn(source, "rotation")) {
    const rotation = requireFiniteNumber(source.rotation, `${path}.rotation`);
    if (![0, 90, 180, 270].includes(rotation)) invalid(`${path}.rotation`, "0, 90, 180 or 270");
    note.rotation = rotation as SchematicNote["rotation"];
  }
  return note;
}

function decodePoint(value: unknown, path: string): Point {
  const source = requireObject(value, path);
  requireExactKeys(source, ["x", "y"], path);
  return {
    x: requireFiniteNumber(source.x, `${path}.x`),
    y: requireFiniteNumber(source.y, `${path}.y`)
  };
}

function assertUniqueObjectIds(
  collections: Pick<SchematicContent, "components" | "wires" | "inductorCouplings" | "netLabels" | "notes">
) {
  const ids = new Set<string>();
  [
    ...collections.components,
    ...collections.wires,
    ...(collections.inductorCouplings ?? []),
    ...collections.netLabels,
    ...collections.notes
  ].forEach((item) => {
    if (ids.has(item.id)) invalid("$.schematic", `globally unique object IDs; duplicate "${item.id}"`);
    ids.add(item.id);
  });
}

function assertValidInductorCouplings(
  couplings: readonly InductorCoupling[],
  components: readonly ComponentInstance[]
) {
  const inductorIds = new Set(
    components.filter((component) => component.type === "inductor").map((component) => component.id)
  );
  const pairs = new Set<string>();
  couplings.forEach((coupling) => {
    if (
      coupling.inductorAId === coupling.inductorBId
      || !inductorIds.has(coupling.inductorAId)
      || !inductorIds.has(coupling.inductorBId)
    ) {
      invalid(`inductor coupling "${coupling.id}"`, "two different existing inductor IDs");
    }
    const pair = [coupling.inductorAId, coupling.inductorBId].sort().join("\u0000");
    if (pairs.has(pair)) invalid(`inductor coupling "${coupling.id}"`, "a unique inductor pair");
    pairs.add(pair);
  });
}

function assertValidLabelAttachments(labels: readonly NetLabel[], wires: readonly Wire[]) {
  const wiresById = new Map(wires.map((wire) => [wire.id, wire]));
  labels.forEach((label) => {
    if (!label.attachment.wireId) return;
    const wire = wiresById.get(label.attachment.wireId);
    if (!wire) invalid(`net label "${label.id}"`, `attachment to an existing wire`);
    const attached = wire.points.slice(1).some((point, index) =>
      pointOnFiniteSegment(label.attachment.point, wire.points[index], point)
    );
    if (!attached) invalid(`net label "${label.id}"`, `attachment point on wire "${wire.id}"`);
  });
}

function pointOnFiniteSegment(point: Point, start: Point, end: Point) {
  let dx = end.x - start.x;
  let dy = end.y - start.y;
  let px = point.x - start.x;
  let py = point.y - start.y;
  if (![dx, dy, px, py].every(Number.isFinite)) {
    const coordinateScale = Math.max(
      Math.abs(point.x),
      Math.abs(point.y),
      Math.abs(start.x),
      Math.abs(start.y),
      Math.abs(end.x),
      Math.abs(end.y)
    );
    dx = end.x / coordinateScale - start.x / coordinateScale;
    dy = end.y / coordinateScale - start.y / coordinateScale;
    px = point.x / coordinateScale - start.x / coordinateScale;
    py = point.y / coordinateScale - start.y / coordinateScale;
  } else {
    const deltaScale = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(px), Math.abs(py));
    if (deltaScale > 0) {
      dx /= deltaScale;
      dy /= deltaScale;
      px /= deltaScale;
      py /= deltaScale;
    }
  }
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return point.x === start.x && point.y === start.y;
  const cross = px * dy - py * dx;
  const segmentLength = Math.sqrt(lengthSquared);
  const pointLength = Math.hypot(px, py);
  const crossTolerance = Number.EPSILON * 32 * segmentLength * Math.max(segmentLength, pointLength);
  if (Math.abs(cross) > crossTolerance) return false;
  const projection = px * dx + py * dy;
  const projectionTolerance = Number.EPSILON * 32 * Math.max(lengthSquared, Math.abs(projection));
  return projection >= -projectionTolerance && projection <= lengthSquared + projectionTolerance;
}

function snapshotComponent(component: ComponentInstance): ComponentInstance {
  return {
    id: component.id,
    type: component.type,
    ...(component.variantId !== undefined ? { variantId: component.variantId } : {}),
    ...(component.scale !== undefined ? { scale: component.scale } : {}),
    ref: component.ref,
    x: component.x,
    y: component.y,
    rotation: component.rotation,
    mirrored: component.mirrored,
    values: { ...component.values },
    ...(component.appearance !== undefined
      ? { appearance: snapshotComponentAppearance(component.appearance) }
      : {}),
    ...(component.temporarilyDeleted !== undefined
      ? { temporarilyDeleted: component.temporarilyDeleted }
      : {})
  };
}

function snapshotWire(wire: Wire): Wire {
  return {
    id: wire.id,
    points: wire.points.map(snapshotPoint),
    routeMode: wire.routeMode,
    ...(wire.appearance !== undefined
      ? { appearance: snapshotWireAppearance(wire.appearance) }
      : {}),
    ...(wire.temporarilyDeleted !== undefined
      ? { temporarilyDeleted: wire.temporarilyDeleted }
      : {})
  };
}

function snapshotInductorCoupling(coupling: InductorCoupling): InductorCoupling {
  return {
    id: coupling.id,
    inductorAId: coupling.inductorAId,
    inductorBId: coupling.inductorBId,
    coefficient: coupling.coefficient,
    coefficientAuto: coupling.coefficientAuto,
    labelMode: coupling.labelMode,
    showLabel: coupling.showLabel,
    showArc: coupling.showArc,
    showCore: coupling.showCore,
    arcFlipped: coupling.arcFlipped,
    ...(coupling.appearance !== undefined
      ? { appearance: snapshotComponentAppearance(coupling.appearance) }
      : {})
  };
}

function snapshotComponentAppearance(appearance: ComponentAppearance): ComponentAppearance {
  return appearance.color !== undefined ? { color: appearance.color } : {};
}

function snapshotWireAppearance(appearance: WireAppearance): WireAppearance {
  return {
    variant: appearance.variant,
    ...(appearance.color !== undefined ? { color: appearance.color } : {}),
    ...(appearance.lineWidth !== undefined ? { lineWidth: appearance.lineWidth } : {}),
    ...(appearance.startMarker !== undefined ? { startMarker: appearance.startMarker } : {}),
    ...(appearance.endMarker !== undefined ? { endMarker: appearance.endMarker } : {}),
    ...(appearance.digitalSlash !== undefined ? { digitalSlash: appearance.digitalSlash } : {}),
    ...(appearance.digitalLabel !== undefined ? { digitalLabel: appearance.digitalLabel } : {})
  };
}

function snapshotJunctionAppearance(appearance: JunctionAppearance): JunctionAppearance {
  return { point: snapshotPoint(appearance.point), color: appearance.color };
}

function snapshotNetLabel(label: NetLabel): NetLabel {
  return {
    id: label.id,
    name: label.name,
    attachment: {
      wireId: label.attachment.wireId,
      point: snapshotPoint(label.attachment.point)
    }
  };
}

function snapshotNote(note: SchematicNote): SchematicNote {
  return {
    id: note.id,
    x: note.x,
    y: note.y,
    width: note.width,
    ...(note.height !== undefined ? { height: note.height } : {}),
    ...(note.rotation !== undefined ? { rotation: note.rotation } : {}),
    format: note.format,
    text: note.text,
    ...(note.backgroundColor !== undefined ? { backgroundColor: note.backgroundColor } : {}),
    ...(note.textColor !== undefined ? { textColor: note.textColor } : {}),
    ...(note.fontSizePx !== undefined ? { fontSizePx: note.fontSizePx } : {})
  };
}

function snapshotPoint(point: Point): Point {
  return { x: point.x, y: point.y };
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid(path, "an object");
  return value as Record<string, unknown>;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) invalid(path, "an array");
  return value;
}

function requireExactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  optional: readonly string[] = []
) {
  const allowedSet = new Set(allowed);
  Object.keys(value).forEach((key) => {
    if (!allowedSet.has(key)) invalid(`${path}.${key}`, "a supported field");
  });
  const optionalSet = new Set(optional);
  allowed.forEach((key) => {
    if (!optionalSet.has(key) && !hasOwn(value, key)) invalid(`${path}.${key}`, "a required field");
  });
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== "string") invalid(path, "a string");
  return value;
}

function requireNonEmptyString(value: unknown, path: string): string {
  const string = requireString(value, path);
  if (!string.trim()) invalid(path, "a non-empty string");
  return string;
}

function optionalString(source: Record<string, unknown>, key: string, path: string) {
  return hasOwn(source, key) ? requireNonEmptyString(source[key], `${path}.${key}`) : undefined;
}

function requireFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) invalid(path, "a finite number");
  return value;
}

function requireBoolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") invalid(path, "a boolean");
  return value;
}

function requireEnum<const Value extends string | number>(
  value: unknown,
  choices: readonly Value[],
  path: string
): Value {
  if (!choices.includes(value as Value)) invalid(path, `one of ${choices.map(String).join(", ")}`);
  return value as Value;
}

function requireComponentType(value: unknown, path: string): ComponentType {
  if (
    typeof value !== "string" ||
    !Object.prototype.hasOwnProperty.call(COMPONENT_CATALOG, value)
  ) {
    invalid(path, "a known component type");
  }
  return value as ComponentType;
}

function requireColor(value: unknown, path: string): string {
  if (!isHexColor(value)) invalid(path, "a six-digit hexadecimal color");
  return value;
}

function hasOwn(value: object, key: string) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function assertSchematicDocumentFileSize(size: number) {
  if (!Number.isFinite(size) || size < 0 || size > MAX_SCHEMATIC_FILE_BYTES) {
    throw new SchematicDocumentFileError(
      "file-too-large",
      `Schematic files must not exceed ${MAX_SCHEMATIC_FILE_BYTES} bytes (20 MiB).`
    );
  }
}

function utf8ByteLength(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function invalid(path: string, expectation: string): never {
  throw new SchematicDocumentFileError(
    "invalid-schema",
    `Invalid schematic file at ${path}: expected ${expectation}.`
  );
}
