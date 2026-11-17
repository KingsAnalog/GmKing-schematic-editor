import { resolveComponentDef } from "./catalog";
import { scaleComponentDefinition } from "./componentScaleModel";
import { triangleFrameSymbol } from "./symbols/triangleSymbols";
import { rotatePoint, snapPoint } from "./geometry";
import { noteWorldBounds } from "./notes/noteGeometry";
import { SYMBOL_STROKE_WIDTH } from "./symbols/symbolPrimitives";
import { GRID_SIZE, SYMBOL_GRID_SIZE, type ComponentDef, type ComponentInstance, type NetLabel, type Point, type SchematicDocument, type SchematicNote, type Wire } from "./types";
import { netLabelVisualBounds as labelVisualBounds } from "./netLabelModel";
import { symbolAccentPath, symbolAccentStrokeWidth, symbolMarkerPath, symbolPath, symbolStrokeWidth } from "./symbols/symbolRegistry";
import {
  wireDigitalDecorationGeometry,
  wireDigitalLabelWidth,
  wireEndpointDecorationGeometry,
  wireStrokeWidth,
  wireUnitWidth,
  WIRE_DIGITAL_LABEL_FONT_SIZE,
  type WireEndpointConnections
} from "./wire/wireDecoration";
import { wireEndpointConnections } from "./wire/wireEndpointConnection";
import { inductorCouplingGeometry } from "./inductorCouplingGeometry";

export type Rect = { x: number; y: number; width: number; height: number };

const FRAME_ROUND_EPSILON = 1e-6;
const JUNCTION_VISUAL_DIAMETER = 5 * SYMBOL_STROKE_WIDTH;
const JUNCTION_VISUAL_RADIUS = JUNCTION_VISUAL_DIAMETER / 2;

export function componentFrameBox(def: ComponentDef): Rect {
  // The shared layout envelope is template-independent, just like catalog pins.
  // Template artwork must fit this frame; template changes never shift cell origins.
  if (def.type === "annotation") {
    return { x: 0, y: 0, width: def.size.width, height: def.size.height };
  }

  const cx = def.size.width / 2;
  const cy = def.size.height / 2;
  const pathRects = componentPathBounds(def).map(({ rect }) => rect);
  const pinPoints = def.pins.map((pin) => ({ x: cx + pin.x, y: cy + pin.y }));
  const bounds = rectFromPoints([
    ...pathRects.flatMap(rectCorners),
    ...pinPoints
  ]);

  return gridAlignedFrame(bounds, cx, cy);
}

export function mirrorFrameBox(frame: Rect, defWidth: number): Rect {
  return {
    x: defWidth - frame.x - frame.width,
    y: frame.y,
    width: frame.width,
    height: frame.height
  };
}

export function componentLocalFrameBox(instance: ComponentInstance): Rect {
  const def = resolveComponentDef(instance);
  const frame = componentFrameBox(def);
  const localFrame = instance.mirrored ? mirrorFrameBox(frame, def.size.width) : frame;
  // VDD labels sit above the top bar, so reserve one grid row inside the JointJS cell.
  if (
    instance.type === "vdd"
    && (instance.values.valueVisible === "true" || instance.values.labelVisible === "true")
  ) {
    return {
      ...localFrame,
      y: localFrame.y - SYMBOL_GRID_SIZE,
      height: localFrame.height + SYMBOL_GRID_SIZE
    };
  }
  return localFrame;
}

export function componentCellPosition(instance: ComponentInstance): Point {
  const def = resolveComponentDef(instance);
  const frame = componentLocalFrameBox(instance);
  const cx = def.size.width / 2;
  const cy = def.size.height / 2;
  const frameCenter = {
    x: frame.x + frame.width / 2 - cx,
    y: frame.y + frame.height / 2 - cy
  };
  const transformed = rotatePoint(frameCenter, instance.rotation);
  return {
    x: instance.x + transformed.x - frame.width / 2,
    y: instance.y + transformed.y - frame.height / 2
  };
}

export function componentCenterFromCellPosition(instance: ComponentInstance, position: Point): Point {
  const offset = componentCellPosition({ ...instance, x: 0, y: 0 });
  return snapPoint({ x: position.x - offset.x, y: position.y - offset.y });
}

export function componentSymbolBounds(def: ComponentDef): Rect {
  const pathRects = componentPathBounds(def).map(({ rect, padding }) => (padding ? expandRect(rect, padding) : rect));
  return unionRects(pathRects) ?? { x: def.size.width / 2, y: def.size.height / 2, width: 0, height: 0 };
}

