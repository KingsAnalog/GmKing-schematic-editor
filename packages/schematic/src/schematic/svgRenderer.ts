import { noteFillStyle, noteTextColor } from "./notes/noteAppearance";
import { noteAnchorOffset, noteRotation } from "./notes/noteGeometry";
import { junctionId } from "./junctionIdentity";
import { renderComponentSvg } from "./componentSvgRenderer";
import { componentExportBounds } from "./componentExportBounds";
import type { SymbolTemplateContext } from "./symbolTemplateModel";
import { netLabelPosition, NET_LABEL_FONT_SIZE, NET_LABEL_HEIGHT } from "./netLabelModel";
import { noteFontSizePx, noteWidthPx, noteHeightPx, NOTE_HORIZONTAL_PADDING, type NoteGraphic } from "./notes/noteSizing";
import type { NetLabelStatus } from "./netResolution";
import { SYMBOL_STROKE_WIDTH } from "./symbols/symbolPrimitives";
import { escapeAttribute, escapeHtml } from "./uiUtils";
import { SCHEMATIC_FONT_STACK, schematicTextFontStack, type SchematicTextFont } from "./schematicFont";
import {
  netLabelVisualBounds,
  noteVisualBounds,
  svgPathBounds,
  unionRects,
  wireVisualBounds,
  type Rect
} from "./view-geometry";
import {
  wireDigitalDecorationGeometry,
  wireEndpointDecorationGeometry,
  wireStrokeWidth,
  WIRE_DIGITAL_LABEL_FONT_SIZE,
  type WireEndpointConnections
} from "./wire/wireDecoration";
import { wireEndpointConnections } from "./wire/wireEndpointConnection";
import { wireColor } from "./networkColorModel";
import { wireHopPaths } from "./wire/wireCrossings";
import type { ComponentInstance, NetLabel, Point, SchematicConnections, SchematicDisplaySettings, SchematicNote, Wire } from "./types";
import type { InductorCoupling } from "./types";
import { GRID_SIZE } from "./types";
import {
  inductorCouplingFlipsReferenceLabel,
  inductorCouplingGeometry
} from "./inductorCouplingGeometry";
import { renderInductorCouplingSvg } from "./inductorCouplingRenderer";
import { svgIdFragment } from "./svgId";

const DEFAULT_PADDING = 24;
const JUNCTION_RADIUS = 2.5 * SYMBOL_STROKE_WIDTH;

export interface SchematicSvgScene extends SymbolTemplateContext {
  display?: SchematicDisplaySettings;
  crossingJunctions?: readonly Point[];
  connections?: SchematicConnections;
  components: readonly ComponentInstance[];
  inductorCouplings?: readonly InductorCoupling[];
  wires: readonly Wire[];
  /** Endpoint state calculated against the complete circuit, including hidden conductors. */
  wireEndpoints?: ReadonlyMap<string, WireEndpointConnections>;
  busWireIds?: ReadonlySet<string>;
  junctionPoints: readonly Point[];
  junctionColors?: Readonly<Record<string, string>>;
  netLabels: readonly NetLabel[];
  netLabelStatuses?: Readonly<Record<string, NetLabelStatus>>;
  notes: readonly SchematicNote[];
  /** Optional bottom-to-top object order shared with the Layers panel. */
  layerObjectOrder?: readonly string[];
  noteGraphics?: Readonly<Record<string, NoteGraphic>>;
}

export interface SchematicSvgRenderOptions {
  namespace: string;
  padding?: number;
  presentationMode?: boolean;
  showGrid?: boolean;
  backgroundColor?: string | null;
}

export interface SchematicSvgRender {
  svg: string;
  bounds: Rect;
  viewBox: Rect;
  width: number;
  height: number;
}

export function schematicSvgSceneBounds(scene: SchematicSvgScene, options: Pick<SchematicSvgRenderOptions, "presentationMode"> = {}) {
  return sceneBounds(scene, options, crossingPaths(scene));
}

