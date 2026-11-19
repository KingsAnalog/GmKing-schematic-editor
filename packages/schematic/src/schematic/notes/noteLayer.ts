import { noteBackgroundCss, noteTextColor } from "./noteAppearance";
import { noteCssTransform, noteRotation } from "./noteGeometry";
import type { SchematicNoteRuntime, SchematicNoteRuntimeAdapter } from "./noteRuntimeAdapter";
import { rawTextNoteRuntimeAdapter } from "./rawTextNoteRuntimeAdapter";
import {
  markdownNoteHeightFromMeasuredContent,
  noteHeightPx,
  noteSizeFromMeasuredContent,
  noteWidthPx,
  textForNoteMeasurement
} from "./noteSizing";
import type { Point, SchematicNote } from "../types";

const NOTE_EDITOR_SELECTOR = "[data-note-editor]";
const NOTE_CONTENT_SELECTOR = "[data-note-content]";

export interface NoteEditorValue {
  text: string;
}

export interface SchematicNoteLayerOptions {
  onMarkdownChange?: (noteId: string, markdown: string) => void;
  onMarkdownResize?: (noteId: string, height: number) => void;
  runtimeAdapter?: SchematicNoteRuntimeAdapter;
}

interface NoteLayerViewState {
  selectedIds: ReadonlySet<string>;
  editingNoteId: string | null;
  zoom: number;
  noteFontSizePx(note: SchematicNote): number;
  worldToScreenPoint(point: Point): Point;
}

interface MarkdownRuntimeSlot {
  generation: number;
  abortController: AbortController;
  runtime: SchematicNoteRuntime | null;
  promise: Promise<SchematicNoteRuntime | null> | null;
  editable: boolean;
  markdown: string;
  pendingInput: string;
}

interface NoteDocumentLayer {
  id: string;
  element: HTMLElement;
  noteElements: Map<string, HTMLElement>;
  markdownRuntimes: Map<string, MarkdownRuntimeSlot>;
  markdownDestroyPromises: Map<string, Promise<void>>;
  pendingPlainInput: Map<string, string>;
}

function noteContent(element: HTMLElement) {
  return element.querySelector<HTMLElement>(NOTE_CONTENT_SELECTOR);
}

function noteTextarea(element: HTMLElement) {
  return element.querySelector<HTMLTextAreaElement>(NOTE_EDITOR_SELECTOR);
}

export class SchematicNoteLayer {
  private readonly ownerDocument: Document;
  private readonly ownerWindow: Window & typeof globalThis;
  private readonly layerElement: HTMLElement;
  private readonly measureElement: HTMLElement;
  private readonly documentLayers = new Map<string, NoteDocumentLayer>();
  private readonly detachedRenderControllers = new Set<AbortController>();
  private activeDocumentLayer: NoteDocumentLayer;
  private nextRuntimeGeneration = 1;
  private destroyPromise: Promise<void> | null = null;
  private readonly runtimeAdapter: SchematicNoteRuntimeAdapter;

  constructor(paperElement: HTMLElement, private readonly options: SchematicNoteLayerOptions = {}) {
    this.ownerDocument = paperElement.ownerDocument ?? globalThis.document;
    this.ownerWindow = (this.ownerDocument.defaultView ?? globalThis) as Window & typeof globalThis;
    this.runtimeAdapter = options.runtimeAdapter ?? rawTextNoteRuntimeAdapter;
    this.layerElement = this.ownerDocument.createElement("div");
    this.layerElement.className = "schematic-note-layer";
    this.layerElement.setAttribute("aria-label", "Schematic notes");
    paperElement.appendChild(this.layerElement);

    this.measureElement = this.ownerDocument.createElement("div");
    this.measureElement.className = "schematic-note schematic-note-measure";
    this.measureElement.setAttribute("aria-hidden", "true");
    this.layerElement.appendChild(this.measureElement);

    this.activeDocumentLayer = this.createDocumentLayer("__initial__");
  }

