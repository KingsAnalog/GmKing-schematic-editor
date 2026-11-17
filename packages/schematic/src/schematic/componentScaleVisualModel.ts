import type { ComponentDef, ComponentInstance } from "./types";
import type { resolveRazaviComponentVisualModel } from "./razaviComponentVisualModel";
import { componentNameLabelAttrs } from "./razaviComponentVisualModel";
import { componentLabelVisible } from "./componentPropertyModel";
import { componentSymbolBounds, svgPathBounds, type Rect } from "./view-geometry";
import { measureSymbolText, type SymbolContentLayout } from "./symbolContentModel";
import { isFunctionBlockType } from "./functionBlockModel";

type Appearance = ReturnType<typeof resolveRazaviComponentVisualModel>;

/** Scale artwork separately from readable text and the fixed-width terminal leads. */
export function scaleComponentAppearance(base: Appearance, instance: ComponentInstance, def: ComponentDef, frame: Rect, scale: number, flipReferenceLabelSide = false): Appearance {
  if (scale === 1) return base;
  const result = { ...base, def, frameBox: frame };
  const valueText = [base.refLabelAttrs.refLabelValue, base.refLabelAttrs.refLabelValueHead, base.refLabelAttrs.refLabelValueTail].map(span => span.text).join("");
  result.refLabelAttrs = componentNameLabelAttrs(instance, def, frame, componentSymbolBounds(def), componentLabelVisible(instance), valueText, flipReferenceLabelSide);

  // Centered names are internal text too (amp, impedance, rectangle, etc.).
  if (def.centeredRefLabel) fitCenteredReference(result, scale);

  const layout = base.labelLayout;
  const internal = instance.type !== "vdd" && instance.type !== "annotation";
  const lines = base.labelText.split("\n");
  const width = Math.max(1, ...lines.map(line => measureSymbolText(line, layout.fontSize)));
  const body = svgPathBounds(base.accentPath);
  const availableWidth = body ? (2 * Math.min(layout.x - body.x, body.x + body.width - layout.x) - 8) * scale : def.size.width - 48 * scale;
  const availableHeight = body ? (body.height - 8) * scale : def.size.height - 48 * scale;
  const textScale = internal ? Math.min(1, Math.max(1, availableWidth) / (width * 1.1),
    Math.max(1, availableHeight) / (layout.fontSize * lines.length * 1.1)) : 1;
  const baselineOffset = lines.length === 1 ? layout.fontSize * 0.3 : 0;
  result.labelLayout = { ...layout, x: layout.x * scale,
    y: (layout.y - baselineOffset) * scale + baselineOffset * textScale,
    fontSize: layout.fontSize * textScale };
  if (base.labelTransform) {
    const x = result.labelLayout.x - frame.x;
    const y = result.labelLayout.y - frame.y;
    result.labelTransform = instance.rotation ? `rotate(${-instance.rotation} ${x} ${y})` : "";
  }
  result.symbolContentLayout = scaleContent(base.symbolContentLayout, def, scale);
  return result;
}

function fitCenteredReference(model: Appearance, scale: number) {
  const attrs = model.refLabelAttrs;
  const pairs = [
    ["refLabelSign", "refLabelSignFontSize"], ["refLabelPrefix", "refLabelPrefixFontSize"],
    ["refLabelHead", "refLabelHeadFontSize"], ["refLabelTail", "refLabelTailFontSize"],
    ["refLabelValue", "refLabelValueFontSize"], ["refLabelValueHead", "refLabelValueFontSize"],
    ["refLabelValueTail", "refLabelTailFontSize"]
  ] as const;
  const width = pairs.reduce((sum, [key, font]) => sum + measureSymbolText(attrs[key].text, model[font]), 0);
  const fit = Math.min(1, Math.max(1, model.def.size.width - 48 * scale) / Math.max(1, width),
    Math.max(1, model.def.size.height - 44 * scale) / model.refLabelHeadFontSize);
  if (fit === 1) return;
  const center = attrs.refLabel;
  pairs.forEach(([key]) => {
    attrs[key].x = center.x + (attrs[key].x - center.x) * fit;
    attrs[key].y = center.y + (attrs[key].y - center.y) * fit;
  });
  for (const font of new Set(pairs.map(([, font]) => font))) model[font] *= fit;
}

