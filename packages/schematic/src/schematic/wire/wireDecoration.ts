import { variableSymbolArrowHeadSize } from "../symbols/variableSymbolDecoration";
import { SCHEMATIC_FONT_STACK } from "../schematicFont";
import type {
  Point,
  Wire,
  WireAppearance,
  WireEndpointMarker,
  WireLineWidth,
  WireVariant
} from "../types";

export const WIRE_DIGITAL_LABEL_FONT_SIZE = 12;
export const WIRE_DIGITAL_LABEL_FONT_FAMILY = SCHEMATIC_FONT_STACK;

const DIGITAL_SLASH_HALF_PROJECTION = 2;
const DIGITAL_LABEL_X_OFFSET = 4;
const DIGITAL_LABEL_Y_OFFSET = -4;
const DIGITAL_LABEL_AVERAGE_CHARACTER_WIDTH = 7.2;

export type WireEndpoint = "start" | "end";

export interface WireEndpointConnections {
  start: boolean;
  end: boolean;
}

export interface ResolvedWireAppearance {
  variant: WireVariant;
  color?: string;
  lineWidth: WireLineWidth;
  startMarker: WireEndpointMarker;
  endMarker: WireEndpointMarker;
  digitalSlash: boolean;
  digitalLabel: string;
}

export type WireDecorationPatch = Partial<
  Pick<WireAppearance, "lineWidth" | "startMarker" | "endMarker" | "digitalSlash" | "digitalLabel">
>;

export type WireDecorationMutationResult =
  | { kind: "noop"; reason: "invalid" | "missing" | "unchanged" }
  | { kind: "changed"; appearance: WireAppearance };

export interface WireEndpointDecorationGeometry {
  endpoint: WireEndpoint;
  marker: Exclude<WireEndpointMarker, "default">;
  center: Point;
  strokeWidth: number;
  radius?: number;
  polygon?: [Point, Point, Point];
}

export interface WireDigitalDecorationGeometry {
  center: Point;
  slashStart: Point;
  slashEnd: Point;
  strokeWidth: number;
  label: string;
  labelPosition: Point;
}

export function wireStrokeWidth(wire: Pick<Wire, "appearance">) {
  const appearance = resolvedWireAppearance(wire);
  return wireUnitWidth(wire) * (appearance.lineWidth === "2a" ? 2 : 1);
}

export function wireUnitWidth(wire: Pick<Wire, "appearance">) {
  return resolvedWireAppearance(wire).variant === "wide" ? 6 : 2;
}

export function resolvedWireAppearance(wire: Pick<Wire, "appearance">): ResolvedWireAppearance {
  const appearance = wire.appearance;
  return {
    variant: appearance?.variant === "wide" ? "wide" : "signal",
    ...(typeof appearance?.color === "string" ? { color: appearance.color } : {}),
    lineWidth: appearance?.lineWidth === "2a" ? "2a" : "a",
    startMarker: normalizeWireEndpointMarker(appearance?.startMarker),
    endMarker: normalizeWireEndpointMarker(appearance?.endMarker),
    digitalSlash: appearance?.digitalSlash === true,
    digitalLabel: typeof appearance?.digitalLabel === "string" ? appearance.digitalLabel : ""
  };
}

export function compactWireAppearance(appearance: Partial<WireAppearance> | undefined): WireAppearance {
  const resolved = resolvedWireAppearance({ appearance: appearance as WireAppearance | undefined });
  return {
    variant: resolved.variant,
    ...(resolved.color ? { color: resolved.color } : {}),
    ...(resolved.lineWidth === "2a" ? { lineWidth: "2a" } : {}),
    ...(resolved.startMarker !== "default" ? { startMarker: resolved.startMarker } : {}),
    ...(resolved.endMarker !== "default" ? { endMarker: resolved.endMarker } : {}),
    ...(resolved.digitalSlash ? { digitalSlash: true } : {}),
    ...(appearance?.digitalLabel !== undefined ? { digitalLabel: resolved.digitalLabel } : {})
  };
}

