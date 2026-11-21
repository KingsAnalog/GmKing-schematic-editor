import type { SchematicDocumentSvgOptions } from "./documentSvgRenderer";
import type { SchematicContextMenuScope } from "./contextMenuModel";
import type { LogEntry } from "./eventLog";
import type {
  SchematicAnalysisControllerOptions
} from "./analysis/analysisController";
import type {
  SchematicContextMenuControllerOptions,
  SchematicSelectionExportFormat
} from "./contextMenuController";
import type {
  SchematicCloseSnackbarOptions,
  SchematicDocumentTabItem,
  SchematicDocumentTabsOptions
} from "./schematicDocumentTabs";
import type {
  SchematicWorkspaceManifest,
  SchematicWorkspaceRestoreOptions,
  SchematicWorkspaceRestoreProjection,
  SchematicWorkspaceSnapshotInput
} from "./workspaceAdapter";
import type { SchematicDocumentState } from "../shared/workspaceState";
import type {
  AnalysisPortSelection,
  ExtractedNetlist,
  Point,
  SchematicDocument
} from "./types";
import type { SchematicNoteRuntimeAdapter } from "./notes/noteRuntimeAdapter";

export interface SchematicDocumentFileLike {
  readonly name: string;
  readonly size: number;
  text(): Promise<string>;
}

export interface ImportedSchematicDocumentFile {
  title: string;
  document: SchematicDocument;
}

export interface SchematicDocumentTabsPort {
  bind(): void;
  destroy(): void;
  render(items: readonly SchematicDocumentTabItem[], activeId: string): void;
  showCloseSnackbar(options: SchematicCloseSnackbarOptions): void;
  hideCloseSnackbar(): void;
  showStorageError(message: string): void;
  clearStorageError(): void;
}

export interface SchematicAnalysisControllerPort {
  bind(): void;
  destroy(): void;
  clearActivePick(): void;
  hasActivePick(): boolean;
  pickNet(point: Point): boolean;
  refreshNetSelectorsFromNames(nets: Iterable<string>, requestedSelection?: AnalysisPortSelection): void;
  refreshNetSelectors(netlist?: ExtractedNetlist, requestedSelection?: AnalysisPortSelection): void;
  selection(): AnalysisPortSelection;
  setSelection(selection: AnalysisPortSelection): void;
  cancelPendingCompute(): void;
}

export interface SchematicContextMenuControllerPort {
  readonly hidden: boolean;
  containsTarget(target: EventTarget | null): boolean;
  show(clientX: number, clientY: number, scope?: SchematicContextMenuScope): void;
  close(): void;
  copySelectionAs(format: SchematicSelectionExportFormat): Promise<void>;
  destroy(): void;
}

export interface SchematicWorkspacePort {
  createDocumentSnapshot(
    document: SchematicDocument,
    input: SchematicWorkspaceSnapshotInput
  ): SchematicDocumentState;
  projectDocumentRestore(
    state: SchematicDocumentState | undefined,
    options: SchematicWorkspaceRestoreOptions
  ): SchematicWorkspaceRestoreProjection;
  readManifest(): SchematicWorkspaceManifest | undefined;
  persistManifest(snapshot: SchematicWorkspaceManifest): SchematicWorkspaceManifest | undefined | Promise<SchematicWorkspaceManifest | undefined>;
  readDocument(id: string): SchematicDocumentState | undefined;
  persistDocument(id: string, snapshot: SchematicDocumentState): SchematicDocumentState | Promise<SchematicDocumentState>;
  persistView?(id: string, view: Omit<SchematicDocumentState, "document">): void;
  removeDocument(id: string): void | Promise<void>;
}

export interface SchematicDocumentFilePort {
  read(file: SchematicDocumentFileLike): Promise<ImportedSchematicDocumentFile>;
  download(document: SchematicDocument, title: string): void;
  downloadImage(
    document: SchematicDocument,
    title: string,
    format: "svg" | "png",
    options: Pick<SchematicDocumentSvgOptions, "includeHidden" | "presentationMode">
  ): Promise<void>;
}

export interface SchematicClipboardPort {
  readDocument(): Promise<SchematicDocument>;
}

export interface SchematicHostedDocumentSession<EditorState> {
  id: string;
  title: string;
  state: SchematicDocumentState | null;
  storageStatus: "unloaded" | "loaded" | "missing" | "new";
  editorState: EditorState;
  saveState?: "saved" | "pending" | "failed";
}

export interface SchematicDocumentHostBridge<EditorState> {
  createEditorState(document?: SchematicDocument): EditorState;
  captureActiveSession(session: SchematicHostedDocumentSession<EditorState>): void;
  restoreInitialSession(session: SchematicHostedDocumentSession<EditorState>): void;
  switchSession(
    outgoing: SchematicHostedDocumentSession<EditorState> | null,
    target: SchematicHostedDocumentSession<EditorState>
  ): void;
  destroySession(session: SchematicHostedDocumentSession<EditorState>): void;
  finishActiveEdits(): void;
  isDisposableBlank(session: SchematicHostedDocumentSession<EditorState>): boolean;
  currentDocument(): SchematicDocument;
  currentPresentationMode(): boolean;
  applyClipboardDocument(document: SchematicDocument): void;
  setStatus(message: string, log?: Pick<LogEntry, "level" | "source">): void;
  fit(): void;
  isDestroyed(): boolean;
  onSaveStateChange?(): void;
}

export interface SchematicDocumentHostPort<EditorState> {
  readonly activeDocumentId: string;
  hasUnsavedChanges?(): boolean;
  pasteFromClipboard(): Promise<void>;
  init(): void | Promise<void>;
  destroy(): void;
  persistActive(
    errorMessage?: string
  ): Promise<boolean>;
  activeSession(): SchematicHostedDocumentSession<EditorState> | null;
}

/** Browser capabilities required by the Web editor shell, all scoped to its mount realm. */
export interface SchematicEditorHostServices {
  readonly ownerDocument: Document;
  readonly ownerWindow: Window & typeof globalThis;
  readonly workspace: SchematicWorkspacePort;
  readonly documentFiles: SchematicDocumentFilePort;
  readonly clipboard: SchematicClipboardPort;
  readonly cursors?: {
    delete: string;
    temporaryDelete: string;
  };
  readonly noteRuntimeAdapter?: SchematicNoteRuntimeAdapter;
  idFactory(): string;
  createAbortController(): AbortController;
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(handle: number): void;
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
  createDocumentHost<EditorState>(
    root: HTMLElement,
    bridge: SchematicDocumentHostBridge<EditorState>
  ): SchematicDocumentHostPort<EditorState>;
  createDocumentTabs(root: HTMLElement, options: SchematicDocumentTabsOptions): SchematicDocumentTabsPort;
  createAnalysisController(
    root: HTMLElement,
    options: SchematicAnalysisControllerOptions
  ): SchematicAnalysisControllerPort;
  createContextMenuController(
    options: SchematicContextMenuControllerOptions
  ): SchematicContextMenuControllerPort;
}