  private get noteElements() {
    return this.activeDocumentLayer.noteElements;
  }

  private get markdownRuntimes() {
    return this.activeDocumentLayer.markdownRuntimes;
  }

  private get markdownDestroyPromises() {
    return this.activeDocumentLayer.markdownDestroyPromises;
  }

  get element() {
    return this.layerElement;
  }

  activateDocument(id: string) {
    if (this.activeDocumentLayer.id === id) {
      this.activeDocumentLayer.element.hidden = false;
      return;
    }
    const retainedLayer = this.documentLayers.get(id);
    if (
      this.activeDocumentLayer.id === "__initial__"
      && this.activeDocumentLayer.noteElements.size === 0
      && this.activeDocumentLayer.markdownRuntimes.size === 0
    ) {
      const initialLayer = this.activeDocumentLayer;
      this.documentLayers.delete(initialLayer.id);
      if (retainedLayer) {
        initialLayer.element.remove();
        this.activeDocumentLayer = retainedLayer;
        retainedLayer.element.hidden = false;
        return;
      }
      this.activeDocumentLayer.id = id;
      this.documentLayers.set(id, this.activeDocumentLayer);
      this.activeDocumentLayer.element.hidden = false;
      return;
    }
    this.setDocumentLayerEditable(this.activeDocumentLayer, false);
    this.activeDocumentLayer.element.hidden = true;
    this.activeDocumentLayer = retainedLayer ?? this.createDocumentLayer(id);
    this.activeDocumentLayer.element.hidden = false;
  }

  deactivateDocument(id: string) {
    const layer = this.documentLayers.get(id);
    if (!layer) return;
    this.setDocumentLayerEditable(layer, false);
    layer.element.hidden = true;
  }

  discardDocument(id: string) {
    const layer = this.documentLayers.get(id);
    if (!layer) return;
    const noteIds = new Set([
      ...layer.noteElements.keys(),
      ...layer.markdownRuntimes.keys()
    ]);
    noteIds.forEach((noteId) => {
      void this.destroyMarkdownRuntime(noteId, layer);
    });
    layer.noteElements.forEach((element) => element.remove());
    layer.noteElements.clear();
    layer.element.remove();
    this.documentLayers.delete(id);
    if (this.activeDocumentLayer === layer) {
      this.activeDocumentLayer = this.createDocumentLayer("__initial__");
    }
  }

  getNoteElement(noteId: string) {
    return this.noteElements.get(noteId) ?? null;
  }

  private createDocumentLayer(id: string): NoteDocumentLayer {
    const element = this.ownerDocument.createElement("div");
    element.className = "schematic-note-document-layer";
    this.layerElement.appendChild(element);
    const layer: NoteDocumentLayer = {
      id,
      element,
      noteElements: new Map(),
      markdownRuntimes: new Map(),
      markdownDestroyPromises: new Map(),
      pendingPlainInput: new Map()
    };
    this.documentLayers.set(id, layer);
    return layer;
  }

  private setDocumentLayerEditable(layer: NoteDocumentLayer, editable: boolean) {
    layer.markdownRuntimes.forEach((slot) => {
      slot.editable = editable;
      if (!editable) slot.pendingInput = "";
      slot.runtime?.setEditable(editable);
    });
    if (!editable) layer.pendingPlainInput.clear();
  }

  noteElementFromEvent(event: Event) {
    return (event.target as HTMLElement | null)?.closest<HTMLElement>("[data-note-id]") ?? null;
  }

  render(notes: SchematicNote[], state: NoteLayerViewState) {
    const activeIds = new Set(notes.map((note) => note.id));
    Array.from(this.noteElements.entries()).forEach(([id, element]) => {
      if (activeIds.has(id)) return;
      void this.destroyMarkdownRuntime(id);
      element.remove();
      this.noteElements.delete(id);
    });

    notes.forEach((note) => {
      const element = this.noteElements.get(note.id) ?? this.createNoteElement(note);
      this.noteElements.set(note.id, element);
      this.syncNoteElement(note, element, state);
    });

    this.updateTransform(notes, state);
  }

