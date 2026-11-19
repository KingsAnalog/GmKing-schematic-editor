import { dia, shapes } from "@joint/core";
import { pointKey } from "./geometry";
import { junctionId } from "./junctionIdentity";
import { SYMBOL_STROKE_WIDTH } from "./symbols/symbolPrimitives";
import type { Point, Wire, WireAppearance } from "./types";
import type { NetLabel } from "./types";
import { NET_LABEL_FONT_SIZE, NET_LABEL_HEIGHT, netLabelPosition, netLabelWidth } from "./netLabelModel";
import type { NetLabelStatus } from "./netResolution";
import { wireColor } from "./networkColorModel";
import { SCHEMATIC_FONT_STACK } from "./schematicFont";
import {
  resolvedWireAppearance,
  wireDigitalLocalGeometry,
  wireEndpointDecorationGeometry,
  wireStrokeWidth,
  WIRE_DIGITAL_LABEL_FONT_FAMILY,
  WIRE_DIGITAL_LABEL_FONT_SIZE,
  type WireEndpoint,
  type WireEndpointConnections
} from "./wire/wireDecoration";

export { symbolAccentPath, symbolAccentStrokeWidth, symbolMarkerPath, symbolPath, symbolStrokeWidth } from "./symbols/symbolRegistry";
export {
  ANALOG_BUFFER_LABEL_FONT_SIZE,
  componentCellAttrs,
  makeComponentCell,
  PORT_MARKER_INNER_SIZE,
  PORT_MARKER_SIZE,
  PORT_MARKER_STROKE_WIDTH,
  PREVIEW_COMPONENT_ID,
  SymbolElement
} from "./componentRenderer";
export { junctionId, junctionPointFromId, parseJunctionKey } from "./junctionIdentity";

export const SCHEMATIC_GRID = { name: "mesh", args: { color: "#d9d9d4", thickness: 1 } } as const;
export const PREVIEW_WIRE_ID = "preview-wire";
export const PREVIEW_NET_LABEL_ID = "preview-net-label";
export const JUNCTION_MARKER_DIAMETER = 5 * SYMBOL_STROKE_WIDTH;
export const JUNCTION_MARKER_RADIUS = JUNCTION_MARKER_DIAMETER / 2;
export const SCHEMATIC_SELECTION_COLOR = "#005f9e";

const WIRE_MARKUP = [
  {
    tagName: "path",
    selector: "wrapper",
    attributes: {
      fill: "none",
      cursor: "pointer",
      stroke: "transparent",
      "stroke-linecap": "round"
    }
  },
  {
    tagName: "path",
    selector: "selectionHalo",
    attributes: {
      fill: "none",
      "pointer-events": "none"
    }
  },
  {
    tagName: "path",
    selector: "line",
    attributes: {
      fill: "none",
      "pointer-events": "none"
    }
  }
];

export function createSchematicGraph() {
  return new dia.Graph({}, { cellNamespace: shapes });
}

export function wireAppearance(wire: Wire): WireAppearance {
  return resolvedWireAppearance(wire);
}

export function wireLineAttrs(wire: Wire, options: { preview?: boolean; selected?: boolean } = {}) {
  const preview = !!options.preview;
  const deleted = !!wire.temporarilyDeleted;
  const baseStroke = wireColor(wire);
  const baseWidth = wireStrokeWidth(wire);
  return {
    stroke: preview ? SCHEMATIC_SELECTION_COLOR : deleted ? "#b00020" : baseStroke,
    strokeWidth: preview ? Math.max(2, baseWidth) : baseWidth,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeDasharray: preview ? "5 4" : deleted ? "7 5" : "none",
    opacity: preview ? 0.62 : deleted ? 0.48 : 1,
    targetMarker: null,
    sourceMarker: null,
    pointerEvents: preview ? "none" : "stroke"
  };
}

