import { noteBackgroundColor, noteTextColor } from "./notes/noteAppearance";
import { noteRotation } from "./notes/noteGeometry";
import { renderComponentSvg } from "./componentSvgRenderer";
import { componentExportBounds } from "./componentExportBounds";
import type { SymbolTemplateContext } from "./symbolTemplateModel";
import { netLabelPosition, NET_LABEL_FONT_SIZE, NET_LABEL_HEIGHT } from "./netLabelModel";
import {
  DEFAULT_NOTE_BACKGROUND_OPACITY,
  noteFontSizePx, noteWidthPx, noteHeightPx, PLAIN_NOTE_LINE_HEIGHT,
  NOTE_HORIZONTAL_PADDING,
  NOTE_LINE_HEIGHT,
  NOTE_VERTICAL_PADDING
} from "./notes/noteSizing";
import type { NetLabelStatus } from "./netResolution";
import { SYMBOL_STROKE_WIDTH } from "./symbols/symbolPrimitives";
import { escapeAttribute, escapeHtml } from "./uiUtils";
import {
  netLabelVisualBounds,
  noteVisualBounds,
  unionRects,
  wireVisualBounds,
  type Rect
} from "./view-geometry";
import {
  wireDigitalDecorationGeometry,
  wireEndpointDecorationGeometry,
  wireStrokeWidth,
  WIRE_DIGITAL_LABEL_FONT_SIZE
} from "./wire/wireDecoration";
import { wireEndpointConnections } from "./wire/wireEndpointConnection";
import { wireColor } from "./networkColorModel";
import type { ComponentInstance, NetLabel, Point, SchematicConnections, SchematicNote, Wire } from "./types";
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

export interface SchematicSvgTextStyle {
  fontWeight?: number;
  fontStyle?: "italic";
}

export interface SchematicSvgScene extends SymbolTemplateContext {
  connections?: SchematicConnections;
  components: readonly ComponentInstance[];
  inductorCouplings?: readonly InductorCoupling[];
  wires: readonly Wire[];
  junctionPoints: readonly Point[];
  junctionColors?: Readonly<Record<string, string>>;
  netLabels: readonly NetLabel[];
  netLabelStatuses?: Readonly<Record<string, NetLabelStatus>>;
  notes: readonly SchematicNote[];
  renderedNoteHtml?: Readonly<Record<string, string>>;
  renderedNoteText?: Readonly<Record<string, string>>;
  renderedNoteTextStyles?: Readonly<Record<string, SchematicSvgTextStyle>>;
}

export interface SchematicSvgRenderOptions {
  namespace: string;
  padding?: number;
  presentationMode?: boolean;
  portableNotes?: boolean;
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
  scene.wires.forEach((wire) => rects.push(wireVisualBounds(wire, wireEndpointConnections(scene, wire))));
  scene.junctionPoints.forEach((point) => rects.push({
    x: point.x - JUNCTION_RADIUS,
    y: point.y - JUNCTION_RADIUS,
    width: JUNCTION_RADIUS * 2,
    height: JUNCTION_RADIUS * 2
  }));
  scene.netLabels.forEach((label) => rects.push(netLabelVisualBounds(label)));
  scene.notes.forEach((note) => rects.push(noteVisualBounds(note)));
  return unionRects(rects);
}

export function renderSchematicSvgScene(
  scene: SchematicSvgScene,
  options: SchematicSvgRenderOptions
): SchematicSvgRender | null {
  const bounds = schematicSvgSceneBounds(scene, options);
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
  const body = [
    ...(scene.inductorCouplings ?? []).map((coupling) =>
      renderInductorCouplingSvg(scene, coupling)
    ),
    ...scene.wires.map((wire) => renderWire(wire, wireEndpointConnections(scene, wire))),
    ...scene.components.map((component) => renderComponentSvg(component, {
      symbolTemplate: scene.symbolTemplate,
      presentationMode: options.presentationMode,
      flipReferenceLabelSide: inductorCouplingFlipsReferenceLabel(scene, component)
    })),
    ...scene.junctionPoints.map((point) => renderJunction(point, scene.junctionColors?.[`${point.x},${point.y}`])),
    ...scene.netLabels.map((label) => renderNetLabel(label, scene.netLabelStatuses?.[label.id])),
    ...scene.notes.map((note) => renderNote(scene, note, namespace, !!options.portableNotes))
  ].filter(Boolean).join("");
  const svg = wrapSvg(body, width, height, viewBox, namespace, options);
  return { svg, bounds, viewBox, width, height };
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${number(viewBox.x)} ${number(viewBox.y)} ${number(viewBox.width)} ${number(viewBox.height)}">${background}${grid}<g font-family="Arial, Helvetica, sans-serif">${body}</g></svg>`;
}

