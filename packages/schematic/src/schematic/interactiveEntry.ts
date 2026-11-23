export { rasterizeSchematicSvg, writeSchematicImageClipboard } from "./imageExport";
import { SchematicEditor } from "./editor";
import type {
  SchematicEditorHandle,
  SchematicEditorMountElements
} from "./editorHandle";
import { domUi } from "./schematicUiElements";
import { buildSchematicEditorSidebar } from "./schematicEditorUiProjection";
import type {
  SchematicEditorHostBridge,
  SchematicEditorRuntimeServices
} from "./schematicHostedEditor";
import type { SchematicContent } from "./types";

export { schematicContextMenuActions, SCHEMATIC_COPY_MENU_LABELS, SCHEMATIC_PASTE_MENU_LABEL } from "./contextMenuModel";

export type {
  SchematicEditorCommand,
  SchematicEditorHandle,
  SchematicEditorMutationOptions,
  SchematicEditorState,
  SchematicEditorStateListener
} from "./editorHandle";
export type {
  SchematicEditorCommitMetadata,
  SchematicEditorHostBridge,
  SchematicEditorRuntimeServices
} from "./schematicHostedEditor";
export { renderSchematicEditorSidebarProjection } from "./schematicEditorUiProjection";

export interface SchematicEditorUiElements {
  paperEl: HTMLElement;
  paletteEl: HTMLElement;
  propertyEl: HTMLElement;
  statusEl?: HTMLElement;
  selectionSummaryEl?: HTMLElement;
}

export interface CreateSchematicEditorOptions {
  root: HTMLElement;
  content: SchematicContent;
  host: SchematicEditorRuntimeServices & SchematicEditorHostBridge;
  ui?: SchematicEditorUiElements;
  revision?: number;
  origin?: string;
}

/** Creates and initializes one host-neutral interactive document editor. */
export function createSchematicEditor(
  options: CreateSchematicEditorOptions
): SchematicEditorHandle {
  const ui = options.ui ?? mountDefaultSchematicEditorUi(options.root);
  options.root.classList.add("schematic-editor-root");
  const mounts: SchematicEditorMountElements = {
    shellEl: options.root,
    documentTabsEl: options.root,
    paperEl: ui.paperEl,
    paletteEl: ui.paletteEl,
    propertyEl: ui.propertyEl,
    statusEl: ui.statusEl,
    selectionSummaryEl: ui.selectionSummaryEl
  };
  const editor = new SchematicEditor(mounts, options.host, options.host);
  editor.replaceContent(options.content, {
    origin: options.origin ?? "host",
    reason: "initial-content",
    revision: options.revision ?? 0,
    commit: false
  });
  editor.init();
  return editor;
}

export function mountDefaultSchematicEditorUi(root: HTMLElement): SchematicEditorUiElements {
  const { el } = domUi(root.ownerDocument);
  root.replaceChildren(el("div", { class: "schematic-editor-surface" },
    buildSchematicEditorSidebar(el),
    el("div", { class: "schematic-paper", "data-schematic-paper": true, tabindex: 0, "aria-label": "Schematic canvas" })
  ));
  const paperEl = requiredElement(root, "[data-schematic-paper]");
  const paletteEl = requiredElement(root, "[data-schematic-palette]");
  const propertyEl = requiredElement(root, "[data-schematic-property-editor]");
  return { paperEl, paletteEl, propertyEl };
}

function requiredElement(root: HTMLElement, selector: string) {
  const element = root.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing schematic editor mount: ${selector}`);
  return element;
}
export { hasNoteMath, typesetNotesForExport } from "./notes/noteTypeset";