function sceneBounds(scene: SchematicSvgScene, options: Pick<SchematicSvgRenderOptions, "presentationMode">, hops: ReadonlyMap<string, string>) {
  const rects: Rect[] = [];
  scene.components.forEach((component) => rects.push(componentExportBounds(component, {
    symbolTemplate: scene.symbolTemplate,
    presentationMode: options.presentationMode,
    flipReferenceLabelSide: inductorCouplingFlipsReferenceLabel(scene, component)
  })));
  (scene.inductorCouplings ?? []).forEach((coupling) => {
    const geometry = inductorCouplingGeometry(scene, coupling);
    if (geometry) rects.push(geometry.bounds);
  });
  scene.wires.forEach((wire) => rects.push(wireVisualBounds(wire, scene.wireEndpoints?.get(wire.id) ?? wireEndpointConnections(scene, wire))));
  for (const wire of scene.wires) {
    const path = hops.get(wire.id);
    const bounds = path && svgPathBounds(path);
    if (!bounds) continue;
    const padding = wireStrokeWidth(wire, scene.busWireIds?.has(wire.id)) / 2;
    rects.push({ x: bounds.x - padding, y: bounds.y - padding, width: bounds.width + padding * 2, height: bounds.height + padding * 2 });
  }
  scene.junctionPoints.forEach((point) => rects.push({
    x: point.x - JUNCTION_RADIUS,
    y: point.y - JUNCTION_RADIUS,
    width: JUNCTION_RADIUS * 2,
    height: JUNCTION_RADIUS * 2
  }));
  scene.netLabels.forEach((label) => rects.push(netLabelVisualBounds(label)));
  scene.notes.forEach((note) => rects.push(noteVisualBounds(noteFrame(scene, note))));
  return unionRects(rects);
}

export function renderSchematicSvgScene(
  scene: SchematicSvgScene,
  options: SchematicSvgRenderOptions
): SchematicSvgRender | null {
  const hops = crossingPaths(scene);
  const bounds = sceneBounds(scene, options, hops);
  if (!bounds) return null;
  const padding = options.padding ?? DEFAULT_PADDING;
  const viewBox = {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: Math.max(1, bounds.width + padding * 2),
    height: Math.max(1, bounds.height + padding * 2)
  };
  const width = Math.ceil(viewBox.width);
  const height = Math.ceil(viewBox.height);
  const namespace = svgIdFragment(options.namespace);
  const objects = [
    ...(scene.inductorCouplings ?? []).map((coupling) => ({
      id: coupling.id,
      svg: renderInductorCouplingSvg(scene, coupling)
    })),
    ...scene.wires.map((wire) => ({
      id: wire.id,
      svg: renderWire(wire, scene.wireEndpoints?.get(wire.id) ?? wireEndpointConnections(scene, wire), hops.get(wire.id), scene.busWireIds?.has(wire.id))
    })),
    ...scene.components.map((component) => ({
      id: component.id,
      svg: renderComponentSvg(component, {
        symbolTemplate: scene.symbolTemplate,
        presentationMode: options.presentationMode,
        flipReferenceLabelSide: inductorCouplingFlipsReferenceLabel(scene, component)
      })
    })),
    ...scene.junctionPoints.map((point) => ({
      id: junctionId(point),
      svg: renderJunction(point, scene.junctionColors?.[`${point.x},${point.y}`])
    })),
    ...scene.netLabels.map((label) => ({
      id: label.id,
      svg: renderNetLabel(label, scene.netLabelStatuses?.[label.id], scene.display?.textFont)
    })),
    ...scene.notes.map((note) => ({
      id: note.id,
      svg: renderNote(scene, note)
    }))
  ];
  const order = new Map(scene.layerObjectOrder?.map((id, index) => [id, index]));
  const body = objects
    .map((object, sequence) => ({ ...object, sequence }))
    .sort((first, second) =>
      (order.get(first.id) ?? -1) - (order.get(second.id) ?? -1)
      || first.sequence - second.sequence
    )
    .map(object => object.svg)
    .filter(Boolean)
    .join("");
  const svg = wrapSvg(body, width, height, viewBox, namespace, options);
  return { svg, bounds, viewBox, width, height };
}

