import { componentScale } from "./componentScaleModel";
import { inductorCouplingLabel } from "./inductorCouplingModel";
import { inductorTap, isPlanarInductor, PLANAR_INDUCTOR_BODY_HALF_SIZE } from "./inductorModel";
import type { ComponentInstance, InductorCoupling, Point } from "./types";
import type { Rect } from "./view-geometry";

const WINDING_BODY_HALF_LENGTH = 26;
const WINDING_BODY_HALF_THICKNESS = 14;
const CORE_LINE_GAP = 7;
const CORE_SIDE_OFFSET = 23;
const ARROW_LENGTH = 7.5;
const ARROW_HALF_WIDTH = 3.25;
const ARROW_STROKE_OVERLAP = 1;
const GEOMETRY_PADDING = 8;
const LABEL_FONT_SIZE = 12;
const ARC_ENDPOINT_SIDE_WEIGHT = 3;
const ARC_ENDPOINT_CLEARANCE = 12;

export interface InductorCouplingGeometry {
  bounds: Rect;
  arcPath: string;
  corePath: string;
  arrowPath: string;
  hitPath: string;
  label: string;
  labelPosition: Point;
}

export function inductorCouplingGeometry(
  document: { components: readonly ComponentInstance[] },
  coupling: InductorCoupling
): InductorCouplingGeometry | null {
  const first = document.components.find((component) => component.id === coupling.inductorAId);
  const second = document.components.find((component) => component.id === coupling.inductorBId);
  if (!validEndpoint(first) || !validEndpoint(second)) return null;

  const core = coupling.showCore ? coreGeometry(first, second, coupling.arcFlipped) : null;
  const arc = coupling.showArc ? arcGeometry(first, second, coupling.arcFlipped) : null;
  const arcPath = arc?.path ?? "";
  const corePath = core?.path ?? "";
  const arrowPath = arc?.arrowPath ?? "";
  const hitPath = [arcPath, corePath].filter(Boolean).join(" ");
  const label = inductorCouplingLabel(document, coupling);
  const labelPosition = arc?.labelPosition ?? core?.labelPosition ?? midpoint(first, second);
  const points = [
    ...(arc?.points ?? []),
    ...(core?.points ?? []),
    labelPosition
  ];
  const bounds = boundsFor(points, label);
  return {
    bounds,
    arcPath,
    corePath,
    arrowPath,
    hitPath,
    label,
    labelPosition
  };
}

export function inductorCouplingFlipsReferenceLabel(
  document: {
    components: readonly ComponentInstance[];
    inductorCouplings?: readonly InductorCoupling[];
  },
  component: ComponentInstance
) {
  if (!validEndpoint(component)) return false;
  const axis = orientedAxis(component.rotation);
  const normal = { x: -axis.y, y: axis.x };
  const defaultSide = !isPlanarInductor(component) && inductorTap(component) === "top" ? 1 : -1;
  const penalties = new Map<number, number>([[1, 0], [-1, 0]]);

  for (const coupling of document.inductorCouplings ?? []) {
    if (!coupling.showCore) continue;
    const partnerId = coupling.inductorAId === component.id
      ? coupling.inductorBId
      : coupling.inductorBId === component.id
        ? coupling.inductorAId
        : null;
    if (!partnerId) continue;
    const partner = document.components.find((candidate) => candidate.id === partnerId);
    if (!validEndpoint(partner)) continue;
    const core = coreGeometry(component, partner, coupling.arcFlipped);
    if (!core) continue;
    const projectedDistance = dot(subtract(core.center, component), normal);
    if (Math.abs(projectedDistance) < 0.001) continue;
    const side = projectedDistance > 0 ? 1 : -1;
    penalties.set(side, (penalties.get(side) ?? 0) + 1 / Math.abs(projectedDistance));
  }

  return (penalties.get(-defaultSide) ?? 0) + 1e-9 < (penalties.get(defaultSide) ?? 0);
}

function validEndpoint(component: ComponentInstance | undefined): component is ComponentInstance {
  return !!component && component.type === "inductor" && !component.temporarilyDeleted;
}

