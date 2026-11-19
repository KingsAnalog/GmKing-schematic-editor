import { dia } from "@joint/core";
import type { ComponentInstance } from "./types";
import { resolveShapeGeometry, shapeArrows, shapeKind, type ShapeGeometry } from "./shapeModel";

const ShapeElement = (dia.Element as any).define("schematic.Shape", {
  markup: [
    { tagName: "path", selector: "body" },
    { tagName: "path", selector: "startArrow" },
    { tagName: "path", selector: "endArrow" }
  ],
  attrs: { body: {}, startArrow: {}, endArrow: {} }
});

export interface ShapeRenderOptions {
  locked?: boolean;
  selected?: boolean;
}

export function makeShapeCell(instance: ComponentInstance, options: ShapeRenderOptions = {}) {
  const geometry = resolveShapeGeometry(instance);
  const arrows = shapeArrows(geometry);
  const element = new ShapeElement({
    id: instance.id,
    position: { x: instance.x - geometry.width / 2, y: instance.y - geometry.height / 2 },
    size: { width: geometry.width, height: geometry.height },
    attrs: {
      body: shapeCellAttrs(geometry, options),
      startArrow: arrowCellAttrs(geometry, arrows.start),
      endArrow: arrowCellAttrs(geometry, arrows.end)
    }
  });
  (element as any).set("componentId", instance.id);
  (element as any).set("shape", true);
  element.attr("root/data-layer", "shape");
  element.attr("root/data-shape-kind", shapeKind(instance));
  if (instance.rotation) element.rotate(instance.rotation, true, { x: instance.x, y: instance.y });
  return element;
}

export function shapeCellAttrs(geometry: ShapeGeometry, options: ShapeRenderOptions = {}) {
  return {
    d: geometry.path,
    fill: geometry.fill === "none" ? "none" : geometry.fill,
    stroke: geometry.stroke === "none" ? "none" : geometry.stroke,
    strokeWidth: geometry.strokeWidth,
    strokeDasharray: geometry.dashArray,
    strokeLinejoin: "round",
    strokeLinecap: "round",
    cursor: options.locked ? "default" : "move",
    pointerEvents: options.locked ? "none" : "all",
    ...(options.selected ? { filter: "drop-shadow(0 0 2px #005f9e)" } : {})
  };
}

function arrowCellAttrs(geometry: ShapeGeometry, arrow: ReturnType<typeof shapeArrows>["start"]) {
  if (!arrow) return { d: "", fill: "none", stroke: "none", pointerEvents: "none" };
  return {
    d: arrow.d,
    fill: arrow.filled ? geometry.stroke : "none",
    stroke: geometry.stroke,
    strokeWidth: geometry.strokeWidth,
    strokeLinejoin: "round",
    strokeLinecap: "round",
    pointerEvents: "none"
  };
}