export function componentVisualBounds(instance: ComponentInstance): Rect {
  const def = resolveComponentDef(instance);
  const frame = componentFrameBox(def);
  return rectFromPoints(transformedFrameCorners(instance, frame));
}

function transformedFrameCorners(instance: ComponentInstance, frame: Rect) {
  const def = resolveComponentDef(instance);
  const cx = def.size.width / 2;
  const cy = def.size.height / 2;
  return rectCorners(frame).map((corner) => {
    const local = { x: corner.x - cx, y: corner.y - cy };
    const mirrored = instance.mirrored ? { x: -local.x, y: local.y } : local;
    const rotated = rotatePoint(mirrored, instance.rotation);
    return { x: instance.x + rotated.x, y: instance.y + rotated.y };
  });
}

export function wireVisualBounds(
  wire: Wire,
  endpointConnections: WireEndpointConnections = { start: false, end: false }
): Rect {
  const points = wire.points.map((point) => snapPoint(point));
  const rect = rectFromPoints(points);
  const stroke = wireStrokeWidth(wire);
  const unitWidth = wireUnitWidth(wire);
  const linePadding = Math.max(unitWidth === 6 ? 8 : 4, stroke / 2);
  const rects: Rect[] = [{
    x: rect.x - linePadding,
    y: rect.y - linePadding,
    width: rect.width + linePadding * 2,
    height: rect.height + linePadding * 2
  }];

  for (const endpoint of ["start", "end"] as const) {
    const geometry = wireEndpointDecorationGeometry(wire, endpoint, {
      connected: endpointConnections[endpoint]
    });
    if (!geometry) continue;
    if (geometry.polygon) {
      rects.push(rectFromPoints(geometry.polygon));
    } else {
      const outerRadius = (geometry.radius ?? 0) + geometry.strokeWidth / 2;
      rects.push({
        x: geometry.center.x - outerRadius,
        y: geometry.center.y - outerRadius,
        width: outerRadius * 2,
        height: outerRadius * 2
      });
    }
  }

  const digital = wireDigitalDecorationGeometry(wire);
  if (digital) {
    rects.push(expandRect(
      rectFromPoints([digital.slashStart, digital.slashEnd]),
      digital.strokeWidth / 2
    ));
    if (digital.label) {
      rects.push({
        x: digital.labelPosition.x,
        y: digital.labelPosition.y - WIRE_DIGITAL_LABEL_FONT_SIZE / 2,
        width: wireDigitalLabelWidth(digital.label),
        height: WIRE_DIGITAL_LABEL_FONT_SIZE
      });
    }
  }

  return unionRects(rects)!;
}

export function noteVisualBounds(note: SchematicNote): Rect {
  return noteWorldBounds(note);
}

export function junctionVisualBounds(point: Point): Rect {
  return {
    x: point.x - JUNCTION_VISUAL_RADIUS,
    y: point.y - JUNCTION_VISUAL_RADIUS,
    width: JUNCTION_VISUAL_DIAMETER,
    height: JUNCTION_VISUAL_DIAMETER
  };
}

export function netLabelVisualBounds(label: NetLabel): Rect {
  return labelVisualBounds(label);
}

export function schematicDocumentVisualBounds(
  document: SchematicDocument,
  options: { includeNotes?: boolean; includeTemporarilyDeleted?: boolean } = {}
) {
  const rects: Rect[] = [];
  document.components
    .filter((component) => options.includeTemporarilyDeleted !== false || !component.temporarilyDeleted)
    .forEach((component) => rects.push(componentVisualBounds(component)));
  (document.inductorCouplings ?? []).forEach((coupling) => {
    const geometry = inductorCouplingGeometry(document, coupling);
    if (geometry) rects.push(geometry.bounds);
  });
  document.wires
    .filter((wire) => options.includeTemporarilyDeleted !== false || !wire.temporarilyDeleted)
    .forEach((wire) => rects.push(wireVisualBounds(
      wire,
      wireEndpointConnections(document, wire)
    )));
  document.junctions.forEach((junction) => {
    rects.push(junctionVisualBounds(junction));
  });
  document.netLabels.forEach((label) => rects.push(netLabelVisualBounds(label)));
  if (options.includeNotes) {
    document.notes.forEach((note) => {
      rects.push(noteVisualBounds(note));
    });
  }
  return unionRects(rects);
}

export function unionRects(rects: Rect[]) {
  if (rects.length === 0) return null;
  const x = Math.min(...rects.map((rect) => rect.x));
  const y = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  return { x, y, width: right - x, height: bottom - y };
}

function rectFromPoints(points: Point[]): Rect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}