export function wireSelectionHaloAttrs(wire: Wire, options: { preview?: boolean; selected?: boolean } = {}) {
  const baseWidth = wireStrokeWidth(wire);
  return {
    connection: true,
    stroke: SCHEMATIC_SELECTION_COLOR,
    strokeWidth: baseWidth + 3,
    strokeLinecap: "butt",
    strokeLinejoin: "round",
    strokeDasharray: "3 3",
    opacity: options.selected && !options.preview ? 1 : 0,
    targetMarker: null,
    sourceMarker: null,
    pointerEvents: "none"
  };
}

export function junctionBodyAttrs(options: { selected?: boolean; color?: string | null } = {}) {
  const selected = !!options.selected;
  const color = options.color ?? "#111111";
  return {
    fill: color,
    stroke: selected ? SCHEMATIC_SELECTION_COLOR : color,
    strokeWidth: selected ? 1.5 : 1,
    strokeDasharray: selected ? "3 3" : "none",
    cursor: "pointer",
    pointerEvents: "all"
  };
}

export function makeWireCell(
  wire: Wire,
  options: WireCellRenderOptions = {}
) {
  const preview = !!options.preview;
  const lineAttrs = wireLineAttrs(wire, options);
  const link = new shapes.standard.Link({
    id: wire.id,
    source: { x: wire.points[0].x, y: wire.points[0].y },
    target: { x: wire.points[wire.points.length - 1].x, y: wire.points[wire.points.length - 1].y },
    vertices: wire.points.slice(1, -1),
    connector: { name: "normal" },
    markup: WIRE_MARKUP,
    labels: wireDecorationLabels(wire, lineAttrs, options.endpointConnections),
    attrs: {
      line: lineAttrs,
      selectionHalo: wireSelectionHaloAttrs(wire, options),
      wrapper: {
        pointerEvents: preview ? "none" : "stroke"
      }
    }
  });
  link.set("wireId", wire.id);
  link.set("preview", preview);
  link.attr("root/data-layer", "wire");
  return link;
}

export interface WireCellRenderOptions {
  preview?: boolean;
  selected?: boolean;
  endpointConnections?: WireEndpointConnections;
}

export function wireDecorationLabels(
  wire: Wire,
  lineAttrs: ReturnType<typeof wireLineAttrs> = wireLineAttrs(wire),
  endpointConnections: WireEndpointConnections = { start: false, end: false }
): dia.Link.Label[] {
  const appearance = resolvedWireAppearance(wire);
  const labels: dia.Link.Label[] = [];
  const ink = String(lineAttrs.stroke);
  const opacity = Number(lineAttrs.opacity);

  const start = wireEndpointDecorationLabel(
    wire,
    "start",
    ink,
    opacity,
    endpointConnections.start
  );
  if (start) labels.push(start);

  const end = wireEndpointDecorationLabel(
    wire,
    "end",
    ink,
    opacity,
    endpointConnections.end
  );
  if (end) labels.push(end);

  if (appearance.digitalSlash) {
    const geometry = wireDigitalLocalGeometry(wire);
    labels.push({
      position: {
        distance: 0.5,
        args: { keepGradient: false }
      },
      markup: [
        { tagName: "path", selector: "digitalSlash" },
        { tagName: "text", selector: "digitalLabel" }
      ],
      attrs: {
        digitalSlash: {
          d: geometry.slashPath,
          fill: "none",
          stroke: ink,
          strokeWidth: geometry.strokeWidth,
          strokeLinecap: "square",
          opacity,
          pointerEvents: "none"
        },
        digitalLabel: {
          text: geometry.label,
          x: geometry.labelX,
          y: geometry.labelY,
          fill: ink,
          fontFamily: WIRE_DIGITAL_LABEL_FONT_FAMILY,
          fontSize: WIRE_DIGITAL_LABEL_FONT_SIZE,
          fontWeight: 400,
          textAnchor: "start",
          dominantBaseline: "middle",
          opacity,
          pointerEvents: "none"
        }
      }
    });
  }

  return labels;
}

