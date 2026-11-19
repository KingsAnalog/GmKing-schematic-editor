import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SchematicNoteLayer,
  type SchematicNoteLayerOptions
} from "../../../src/schematic/notes/noteLayer";
import type {
  SchematicNoteRuntime,
  SchematicNoteRuntimeAdapter
} from "../../../src/schematic/notes/noteRuntimeAdapter";
import type { SchematicNote } from "../../../src/schematic/types";

const runtimeModule = {
  create: vi.fn()
};

class FakeClassList {
  private readonly values = new Set<string>();

  set(value: string) {
    this.values.clear();
    value.split(/\s+/).filter(Boolean).forEach((className) => this.values.add(className));
  }

  add(...classNames: string[]) {
    classNames.forEach((className) => this.values.add(className));
  }

  remove(...classNames: string[]) {
    classNames.forEach((className) => this.values.delete(className));
  }

  contains(className: string) {
    return this.values.has(className);
  }

  toggle(className: string, force?: boolean) {
    const enabled = force ?? !this.values.has(className);
    if (enabled) this.values.add(className);
    else this.values.delete(className);
    return enabled;
  }

  toString() {
    return Array.from(this.values).join(" ");
  }
}

class FakeElement {
  readonly classList = new FakeClassList();
  readonly dataset: Record<string, string> = {};
  readonly style: Record<string, string> = {};
  readonly attributes = new Map<string, string>();
  readonly children: FakeElement[] = [];
  parentElement: FakeElement | null = null;
  tabIndex = 0;
  spellcheck = false;
  value = "";
  wrap = "";
  scrollHeight = 20;
  hidden = false;
  selectionStart = 0;
  selectionEnd = 0;
  private ownText = "";
  private readonly listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();

  constructor(readonly tagName = "div") {}

  get ownerDocument() {
    return globalThis.document;
  }

  get className() {
    return this.classList.toString();
  }

  set className(value: string) {
    this.classList.set(value);
  }

  get textContent() {
    return this.children.length > 0
      ? this.children.map((child) => child.textContent).join("")
      : this.ownText;
  }

  set textContent(value: string) {
    this.replaceChildren();
    this.ownText = value;
  }

  appendChild(child: FakeElement) {
    child.remove();
    child.parentElement = this;
    this.children.push(child);
    this.ownText = "";
    return child;
  }

  append(...children: FakeElement[]) {
    children.forEach((child) => this.appendChild(child));
  }

  replaceChildren(...children: FakeElement[]) {
    this.children.forEach((child) => {
      child.parentElement = null;
    });
    this.children.length = 0;
    this.ownText = "";
    this.append(...children);
  }

  remove() {
    if (!this.parentElement) return;
    const index = this.parentElement.children.indexOf(this);
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  contains(candidate: FakeElement | null): boolean {
    if (!candidate) return false;
    if (candidate === this) return true;
    return this.children.some((child) => child.contains(candidate));
  }

  querySelector<T extends FakeElement = FakeElement>(selector: string): T | null {
    return this.find((element) => matchesSelector(element, selector)) as T | null;
  }

  focus() {}

  setSelectionRange(start: number, end: number) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }

  setRangeText(text: string, start: number, end: number, selectionMode?: SelectionMode) {
    this.value = `${this.value.slice(0, start)}${text}${this.value.slice(end)}`;
    const next = selectionMode === "select" ? start : start + text.length;
    this.selectionStart = next;
    this.selectionEnd = selectionMode === "select" ? start + text.length : next;
  }

  addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    const listeners = this.listeners.get(type) ?? new Set<EventListenerOrEventListenerObject>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: EventListenerOrEventListenerObject) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: Event) {
    this.listeners.get(event.type)?.forEach((listener) => {
      if (typeof listener === "function") listener.call(this as unknown as EventTarget, event);
      else listener.handleEvent(event);
    });
    return true;
  }

  getBoundingClientRect() {
    return { x: 0, y: 0, width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20 };
  }

  private find(predicate: (element: FakeElement) => boolean): FakeElement | null {
    for (const child of this.children) {
      if (predicate(child)) return child;
      const nested = child.find(predicate);
      if (nested) return nested;
    }
    return null;
  }
}

