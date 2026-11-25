import type { SelectionMoveBehavior } from "./selection/selectionMoveTransaction";
import type { ToolMode } from "./toolState";
import type { ComponentType } from "./types";

const abc = '<path d="M4.5 10.5V6.2m0 1C3.4 5.3 1 6.2 1 8.4s2.4 2.9 3.5 1.1M6.5 3.8v6.7m0-3.3c1.2-1.7 3.5-1 3.5 1.2s-2.3 2.9-3.5 1.1m8-2.6c-1.6-1.4-3.1-.4-3.1 1.5s1.5 2.9 3.1 1.5"/>';

const glyphs = {
  instance: '<path d="M3 8h2m0-4v8m3-8v8m0-8h5V1m-5 11h5v3m-5-7h4m-1-1 1 1-1 1"/>',
  wire: '<path d="M1 12h5l4-7h5"/>',
  label: abc + '<path d="M1 13h13.5"/>',
  note: '<rect x="0.75" y="1.5" width="14.5" height="12.5" rx="0.8"/>' +
    '<g transform="translate(1.8 1) scale(.8)">' + abc + '</g>',
  stretch: '<path d="M5 5V1h10v10h-4"/><path d="M1 5h10v10H1Z" stroke-dasharray="1.8 1.4"/>',
  "move-only": '<path d="M8 1v14M1 8h14M5.5 3.5 8 1l2.5 2.5m-5 9L8 15l2.5-2.5m-7-7L1 8l2.5 2.5m9-5L15 8l-2.5 2.5"/>',
  copy: '<path d="M10 8v7H1V6h7m4-5v7M8.5 4.5h7"/>',
  rotate: '<path d="M14.4 7A6.5 6.5 0 1 0 11.8 13.1M14.4 2.8V7h-4.2"/>',
  delete: '<path d="M3 3l10 10M13 3 3 13"/>',
  plus: '<path d="M8 4v8M4 8h8"/>',
  pin: '<path d="M1 3.5h7L12 8l-4 4.5H1zm11 4.5h3"/>',
  "selection-box": '<path d="M1 1h13v6H1Z" stroke-dasharray="2.5 2.5" stroke-linecap="butt"/>'
};

type ToolCursor = keyof typeof glyphs;
export type ToolCursorFeedback = Extract<ToolCursor, "rotate" | "delete" | "plus">;

function cursorImage(glyph: string, offset: string) {
  const arrow = '<path d="M2 2v17l4.4-4.3 3.4 7.2 2.9-1.4-3.4-7.1h6.9Z" fill="#17191c" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/>';
  const icon = '<g transform="translate(' + offset + ')" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
    '<g stroke="#fff" stroke-width="3.35">' + glyph + '</g>' +
    '<g stroke="#17191c" stroke-width="1.45">' + glyph + '</g></g>';
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">' + arrow + icon + '</svg>';
  return 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '") 2 2, default';
}

const cursorImages = new Map(Object.entries(glyphs).map(([name, glyph]) =>
  [name, cursorImage(glyph, name === "selection-box" ? "3 23" : "15 14")]));

export const SCHEMATIC_PLUS_CURSOR = cursorImages.get("plus") ?? "default";

interface ToolCursorState {
  mode: ToolMode;
  moveBehavior: SelectionMoveBehavior;
  browsingInstances: boolean;
  placingNote: boolean;
  hierarchyPlacement?: ComponentType;
  precisionPick: boolean;
  selectingBox: boolean;
  feedback?: ToolCursorFeedback;
}

function activeCursor(state: ToolCursorState): ToolCursor | undefined {
  if (state.selectingBox) return "selection-box";
  if (state.hierarchyPlacement === "sheetPort") return "pin";
  if (state.hierarchyPlacement === "sheetBlock" || state.browsingInstances) return "instance";
  if (state.precisionPick) return "plus";
  if (state.feedback) return state.feedback;
  if (state.placingNote) return "note";
  switch (state.mode) {
    case "place": return "instance";
    case "wire": return "wire";
    case "label": return "label";
    case "move": return state.moveBehavior === "stretch" ? "stretch" : "move-only";
    case "copy": return "copy";
    case "rotate": return "rotate";
    case "delete": return "delete";
    case "temp-delete": return "plus";
  }
}

export function syncSchematicToolCursor(paper: HTMLElement, state?: ToolCursorState) {
  const cursor = state && activeCursor(state);
  if (paper.dataset.schematicToolCursor === cursor) return;
  if (cursor) {
    paper.style.setProperty("--schematic-tool-cursor", cursorImages.get(cursor) ?? "default");
    paper.dataset.schematicToolCursor = cursor;
  } else {
    delete paper.dataset.schematicToolCursor;
    paper.style.removeProperty("--schematic-tool-cursor");
  }
}