  reset() {
    const noteIds = new Set([
      ...this.noteElements.keys(),
      ...this.markdownRuntimes.keys()
    ]);
    noteIds.forEach((id) => {
      void this.destroyMarkdownRuntime(id);
    });
    this.noteElements.forEach((element) => element.remove());
    this.noteElements.clear();
  }

  destroy() {
    if (this.destroyPromise) return this.destroyPromise;
    this.detachedRenderControllers.forEach((controller) => controller.abort());
    this.detachedRenderControllers.clear();
    const layers = Array.from(this.documentLayers.values());
    const runtimeCleanup = layers.flatMap((layer) => {
      const noteIds = new Set([
        ...layer.noteElements.keys(),
        ...layer.markdownRuntimes.keys()
      ]);
      return Array.from(noteIds, (noteId) => this.destroyMarkdownRuntime(noteId, layer));
    });
    layers.forEach((layer) => {
      layer.noteElements.clear();
      layer.pendingPlainInput.clear();
      layer.element.remove();
    });
    this.documentLayers.clear();
    this.layerElement.remove();
    this.destroyPromise = Promise.allSettled(runtimeCleanup).then(() => {});
    return this.destroyPromise;
  }

  updateTransform(notes: SchematicNote[], state: NoteLayerViewState) {
    notes.forEach((note) => this.positionNoteElement(note, state));
  }

  positionNoteElement(note: SchematicNote, state: Pick<NoteLayerViewState, "zoom" | "worldToScreenPoint">) {
    const element = this.noteElements.get(note.id);
    if (!element) return;
    const screen = state.worldToScreenPoint(note);
    element.style.left = `${screen.x}px`;
    element.style.top = `${screen.y}px`;
    element.style.transform = noteCssTransform(note, state.zoom);
    const handle = element.querySelector<HTMLElement>("[data-note-width-handle]");
    if (handle) handle.style.cursor = noteRotation(note) % 180 ? "ns-resize" : "ew-resize";
  }

  syncSelectionStyles(selectedIds: ReadonlySet<string>, editingNoteId: string | null, hoverIds: ReadonlySet<string> = new Set()) {
    this.noteElements.forEach((element, id) => {
      element.classList.toggle("is-selected", selectedIds.has(id) || hoverIds.has(id));
      element.classList.toggle("is-editing", editingNoteId === id);
    });
  }

  mountEditor(note: SchematicNote) {
    const layer = this.activeDocumentLayer;
    const element = this.noteElements.get(note.id);
    if (!element) return false;
    element.classList.add("is-editing");
    if (note.format === "markdown") {
      const promise = this.ensureMarkdownRuntime(note, element, true);
      this.focusMarkdownRuntimeWhenCurrent(note.id, element, promise);
      return true;
    }

    const pendingDestroy = this.markdownDestroyPromises.get(note.id);
    if (pendingDestroy) {
      void pendingDestroy.then(() => {
        if (this.activeDocumentLayer !== layer) return;
        const currentElement = layer.noteElements.get(note.id);
        if (!currentElement?.classList.contains("is-editing") || currentElement.classList.contains("is-markdown")) return;
        this.mountEditor(note);
        this.focusEditor(note);
      });
      return true;
    }

    const content = noteContent(element);
    if (!content) return false;
    content.replaceChildren();
    const textarea = this.ownerDocument.createElement("textarea");
    textarea.dataset.noteEditor = "";
    textarea.value = note.text;
    textarea.wrap = "off";
    textarea.spellcheck = false;
    textarea.setAttribute("aria-label", "Edit schematic note");
    content.appendChild(textarea);
    this.flushPendingPlainInput(note.id, textarea);
    return true;
  }

