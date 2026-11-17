export interface SchematicNoteRuntimeOptions {
  noteId: string;
  host: HTMLElement;
  markdown: string;
  editable: boolean;
  signal?: AbortSignal;
  onChange(markdown: string): void;
  onResize(contentHeight: number): void;
}

export interface SchematicNoteRuntime {
  readonly isEditable: boolean;
  read(): string;
  flushTransientEdits(): void;
  setEditable(editable: boolean): void;
  setMarkdown(markdown: string): void;
  focus(): void;
  insertText(text: string): boolean;
  cloneStaticContent(options?: { inlineStyles?: boolean }): HTMLElement | null;
  staticTextContent(): string;
  staticTextStyle(): { fontWeight?: number; fontStyle?: "italic" };
  waitForRendering(timeoutMs?: number): Promise<void>;
  destroy(): Promise<void>;
}

export interface SchematicNoteRuntimeAdapter {
  create(options: SchematicNoteRuntimeOptions): Promise<SchematicNoteRuntime>;
}