export function normalizeWireEndpointMarker(value: unknown): WireEndpointMarker {
  return value === "arrow" || value === "circle" ? value : "default";
}

export function wireBodyKindValues(wire: Pick<Wire, "appearance">) {
  const appearance = resolvedWireAppearance(wire);
  return [
    appearance.variant,
    appearance.color ?? "",
    appearance.lineWidth
  ] as const;
}

export function wireBodyAppearance(
  wire: Pick<Wire, "appearance">
): WireAppearance | undefined {
  if (!wire.appearance) return undefined;
  const appearance = resolvedWireAppearance(wire);
  return compactWireAppearance({
    variant: appearance.variant,
    ...(appearance.color ? { color: appearance.color } : {}),
    lineWidth: appearance.lineWidth
  });
}

export function setWireDecoration(
  wire: Wire | undefined,
  patch: WireDecorationPatch
): WireDecorationMutationResult {
  if (!wire) return { kind: "noop", reason: "missing" };
  if (
    patch.lineWidth !== undefined &&
    patch.lineWidth !== "a" &&
    patch.lineWidth !== "2a"
  ) {
    return { kind: "noop", reason: "invalid" };
  }
  if (
    patch.startMarker !== undefined &&
    normalizeWireEndpointMarker(patch.startMarker) !== patch.startMarker
  ) {
    return { kind: "noop", reason: "invalid" };
  }
  if (
    patch.endMarker !== undefined &&
    normalizeWireEndpointMarker(patch.endMarker) !== patch.endMarker
  ) {
    return { kind: "noop", reason: "invalid" };
  }
  if (patch.digitalSlash !== undefined && typeof patch.digitalSlash !== "boolean") {
    return { kind: "noop", reason: "invalid" };
  }
  if (patch.digitalLabel !== undefined && typeof patch.digitalLabel !== "string") {
    return { kind: "noop", reason: "invalid" };
  }

  const previous = compactWireAppearance(wire.appearance);
  const next = compactWireAppearance({ ...wire.appearance, ...patch });
  if (sameWireAppearance(previous, next)) {
    return { kind: "noop", reason: "unchanged" };
  }

  wire.appearance = next;
  return { kind: "changed", appearance: next };
}

export function appearanceForNormalizedWire(
  source: Wire,
  start: Point,
  end: Point
): WireAppearance | undefined {
  const appearance = resolvedWireAppearance(source);
  const sourceStart = source.points[0];
  const sourceEnd = source.points[source.points.length - 1];
  const markerAtPoint = (point: Point) => {
    if (sourceStart && samePoint(point, sourceStart)) return appearance.startMarker;
    if (sourceEnd && samePoint(point, sourceEnd)) return appearance.endMarker;
    return "default";
  };
  const startMarker = markerAtPoint(start);
  const endMarker = markerAtPoint(end);

  if (startMarker === appearance.startMarker && endMarker === appearance.endMarker) {
    return source.appearance;
  }

  return compactWireAppearance({
    ...source.appearance,
    startMarker,
    endMarker
  });
}

export function wireEndpointDecorationGeometry(
  wire: Wire,
  endpoint: WireEndpoint,
  options: { connected?: boolean } = {}
): WireEndpointDecorationGeometry | null {
  const appearance = resolvedWireAppearance(wire);
  const marker = endpoint === "start" ? appearance.startMarker : appearance.endMarker;
  if (marker === "default") return null;

  const vector = endpointInwardUnitVector(wire.points, endpoint);
  if (!vector) return null;

  const endpointPoint = endpoint === "start" ? wire.points[0] : wire.points[wire.points.length - 1];
  const strokeWidth = wireUnitWidth(wire);
  if (marker === "circle") {
    return {
      endpoint,
      marker,
      center: { ...endpointPoint },
      strokeWidth,
      radius: 2 * strokeWidth
    };
  }

  const headSize = variableSymbolArrowHeadSize(strokeWidth);
  const tip = options.connected
    ? { ...endpointPoint }
    : {
        x: endpointPoint.x - vector.x * headSize.height,
        y: endpointPoint.y - vector.y * headSize.height
      };
  const baseCenter = options.connected
    ? {
        x: endpointPoint.x + vector.x * headSize.height,
        y: endpointPoint.y + vector.y * headSize.height
      }
    : endpointPoint;
  const perpendicular = { x: -vector.y, y: vector.x };
  const halfBase = headSize.base / 2;
  return {
    endpoint,
    marker,
    center: tip,
    strokeWidth,
    polygon: [
      tip,
      {
        x: baseCenter.x + perpendicular.x * halfBase,
        y: baseCenter.y + perpendicular.y * halfBase
      },
      {
        x: baseCenter.x - perpendicular.x * halfBase,
        y: baseCenter.y - perpendicular.y * halfBase
      }
    ]
  };
}

