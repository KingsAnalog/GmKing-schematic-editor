import { dia, g } from "@joint/core";
import {
  ANALOG_BUFFER_LABEL_FONT_SIZE,
  REF_LABEL_FONT_SIZE,
  REF_LABEL_TAIL_FONT_SIZE,
  resolveComponentVisualModel,
  type ComponentRenderOptions
} from "./componentVisualModel";
import { SYMBOL_STROKE_WIDTH } from "./symbols/symbolPrimitives";
import { PREVIEW_COMPONENT_ID } from "./previewIds";
import { SYMBOL_GRID_SIZE, type ComponentInstance } from "./types";
import { CLOCK_BUBBLE_STROKE_WIDTH } from "./symbols/clockSymbols";
import { polylineFrameSymbol } from "./symbols/polylineSymbols";
import { isLibraryShapeType, isOpenLibraryShapeType } from "./libraryShapeStyleModel";
import { t } from "./schematicI18n";
import { TRIANGLE_VERTICES } from "./triangleComponentModel";
import { SCHEMATIC_FONT_STACK } from "./schematicFont";
import {
  symbolContentCellAttrs,
  symbolContentDefaultAttrs,
  symbolContentMarkup
} from "./symbolContentView";

export { PREVIEW_COMPONENT_ID };
export const PORT_MARKER_STROKE_WIDTH = SYMBOL_STROKE_WIDTH;
export const PORT_MARKER_INNER_SIZE = 2 * SYMBOL_STROKE_WIDTH;
export const PORT_MARKER_SIZE = PORT_MARKER_INNER_SIZE + PORT_MARKER_STROKE_WIDTH;
export const RECTANGLE_RESIZE_HANDLE_SIZE = 8;
export const RECTANGLE_RESIZE_HANDLES = ["nw", "ne", "se", "sw", "n", "e", "s", "w"] as const;
export const RECTANGLE_RESIZE_HANDLE_SELECTORS = RECTANGLE_RESIZE_HANDLES.map(handle =>
  `rectangleResize${handle[0].toUpperCase()}${handle.slice(1)}`
);
export { ANALOG_BUFFER_LABEL_FONT_SIZE };

export class SymbolElementView<E extends dia.Element = dia.Element> extends dia.ElementView<E> {
  protected snapToGrid(_evt: dia.Event, x: number, y: number): dia.Point {
    // Rotated asymmetric frames can have a half-grid cell origin. Snap movement
    // relative to that origin so the component center and its pins stay on-grid.
    const origin = this.model.position();
    const grid = this.paper?.options.gridSize ?? 1;
    return {
      x: origin.x + g.snapToGrid(x - origin.x, grid),
      y: origin.y + g.snapToGrid(y - origin.y, grid)
    };
  }
}