function renderWire(wire: Wire, connections: { start: boolean; end: boolean }) {
  if (wire.points.length < 2) return "";
  const attrs = wireAttrs(wire);
  const points = wire.points.map((point) => `${number(point.x)},${number(point.y)}`).join(" ");
  const line = `<polyline points="${escapeAttribute(points)}" fill="none" stroke="${attrs.stroke}" stroke-width="${number(attrs.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round"${attrs.dash ? ` stroke-dasharray="${attrs.dash}"` : ""}${opacityAttr(attrs.opacity)} />`;
  const decorations = [
    renderWireEndpoint(wire, "start", attrs, connections.start),
    renderWireEndpoint(wire, "end", attrs, connections.end),
    renderWireDigital(wire, attrs)
  ].join("");
  return `<g data-wire-id="${escapeAttribute(wire.id)}">${line}${decorations}</g>`;
}

function wireAttrs(wire: Wire) {
  const deleted = !!wire.temporarilyDeleted;
  return {
    stroke: deleted ? "#b00020" : wireColor(wire),
    strokeWidth: wireStrokeWidth(wire),
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
    ? `<text data-wire-digital-label x="${number(geometry.labelPosition.x)}" y="${number(geometry.labelPosition.y)}" fill="${attrs.stroke}" font-family="Arial, Helvetica, sans-serif" font-size="${WIRE_DIGITAL_LABEL_FONT_SIZE}" dominant-baseline="middle"${opacityAttr(attrs.opacity)}>${escapeHtml(geometry.label)}</text>`
    : "";
  return `${slash}${label}`;
}

function renderJunction(point: Point, color?: string) {
  const ink = color ?? "#111111";
  return `<circle data-junction="${escapeAttribute(`${point.x},${point.y}`)}" cx="${number(point.x)}" cy="${number(point.y)}" r="${number(JUNCTION_RADIUS)}" fill="${escapeAttribute(ink)}" stroke="${escapeAttribute(ink)}" stroke-width="1" />`;
}

function renderNetLabel(label: NetLabel, status?: NetLabelStatus) {
  const position = netLabelPosition(label);
  const conflict = status === "conflict";
  const inactive = status === "inactive";
  const color = conflict ? "#b00020" : "#111111";
  return `<text data-net-label-id="${escapeAttribute(label.id)}" x="${number(position.x)}" y="${number(position.y + NET_LABEL_HEIGHT / 2)}" fill="${color}" font-family="Arial, Helvetica, sans-serif" font-size="${NET_LABEL_FONT_SIZE}" dominant-baseline="middle"${conflict ? ' text-decoration="underline"' : ""}${opacityAttr(inactive ? 0.42 : 1)}>${escapeHtml(label.name)}</text>`;
}

function renderNote(
  scene: SchematicSvgScene,
  note: SchematicNote,
  namespace: string,
  portable: boolean
) {
  const box = { x: note.x, y: note.y, width: noteWidthPx(note), height: noteHeightPx(note) };
  const fontSize = noteFontSizePx(note);
  const fill = noteBackgroundColor(note) ?? "none";
  const fillOpacity = note.format === "markdown" && note.backgroundColor === undefined ? DEFAULT_NOTE_BACKGROUND_OPACITY : undefined;
  const text = scene.renderedNoteText?.[note.id] ?? note.text;
  const native = renderNativeNoteText(
    note,
    box,
    text,
    fontSize,
    scene.renderedNoteTextStyles?.[note.id],
    namespace
  );
  const markdown = note.format === "markdown";
  const html = markdown ? scene.renderedNoteHtml?.[note.id] : escapeHtml(note.text || " ");
  const whiteSpace = markdown ? "normal" : "pre";
  const overflowWrap = markdown ? "anywhere" : "normal";
  const lineHeight = markdown ? NOTE_LINE_HEIGHT : PLAIN_NOTE_LINE_HEIGHT;
  const border = markdown ? 1 : 0;
  const horizontalPadding = NOTE_HORIZONTAL_PADDING + (markdown ? 0 : 1);
  const foreignObject = !portable && html
    ? `<foreignObject${markdown ? ' requiredExtensions="http://www.w3.org/1999/xhtml"' : ""} x="${number(box.x)}" y="${number(box.y)}" width="${number(box.width)}" height="${number(box.height)}"><div xmlns="http://www.w3.org/1999/xhtml" style="box-sizing:border-box;width:100%;height:100%;border:${border}px solid transparent;padding:${number(NOTE_VERTICAL_PADDING)}px ${horizontalPadding}px;overflow:hidden;color:${escapeAttribute(noteTextColor(note))};font-family:Arial,Helvetica,sans-serif;font-size:${number(fontSize)}px;line-height:${lineHeight};white-space:${whiteSpace};overflow-wrap:${overflowWrap}">${html}</div></foreignObject>`
    : "";
  const content = foreignObject
    ? markdown ? `<switch>${foreignObject}${native}</switch>` : foreignObject
    : native;
  const transform = noteRotation(note) ? ` transform="rotate(${noteRotation(note)} ${number(note.x)} ${number(note.y)})"` : "";
  return `<g data-note-id="${escapeAttribute(note.id)}"${transform}><rect x="${number(box.x)}" y="${number(box.y)}" width="${number(box.width)}" height="${number(box.height)}" fill="${escapeAttribute(fill)}"${fillOpacity === undefined ? "" : ` fill-opacity="${number(fillOpacity)}"`} stroke="none" />${content}</g>`;
}

function renderNativeNoteText(
  note: SchematicNote,
  box: Rect,
  text: string,
  fontSize: number,
  style: SchematicSvgTextStyle | undefined,
  namespace: string
) {
  const plain = note.format === "plain";
  const lineHeight = fontSize * (plain ? PLAIN_NOTE_LINE_HEIGHT : NOTE_LINE_HEIGHT);
  const maxLines = Math.max(1, Math.floor(Math.max(1, box.height - NOTE_VERTICAL_PADDING * 2) / lineHeight));
  const lines = (text || " ").replace(/\r\n?/g, "\n").split("\n").slice(0, maxLines);
  const x = box.x + NOTE_HORIZONTAL_PADDING + (plain ? 1 : 0);
  const y = box.y + NOTE_VERTICAL_PADDING + fontSize * (plain ? 0.85 : 1);
  const tspans = lines.map((line, index) => `<tspan x="${number(x)}"${index === 0 ? "" : ` dy="${number(lineHeight)}"`}>${escapeHtml(line || " ")}</tspan>`).join("");
  const clipId = `${namespace}-note-text-clip-${svgIdFragment(note.id)}`;
  return `<g data-markdown-note-fallback="${escapeAttribute(note.id)}" clip-path="url(#${clipId})"><defs><clipPath id="${escapeAttribute(clipId)}"><rect x="${number(box.x)}" y="${number(box.y)}" width="${number(box.width)}" height="${number(box.height)}" /></clipPath></defs><text x="${number(x)}" y="${number(y)}" fill="${escapeAttribute(noteTextColor(note))}" font-family="Arial, Helvetica, sans-serif" font-size="${number(fontSize)}"${style?.fontWeight ? ` font-weight="${style.fontWeight}"` : ""}${style?.fontStyle ? ` font-style="${style.fontStyle}"` : ""} xml:space="preserve">${tspans}</text></g>`;
}

function opacityAttr(opacity: number) {
  return opacity === 1 ? "" : ` opacity="${number(opacity)}"`;
}

function number(value: number) {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
