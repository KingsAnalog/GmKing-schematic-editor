import { renderMathSvg } from "../../shared/mathjax";
import { schematicTextFontStack, type SchematicTextFont } from "../schematicFont";
import { createSchematicSvgElement } from "../schematicSvgDom";
import type { SchematicNote } from "../types";
import { escapeAttribute, escapeHtml } from "../uiUtils";
import { NOTE_HORIZONTAL_PADDING, noteFontSizePx, noteSizeFromMeasuredContent, type NoteGraphic } from "./noteSizing";

type Run = { text: string } | { tex: string; source: string; display: boolean };
type GraphicRun = { text?: string; svg?: SVGSVGElement; width: number; ascent: number; descent: number };
const MATH = /(?<!\\)(?:\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$|\$([^\n$]+)\$)/g;
const contexts = new WeakMap<Document, CanvasRenderingContext2D | null>();
let nextFormulaId = 1;

function noteRows(source: string): Run[][] {
  const rows: Run[][] = [[]];
  let afterDisplay = false;
  const appendText = (text: string) => {
    if (!text) return;
    if (afterDisplay && text.startsWith("\n")) text = text.slice(1);
    afterDisplay = false;
    text.split("\n").forEach((part, index) => {
      if (index) rows.push([]);
      if (part) rows.at(-1)!.push({ text: part });
    });
  };
  const text = source.replace(/\r\n?/g, "\n");
  let offset = 0;
  for (const match of text.matchAll(MATH)) {
    appendText(text.slice(offset, match.index));
    const display = match[2] !== undefined || match[3] !== undefined;
    const formula = { tex: match[1] ?? match[2] ?? match[3] ?? match[4], display, source: match[0] };
    if (display && rows.at(-1)!.length) rows.push([]);
    rows.at(-1)!.push(formula);
    if (display) { rows.push([]); afterDisplay = true; }
    else afterDisplay = false;
    offset = match.index + match[0].length;
  }
  appendText(text.slice(offset));
  if (afterDisplay) rows.pop();
  return rows;
}

function measuredText(doc: Document, text: string, font: string, fontSize: number): GraphicRun {
  if (!contexts.has(doc)) {
    contexts.set(doc, doc.defaultView && "CanvasRenderingContext2D" in doc.defaultView
      ? doc.createElement("canvas").getContext("2d") : null);
  }
  const context = contexts.get(doc);
  if (context) context.font = `${fontSize}px ${font}`;
  const width = context?.measureText(text).width ?? Array.from(text).reduce(
    (sum, character) => sum + (/[^\x00-\xff]/.test(character) ? fontSize : fontSize * 0.6), 0);
  return { text, width, ascent: fontSize * 0.85, descent: fontSize * 0.25 };
}

function compose(rows: GraphicRun[][], font: string, fontSize: number): NoteGraphic {
  let width = 0, height = 0;
  const markup = rows.map(row => {
    const ascent = Math.max(fontSize * 0.85, ...row.map(run => run.ascent));
    const descent = Math.max(fontSize * 0.25, ...row.map(run => run.descent));
    const baseline = height + ascent;
    height += ascent + descent;
    let x = NOTE_HORIZONTAL_PADDING + 1;
    const runs = row.map(run => {
      const left = x;
      x += run.width;
      if (!run.svg) {
        return `<text x="${left}" y="${baseline}" fill="currentColor" font-family="${escapeAttribute(font)}" font-size="${fontSize}" xml:space="preserve">${escapeHtml(run.text ?? "")}</text>`;
      }
      run.svg.setAttribute("x", String(left));
      run.svg.setAttribute("y", String(baseline - run.ascent));
      run.svg.setAttribute("width", String(run.width));
      run.svg.setAttribute("height", String(run.ascent + run.descent));
      return new run.svg.ownerDocument.defaultView!.XMLSerializer().serializeToString(run.svg);
    });
    width = Math.max(width, x - NOTE_HORIZONTAL_PADDING - 1);
    return runs.join("");
  }).join("");
  return { ...noteSizeFromMeasuredContent({ width, height }, fontSize), markup };
}

function makeStandaloneMath(svg: SVGSVGElement) {
  const prefix = `note-math-${nextFormulaId++}-`;
  const ids = new Map<string, string>();
  for (const node of svg.querySelectorAll("[id]")) {
    ids.set(node.id, prefix + node.id);
    node.id = prefix + node.id;
  }
  // Preserve the vectors and local MathJax glyph references in standalone exports.
  for (const node of svg.querySelectorAll("*")) {
    for (const attribute of Array.from(node.attributes)) {
      if (attribute.localName === "href") {
        const id = attribute.value.startsWith("#") && ids.get(attribute.value.slice(1));
        if (id) attribute.value = `#${id}`;
        else node.removeAttributeNode(attribute);
      } else if (attribute.value.includes("url(#")) {
        attribute.value = attribute.value.replace(/url\(#([^)]*)\)/g, (reference, id) =>
          ids.has(id) ? `url(#${ids.get(id)})` : reference);
      }
    }
  }
  svg.removeAttribute("style");
  svg.removeAttribute("id");
  svg.setAttribute("overflow", "visible");
  return svg;
}

export function hasNoteMath(text: string) {
  return Array.from(text.matchAll(MATH)).length > 0;
}

export function plainNoteGraphic(note: SchematicNote, doc: Document, defaultFont?: SchematicTextFont) {
  const font = schematicTextFontStack(note.fontFamily, defaultFont);
  const size = noteFontSizePx(note);
  return compose(note.text.replace(/\r\n?/g, "\n").split("\n").map(
    line => [measuredText(doc, line, font, size)]), font, size);
}

export async function typesetNote(note: SchematicNote, doc: Document, defaultFont?: SchematicTextFont, signal?: AbortSignal) {
  if (!hasNoteMath(note.text)) return plainNoteGraphic(note, doc, defaultFont);
  const font = schematicTextFontStack(note.fontFamily, defaultFont);
  const size = noteFontSizePx(note);
  const rows = await Promise.all(noteRows(note.text).map(row => Promise.all(row.map(async (run): Promise<GraphicRun> => {
    if ("text" in run) return measuredText(doc, run.text, font, size);
    const svg = await renderMathSvg(doc, run.tex, { display: run.display, signal });
    const bounds = svg?.getAttribute("viewBox")?.split(/\s+/).map(Number);
    if (!svg || !bounds || bounds.length !== 4 || bounds.some(value => !Number.isFinite(value))) {
      return measuredText(doc, run.source, font, size);
    }
    const scale = size / 1000;
    const serialized = new doc.defaultView!.XMLSerializer().serializeToString(makeStandaloneMath(svg));
    return { svg: createSchematicSvgElement(doc, serialized), width: bounds[2] * scale,
      ascent: -bounds[1] * scale, descent: (bounds[3] + bounds[1]) * scale };
  }))));
  return compose(rows, font, size);
}

export async function typesetNotesForExport(notes: readonly SchematicNote[], doc: Document, defaultFont?: SchematicTextFont) {
  return Object.fromEntries(await Promise.all(notes.map(async note => [note.id, await typesetNote(note, doc, defaultFont)] as const)));
}
