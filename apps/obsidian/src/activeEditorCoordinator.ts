import { Notice } from "obsidian";
import { isolateHistory, redo, redoDepth, undo, undoDepth } from "@codemirror/commands";
import { Transaction } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import {
  createSchematicEditor,
  type SchematicEditorHandle,
  type SchematicEditorHostBridge,
  type SchematicEditorRuntimeServices
} from "@edahelper/schematic/editor";
import {
  parseSchematicContent,
  serializeSchematicContent,
  type SchematicContent
} from "@edahelper/schematic/core";
import {
  canonicalFenceBody,
  minimalFenceBodyChange,
  type SchematicFenceSourceMap
} from "./fence";
import { showSchematicExportMenu } from "./exports";
import {
  schematicBlockSessionsShareRuntime,
  schematicTransactionAnnotation,
  type SchematicBlockSession
} from "./sessionField";
import { suppressSchematicHoverLabels } from "./hoverLabelSuppression";
import { renderSchematicBlockSvg, SCHEMATIC_HEIGHT_LIMIT_PROPERTY, updateSchematicBlockHeight } from "./blockSizing";

interface ActiveSession {
  session: SchematicBlockSessionAccessor;
  root: HTMLElement;
  widgetRoot: HTMLElement;
  view: EditorView;
  editor: SchematicEditorHandle;
  pendingCommit: {
    revision: number;
    canonical: string;
    map: SchematicFenceSourceMap;
  } | null;
  focusRestore: {
    target: HTMLElement;
    token: object;
  } | null;
  commitBlocked: boolean;
  menu: { hide(): unknown } | null;
  menuOpen: boolean;
  freezing: boolean;
  hoverLabelCleanup: (() => void) | null;
  heightFitFrame: number | null;
}

const AUTO_ACTIVATION_TIMEOUT_MS = 10_000;
const WIDGET_HANDOFF_GRACE_MS = 50;

type SchematicBlockSessionSource = SchematicBlockSession | (() => SchematicBlockSession);
type SchematicBlockSessionAccessor = () => SchematicBlockSession;

interface PendingWidgetDisposal {
  root: HTMLElement;
  timer: number;
}

export interface SchematicCoordinatorDependencies {
  createEditor?: typeof createSchematicEditor;
  showExportMenu?: typeof showSchematicExportMenu;
}

export class SchematicActiveEditorCoordinator {
  private active: ActiveSession | null = null;
  private readonly widgetByRoot = new WeakMap<HTMLElement, {
    session: SchematicBlockSessionAccessor;
    view: EditorView;
  }>();
  private readonly pendingWidgetDisposalByRoot = new WeakMap<HTMLElement, PendingWidgetDisposal>();
  private fallbackId = 1;
  private pasteRequestId = 0;
  private pendingAutoActivation: { from: number; to: number; timer: number } | null = null;

  private readonly createEditor: typeof createSchematicEditor;
  private readonly showExportMenu: typeof showSchematicExportMenu;

  constructor(
    readonly ownerWindow: Window & typeof globalThis,
    dependencies: SchematicCoordinatorDependencies = {}
  ) {
    this.createEditor = dependencies.createEditor ?? createSchematicEditor;
    this.showExportMenu = dependencies.showExportMenu ?? showSchematicExportMenu;
  }

  isActiveSession(id: string, root?: HTMLElement) {
    return this.active?.session().id === id && (!root || this.active.widgetRoot === root);
  }

