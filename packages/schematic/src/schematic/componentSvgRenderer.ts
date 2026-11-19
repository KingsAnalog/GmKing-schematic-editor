import { resolveComponentVisualModel, type ComponentRenderOptions } from "./componentVisualModel";
import { renderSymbolContentSvg } from "./symbolContentView";
import { SYMBOL_STROKE_WIDTH } from "./symbols/symbolPrimitives";
import { escapeAttribute, escapeHtml } from "./uiUtils";
import { componentCellPosition } from "./view-geometry";
import type { ComponentInstance } from "./types";
import { CLOCK_BUBBLE_STROKE_WIDTH } from "./symbols/clockSymbols";
import { SCHEMATIC_FONT_STACK } from "./schematicFont";

const PORT_MARKER_SIZE = 3 * SYMBOL_STROKE_WIDTH;

export type ComponentSvgRenderOptions = ComponentRenderOptions;

/** Serializes the shared component visual model without creating a JointJS cell. */
export function renderComponentSvg(
  component: ComponentInstance,
  options: ComponentSvgRenderOptions = {}
) {
  const model = resolveComponentVisualModel(component, options);
  const offset = { x: -model.frameBox.x, y: -model.frameBox.y };
  const symbolTransform = model.mirrored
    ? `matrix(${-model.artworkScale} 0 0 ${model.artworkScale} ${model.def.size.width - model.frameBox.x} ${offset.y})`
    : `translate(${offset.x} ${offset.y})${model.artworkScale === 1 ? "" : ` scale(${model.artworkScale})`}`;
  const position = componentCellPosition(component);
  const transform = [
    `translate(${number(position.x)} ${number(position.y)})`,
    component.rotation
      ? `rotate(${number(component.rotation)} ${number(model.frameBox.width / 2)} ${number(model.frameBox.height / 2)})`
      : ""
  ].filter(Boolean).join(" ");
  const crossPadding = 7;

  const parts = [
    renderPath("symbolBody", model.path, {
      transform: symbolTransform,
      fill: "none",
      stroke: model.isAnnotation ? "none" : model.color,
      strokeWidth: model.symbolStrokeWidth,
      opacity: model.symbolOpacity
    }),
    renderPath("symbolAccent", model.accentPath, {
      transform: symbolTransform,
      fill: "none",
      stroke: model.color,
      strokeWidth: model.accentStrokeWidth,
      strokeLinecap: model.def.type === "comparator" || model.def.type === "diffComparator" || model.def.type === "slicer" ? "round" : "butt",
      opacity: model.symbolOpacity
    }),
    renderPath("symbolTerminalLeads", model.terminalLeadPath, {
      transform: symbolTransform, fill: "none", stroke: model.color,
      strokeWidth: SYMBOL_STROKE_WIDTH / model.artworkScale, opacity: model.symbolOpacity
    }),
    renderPath("symbolPinMarks", model.pinMarksPath, {
      transform: symbolTransform,
      fill: "none",
      stroke: model.color,
      strokeWidth: SYMBOL_STROKE_WIDTH,
      strokeLinecap: "square",
      strokeLinejoin: "miter",
      opacity: model.symbolOpacity
    }),
    renderPath("symbolClockBubble", model.clockBubblePath, {
      transform: symbolTransform,
      fill: "none",
      stroke: model.color,
      strokeWidth: CLOCK_BUBBLE_STROKE_WIDTH,
      opacity: model.symbolOpacity
    }),
    renderPath("symbolMarker", model.markerPath, {
      transform: symbolTransform,
      fill: model.color,
      stroke: "none",
      opacity: model.symbolOpacity
    }),
    renderSymbolContentSvg(model.symbolContentLayout, {
      color: model.color,
      opacity: model.labelOpacity,
      offsetX: offset.x,
      offsetY: offset.y
    }),
    model.deleted
      ? renderPath(
          "deleteCross",
          `M ${crossPadding} ${crossPadding} L ${model.frameBox.width - crossPadding} ${model.frameBox.height - crossPadding} M ${model.frameBox.width - crossPadding} ${crossPadding} L ${crossPadding} ${model.frameBox.height - crossPadding}`,
          { fill: "none", stroke: "#b00020", strokeWidth: 3, opacity: 0.92 }
        )
      : "",
    renderSymbolLabel(model, offset),
    renderReferenceLabel(model),
    ...renderPorts(model)
  ].filter(Boolean);

  return `<g data-component-id="${escapeAttribute(component.id)}" transform="${escapeAttribute(transform)}">${parts.join("")}</g>`;
}

