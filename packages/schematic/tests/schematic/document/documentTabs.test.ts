import { describe, expect, it } from "vitest";
import { SchematicDocumentTabs } from "../../../src/schematic/schematicDocumentTabs";

class FakeClassList {
  private readonly names = new Set<string>();

  contains(name: string) {
    return this.names.has(name);
  }

  toggle(name: string, force?: boolean) {
    const enabled = force ?? !this.names.has(name);
    if (enabled) this.names.add(name);
    else this.names.delete(name);
    return enabled;
  }
}

class FakeDocument {
  readonly defaultView = {
    requestAnimationFrame(callback: () => void) {
      callback();
      return 1;
    }
  };

  createElement(tagName: string) {
    return new FakeElement(tagName, this);
  }
}

class FakeElement {
  className = "";
  hidden = false;
  checked = false;
  open = false;
  textContent: string | null = null;
  title = "";
  type = "";
  value = "";
  tabIndex = 0;
  clickCount = 0;
  focusCount = 0;
  selectCount = 0;
  draggable = false;
  rect = { left: 0, width: 100 };
  capturedPointerId: number | null = null;
  files: { item(index: number): File | null } | null = null;
  readonly dataset: Record<string, string> = {};
  readonly classList = new FakeClassList();
  readonly children: FakeElement[] = [];
  parent: FakeElement | null = null;
  private readonly attributes = new Map<string, string>();
  private readonly listeners = new Map<string, Array<(event: FakeEvent) => void>>();

  constructor(
    readonly tagName: string,
    readonly ownerDocument: FakeDocument
  ) {}

  append(...children: FakeElement[]) {
    children.forEach((child) => this.appendChild(child));
  }