function arcGeometry(first: ComponentInstance, second: ComponentInstance, flipped: boolean) {
  const delta = subtract(second, first);
  const distance = Math.max(1, Math.hypot(delta.x, delta.y));
  const direction = scale(delta, 1 / distance);
  const normal = { x: -direction.y, y: direction.x };
  const sign = flipped ? 1 : -1;
  const maximumReach = distance * 0.42;
  const arcSide = scale(normal, sign);
  const startDirection = normalize(add(
    direction,
    scale(arcSide, ARC_ENDPOINT_SIDE_WEIGHT)
  ));
  const endDirection = normalize(add(
    scale(direction, -1),
    scale(arcSide, ARC_ENDPOINT_SIDE_WEIGHT)
  ));
  const start = windingClearancePoint(first, startDirection, maximumReach);
  const end = windingClearancePoint(second, endDirection, maximumReach);
  const bulge = Math.max(24, Math.min(86, distance * 0.28));
  const control = add(midpoint(start, end), scale(normal, sign * bulge));
  const curveMid = quadraticPoint(start, control, end, 0.5);
  const labelPosition = add(curveMid, scale(normal, sign * 11));
  const startTangent = normalize(subtract(start, control));
  const endTangent = normalize(subtract(end, control));
  const visibleStart = add(start, scale(startTangent, -(ARROW_LENGTH - ARROW_STROKE_OVERLAP)));
  const visibleEnd = add(end, scale(endTangent, -(ARROW_LENGTH - ARROW_STROKE_OVERLAP)));
  return {
    path: `M ${number(visibleStart.x)} ${number(visibleStart.y)} Q ${number(control.x)} ${number(control.y)} ${number(visibleEnd.x)} ${number(visibleEnd.y)}`,
    arrowPath: [
      arrowTriangle(start, startTangent),
      arrowTriangle(end, endTangent)
    ].join(" "),
    labelPosition,
    points: [start, visibleStart, control, visibleEnd, end, labelPosition]
  };
}

function windingClearancePoint(
  component: ComponentInstance,
  direction: Point,
  maximumReach: number
) {
  return add(
    windingBoundaryPoint(component, direction, maximumReach),
    scale(direction, ARC_ENDPOINT_CLEARANCE)
  );
}

function windingBoundaryPoint(component: ComponentInstance, direction: Point, maximumReach: number) {
  const axis = canonicalAxis(component.rotation);
  const normal = { x: -axis.y, y: axis.x };
  const along = dot(direction, axis);
  const across = dot(direction, normal);
  const radius = isPlanarInductor(component) ? PLANAR_INDUCTOR_BODY_HALF_SIZE / Math.max(Math.abs(along), Math.abs(across)) : 1 / Math.sqrt(
    (along * along) / (WINDING_BODY_HALF_LENGTH * WINDING_BODY_HALF_LENGTH)
    + (across * across) / (WINDING_BODY_HALF_THICKNESS * WINDING_BODY_HALF_THICKNESS)
  );
  return add(component, scale(direction, Math.min(radius * componentScale(component), maximumReach)));
}

function coreGeometry(first: ComponentInstance, second: ComponentInstance, flipped: boolean) {
  const firstAxis = canonicalAxis(first.rotation);
  const secondAxis = canonicalAxis(second.rotation);
  if (Math.abs(dot(firstAxis, secondAxis)) < 0.999) return null;
  const axis = firstAxis;
  const normal = { x: -axis.y, y: axis.x };
  const firstAlong = dot(first, axis);
  const secondAlong = dot(second, axis);
  const firstNormal = dot(first, normal);
  const secondNormal = dot(second, normal);
  const alongDelta = Math.abs(secondAlong - firstAlong);
  const normalDelta = Math.abs(secondNormal - firstNormal);
  const sideBySide = normalDelta >= alongDelta;
  const firstHalfLength = (isPlanarInductor(first) ? PLANAR_INDUCTOR_BODY_HALF_SIZE : WINDING_BODY_HALF_LENGTH) * componentScale(first);
  const secondHalfLength = (isPlanarInductor(second) ? PLANAR_INDUCTOR_BODY_HALF_SIZE : WINDING_BODY_HALF_LENGTH) * componentScale(second);
  const alongStart = Math.min(firstAlong - firstHalfLength, secondAlong - secondHalfLength);
  const alongEnd = Math.max(firstAlong + firstHalfLength, secondAlong + secondHalfLength);
  const halfGap = CORE_LINE_GAP / 2;
  const normalCenter = sideBySide
    ? (firstNormal + secondNormal) / 2
    : (firstNormal + secondNormal) / 2 + (flipped ? 1 : -1)
      * (Math.max((isPlanarInductor(first) ? PLANAR_INDUCTOR_BODY_HALF_SIZE : CORE_SIDE_OFFSET - 9) * componentScale(first), (isPlanarInductor(second) ? PLANAR_INDUCTOR_BODY_HALF_SIZE : CORE_SIDE_OFFSET - 9) * componentScale(second)) + 9);
  const firstLineStart = fromBasis(axis, normal, alongStart, normalCenter - halfGap);
  const firstLineEnd = fromBasis(axis, normal, alongEnd, normalCenter - halfGap);
  const secondLineStart = fromBasis(axis, normal, alongStart, normalCenter + halfGap);
  const secondLineEnd = fromBasis(axis, normal, alongEnd, normalCenter + halfGap);
  const labelPosition = fromBasis(
    axis,
    normal,
    (alongStart + alongEnd) / 2,
    normalCenter + (flipped ? -1 : 1) * 14
  );
  const center = fromBasis(
    axis,
    normal,
    (alongStart + alongEnd) / 2,
    normalCenter
  );
  return {
    path: [
      linePath(firstLineStart, firstLineEnd),
      linePath(secondLineStart, secondLineEnd)
    ].join(" "),
    center,
    labelPosition,
    points: [firstLineStart, firstLineEnd, secondLineStart, secondLineEnd, labelPosition]
  };
}