export function wireDigitalDecorationGeometry(wire: Wire): WireDigitalDecorationGeometry | null {
  const appearance = resolvedWireAppearance(wire);
  if (!appearance.digitalSlash) return null;
  const center = pointAtPathRatio(wire.points, 0.5);
  if (!center) return null;

  const strokeWidth = wireUnitWidth(wire);
  const halfProjection = DIGITAL_SLASH_HALF_PROJECTION * strokeWidth;
  return {
    center,
    slashStart: {
      x: center.x - halfProjection,
      y: center.y + halfProjection
    },
    slashEnd: {
      x: center.x + halfProjection,
      y: center.y - halfProjection
    },
    strokeWidth,
    label: appearance.digitalLabel.trim(),
    labelPosition: {
      x: center.x + DIGITAL_LABEL_X_OFFSET * strokeWidth,
      y: center.y + DIGITAL_LABEL_Y_OFFSET * strokeWidth
    }
  };
}

export function wireDigitalLocalGeometry(wire: Pick<Wire, "appearance">) {
  const strokeWidth = wireUnitWidth(wire);
  const halfProjection = DIGITAL_SLASH_HALF_PROJECTION * strokeWidth;
  return {
    slashPath: `M ${-halfProjection} ${halfProjection} L ${halfProjection} ${-halfProjection}`,
    strokeWidth,
    label: resolvedWireAppearance(wire).digitalLabel.trim(),
    labelX: DIGITAL_LABEL_X_OFFSET * strokeWidth,
    labelY: DIGITAL_LABEL_Y_OFFSET * strokeWidth
  };
}

export function wireDigitalLabelWidth(label: string) {
  return label.length * DIGITAL_LABEL_AVERAGE_CHARACTER_WIDTH;
}

function endpointInwardUnitVector(
  points: readonly Point[],
  endpoint: WireEndpoint
): Point | null {
  if (points.length < 2) return null;
  const originIndex = endpoint === "start" ? 0 : points.length - 1;
  const step = endpoint === "start" ? 1 : -1;
  const origin = points[originIndex];
  for (
    let index = originIndex + step;
    index >= 0 && index < points.length;
    index += step
  ) {
    const candidate = points[index];
    const dx = candidate.x - origin.x;
    const dy = candidate.y - origin.y;
    const length = Math.hypot(dx, dy);
    if (length > 0) return { x: dx / length, y: dy / length };
  }
  return null;
}

function pointAtPathRatio(points: readonly Point[], ratio: number): Point | null {
  if (points.length < 2) return null;
  const segments = points.slice(1).map((end, index) => {
    const start = points[index];
    return { start, end, length: Math.hypot(end.x - start.x, end.y - start.y) };
  }).filter((segment) => segment.length > 0);
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (totalLength === 0) return null;

  let remaining = totalLength * ratio;
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const segmentRatio = remaining / segment.length;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * segmentRatio,
        y: segment.start.y + (segment.end.y - segment.start.y) * segmentRatio
      };
    }
    remaining -= segment.length;
  }
  return { ...segments[segments.length - 1].end };
}

function sameWireAppearance(first: WireAppearance, second: WireAppearance) {
  return JSON.stringify(first) === JSON.stringify(second);
}

function samePoint(first: Point, second: Point) {
  return first.x === second.x && first.y === second.y;
}