function wireEndpointDecorationLabel(
  wire: Wire,
  endpoint: WireEndpoint,
  ink: string,
  opacity: number,
  connected: boolean
): dia.Link.Label | null {
  const geometry = wireEndpointDecorationGeometry(wire, endpoint, { connected });
  if (!geometry) return null;
  const origin = endpoint === "start" ? wire.points[0] : wire.points[wire.points.length - 1];
  const position = {
    distance: endpoint === "start" ? 0 : 1,
    args: { keepGradient: false, ensureLegibility: false }
  };
  if (geometry.marker === "arrow" && geometry.polygon) {
    return {
      position,
      markup: [{ tagName: "path", selector: "endpointMarker" }],
      attrs: {
        endpointMarker: {
          d: localPolygonPath(geometry.polygon, origin),
          fill: ink,
          stroke: "none",
          opacity,
          pointerEvents: "none"
        }
      }
    };
  }
  return {
    position,
    markup: [{ tagName: "circle", selector: "endpointMarker" }],
    attrs: {
      endpointMarker: {
        cx: geometry.center.x - origin.x,
        cy: geometry.center.y - origin.y,
        r: geometry.radius ?? 0,
        fill: "#ffffff",
        stroke: ink,
        strokeWidth: geometry.strokeWidth,
        opacity,
        pointerEvents: "none"
      }
    }
  };
}

function localPolygonPath(points: readonly Point[], origin: Point) {
  return points.map((point, index) => (
    `${index === 0 ? "M" : "L"} ${point.x - origin.x} ${point.y - origin.y}`
  )).join(" ") + " Z";
}

export function makeJunctionCell(point: Point, options: { selected?: boolean; color?: string | null } = {}) {
  const id = junctionId(point);
  const cell = new shapes.standard.Circle({
    id,
    position: { x: point.x - JUNCTION_MARKER_RADIUS, y: point.y - JUNCTION_MARKER_RADIUS },
    size: { width: JUNCTION_MARKER_DIAMETER, height: JUNCTION_MARKER_DIAMETER },
    attrs: {
      body: junctionBodyAttrs(options)
    }
  });
  cell.set("junction", true);
  cell.set("junctionKey", pointKey(point));
  cell.attr("root/data-layer", "junction");
  return cell;
}

export function netLabelTextAttrs(options: {
  selected?: boolean;
  status?: NetLabelStatus;
  preview?: boolean;
} = {}) {
  const conflict = options.status === "conflict";
  const inactive = options.status === "inactive";
  return {
    fill: options.selected || options.preview ? "#005f9e" : conflict ? "#b00020" : "#111111",
    fontFamily: SCHEMATIC_FONT_STACK,
    fontSize: NET_LABEL_FONT_SIZE,
    fontWeight: 400,
    textAnchor: "start",
    textVerticalAnchor: "middle",
    x: 0,
    y: NET_LABEL_HEIGHT / 2,
    textDecoration: conflict ? "underline" : "none",
    opacity: options.preview ? 0.62 : inactive ? 0.42 : 1,
    cursor: options.preview ? "default" : "move",
    pointerEvents: options.preview ? "none" : "all"
  };
}

export function makeNetLabelCell(
  label: NetLabel,
  options: { selected?: boolean; status?: NetLabelStatus; preview?: boolean } = {}
) {
  const position = netLabelPosition(label);
  const cell = new shapes.standard.Rectangle({
    id: label.id,
    position,
    size: { width: netLabelWidth(label.name), height: NET_LABEL_HEIGHT },
    attrs: {
      body: {
        fill: "transparent",
        stroke: "none",
        pointerEvents: options.preview ? "none" : "all"
      },
      label: {
        ...netLabelTextAttrs(options),
        text: label.name
      }
    }
  });
  cell.set("netLabelId", label.id);
  cell.set("preview", !!options.preview);
  cell.attr("root/data-layer", "label");
  return cell;
}