function arrowTriangle(tip: Point, direction: Point) {
  const baseCenter = add(tip, scale(direction, -ARROW_LENGTH));
  const normal = { x: -direction.y, y: direction.x };
  const firstBase = add(baseCenter, scale(normal, ARROW_HALF_WIDTH));
  const secondBase = add(baseCenter, scale(normal, -ARROW_HALF_WIDTH));
  return `M ${number(tip.x)} ${number(tip.y)} L ${number(firstBase.x)} ${number(firstBase.y)} L ${number(secondBase.x)} ${number(secondBase.y)} Z`;
}

function linePath(start: Point, end: Point) {
  return `M ${number(start.x)} ${number(start.y)} L ${number(end.x)} ${number(end.y)}`;
}

function orientedAxis(rotation: number): Point {
  const radians = ((Math.round(rotation / 90) * 90) * Math.PI) / 180;
  const axis = { x: Math.cos(radians), y: Math.sin(radians) };
  return {
    x: Math.abs(axis.x) < 0.001 ? 0 : Math.round(axis.x),
    y: Math.abs(axis.y) < 0.001 ? 0 : Math.round(axis.y)
  };
}

function canonicalAxis(rotation: number): Point {
  let axis = orientedAxis(rotation);
  if (axis.x < -0.001 || (Math.abs(axis.x) < 0.001 && axis.y < 0)) axis = scale(axis, -1);
  return axis;
}

function fromBasis(axis: Point, normal: Point, along: number, perpendicular: number) {
  return add(scale(axis, along), scale(normal, perpendicular));
}

function quadraticPoint(start: Point, control: Point, end: Point, t: number) {
  const inverse = 1 - t;
  return {
    x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y
  };
}

function boundsFor(points: Point[], label: string): Rect {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const labelWidth = label.length * LABEL_FONT_SIZE * 0.62;
  const labelPoint = points[points.length - 1] ?? { x: 0, y: 0 };
  xs.push(labelPoint.x - labelWidth / 2, labelPoint.x + labelWidth / 2);
  ys.push(labelPoint.y - LABEL_FONT_SIZE / 2, labelPoint.y + LABEL_FONT_SIZE / 2);
  const left = Math.min(...xs) - GEOMETRY_PADDING;
  const top = Math.min(...ys) - GEOMETRY_PADDING;
  const right = Math.max(...xs) + GEOMETRY_PADDING;
  const bottom = Math.max(...ys) + GEOMETRY_PADDING;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

function midpoint(first: Point, second: Point): Point {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function add(first: Point, second: Point): Point {
  return { x: first.x + second.x, y: first.y + second.y };
}

function subtract(first: Point, second: Point): Point {
  return { x: first.x - second.x, y: first.y - second.y };
}

function scale(point: Point, factor: number): Point {
  return { x: point.x * factor, y: point.y * factor };
}

function dot(first: Point, second: Point) {
  return first.x * second.x + first.y * second.y;
}

function normalize(point: Point): Point {
  const length = Math.hypot(point.x, point.y);
  return length > 0 ? scale(point, 1 / length) : { x: 1, y: 0 };
}

function number(value: number) {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
