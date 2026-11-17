import { isHorizontal, orthogonalRoute, pointOnSegment, samePoint, snapPoint } from "../geometry";
import type { Point, Wire, WireRouteMode } from "../types";

export function samePath(a: Point[], b: Point[]) {
  return a.length === b.length && a.every((point, index) => samePoint(point, b[index]));
}

export function clonePoints(points: Point[]) {
  return points.map((point) => ({ x: point.x, y: point.y }));
}

export function normalizeWirePath(points: Point[]) {
  const deduped = points
    .map((point) => snapPoint(point))
    .filter((point, index, list) => index === 0 || !samePoint(point, list[index - 1]));
  const normalized: Point[] = [];
  deduped.forEach((point) => {
    normalized.push(point);
    while (normalized.length >= 3) {
      const a = normalized[normalized.length - 3];
      const b = normalized[normalized.length - 2];
      const c = normalized[normalized.length - 1];
      const collinear = (b.x - a.x) * (c.y - b.y) === (b.y - a.y) * (c.x - b.x);
      if (!collinear) break;
      normalized.splice(normalized.length - 2, 1);
    }
  });
  return normalized.filter((point, index, list) => index === 0 || !samePoint(point, list[index - 1]));
}

interface RerouteWireEndpointOptions {
  preserveMovedEndpointDirection?: boolean;
  preserveOppositeEndpointDirection?: boolean;
  routeMode?: Wire["routeMode"];
}

export function rerouteWireEndpoint(
  points: Point[],
  oldPoint: Point,
  nextPoint: Point,
  options: RerouteWireEndpointOptions = {}
) {
  const snapped = points.map((point) => snapPoint(point));
  if (snapped.length < 2) return snapped;
  if (options.routeMode === "freeAngle") {
    return rerouteFreeAngleEndpoint(snapped, oldPoint, nextPoint);
  }
  const first = snapped[0];
  const last = snapped[snapped.length - 1];
  if (samePoint(first, oldPoint)) {
    const second = snapped[1];
    const horizontal = isHorizontal(first, second);
    const route = options.preserveMovedEndpointDirection
      ? orthogonalRouteWithStartDirection(nextPoint, second, horizontal)
      : options.preserveOppositeEndpointDirection
        ? orthogonalRouteWithEndDirection(nextPoint, second, horizontal)
        : orthogonalRoute(nextPoint, second);
    return normalizeWirePath([...route, ...snapped.slice(2)]);
  }
  if (samePoint(last, oldPoint)) {
    const previous = snapped[snapped.length - 2];
    const horizontal = isHorizontal(previous, last);
    const route = options.preserveMovedEndpointDirection
      ? orthogonalRouteWithEndDirection(previous, nextPoint, horizontal)
      : options.preserveOppositeEndpointDirection
        ? orthogonalRouteWithStartDirection(previous, nextPoint, horizontal)
        : orthogonalRoute(previous, nextPoint);
    return normalizeWirePath([...snapped.slice(0, -2), ...route]);
  }
  if (
    pointOnSegment(oldPoint, first, snapped[1], true) &&
    Math.hypot(oldPoint.x - first.x, oldPoint.y - first.y) <= Math.hypot(oldPoint.x - snapped[1].x, oldPoint.y - snapped[1].y)
  ) {
    const horizontal = isHorizontal(first, snapped[1]);
    const route = options.preserveMovedEndpointDirection
      ? orthogonalRouteWithStartDirection(nextPoint, snapped[1], horizontal)
      : options.preserveOppositeEndpointDirection
        ? orthogonalRouteWithEndDirection(nextPoint, snapped[1], horizontal)
        : orthogonalRoute(nextPoint, snapped[1]);
    return normalizeWirePath([...route, ...snapped.slice(2)]);
  }
  if (
    pointOnSegment(oldPoint, snapped[snapped.length - 2], last, true) &&
    Math.hypot(oldPoint.x - last.x, oldPoint.y - last.y) <=
      Math.hypot(oldPoint.x - snapped[snapped.length - 2].x, oldPoint.y - snapped[snapped.length - 2].y)
  ) {
    const previous = snapped[snapped.length - 2];
    const horizontal = isHorizontal(previous, last);
    const route = options.preserveMovedEndpointDirection
      ? orthogonalRouteWithEndDirection(previous, nextPoint, horizontal)
      : options.preserveOppositeEndpointDirection
        ? orthogonalRouteWithStartDirection(previous, nextPoint, horizontal)
        : orthogonalRoute(previous, nextPoint);
    return normalizeWirePath([...snapped.slice(0, -2), ...route]);
  }
  const changed = snapped.map((point) => (samePoint(point, oldPoint) ? snapPoint(nextPoint) : point));
  return normalizeWirePath(changed);
}