function crossingPaths(scene: SchematicSvgScene) {
  if (scene.display?.wireCrossings !== "hop") return new Map<string, string>();
  const order = new Map(scene.layerObjectOrder?.map((id, index) => [id, index]));
  const wires = scene.wires.slice().sort((a, b) => (order.get(a.id) ?? -1) - (order.get(b.id) ?? -1));
  return wireHopPaths(wires, scene.crossingJunctions ?? scene.junctionPoints);
}

function wrapSvg(
  body: string,
  width: number,
  height: number,
  viewBox: Rect,
  namespace: string,
  options: SchematicSvgRenderOptions
) {
  const patternId = `${namespace}-grid`;
  const background = options.backgroundColor
    ? `<rect x="${number(viewBox.x)}" y="${number(viewBox.y)}" width="${number(viewBox.width)}" height="${number(viewBox.height)}" fill="${escapeAttribute(options.backgroundColor)}" />`
    : "";
  const grid = options.showGrid
    ? `<defs><pattern id="${escapeAttribute(patternId)}" width="${GRID_SIZE}" height="${GRID_SIZE}" patternUnits="userSpaceOnUse"><path d="M ${GRID_SIZE} 0 L 0 0 0 ${GRID_SIZE}" fill="none" stroke="#d8dee8" stroke-width="0.6" /></pattern></defs><rect x="${number(viewBox.x)}" y="${number(viewBox.y)}" width="${number(viewBox.width)}" height="${number(viewBox.height)}" fill="url(#${escapeAttribute(patternId)})" />`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${number(viewBox.x)} ${number(viewBox.y)} ${number(viewBox.width)} ${number(viewBox.height)}">${background}${grid}<g font-family="${escapeAttribute(SCHEMATIC_FONT_STACK)}">${body}</g></svg>`;
}

function renderWire(wire: Wire, connections: { start: boolean; end: boolean }, hopPath?: string, bus?: boolean) {
  if (wire.points.length < 2) return "";
  const attrs = wireAttrs(wire, bus);
  const points = wire.points.map((point) => `${number(point.x)},${number(point.y)}`).join(" ");
  const geometry = hopPath ? `path d="${hopPath}"` : `polyline points="${escapeAttribute(points)}"`;
  const line = `<${geometry} fill="none" stroke="${attrs.stroke}" stroke-width="${number(attrs.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"${attrs.dash ? ` stroke-dasharray="${attrs.dash}"` : ""}${opacityAttr(attrs.opacity)} />`;
  const decorations = [
    renderWireEndpoint(wire, "start", attrs, connections.start),
    renderWireEndpoint(wire, "end", attrs, connections.end),
    renderWireDigital(wire, attrs)
  ].join("");
  return `<g data-wire-id="${escapeAttribute(wire.id)}">${line}${decorations}</g>`;
}

function wireAttrs(wire: Wire, bus?: boolean) {
  const deleted = !!wire.temporarilyDeleted;
  return {
    stroke: deleted ? "#b00020" : wireColor(wire),
    strokeWidth: wireStrokeWidth(wire, bus),
    dash: deleted ? "7 5" : "",
    opacity: deleted ? 0.48 : 1
  };
}

function renderWireEndpoint(
  wire: Wire,
  endpoint: "start" | "end",
  attrs: ReturnType<typeof wireAttrs>,
  connected: boolean
) {
  const geometry = wireEndpointDecorationGeometry(wire, endpoint, { connected });
  if (!geometry) return "";
  if (geometry.marker === "arrow" && geometry.polygon) {
    const points = geometry.polygon.map((point) => `${number(point.x)},${number(point.y)}`).join(" ");
    return `<polygon data-wire-endpoint="${endpoint}" points="${escapeAttribute(points)}" fill="${attrs.stroke}" stroke="none"${opacityAttr(attrs.opacity)} />`;
  }
  return `<circle data-wire-endpoint="${endpoint}" cx="${number(geometry.center.x)}" cy="${number(geometry.center.y)}" r="${number(geometry.radius ?? 0)}" fill="#ffffff" stroke="${attrs.stroke}" stroke-width="${number(geometry.strokeWidth)}"${opacityAttr(attrs.opacity)} />`;
}