  focusEditor(note: SchematicNote) {
    const element = this.noteElements.get(note.id);
    if (!element) return;
    if (note.format === "markdown") {
      const slot = this.markdownRuntimes.get(note.id);
      const promise = slot?.runtime ? Promise.resolve(slot.runtime) : slot?.promise;
      if (promise) this.focusMarkdownRuntimeWhenCurrent(note.id, element, promise);
      return;
    }
    const textarea = noteTextarea(element);
    if (!textarea) return;
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  }

  readEditor(note: SchematicNote): NoteEditorValue {
    const element = this.noteElements.get(note.id);
    if (!element) return { text: note.text };
    if (note.format === "markdown") {
      return { text: this.markdownRuntimes.get(note.id)?.runtime?.read() ?? note.text };
    }
    return { text: noteTextarea(element)?.value.replace(/\r\n?/g, "\n") ?? note.text };
  }

  flushEditor(note: SchematicNote) {
    if (note.format !== "markdown") return;
    this.markdownRuntimes.get(note.id)?.runtime?.flushTransientEdits();
  }

  insertEditorText(note: SchematicNote, text: string) {
    const element = this.noteElements.get(note.id);
    if (!text || !element?.classList.contains("is-editing")) return false;
    if (note.format === "markdown") {
      const slot = this.markdownRuntimes.get(note.id);
      if (slot?.runtime && slot.editable && slot.runtime.isEditable) {
        slot.runtime.focus();
        return slot.runtime.insertText(text);
      }
      const promise = this.ensureMarkdownRuntime(note, element, true);
      const pendingSlot = this.markdownRuntimes.get(note.id);
      if (!pendingSlot || !pendingSlot.editable) return false;
      pendingSlot.pendingInput += text;
      this.focusMarkdownRuntimeWhenCurrent(note.id, element, promise);
      return true;
    }

    const textarea = noteTextarea(element);
    if (textarea) {
      this.insertPlainText(textarea, text);
      return true;
    }
    const pending = this.activeDocumentLayer.pendingPlainInput.get(note.id) ?? "";
    this.activeDocumentLayer.pendingPlainInput.set(note.id, pending + text);
    return true;
  }

  unmountEditor(note: SchematicNote) {
    const element = this.noteElements.get(note.id);
    if (!element) return;
    element.classList.remove("is-editing");
    this.activeDocumentLayer.pendingPlainInput.delete(note.id);
    if (note.format === "markdown") {
      const slot = this.markdownRuntimes.get(note.id);
      if (slot) {
        slot.editable = false;
        slot.pendingInput = "";
      }
      slot?.runtime?.setEditable(false);
    } else {
      const content = noteContent(element);
      if (content) content.textContent = note.text;
    }
  }

  setNoteBackground(noteId: string, color: string | null) {
    const element = this.noteElements.get(noteId);
    if (element) element.style.backgroundColor = color === null ? "transparent" : color;
  }

  setNoteFontSize(note: SchematicNote, fontSizePx: number) {
    const element = this.noteElements.get(note.id);
    if (!element) return;
    element.style.fontSize = `${fontSizePx}px`;
    this.applyNoteElementSize(note);
  }

  resizeNoteToContent(note: SchematicNote, fontSizePx: number) {
    if (note.format === "markdown") return;
    this.resizeNoteToText(note, note.text, fontSizePx);
  }

  resizeNoteToText(note: SchematicNote, text: string, fontSizePx: number) {
    if (note.format === "markdown") return;
    const size = this.measureNoteText(text, fontSizePx);
    note.width = size.width;
    note.height = size.height;
  }

  applyNoteElementSize(note: SchematicNote) {
    const element = this.noteElements.get(note.id);
    if (!element) return;
    element.style.width = `${noteWidthPx(note)}px`;
    element.style.height = `${noteHeightPx(note)}px`;
    if (note.format === "plain") {
      const textarea = noteTextarea(element);
      if (textarea) {
        textarea.scrollTop = 0;
        textarea.scrollLeft = 0;
      }
    }
  }

  refreshMarkdownLayout(noteId: string) {
    const element = this.noteElements.get(noteId);
    const host = element ? noteContent(element) : null;
    if (host) this.reportMarkdownHeight(noteId, host.scrollHeight);
  }