function renderSymbolLabel(
  model: ReturnType<typeof resolveComponentVisualModel>,
  offset: { x: number; y: number }
) {
  if (!model.showSymbolLabel || !model.labelText) return "";
  const x = model.labelLayout.x + offset.x;
  const y = model.labelLayout.y + offset.y;
  const lines = model.labelText.split("\n");
  const content = lines.length === 1
    ? escapeHtml(model.labelText)
    : lines.map((line, index) => {
        const dy = index === 0 ? 0.3 - (lines.length - 1) / 2 : 1;
        return `<tspan x="${number(x)}" dy="${number(dy)}em">${escapeHtml(line)}</tspan>`;
      }).join("");
  return `<text data-selector="label" x="${number(x)}" y="${number(y)}"${svgAttr("transform", model.labelTransform)} fill="${escapeAttribute(model.color)}" font-family="${escapeAttribute(SCHEMATIC_FONT_STACK)}" font-size="${number(model.labelLayout.fontSize)}" font-weight="${model.labelFontWeight}" text-anchor="${model.labelLayout.textAnchor}" dominant-baseline="${model.labelLayout.dominantBaseline}"${opacityAttr(model.labelOpacity)}>${content}</text>`;
}

function renderReferenceLabel(model: ReturnType<typeof resolveComponentVisualModel>) {
  if (!model.showRefLabel) return "";
  const attrs = model.refLabelAttrs;
  const common = `${svgAttr("transform", attrs.refLabel.transform)} fill="${escapeAttribute(model.color)}"${opacityAttr(model.labelOpacity)} font-family="${escapeAttribute(SCHEMATIC_FONT_STACK)}"`;
  return `<g data-selector="refLabel"${common}>${[
    absoluteRefText("refLabelSign", attrs.refLabelSign, model.refLabelSignFontSize, "normal", attrs.refLabel.dominantBaseline),
    absoluteRefText("refLabelPrefix", attrs.refLabelPrefix, model.refLabelPrefixFontSize, "normal", attrs.refLabel.dominantBaseline),
    absoluteRefText("refLabelHead", attrs.refLabelHead, model.refLabelHeadFontSize, "italic", attrs.refLabel.dominantBaseline),
    absoluteRefText("refLabelTail", attrs.refLabelTail, model.refLabelTailFontSize, "normal", attrs.refLabel.dominantBaseline),
    absoluteRefText("refLabelValue", attrs.refLabelValue, model.refLabelValueFontSize, "normal", attrs.refLabel.dominantBaseline),
    absoluteRefText("refLabelValueHead", attrs.refLabelValueHead, model.refLabelValueFontSize, "italic", attrs.refLabel.dominantBaseline),
    absoluteRefText("refLabelValueTail", attrs.refLabelValueTail, model.refLabelTailFontSize, "normal", attrs.refLabel.dominantBaseline)
  ].join("")}</g>`;
}

function absoluteRefText(
  selector: string,
  attrs: { text: string; x?: number; y?: number; textAnchor?: string },
  fontSize: number,
  fontStyle: "normal" | "italic",
  dominantBaseline?: string
) {
  if (!attrs.text) return "";
  return `<text data-selector="${selector}" x="${number(attrs.x ?? 0)}" y="${number(attrs.y ?? 0)}"${svgAttr("text-anchor", attrs.textAnchor)}${svgAttr("dominant-baseline", dominantBaseline)} font-weight="700" font-style="${fontStyle}" font-size="${number(fontSize)}">${escapeHtml(attrs.text)}</text>`;
}

function renderPorts(model: ReturnType<typeof resolveComponentVisualModel>) {
  if (!model.showPins) return [];
  return model.def.pins.map((pin) => {
    const centerX = (model.mirrored
      ? model.def.size.width / 2 - pin.x
      : pin.x + model.def.size.width / 2) - model.frameBox.x;
    const centerY = pin.y + model.def.size.height / 2 - model.frameBox.y;
    return `<rect data-pin-id="${escapeAttribute(pin.id)}" x="${number(centerX - PORT_MARKER_SIZE / 2)}" y="${number(centerY - PORT_MARKER_SIZE / 2)}" width="${number(PORT_MARKER_SIZE)}" height="${number(PORT_MARKER_SIZE)}" fill="#ffffff" stroke="${escapeAttribute(model.color)}" stroke-width="${number(SYMBOL_STROKE_WIDTH)}" />`;
  });
}

function renderPath(
  selector: string,
  d: string,
  attrs: {
    transform?: string;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    strokeLinecap?: string;
    strokeLinejoin?: string;
    opacity?: number;
  }
) {
  if (!d) return "";
  return `<path data-selector="${selector}" d="${escapeAttribute(d)}"${svgAttr("transform", attrs.transform)}${svgAttr("fill", attrs.fill)}${svgAttr("stroke", attrs.stroke)}${svgAttr("stroke-width", attrs.strokeWidth)}${svgAttr("stroke-linecap", attrs.strokeLinecap)}${svgAttr("stroke-linejoin", attrs.strokeLinejoin)}${opacityAttr(attrs.opacity ?? 1)} />`;
}

function opacityAttr(opacity: number) {
  return opacity === 1 ? "" : ` opacity="${number(opacity)}"`;
}

function svgAttr(name: string, value: unknown) {
  if (value === undefined || value === null || value === "") return "";
  return ` ${name}="${escapeAttribute(typeof value === "number" ? number(value) : String(value))}"`;
}

function number(value: number) {
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? "0" : String(rounded);
}
