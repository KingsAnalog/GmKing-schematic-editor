import "@milkdown/kit/prose/view/style/prosemirror.css";
import "@milkdown/kit/prose/tables/style/tables.css";

import {
  defaultValueCtx,
  Editor,
  editorViewCtx,
  editorViewOptionsCtx,
  rootAttrsCtx,
  rootCtx
} from "@milkdown/kit/core";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { commonmark, imageSchema, listItemSchema } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { InputRule } from "@milkdown/kit/prose/inputrules";
import { toggleMark } from "@milkdown/kit/prose/commands";
import { gapCursor, GapCursor } from "@milkdown/kit/prose/gapcursor";
import { NodeSelection, TextSelection } from "@milkdown/kit/prose/state";
import {
  getMarkdown,
  replaceAll,
  $inputRule,
  $nodeSchema,
  $prose,
  $remark,
  $useKeymap,
  $view
} from "@milkdown/kit/utils";
import remarkMath from "remark-math";
import { renderMathTexInto } from "../../shared/mathjax";
import type {
  FormulaBoundaryDirection,
  FormulaSourceCommitReason,
  FormulaSourceEditor
} from "./formulaSourceEditor";

export interface MarkdownNoteRuntimeOptions {
  noteId: string;
  host: HTMLElement;
  markdown: string;
  editable: boolean;
  signal?: AbortSignal;
  onChange: (markdown: string) => void;
  onResize: (contentHeight: number) => void;
}

const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const SAFE_DATA_IMAGE_SOURCE = /^data:image\/(?:png|jpe?g|gif|webp|avif);base64,[a-z0-9+/]+={0,2}$/i;
const markdownRuntimeSignals = new Map<string, AbortSignal>();
const formulaDraftControllers = new Map<string, Set<FormulaDraftController>>();
let nextMarkdownRuntimeKey = 1;

interface FormulaDraftController {
  isEditing(): boolean;
  commitDraft(): void;
}

function registerFormulaDraftController(runtimeKey: string | null, controller: FormulaDraftController) {
  if (!runtimeKey) return () => {};
  const controllers = formulaDraftControllers.get(runtimeKey) ?? new Set<FormulaDraftController>();
  controllers.add(controller);
  formulaDraftControllers.set(runtimeKey, controllers);
  return () => {
    controllers.delete(controller);
    if (controllers.size === 0) formulaDraftControllers.delete(runtimeKey);
  };
}

function flushFormulaDrafts(runtimeKey: string) {
  const controllers = formulaDraftControllers.get(runtimeKey);
  if (!controllers) return;
  [...controllers].forEach((controller) => {
    if (controller.isEditing()) controller.commitDraft();
  });
}

function isGapCursorValid(position: unknown) {
  const constructor = GapCursor as unknown as { valid?: (position: unknown) => boolean };
  return constructor.valid?.(position) === true;
}