export const SymbolElement = (dia.Element as any).define(
  "eda.Symbol",
  {
    attrs: {
      frame: { fill: "transparent", stroke: "none", pointerEvents: "none" },
      symbolBody: { fill: "none", stroke: "#111111", strokeWidth: SYMBOL_STROKE_WIDTH },
      symbolAccent: { fill: "none", stroke: "#111111", strokeWidth: SYMBOL_STROKE_WIDTH, pointerEvents: "none" },
      symbolPinMarks: { fill: "none", stroke: "#111111", strokeWidth: SYMBOL_STROKE_WIDTH, pointerEvents: "none" },
      symbolClockBubble: { fill: "none", stroke: "#111111", strokeWidth: CLOCK_BUBBLE_STROKE_WIDTH, pointerEvents: "none" },
      symbolMarker: { fill: "#111111", stroke: "none", pointerEvents: "none" },
      ...symbolContentDefaultAttrs(),
      switchBladeHit: { fill: "none", stroke: "transparent", strokeWidth: 8, strokeLinecap: "butt", vectorEffect: "non-scaling-stroke", "data-switch-blade": "true" },
      deleteCross: { fill: "none", stroke: "none", strokeWidth: 3, pointerEvents: "none" },
      label: { fill: "#111111", fontFamily: SCHEMATIC_FONT_STACK, fontSize: 13, textAnchor: "middle", dominantBaseline: "alphabetic" },
      refLabel: { fill: "#111111", fontFamily: SCHEMATIC_FONT_STACK, fontSize: REF_LABEL_FONT_SIZE, textAnchor: "middle" },
      refLabelSign: { fontWeight: 700, fontStyle: "normal" },
      refLabelPrefix: { fontWeight: 700, fontStyle: "normal" },
      refLabelHead: { fontWeight: 700, fontStyle: "italic" },
      refLabelTail: { fontWeight: 700, fontStyle: "normal", fontSize: REF_LABEL_TAIL_FONT_SIZE },
      refLabelValue: { fontWeight: 700, fontStyle: "normal", fontSize: REF_LABEL_FONT_SIZE },
      centeredRefLabel: { fill: "#111111", fontFamily: SCHEMATIC_FONT_STACK },
      centeredRefLabelSign: { fontWeight: 700, fontStyle: "normal" },
      centeredRefLabelPrefix: { fontWeight: 700, fontStyle: "normal" },
      centeredRefLabelHead: { fontWeight: 700, fontStyle: "italic" },
      centeredRefLabelTail: { fontWeight: 700, fontStyle: "normal" },
      centeredRefLabelValue: { fontWeight: 700, fontStyle: "normal" },
      ...Object.fromEntries(RECTANGLE_RESIZE_HANDLES.map((handle, index) => [
        RECTANGLE_RESIZE_HANDLE_SELECTORS[index],
        { "data-rectangle-resize-handle": handle }
      ]))
    }
  },
  {
    markup: [
      { tagName: "rect", selector: "frame" },
      { tagName: "path", selector: "symbolBody" },
      { tagName: "path", selector: "symbolAccent" },
      { tagName: "path", selector: "symbolTerminalLeads" },
      { tagName: "path", selector: "symbolPinMarks" },
      { tagName: "path", selector: "symbolClockBubble" },
      { tagName: "path", selector: "symbolMarker" },
      ...symbolContentMarkup(),
      { tagName: "path", selector: "switchBladeHit" },
      { tagName: "path", selector: "deleteCross" },
      { tagName: "text", selector: "label" },
      {
        tagName: "g",
        selector: "refLabel",
        children: [
          { tagName: "text", selector: "refLabelSign" },
          { tagName: "text", selector: "refLabelPrefix" },
          { tagName: "text", selector: "refLabelHead" },
          { tagName: "text", selector: "refLabelTail" },
          { tagName: "text", selector: "refLabelValue" },
          { tagName: "text", selector: "refLabelValueHead" },
          { tagName: "text", selector: "refLabelValueTail" }
        ]
      },
      {
        tagName: "g",
        selector: "centeredRefLabel",
        children: [
          { tagName: "text", selector: "centeredRefLabelSign" },
          { tagName: "text", selector: "centeredRefLabelPrefix" },
          { tagName: "text", selector: "centeredRefLabelHead" },
          { tagName: "text", selector: "centeredRefLabelTail" },
          { tagName: "text", selector: "centeredRefLabelValue" }
        ]
      },
      ...RECTANGLE_RESIZE_HANDLE_SELECTORS.map(selector => ({ tagName: "rect", selector })),
      ...TRIANGLE_VERTICES.map(vertex => (
        { tagName: "rect", selector: `triangleResize${vertex.toUpperCase()}` }
      ))
    ]
  }
);

/** Pure artwork cells contain no text or port nodes, including invisible ones. */
export const LibraryShapeElement = (dia.Element as any).define(
  "eda.LibraryShape",
  {
    attrs: {
      frame: { fill: "transparent", stroke: "none", pointerEvents: "none" },
      symbolBody: { fill: "none", stroke: "#111111", strokeWidth: 2 * SYMBOL_STROKE_WIDTH },
      deleteCross: { fill: "none", stroke: "none", strokeWidth: 3, pointerEvents: "none" }
    }
  },
  {
    markup: [
      { tagName: "rect", selector: "frame" },
      { tagName: "path", selector: "symbolBody" },
      { tagName: "path", selector: "deleteCross" },
      ...RECTANGLE_RESIZE_HANDLE_SELECTORS.map(selector => ({ tagName: "rect", selector })),
      ...TRIANGLE_VERTICES.map(vertex => ({
        tagName: "rect",
        selector: `triangleResize${vertex.toUpperCase()}`
      }))
    ]
  }
);

export function componentCellAttrs(
  instance: ComponentInstance,
  options: ComponentRenderOptions = {}
) {
  const model = resolveComponentVisualModel(instance, options);
  return componentCellAttrsFromModel(model);
}