  cloneRenderedNoteContent(note: SchematicNote) {
    if (note.format === "markdown") return this.markdownRuntimes.get(note.id)?.runtime?.cloneStaticContent() ?? null;
    const clone = this.ownerDocument.createElement("div");
    clone.className = "schematic-note-plain-content";
    clone.textContent = note.text || " ";
    return clone;
  }

  async waitForRenderedNoteContent(note: SchematicNote, options: { inlineStyles?: boolean } = {}) {
    return (await this.waitForRenderedNoteExport(note, options)).content;
  }

  async waitForRenderedNoteExport(note: SchematicNote, options: { inlineStyles?: boolean } = {}) {
    if (note.format !== "markdown") {
      return { content: this.cloneRenderedNoteContent(note), text: note.text, textStyle: {} };
    }
    const element = this.noteElements.get(note.id);
    if (!element) return { content: null, text: note.text, textStyle: {} };
    const runtime = await this.ensureMarkdownRuntime(note, element, false);
    await runtime?.waitForRendering();
    return {
      content: runtime?.cloneStaticContent(options) ?? null,
      text: runtime?.staticTextContent() ?? note.text,
      textStyle: runtime?.staticTextStyle() ?? {}
    };
  }

  async renderDetachedMarkdown(markdown: string) {
    const shell = this.ownerDocument.createElement("div");
    shell.className = "schematic-note is-markdown schematic-note-static-render";
    const content = this.ownerDocument.createElement("div");
    content.className = "schematic-note-content";
    content.dataset.noteContent = "";
    shell.appendChild(content);
    this.layerElement.appendChild(shell);

    const AbortControllerCtor = this.ownerWindow.AbortController ?? AbortController;
    const abortController = new AbortControllerCtor();
    this.detachedRenderControllers.add(abortController);
    let runtime: SchematicNoteRuntime | null = null;
    try {
      if (abortController.signal.aborted) return null;
      runtime = await this.runtimeAdapter.create({
        noteId: `copy-preview-${this.nextRuntimeGeneration++}`,
        host: content,
        markdown,
        editable: false,
        signal: abortController.signal,
        onChange: () => {},
        onResize: () => {}
      });
      await runtime.waitForRendering();
      return runtime.cloneStaticContent();
    } catch {
      return null;
    } finally {
      abortController.abort();
      this.detachedRenderControllers.delete(abortController);
      await runtime?.destroy();
      shell.remove();
    }
  }

  cloneRenderedMarkdownByText(markdown: string) {
    for (const slot of this.markdownRuntimes.values()) {
      if (slot.runtime?.read() === markdown) return slot.runtime.cloneStaticContent();
    }
    return null;
  }

  private createNoteElement(note: SchematicNote) {
    const element = this.ownerDocument.createElement("div");
    element.className = "schematic-note";
    element.dataset.noteId = note.id;
    element.setAttribute("role", "group");
    element.setAttribute("aria-label", "Schematic note");
    element.tabIndex = 0;

    const content = this.ownerDocument.createElement("div");
    content.className = "schematic-note-content";
    content.dataset.noteContent = "";
    const widthHandle = this.ownerDocument.createElement("div");
    widthHandle.className = "schematic-note-width-handle";
    widthHandle.dataset.noteWidthHandle = "";
    widthHandle.setAttribute("role", "separator");
    widthHandle.setAttribute("aria-label", "Resize note width");
    element.append(content, widthHandle);
    this.activeDocumentLayer.element.appendChild(element);
    return element;
  }

