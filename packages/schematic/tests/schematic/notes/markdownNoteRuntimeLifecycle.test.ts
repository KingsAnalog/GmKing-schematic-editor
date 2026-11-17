import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const milkdown = vi.hoisted(() => {
  const editor: {
    config: ReturnType<typeof vi.fn>;
    use: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  } = {} as never;
  editor.config = vi.fn(() => editor);
  editor.use = vi.fn(() => editor);
  editor.create = vi.fn();
  editor.destroy = vi.fn();
  return {
    editor,
    make: vi.fn(() => editor)
  };
});

vi.mock("@milkdown/kit/core", () => ({
  defaultValueCtx: Symbol("defaultValueCtx"),
  Editor: { make: milkdown.make },
  editorViewCtx: Symbol("editorViewCtx"),
  editorViewOptionsCtx: Symbol("editorViewOptionsCtx"),
  rootAttrsCtx: Symbol("rootAttrsCtx"),
  rootCtx: Symbol("rootCtx")
}));

vi.mock("@milkdown/kit/plugin/history", () => ({ history: {} }));
vi.mock("@milkdown/kit/plugin/listener", () => ({
  listener: {},
  listenerCtx: Symbol("listenerCtx")
}));
vi.mock("@milkdown/kit/preset/commonmark", () => ({
  commonmark: {},
  imageSchema: { node: {} },
  listItemSchema: { node: {} }
}));
vi.mock("@milkdown/kit/preset/gfm", () => ({ gfm: {} }));
vi.mock("@milkdown/kit/prose/inputrules", () => ({ InputRule: class {} }));
vi.mock("@milkdown/kit/prose/commands", () => ({ toggleMark: vi.fn() }));
vi.mock("@milkdown/kit/prose/gapcursor", () => ({
  gapCursor: vi.fn(() => ({})),
  GapCursor: class {
    static valid() {
      return false;
    }
  }
}));
vi.mock("@milkdown/kit/prose/state", () => ({
  NodeSelection: { create: vi.fn() },
  TextSelection: { atEnd: vi.fn(), create: vi.fn() }
}));
vi.mock("@milkdown/kit/utils", () => ({
  getMarkdown: vi.fn(),
  replaceAll: vi.fn(),
  $inputRule: vi.fn(() => ({})),
  $nodeSchema: vi.fn(() => ({ node: {}, type: vi.fn() })),
  $prose: vi.fn(() => ({})),
  $remark: vi.fn(() => ({})),
  $useKeymap: vi.fn(() => ({})),
  $view: vi.fn(() => ({}))
}));
vi.mock("remark-math", () => ({ default: vi.fn() }));
vi.mock("../../../src/shared/mathjax", () => ({ renderMathTexInto: vi.fn() }));

import {
  MarkdownNoteRuntime,
  safeMarkdownNoteImageSrc
} from "../../../src/schematic/notes/markdownNoteRuntime";

describe("safeMarkdownNoteImageSrc", () => {
  it.each([
    "data:image/png;base64,iVBORw0KGgo=",
    "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
    "data:image/jpg;base64,/9j/4AAQSkZJRg==",
    "data:image/gif;base64,R0lGODlhAQABAIAAAAUEBA==",
    "data:image/webp;base64,UklGRg==",
    "data:image/avif;base64,AAAAIGZ0eXBhdmlm"
  ])("allows supported base64 raster images without rewriting the source", (source) => {
    expect(safeMarkdownNoteImageSrc(`  ${source}  `)).toBe(source);
  });

  it.each([
    "https://example.com/image.png",
    "http://example.com/image.png",
    "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
    "data:image/png,not-base64",
    "data:text/html;base64,PGltZyBzcmM9eCBvbmVycm9yPWFsZXJ0KDEpPg==",
    "javascript:alert(1)",
    "",
    "data:image/png;base64,"
  ])("rejects remote, active, or malformed image sources", (source) => {
    expect(safeMarkdownNoteImageSrc(source)).toBeNull();
  });
});

describe("MarkdownNoteRuntime mount failure cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("releases runtime-owned observers and host listeners before rethrowing the mount error", async () => {
    const mountError = new Error("Milkdown mount failed");
    milkdown.editor.create.mockRejectedValueOnce(mountError);

    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(_callback: ResizeObserverCallback) {}
      observe = observe;
      disconnect = disconnect;
      unobserve() {}
    });

    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const host = {
      addEventListener,
      removeEventListener,
      scrollHeight: 40
    } as unknown as HTMLElement;

    await expect(MarkdownNoteRuntime.create({
      noteId: "note-1",
      host,
      markdown: "**pending**",
      editable: true,
      onChange: vi.fn(),
      onResize: vi.fn()
    })).rejects.toBe(mountError);

    expect(observe).toHaveBeenCalledOnce();
    expect(observe).toHaveBeenCalledWith(host);
    expect(disconnect).toHaveBeenCalledOnce();

    const clickListener = addEventListener.mock.calls.find(([type]) => type === "click")?.[1];
    const keydownListener = addEventListener.mock.calls.find(([type]) => type === "keydown")?.[1];
    expect(clickListener).toBeTypeOf("function");
    expect(keydownListener).toBeTypeOf("function");
    expect(removeEventListener).toHaveBeenCalledWith("click", clickListener, true);
    expect(removeEventListener).toHaveBeenCalledWith("keydown", keydownListener, true);
  });

  it("releases host resources immediately when its document aborts during Milkdown create", async () => {
    let finishCreate!: () => void;
    const createGate = new Promise<void>((resolve) => {
      finishCreate = resolve;
    });
    milkdown.editor.create.mockReturnValueOnce(createGate);
    milkdown.editor.destroy.mockResolvedValue(undefined);

    const observe = vi.fn();
    const disconnect = vi.fn();
    vi.stubGlobal("ResizeObserver", class {
      constructor(_callback: ResizeObserverCallback) {}
      observe = observe;
      disconnect = disconnect;
      unobserve() {}
    });

    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const host = {
      addEventListener,
      removeEventListener,
      scrollHeight: 40
    } as unknown as HTMLElement;
    const controller = new AbortController();

    const runtimePromise = MarkdownNoteRuntime.create({
      noteId: "note-pending",
      host,
      markdown: "$x$",
      editable: false,
      signal: controller.signal,
      onChange: vi.fn(),
      onResize: vi.fn()
    });
    await Promise.resolve();

    controller.abort();
    await Promise.resolve();

    expect(disconnect).toHaveBeenCalledOnce();
    expect(removeEventListener).toHaveBeenCalledWith("click", expect.any(Function), true);
    expect(removeEventListener).toHaveBeenCalledWith("keydown", expect.any(Function), true);

    finishCreate();
    await runtimePromise;

    expect(milkdown.editor.destroy).toHaveBeenCalledWith(true);
  });
});
