import { resolveComponentVisualModel, type ComponentRenderOptions } from "./componentVisualModel";
import { measureSymbolText } from "./symbolContentModel";
import { componentCellPosition, componentVisualBounds, svgPathBounds, unionRects, type Rect } from "./view-geometry";
import type { ComponentInstance, Point } from "./types";

/** Export bounds include text; selection and pin geometry keep their existing frame. */
export function componentExportBounds(instance: ComponentInstance, options: ComponentRenderOptions = {}): Rect {
  const model = resolveComponentVisualModel(instance, options);
  const rects = [componentVisualBounds(instance)];
  const position = componentCellPosition(instance);
  const center = { x: model.frameBox.width / 2, y: model.frameBox.height / 2 };
  const offset = { x: -model.frameBox.x, y: -model.frameBox.y };
  const addText = (text: string, x: number, y: number, fontSize: number,
    anchor = "start", baseline = "alphabetic", transform = "") => {
    if (!text) return;
    const bounds = textBounds(text, x, y, fontSize, anchor, baseline);
    const corners = [
      { x: bounds.x, y: bounds.y }, { x: bounds.x + bounds.width, y: bounds.y },
      { x: bounds.x, y: bounds.y + bounds.height },
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height }
    ].map(point => {
      const local = transformPoint(point, transform);
      const rotated = rotateAround(local, instance.rotation, center);
      return { x: position.x + rotated.x, y: position.y + rotated.y };
    });
    const xs = corners.map(point => point.x);
    const ys = corners.map(point => point.y);
    rects.push({ x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) });
  };

  const isArc = instance.type === "arc";
  if (isArc || instance.type === "circle" || instance.type === "polygon") {
    const { x, y, width, height } = rects[0];
    const padding = model.symbolStrokeWidth * model.artworkScale / 2;
    rects[0] = { x: x - padding, y: y - padding, width: width + 2 * padding, height: height + 2 * padding };
    if (!isArc || !model.markerPath) return rects[0];
  }

  if (isArc || instance.type === "polyline") {
    const paths = [{ path: model.markerPath, padding: 0 }];
    if (!isArc) paths.push({ path: model.path, padding: model.symbolStrokeWidth / 2 });
    paths.forEach(({ path, padding }) => {
      const bounds = svgPathBounds(path);
      if (!bounds) return;
      const scale = model.artworkScale;
      const corners = [
        { x: bounds.x - padding, y: bounds.y - padding },
        { x: bounds.x + bounds.width + padding, y: bounds.y + bounds.height + padding }
      ].map(point => {
        const x = point.x * scale;
        const y = point.y * scale;
        return {
          x: (instance.mirrored ? model.def.size.width - x : x) + offset.x,
          y: y + offset.y
        };
      });
      const [first, last] = corners;
      const world = [first, last, { x: first.x, y: last.y }, { x: last.x, y: first.y }]
        .map(point => rotateAround(point, instance.rotation, center));
      const xs = world.map(point => point.x);
      const ys = world.map(point => point.y);
      rects.push({
        x: position.x + Math.min(...xs), y: position.y + Math.min(...ys),
        width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys)
      });
    });
  }

  if (model.showRefLabel) {
    const attrs = model.refLabelAttrs;
    const spans = [
      [attrs.refLabelSign, model.refLabelSignFontSize],
      [attrs.refLabelPrefix, model.refLabelPrefixFontSize],
      [attrs.refLabelHead, model.refLabelHeadFontSize],
      [attrs.refLabelTail, model.refLabelTailFontSize],
      [attrs.refLabelValue, model.refLabelValueFontSize],
      [attrs.refLabelValueHead, model.refLabelValueFontSize],
      [attrs.refLabelValueTail, model.refLabelTailFontSize]
    ] as const;
    spans.forEach(([span, fontSize]) => addText(span.text, span.x, span.y, fontSize,
      span.textAnchor, attrs.refLabel.dominantBaseline, attrs.refLabel.transform));
  }
  if (model.showSymbolLabel && model.labelText) {
    const layout = model.labelLayout;
    const lines = model.labelText.split("\n");
    lines.forEach((line, index) => addText(line, layout.x + offset.x,
      layout.y + offset.y + (lines.length > 1 ? 0.3 - (lines.length - 1) / 2 + index : 0) * layout.fontSize,
      layout.fontSize, layout.textAnchor, layout.dominantBaseline, model.labelTransform));
  }
  model.symbolContentLayout?.runs.forEach(run => {
    const x = run.x + offset.x;
    const y = run.y + offset.y;
    addText(run.text, x, y, run.fontSize, run.textAnchor, "alphabetic",
      run.counterRotation ? `rotate(${-run.counterRotation} ${x} ${y})` : "");
  });
  return unionRects(rects)!;
}

function textBounds(text: string, x: number, y: number, fontSize: number, anchor: string, baseline: string): Rect {
  // Stay DOM-free for portable SVG export. Allow for bold/italic ink and font fallback.
  const width = Array.from(text).reduce((sum, character) => sum + (
    /[^\u0000-\u02ff]/u.test(character) && !/\p{M}/u.test(character)
      ? Math.max(fontSize, measureSymbolText(character, fontSize))
      : measureSymbolText(character, fontSize)
  ), 0) * 1.1;
  const bearing = fontSize * 0.2;
  const left = x - (anchor === "end" ? width : anchor === "middle" ? width / 2 : 0);
  const top = y - (baseline === "text-before-edge" ? 0
    : baseline === "text-after-edge" ? fontSize * 1.2
    : baseline === "central" || baseline === "middle" ? fontSize * 0.6 : fontSize);
  return { x: left - bearing, y: top - bearing, width: width + 2 * bearing, height: fontSize * 1.4 + 2 * bearing };
}

function rotateAround(point: Point, degrees: number, center: Point): Point {
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const x = point.x - center.x;
  const y = point.y - center.y;
  return { x: center.x + x * cos - y * sin, y: center.y + x * sin + y * cos };
}

/** SVG transform lists apply from right to left, before the component rotation. */
function transformPoint(point: Point, transform: string): Point {
  const operations = [...transform.matchAll(/(matrix|translate|scale|rotate)\(([^)]+)\)/g)].reverse();
  return operations.reduce((point, [, kind, args]) => {
    const values = args.trim().split(/[\s,]+/).map(Number);
    const [a, b, c, d, e, f] = values;
    switch (kind) {
      case "rotate": return rotateAround(point, a, { x: b ?? 0, y: c ?? 0 });
      case "translate": return { x: point.x + a, y: point.y + (b ?? 0) };
      case "scale": return { x: point.x * a, y: point.y * (b ?? a) };
      case "matrix": return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
      default: return point;
    }
  }, point);
}