function rerouteFreeAngleEndpoint(points: Point[], oldPoint: Point, nextPoint: Point) {
  const first = points[0];
  const last = points[points.length - 1];
  const target = snapPoint(nextPoint);
  if (samePoint(first, oldPoint)) return normalizeWirePath([target, ...points.slice(1)]);
  if (samePoint(last, oldPoint)) return normalizeWirePath([...points.slice(0, -1), target]);
  if (
    pointOnSegment(oldPoint, first, points[1], true)
    && Math.hypot(oldPoint.x - first.x, oldPoint.y - first.y)
      <= Math.hypot(oldPoint.x - points[1].x, oldPoint.y - points[1].y)
  ) {
    return normalizeWirePath([target, ...points.slice(1)]);
  }
  if (
    pointOnSegment(oldPoint, points[points.length - 2], last, true)
    && Math.hypot(oldPoint.x - last.x, oldPoint.y - last.y)
      <= Math.hypot(oldPoint.x - points[points.length - 2].x, oldPoint.y - points[points.length - 2].y)
  ) {
    return normalizeWirePath([...points.slice(0, -1), target]);
  }
  return normalizeWirePath(points.map((point) => samePoint(point, oldPoint) ? target : point));
}

function orthogonalRouteWithStartDirection(start: Point, end: Point, horizontal: boolean) {
  const first = snapPoint(start);
  const last = snapPoint(end);
  if (first.x === last.x || first.y === last.y) return [first, last];
  return horizontal
    ? [first, { x: last.x, y: first.y }, last]
    : [first, { x: first.x, y: last.y }, last];
}

function orthogonalRouteWithEndDirection(start: Point, end: Point, horizontal: boolean) {
  return orthogonalRouteWithStartDirection(end, start, horizontal).reverse();
}

export function extendOrthogonalPath(points: Point[], point: Point) {
  const result = points.map((candidate) => snapPoint(candidate));
  const snapped = snapPoint(point);
  const last = result[result.length - 1];
  if (!last) return [snapped];
  orthogonalRoute(last, snapped).slice(1).forEach((candidate) => {
    if (!samePoint(candidate, result[result.length - 1])) result.push(candidate);
  });
  return result;
}

export function extendWirePath(points: Point[], point: Point, routeMode: WireRouteMode) {
  if (routeMode === "orthogonal") return extendOrthogonalPath(points, point);
  const result = points.map((candidate) => snapPoint(candidate));
  const snapped = snapPoint(point);
  if (!samePoint(snapped, result[result.length - 1])) result.push(snapped);
  return result;
}

export function wireRouteModeForPath(points: readonly Point[]): WireRouteMode {
  return points.slice(1).some((point, index) => {
    const previous = points[index];
    return !samePoint(previous, point)
      && previous.x !== point.x
      && previous.y !== point.y;
  }) ? "freeAngle" : "orthogonal";
}

export function pointOnPath(point: Point, points: Point[]) {
  const snapped = snapPoint(point);
  for (let index = 1; index < points.length; index += 1) {
    if (pointOnSegment(snapped, points[index - 1], points[index])) return true;
  }
  return false;
}

export function uniformPathDelta(previousPoints: Point[], nextPoints: Point[]) {
  if (previousPoints.length !== nextPoints.length || previousPoints.length === 0) return null;
  const previous = previousPoints.map((point) => snapPoint(point));
  const next = nextPoints.map((point) => snapPoint(point));
  const delta = { x: next[0].x - previous[0].x, y: next[0].y - previous[0].y };
  const isUniform = previous.every((point, index) => next[index].x - point.x === delta.x && next[index].y - point.y === delta.y);
  return isUniform && (delta.x !== 0 || delta.y !== 0) ? delta : null;
}
