import deleteIcon from "./icons/delete.svg?raw";
import tempDeleteIcon from "./icons/temp-delete.svg?raw";
import { SchematicAnalysisController } from "./analysis/analysisController";
import { SchematicContextMenuController } from "./contextMenuController";
import type { SchematicEditorHandle } from "./editorHandle";
import { mountSchematicEditorFacade } from "./schematicEditorFacade";
import type { SchematicEditorMountElements } from "./schematicTabShell";
import { readSchematicDocumentFromClipboard } from "./schematicClipboardWebAdapter";
import {
  downloadSchematicDocumentFile,
  readSchematicDocumentFile
} from "./schematicDocumentWebAdapter";
import { SchematicDocumentTabs } from "./schematicDocumentTabs";
import { webMarkdownNoteRuntimeAdapter } from "./notes/webMarkdownNoteRuntimeAdapter";
import type { SchematicEditorHostServices } from "./schematicEditorHostPorts";
import { SchematicWebDocumentHost } from "./schematicWebDocumentHost";
import { createSchematicWorkspacePersistence } from "./workspacePersistence";
import type { WorkspaceStorage } from "../shared/workspaceState";

export type SchematicWebEditorFactory<Editor extends SchematicEditorHandle> = (
  mountElements: SchematicEditorMountElements,
  services: SchematicEditorHostServices
) => Editor;

/** Owns browser adapters and shell lifecycle while exposing the existing editor handle. */
export class SchematicWebHost<Editor extends SchematicEditorHandle> {
  private editor: Editor | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly createEditor: SchematicWebEditorFactory<Editor>,
    private readonly services = createSchematicWebHostServices(root)
  ) {}

  mount() {
    if (this.editor) return this.editor;
    const editor = mountSchematicEditorFacade(
      this.root,
      (mountElements) => this.createEditor(mountElements, this.services)
    );
    if (!editor) return null;

    const destroyEditor = editor.destroy.bind(editor);
    let destroyResult: ReturnType<Editor["destroy"]> | undefined;
    let destroyed = false;
    editor.destroy = () => {
      if (destroyed) return destroyResult;
      destroyed = true;
      try {
        destroyResult = destroyEditor() as ReturnType<Editor["destroy"]>;
        return destroyResult;
      } finally {
        this.editor = null;
      }
    };

    this.editor = editor;
    return editor;
  }
}

export function mountSchematicWebHost<Editor extends SchematicEditorHandle>(
  root: HTMLElement,
  createEditor: SchematicWebEditorFactory<Editor>,
  services?: SchematicEditorHostServices
) {
  return new SchematicWebHost(root, createEditor, services).mount();
}

export interface SchematicWebHostOptions {
  workspace?: SchematicEditorHostServices["workspace"];
  storage?: WorkspaceStorage | null;
}

export function createSchematicWebHostServices(root: HTMLElement, options: SchematicWebHostOptions = {}): SchematicEditorHostServices {
  const ownerDocument = root.ownerDocument;
  const ownerWindow = ownerDocument.defaultView;
  if (!ownerWindow) {
    throw new Error("The schematic Web host requires a mounted document with a defaultView.");
  }
  const realm = ownerWindow;
  const createId = () => createWebId(realm.crypto);
  const storage = options.storage === undefined ? localStorageFor(ownerWindow) : options.storage;
  const workspace = options.workspace ?? createSchematicWorkspacePersistence(storage,
    realm.navigator?.locks ? (key, write) => realm.navigator.locks.request(key, write) : undefined);
  const documentFiles: SchematicEditorHostServices["documentFiles"] = {
    read: (file) => readSchematicDocumentFile(file),
    download: (document, title) => downloadSchematicDocumentFile(document, title)
  };
  const clipboardPort: SchematicEditorHostServices["clipboard"] = {
    readDocument: () => readSchematicDocumentFromClipboard(ownerWindow.navigator.clipboard)
  };
  const createTabs = (
    element: HTMLElement,
    options: Parameters<SchematicEditorHostServices["createDocumentTabs"]>[1]
  ) => new SchematicDocumentTabs(element, options, {
    setTimeout: (callback, delayMs) => ownerWindow.setTimeout(callback, delayMs),
    clearTimeout: (handle) => ownerWindow.clearTimeout(handle)
  });

  return {
    ownerDocument,
    ownerWindow: realm,
    workspace,
    documentFiles,
    clipboard: clipboardPort,
    cursors: {
      delete: cursorFromSvg(deleteIcon),
      temporaryDelete: cursorFromSvg(tempDeleteIcon)
    },
    noteRuntimeAdapter: webMarkdownNoteRuntimeAdapter,
    idFactory: createId,
    createAbortController: () => new realm.AbortController(),
    requestAnimationFrame: (callback) => ownerWindow.requestAnimationFrame(callback),
    cancelAnimationFrame: (handle) => ownerWindow.cancelAnimationFrame(handle),
    setTimeout: (callback, delayMs) => ownerWindow.setTimeout(callback, delayMs),
    clearTimeout: (handle) => ownerWindow.clearTimeout(handle),
    createDocumentHost: (element, bridge) => new SchematicWebDocumentHost({
      workspace,
      documentFiles,
      clipboard: clipboardPort,
      bridge,
      createId,
      setTimeout: (callback, delayMs) => ownerWindow.setTimeout(callback, delayMs),
      clearTimeout: (handle) => ownerWindow.clearTimeout(handle),
      createTabs: (options) => createTabs(element, options)
    }),
    createDocumentTabs: createTabs,
    createAnalysisController: (element, options) => new SchematicAnalysisController(element, options),
    createContextMenuController: (options) => new SchematicContextMenuController({
      ...options,
      ownerDocument,
      viewport: () => ({ width: ownerWindow.innerWidth, height: ownerWindow.innerHeight }),
      copyTextToClipboard: async (text) => {
        const clipboard = ownerWindow.navigator.clipboard;
        if (!clipboard?.writeText) throw new Error("Text clipboard is not available.");
        await clipboard.writeText(text);
      }
    })
  };
}

function cursorFromSvg(svg: string) {
  const cursorSvg = svg
    .replace('width="200"', 'width="32"')
    .replace('height="200"', 'height="32"');
  return `url("data:image/svg+xml,${encodeURIComponent(cursorSvg)}") 16 16, crosshair`;
}

/** LAN HTTP has getRandomValues, but not the secure-context-only randomUUID. */
function createWebId(crypto: Crypto): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function localStorageFor(ownerWindow: Window): WorkspaceStorage | null {
  try {
    return ownerWindow.localStorage;
  } catch {
    return null;
  }
}
