import { snapPoint } from "../geometry";
import type { Point, SchematicDocument, WireAppearance, WireRouteMode, WireVariant } from "../types";
import { applyNormalizedDocumentWires } from "../document/documentWires";
import { connectGeometry } from "../connectionGraph";
import { clonePoints, extendWirePath, normalizeWirePath, wireRouteModeForPath } from "./wireGeometry";
import type { WireAngle } from "./wireAngle";

export interface WireRouteSession {
  variant: WireVariant;
  routeMode: WireAngle;
  points: Point[];
}

export type WireRouteIntent =
  | {
      kind: "pending";
      session: WireRouteSession;
      previewPoint: Point;
      status: string;
    }
  | {
      kind: "commit";
      points: Point[];
      routeMode: WireRouteMode;
    }
  | {
      kind: "invalid";
      session: WireRouteSession;
      status: string;
    };

export type WireCommitResult =
  | {
      kind: "committed";
      wireId: string;
      status: string;
    }
  | {
      kind: "none";
    };

export function createEmptyWireRouteSession(
  variant: WireVariant = "signal",
  routeMode: WireAngle = "orthogonal"
): WireRouteSession {
  return { variant, routeMode, points: [] };
}

export function wireRoutePointCount(session: WireRouteSession) {
  return session.points.length;
}

export function wireRouteAppearance(session: WireRouteSession): WireAppearance {
  return { variant: session.variant };
}

export function applyWireCommitToDocument(
  document: SchematicDocument,
  points: Point[],
  appearance: WireAppearance,
  createId: () => string,
  routeMode: WireRouteMode = wireRouteModeForPath(points),
  layerId?: string
): WireCommitResult {
  const normalizedPoints = normalizeWirePath(points);
  if (normalizedPoints.length < 2) return { kind: "none" };
  applyNormalizedDocumentWires(document);
  const wireId = createId();
  document.wires.push({
    id: wireId,
    ...(layerId === undefined ? {} : { layerId }),
    points: normalizedPoints,
    routeMode,
    appearance
  });
  connectGeometry(document, { wireIds: new Set([wireId]), componentIds: new Set() });
  applyNormalizedDocumentWires(document);
  return {
    kind: "committed",
    wireId,
    status: `${appearance.variant === "wide" ? "Wide wire" : "Wire"} added. Click another start point or press Esc.`
  };
}

export function handleWireBlankRouteClick(session: WireRouteSession, point: Point): WireRouteIntent {
  const snapped = snapPoint(point);
  if (session.points.length === 0) {
    return {
      kind: "pending",
      session: { variant: session.variant, routeMode: session.routeMode, points: [snapped] },
      previewPoint: snapped,
      status: `Wire start ${snapped.x}, ${snapped.y}. Click to add bends. Double-click or press Enter to finish.`
    };
  }

  return {
    kind: "pending",
    session: {
      variant: session.variant,
      routeMode: session.routeMode,
      points: extendWirePath(session.points, snapped, session.routeMode)
    },
    previewPoint: snapped,
    status: `Bend added at ${snapped.x}, ${snapped.y}. Double-click or press Enter to finish.`
  };
}

export function handleWirePinRouteClick(session: WireRouteSession, point: Point): WireRouteIntent {
  const snapped = snapPoint(point);
  if (session.points.length === 0) {
    return {
      kind: "pending",
      session: { variant: session.variant, routeMode: session.routeMode, points: [snapped] },
      previewPoint: snapped,
      status: "Wire started from pin. Click to add bends. Double-click or press Enter to finish."
    };
  }
  return handleWireBlankRouteClick(session, snapped);
}

export function finishWireRoute(session: WireRouteSession, point: Point | null): WireRouteIntent {
  if (session.points.length < 1) {
    return {
      kind: "invalid",
      session: createEmptyWireRouteSession(session.variant, session.routeMode),
      status: "Click a start point before finishing a wire."
    };
  }
  const points = point ? extendWirePath(session.points, point, session.routeMode) : clonePoints(session.points);
  if (points.length < 2) {
    return {
      kind: "invalid",
      session: { variant: session.variant, routeMode: session.routeMode, points: clonePoints(session.points) },
      status: "Wire needs at least two distinct points."
    };
  }
  return { kind: "commit", points, routeMode: wireRouteModeForPath(points) };
}

export function wireRoutePreviewPath(session: WireRouteSession, point: Point | null) {
  if (session.points.length === 0 || !point) return null;
  const points = normalizeWirePath(extendWirePath(session.points, point, session.routeMode));
  return points.length >= 2 ? points : null;
}