  private syncNoteElement(note: SchematicNote, element: HTMLElement, state: NoteLayerViewState) {
    const editing = state.editingNoteId === note.id;
    element.classList.toggle("is-selected", state.selectedIds.has(note.id));
    element.classList.toggle("is-editing", editing);
    element.classList.toggle("is-markdown", note.format === "markdown");
    element.style.backgroundColor = noteBackgroundCss(note);
    element.style.color = noteTextColor(note);
    element.style.fontSize = `${state.noteFontSizePx(note)}px`;
    const content = noteContent(element);
    if (!content) return;

    if (note.format === "markdown") {
      void this.ensureMarkdownRuntime(note, element, editing);
    } else {
      void this.destroyMarkdownRuntime(note.id);
      if (!editing) content.textContent = note.text;
      this.resizeNoteToContent(note, state.noteFontSizePx(note));
    }
    this.applyNoteElementSize(note);
    this.positionNoteElement(note, state);
  }

  private ensureMarkdownRuntime(note: SchematicNote, element: HTMLElement, editable: boolean) {
    const layer = this.activeDocumentLayer;
    const content = noteContent(element);
    if (!content) return Promise.resolve(null);
    const nextEditable = editable && element.classList.contains("is-editing") && element.classList.contains("is-markdown");
    const existing = layer.markdownRuntimes.get(note.id);
    if (existing?.runtime) {
      existing.editable = nextEditable;
      existing.markdown = note.text;
      const alreadyEditing = existing.runtime.isEditable && nextEditable;
      existing.runtime.setEditable(nextEditable);
      if (!alreadyEditing) existing.runtime.setMarkdown(note.text);
      return Promise.resolve(existing.runtime);
    }
    if (existing?.promise) {
      existing.editable = nextEditable;
      existing.markdown = note.text;
      return existing.promise;
    }

    const pendingDestroy = layer.markdownDestroyPromises.get(note.id);
    if (!pendingDestroy) content.textContent = note.text || " ";
    const generation = this.nextRuntimeGeneration++;
    const AbortControllerCtor = this.ownerWindow.AbortController ?? AbortController;
    const abortController = new AbortControllerCtor();
    const slot: MarkdownRuntimeSlot = {
      generation,
      abortController,
      runtime: null,
      promise: null,
      editable: nextEditable,
      markdown: note.text,
      pendingInput: ""
    };
    const promise = Promise.resolve(pendingDestroy)
      .then(() => {
        if (abortController.signal.aborted) return null;
        const current = layer.markdownRuntimes.get(note.id);
        if (!this.isCurrentMarkdownSlot(layer, note.id, element, generation, current)) return null;
        content.replaceChildren();
        return this.runtimeAdapter.create({
          noteId: note.id,
          host: content,
          markdown: current.markdown,
          editable: current.editable,
          signal: abortController.signal,
          onChange: (markdown) => {
            if (
              this.activeDocumentLayer === layer
              && this.isCurrentMarkdownSlot(layer, note.id, element, generation, layer.markdownRuntimes.get(note.id))
            ) {
              this.options.onMarkdownChange?.(note.id, markdown);
            }
          },
          onResize: (contentHeight) => {
            if (
              this.activeDocumentLayer === layer
              && this.isCurrentMarkdownSlot(layer, note.id, element, generation, layer.markdownRuntimes.get(note.id))
            ) {
              this.reportMarkdownHeight(note.id, contentHeight);
            }
          }
        });
      })
      .then(async (runtime) => {
        if (!runtime) return null;
        const current = layer.markdownRuntimes.get(note.id);
        if (!this.isCurrentMarkdownSlot(layer, note.id, element, generation, current)) {
          await runtime.destroy();
          if (layer.noteElements.get(note.id) === element && !element.classList.contains("is-markdown") && !element.classList.contains("is-editing")) {
            content.textContent = note.text;
          }
          return null;
        }
        const editableNow = current.editable && element.classList.contains("is-editing");
        const alreadyEditing = runtime.isEditable && editableNow;
        runtime.setEditable(editableNow);
        if (!alreadyEditing) runtime.setMarkdown(current.markdown);
        current.runtime = runtime;
        current.promise = null;
        element.classList.remove("has-markdown-runtime-error");
        return runtime;
      })
      .catch(() => {
        const current = layer.markdownRuntimes.get(note.id);
        if (current?.generation === generation) {
          current.promise = null;
          content.textContent = note.text || " ";
          element.classList.add("has-markdown-runtime-error");
        }
        return null;
      });
    slot.promise = promise;
    layer.markdownRuntimes.set(note.id, slot);
    return promise;
  }