  mountWidget(root: HTMLElement, sessionSource: SchematicBlockSessionSource, view: EditorView) {
    const session = sessionAccessor(sessionSource);
    this.cancelPendingWidgetDisposal(root);
    this.widgetByRoot.set(root, { session, view });
    const handedOff = this.tryHandoffActiveWidget(root, session, view);
    if (!handedOff) this.renderStatic(root, session());
    root.addEventListener("blur", (event) => {
      const active = this.active;
      const target = event.target;
      if (!active || active.focusRestore?.target !== target
        || !(target instanceof this.ownerWindow.HTMLElement)
        || !target.matches("[data-note-editor]")
        || !active.root.contains(target)) return;
      const next = event.relatedTarget instanceof this.ownerWindow.Element ? event.relatedTarget : null;
      if (isMeaningfulExternalFocus(next, active)) return;
      // A host redraw can focus CodeMirror before our queued focus restoration.
      // Keep the Note editor mounted during that transient blur.
      event.stopPropagation();
    }, true);
    root.addEventListener("pointerdown", (event) => {
      if (!this.isActiveSession(session().id, root)) return;
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const paper = target.closest("[data-schematic-paper]");
      if (event.button === 0 && paper && root.contains(paper)) {
        this.active?.root.classList.remove("is-property-open");
      }
      if (isEditableWithin(target, root)) return;
      this.active?.root.focus({ preventScroll: true });
    }, true);
    root.addEventListener("click", (event) => {
      const current = this.widgetByRoot.get(root);
      if (!current || this.isActiveSession(current.session().id, root)) return;
      if (!(event instanceof this.ownerWindow.MouseEvent) || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      this.activate(root, current.session, current.view);
    });
    root.addEventListener("contextmenu", (event) => {
      const current = this.widgetByRoot.get(root);
      if (!current) return;
      if (this.isActiveSession(current.session().id, root)) return;
      event.preventDefault();
      event.stopPropagation();
      const target = event.target as Element | null;
      const blank = !target?.closest("[data-component-id], [data-wire-id], [data-note-id], [data-net-label-id]");
      this.showStaticMenu(current.session(), event.clientX, event.clientY, root.ownerDocument, blank ? () => {
        if (!root.isConnected || this.widgetByRoot.get(root) !== current) return;
        this.activate(root, current.session, current.view);
        const active = this.active;
        if (active && active.widgetRoot === root) void this.pasteFromClipboard(active);
      } : undefined);
    });
    if (
      this.pendingAutoActivation
      && session().from < this.pendingAutoActivation.to
      && this.pendingAutoActivation.from < session().to
    ) {
      this.clearPendingAutoActivation();
      this.ownerWindow.queueMicrotask(() => {
        if (root.isConnected && !this.active) this.activate(root, session, view);
      });
    }
  }

  updateWidget(root: HTMLElement, sessionSource: SchematicBlockSessionSource, view: EditorView) {
    const session = sessionAccessor(sessionSource);
    const currentSession = session();
    const previous = this.widgetByRoot.get(root)?.session();
    this.cancelPendingWidgetDisposal(root);
    this.widgetByRoot.set(root, { session, view });
    const active = this.active;
    if (!active || active.widgetRoot !== root || active.session().id !== currentSession.id) {
      if (previous && hasSameStaticProjection(previous, currentSession)) return;
      this.renderStatic(root, currentSession);
      return;
    }
    this.applyActiveSessionUpdate(active, session, view);
  }

  disposeWidget(root: HTMLElement, sessionId: string) {
    this.widgetByRoot.delete(root);
    if (!this.isActiveSession(sessionId, root)) return;
    this.cancelPendingWidgetDisposal(root);
    if (this.active) this.captureFocusForRestore(this.active);
    const disposal = {
      root,
      timer: 0
    } satisfies PendingWidgetDisposal;
    this.pendingWidgetDisposalByRoot.set(root, disposal);
    disposal.timer = this.ownerWindow.setTimeout(() => {
      if (this.pendingWidgetDisposalByRoot.get(root) !== disposal) return;
      this.pendingWidgetDisposalByRoot.delete(root);
      if (this.widgetByRoot.has(root)) return;
      if (this.isActiveSession(sessionId, root)) this.freeze("widget-destroy");
    }, WIDGET_HANDOFF_GRACE_MS);
  }

  freeze(reason = "host-freeze") {
    if (reason === "active-leaf-change" || reason === "file-open" || reason === "coordinator-destroy") {
      this.clearPendingAutoActivation();
    }
    const active = this.active;
    if (!active || active.freezing) return;
    active.freezing = true;
    this.cancelPendingWidgetDisposal(active.widgetRoot);
    try {
      active.editor.flushTransientEdits(reason);
      active.editor.execute({ kind: "cancel" });
      active.menu?.hide();
    } finally {
      if (active.heightFitFrame !== null) this.ownerWindow.cancelAnimationFrame(active.heightFitFrame);
      active.hoverLabelCleanup?.();
      active.hoverLabelCleanup = null;
      this.removeActiveListeners();
      this.active = null;
      active.root.classList.remove("is-active", "is-search-open", "is-property-open");
      if (active.widgetRoot !== active.root) active.widgetRoot.classList.remove("is-active");
      void active.editor.destroy();
      this.renderStatic(active.widgetRoot, active.session());
    }
  }

  destroy() {
    this.clearPendingAutoActivation();
    this.freeze("coordinator-destroy");
  }

  queueAutoActivation(from: number, to: number) {
    this.clearPendingAutoActivation();
    const timer = this.ownerWindow.setTimeout(() => {
      this.pendingAutoActivation = null;
    }, AUTO_ACTIVATION_TIMEOUT_MS);
    this.pendingAutoActivation = { from, to, timer };
  }

  auditActiveRoot() {
    const active = this.active;
    if (!active || (active.root.isConnected && active.widgetRoot.isConnected)) return;
    if (this.pendingWidgetDisposalByRoot.has(active.widgetRoot)) return;
    this.freeze("detached-root");
  }

  togglePropertyDrawer() {
    const active = this.active;
    if (!active) return false;
    const open = !active.root.classList.contains("is-property-open");
    active.root.classList.toggle("is-property-open", open);
    active.root.classList.remove("is-search-open");
    return true;
  }

  showActiveExportMenu() {
    const active = this.active;
    if (!active) return false;
    const bounds = active.widgetRoot.getBoundingClientRect();
    active.menu = this.showExportMenu(
      {
        content: active.editor.getContent(),
        editor: active.editor,
        namespace: active.session().id
      },
      { x: bounds.left + Math.min(40, bounds.width / 2), y: bounds.top + Math.min(40, bounds.height / 2) },
      active.root.ownerDocument,
      (visible) => {
        active.menuOpen = visible;
        if (!visible) active.menu = null;
      }
    );
    return true;
  }

  activeEditor() {
    return this.active?.editor ?? null;
  }

  activeRoot() {
    return this.active?.widgetRoot ?? null;
  }

  private activate(root: HTMLElement, session: SchematicBlockSessionAccessor, view: EditorView) {
    const currentSession = session();
    if (currentSession.projection.kind !== "schematic") return;
    this.freeze("activate-other-block");
    root.classList.add("is-active");
    const provisional: ActiveSession = {
      session,
      root,
      widgetRoot: root,
      view,
      editor: null as unknown as SchematicEditorHandle,
      pendingCommit: null,
      focusRestore: null,
      commitBlocked: false,
      menu: null,
      menuOpen: false,
      freezing: false,
      hoverLabelCleanup: null,
      heightFitFrame: null
    };
    this.active = provisional;
    this.installActiveListeners();
    const runtime = this.runtimeServices(root.ownerDocument);
    const bridge = this.hostBridge(provisional);
    const editor = this.createEditor({
      root,
      content: currentSession.projection.content,
      revision: currentSession.revision,
      origin: "markdown",
      host: { ...runtime, ...bridge }
    });
    provisional.editor = editor;
    provisional.hoverLabelCleanup = suppressSchematicHoverLabels(root);
    editor.fit();
    editor.focus();
  }

  private applyActiveSessionUpdate(
    active: ActiveSession,
    session: SchematicBlockSessionAccessor,
    view: EditorView
  ) {
    const currentSession = session();
    const acceptedSession = active.session();
    const pendingCommit = active.pendingCommit;
    if (pendingCommit && currentSession.revision < pendingCommit.revision) return;
    if (currentSession.revision < acceptedSession.revision) return;

    if (pendingCommit && currentSession.revision === pendingCommit.revision) {
      if (
        currentSession.projection.kind !== "schematic"
        || currentSession.projection.canonical !== pendingCommit.canonical
      ) return;
      active.session = session;
      active.view = view;
      active.pendingCommit = null;
      return;
    }

    if (currentSession.revision === acceptedSession.revision) {
      if (hasSameStaticProjection(acceptedSession, currentSession)) {
        active.session = session;
        active.view = view;
      }
      return;
    }

    if (currentSession.projection.kind !== "schematic") {
      active.pendingCommit = null;
      active.commitBlocked = true;
      this.freeze("source-invalid");
      this.renderStatic(active.widgetRoot, currentSession);
      return;
    }

    active.session = session;
    active.view = view;
    active.pendingCommit = null;
    const current = serializeSchematicContent(active.editor.getContent());
    if (current !== currentSession.projection.canonical) {
      active.editor.replaceContent(currentSession.projection.content, {
        origin: "source",
        reason: "markdown-change",
        revision: currentSession.revision,
        commit: false
      });
    }
    this.updateActiveBlockHeight(active, currentSession.projection.content);
  }

  private tryHandoffActiveWidget(
    widgetRoot: HTMLElement,
    session: SchematicBlockSessionAccessor,
    view: EditorView
  ) {
    const active = this.active;
    if (
      !active
      || active.widgetRoot === widgetRoot
      || !schematicBlockSessionsShareRuntime(active.session(), session())
    ) return false;

    this.cancelPendingWidgetDisposal(active.widgetRoot);
    const heightLimit = active.widgetRoot.style.getPropertyValue(SCHEMATIC_HEIGHT_LIMIT_PROPERTY);
    if (heightLimit) widgetRoot.style.setProperty(SCHEMATIC_HEIGHT_LIMIT_PROPERTY, heightLimit);
    const editorRoot = active.root;
    if (editorRoot === active.widgetRoot) {
      editorRoot.classList.remove("schematic-editor-block");
      editorRoot.style.removeProperty(SCHEMATIC_HEIGHT_LIMIT_PROPERTY);
      delete editorRoot.dataset.schematicSession;
      editorRoot.style.width = "100%";
      editorRoot.style.height = "100%";
    }
    widgetRoot.className = "schematic-editor-block is-active";
    widgetRoot.dataset.schematicSession = session().id;
    widgetRoot.replaceChildren(editorRoot);
    active.widgetRoot = widgetRoot;
    active.view = view;
    this.applyActiveSessionUpdate(active, session, view);
    this.scheduleFocusRestore(active);
    return true;
  }

  private cancelPendingWidgetDisposal(root: HTMLElement) {
    const disposal = this.pendingWidgetDisposalByRoot.get(root);
    if (!disposal) return;
    this.ownerWindow.clearTimeout(disposal.timer);
    this.pendingWidgetDisposalByRoot.delete(root);
  }

  private runtimeServices(ownerDocument: Document): SchematicEditorRuntimeServices {
    const ownerWindow = ownerDocument.defaultView as Window & typeof globalThis;
    return {
      ownerDocument,
      ownerWindow,
      idFactory: () => ownerWindow.crypto?.randomUUID?.() ?? `schematic-${this.fallbackId++}`,
      createAbortController: () => new ownerWindow.AbortController(),
      requestAnimationFrame: (callback) => ownerWindow.requestAnimationFrame(callback),
      cancelAnimationFrame: (handle) => ownerWindow.cancelAnimationFrame(handle),
      setTimeout: (callback, delayMs) => ownerWindow.setTimeout(callback, delayMs),
      clearTimeout: (handle) => ownerWindow.clearTimeout(handle)
    };
  }

  private hostBridge(active: ActiveSession): SchematicEditorHostBridge {
    return {
      commit: (content, metadata) => {
        const session = active.session();
        if (
          this.active !== active
          || active.commitBlocked
          || session.projection.kind !== "schematic"
        ) return false;
        const previousPendingCommit = active.pendingCommit;
        const previousFocusRestore = active.focusRestore;
        const baseMap = previousPendingCommit?.map ?? session.projection.map;
        const change = minimalFenceBodyChange(content, baseMap);
        if (!change) return true;
        const canonical = serializeSchematicContent(content);
        this.captureFocusForRestore(active);
        active.pendingCommit = {
          revision: metadata.revision,
          canonical,
          map: projectFenceMapAfterCommit(baseMap, content, canonical)
        };
        try {
          active.view.dispatch({
            changes: change,
            annotations: [
              Transaction.addToHistory.of(true),
              isolateHistory.of("full") as never,
              schematicTransactionAnnotation.of({
                sessionId: session.id,
                origin: metadata.origin,
                revision: metadata.revision
              })
            ]
          });
        } catch (error) {
          active.pendingCommit = previousPendingCommit;
          active.focusRestore = previousFocusRestore;
          throw error;
        }
        this.scheduleFocusRestore(active);
        this.updateActiveBlockHeight(active, content);
        return true;
      },
      undo: () => {
        undo(active.view as never);
        return null;
      },
      redo: () => {
        redo(active.view as never);
        return null;
      },
      canUndo: () => undoDepth(active.view.state as never) > 0,
      canRedo: () => redoDepth(active.view.state as never) > 0,
      onViewChange() {},
      ownsKeyboardTarget: (target) => (
        this.active === active
        && active.root.contains(target as Node)
      ),
      closeInstanceSearchAfterActivation: true,
      onInstanceSearchVisibilityChange: (open) => {
        active.root.classList.toggle("is-search-open", open);
        if (open) active.root.classList.remove("is-property-open");
      },
      contextMenu: {
        get hidden() {
          return !active.menuOpen;
        },
        containsTarget: () => false,
        show: (x, y, scope = "selection") => {
          active.menu = this.showExportMenu(
            {
              content: active.editor.getContent(),
              ...(scope === "blank"
                ? { onPaste: () => { void this.pasteFromClipboard(active); } }
                : { editor: active.editor }),
              namespace: active.session().id
            },
            { x, y },
            active.root.ownerDocument,
            (visible) => {
              active.menuOpen = visible;
              if (!visible) active.menu = null;
            }
          );
        },
        close: () => active.menu?.hide()
      }
    };
  }

  private installActiveListeners() {
    this.ownerWindow.addEventListener("keydown", this.handleActiveKeydown, true);
    this.ownerWindow.document.addEventListener("pointerdown", this.handleOutsidePointerDown, true);
  }

  private removeActiveListeners() {
    this.ownerWindow.removeEventListener("keydown", this.handleActiveKeydown, true);
    this.ownerWindow.document.removeEventListener("pointerdown", this.handleOutsidePointerDown, true);
  }

  private captureFocusForRestore(active: ActiveSession) {
    const focused = active.root.ownerDocument.activeElement;
    if (focused instanceof this.ownerWindow.HTMLElement && active.root.contains(focused)) {
      active.focusRestore = { target: focused, token: {} };
      return;
    }
    if (isMeaningfulExternalFocus(focused, active)) active.focusRestore = null;
  }

  private scheduleFocusRestore(active: ActiveSession) {
    const pending = active.focusRestore;
    if (!pending) return;
    this.ownerWindow.queueMicrotask(() => {
      if (this.active !== active || active.focusRestore?.token !== pending.token) return;
      const { target } = pending;
      const focused = active.root.ownerDocument.activeElement;
      if (focused !== target && focused && active.root.contains(focused)) {
        active.focusRestore = null;
        return;
      }
      if (isMeaningfulExternalFocus(focused, active) && !active.root.contains(focused)) {
        active.focusRestore = null;
        return;
      }
      if (!active.root.contains(target)) {
        active.focusRestore = null;
        return;
      }
      if (!target.isConnected) return;
      target.focus({ preventScroll: true });
      if (active.focusRestore?.token === pending.token) active.focusRestore = null;
    });
  }

  private readonly handleActiveKeydown = (event: KeyboardEvent) => {
    const active = this.active;
    const target = event.target as HTMLElement | null;
    if (!active || !target || !active.root.contains(target)) return;
    const key = event.key.toLowerCase();
    if (key === "escape" && active.root.classList.contains("is-property-open")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      active.root.classList.remove("is-property-open");
      active.editor.focus();
      return;
    }
    if (key === "escape" && active.root.classList.contains("is-search-open")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      active.root.classList.remove("is-search-open");
      active.editor.execute({ kind: "cancel" });
      return;
    }
    if (isEditableWithin(target, active.root)) return;
    if (key === "q" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const open = !active.root.classList.contains("is-property-open");
      active.root.classList.toggle("is-property-open", open);
      active.root.classList.remove("is-search-open");
      return;
    }
    if (key === "i" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      active.root.classList.remove("is-property-open");
      active.root.classList.add("is-search-open");
      return;
    }
  };

  private readonly handleOutsidePointerDown = (event: PointerEvent) => {
    const active = this.active;
    const target = event.target as Element | null;
    if (
      !active
      || event.button !== 0
      || !target
      || active.widgetRoot.contains(target)
      || isHostOverlay(target)
      || !active.view.contentDOM.contains(target)
    ) return;
    this.freeze("outside-click");
  };

  private showStaticMenu(session: SchematicBlockSession, x: number, y: number, ownerDocument: Document, onPaste?: () => void) {
    if (session.projection.kind !== "schematic") return;
    this.showExportMenu(
      {
        content: session.projection.content,
        namespace: session.id,
        onPaste
      },
      { x, y },
      ownerDocument
    );
  }

  private async pasteFromClipboard(active: ActiveSession) {
    if (this.active !== active || active.commitBlocked || !active.root.isConnected) return;
    const requestId = ++this.pasteRequestId;
    const isCurrent = () => this.active === active
      && requestId === this.pasteRequestId
      && !active.commitBlocked
      && active.root.isConnected;
    try {
      const clipboard = active.root.ownerDocument.defaultView?.navigator.clipboard;
      if (!clipboard?.readText) throw new Error("Text clipboard is not available.");
      const text = await clipboard.readText();
      if (!isCurrent()) return;
      if (!text.trim()) throw new Error("The clipboard does not contain schematic JSON.");
      const content = parseSchematicContent(text);
      if (!active.editor.execute({ kind: "paste", content })) {
        new Notice("The clipboard schematic does not contain copyable objects.");
      }
    } catch (error) {
      if (!isCurrent()) return;
      new Notice(error instanceof Error
        ? "Could not paste schematic JSON from clipboard: " + error.message
        : "Could not paste schematic JSON from clipboard.");
    }
  }

  private updateActiveBlockHeight(active: ActiveSession, content: SchematicContent) {
    const rendering = renderSchematicBlockSvg(content, `${active.session().id}-bounds`);
    if (!updateSchematicBlockHeight(active.widgetRoot, rendering) || active.heightFitFrame !== null) return;
    // A host commit runs before the editor finishes accepting its new document.
    // Fit on the next frame, after both content and container height have settled.
    active.heightFitFrame = this.ownerWindow.requestAnimationFrame(() => {
      active.heightFitFrame = null;
      if (this.active === active && !active.freezing) active.editor.fit();
    });
  }

  private renderStatic(root: HTMLElement, session: SchematicBlockSession) {
    root.className = "schematic-editor-block";
    root.dataset.schematicSession = session.id;
    root.replaceChildren();
    if (session.projection.kind === "diagnostic") {
      updateSchematicBlockHeight(root, null);
      const diagnostic = root.ownerDocument.createElement("div");
      diagnostic.className = "schematic-editor-diagnostic";
      diagnostic.textContent = session.projection.message;
      root.appendChild(diagnostic);
      return;
    }
    const container = root.ownerDocument.createElement("div");
    container.className = "schematic-static-svg";
    const rendering = renderSchematicBlockSvg(session.projection.content, `${session.id}-static`);
    updateSchematicBlockHeight(root, rendering);
    container.innerHTML = rendering.svg;
    root.appendChild(container);
  }

  private clearPendingAutoActivation() {
    if (!this.pendingAutoActivation) return;
    this.ownerWindow.clearTimeout(this.pendingAutoActivation.timer);
    this.pendingAutoActivation = null;
  }
}

function isEditableWithin(target: Element, root: HTMLElement) {
  const editable = target.closest('input, textarea, select, [contenteditable="true"]');
  return !!editable && root.contains(editable);
}

function isHostOverlay(target: Element) {
  return !!target.closest(
    ".menu, .menu-container, .modal-container, .prompt, .suggestion-container, .popover"
  );
}

function isMeaningfulExternalFocus(focused: Element | null, active: ActiveSession) {
  if (!focused || !focused.isConnected) return false;
  const ownerDocument = active.root.ownerDocument;
  return focused !== ownerDocument.body
    && focused !== ownerDocument.documentElement
    && focused !== active.view.contentDOM
    && focused !== active.view.dom;
}

function hasSameStaticProjection(previous: SchematicBlockSession, next: SchematicBlockSession) {
  if (previous.id !== next.id || previous.projection.kind !== next.projection.kind) return false;
  if (previous.projection.kind === "schematic" && next.projection.kind === "schematic") {
    return previous.projection.canonical === next.projection.canonical;
  }
  return previous.projection.kind === "diagnostic"
    && next.projection.kind === "diagnostic"
    && previous.projection.message === next.projection.message;
}

function sessionAccessor(source: SchematicBlockSessionSource): SchematicBlockSessionAccessor {
  return typeof source === "function" ? source : () => source;
}

function projectFenceMapAfterCommit(
  map: SchematicFenceSourceMap,
  content: SchematicContent,
  canonical: string
): SchematicFenceSourceMap {
  const rawBody = canonicalFenceBody(content, map);
  const bodyLengthDelta = rawBody.length - map.rawBody.length;
  return {
    ...map,
    to: map.to + bodyLengthDelta,
    bodyTo: map.bodyFrom + rawBody.length,
    rawBody,
    logicalBody: canonical
  };
}