function renderWireDigital(wire: Wire, attrs: ReturnType<typeof wireAttrs>) {
  const geometry = wireDigitalDecorationGeometry(wire);
  if (!geometry) return "";
  const slash = `<path data-wire-digital-slash d="M ${number(geometry.slashStart.x)} ${number(geometry.slashStart.y)} L ${number(geometry.slashEnd.x)} ${number(geometry.slashEnd.y)}" fill="none" stroke="${attrs.stroke}" stroke-width="${number(geometry.strokeWidth)}" stroke-linecap="square"${opacityAttr(attrs.opacity)} />`;
  const label = geometry.label
    ? `<text data-wire-digital-label x="${number(geometry.labelPosition.x)}" y="${number(geometry.labelPosition.y)}" fill="${attrs.stroke}" font-family="${escapeAttribute(SCHEMATIC_FONT_STACK)}" font-size="${WIRE_DIGITAL_LABEL_FONT_SIZE}" dominant-baseline="middle"${opacityAttr(attrs.opacity)}>${escapeHtml(geometry.label)}</text>`
    : "";
  return `${slash}${label}`;
}

function renderJunction(point: Point, color?: string) {
  const ink = color ?? "#111111";
  return `<circle data-junction="${escapeAttribute(`${point.x},${point.y}`)}" cx="${number(point.x)}" cy="${number(point.y)}" r="${number(JUNCTION_RADIUS)}" fill="${escapeAttribute(ink)}" stroke="${escapeAttribute(ink)}" stroke-width="1" />`;
}

function renderNetLabel(label: NetLabel, status?: NetLabelStatus, documentFont?: SchematicTextFont) {
  const position = netLabelPosition(label);
  const conflict = status === "conflict";
  const inactive = status === "inactive";
  const color = conflict ? "#b00020" : "#111111";
  return `<text data-net-label-id="${escapeAttribute(label.id)}" x="${number(position.x)}" y="${number(position.y + NET_LABEL_HEIGHT / 2)}" fill="${color}" font-family="${escapeAttribute(schematicTextFontStack(label.fontFamily, documentFont))}" font-size="${NET_LABEL_FONT_SIZE}" dominant-baseline="middle"${conflict ? ' text-decoration="underline"' : ""}${opacityAttr(inactive ? 0.42 : 1)}>${escapeHtml(label.name)}</text>`;
}

function noteFrame(scene: SchematicSvgScene, note: SchematicNote) {
  const graphic = scene.noteGraphics?.[note.id];
  return graphic ? { ...note, width: graphic.width, height: graphic.height } : note;
}

function renderNote(scene: SchematicSvgScene, source: SchematicNote) {
  const note = noteFrame(scene, source);
  const width = noteWidthPx(note), height = noteHeightPx(note);
  const offset = noteAnchorOffset(note);
  const color = escapeAttribute(noteTextColor(note));
  const fill = noteFillStyle(note);
  const colorFill = fill.fillEnabled ? fill.fillColor : "none";
  const fillOpacity = fill.fillEnabled && fill.fillOpacity !== 1 ? ` fill-opacity="${number(fill.fillOpacity)}"` : "";
  const size = noteFontSizePx(note);
  const font = escapeAttribute(schematicTextFontStack(note.fontFamily, scene.display?.textFont));
  const x = NOTE_HORIZONTAL_PADDING + 1;
  const fallback = () => note.text.replace(/\r\n?/g, "\n").split("\n").map((line, index) =>
    `<text x="${x}" y="${number(size * (0.85 + index * 1.1))}" fill="currentColor" font-family="${font}" font-size="${size}" xml:space="preserve">${escapeHtml(line)}</text>`
  ).join("");
  const text = scene.noteGraphics?.[note.id]?.markup ?? fallback();
  return `<g data-note-id="${escapeAttribute(note.id)}" color="${color}" transform="translate(${number(note.x)} ${number(note.y)}) rotate(${noteRotation(note)}) translate(${number(-offset.x)} ${number(-offset.y)})"><rect width="${number(width)}" height="${number(height)}" fill="${colorFill}"${fillOpacity} />${text}</g>`;
}

function opacityAttr(opacity: number) {
  return opacity === 1 ? "" : ` opacity="${number(opacity)}"`;
}

function number(value: number) {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