function componentCellAttrsFromModel(model: ReturnType<typeof resolveComponentVisualModel>) {
  const crossPadding = 7;
  const centeredRefLabel = !!model.def.centeredRefLabel;
  const showOrdinaryRefLabel = model.showRefLabel && !centeredRefLabel;
  const showCenteredRefLabel = model.showRefLabel && centeredRefLabel;
  const offset = { x: -model.frameBox.x, y: -model.frameBox.y };
  const symbolTransform = model.mirrored
    ? `matrix(${-model.artworkScale} 0 0 ${model.artworkScale} ${model.def.size.width - model.frameBox.x} ${offset.y})`
    : `translate(${offset.x} ${offset.y})${model.artworkScale === 1 ? "" : ` scale(${model.artworkScale})`}`;
  const handleHalf = RECTANGLE_RESIZE_HANDLE_SIZE / 2;
  const bodyInset = model.def.type === "rectangle" ? 0 : SYMBOL_GRID_SIZE * model.artworkScale;
  const bodyLeft = bodyInset + offset.x;
  const bodyRight = model.def.size.width - bodyInset + offset.x;
  const bodyTop = bodyInset + offset.y;
  const bodyBottom = model.def.size.height - bodyInset + offset.y;
  const resizeHandleAttrs = (
    handle: typeof RECTANGLE_RESIZE_HANDLES[number],
    x: number,
    y: number
  ) => ({
    x: x - handleHalf,
    y: y - handleHalf,
    width: RECTANGLE_RESIZE_HANDLE_SIZE,
    height: RECTANGLE_RESIZE_HANDLE_SIZE,
    fill: "#ffffff",
    stroke: "#005f9e",
    strokeWidth: 1.5,
    opacity: model.resizeHandles && model.def.type === "rectangle" ? 1 : 0,
    pointerEvents: model.resizeHandles && model.def.type === "rectangle" ? "all" : "none",
    cursor: handle === "n" || handle === "s"
      ? "ns-resize"
      : handle === "e" || handle === "w"
        ? "ew-resize"
        : handle === "nw" || handle === "se" ? "nwse-resize" : "nesw-resize",
    "data-rectangle-resize-handle": handle,
    "data-component-id": model.componentId
  });
  const triangleHandleAttrs = Object.fromEntries(TRIANGLE_VERTICES.map((vertex, index) => {
    const point = model.def.bodyPolygon?.[index];
    const x = model.def.size.width / 2 + (model.mirrored ? -(point?.x ?? 0) : point?.x ?? 0) + offset.x;
    const y = model.def.size.height / 2 + (point?.y ?? 0) + offset.y;
    const visible = !!point && model.resizeHandles && model.def.type === "triangle";
    return [`triangleResize${vertex.toUpperCase()}`, {
      x: x - handleHalf, y: y - handleHalf,
      width: RECTANGLE_RESIZE_HANDLE_SIZE, height: RECTANGLE_RESIZE_HANDLE_SIZE,
      fill: "#ffffff", stroke: "#005f9e", strokeWidth: 1.5, opacity: visible ? 1 : 0,
      pointerEvents: visible ? "all" : "none", cursor: "move",
      "data-triangle-resize-handle": vertex, "data-component-id": model.componentId,
      "aria-label": `Drag vertex ${vertex.toUpperCase()}`
    }];
  }));
  return {
    ...triangleHandleAttrs,
    root: {
      "data-layer": isLibraryShapeType(model.def.type) ? "shape" : "component"
    },
    frame: {
      x: 0,
      y: 0,
      width: model.frameBox.width,
      height: model.frameBox.height,
      fill: "rgba(255, 255, 255, 0)",
      pointerEvents: model.preview || isOpenLibraryShapeType(model.def.type) ? "none" : "all",
      cursor: model.preview ? "default" : "move",
      stroke: !model.preview && model.selected ? "#005f9e" : "none",
      strokeWidth: !model.preview && model.selected ? 1.5 : 0,
      strokeDasharray: !model.preview && model.selected ? "3 3" : "none"
    },
    symbolBody: {
      d: model.path,
      transform: symbolTransform,
      fill: model.symbolFill ?? "none",
      fillOpacity: model.symbolFillOpacity ?? 1,
      stroke: model.isAnnotation ? "none" : model.color,
      strokeWidth: model.symbolStrokeWidth,
      strokeDasharray: model.symbolStrokeDasharray ?? "none",
      ...(model.def.type === "polyline" ? { strokeLinejoin: "round" } : {}),
      opacity: model.symbolOpacity,
      cursor: model.preview ? "default" : "move",
      pointerEvents: model.preview ? "none" : "auto"
    },
    symbolAccent: {
      d: model.accentPath,
      transform: symbolTransform,
      stroke: model.accentPath ? model.color : "none",
      strokeWidth: model.accentStrokeWidth,
      strokeLinecap: model.def.type === "comparator" || model.def.type === "diffComparator" || model.def.type === "slicer" ? "round" : "butt",
      strokeDasharray: "none",
      opacity: model.accentPath ? model.symbolOpacity : 0,
      cursor: model.preview ? "default" : "move",
      pointerEvents: "none"
    },
    switchBladeHit: {
      d: model.switchBladePath,
      transform: symbolTransform,
      pointerEvents: model.switchBladePath ? "stroke" : "none",
      cursor: "pointer"
    },
    symbolTerminalLeads: { d: model.terminalLeadPath, transform: symbolTransform, fill: "none",
      stroke: model.terminalLeadPath ? model.color : "none", strokeWidth: SYMBOL_STROKE_WIDTH / model.artworkScale,
      opacity: model.symbolOpacity, pointerEvents: "none" },
    symbolPinMarks: {
      d: model.pinMarksPath,
      transform: symbolTransform,
      fill: "none",
      stroke: model.pinMarksPath ? model.color : "none",
      strokeWidth: SYMBOL_STROKE_WIDTH,
      strokeLinecap: "square",
      strokeLinejoin: "miter",
      opacity: model.pinMarksPath ? model.symbolOpacity : 0,
      cursor: model.preview ? "default" : "move",
      pointerEvents: "none"
    },
    symbolClockBubble: {
      d: model.clockBubblePath,
      transform: symbolTransform,
      fill: "none",
      stroke: model.clockBubblePath ? model.color : "none",
      strokeWidth: CLOCK_BUBBLE_STROKE_WIDTH,
      strokeDasharray: "none",
      opacity: model.clockBubblePath ? model.symbolOpacity : 0,
      cursor: model.preview ? "default" : "move",
      pointerEvents: "none"
    },
    symbolMarker: {
      d: model.markerPath,
      transform: symbolTransform,
      fill: model.markerPath ? model.color : "none",
      opacity: model.markerPath ? model.symbolOpacity : 0,
      cursor: model.preview ? "default" : "move",
      pointerEvents: "none"
    },
    ...symbolContentCellAttrs(model.symbolContentLayout, {
      color: model.color,
      opacity: model.labelOpacity,
      offsetX: offset.x,
      offsetY: offset.y
    }),
    deleteCross: {
      d: `M ${crossPadding} ${crossPadding} L ${model.frameBox.width - crossPadding} ${model.frameBox.height - crossPadding} M ${model.frameBox.width - crossPadding} ${crossPadding} L ${crossPadding} ${model.frameBox.height - crossPadding}`,
      stroke: model.deleted ? "#b00020" : "none",
      opacity: model.deleted ? 0.92 : 0
    },
    label: {
      text: model.labelText,
      x: model.labelLayout.x + offset.x,
      y: model.labelLayout.y + offset.y,
      transform: model.labelTransform,
      fill: model.color,
      fontSize: model.labelLayout.fontSize,
      fontWeight: model.labelFontWeight,
      textAnchor: model.labelLayout.textAnchor,
      dominantBaseline: model.labelLayout.dominantBaseline,
      ...(model.labelLayout.lineHeight
        ? { lineHeight: model.labelLayout.lineHeight }
        : {}),
      ...(model.labelLayout.textVerticalAnchor
        ? { textVerticalAnchor: model.labelLayout.textVerticalAnchor }
        : {}),
      opacity: model.showSymbolLabel ? model.labelOpacity : 0,
      pointerEvents: "none"
    },
    refLabel: {
      ...model.refLabelAttrs.refLabel,
      fill: model.color,
      opacity: showOrdinaryRefLabel ? model.labelOpacity : 0,
      pointerEvents: "none"
    },
    refLabelHead: {
      text: showOrdinaryRefLabel ? model.refLabelAttrs.refLabelHead.text : "",
      x: model.refLabelAttrs.refLabelHead.x,
      y: model.refLabelAttrs.refLabelHead.y,
      textAnchor: model.refLabelAttrs.refLabelHead.textAnchor,
      dominantBaseline: model.refLabelAttrs.refLabel.dominantBaseline,
      fontWeight: 700,
      fontStyle: "italic",
      fontSize: model.refLabelHeadFontSize,
      pointerEvents: "none"
    },
    refLabelPrefix: {
      text: showOrdinaryRefLabel ? model.refLabelAttrs.refLabelPrefix.text : "",
      x: model.refLabelAttrs.refLabelPrefix.x,
      y: model.refLabelAttrs.refLabelPrefix.y,
      textAnchor: model.refLabelAttrs.refLabelPrefix.textAnchor,
      dominantBaseline: model.refLabelAttrs.refLabel.dominantBaseline,
      fontWeight: 700,
      fontStyle: "normal",
      fontSize: model.refLabelPrefixFontSize,
      pointerEvents: "none"
    },
    refLabelSign: {
      text: showOrdinaryRefLabel ? model.refLabelAttrs.refLabelSign.text : "",
      x: model.refLabelAttrs.refLabelSign.x,
      y: model.refLabelAttrs.refLabelSign.y,
      textAnchor: model.refLabelAttrs.refLabelSign.textAnchor,
      dominantBaseline: model.refLabelAttrs.refLabel.dominantBaseline,
      fontWeight: 700,
      fontStyle: "normal",
      fontSize: model.refLabelSignFontSize,
      pointerEvents: "none"
    },
    refLabelTail: {
      text: showOrdinaryRefLabel ? model.refLabelAttrs.refLabelTail.text : "",
      x: model.refLabelAttrs.refLabelTail.x,
      y: model.refLabelAttrs.refLabelTail.y,
      textAnchor: model.refLabelAttrs.refLabelTail.textAnchor,
      dominantBaseline: model.refLabelAttrs.refLabel.dominantBaseline,
      fontWeight: 700,
      fontStyle: "normal",
      fontSize: model.refLabelTailFontSize,
      pointerEvents: "none"
    },
    refLabelValueHead: {
      ...model.refLabelAttrs.refLabelValueHead,
      text: showOrdinaryRefLabel ? model.refLabelAttrs.refLabelValueHead.text : "",
      dominantBaseline: model.refLabelAttrs.refLabel.dominantBaseline,
      fontStyle: "italic",
      fontWeight: 700,
      fontSize: REF_LABEL_FONT_SIZE
    },
    refLabelValueTail: {
      ...model.refLabelAttrs.refLabelValueTail,
      text: showOrdinaryRefLabel ? model.refLabelAttrs.refLabelValueTail.text : "",
      dominantBaseline: model.refLabelAttrs.refLabel.dominantBaseline,
      fontStyle: "normal",
      fontWeight: 700,
      fontSize: REF_LABEL_TAIL_FONT_SIZE
    },
    refLabelValue: {
      text: showOrdinaryRefLabel ? model.refLabelAttrs.refLabelValue.text : "",
      x: model.refLabelAttrs.refLabelValue.x,
      y: model.refLabelAttrs.refLabelValue.y,
      textAnchor: model.refLabelAttrs.refLabelValue.textAnchor,
      dominantBaseline: model.refLabelAttrs.refLabel.dominantBaseline,
      fontWeight: 700,
      fontStyle: "normal",
      fontSize: model.refLabelValueFontSize,
      pointerEvents: "none"
    },
    centeredRefLabel: {
      ...model.refLabelAttrs.refLabel,
      fill: model.color,
      opacity: showCenteredRefLabel ? model.labelOpacity : 0,
      pointerEvents: "none"
    },
    centeredRefLabelSign: {
      text: showCenteredRefLabel ? model.refLabelAttrs.refLabelSign.text : "",
      x: model.refLabelAttrs.refLabelSign.x,
      y: model.refLabelAttrs.refLabelSign.y,
      textAnchor: model.refLabelAttrs.refLabelSign.textAnchor,
      dominantBaseline: model.refLabelAttrs.refLabel.dominantBaseline,
      fontWeight: 700,
      fontStyle: "normal",
      fontSize: model.refLabelSignFontSize,
      pointerEvents: "none"
    },
    centeredRefLabelHead: {
      text: showCenteredRefLabel ? model.refLabelAttrs.refLabelHead.text : "",
      x: model.refLabelAttrs.refLabelHead.x,
      y: model.refLabelAttrs.refLabelHead.y,
      textAnchor: model.refLabelAttrs.refLabelHead.textAnchor,
      dominantBaseline: model.refLabelAttrs.refLabel.dominantBaseline,
      fontWeight: 700,
      fontStyle: "italic",
      fontSize: model.refLabelHeadFontSize,
      pointerEvents: "none"
    },
    centeredRefLabelPrefix: {
      text: showCenteredRefLabel ? model.refLabelAttrs.refLabelPrefix.text : "",
      x: model.refLabelAttrs.refLabelPrefix.x,
      y: model.refLabelAttrs.refLabelPrefix.y,
      textAnchor: model.refLabelAttrs.refLabelPrefix.textAnchor,
      dominantBaseline: model.refLabelAttrs.refLabel.dominantBaseline,
      fontWeight: 700,
      fontStyle: "normal",
      fontSize: model.refLabelPrefixFontSize,
      pointerEvents: "none"
    },
    centeredRefLabelTail: {
      text: showCenteredRefLabel ? model.refLabelAttrs.refLabelTail.text : "",
      x: model.refLabelAttrs.refLabelTail.x,
      y: model.refLabelAttrs.refLabelTail.y,
      textAnchor: model.refLabelAttrs.refLabelTail.textAnchor,
      dominantBaseline: model.refLabelAttrs.refLabel.dominantBaseline,
      fontWeight: 700,
      fontStyle: "normal",
      fontSize: model.refLabelTailFontSize,
      pointerEvents: "none"
    },
    centeredRefLabelValue: {
      text: showCenteredRefLabel ? model.refLabelAttrs.refLabelValue.text : "",
      x: model.refLabelAttrs.refLabelValue.x,
      y: model.refLabelAttrs.refLabelValue.y,
      textAnchor: model.refLabelAttrs.refLabelValue.textAnchor,
      dominantBaseline: model.refLabelAttrs.refLabel.dominantBaseline,
      fontWeight: 700,
      fontStyle: "normal",
      fontSize: model.refLabelValueFontSize,
      pointerEvents: "none"
    },
    rectangleResizeNw: resizeHandleAttrs("nw", bodyLeft, bodyTop),
    rectangleResizeNe: resizeHandleAttrs("ne", bodyRight, bodyTop),
    rectangleResizeSe: resizeHandleAttrs("se", bodyRight, bodyBottom),
    rectangleResizeSw: resizeHandleAttrs("sw", bodyLeft, bodyBottom),
    rectangleResizeN: resizeHandleAttrs("n", (bodyLeft + bodyRight) / 2, bodyTop),
    rectangleResizeE: resizeHandleAttrs("e", bodyRight, (bodyTop + bodyBottom) / 2),
    rectangleResizeS: resizeHandleAttrs("s", (bodyLeft + bodyRight) / 2, bodyBottom),
    rectangleResizeW: resizeHandleAttrs("w", bodyLeft, (bodyTop + bodyBottom) / 2),
    portBody: {
      magnet: !model.preview && !model.deleted,
      x: -PORT_MARKER_SIZE / 2,
      y: -PORT_MARKER_SIZE / 2,
      width: PORT_MARKER_SIZE,
      height: PORT_MARKER_SIZE,
      fill: model.showPins ? "#ffffff" : "none",
      stroke: model.showPins ? model.color : "none",
      strokeWidth: model.showPins ? PORT_MARKER_STROKE_WIDTH : 0,
      opacity: model.showPins ? 1 : 0,
      cursor: "default",
      pointerEvents: model.preview ? "none" : "auto"
    }
  };
}

