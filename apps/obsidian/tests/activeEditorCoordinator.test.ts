import { obsidianMockState, resetObsidianMockState } from "./obsidianMock";
import { history } from "@codemirror/commands";
import { EditorState, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type {
  CreateSchematicEditorOptions,
  SchematicEditorHandle
} from "@edahelper/schematic/editor";
import {
  createEmptySchematicContent,
  serializeSchematicContent
} from "@edahelper/schematic/core";
import { SchematicActiveEditorCoordinator } from "../src/activeEditorCoordinator";
import { SchematicBlockWidget } from "../src/blockWidget";
import { SCHEMATIC_HEIGHT_LIMIT_PROPERTY } from "../src/blockSizing";
import { parseSchematicFence } from "../src/fence";
import {
  createSchematicSessionField,
  type SchematicFencedCodeRange,
  type SchematicBlockSession
} from "../src/sessionField";

function session(id: string): SchematicBlockSession {
  const source = `\`\`\`json\n${serializeSchematicContent(createEmptySchematicContent())}\`\`\``;
  const projection = parseSchematicFence(source);
  if (!projection) throw new Error("Missing schematic projection.");
  return { id, from: 0, to: source.length, revision: 0, projection };
}

function schematicFenceWithNote(text: string) {
  const content = createEmptySchematicContent();
  content.notes.push({
    id: "note",
    x: 0,
    y: 0,
    width: 120,
    height: 40,
    anchor: "upperLeft",
    text
  });
  return `\`\`\`json\n${serializeSchematicContent(content)}\`\`\``;
}

function testFencedCodeRanges(state: EditorState): SchematicFencedCodeRange[] {
  const source = state.doc.toString();
  const ranges: SchematicFencedCodeRange[] = [];
  for (const match of source.matchAll(/```json[^\r\n]*(?:\r?\n)[\s\S]*?```(?:\r?\n|$)/g)) {
    ranges.push({ from: match.index, to: match.index + match[0].length });
  }
  return ranges;
}

function fakeEditorFactory(log: string[], captures: CreateSchematicEditorOptions[]) {
  return (options: CreateSchematicEditorOptions) => {
    captures.push(options);
    const canvas = options.root.ownerDocument.createElement("div");
    canvas.tabIndex = 0;
    options.root.replaceChildren(canvas);
    const handle = {
      init() {},
      destroy() { log.push("destroy"); return Promise.resolve(); },
      getState: () => ({ content: options.content, view: { zoom: 1, translate: { x: 0, y: 0 }, presentationMode: false }, canUndo: false, canRedo: false, status: "", origin: "test", reason: "test", revision: 0 }),
      getContent: () => options.content,
      replaceContent() { log.push("replace"); },
      transact() {},
      execute(command: { kind: string }) { log.push(`execute:${command.kind}`); return true; },
      run() {},
      flushTransientEdits(reason?: string) { log.push(`flush:${reason}`); },
      fit() { log.push("fit"); },
      focus() { log.push("focus"); },
      hasExportableSelection: () => false,
      getSelectionExportInput: () => Promise.resolve({} as never),
      getSelectionContent: () => null,
      subscribe: () => () => {}
    };
    return handle as unknown as SchematicEditorHandle;
  };
}

function dispatchKey(target: HTMLElement, key: string) {
  const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
  let stopPropagationCalls = 0;
  let stopImmediatePropagationCalls = 0;
  const stopPropagation = event.stopPropagation.bind(event);
  const stopImmediatePropagation = event.stopImmediatePropagation.bind(event);
  Object.defineProperties(event, {
    stopPropagation: {
      value: () => {
        stopPropagationCalls += 1;
        stopPropagation();
      }
    },
    stopImmediatePropagation: {
      value: () => {
        stopImmediatePropagationCalls += 1;
        stopImmediatePropagation();
      }
    }
  });
  target.dispatchEvent(event);
  return {
    defaultPrevented: event.defaultPrevented,
    stopPropagationCalls,
    stopImmediatePropagationCalls
  };
}

describe("active editor coordinator", () => {
  beforeAll(() => {
    globalThis.ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  it("uses the first click only for activation and owns one editor per Window", () => {
    const log: string[] = [];
    const captures: CreateSchematicEditorOptions[] = [];
    const ownerWindow = window as Window & typeof globalThis;
    const coordinator = new SchematicActiveEditorCoordinator(ownerWindow, {
      createEditor: fakeEditorFactory(log, captures)
    });
    const first = document.createElement("div");
    const second = document.createElement("div");
    document.body.append(first, second);
    const view = { dispatch() {} } as never;
    coordinator.mountWidget(first, session("first"), view);
    coordinator.mountWidget(second, session("second"), view);

    expect(first.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }))).toBe(false);
    expect(captures).toHaveLength(1);
    expect(coordinator.activeRoot()).toBe(first);

    first.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(captures).toHaveLength(1);

    second.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(captures).toHaveLength(2);
    expect(coordinator.activeRoot()).toBe(second);
    expect(log.indexOf("flush:activate-other-block")).toBeLessThan(log.indexOf("destroy"));
    coordinator.destroy();
    first.remove();
    second.remove();
  });

  it("keeps widget pointer and form events out of the CM document editor", () => {
    const coordinator = new SchematicActiveEditorCoordinator(window as Window & typeof globalThis, {
      createEditor: fakeEditorFactory([], [])
    });
    const widget = new SchematicBlockWidget(session("event-ownership"), () => coordinator);

    expect(widget.ignoreEvent()).toBe(true);
    coordinator.destroy();
  });

  it("refits after a committed height change, but not for zoom or a cap above the original height", async () => {
    const log: string[] = [];
    const captures: CreateSchematicEditorOptions[] = [];
    const coordinator = new SchematicActiveEditorCoordinator(window as Window & typeof globalThis, {
      createEditor: fakeEditorFactory(log, captures)
    });
    const root = document.createElement("div");
    // jsdom has no layout; emulate the CSS minimum of the original height and the cap.
    Object.defineProperty(root, "clientHeight", { get: () => Math.min(600, Number.parseFloat(root.style.getPropertyValue(SCHEMATIC_HEIGHT_LIMIT_PROPERTY)) || 600) });
    document.body.append(root);
    const initial = session("height-change");
    const view = { dispatch() {} } as never;
    coordinator.mountWidget(root, initial, view);
    root.click();
    log.length = 0;
    try {
      const content = createEmptySchematicContent();
      content.notes.push({ id: "small", x: 0, y: 0, width: 40, height: 20, anchor: "upperLeft", text: "R1" });
      captures[0].host.commit(content, { origin: "editor", reason: "edit", revision: 1 });
      expect(root.clientHeight).toBeLessThan(600);
      expect(log).not.toContain("fit");
      await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
      expect(log.filter(entry => entry === "fit")).toHaveLength(1);
      captures[0].host.onViewChange({ zoom: 10, translate: { x: 40, y: 90 }, presentationMode: false });
      expect(log.filter(entry => entry === "fit")).toHaveLength(1);

      content.notes.push({ ...content.notes[0], id: "lower", y: 1000 });
      const projection = parseSchematicFence(`\`\`\`json\n${serializeSchematicContent(content)}\`\`\``)!;
      coordinator.updateWidget(root, { ...initial, revision: 2, projection }, view);
      await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
      expect(root.clientHeight).toBe(600);
      expect(log.filter(entry => entry === "fit")).toHaveLength(2);

      content.notes[1].y = 2000;
      captures[0].host.commit(content, { origin: "editor", reason: "edit", revision: 3 });
      await new Promise<void>(resolve => window.requestAnimationFrame(() => resolve()));
      expect(root.clientHeight).toBe(600);
      expect(log.filter(entry => entry === "fit")).toHaveLength(2);
    } finally {
      coordinator.destroy();
      root.remove();
    }
  });

  it("closes the property drawer and restores active-root keyboard focus when the paper is pressed", () => {
    const coordinator = new SchematicActiveEditorCoordinator(window as Window & typeof globalThis, {
      createEditor: fakeEditorFactory([], [])
    });
    const root = document.createElement("div");
    root.tabIndex = 0;
    const input = document.createElement("input");
    const canvas = document.createElement("div");
    canvas.dataset.schematicPaper = "";
    document.body.append(root);
    coordinator.mountWidget(root, session("focus-canvas"), { dispatch() {} } as never);
    root.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    root.append(input, canvas);

    input.focus();
    expect(document.activeElement).toBe(input);
    root.classList.add("is-property-open");
    input.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(root.classList.contains("is-property-open")).toBe(true);
    const noteEditor = document.createElement("textarea");
    canvas.append(noteEditor);
    root.classList.add("is-property-open");
    noteEditor.focus();
    noteEditor.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(root.classList.contains("is-property-open")).toBe(false);
    expect(document.activeElement).toBe(noteEditor);
    root.classList.add("is-property-open");
    canvas.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));

    expect(document.activeElement).toBe(root);
    expect(root.classList.contains("is-property-open")).toBe(false);
    coordinator.destroy();
    root.remove();
  });

  it("installs no schematic shortcut handler without an active block or outside its root", () => {
    const log: string[] = [];
    const captures: CreateSchematicEditorOptions[] = [];
    const coordinator = new SchematicActiveEditorCoordinator(window as Window & typeof globalThis, {
      createEditor: fakeEditorFactory(log, captures)
    });
    const root = document.createElement("div");
    const outside = document.createElement("div");
    document.body.append(root, outside);
    coordinator.mountWidget(root, session("keyboard"), { dispatch() {} } as never);

    const inactiveQ = new KeyboardEvent("keydown", { key: "q", bubbles: true, cancelable: true });
    outside.dispatchEvent(inactiveQ);
    expect(inactiveQ.defaultPrevented).toBe(false);
    expect(dispatchKey(outside, "/")).toEqual({
      defaultPrevented: false,
      stopPropagationCalls: 0,
      stopImmediatePropagationCalls: 0
    });

    root.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    const activeChild = root.firstElementChild as HTMLElement;
    expect(captures[0].host.ownsKeyboardTarget?.(activeChild)).toBe(true);
    expect(captures[0].host.ownsKeyboardTarget?.(outside)).toBe(false);
    expect(captures[0].host.ownsKeyboardTarget?.(document.body)).toBe(false);
    const outsideQ = new KeyboardEvent("keydown", { key: "q", bubbles: true, cancelable: true });
    outside.dispatchEvent(outsideQ);
    expect(outsideQ.defaultPrevented).toBe(false);
    expect(dispatchKey(outside, "/")).toEqual({
      defaultPrevented: false,
      stopPropagationCalls: 0,
      stopImmediatePropagationCalls: 0
    });
    expect(dispatchKey(activeChild, "/")).toEqual({
      defaultPrevented: false,
      stopPropagationCalls: 0,
      stopImmediatePropagationCalls: 0
    });

    const activeQ = new KeyboardEvent("keydown", { key: "q", bubbles: true, cancelable: true });
    root.dispatchEvent(activeQ);
    expect(activeQ.defaultPrevented).toBe(true);
    expect(root.classList.contains("is-property-open")).toBe(true);

    coordinator.freeze("test-freeze");
    expect(captures[0].host.ownsKeyboardTarget?.(activeChild)).toBe(false);
    const afterFreezeQ = new KeyboardEvent("keydown", { key: "q", bubbles: true, cancelable: true });
    root.dispatchEvent(afterFreezeQ);
    expect(afterFreezeQ.defaultPrevented).toBe(false);
    expect(dispatchKey(root, "/")).toEqual({
      defaultPrevented: false,
      stopPropagationCalls: 0,
      stopImmediatePropagationCalls: 0
    });
    root.remove();
    outside.remove();
  });

  it("owns shortcuts inside a block nested by the CM contenteditable host", () => {
    const coordinator = new SchematicActiveEditorCoordinator(window as Window & typeof globalThis, {
      createEditor: fakeEditorFactory([], [])
    });
    const cmContent = document.createElement("div");
    cmContent.contentEditable = "true";
    const root = document.createElement("div");
    cmContent.append(root);
    document.body.append(cmContent);
    coordinator.mountWidget(root, session("nested-contenteditable"), { dispatch() {} } as never);
    root.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));

    const canvas = root.firstElementChild as HTMLElement;
    const event = dispatchKey(canvas, "q");

    expect(event.defaultPrevented).toBe(true);
    expect(root.classList.contains("is-property-open")).toBe(true);
    coordinator.destroy();
    cmContent.remove();
  });

  it("closes host drawers before editable controls consume Escape", () => {
    const log: string[] = [];
    const coordinator = new SchematicActiveEditorCoordinator(window as Window & typeof globalThis, {
      createEditor: fakeEditorFactory(log, [])
    });
    const root = document.createElement("div");
    document.body.append(root);
    coordinator.mountWidget(root, session("escape-priority"), { dispatch() {} } as never);
    root.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    const input = document.createElement("input");
    root.append(input);

    root.classList.add("is-property-open");
    expect(dispatchKey(input, "Escape").defaultPrevented).toBe(true);
    expect(root.classList.contains("is-property-open")).toBe(false);
    expect(log).toContain("focus");

    root.classList.add("is-search-open");
    expect(dispatchKey(input, "Escape").defaultPrevented).toBe(true);
    expect(root.classList.contains("is-search-open")).toBe(false);
    expect(log).toContain("execute:cancel");

    coordinator.destroy();
    root.remove();
  });

  it("shows whole-document export for active blank paper without a selection", () => {
    const captures: CreateSchematicEditorOptions[] = [];
    const exportCalls: Array<{
      source: { editor?: SchematicEditorHandle; namespace: string };
      position: { x: number; y: number };
    }> = [];
    const coordinator = new SchematicActiveEditorCoordinator(window as Window & typeof globalThis, {
      createEditor: fakeEditorFactory([], captures),
      showExportMenu: ((
        source: { editor?: SchematicEditorHandle; namespace: string },
        position: { x: number; y: number },
        _ownerDocument: Document,
        onVisibilityChange?: (visible: boolean) => void
      ) => {
        exportCalls.push({ source, position });
        onVisibilityChange?.(true);
        return { hide() { onVisibilityChange?.(false); } };
      }) as never
    });
    const root = document.createElement("div");
    document.body.append(root);
    coordinator.mountWidget(root, session("active-blank-export"), { dispatch() {} } as never);
    root.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    const paper = document.createElement("div");
    paper.dataset.schematicPaper = "";
    paper.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      event.stopPropagation();
      captures[0].host.contextMenu?.show(event.clientX, event.clientY, "blank");
    });
    const blankSurface = document.createElement("div");
    paper.append(blankSurface);
    root.append(paper);

    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 120,
      clientY: 240
    });
    blankSurface.dispatchEvent(event);

    // JointJS prevents the browser's native paper menu before the host fallback runs.
    expect(event.defaultPrevented).toBe(true);
    expect(exportCalls).toHaveLength(1);
    expect(exportCalls[0].source.editor).toBeUndefined();
    expect(exportCalls[0].source.namespace).toBe("active-blank-export");
    expect(exportCalls[0].position).toEqual({ x: 120, y: 240 });
    expect(captures[0].host.contextMenu?.hidden).toBe(false);
    coordinator.destroy();
    root.remove();
  });

  it("does not apply the active blank-paper export fallback outside the paper", () => {
    const exportCalls: unknown[] = [];
    const coordinator = new SchematicActiveEditorCoordinator(window as Window & typeof globalThis, {
      createEditor: fakeEditorFactory([], []),
      showExportMenu: ((...args: unknown[]) => {
        exportCalls.push(args);
        return { hide() {} };
      }) as never
    });
    const root = document.createElement("div");
    document.body.append(root);
    coordinator.mountWidget(root, session("active-non-paper"), { dispatch() {} } as never);
    root.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    const drawer = document.createElement("div");
    const input = document.createElement("input");
    drawer.append(input);
    root.append(drawer);

    const drawerEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2
    });
    drawer.dispatchEvent(drawerEvent);
    const inputEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2
    });
    input.dispatchEvent(inputEvent);

    expect(drawerEvent.defaultPrevented).toBe(false);
    expect(inputEvent.defaultPrevented).toBe(false);
    expect(exportCalls).toEqual([]);
    coordinator.destroy();
    root.remove();
  });

  it("does not rerender inactive SVG when only the mapped fence range changes", () => {
    const coordinator = new SchematicActiveEditorCoordinator(window as Window & typeof globalThis);
    const root = document.createElement("div");
    document.body.append(root);
    const initial = session("mapped-static");
    const view = { dispatch() {} } as never;
    coordinator.mountWidget(root, initial, view);
    const svgContainer = root.firstElementChild;

    coordinator.updateWidget(root, {
      ...initial,
      from: initial.from + 12,
      to: initial.to + 12
    }, view);

    expect(root.firstElementChild).toBe(svgContainer);
    coordinator.destroy();
    root.remove();
  });

  it("updates a reused inactive widget from the session published by Undo", () => {
    const coordinator = new SchematicActiveEditorCoordinator(window as Window & typeof globalThis);
    let nextId = 1;
    const field = createSchematicSessionField({
      createId: () => `undo-static-${nextId++}`,
      createWidget: (blockSession) => new SchematicBlockWidget(blockSession, () => coordinator),
      forceLivePreview: true,
      collectFencedCodeRanges: testFencedCodeRanges
    });
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: schematicFenceWithNote("R7"),
        extensions: [field]
      })
    });
    const root = parent.querySelector<HTMLElement>("[data-schematic-session]");
    expect(root).not.toBeNull();
    expect(root?.textContent).toContain("R7");
    const referenceFrom = view.state.doc.toString().indexOf('"text": "R7"') + '"text": "'.length;

    view.dispatch({
      changes: { from: referenceFrom, to: referenceFrom + 2, insert: "R6" },
      annotations: Transaction.userEvent.of("undo")
    });

    expect(parent.querySelector("[data-schematic-session]")).toBe(root);
    expect(root?.textContent).toContain("R6");
    expect(root?.textContent).not.toContain("R7");
    coordinator.destroy();
    view.destroy();
    parent.remove();
  });

  it("keeps rendered production widgets stable across a 20-block range remap", () => {
    const coordinator = new SchematicActiveEditorCoordinator(window as Window & typeof globalThis);
    let nextId = 1;
    const field = createSchematicSessionField({
      createId: () => `stable-${nextId++}`,
      createWidget: (blockSession) => new SchematicBlockWidget(blockSession, () => coordinator),
      forceLivePreview: true,
      collectFencedCodeRanges: testFencedCodeRanges
    });
    const emptyFence = `\`\`\`json\n${serializeSchematicContent(createEmptySchematicContent())}\`\`\``;
    const parent = document.createElement("div");
    document.body.append(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: Array.from({ length: 20 }, (_, index) => `section ${index}\n${emptyFence}`).join("\n\n"),
        extensions: [field]
      })
    });
    const roots = [...parent.querySelectorAll<HTMLElement>("[data-schematic-session]")];
    const staticChildren = roots.map((root) => root.firstElementChild);
    expect(view.state.field(field).sessions).toHaveLength(20);
    expect(roots.length).toBeGreaterThan(0);

    view.dispatch({ changes: { from: 0, insert: "new heading\n" } });

    const mappedRoots = [...parent.querySelectorAll<HTMLElement>("[data-schematic-session]")];
    expect(view.state.field(field).sessions).toHaveLength(20);
    expect(mappedRoots).toEqual(roots);
    expect(mappedRoots.map((root) => root.firstElementChild)).toEqual(staticChildren);
    coordinator.destroy();
    view.destroy();
    parent.remove();
  });

  it("only flushes and destroys for a left click in Markdown outside the active root", () => {
    const log: string[] = [];
    const coordinator = new SchematicActiveEditorCoordinator(window as Window & typeof globalThis, {
      createEditor: fakeEditorFactory(log, [])
    });
    const content = document.createElement("div");
    const root = document.createElement("div");
    const markdown = document.createElement("p");
    const chrome = document.createElement("button");
    content.append(root, markdown);
    document.body.append(content, chrome);
    const view = { dispatch() {}, contentDOM: content } as never;
    coordinator.mountWidget(root, session("outside"), view);
    root.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));

    markdown.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 2 }));
    chrome.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 }));
    expect(coordinator.activeEditor()).not.toBeNull();

    markdown.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, cancelable: true }));
    expect(coordinator.activeEditor()).toBeNull();
    expect(log).toContain("flush:outside-click");
    expect(log).toContain("destroy");
    content.remove();
    chrome.remove();
  });

  it("hands an active editor to a new widget root with the same session runtime", async () => {
    const log: string[] = [];
    const coordinator = new SchematicActiveEditorCoordinator(window as Window & typeof globalThis, {
      createEditor: fakeEditorFactory(log, [])
    });
    const content = document.createElement("div");
    document.body.append(content);
    const source = schematicFenceWithNote("Keep this height");
    const field = createSchematicSessionField({
      createId: () => "reclaimed-widget",
      createWidget: (blockSession) => new SchematicBlockWidget(blockSession, () => coordinator),
      forceLivePreview: true,
      collectFencedCodeRanges: testFencedCodeRanges
    });
    let state = EditorState.create({ doc: source, extensions: [field] });
    const oldSession = state.field(field).sessions[0];
    state = state.update({ changes: { from: 0, insert: "heading\n" } }).state;
    const replacementSession = state.field(field).sessions[0];
    expect(replacementSession).not.toBe(oldSession);
    expect(replacementSession.id).toBe(oldSession.id);
    const view = { dom: content, dispatch() {}, contentDOM: content } as unknown as EditorView;
    const oldWidget = new SchematicBlockWidget(oldSession, () => coordinator);
    const oldRoot = oldWidget.toDOM(view);
    content.append(oldRoot);
    const heightLimit = oldRoot.style.getPropertyValue(SCHEMATIC_HEIGHT_LIMIT_PROPERTY);
    expect(heightLimit).not.toBe("");
    oldRoot.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    const editorDom = oldRoot.firstElementChild as HTMLElement;
    editorDom.focus();
    expect(document.activeElement).toBe(editorDom);
    log.length = 0;

    oldWidget.destroy(oldRoot);
    oldRoot.remove();
    await Promise.resolve();
    coordinator.auditActiveRoot();
    expect(coordinator.activeEditor()).not.toBeNull();
    expect(log).not.toContain("destroy");

    const replacementWidget = new SchematicBlockWidget(replacementSession, () => coordinator);
    const newRoot = replacementWidget.toDOM(view);
    content.append(newRoot);
    await Promise.resolve();

    expect(coordinator.activeEditor()).not.toBeNull();
    expect(coordinator.activeRoot()).toBe(newRoot);
    expect(newRoot.contains(oldRoot)).toBe(true);
    expect(newRoot.contains(editorDom)).toBe(true);
    expect(newRoot.classList.contains("is-active")).toBe(true);
    expect(newRoot.style.getPropertyValue(SCHEMATIC_HEIGHT_LIMIT_PROPERTY)).toBe(heightLimit);
    expect(document.activeElement).toBe(editorDom);
    expect(log).not.toContain("destroy");

    await new Promise((resolve) => window.setTimeout(resolve, 60));
    expect(coordinator.activeEditor()).not.toBeNull();
    expect(log).not.toContain("destroy");

    replacementWidget.destroy(newRoot);
    await new Promise((resolve) => window.setTimeout(resolve, 60));
    expect(coordinator.activeEditor()).toBeNull();
    expect(log).toContain("flush:widget-destroy");
    expect(log).toContain("destroy");
    content.remove();
  });

  it("does not steal focus back from an Obsidian overlay during widget handoff", async () => {
    const coordinator = new SchematicActiveEditorCoordinator(window as Window & typeof globalThis, {
      createEditor: fakeEditorFactory([], [])
    });
    const content = document.createElement("div");
    const overlayButton = document.createElement("button");
    document.body.append(content, overlayButton);
    const source = `\`\`\`json\n${serializeSchematicContent(createEmptySchematicContent())}\`\`\``;
    const field = createSchematicSessionField({
      createId: () => "overlay-handoff",
      createWidget: (blockSession) => new SchematicBlockWidget(blockSession, () => coordinator),
      forceLivePreview: true,
      collectFencedCodeRanges: testFencedCodeRanges
    });
    let state = EditorState.create({ doc: source, extensions: [field] });
    const oldSession = state.field(field).sessions[0];
    state = state.update({ changes: { from: 0, insert: "heading\n" } }).state;
    const replacementSession = state.field(field).sessions[0];
    const view = { dom: content, dispatch() {}, contentDOM: content } as unknown as EditorView;
    const oldWidget = new SchematicBlockWidget(oldSession, () => coordinator);
    const oldRoot = oldWidget.toDOM(view);
    content.append(oldRoot);
    oldRoot.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    (oldRoot.firstElementChild as HTMLElement).focus();

    oldWidget.destroy(oldRoot);
    oldRoot.remove();
    overlayButton.focus();
    const replacementWidget = new SchematicBlockWidget(replacementSession, () => coordinator);
    const newRoot = replacementWidget.toDOM(view);
    content.append(newRoot);
    await Promise.resolve();

    expect(document.activeElement).toBe(overlayButton);
    coordinator.destroy();
    content.remove();
    overlayButton.remove();
  });

  it("does not steal focus from a control focused inside the editor after commit", async () => {
    const captures: CreateSchematicEditorOptions[] = [];
    const coordinator = new SchematicActiveEditorCoordinator(window as Window & typeof globalThis, {
      createEditor: fakeEditorFactory([], captures)
    });
    const root = document.createElement("div");
    document.body.append(root);
    coordinator.mountWidget(root, session("internal-focus"), {
      dom: root,
      contentDOM: root,
      dispatch() {}
    } as unknown as EditorView);
    root.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    const canvas = root.firstElementChild as HTMLElement;
    canvas.focus();
    const nextContent = createEmptySchematicContent();
    nextContent.notes.push({
      id: "note-editor",
      x: 0,
      y: 0,
      width: 120,
      height: 40,
      anchor: "upperLeft",
      text: ""
    });

    expect(captures[0].host.commit(nextContent, {
      origin: "editor",
      reason: "create-note",
      revision: 1
    })).toBe(true);
    const noteEditor = document.createElement("textarea");
    root.append(noteEditor);
    noteEditor.focus();
    await Promise.resolve();

    expect(document.activeElement).toBe(noteEditor);
    coordinator.destroy();
    root.remove();
  });

  it("uses the projected pending map for a second commit before a valid echo arrives", () => {
    const log: string[] = [];
    let editorContent = createEmptySchematicContent();
    const captures: CreateSchematicEditorOptions[] = [];
    const coordinator = new SchematicActiveEditorCoordinator(window as Window & typeof globalThis, {
      createEditor: (options) => {
        captures.push(options);
        const handle = fakeEditorFactory(log, [])(options) as SchematicEditorHandle;
        return {
          ...handle,
          getContent: () => structuredClone(editorContent)
        };
      }
    });
    const contentDOM = document.createElement("div");
    const root = document.createElement("div");
    contentDOM.append(root);
    document.body.append(contentDOM);
    const initial = session("own-commit");
    let markdownSource = `\`\`\`json\n${serializeSchematicContent(editorContent)}\`\`\``;
    let dispatchCount = 0;
    let view: EditorView;
    view = {
      contentDOM,
      dispatch(spec: unknown) {
        const change = (spec as { changes: { from: number; to: number; insert: string } }).changes;
        markdownSource = `${markdownSource.slice(0, change.from)}${change.insert}${markdownSource.slice(change.to)}`;
        dispatchCount += 1;
        const diagnosticProjection = parseSchematicFence(
          '```json\n{"format":"adc-helper/schematic","version":1}\n```'
        );
        if (!diagnosticProjection || diagnosticProjection.kind !== "diagnostic") {
          throw new Error("Expected a diagnostic projection.");
        }
        const staleOrDiagnostic = dispatchCount === 1
          ? { ...initial, revision: 0 }
          : { ...initial, revision: 2, projection: diagnosticProjection };
        coordinator.updateWidget(root, staleOrDiagnostic, view);
        expect(coordinator.activeEditor()).not.toBeNull();
      }
    } as unknown as EditorView;
    coordinator.mountWidget(root, initial, view);
    root.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    log.length = 0;
    const firstNote = {
      id: "own-note",
      x: 0,
      y: 0,
      width: 120,
      height: 40,
      anchor: "upperLeft",
      text: "self echo"
    } as const;
    editorContent.notes.push(firstNote);

    expect(captures[0].host.commit(editorContent, {
      origin: "editor",
      reason: "note-edit",
      revision: 1
    })).toBe(true);

    editorContent.notes.push({
      ...firstNote,
      id: "second-note",
      y: 80,
      text: "second gesture before parser confirmation"
    });
    expect(captures[0].host.commit(editorContent, {
      origin: "editor",
      reason: "note-edit",
      revision: 2
    })).toBe(true);

    const finalProjection = parseSchematicFence(markdownSource);
    expect(finalProjection?.kind).toBe("schematic");
    if (!finalProjection || finalProjection.kind !== "schematic") {
      throw new Error("Expected the two pending commits to leave valid schematic Markdown.");
    }
    expect(finalProjection.canonical).toBe(serializeSchematicContent(editorContent));
    expect(dispatchCount).toBe(2);
    expect(coordinator.activeEditor()).not.toBeNull();
    expect(root.classList.contains("is-active")).toBe(true);
    expect(log).not.toContain("replace");
    expect(log).not.toContain("destroy");
    coordinator.destroy();
    contentDOM.remove();
  });

  it("waits for the exact own echo when the same revision first publishes stale valid content", () => {
    const log: string[] = [];
    let editorContent = createEmptySchematicContent();
    const captures: CreateSchematicEditorOptions[] = [];
    const coordinator = new SchematicActiveEditorCoordinator(window as Window & typeof globalThis, {
      createEditor: (options) => {
        captures.push(options);
        const handle = fakeEditorFactory(log, [])(options) as SchematicEditorHandle;
        return {
          ...handle,
          getContent: () => structuredClone(editorContent)
        };
      }
    });
    const contentDOM = document.createElement("div");
    const root = document.createElement("div");
    contentDOM.append(root);
    document.body.append(contentDOM);
    const initial = session("same-revision-stale");
    let markdownSource = `\`\`\`json\n${initial.projection.map.logicalBody}\`\`\``;
    const view = {
      dom: contentDOM,
      contentDOM,
      dispatch(spec: unknown) {
        const change = (spec as { changes: { from: number; to: number; insert: string } }).changes;
        markdownSource = `${markdownSource.slice(0, change.from)}${change.insert}${markdownSource.slice(change.to)}`;
      }
    } as unknown as EditorView;
    coordinator.mountWidget(root, initial, view);
    root.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    log.length = 0;
    editorContent.notes.push({
      id: "pending-note",
      x: 0,
      y: 0,
      width: 120,
      height: 40,
      anchor: "upperLeft",
      text: "pending"
    });

    expect(captures[0].host.commit(editorContent, {
      origin: "editor",
      reason: "note-edit",
      revision: 1
    })).toBe(true);

    coordinator.updateWidget(root, { ...initial, revision: 1 }, view);
    expect(log).not.toContain("replace");
    expect(log).not.toContain("destroy");
    expect(coordinator.activeEditor()).not.toBeNull();

    const exactProjection = parseSchematicFence(markdownSource);
    if (!exactProjection || exactProjection.kind !== "schematic") {
      throw new Error("Expected the committed Markdown to remain a schematic fence.");
    }
    coordinator.updateWidget(root, {
      ...initial,
      revision: 1,
      projection: exactProjection
    }, view);
    expect(log).not.toContain("replace");

    coordinator.updateWidget(root, { ...initial, revision: 1 }, view);
    expect(log).not.toContain("replace");
    expect(log).not.toContain("destroy");
    expect(coordinator.activeEditor()).not.toBeNull();

    const externalContent = createEmptySchematicContent();
    externalContent.notes.push({
      id: "external-note",
      x: 0,
      y: 0,
      width: 120,
      height: 40,
      anchor: "upperLeft",
      text: "external"
    });
    const externalProjection = parseSchematicFence(
      `\`\`\`json\n${serializeSchematicContent(externalContent)}\`\`\``
    );
    if (!externalProjection || externalProjection.kind !== "schematic") {
      throw new Error("Expected the external Markdown to remain a schematic fence.");
    }
    coordinator.updateWidget(root, {
      ...initial,
      revision: 2,
      projection: externalProjection
    }, view);
    expect(log.filter((entry) => entry === "replace")).toHaveLength(1);

    coordinator.destroy();
    contentDOM.remove();
  });

  it("finishes teardown when a transient flush throws", () => {
    const log: string[] = [];
    const coordinator = new SchematicActiveEditorCoordinator(window as Window & typeof globalThis, {
      createEditor: (options) => {
        const editor = fakeEditorFactory(log, [])(options);
        return {
          ...editor,
          flushTransientEdits(reason?: string) {
            log.push(`flush:${reason}`);
            throw new Error("flush failed");
          }
        } as SchematicEditorHandle;
      }
    });
    const root = document.createElement("div");
    document.body.append(root);
    coordinator.mountWidget(root, session("throwing-flush"), { dispatch() {} } as never);
    root.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));

    expect(() => coordinator.freeze("test-flush-error")).toThrow("flush failed");
    expect(coordinator.activeEditor()).toBeNull();
    expect(log).toContain("destroy");
    root.remove();
  });

  it("blocks transient flush commits before freezing for an external diagnostic", () => {
    const log: string[] = [];
    let dispatchCount = 0;
    const coordinator = new SchematicActiveEditorCoordinator(window as Window & typeof globalThis, {
      createEditor: (options) => {
        const handle = fakeEditorFactory(log, [])(options) as SchematicEditorHandle;
        return {
          ...handle,
          flushTransientEdits(reason) {
            log.push(`flush:${reason}`);
            const pendingContent = structuredClone(options.content);
            pendingContent.notes.push({
              id: "pending-note",
              x: 0,
              y: 0,
              width: 120,
              height: 40,
              anchor: "upperLeft",
              text: "must not overwrite invalid source"
            });
            const accepted = options.host.commit(pendingContent, {
              origin: "editor",
              reason: "note-edit",
              revision: 1
            });
            log.push(`flush-commit:${accepted}`);
          }
        };
      }
    });
    const contentDOM = document.createElement("div");
    const root = document.createElement("div");
    contentDOM.append(root);
    document.body.append(contentDOM);
    const initial = session("external-invalid");
    const view = {
      contentDOM,
      dispatch() { dispatchCount += 1; }
    } as unknown as EditorView;
    coordinator.mountWidget(root, initial, view);
    root.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    log.length = 0;

    const diagnosticProjection = parseSchematicFence(
      '```json\n{"format":"adc-helper/schematic","version":1}\n```'
    );
    if (!diagnosticProjection || diagnosticProjection.kind !== "diagnostic") {
      throw new Error("Expected a diagnostic projection.");
    }
    coordinator.updateWidget(root, {
      ...initial,
      revision: 1,
      projection: diagnosticProjection
    }, view);

    expect(coordinator.activeEditor()).toBeNull();
    expect(dispatchCount).toBe(0);
    expect(log).toContain("flush:source-invalid");
    expect(log).toContain("flush-commit:false");
    expect(log).toContain("destroy");
    expect(root.textContent).toContain("schematic");
    contentDOM.remove();
  });

  it("confirms its own CM transaction without recursive replaceContent and keeps global Undo order", () => {
    const log: string[] = [];
    let content = createEmptySchematicContent();
    const captures: CreateSchematicEditorOptions[] = [];
    const coordinator = new SchematicActiveEditorCoordinator(window as Window & typeof globalThis, {
      createEditor: (options) => {
        captures.push(options);
        content = structuredClone(options.content);
        const handle: SchematicEditorHandle = {
          init() {},
          destroy() {},
          getState: () => ({
            content,
            view: { zoom: 1, translate: { x: 0, y: 0 }, presentationMode: false },
            canUndo: options.host.canUndo(),
            canRedo: options.host.canRedo(),
            status: "",
            origin: "test",
            reason: "test",
            revision: 0
          }),
          getContent: () => structuredClone(content),
          replaceContent(next) {
            content = structuredClone(next);
            log.push("replace");
          },
          transact(mutate, metadata = {}) {
            const next = structuredClone(content);
            mutate(next);
            content = next;
            options.host.commit(next, {
              origin: metadata.origin ?? "editor",
              reason: metadata.reason ?? "transaction",
              revision: metadata.revision ?? 1
            });
          },
          execute() { return true; },
          run() {},
          flushTransientEdits() {},
          fit() {},
          focus() {},
          hasExportableSelection: () => false,
          getSelectionExportInput: () => Promise.resolve({} as never),
          getSelectionContent: () => null,
          subscribe: () => () => {}
        };
        return handle;
      }
    });
    let nextId = 1;
    const field = createSchematicSessionField({
      createId: () => `history-${nextId++}`,
      createWidget: (blockSession) => new SchematicBlockWidget(blockSession, () => coordinator),
      forceLivePreview: true,
      collectFencedCodeRanges: testFencedCodeRanges
    });
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    const view = new EditorView({
      parent,
      state: EditorState.create({
        doc: `preface\n${session("history").projection.map.logicalBody
          ? `\`\`\`json\n${session("history").projection.map.logicalBody}\`\`\``
          : ""}`,
        extensions: [history(), field]
      })
    });
    const root = parent.querySelector<HTMLElement>("[data-schematic-session]");
    expect(root).not.toBeNull();
    root?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    expect(captures).toHaveLength(1);

    view.dispatch({
      changes: { from: 0, insert: "heading\n" },
      annotations: Transaction.addToHistory.of(true)
    });
    coordinator.activeEditor()?.transact((draft) => {
      draft.notes.push({
        id: "note-1",
        x: 0,
        y: 0,
        width: 120,
        height: 40,
        anchor: "upperLeft",
        text: "committed"
      });
    }, { origin: "editor", reason: "note-edit", revision: 1 });

    expect(log).toEqual([]);
    expect(view.state.doc.toString()).toContain("heading\npreface");
    expect(view.state.doc.toString()).toContain("committed");
    expect(parent.querySelector("[data-schematic-session]")).toBe(root);
    expect(coordinator.activeEditor()).not.toBeNull();
    expect(captures[0].host.canUndo()).toBe(true);
    captures[0].host.undo();
    expect(view.state.doc.toString()).toContain("heading\npreface");
    expect(view.state.doc.toString()).not.toContain("committed");
    expect(log).toEqual(["replace"]);
    expect(parent.querySelector("[data-schematic-session]")).toBe(root);
    expect(coordinator.activeEditor()).not.toBeNull();

    captures[0].host.undo();
    expect(view.state.doc.toString()).not.toContain("heading\npreface");
    captures[0].host.redo();
    expect(view.state.doc.toString()).toContain("heading\npreface");
    captures[0].host.redo();
    expect(view.state.doc.toString()).toContain("committed");

    coordinator.destroy();
    view.destroy();
    parent.remove();
  });
});

describe("blank canvas paste", () => {
  function fixture(activate = true) {
    resetObsidianMockState();
    const log: string[] = [];
    const captures: CreateSchematicEditorOptions[] = [];
    const menus: Array<{ onPaste?: () => void }> = [];
    const coordinator = new SchematicActiveEditorCoordinator(window as Window & typeof globalThis, {
      createEditor: fakeEditorFactory(log, captures),
      showExportMenu: ((source: { onPaste?: () => void }) => {
        menus.push(source);
        return { hide() {} };
      }) as never
    });
    const root = document.createElement("div");
    document.body.append(root);
    coordinator.mountWidget(root, session("paste-target"), { dispatch() {} } as never);
    if (activate) {
      root.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
      captures[0].host.contextMenu?.show(20, 30, "blank");
    }
    const previous = Object.getOwnPropertyDescriptor(window.navigator, "clipboard");
    return {
      root, log, captures, coordinator, menus,
      paste: () => menus.at(-1)!.onPaste!(),
      clipboard(readText: () => Promise<string>) {
        Object.defineProperty(window.navigator, "clipboard", { configurable: true, value: { readText } });
      },
      destroy() {
        coordinator.destroy();
        root.remove();
        if (previous) Object.defineProperty(window.navigator, "clipboard", previous);
        else Reflect.deleteProperty(window.navigator, "clipboard");
      }
    };
  }

  it("parses schematic JSON and starts the shared paste command in the active editor", async () => {
    const f = fixture();
    try {
      const content = createEmptySchematicContent();
      content.notes.push({ id: "copied", x: 0, y: 0, width: 120, height: 40, text: "Clipboard", anchor: "upperLeft" });
      const execute = vi.spyOn(f.coordinator.activeEditor()!, "execute");
      f.clipboard(async () => serializeSchematicContent(content));
      expect(f.menus[0].onPaste).toBeTypeOf("function");
      f.paste();
      await vi.waitFor(() => expect(execute).toHaveBeenCalledWith({ kind: "paste", content }));
      expect(f.log).not.toContain("replace");
      f.captures[0].host.contextMenu?.show(20, 30, "selection");
      expect(f.menus.at(-1)!.onPaste).toBeUndefined();
    } finally { f.destroy(); }
  });

  it.each(["", "not schematic JSON"])("does not modify the document for invalid clipboard text %j", async text => {
    const f = fixture();
    try {
      const execute = vi.spyOn(f.coordinator.activeEditor()!, "execute");
      f.clipboard(async () => text);
      f.paste();
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(execute).not.toHaveBeenCalled();
      expect(obsidianMockState.notices.at(-1)).toContain("Could not paste schematic JSON");
    } finally { f.destroy(); }
  });

  it("ignores a clipboard read that completes after leaving the active editor", async () => {
    const f = fixture();
    try {
      let finish!: (text: string) => void;
      f.clipboard(() => new Promise(resolve => { finish = resolve; }));
      f.paste();
      f.coordinator.freeze("switch-document");
      finish(serializeSchematicContent(createEmptySchematicContent()));
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(f.log).not.toContain("execute:paste");
    } finally { f.destroy(); }
  });

  it("keeps only the latest clipboard request", async () => {
    const f = fixture();
    try {
      const execute = vi.spyOn(f.coordinator.activeEditor()!, "execute");
      const finish: Array<(text: string) => void> = [];
      f.clipboard(() => new Promise(resolve => { finish.push(resolve); }));
      f.paste();
      f.paste();
      finish[1](serializeSchematicContent(createEmptySchematicContent()));
      await vi.waitFor(() => expect(execute).toHaveBeenCalledOnce());
      finish[0](serializeSchematicContent(createEmptySchematicContent()));
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(execute).toHaveBeenCalledOnce();
    } finally { f.destroy(); }
  });

  it("reports clipboard access failure without executing a paste", async () => {
    const f = fixture();
    try {
      const execute = vi.spyOn(f.coordinator.activeEditor()!, "execute");
      f.clipboard(async () => { throw new Error("Clipboard denied"); });
      f.paste();
      await vi.waitFor(() => expect(obsidianMockState.notices.at(-1)).toContain("Clipboard denied"));
      expect(execute).not.toHaveBeenCalled();
    } finally { f.destroy(); }
  });

  it("activates an inactive schematic block before starting its paste preview", async () => {
    const f = fixture(false);
    try {
      f.clipboard(async () => serializeSchematicContent(createEmptySchematicContent()));
      expect(f.coordinator.activeEditor()).toBeNull();
      f.root.querySelector("svg")!.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
      expect(f.menus.at(-1)!.onPaste).toBeTypeOf("function");
      f.paste();
      await vi.waitFor(() => expect(f.log).toContain("execute:paste"));
      expect(f.coordinator.activeEditor()).not.toBeNull();
    } finally { f.destroy(); }
  });
});

describe("Note focus during host commits", () => {
  it.each([false, true])("preserves transient Markdown focus but respects external focus=%s", async external => {
    const captures: CreateSchematicEditorOptions[] = [];
    const coordinator = new SchematicActiveEditorCoordinator(window as Window & typeof globalThis, {
      createEditor: fakeEditorFactory([], captures)
    });
    const contentDOM = document.createElement("div");
    contentDOM.tabIndex = 0;
    const root = document.createElement("div");
    const outside = document.createElement("button");
    contentDOM.append(root);
    document.body.append(contentDOM, outside);
    coordinator.mountWidget(root, session("note-focus"), {
      dom: contentDOM, contentDOM,
      dispatch() { (external ? outside : contentDOM).focus(); }
    } as unknown as EditorView);
    root.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0 }));
    const textarea = document.createElement("textarea");
    textarea.dataset.noteEditor = "";
    textarea.value = "first";
    root.append(textarea);
    const endEditing = vi.fn(() => textarea.remove());
    textarea.addEventListener("blur", endEditing);
    textarea.focus();
    textarea.setSelectionRange(2, 2);
    const content = createEmptySchematicContent();
    content.notes.push({ id: "note", x: 0, y: 0, width: 120, height: 40, anchor: "upperLeft", text: "first second" });
    try {
      captures[0].host.commit(content, { origin: "editor", reason: "edit", revision: 1 });
      await Promise.resolve();
      if (external) {
        expect(endEditing).toHaveBeenCalledOnce();
        expect(document.activeElement).toBe(outside);
      } else {
        expect(endEditing).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(textarea);
        expect(textarea.selectionStart).toBe(2);
        expect(textarea.isConnected).toBe(true);
      }
    } finally {
      coordinator.destroy();
      contentDOM.remove();
      outside.remove();
    }
  });
});