export function safeMarkdownNoteHref(rawHref: string) {
  const href = rawHref.trim();
  if (!href) return null;
  try {
    const url = new URL(href, typeof window === "undefined" ? "http://localhost/" : window.location.href);
    if (!ALLOWED_LINK_PROTOCOLS.has(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function markdownImageLiteral(attrs: { alt?: unknown; src?: unknown; title?: unknown }) {
  const alt = typeof attrs.alt === "string" ? attrs.alt : "";
  const src = typeof attrs.src === "string" ? attrs.src : "";
  const title = typeof attrs.title === "string" && attrs.title ? ` "${attrs.title}"` : "";
  return `![${alt}](${src}${title})`;
}

export function safeMarkdownNoteImageSrc(rawSrc: string) {
  const src = rawSrc.trim();
  return SAFE_DATA_IMAGE_SOURCE.test(src) ? src : null;
}

const remarkMathPlugin = $remark<"schematicRemarkMath", undefined>("schematicRemarkMath", () => remarkMath);

const mathInlineSchema = $nodeSchema("schematic_math_inline", () => ({
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  attrs: { value: { default: "", validate: "string" } },
  parseDOM: [
    {
      tag: 'span[data-type="schematic-math-inline"]',
      getAttrs: (dom) => ({ value: dom.getAttribute("data-value") ?? "" })
    }
  ],
  toDOM: (node) => ["span", { "data-type": "schematic-math-inline", "data-value": node.attrs.value }],
  parseMarkdown: {
    match: (node) => node.type === "inlineMath",
    runner: (state, node, type) => state.addNode(type, { value: String(node.value ?? "") })
  },
  toMarkdown: {
    match: (node) => node.type.name === "schematic_math_inline",
    runner: (state, node) => state.addNode("inlineMath", undefined, String(node.attrs.value ?? ""))
  }
}));

const mathBlockSchema = $nodeSchema("schematic_math_block", () => ({
  group: "block",
  atom: true,
  selectable: true,
  defining: true,
  isolating: true,
  attrs: { value: { default: "", validate: "string" } },
  parseDOM: [
    {
      tag: 'div[data-type="schematic-math-block"]',
      getAttrs: (dom) => ({ value: dom.getAttribute("data-value") ?? "" })
    }
  ],
  toDOM: (node) => ["div", { "data-type": "schematic-math-block", "data-value": node.attrs.value }],
  parseMarkdown: {
    match: (node) => node.type === "math",
    runner: (state, node, type) => state.addNode(type, { value: String(node.value ?? "") })
  },
  toMarkdown: {
    match: (node) => node.type.name === "schematic_math_block",
    runner: (state, node) => state.addNode("math", undefined, String(node.attrs.value ?? ""))
  }
}));

const inlineMathInputRule = $inputRule(
  (ctx) =>
    new InputRule(/(?<!\$)\$([^$\n]+)\$$/, (state, match, start, end) => {
      const value = match[1];
      if (!value) return null;
      return state.tr.replaceWith(start, end, mathInlineSchema.type(ctx).create({ value }));
    })
);

const blockMathKeymap = $useKeymap("schematicMathBlock", {
  InsertBlockMath: {
    shortcuts: "Enter",
    priority: 100,
    command: (ctx) => (state, dispatch) => {
      const { $from } = state.selection;
      if (!$from.parent.isTextblock || $from.parent.textContent !== "$$") return false;
      const start = $from.before();
      const node = mathBlockSchema.type(ctx).create({ value: "" });
      const transaction = state.tr.replaceWith(start, start + $from.parent.nodeSize, node);
      transaction.setSelection(NodeSelection.create(transaction.doc, start));
      dispatch?.(transaction.scrollIntoView());
      return true;
    }
  }
});

const gapCursorPlugin = $prose(() => gapCursor());

function createMathView(display: boolean) {
  return () => (initialNode: any, editorView: any, getPos: () => number | undefined) => {
    let node = initialNode;
    let editing = false;
    let sourceDraft = "";
    let sourceEditor: FormulaSourceEditor | null = null;
    let sourceMountGeneration = 0;
    let renderGeneration = 0;
    let previewTimer: number | null = null;
    const lifecycleController = new AbortController();
    const runtimeKey = editorView.dom?.getAttribute?.("data-markdown-note-runtime-key") ?? null;
    const runtimeSignal = typeof runtimeKey === "string" ? markdownRuntimeSignals.get(runtimeKey) : undefined;
    const abortForRuntime = () => lifecycleController.abort();
    if (runtimeSignal?.aborted) lifecycleController.abort();
    else runtimeSignal?.addEventListener("abort", abortForRuntime, { once: true });
    const dom = document.createElement(display ? "div" : "span");
    const rendered = document.createElement(display ? "div" : "span");
    const sourceHost = document.createElement("div");
    dom.className = display ? "schematic-markdown-math is-block" : "schematic-markdown-math is-inline";
    dom.dataset.type = display ? "schematic-math-block" : "schematic-math-inline";
    rendered.className = "schematic-markdown-math-rendered";
    sourceHost.className = "schematic-markdown-math-source";
    sourceHost.dataset.mathSourceHost = "";
    dom.append(rendered, sourceHost);

    const renderValue = (value: string) => {
      const generation = ++renderGeneration;
      rendered.dataset.tex = value;
      if (!value.trim()) {
        rendered.textContent = display ? "$$ $$" : "$ $";
        rendered.setAttribute("aria-label", "Empty formula");
        rendered.classList.remove("is-math-error");
        dom.classList.remove("is-math-error");
        dom.dataset.mathRenderState = "ready";
        return;
      }
      dom.dataset.mathRenderState = "pending";
      void renderMathTexInto(rendered, value, {
        display,
        signal: lifecycleController.signal
      }).then(() => {
        if (lifecycleController.signal.aborted || generation !== renderGeneration) return;
        dom.classList.toggle("is-math-error", rendered.classList.contains("is-math-error"));
        dom.dataset.mathRenderState = rendered.classList.contains("is-math-error") ? "error" : "ready";
      });
    };

    const render = () => renderValue(String(node.attrs.value ?? ""));
    const clearPreviewTimer = () => {
      if (previewTimer === null) return;
      window.clearTimeout(previewTimer);
      previewTimer = null;
    };
    const schedulePreview = (value: string) => {
      clearPreviewTimer();
      previewTimer = window.setTimeout(() => {
        previewTimer = null;
        renderValue(value);
      }, 80);
    };

    const normalizeSource = (value: string) => display
      ? value.replace(/\r\n?/g, "\n")
      : value.replace(/[\r\n]+/g, "");

    const selectionAtBoundary = (
      transaction: any,
      pos: number,
      direction: FormulaBoundaryDirection
    ) => {
      const target = Math.max(0, Math.min(pos, transaction.doc.content.size));
      const resolved = transaction.doc.resolve(target);
      if (display && isGapCursorValid(resolved)) return new GapCursor(resolved);
      return TextSelection.near(resolved, direction === "before" ? -1 : 1);
    };

    const destroySourceEditor = () => {
      sourceMountGeneration += 1;
      sourceEditor?.destroy();
      sourceEditor = null;
      sourceHost.removeAttribute("aria-busy");
      sourceHost.replaceChildren();
    };

    const applyCommittedValue = (
      value: string,
      destination?: FormulaBoundaryDirection
    ) => {
      const pos = getPos();
      if (typeof pos !== "number") return false;
      const nextValue = normalizeSource(value);
      let transaction = editorView.state.tr;
      const currentValue = String(node.attrs.value ?? "");
      if (nextValue !== currentValue) {
        transaction = transaction.setNodeMarkup(pos, undefined, { ...node.attrs, value: nextValue });
      }
      if (destination) {
        const committedNode = transaction.doc.nodeAt(pos);
        const boundary = destination === "before"
          ? pos
          : pos + (committedNode?.nodeSize ?? node.nodeSize);
        transaction = transaction.setSelection(selectionAtBoundary(transaction, boundary, destination));
      }
      if (!transaction.docChanged && !destination) return false;
      editorView.dispatch(transaction.scrollIntoView());
      return true;
    };

    const finish = (
      commit: boolean,
      options: {
        value?: string;
        destination?: FormulaBoundaryDirection;
        refocus?: boolean;
      } = {}
    ) => {
      if (!editing) return false;
      const value = options.value ?? sourceEditor?.read() ?? sourceDraft;
      clearPreviewTimer();
      editing = false;
      dom.classList.remove("is-source-editing");
      destroySourceEditor();
      if (commit) {
        sourceDraft = normalizeSource(value);
        const changed = applyCommittedValue(sourceDraft, options.destination);
        if (!changed) render();
      } else {
        sourceDraft = String(node.attrs.value ?? "");
        render();
      }
      if (options.refocus !== false) editorView.focus();
      return true;
    };

    const deleteEmptyBlock = () => {
      if (!editing || !display) return;
      clearPreviewTimer();
      editing = false;
      dom.classList.remove("is-source-editing");
      destroySourceEditor();
      const pos = getPos();
      if (typeof pos !== "number") return;
      const state = editorView.state;
      const resolved = state.doc.resolve(pos);
      const index = resolved.index();
      const parent = resolved.parent;
      let transaction = state.tr;
      if (parent.canReplace(index, index + 1)) {
        transaction = transaction.delete(pos, pos + node.nodeSize);
      } else {
        const replacementType = parent.contentMatchAt(index).defaultType ?? state.schema.nodes.paragraph;
        const replacement = replacementType?.createAndFill();
        if (!replacement) return;
        transaction = transaction.replaceWith(pos, pos + node.nodeSize, replacement);
      }
      const selectionPos = Math.max(0, Math.min(pos, transaction.doc.content.size));
      transaction = transaction.setSelection(TextSelection.near(transaction.doc.resolve(selectionPos), 1));
      editorView.dispatch(transaction.scrollIntoView());
      editorView.focus();
    };

    const handleCommit = (value: string, reason: FormulaSourceCommitReason) => {
      finish(true, {
        value,
        destination: reason === "keyboard" ? "after" : undefined,
        refocus: reason === "keyboard"
      });
    };

    const begin = (event?: Event) => {
      if (!editorView.editable || editing || lifecycleController.signal.aborted) return;
      event?.preventDefault();
      event?.stopPropagation();
      editing = true;
      sourceDraft = String(node.attrs.value ?? "");
      dom.classList.add("is-source-editing");
      renderValue(sourceDraft);
      sourceHost.setAttribute("aria-busy", "true");
      const generation = ++sourceMountGeneration;
      void import("./formulaSourceEditor").then(({ createFormulaSourceEditor }) => {
        if (
          !editing
          || lifecycleController.signal.aborted
          || generation !== sourceMountGeneration
          || !dom.isConnected
        ) {
          return;
        }
        sourceEditor = createFormulaSourceEditor({
          host: sourceHost,
          mode: display ? "block" : "inline",
          value: sourceDraft,
          onChange: (value) => {
            sourceDraft = normalizeSource(value);
            schedulePreview(sourceDraft);
          },
          onCommit: handleCommit,
          onCancel: () => finish(false, { refocus: true }),
          onBoundaryEscape: (direction, value) => {
            finish(true, { value, destination: direction, refocus: true });
          },
          onDeleteEmptyBlock: deleteEmptyBlock
        });
        sourceHost.removeAttribute("aria-busy");
        sourceEditor.focus();
      }).catch(() => {
        if (!editing || generation !== sourceMountGeneration) return;
        editing = false;
        dom.classList.remove("is-source-editing");
        sourceHost.removeAttribute("aria-busy");
        sourceHost.replaceChildren();
        render();
        editorView.focus();
      });
    };

    const handleFormulaPointerDown = (event: Event) => {
      if (editing && sourceHost.contains(event.target as Node)) return;
      begin(event);
    };
    dom.addEventListener("pointerdown", handleFormulaPointerDown);
    const controller: FormulaDraftController = {
      isEditing: () => editing,
      commitDraft: () => {
        if (!editing) return;
        if (sourceEditor) sourceEditor.commit();
        else finish(true, { value: sourceDraft, refocus: false });
      }
    };
    const unregisterDraftController = registerFormulaDraftController(runtimeKey, controller);
    render();

    return {
      dom,
      update(nextNode: any) {
        if (nextNode.type !== node.type) return false;
        node = nextNode;
        if (!editing) render();
        return true;
      },
      stopEvent(event: Event) {
        return event.target === sourceHost || sourceHost.contains(event.target as Node);
      },
      ignoreMutation() {
        return true;
      },
      selectNode() {
        dom.classList.remove("ProseMirror-selectednode");
      },
      deselectNode() {
        dom.classList.remove("ProseMirror-selectednode");
      },
      destroy() {
        clearPreviewTimer();
        destroySourceEditor();
        renderGeneration += 1;
        unregisterDraftController();
        runtimeSignal?.removeEventListener("abort", abortForRuntime);
        lifecycleController.abort();
        dom.removeEventListener("pointerdown", handleFormulaPointerDown);
      }
    };
  };
}

const inlineMathView = $view(mathInlineSchema.node, createMathView(false));
const blockMathView = $view(mathBlockSchema.node, createMathView(true));

const imageView = $view(imageSchema.node, () => (initialNode: any) => {
  let node = initialNode;
  const dom = document.createElement("span");
  let currentSrc = "";

  const sync = () => {
    const safeSrc = safeMarkdownNoteImageSrc(String(node.attrs.src ?? ""));
    if (!safeSrc) {
      currentSrc = "";
      dom.className = "schematic-markdown-image-literal";
      dom.dataset.type = "unsupported-image";
      dom.textContent = markdownImageLiteral(node.attrs);
      return;
    }

    currentSrc = safeSrc;
    const image = document.createElement("img");
    image.className = "schematic-markdown-image";
    image.src = safeSrc;
    image.alt = typeof node.attrs.alt === "string" ? node.attrs.alt : "";
    image.title = typeof node.attrs.title === "string" ? node.attrs.title : "";
    image.draggable = false;
    image.decoding = "async";
    image.addEventListener("error", () => {
      if (currentSrc !== safeSrc) return;
      currentSrc = "";
      dom.className = "schematic-markdown-image-literal";
      dom.dataset.type = "unsupported-image";
      dom.textContent = markdownImageLiteral(node.attrs);
    }, { once: true });
    dom.className = "schematic-markdown-image-host";
    dom.dataset.type = "base64-image";
    dom.replaceChildren(image);
  };
  sync();

  return {
    dom,
    update(nextNode: any) {
      if (nextNode.type !== node.type) return false;
      node = nextNode;
      sync();
      return true;
    },
    ignoreMutation: () => true
  };
});

const taskListItemView = $view(listItemSchema.node, () => (initialNode: any) => {
  let node = initialNode;
  const dom = document.createElement("li");
  const checkbox = document.createElement("input");
  const contentDOM = document.createElement("div");
  checkbox.type = "checkbox";
  checkbox.disabled = true;
  checkbox.tabIndex = -1;
  checkbox.setAttribute("aria-label", "Task status");
  contentDOM.className = "schematic-markdown-list-item-content";
  dom.append(checkbox, contentDOM);

  const sync = () => {
    const task = node.attrs.checked !== null && node.attrs.checked !== undefined;
    dom.classList.toggle("schematic-markdown-task-item", task);
    checkbox.hidden = !task;
    checkbox.checked = Boolean(node.attrs.checked);
    if (task) dom.dataset.checked = String(Boolean(node.attrs.checked));
    else dom.removeAttribute("data-checked");
  };
  sync();

  return {
    dom,
    contentDOM,
    update(nextNode: any) {
      if (nextNode.type !== node.type) return false;
      node = nextNode;
      sync();
      return true;
    },
    ignoreMutation(mutation: { target: Node }) {
      return mutation.target === checkbox;
    }
  };
});

const mathPlugins = [
  remarkMathPlugin,
  mathInlineSchema,
  mathBlockSchema,
  inlineMathInputRule,
  blockMathKeymap,
  gapCursorPlugin,
  inlineMathView,
  blockMathView
].flat();

function normalizeMarkdown(value: string) {
  return value.replace(/\r\n?/g, "\n");
}

export class MarkdownNoteRuntime {
  private editor: Editor | null = null;
  private editable: boolean;
  private markdown: string;
  private readonly resizeObserver: ResizeObserver | null;
  private readonly lifecycleController = new AbortController();
  private readonly runtimeKey = `markdown-runtime-${nextMarkdownRuntimeKey++}`;
  private destroyed = false;
  private editorCreationPending = false;
  private destroyPromise: Promise<void> | null = null;

  private constructor(private readonly options: MarkdownNoteRuntimeOptions) {
    this.editable = options.editable;
    this.markdown = normalizeMarkdown(options.markdown);
    markdownRuntimeSignals.set(this.runtimeKey, this.lifecycleController.signal);
    this.resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => this.reportSize());
    this.resizeObserver?.observe(options.host);
    options.host.addEventListener("click", this.handleLinkClick, true);
    options.host.addEventListener("keydown", this.handleFormattingShortcut, true);
    if (options.signal?.aborted) {
      void this.destroy();
    } else {
      options.signal?.addEventListener("abort", this.handleAbort, { once: true });
    }
  }

  static async create(options: MarkdownNoteRuntimeOptions) {
    const runtime = new MarkdownNoteRuntime(options);
    try {
      await runtime.mount();
      return runtime;
    } catch (error) {
      try {
        await runtime.destroy();
      } catch {
        // Preserve the mount failure that explains why the runtime could not start.
      }
      throw error;
    }
  }

  get isEditable() {
    return this.editable;
  }

  read() {
    if (this.editor) {
      this.markdown = normalizeMarkdown(this.editor.action(getMarkdown()));
      return this.markdown;
    }
    return this.markdown;
  }

  flushTransientEdits() {
    flushFormulaDrafts(this.runtimeKey);
  }

  setEditable(editable: boolean) {
    if (this.editable && !editable) flushFormulaDrafts(this.runtimeKey);
    this.editable = editable;
    const view = this.editor?.ctx.get(editorViewCtx);
    view?.setProps({ editable: () => editable });
    this.options.host.classList.toggle("is-markdown-editable", editable);
  }

  setMarkdown(markdown: string) {
    const next = normalizeMarkdown(markdown);
    if (next === this.read()) return;
    this.markdown = next;
    if (this.editor) this.editor.action(replaceAll(next, true));
    this.reportSize();
  }

  focus() {
    if (!this.editor) return;
    const activeMathSource = this.options.host.querySelector<HTMLElement>(
      ".schematic-markdown-math.is-source-editing [data-math-source-editor]"
    );
    if (activeMathSource) {
      activeMathSource.focus({ preventScroll: true });
      return;
    }
    const view = this.editor.ctx.get(editorViewCtx);
    const selection = TextSelection.atEnd(view.state.doc);
    view.dispatch(view.state.tr.setSelection(selection));
    view.focus();
  }

  insertText(text: string) {
    if (!text || !this.editor || !this.editable || this.destroyed) return false;
    const view = this.editor.ctx.get(editorViewCtx);
    view.dispatch(view.state.tr.insertText(text));
    view.focus();
    return true;
  }

  cloneStaticContent(options: { inlineStyles?: boolean } = {}) {
    if (this.destroyed) return null;
    flushFormulaDrafts(this.runtimeKey);
    const content = this.options.host.querySelector<HTMLElement>(".milkdown");
    if (!content) return null;
    const clone = content.cloneNode(true) as HTMLElement;
    if (options.inlineStyles) inlineComputedStyles(content, clone);
    clone.querySelectorAll("[contenteditable], [tabindex]").forEach((element) => {
      element.removeAttribute("contenteditable");
      element.removeAttribute("tabindex");
    });
    clone.querySelectorAll("[data-math-source-host], [data-math-source-editor], .cm-editor").forEach((element) => element.remove());
    clone.querySelectorAll(".ProseMirror-separator, .ProseMirror-trailingBreak, .ProseMirror-gapcursor").forEach((element) => element.remove());
    clone.querySelectorAll(".is-source-editing").forEach((element) => element.classList.remove("is-source-editing"));
    clone.querySelectorAll(".ProseMirror-focused, .ProseMirror-selectednode").forEach((element) => {
      element.classList.remove("ProseMirror-focused", "ProseMirror-selectednode");
    });
    clone.querySelectorAll("[draggable]").forEach((element) => element.removeAttribute("draggable"));
    clone.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((anchor) => {
      const href = safeMarkdownNoteHref(anchor.getAttribute("href") ?? "");
      if (href) {
        anchor.href = href;
        anchor.rel = "noopener noreferrer";
      } else {
        anchor.removeAttribute("href");
      }
      if (options.inlineStyles) anchor.removeAttribute("href");
    });
    return clone;
  }

  staticTextContent() {
    if (this.destroyed) return this.markdown;
    flushFormulaDrafts(this.runtimeKey);
    const content = this.options.host.querySelector<HTMLElement>(".milkdown");
    return content ? markdownStaticText(content, this.markdown) : this.markdown;
  }

  staticTextStyle() {
    if (this.destroyed) return {};
    const content = this.options.host.querySelector<HTMLElement>(".milkdown");
    return content ? markdownUniformTextStyle(content) : {};
  }

  async waitForRendering(timeoutMs = 3500) {
    const deadline = performance.now() + timeoutMs;
    while (
      !this.destroyed
      && this.options.host.querySelector('[data-math-render-state="pending"]')
      && performance.now() < deadline
    ) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 25));
    }
    if (this.destroyed) return;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }

  destroy() {
    if (this.destroyPromise) return this.destroyPromise;
    flushFormulaDrafts(this.runtimeKey);
    this.destroyed = true;
    this.destroyPromise = this.destroyRuntime();
    return this.destroyPromise;
  }

  private async destroyRuntime() {
    this.options.signal?.removeEventListener("abort", this.handleAbort);
    this.lifecycleController.abort();
    this.resizeObserver?.disconnect();
    this.options.host.removeEventListener("click", this.handleLinkClick, true);
    this.options.host.removeEventListener("keydown", this.handleFormattingShortcut, true);
    await this.editor?.destroy(true);
    this.editor = null;
    if (!this.editorCreationPending) this.releaseRuntimeSignal();
  }

  private async mount() {
    if (this.destroyed) return;
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, this.options.host);
        ctx.set(rootAttrsCtx, {
          "data-markdown-note-runtime": this.options.noteId,
          "data-markdown-note-runtime-key": this.runtimeKey
        });
        ctx.set(defaultValueCtx, this.markdown);
        ctx.set(editorViewOptionsCtx, {
          editable: () => this.editable,
          attributes: {
            "aria-label": "Schematic Markdown note",
            "data-note-editor": "",
            "data-markdown-note-runtime-key": this.runtimeKey
          }
        });
        ctx.get(listenerCtx).markdownUpdated((_listenerCtx, markdown) => {
          if (this.destroyed) return;
          this.markdown = normalizeMarkdown(markdown);
          this.options.onChange(this.markdown);
          this.reportSize();
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(mathPlugins)
      .use(imageView)
      .use(taskListItemView)
      .use(history)
      .use(listener);

    this.editorCreationPending = true;
    try {
      await editor.create();
    } catch (error) {
      try {
        await editor.destroy(true);
      } catch {
        // The create failure remains the useful error for the caller.
      }
      throw error;
    } finally {
      this.editorCreationPending = false;
      if (this.destroyed) this.releaseRuntimeSignal();
    }
    if (this.destroyed) {
      await editor.destroy(true);
      return;
    }
    this.editor = editor;
    this.options.host.classList.toggle("is-markdown-editable", this.editable);
    this.reportSize();
  }

  private readonly handleAbort = () => {
    void this.destroy().catch(() => {});
  };

  private releaseRuntimeSignal() {
    if (markdownRuntimeSignals.get(this.runtimeKey) === this.lifecycleController.signal) {
      markdownRuntimeSignals.delete(this.runtimeKey);
    }
  }

  private readonly handleLinkClick = (event: MouseEvent) => {
    const anchor = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]");
    if (!anchor || !this.options.host.contains(anchor)) return;
    event.preventDefault();
    if (!(event.ctrlKey || event.metaKey)) return;
    const href = safeMarkdownNoteHref(anchor.getAttribute("href") ?? "");
    if (!href) return;
    event.stopPropagation();
    window.open(href, "_blank", "noopener,noreferrer");
  };

  private readonly handleFormattingShortcut = (event: KeyboardEvent) => {
    if (!this.editable || !(event.ctrlKey || event.metaKey) || event.altKey) return;
    const target = event.target as HTMLElement | null;
    if (!target?.closest(".ProseMirror") || target.closest("[data-math-source-editor]")) return;
    const markName = event.key.toLowerCase() === "b"
      ? "strong"
      : event.key.toLowerCase() === "i"
        ? "emphasis"
        : null;
    if (!markName || !this.editor) return;
    const view = this.editor.ctx.get(editorViewCtx);
    const domSelection = view.dom.ownerDocument.getSelection();
    if (domSelection?.anchorNode && domSelection.focusNode && view.dom.contains(domSelection.anchorNode) && view.dom.contains(domSelection.focusNode)) {
      try {
        const anchor = view.posAtDOM(domSelection.anchorNode, domSelection.anchorOffset);
        const head = view.posAtDOM(domSelection.focusNode, domSelection.focusOffset);
        const selection = TextSelection.create(view.state.doc, anchor, head);
        if (!selection.eq(view.state.selection)) view.dispatch(view.state.tr.setSelection(selection));
      } catch {
        // ProseMirror will retain its current selection if the browser selection cannot be mapped.
      }
    }
    const markType = view.state.schema.marks[markName];
    if (!markType) return;
    const handled = toggleMark(markType)(view.state, (transaction) => view.dispatch(transaction), view);
    if (!handled) return;
    event.preventDefault();
    event.stopPropagation();
  };

  private reportSize() {
    requestAnimationFrame(() => {
      if (this.destroyed) return;
      this.options.onResize(this.options.host.scrollHeight);
    });
  }
}