  appendChild(child: FakeElement) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children: FakeElement[]) {
    this.children.forEach((child) => {
      child.parent = null;
    });
    this.children.length = 0;
    this.append(...children);
  }

  replaceWith(replacement: FakeElement) {
    if (!this.parent) return;
    const index = this.parent.children.indexOf(this);
    if (index < 0) return;
    this.parent.children[index] = replacement;
    replacement.parent = this.parent;
    this.parent = null;
  }

  showModal() { this.open = true; }

  close() { this.open = false; }

  get lastElementChild() {
    return this.children[this.children.length - 1] ?? null;
  }

  contains(candidate: FakeElement): boolean {
    return candidate === this || this.children.some((child) => child.contains(candidate));
  }

  getBoundingClientRect() {
    return { ...this.rect, right: this.rect.left + this.rect.width, top: 0, bottom: 29, height: 29, x: this.rect.left, y: 0, toJSON() {} };
  }

  setPointerCapture(pointerId: number) {
    this.capturedPointerId = pointerId;
  }

  releasePointerCapture(pointerId: number) {
    if (this.capturedPointerId === pointerId) this.capturedPointerId = null;
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }

  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type: string, listener: (event: FakeEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  dispatchEvent(event: FakeEvent) {
    (this.listeners.get(event.type) ?? []).forEach((listener) => listener(event));
  }

  click() {
    this.clickCount += 1;
  }

  focus() {
    this.focusCount += 1;
  }

  select() {
    this.selectCount += 1;
  }

  closest(selector: string): FakeElement | null {
    if (this.matches(selector)) return this;
    return this.parent?.closest(selector) ?? null;
  }

  querySelector<T = FakeElement>(selector: string): T | null {
    return this.querySelectorAll<T>(selector)[0] ?? null;
  }

  querySelectorAll<T = FakeElement>(selector: string): T[] {
    const matches: FakeElement[] = [];
    const visit = (element: FakeElement) => {
      if (element.matches(selector)) matches.push(element);
      element.children.forEach(visit);
    };
    this.children.forEach(visit);
    return matches as T[];
  }

  private matches(selector: string) {
    const match = selector.match(/^\[data-([a-z0-9-]+)(?:="([^"]*)")?\]$/);
    if (!match) return false;
    const key = match[1].replace(/-([a-z])/g, (_part, letter: string) => letter.toUpperCase());
    const value = this.dataset[key];
    return value !== undefined && (match[2] === undefined || value === match[2]);
  }
}

class FakeEvent {
  defaultPrevented = false;
  propagationStopped = false;
  readonly key: string;
  readonly button: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly pointerId: number;

  constructor(
    readonly type: string,
    readonly target: FakeElement,
    options: { key?: string; button?: number; clientX?: number; clientY?: number; pointerId?: number } = {}
  ) {
    this.key = options.key ?? "";
    this.button = options.button ?? 0;
    this.clientX = options.clientX ?? 0;
    this.clientY = options.clientY ?? 10;
    this.pointerId = options.pointerId ?? 1;
  }

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {
    this.propagationStopped = true;
  }
}

function appendHook(parent: FakeElement, datasetKey: string) {
  const element = parent.ownerDocument.createElement("div");
  element.dataset[datasetKey] = "";
  return parent.appendChild(element);
}

function createFixture() {
  const document = new FakeDocument();
  const root = document.createElement("div");
  const list = appendHook(root, "schematicDocumentTabList");
  const create = appendHook(root, "schematicDocumentNew");
  const importButton = appendHook(root, "schematicDocumentImport");
  const pasteButton = appendHook(root, "schematicDocumentPaste");
  const exportButton = appendHook(root, "schematicDocumentExport");
  const exportDialog = appendHook(root, "schematicDocumentExportDialog");
  const exportHidden = appendHook(exportDialog, "schematicExportHidden");
  const exportSvg = appendHook(exportDialog, "schematicExportFormat");
  exportSvg.dataset.schematicExportFormat = "svg";
  const exportJson = appendHook(exportDialog, "schematicExportFormat");
  exportJson.dataset.schematicExportFormat = "json";
  const importInput = appendHook(root, "schematicDocumentImportInput");
  const closeSnackbar = appendHook(root, "schematicCloseSnackbar");
  const closeMessage = appendHook(closeSnackbar, "schematicCloseMessage");
  const closeUndo = appendHook(closeSnackbar, "schematicCloseUndo");
  const storageError = appendHook(root, "schematicStorageError");
  const storageMessage = appendHook(storageError, "schematicStorageErrorMessage");
  const storageDismiss = appendHook(storageError, "schematicStorageErrorDismiss");
  closeSnackbar.hidden = true;
  storageError.hidden = true;

  return {
    root,
    list,
    create,
    importButton,
    pasteButton,
    exportButton,
    exportDialog,
    exportHidden,
    exportSvg,
    exportJson,
    importInput,
    closeSnackbar,
    closeMessage,
    closeUndo,
    storageError,
    storageMessage,
    storageDismiss
  };
}

function dispatch(
  root: FakeElement,
  type: string,
  target: FakeElement,
  options: { key?: string; button?: number; clientX?: number; clientY?: number; pointerId?: number } = {}
) {
  const event = new FakeEvent(type, target, options);
  root.dispatchEvent(event);
  return event;
}

describe("SchematicDocumentTabs", () => {
  it("renders accessible tabs and preserves activate, close, and create commands", () => {
    const fixture = createFixture();
    const activated: string[] = [];
    const closed: string[] = [];
    let created = 0;
    const controller = new SchematicDocumentTabs(fixture.root as unknown as HTMLElement, {
      onActivate: (id) => activated.push(id),
      onClose: (id) => closed.push(id),
      onCreate: () => {
        created += 1;
      }
    });

    controller.bind();
    controller.bind();
    controller.render(
      [
        { id: "first", title: "First" },
        { id: "second", title: "Second" }
      ],
      "second"
    );

    const labels = fixture.root.querySelectorAll("[data-schematic-document-tab]");
    const closes = fixture.root.querySelectorAll("[data-schematic-document-close]");
    expect(labels).toHaveLength(2);
    expect(labels[0].getAttribute("role")).toBe("tab");
    expect(labels[0].getAttribute("aria-selected")).toBe("false");
    expect(labels[0].tabIndex).toBe(-1);
    expect(labels[1].getAttribute("aria-selected")).toBe("true");
    expect(labels[1].tabIndex).toBe(0);
    expect(closes[1].getAttribute("aria-label")).toBe("Close Second");

    controller.render(
      [
        { id: "first", title: "First" },
        { id: "second", title: "Second" }
      ],
      "first"
    );
    expect(fixture.root.querySelectorAll("[data-schematic-document-tab]")[0]).toBe(labels[0]);
    expect(labels[0].getAttribute("aria-selected")).toBe("true");

    dispatch(fixture.root, "click", labels[0]);
    dispatch(fixture.root, "click", closes[1]);
    dispatch(fixture.root, "click", fixture.create);

    expect(activated).toEqual(["first"]);
    expect(closed).toEqual(["second"]);
    expect(created).toBe(1);
  });

  it("renames inline on Enter and blur, while Escape restores the original title", () => {
    const fixture = createFixture();
    const renamed: Array<[string, string]> = [];
    const controller = new SchematicDocumentTabs(fixture.root as unknown as HTMLElement, {
      onActivate: () => {},
      onClose: () => {},
      onCreate: () => {},
      onRename: (id, title) => renamed.push([id, title])
    });
    controller.bind();

    controller.render([{ id: "doc", title: "Original" }], "doc");
    dispatch(fixture.root, "dblclick", fixture.root.querySelector("[data-schematic-document-tab]")!);
    const enterInput = fixture.root.querySelector("[data-schematic-document-rename]")!;
    expect(enterInput.value).toBe("Original");
    expect(enterInput.getAttribute("maxlength")).toBe("80");
    expect(enterInput.focusCount).toBe(1);
    expect(enterInput.selectCount).toBe(1);
    enterInput.value = "  Renamed  ";
    const enterEvent = dispatch(fixture.root, "keydown", enterInput, { key: "Enter" });
    expect(enterEvent.defaultPrevented).toBe(true);
    expect(renamed).toEqual([["doc", "Renamed"]]);
    expect(fixture.root.querySelector("[data-schematic-document-tab]")?.textContent).toBe("Renamed");

    controller.render([{ id: "doc", title: "Renamed" }], "doc");
    dispatch(fixture.root, "dblclick", fixture.root.querySelector("[data-schematic-document-tab]")!);
    const blurInput = fixture.root.querySelector("[data-schematic-document-rename]")!;
    blurInput.value = "Blurred";
    dispatch(fixture.root, "focusout", blurInput);
    expect(renamed).toEqual([
      ["doc", "Renamed"],
      ["doc", "Blurred"]
    ]);

    controller.render([{ id: "doc", title: "Blurred" }], "doc");
    dispatch(fixture.root, "dblclick", fixture.root.querySelector("[data-schematic-document-tab]")!);
    const escapeInput = fixture.root.querySelector("[data-schematic-document-rename]")!;
    escapeInput.value = "Discarded";
    const escapeEvent = dispatch(fixture.root, "keydown", escapeInput, { key: "Escape" });
    dispatch(fixture.root, "focusout", escapeInput);
    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(renamed).toHaveLength(2);
    expect(fixture.root.querySelector("[data-schematic-document-tab]")?.textContent).toBe("Blurred");
  });

  it("closes a middle-clicked tab without activating it", () => {
    const fixture = createFixture();
    const activated: string[] = [];
    const closed: string[] = [];
    const controller = new SchematicDocumentTabs(fixture.root as unknown as HTMLElement, {
      onActivate: (id) => activated.push(id),
      onClose: (id) => closed.push(id),
      onCreate: () => {}
    });
    controller.bind();
    controller.render([{ id: "doc", title: "Document" }], "doc");

    const label = fixture.root.querySelector("[data-schematic-document-tab]")!;
    const leftPointerEvent = dispatch(
      fixture.root,
      "pointerdown",
      label,
      { button: 0 }
    );
    expect(closed).toEqual([]);
    expect(leftPointerEvent.defaultPrevented).toBe(false);

    const pointerEvent = dispatch(
      fixture.root,
      "pointerdown",
      label,
      { button: 1 }
    );
    const auxEvent = dispatch(fixture.root, "auxclick", label, { button: 1 });

    expect(closed).toEqual(["doc"]);
    expect(activated).toEqual([]);
    expect(pointerEvent.defaultPrevented).toBe(true);
    expect(pointerEvent.propagationStopped).toBe(true);
    expect(auxEvent.defaultPrevented).toBe(true);
    expect(auxEvent.propagationStopped).toBe(true);
  });

  it("reorders tabs by dropping on either side of another tab", () => {
    const fixture = createFixture();
    const reordered: Array<[string, number]> = [];
    const activated: string[] = [];
    const controller = new SchematicDocumentTabs(fixture.root as unknown as HTMLElement, {
      onActivate: (id) => activated.push(id),
      onClose: () => {},
      onCreate: () => {},
      onReorder: (id, insertionIndex) => reordered.push([id, insertionIndex])
    });
    controller.bind();
    controller.render([
      { id: "first", title: "First" },
      { id: "second", title: "Second" },
      { id: "third", title: "Third" }
    ], "first");

    const wrappers = fixture.root.querySelectorAll("[data-schematic-document-tab-item]");
    const labels = fixture.root.querySelectorAll("[data-schematic-document-tab]");
    wrappers[2].rect = { left: 200, width: 100 };
    fixture.list.rect = { left: 0, width: 300 };

    dispatch(fixture.root, "pointerdown", labels[0], { button: 0, clientX: 50, pointerId: 7 });
    const pointerMove = dispatch(fixture.root, "pointermove", labels[0], { clientX: 275, pointerId: 7 });
    expect(pointerMove.defaultPrevented).toBe(true);
    expect(wrappers[2].classList.contains("is-drop-after")).toBe(true);

    dispatch(fixture.root, "pointerup", labels[0], { clientX: 275, pointerId: 7 });
    expect(reordered).toEqual([["first", 3]]);
    expect(wrappers[0].classList.contains("is-dragging")).toBe(false);
    expect(wrappers[2].classList.contains("is-drop-after")).toBe(false);
    dispatch(fixture.root, "click", labels[0]);
    expect(activated).toEqual([]);
  });

  it("keeps auxclick as a middle-close fallback", () => {
    const fixture = createFixture();
    const closed: string[] = [];
    const controller = new SchematicDocumentTabs(fixture.root as unknown as HTMLElement, {
      onActivate: () => {},
      onClose: (id) => closed.push(id),
      onCreate: () => {}
    });
    controller.bind();
    controller.render([{ id: "doc", title: "Document" }], "doc");

    dispatch(
      fixture.root,
      "auxclick",
      fixture.root.querySelector("[data-schematic-document-tab]")!,
      { button: 1 }
    );

    expect(closed).toEqual(["doc"]);
  });

  it("routes file import, clipboard import, and export through dedicated controls", () => {
    const fixture = createFixture();
    const imported: File[] = [];
    let pasted = 0;
    const exports: Array<[string, boolean]> = [];
    const controller = new SchematicDocumentTabs(fixture.root as unknown as HTMLElement, {
      onActivate: () => {},
      onClose: () => {},
      onCreate: () => {},
      onImport: (file) => { imported.push(file); },
      onImportFromClipboard: () => {
        pasted += 1;
      },
      onExport: (format, includeHidden) => { exports.push([format, includeHidden]); }
    });
    controller.bind();

    fixture.importInput.value = "old.json";
    dispatch(fixture.root, "click", fixture.importButton);
    expect(fixture.importInput.clickCount).toBe(1);
    expect(fixture.importInput.value).toBe("");

    const file = { name: "schematic.json" } as File;
    fixture.importInput.files = { item: (index) => (index === 0 ? file : null) };
    fixture.importInput.value = "schematic.json";
    dispatch(fixture.root, "change", fixture.importInput);
    dispatch(fixture.root, "click", fixture.pasteButton);
    dispatch(fixture.root, "click", fixture.exportButton);

    expect(imported).toEqual([file]);
    expect(fixture.importInput.value).toBe("");
    expect(pasted).toBe(1);
    expect(fixture.exportDialog.open).toBe(true);
    expect(fixture.exportHidden.checked).toBe(false);
    fixture.exportHidden.checked = true;
    dispatch(fixture.root, "click", fixture.exportSvg);
    expect(fixture.exportDialog.open).toBe(false);

    dispatch(fixture.root, "click", fixture.exportButton);
    expect(fixture.exportHidden.checked).toBe(false);
    fixture.exportHidden.checked = true;
    dispatch(fixture.root, "click", fixture.exportJson);
    expect(exports).toEqual([["svg", true], ["json", false]]);

    dispatch(fixture.root, "click", fixture.exportButton);
    dispatch(fixture.root, "keydown", fixture.exportHidden, { key: "Escape" });
    expect(fixture.exportDialog.open).toBe(false);
  });

  it("keeps close Undo and storage errors independent", () => {
    const fixture = createFixture();
    let undoCount = 0;
    const controller = new SchematicDocumentTabs(fixture.root as unknown as HTMLElement, {
      onActivate: () => {},
      onClose: () => {},
      onCreate: () => {}
    });
    controller.bind();

    controller.showCloseSnackbar({
      message: "Closed Filter",
      onUndo: () => {
        undoCount += 1;
      },
      timeoutMs: 0
    });
    controller.showStorageError("Workspace storage is unavailable.");

    expect(fixture.closeSnackbar.hidden).toBe(false);
    expect(fixture.closeMessage.textContent).toBe("Closed Filter");
    expect(fixture.storageError.hidden).toBe(false);
    expect(fixture.storageMessage.textContent).toBe("Workspace storage is unavailable.");

    dispatch(fixture.root, "click", fixture.storageDismiss);
    expect(fixture.storageError.hidden).toBe(true);
    expect(fixture.closeSnackbar.hidden).toBe(false);
    expect(undoCount).toBe(0);

    controller.showStorageError("Still unavailable.");
    dispatch(fixture.root, "click", fixture.closeUndo);
    expect(fixture.closeSnackbar.hidden).toBe(true);
    expect(fixture.storageError.hidden).toBe(false);
    expect(undoCount).toBe(1);

    controller.hideCloseSnackbar();
    controller.clearStorageError();
    expect(fixture.closeMessage.textContent).toBe("");
    expect(fixture.storageMessage.textContent).toBe("");
  });
});