function scaleContent(layout: SymbolContentLayout | null, def: ComponentDef, scale: number): SymbolContentLayout | null {
  if (!layout) return null;
  if (def.type === "dff") return scaleDffContent(layout, scale);
  const { bounds } = layout;
  // Formula runs and fraction rules form one layout; graphics fill the symbol.
  const formula = isFunctionBlockType(def.type) && layout.runs.length > 0;
  const fit = formula ? Math.min(1,
    Math.max(1, def.size.width - 48 * scale) / Math.max(1, bounds.width),
    Math.max(1, def.size.height - 44 * scale) / Math.max(1, bounds.height)) : scale;
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const x = (value: number) => formula ? cx * scale + (value - cx) * fit : value * scale;
  const y = (value: number) => formula ? cy * scale + (value - cy) * fit : value * scale;
  const textScale = formula ? fit : Math.min(1, scale);
  return {
    bounds: { x: x(bounds.x), y: y(bounds.y), width: bounds.width * fit, height: bounds.height * fit },
    runs: layout.runs.map(run => ({ ...run, x: x(run.x),
      y: formula ? y(run.y) : (run.y - run.fontSize * 0.35) * scale + run.fontSize * 0.35 * textScale,
      width: run.width * textScale, fontSize: run.fontSize * textScale })),
    paths: layout.paths.map(path => ({ ...path, scale: (path.scale ?? 1) * fit,
      translateX: x(path.translateX), translateY: y(path.translateY) }))
  };
}

function scaleDffContent(layout: SymbolContentLayout, scale: number): SymbolContentLayout {
  const { bounds } = layout;
  const centers = layout.runs.map(run => ({ x: run.x,
    y: run.y - (run.counterRotation === 180 ? -1 : 1) * run.fontSize * 0.35 }));
  let fit = 1;
  layout.runs.forEach((run, i) => {
    const center = centers[i];
    const roomX = 2 * Math.min(center.x - bounds.x, bounds.x + bounds.width - center.x) - 4;
    const roomY = 2 * Math.min(center.y - bounds.y, bounds.y + bounds.height - center.y) - 4;
    fit = Math.min(fit, roomX * scale / Math.max(1, run.width), roomY * scale / run.fontSize);
    layout.runs.slice(i + 1).forEach((other, j) => {
      const otherCenter = centers[i + j + 1];
      // Text boxes must remain separated on at least one axis.
      fit = Math.min(fit, Math.max(
        Math.abs(center.x - otherCenter.x) * scale * 0.9 / Math.max(1, (run.width + other.width) / 2),
        Math.abs(center.y - otherCenter.y) * scale * 0.9 / ((run.fontSize + other.fontSize) / 2)
      ));
    });
  });
  fit = Math.max(0.1, fit);
  const runs = layout.runs.map((run, i) => ({ ...run, x: centers[i].x * scale,
    y: centers[i].y * scale + (run.counterRotation === 180 ? -1 : 1) * run.fontSize * 0.35 * fit,
    width: run.width * fit, fontSize: run.fontSize * fit }));
  return {
    bounds: { x: bounds.x * scale, y: bounds.y * scale, width: bounds.width * scale, height: bounds.height * scale },
    runs,
    paths: layout.paths.map(path => {
      const pivot = path.counterRotation;
      const index = pivot ? layout.runs.findIndex(run => run.x === pivot.x && run.y === pivot.y) : -1;
      if (index < 0) return { ...path, scale, translateX: path.translateX * scale, translateY: path.translateY * scale };
      return { ...path, scale: fit,
        translateX: runs[index].x - pivot!.x * fit,
        translateY: runs[index].y - pivot!.y * fit };
    })
  };
}