const EXPORTED_STYLE_PROPERTIES = [
  "display", "box-sizing", "color", "background-color", "font-family", "font-size", "font-style", "font-weight",
  "line-height", "white-space", "overflow-wrap", "word-break", "text-align", "text-decoration", "vertical-align",
  "margin-top", "margin-right", "margin-bottom", "margin-left", "padding-top", "padding-right", "padding-bottom",
  "padding-left", "border-top", "border-right", "border-bottom", "border-left", "border-collapse", "border-spacing",
  "list-style-type", "list-style-position", "max-width", "overflow-x"
] as const;

function inlineComputedStyles(sourceRoot: Element, cloneRoot: Element) {
  const sources = [sourceRoot, ...Array.from(sourceRoot.querySelectorAll("*"))];
  const clones = [cloneRoot, ...Array.from(cloneRoot.querySelectorAll("*"))];
  sources.forEach((source, index) => {
    const clone = clones[index] as HTMLElement | SVGElement | undefined;
    if (!clone?.style) return;
    const computed = getComputedStyle(source);
    EXPORTED_STYLE_PROPERTIES.forEach((property) => {
      const value = computed.getPropertyValue(property);
      if (value) clone.style.setProperty(property, value);
    });
  });
}

const MARKDOWN_TEXT_BLOCK_TAGS = new Set([
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DIV", "FIGCAPTION", "FIGURE", "FOOTER", "H1", "H2", "H3",
  "H4", "H5", "H6", "HEADER", "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "TABLE", "TR", "UL"
]);