export function makeComponentCell(
  instance: ComponentInstance,
  options: ComponentRenderOptions = {}
) {
  const model = resolveComponentVisualModel(instance, options);
  const frame = model.frameBox;
  const position = {
    x: instance.x - model.def.size.width / 2 + frame.x,
    y: instance.y - model.def.size.height / 2 + frame.y
  };
  const attrs = componentCellAttrsFromModel(model);
  const libraryShape = isLibraryShapeType(instance.type);
  const polyline = model.def.bodyPolyline;
  const openShape = isOpenLibraryShapeType(instance.type) ? instance.type : null;
  const points = polyline ?? model.def.bodyArc;
  const hitSelector = `${openShape}Hit`;
  const handlesSelector = `${openShape}Handles`;
  const shapeSelectors = [
    "root", "frame", "symbolBody", "deleteCross",
    ...RECTANGLE_RESIZE_HANDLE_SELECTORS,
    ...TRIANGLE_VERTICES.map(vertex => `triangleResize${vertex.toUpperCase()}`)
  ];
  const cellAttrs = libraryShape
    ? Object.fromEntries(shapeSelectors.map(selector => [selector, attrs[selector]]))
    : attrs;
  const vertexLabels = openShape === "arc"
    ? [t("arc.dragStart", "Drag start point"), t("arc.dragEnd", "Drag end point"), t("arc.dragThrough", "Drag point on arc")]
    : [];
  const vertexMarkup = points?.map((point, index) => {
    const selector = `${openShape}Vertex${index}`;
    const isArc = openShape === "arc";
    const isThroughPoint = isArc && index === 2;
    const size = isArc ? (isThroughPoint ? 7 : 10) : RECTANGLE_RESIZE_HANDLE_SIZE;
    const half = size / 2;
    const x = model.def.size.width / 2 - frame.x + (instance.mirrored ? -point.x : point.x);
    const y = model.def.size.height / 2 - frame.y + point.y;
    cellAttrs[selector] = {
      x: x - half, y: y - half, width: size, height: size,
      ...(isThroughPoint ? { transform: `rotate(45 ${x} ${y})` } : isArc ? { rx: half, ry: half } : {}),
      fill: "#ffffff", stroke: "#005f9e", strokeWidth: 1.5, cursor: "move",
      [`data-${openShape}-vertex`]: index, "data-component-id": instance.id,
      "aria-label": vertexLabels[index] ?? `${t("polyline.vertex", "Drag vertex")} ${index + 1}`
    };
    return { tagName: "rect", selector };
  });
  if (vertexMarkup) {
    if (polyline) cellAttrs.symbolMarker = attrs.symbolMarker;
    cellAttrs[hitSelector] = {
      d: polyline ? polylineFrameSymbol(model.def.size.width / model.artworkScale, model.def.size.height / model.artworkScale,
        polyline.map(point => ({ x: point.x / model.artworkScale, y: point.y / model.artworkScale }))) : model.path,
      transform: attrs.symbolBody.transform, fill: "none",
      stroke: "transparent", strokeWidth: Math.max(12 / model.artworkScale, model.symbolStrokeWidth),
      pointerEvents: model.preview ? "none" : "stroke", cursor: "move"
    };
    cellAttrs[handlesSelector] = { display: model.resizeHandles ? "inline" : "none" };
  }
  const ElementClass = libraryShape ? LibraryShapeElement : SymbolElement;
  const element = new ElementClass({
    id: model.preview ? PREVIEW_COMPONENT_ID : instance.id,
    position,
    size: { width: frame.width, height: frame.height },
    attrs: cellAttrs,
    ...(vertexMarkup ? { markup: [
      { tagName: "rect", selector: "frame" },
      { tagName: "path", selector: "symbolBody" },
      ...(polyline ? [{ tagName: "path", selector: "symbolMarker" }] : []),
      { tagName: "path", selector: hitSelector },
      { tagName: "path", selector: "deleteCross" },
      { tagName: "g", selector: handlesSelector, children: vertexMarkup }
    ] } : {}),
    ports: {
      groups: {
        pin: {
          position: { name: "absolute" },
          markup: [{ tagName: "rect", selector: "portBody" }],
          attrs: { portBody: attrs.portBody }
        }
      },
      items: model.def.pins.map((pin) => {
        return {
          id: pin.id,
          group: "pin",
          args: {
            x: (model.mirrored ? model.def.size.width / 2 - pin.x : pin.x + model.def.size.width / 2) - frame.x,
            y: pin.y + model.def.size.height / 2 - frame.y
          },
          attrs: { portBody: { title: pin.label } }
        };
      })
    }
  });
  element.set("componentId", instance.id);
  if (openShape) element.set("openShape", openShape);
  element.set("preview", model.preview);
  element.rotate(instance.rotation, true, { x: instance.x, y: instance.y });
  return element;
}