  private destroyMarkdownRuntime(
    noteId: string,
    layer = this.activeDocumentLayer
  ): Promise<void> {
    const slot = layer.markdownRuntimes.get(noteId);
    const pending = layer.markdownDestroyPromises.get(noteId);
    if (!slot) return pending ?? Promise.resolve();
    layer.markdownRuntimes.delete(noteId);
    slot.abortController.abort();
    const destroyPromise = Promise.resolve(pending)
      .then(async () => {
        const runtime = slot.runtime ?? await slot.promise;
        await runtime?.destroy();
      });
    const trackedPromise = destroyPromise.finally(() => {
      if (layer.markdownDestroyPromises.get(noteId) === trackedPromise) {
        layer.markdownDestroyPromises.delete(noteId);
      }
    });
    layer.markdownDestroyPromises.set(noteId, trackedPromise);
    return trackedPromise;
  }

  private isCurrentMarkdownSlot(
    layer: NoteDocumentLayer,
    noteId: string,
    element: HTMLElement,
    generation: number,
    slot: MarkdownRuntimeSlot | undefined
  ): slot is MarkdownRuntimeSlot {
    return Boolean(
      slot
      && slot.generation === generation
      && !slot.abortController.signal.aborted
      && layer.noteElements.get(noteId) === element
      && element.classList.contains("is-markdown")
    );
  }

  private isCurrentEditableRuntime(
    layer: NoteDocumentLayer,
    noteId: string,
    element: HTMLElement,
    runtime: SchematicNoteRuntime
  ) {
    const slot = layer.markdownRuntimes.get(noteId);
    return Boolean(
      slot?.runtime === runtime
      && slot.editable
      && runtime.isEditable
      && this.activeDocumentLayer === layer
      && layer.noteElements.get(noteId) === element
      && element.classList.contains("is-markdown")
      && element.classList.contains("is-editing")
    );
  }

  private focusMarkdownRuntimeWhenCurrent(
    noteId: string,
    element: HTMLElement,
    promise: Promise<SchematicNoteRuntime | null>
  ) {
    const layer = this.activeDocumentLayer;
    const generation = layer.markdownRuntimes.get(noteId)?.generation;
    if (generation === undefined) return;
    void promise.then((runtime) => {
      const slot = layer.markdownRuntimes.get(noteId);
      if (
        !runtime
        || slot?.generation !== generation
        || !this.isCurrentEditableRuntime(layer, noteId, element, runtime)
      ) {
        return;
      }
      runtime.focus();
      const pendingInput = slot.pendingInput;
      slot.pendingInput = "";
      if (pendingInput) runtime.insertText(pendingInput);
    });
  }

  private flushPendingPlainInput(noteId: string, textarea: HTMLTextAreaElement) {
    const pending = this.activeDocumentLayer.pendingPlainInput.get(noteId);
    this.activeDocumentLayer.pendingPlainInput.delete(noteId);
    if (pending) this.insertPlainText(textarea, pending);
  }

  private insertPlainText(textarea: HTMLTextAreaElement, text: string) {
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    textarea.setRangeText(text, start, end, "end");
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.focus({ preventScroll: true });
  }

  private reportMarkdownHeight(noteId: string, contentHeight: number) {
    this.options.onMarkdownResize?.(noteId, markdownNoteHeightFromMeasuredContent(contentHeight));
  }

  private measureNoteText(text: string, fontSizePx: number) {
    this.measureElement.style.fontSize = `${fontSizePx}px`;
    this.measureElement.textContent = textForNoteMeasurement(text);
    const rect = this.measureElement.getBoundingClientRect();
    return noteSizeFromMeasuredContent({ width: rect.width, height: rect.height }, fontSizePx);
  }
}