function markdownStaticText(root: Element, fallback: string) {
  let output = "";
  const append = (value: string) => {
    output += value;
  };
  const newline = () => {
    if (output && !output.endsWith("\n")) output += "\n";
  };
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      append(node.textContent ?? "");
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.matches("[data-math-source-host], [data-math-source-editor], .cm-editor, script, style")) return;
    if (node.classList.contains("schematic-markdown-math")) {
      const rendered = node.querySelector<HTMLElement>(".schematic-markdown-math-rendered");
      const tex = rendered?.dataset.tex ?? "";
      append(node.classList.contains("is-block") ? `$$${tex}$$` : `$${tex}$`);
      if (node.classList.contains("is-block")) newline();
      return;
    }
    if (node.tagName === "BR") {
      newline();
      return;
    }
    if (node instanceof HTMLInputElement && node.type === "checkbox") {
      append(node.checked ? "[x] " : "[ ] ");
      return;
    }
    if (node instanceof HTMLImageElement) {
      append(node.alt || "[image]");
      return;
    }
    if (node.tagName === "LI") append("- ");
    node.childNodes.forEach(visit);
    if (node.tagName === "TD" || node.tagName === "TH") append("\t");
    if (MARKDOWN_TEXT_BLOCK_TAGS.has(node.tagName)) newline();
  };

  visit(root);
  const normalized = output
    .replace(/\u00a0/g, " ")
    .split("\n")
    .map((line) => line.replace(/[\t ]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return normalized || fallback;
}

function markdownUniformTextStyle(root: Element) {
  let hasText = false;
  let allBold = true;
  let allItalic = true;
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      if (!node.textContent?.trim()) return;
      const parent = node.parentElement;
      if (!parent || parent.closest("[data-math-source-host], [data-math-source-editor], .cm-editor, .schematic-markdown-math, script, style")) return;
      const style = getComputedStyle(parent);
      const numericWeight = Number.parseInt(style.fontWeight, 10);
      hasText = true;
      allBold &&= style.fontWeight === "bold" || Number.isFinite(numericWeight) && numericWeight >= 600;
      allItalic &&= style.fontStyle === "italic" || style.fontStyle === "oblique";
      return;
    }
    if (!(node instanceof Element)) return;
    if (node.matches("[data-math-source-host], [data-math-source-editor], .cm-editor, .schematic-markdown-math, script, style")) return;
    node.childNodes.forEach(visit);
  };

  visit(root);
  return {
    fontWeight: hasText && allBold ? 700 : undefined,
    fontStyle: hasText && allItalic ? "italic" as const : undefined
  };
}
