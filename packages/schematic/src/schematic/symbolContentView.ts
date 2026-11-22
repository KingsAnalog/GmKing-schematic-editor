import type { SymbolContentLayout } from "./symbolContentModel";
import { escapeAttribute, escapeHtml } from "./uiUtils";
import { SCHEMATIC_FONT_STACK } from "./schematicFont";

export const SYMBOL_CONTENT_RUN_SLOT_COUNT = 12;
export const SYMBOL_CONTENT_PATH_SLOT_COUNT = 12;

export function symbolContentMarkup(runCount = SYMBOL_CONTENT_RUN_SLOT_COUNT) {
  return [
    ...Array.from({ length: SYMBOL_CONTENT_PATH_SLOT_COUNT }, (_, index) => ({
      tagName: "path",
      selector: symbolContentPathSelector(index)
    })),
    ...Array.from({ length: runCount }, (_, index) => ({
      tagName: "text",
      selector: symbolContentRunSelector(index)
    }))
  ];
}

export function symbolContentDefaultAttrs() {
  return Object.fromEntries([
    ...Array.from({ length: SYMBOL_CONTENT_PATH_SLOT_COUNT }, (_, index) => [
      symbolContentPathSelector(index),
      { fill: "none", stroke: "none", pointerEvents: "none" }
    ]),
    ...Array.from({ length: SYMBOL_CONTENT_RUN_SLOT_COUNT }, (_, index) => [
      symbolContentRunSelector(index),
      {
        fill: "none",
        fontFamily: SCHEMATIC_FONT_STACK,
        textAnchor: "middle",
        pointerEvents: "none"
      }
    ])
  ]);
}

export function symbolContentCellAttrs(
  layout: SymbolContentLayout | null,
  options: { color: string; opacity: number; offsetX?: number; offsetY?: number }
) {
  const offsetX = options.offsetX ?? 0;
  const offsetY = options.offsetY ?? 0;
  return Object.fromEntries([
    ...Array.from({ length: SYMBOL_CONTENT_PATH_SLOT_COUNT }, (_, index) => {
      const path = layout?.paths[index];
      return [symbolContentPathSelector(index), path ? {
        d: path.d,
        transform: pathTransform(path, offsetX, offsetY),
        fill: path.fill === "currentColor" ? options.color : "none",
        stroke: path.fill === "currentColor" ? "none" : options.color,
        strokeWidth: path.strokeWidth,
        strokeLinecap: path.lineCap,
        strokeLinejoin: path.lineJoin,
        opacity: options.opacity,
        pointerEvents: "none"
      } : hiddenPathAttrs()];
    }),
    ...Array.from({ length: Math.max(SYMBOL_CONTENT_RUN_SLOT_COUNT, layout?.runs.length ?? 0) }, (_, index) => {
      const run = layout?.runs[index];
      return [symbolContentRunSelector(index), run ? {
        text: run.text,
        x: offsetX + run.x,
        y: offsetY + run.y,
        fill: options.color,
        fontFamily: SCHEMATIC_FONT_STACK,
        fontSize: run.fontSize,
        fontStyle: run.fontStyle,
        fontWeight: run.fontWeight,
        textAnchor: run.textAnchor,
        transform: counterRotationTransform(
          run.counterRotation,
          offsetX + run.x,
          offsetY + run.y
        ),
        opacity: options.opacity,
        pointerEvents: "none"
      } : hiddenRunAttrs()];
    })
  ]);
}

export function renderSymbolContentSvg(
  layout: SymbolContentLayout | null,
  options: { color?: string; opacity?: number; offsetX?: number; offsetY?: number } = {}
) {
  if (!layout) return "";
  const color = options.color ?? "currentColor";
  const opacity = options.opacity ?? 1;
  const offsetX = options.offsetX ?? 0;
  const offsetY = options.offsetY ?? 0;
  const paths = layout.paths.map((path, index) => {
    const fill = path.fill === "currentColor" ? color : "none";
    const stroke = path.fill === "currentColor" ? "none" : color;
    const transform = pathTransform(path, offsetX, offsetY);
    return `<path data-selector="${symbolContentPathSelector(index)}" data-symbol-content-path="${index}" d="${escapeAttribute(path.d)}" transform="${escapeAttribute(transform)}" fill="${escapeAttribute(fill)}" stroke="${escapeAttribute(stroke)}" stroke-width="${path.strokeWidth}" stroke-linecap="${path.lineCap}" stroke-linejoin="${path.lineJoin}"${opacity === 1 ? "" : ` opacity="${opacity}"`}></path>`;
  }).join("");
  const runs = layout.runs.map((run, index) => {
    const transform = counterRotationTransform(
      run.counterRotation,
      offsetX + run.x,
      offsetY + run.y
    );
    return `<text data-selector="${symbolContentRunSelector(index)}" data-symbol-content-run="${index}" x="${offsetX + run.x}" y="${offsetY + run.y}"${transform ? ` transform="${escapeAttribute(transform)}"` : ""} fill="${escapeAttribute(color)}" font-family="${escapeAttribute(SCHEMATIC_FONT_STACK)}" font-size="${run.fontSize}" font-style="${run.fontStyle}" font-weight="${run.fontWeight}" text-anchor="${run.textAnchor}"${opacity === 1 ? "" : ` opacity="${opacity}"`}>${escapeHtml(run.text)}</text>`;
  }).join("");
  return `${paths}${runs}`;
}

export function symbolContentRunSelector(index: number) {
  return `symbolContentRun${index}`;
}

export function symbolContentPathSelector(index: number) {
  return `symbolContentPath${index}`;
}

function hiddenPathAttrs() {
  return { d: "", transform: "", fill: "none", stroke: "none", opacity: 0, pointerEvents: "none" };
}

function hiddenRunAttrs() {
  return { text: "", transform: "", fill: "none", opacity: 0, pointerEvents: "none" };
}

function pathTransform(
  path: SymbolContentLayout["paths"][number],
  offsetX: number,
  offsetY: number
) {
  const translate = `translate(${offsetX + path.translateX} ${offsetY + path.translateY})`;
  const counterRotation = path.counterRotation;
  const transform = counterRotation?.degrees
    ? `${translate} rotate(${-counterRotation.degrees} ${counterRotation.x} ${counterRotation.y})`
    : translate;
  // Rotation pivots are expressed in artwork coordinates, inside the scale.
  return path.scale && path.scale !== 1
    ? `${translate} scale(${path.scale})${counterRotation?.degrees ? ` rotate(${-counterRotation.degrees} ${counterRotation.x} ${counterRotation.y})` : ""}`
    : transform;
}

function counterRotationTransform(
  degrees: number | undefined,
  x: number,
  y: number
) {
  return degrees ? `rotate(${-degrees} ${x} ${y})` : "";
}
