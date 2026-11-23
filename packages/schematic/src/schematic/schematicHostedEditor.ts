import type { SchematicContextMenuScope } from "./contextMenuModel";
import type { SchematicEditorHandle } from "./editorHandle";
import type { SchematicSelectionExportInput } from "./selection/selectionExport";
import type { NetlistDesign } from "./netlist/model";
import type {
  AnalysisPortSelection,
  ExtractedNetlist,
  Point,
  SchematicContent,
  SchematicDocument,
  SchematicViewState
} from "./types";

export interface SchematicEditorRuntimeServices {
  readonly ownerDocument: Document;
  readonly ownerWindow: Window & typeof globalThis;
  idFactory(): string;
  createAbortController(): AbortController;
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(handle: number): void;
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
}

export interface SchematicEditorAnalysisBridge {
  clearActivePick(): void;
  hasActivePick(): boolean;
  pickNet(point: Point): boolean;
  refreshNetSelectorsFromNames(nets: Iterable<string>, requestedSelection?: AnalysisPortSelection): void;
  refreshNetSelectors(netlist?: ExtractedNetlist, requestedSelection?: AnalysisPortSelection): void;
  selection(): AnalysisPortSelection;
  setSelection(selection: AnalysisPortSelection): void;
  cancelPendingCompute(): void;
  refreshLanguage?(): void;
}

export interface SchematicEditorContextMenuBridge {
  readonly hidden: boolean;
  containsTarget(target: EventTarget | null): boolean;
  show(clientX: number, clientY: number, scope?: SchematicContextMenuScope): void;
  close(): void;
}

export interface SchematicEditorHostBridge {
  readonly analysis?: SchematicEditorAnalysisBridge;
  readonly contextMenu?: SchematicEditorContextMenuBridge;
  /** Accepts a local edit into host history. Persistence failure is reported separately. */
  commit(content: SchematicContent, metadata: SchematicEditorCommitMetadata): boolean;
  saveState?(): "saved" | "pending" | "failed";
  undo(): SchematicContent | null;
  redo(): SchematicContent | null;
  canUndo(): boolean;
  canRedo(): boolean;
  onViewChange(view: SchematicViewState): void;
  onStatusChange?(status: string): void;
  ownsKeyboardTarget?(target: EventTarget): boolean;
  readonly closeInstanceSearchAfterActivation?: boolean;
  onInstanceSearchVisibilityChange?(open: boolean): void;
  projectNetlist?(document: SchematicDocument): NetlistDesign | null;
  selectProjectDiagnostic?(sheetId: string, componentId: string): void;
  hierarchyLibrary?(): { id: string; name: string; enabled: boolean; preview: () => string }[];
  placeHierarchySheet?(id: string): void;
  onHierarchySelectionChange?(componentId?: string): void;
}

export interface SchematicEditorCommitMetadata {
  origin: string;
  reason: string;
  revision: number;
}

export interface SchematicHostedDocumentSnapshot {
  document: SchematicDocument;
  view: SchematicViewState;
}

export interface SchematicHostedDocumentActivation {
  id: string;
  title: string;
  document: SchematicDocument;
  view: SchematicViewState;
  analysisSelection?: AnalysisPortSelection;
}

/** Internal port used by the Web document host without exposing Web storage to the editor. */
export interface SchematicHostedEditor extends SchematicEditorHandle {
  hostCaptureDocument(): SchematicHostedDocumentSnapshot;
  hostActivateDocument(input: SchematicHostedDocumentActivation): void;
  hostDocument(): SchematicDocument;
  hostBeginClipboardCopy(document: SchematicDocument): void;
  hostFinishActiveEdits(): void;
  hostSetStatus(message: string): void;
  hostPrepareAnalysisNetPick(): void;
  hostFocusCanvas(): void;
  hostPrepareSelectionExportInput(): Promise<SchematicSelectionExportInput>;
  hostPrepareSelectionNetlistText(): string | null;
  hostPrepareSelectionJsonText(): string | null;
}
