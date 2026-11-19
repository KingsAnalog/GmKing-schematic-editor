import { escapeAttribute } from "./uiUtils";
import type { ComponentInstance, Point } from "./types";
import { resolveShapeGeometry, shapeArrows, shapeKind } from "./shapeModel";

export function renderShapeSvg(instance: ComponentInstance): string {
  const geometry = resolveShapeGeometry(instance);
  const transform = [
    `translate(${number(instance.x)} ${number(instance.y)})`,
    instance.rotation ? `rotate(${instance.rotation})` : ""
  ].filter(Boolean).join(" ");
  const arrows = shapeArrows(geometry);
  const arrowSvg = (arrow: typeof arrows.start) => arrow
    ? `<path d="${escapeAttribute(arrow.d)}" fill="${arrow.filled ? escapeAttribute(geometry.stroke) : "none"}" stroke="${escapeAttribute(geometry.stroke)}" stroke-width="${number(geometry.strokeWidth)}" stroke-linejoin="round" stroke-linecap="round" />`
    : "";
  return `<g data-shape-id="${escapeAttribute(instance.id)}" data-shape-kind="${escapeAttribute(shapeKind(instance))}" transform="${transform}"><path d="${escapeAttribute(geometry.path)}" fill="${escapeAttribute(geometry.fill)}" stroke="${escapeAttribute(geometry.stroke)}" stroke-width="${number(geometry.strokeWidth)}" stroke-linejoin="round" stroke-linecap="round"${geometry.dashArray === "none" ? "" : ` stroke-dasharray="${geometry.dashArray}"`} />${arrowSvg(arrows.start)}${arrowSvg(arrows.end)}</g>`;
}

export function shapeExportBounds(instance: ComponentInstance) {
  const geometry = resolveShapeGeometry(instance);
  const corners = [
    { x: -geometry.width / 2, y: -geometry.height / 2 },
    { x: geometry.width / 2, y: -geometry.height / 2 },
    { x: geometry.width / 2, y: geometry.height / 2 },
    { x: -geometry.width / 2, y: geometry.height / 2 }
  ].map(point => rotatePoint(point, instance.rotation));
  const xs = corners.map(point => point.x);
  const ys = corners.map(point => point.y);
  return {
    x: instance.x + Math.min(...xs),
    y: instance.y + Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  };
}

function rotatePoint(point: Point, rotation: number) {
  if (!rotation) return point;
  const radians = rotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: point.x * cos - point.y * sin,
    y: point.x * sin + point.y * cos
  };
}

function number(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