function matchesSelector(element: FakeElement, selector: string) {
  if (selector === "[data-note-content]") return Object.hasOwn(element.dataset, "noteContent");
  if (selector === "[data-note-editor]") return Object.hasOwn(element.dataset, "noteEditor");
  const runtimeMarker = selector.match(/^\[data-runtime-marker="([^"]+)"\]$/);
  return runtimeMarker ? element.dataset.runtimeMarker === runtimeMarker[1] : false;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(reason?: unknown): void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

interface RuntimeRequest {
  options: {
    host: FakeElement;
    editable: boolean;
    signal?: AbortSignal;
    onChange(markdown: string): void;
    onResize(contentHeight: number): void;
  };
  creation: Deferred<FakeMarkdownRuntime>;
}

const runtimeAdapter: SchematicNoteRuntimeAdapter = {
  create: (options) => runtimeModule.create(options) as Promise<SchematicNoteRuntime>
};

function createLayer(paper: FakeElement, options: SchematicNoteLayerOptions = {}) {
  return new SchematicNoteLayer(paper as unknown as HTMLElement, {
    ...options,
    runtimeAdapter
  });
}

class FakeMarkdownRuntime {
  readonly focus = vi.fn();
  readonly insertText = vi.fn(() => true);
  readonly setMarkdown = vi.fn();
  readonly setMode = vi.fn(async () => undefined);
  readonly destroy: ReturnType<typeof vi.fn>;
  isEditable: boolean;

  constructor(
    readonly id: string,
    readonly host: FakeElement,
    editable: boolean,
    destroyGate?: Deferred<void>
  ) {
    this.isEditable = editable;
    this.destroy = vi.fn(async () => {
      if (destroyGate) await destroyGate.promise;
      this.host.replaceChildren();
    });
  }

  setEditable = vi.fn((editable: boolean) => {
    this.isEditable = editable;
  });
}

function markdownNote(): SchematicNote {
  return {
    id: "note-1",
    x: 100,
    y: 120,
    width: 320,
    height: 80,
    format: "markdown",
    text: "pending **markdown**"
  };
}

function viewState(editingNoteId: string | null = null) {
  return {
    selectedIds: new Set<string>(),
    editingNoteId,
    zoom: 1,
    noteFontSizePx: () => 14,
    worldToScreenPoint: (point: { x: number; y: number }) => ({ ...point })
  };
}

function mountRuntime(request: RuntimeRequest, runtime: FakeMarkdownRuntime) {
  const marker = new FakeElement();
  marker.dataset.runtimeMarker = runtime.id;
  request.options.host.appendChild(marker);
  request.creation.resolve(runtime);
}

async function flushMicrotasks(iterations = 12) {
  for (let index = 0; index < iterations; index += 1) await Promise.resolve();
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  for (let index = 0; index < iterations; index += 1) await Promise.resolve();
}

describe("SchematicNoteLayer Markdown runtime lifecycle", () => {
  const requests: RuntimeRequest[] = [];

  beforeEach(() => {
    requests.length = 0;
    vi.stubGlobal("document", {
      createElement: (tagName: string) => new FakeElement(tagName)
    });
    runtimeModule.create.mockReset();
    runtimeModule.create.mockImplementation((options: RuntimeRequest["options"]) => {
      const creation = deferred<FakeMarkdownRuntime>();
      requests.push({ options, creation });
      return creation.promise;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not refocus or restore editability when Esc wins a pending mount", async () => {
    const paper = new FakeElement();
    const layer = createLayer(paper);
    const note = markdownNote();

    layer.render([note], viewState(note.id));
    await flushMicrotasks();
    expect(requests).toHaveLength(1);
    expect(requests[0].options.editable).toBe(true);

    layer.mountEditor(note);
    layer.focusEditor(note);
    layer.unmountEditor(note);

    const runtime = new FakeMarkdownRuntime("first", requests[0].options.host, true);
    mountRuntime(requests[0], runtime);
    await flushMicrotasks();

    expect(runtime.focus).not.toHaveBeenCalled();
    expect(runtime.setEditable).toHaveBeenLastCalledWith(false);
    expect(runtime.isEditable).toBe(false);
    expect(layer.getNoteElement(note.id)?.classList.contains("is-editing")).toBe(false);
  });

  it("buffers printable input until an editable Markdown runtime mounts", async () => {
    const paper = new FakeElement();
    const layer = createLayer(paper);
    const note = markdownNote();

    layer.render([note], viewState(note.id));
    await flushMicrotasks();
    expect(layer.insertEditorText(note, "c")).toBe(true);

    const runtime = new FakeMarkdownRuntime("first", requests[0].options.host, true);
    mountRuntime(requests[0], runtime);
    await flushMicrotasks();

    expect(runtime.focus).toHaveBeenCalled();
    expect(runtime.insertText).toHaveBeenCalledWith("c");
  });

  it("waits for an old runtime destroy before mounting the same id again", async () => {
    const paper = new FakeElement();
    const layer = createLayer(paper);
    const note = markdownNote();

    layer.render([note], viewState());
    await flushMicrotasks();
    const destroyGate = deferred<void>();
    const firstRuntime = new FakeMarkdownRuntime("first", requests[0].options.host, false, destroyGate);
    mountRuntime(requests[0], firstRuntime);
    await flushMicrotasks();

    note.format = "plain";
    layer.render([note], viewState());
    layer.render([note], viewState());
    await flushMicrotasks();
    expect(firstRuntime.destroy).toHaveBeenCalledTimes(1);

    note.format = "markdown";
    layer.render([note], viewState());
    await flushMicrotasks();
    expect(requests).toHaveLength(1);

    destroyGate.resolve();
    await flushMicrotasks();
    expect(requests).toHaveLength(2);

    const secondRuntime = new FakeMarkdownRuntime("second", requests[1].options.host, false);
    mountRuntime(requests[1], secondRuntime);
    await flushMicrotasks();

    const content = layer.getNoteElement(note.id)?.querySelector("[data-note-content]") as unknown as FakeElement | null;
    expect(content?.querySelector('[data-runtime-marker="second"]')).not.toBeNull();
    expect(firstRuntime.destroy).toHaveBeenCalledTimes(1);
    expect(secondRuntime.destroy).not.toHaveBeenCalled();
  });

  it("resets all note DOM and runtimes before another document reuses the same note id", async () => {
    const paper = new FakeElement();
    const layer = createLayer(paper);
    const firstNote = markdownNote();

    layer.render([firstNote], viewState());
    await flushMicrotasks();
    const firstRuntime = new FakeMarkdownRuntime("first-sheet", requests[0].options.host, false);
    mountRuntime(requests[0], firstRuntime);
    await flushMicrotasks();

    layer.reset();
    expect(layer.getNoteElement(firstNote.id)).toBeNull();

    const secondNote = { ...markdownNote(), text: "second sheet" };
    layer.render([secondNote], viewState());
    await flushMicrotasks();

    expect(firstRuntime.destroy).toHaveBeenCalledTimes(1);
    expect(requests).toHaveLength(2);
    const secondRuntime = new FakeMarkdownRuntime("second-sheet", requests[1].options.host, false);
    mountRuntime(requests[1], secondRuntime);
    await flushMicrotasks();

    expect(layer.getNoteElement(secondNote.id)).not.toBeNull();
    expect(secondRuntime.setMarkdown).toHaveBeenCalledWith("second sheet");
  });

  it("invalidates a pending create immediately when reset removes its document", async () => {
    const paper = new FakeElement();
    const onMarkdownChange = vi.fn();
    const onMarkdownResize = vi.fn();
    const layer = createLayer(paper, {
      onMarkdownChange,
      onMarkdownResize
    });
    const note = markdownNote();

    layer.render([note], viewState(note.id));
    await flushMicrotasks();
    expect(requests).toHaveLength(1);
    expect(requests[0].options.signal?.aborted).toBe(false);

    layer.reset();
    expect(requests[0].options.signal?.aborted).toBe(true);
    expect(layer.getNoteElement(note.id)).toBeNull();

    const staleRuntime = new FakeMarkdownRuntime("stale-after-reset", requests[0].options.host, true);
    mountRuntime(requests[0], staleRuntime);
    await flushMicrotasks();
    requests[0].options.onChange("stale");
    requests[0].options.onResize(999);

    expect(staleRuntime.destroy).toHaveBeenCalledTimes(1);
    expect(onMarkdownChange).not.toHaveBeenCalled();
    expect(onMarkdownResize).not.toHaveBeenCalled();
  });

  it("does not start a replacement runtime when reset wins before a pending destroy", async () => {
    const paper = new FakeElement();
    const layer = createLayer(paper);
    const note = markdownNote();

    layer.render([note], viewState());
    await flushMicrotasks();
    const destroyGate = deferred<void>();
    const runtime = new FakeMarkdownRuntime("old-document", requests[0].options.host, false, destroyGate);
    mountRuntime(requests[0], runtime);
    await flushMicrotasks();

    note.format = "plain";
    layer.render([note], viewState());
    note.format = "markdown";
    layer.render([note], viewState());
    layer.reset();

    destroyGate.resolve();
    await flushMicrotasks();

    expect(runtime.destroy).toHaveBeenCalledTimes(1);
    expect(requests).toHaveLength(1);
    expect(layer.getNoteElement(note.id)).toBeNull();
  });

  it("destroys a stale pending runtime exactly once across a rapid format cycle", async () => {
    const paper = new FakeElement();
    const onMarkdownChange = vi.fn();
    const onMarkdownResize = vi.fn();
    const layer = createLayer(paper, {
      onMarkdownChange,
      onMarkdownResize
    });
    const note = markdownNote();

    layer.render([note], viewState(note.id));
    await flushMicrotasks();
    expect(requests).toHaveLength(1);

    note.format = "plain";
    layer.render([note], viewState());
    layer.render([note], viewState());
    note.format = "markdown";
    layer.render([note], viewState());

    const staleRuntime = new FakeMarkdownRuntime("stale", requests[0].options.host, true);
    mountRuntime(requests[0], staleRuntime);
    await flushMicrotasks();
    requests[0].options.onChange("stale");
    requests[0].options.onResize(999);

    expect(staleRuntime.destroy).toHaveBeenCalledTimes(1);
    expect(onMarkdownChange).not.toHaveBeenCalled();
    expect(onMarkdownResize).not.toHaveBeenCalled();
    expect(requests).toHaveLength(2);

    const currentRuntime = new FakeMarkdownRuntime("current", requests[1].options.host, false);
    mountRuntime(requests[1], currentRuntime);
    await flushMicrotasks();
    expect(currentRuntime.destroy).not.toHaveBeenCalled();

    note.format = "plain";
    layer.render([note], viewState());
    layer.render([note], viewState());
    await flushMicrotasks();
    expect(currentRuntime.destroy).toHaveBeenCalledTimes(1);
  });

  it("keeps visible Markdown source after a mount failure and clears the error after retry", async () => {
    const paper = new FakeElement();
    const layer = createLayer(paper);
    const note = markdownNote();

    layer.render([note], viewState());
    await flushMicrotasks();
    requests[0].creation.reject(new Error("mount failed"));
    await flushMicrotasks();

    const element = layer.getNoteElement(note.id) as unknown as FakeElement | null;
    const content = element?.querySelector("[data-note-content]") as FakeElement | null;
    expect(element?.classList.contains("has-markdown-runtime-error")).toBe(true);
    expect(content?.textContent).toBe(note.text);

    layer.render([note], viewState());
    await flushMicrotasks();
    expect(requests).toHaveLength(2);

    const runtime = new FakeMarkdownRuntime("retry", requests[1].options.host, false);
    mountRuntime(requests[1], runtime);
    await flushMicrotasks();

    expect(element?.classList.contains("has-markdown-runtime-error")).toBe(false);
    expect(content?.querySelector('[data-runtime-marker="retry"]')).not.toBeNull();
  });

  it("isolates identical note ids and Markdown callbacks across document layers", async () => {
    const paper = new FakeElement();
    const onMarkdownChange = vi.fn();
    const layer = createLayer(paper, {
      onMarkdownChange
    });
    const firstNote = markdownNote();

    layer.activateDocument("document-a");
    layer.render([firstNote], viewState(firstNote.id));
    await flushMicrotasks();
    const firstRuntime = new FakeMarkdownRuntime("document-a", requests[0].options.host, true);
    mountRuntime(requests[0], firstRuntime);
    await flushMicrotasks();
    const firstElement = layer.getNoteElement(firstNote.id) as unknown as FakeElement;
    const firstDocumentLayer = firstElement.parentElement;

    layer.activateDocument("document-b");
    const secondNote = { ...markdownNote(), text: "second document" };
    layer.render([secondNote], viewState(secondNote.id));
    await flushMicrotasks();
    const secondRuntime = new FakeMarkdownRuntime("document-b", requests[1].options.host, true);
    mountRuntime(requests[1], secondRuntime);
    await flushMicrotasks();
    const secondElement = layer.getNoteElement(secondNote.id) as unknown as FakeElement;

    expect(requests).toHaveLength(2);
    expect(secondElement).not.toBe(firstElement);
    expect(firstDocumentLayer?.hidden).toBe(true);
    expect(firstRuntime.setEditable).toHaveBeenLastCalledWith(false);
    expect(firstRuntime.destroy).not.toHaveBeenCalled();

    requests[0].options.onChange("stale document change");
    requests[1].options.onChange("current document change");
    expect(onMarkdownChange).toHaveBeenCalledTimes(1);
    expect(onMarkdownChange).toHaveBeenCalledWith(secondNote.id, "current document change");

    layer.activateDocument("document-a");
    expect(layer.getNoteElement(firstNote.id)).toBe(firstElement);
    expect(requests).toHaveLength(2);
    expect(firstRuntime.destroy).not.toHaveBeenCalled();
    expect(secondRuntime.setEditable).toHaveBeenLastCalledWith(false);

    layer.discardDocument("document-b");
    await flushMicrotasks();
    expect(secondRuntime.destroy).toHaveBeenCalledTimes(1);
    expect(firstRuntime.destroy).not.toHaveBeenCalled();
  });

  it("reuses a retained layer after the active blank replacement is discarded", async () => {
    const paper = new FakeElement();
    const layer = createLayer(paper);
    const note = markdownNote();

    layer.activateDocument("retained");
    layer.render([note], viewState());
    await flushMicrotasks();
    const runtime = new FakeMarkdownRuntime("retained", requests[0].options.host, false);
    mountRuntime(requests[0], runtime);
    await flushMicrotasks();
    const retainedElement = layer.getNoteElement(note.id);

    layer.activateDocument("blank-replacement");
    expect(layer.getNoteElement(note.id)).toBeNull();
    layer.discardDocument("blank-replacement");
    layer.activateDocument("retained");

    expect(layer.getNoteElement(note.id)).toBe(retainedElement);
    expect(requests).toHaveLength(1);
    expect(runtime.destroy).not.toHaveBeenCalled();
  });
});

describe("SchematicNoteLayer portable raw-text runtime", () => {
  beforeEach(() => {
    vi.stubGlobal("document", {
      defaultView: {
        getComputedStyle: () => ({ whiteSpace: "pre-wrap" })
      },
      createElement: (tagName: string) => new FakeElement(tagName)
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("displays and edits Markdown as lossless raw text without a Web runtime", async () => {
    const paper = new FakeElement();
    const onMarkdownChange = vi.fn();
    const layer = new SchematicNoteLayer(paper as unknown as HTMLElement, { onMarkdownChange });
    const note = markdownNote();
    note.text = "line 1\n**line 2**";

    layer.render([note], viewState(note.id));
    await flushMicrotasks();

    const element = layer.getNoteElement(note.id) as unknown as FakeElement;
    const content = element.querySelector("[data-note-content]") as FakeElement;
    const textarea = content.querySelector("[data-note-editor]") as FakeElement;
    expect(textarea.value).toBe(note.text);
    expect(content.classList.contains("schematic-note-raw-markdown-content")).toBe(true);
    expect(content.style.whiteSpace).toBe("");

    layer.focusEditor(note);
    expect(layer.insertEditorText(note, "!")).toBe(true);
    expect(layer.readEditor(note).text).toBe(`${note.text}!`);
    expect(onMarkdownChange).toHaveBeenLastCalledWith(note.id, `${note.text}!`);

    note.text = layer.readEditor(note).text;
    layer.unmountEditor(note);
    expect(content.textContent).toBe(note.text);

    const exported = await layer.waitForRenderedNoteExport(note);
    expect((exported.content as unknown as FakeElement).textContent).toBe(note.text);
    expect((exported.content as unknown as FakeElement).style.whiteSpace).toBe("pre-wrap");
    expect(exported.text).toBe(note.text);

    await layer.destroy();
    expect(paper.children).toHaveLength(0);
  });
});
