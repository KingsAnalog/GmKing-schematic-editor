import type { InstancePaletteItem } from "./instanceSelector";
import type { SchematicSelectionExportInput } from "./selection/selectionExport";
import type { SchematicContent, SchematicViewState, WireRouteMode, WireVariant } from "./types";
import type { SymbolTemplateId } from "./symbolTemplateModel";

export type SchematicEditorHistoryMode = "push" | "reset" | "none";

export interface SchematicEditorMountElements {
  shellEl: HTMLElement;
  documentTabsEl: HTMLElement;
  paperEl: HTMLElement;
  paletteEl: HTMLElement;
  propertyEl: HTMLElement;
  statusEl?: HTMLElement;
  analysisEl?: HTMLElement;
  selectionSummaryEl?: HTMLElement;
}

export interface SchematicEditorMutationOptions {
  history?: SchematicEditorHistoryMode;
  commit?: boolean;
  origin?: string;
  reason?: string;
  revision?: number;
}

export type SchematicEditorCommand =
  | { kind: "symbol-template"; templateId: SymbolTemplateId }
  | { kind: "instance"; item?: InstancePaletteItem }
  | { kind: "wire"; variant: WireVariant }
  | { kind: "wire-route"; routeMode: WireRouteMode | "toggle" }
  | { kind: "label" }
  | { kind: "note" }
  | { kind: "copy" }
  | { kind: "paste"; content: SchematicContent }
  | { kind: "move"; behavior: "stretch" | "moveOnly" }
  | { kind: "rotate" }
  | { kind: "mirror"; axis: "x" | "y" }
  | { kind: "delete"; temporary?: boolean }
  | { kind: "fit" }
  | { kind: "reset" }
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "cancel" };

export interface SchematicEditorState {
  content: SchematicContent;
  view: SchematicViewState;
  canUndo: boolean;
  canRedo: boolean;
  status: string;
  origin: string;
  reason: string;
  revision: number;
  saveState?: "saved" | "pending" | "failed";
}

export type SchematicEditorStateListener = (state: SchematicEditorState) => void;

/** Host-neutral lifecycle and command surface for one mounted editor. */
export interface SchematicEditorHandle {
  init(): void;
  destroy(): void | Promise<void>;
  getState(): SchematicEditorState;
  getContent(): SchematicContent;
  replaceContent(content: SchematicContent, originOrOptions?: string | SchematicEditorMutationOptions): void;
  transact(
    mutate: (draft: SchematicContent) => void,
    options?: SchematicEditorMutationOptions
  ): void;
  execute(command: SchematicEditorCommand): boolean;
  run(command: string): void;
  flushTransientEdits(reason?: string): void;
  fit(): void;
  focus(): void;
  hasExportableSelection(): boolean;
  getSelectionExportInput(): Promise<SchematicSelectionExportInput>;
  getSelectionContent(): SchematicContent | null;
  subscribe(listener: SchematicEditorStateListener): () => void;
}