function rectCorners(rect: Rect): Point[] {
  return [
    { x: rect.x, y: rect.y },
    { x: rect.x + rect.width, y: rect.y },
    { x: rect.x + rect.width, y: rect.y + rect.height },
    { x: rect.x, y: rect.y + rect.height }
  ];
}

function expandRect(rect: Rect, padding: number): Rect {
  return {
    x: rect.x - padding,
    y: rect.y - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2
  };
}

function componentPathBounds(def: ComponentDef): { rect: Rect; padding: number }[] {
  const scale = def.geometryScale ?? 1;
  if (scale !== 1) {
    return componentPathBounds(scaleComponentDefinition(def, 1 / scale)).map(({ rect, padding }) => ({
      rect: { x: rect.x * scale, y: rect.y * scale, width: rect.width * scale, height: rect.height * scale },
      padding: padding * scale
    }));
  }
  return [
    { data: def.bodyPolygon ? triangleFrameSymbol(def.size.width, def.size.height, def.bodyPolygon) : symbolPath(def.symbol, def.size.width, def.size.height), padding: symbolStrokeWidth(def.symbol) / 2 },
    { data: symbolAccentPath(def.symbol, def.size.width, def.size.height), padding: symbolAccentStrokeWidth(def.symbol) / 2 },
    { data: symbolMarkerPath(def.symbol, def.size.width, def.size.height), padding: 0 }
  ]
    .map(({ data, padding }) => {
      const rect = svgPathBounds(data);
      return rect ? { rect, padding } : null;
    })
    .filter((item): item is { rect: Rect; padding: number } => !!item);
}

function gridAlignedFrame(bounds: Rect, cx: number, cy: number): Rect {
  const left = roundDownToGrid(bounds.x - cx);
  const right = roundUpToGrid(bounds.x + bounds.width - cx);
  const top = roundDownToGrid(bounds.y - cy);
  const bottom = roundUpToGrid(bounds.y + bounds.height - cy);
  return { x: cx + left, y: cy + top, width: right - left, height: bottom - top };
}

function roundDownToGrid(value: number) {
  return Math.floor((value + FRAME_ROUND_EPSILON) / GRID_SIZE) * GRID_SIZE;
}

function roundUpToGrid(value: number) {
  return Math.ceil((value - FRAME_ROUND_EPSILON) / GRID_SIZE) * GRID_SIZE;
}

export function svgPathBounds(data: string): Rect | null {
  const tokens = data.match(/[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g);
  if (!tokens) return null;

  const points: Point[] = [];
  let index = 0;
  let command = "";
  let current: Point | null = null;
  while (index < tokens.length) {
    const token = tokens[index];
    if (isPathCommand(token)) {
      command = token;
      index += 1;
      if (command === "Z") continue;
    }

    if (command === "M" || command === "L") {
      const point = readPoint(tokens, index);
      points.push(point);
      current = point;
      index += 2;
      if (command === "M") command = "L";
      continue;
    }

    if (command === "C") {
      const first = readPoint(tokens, index);
      const second = readPoint(tokens, index + 2);
      const end = readPoint(tokens, index + 4);
      points.push(first, second, end);
      current = end;
      index += 6;
      continue;
    }

    if (command === "A") {
      if (!current) throw new Error("SVG arc command cannot start without a current point.");
      const rx = Number(tokens[index]);
      const ry = Number(tokens[index + 1]);
      const end = readPoint(tokens, index + 5);
      points.push(...arcBoundsPoints(current, end, rx, ry));
      current = end;
      index += 7;
      continue;
    }

    throw new Error(`Unsupported SVG path command in schematic symbol: ${command}`);
  }

  return points.length === 0 ? null : rectFromPoints(points);
}

function isPathCommand(token: string) {
  return /^[A-Za-z]$/.test(token);
}

function readPoint(tokens: string[], index: number): Point {
  return { x: Number(tokens[index]), y: Number(tokens[index + 1]) };
}

function arcBoundsPoints(start: Point, end: Point, rx: number, ry: number): Point[] {
  const horizontalDiameter = Math.abs(Math.abs(end.x - start.x) - 2 * rx) < FRAME_ROUND_EPSILON && Math.abs(end.y - start.y) < FRAME_ROUND_EPSILON;
  const verticalDiameter = Math.abs(Math.abs(end.y - start.y) - 2 * ry) < FRAME_ROUND_EPSILON && Math.abs(end.x - start.x) < FRAME_ROUND_EPSILON;
  if (horizontalDiameter || verticalDiameter) {
    const cx = (start.x + end.x) / 2;
    const cy = (start.y + end.y) / 2;
    return [
      { x: cx - rx, y: cy - ry },
      { x: cx + rx, y: cy + ry }
    ];
  }
  return [start, end];
}
