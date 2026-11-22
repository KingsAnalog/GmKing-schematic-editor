import {
  createSchematicContentHistoryAdapter,
  type SchematicContentHistoryAdapter
} from "./document/contentHistoryAdapter";
import {
  contentFromDocument,
  createEmptySchematicDocument,
  isEmptySchematicDocument
} from "./document/documentModel";
import { SchematicEditor } from "./editor";
import type {
  SchematicEditorHandle,
  SchematicEditorCommand,
  SchematicEditorMutationOptions,
  SchematicEditorState,
  SchematicEditorStateListener
} from "./editorHandle";
import type {
  SchematicAnalysisControllerPort,
  SchematicContextMenuControllerPort,
  SchematicDocumentHostPort,
  SchematicEditorHostServices,
  SchematicHostedDocumentSession
} from "./schematicEditorHostPorts";
import type { SchematicEditorHostBridge } from "./schematicHostedEditor";
import type { SchematicEditorMountElements } from "./schematicTabShell";
import { bindSchematicWebOptions } from "./schematicWebOptions";
import type { SchematicContent } from "./types";
import { defaultSchematicView } from "./viewAdapter";
import type { SchematicDocumentState } from "../shared/workspaceState";
import { SchematicViewPersistenceController } from "./viewPersistenceController";

interface HostedEditorState {
  history: SchematicContentHistoryAdapter | null;
}

/** Composes one host-neutral editor with Web-owned document and Analysis services. */
export class SchematicWebEditorHostController implements SchematicEditorHandle {
  private readonly editor: SchematicEditor;
  private readonly analysis: SchematicAnalysisControllerPort;
  private readonly contextMenu: SchematicContextMenuControllerPort;
  private readonly documentHost: SchematicDocumentHostPort<HostedEditorState>;
  private readonly viewPersistence: SchematicViewPersistenceController;
  private readonly unbindOptions: () => void;
  private initialized = false;
  private destroyed = false;
  private destroyResult: Promise<void> | null = null;
  private readonly beforeUnload = (event: BeforeUnloadEvent) => {
    this.editor.flushTransientEdits("before-unload");
    this.viewPersistence.flush();
    if (this.documentHost.hasUnsavedChanges?.()) {
      event.preventDefault();
      event.returnValue = "";
    }
  };

  constructor(
    mounts: SchematicEditorMountElements,
    private readonly services: SchematicEditorHostServices
  ) {
    let editor!: SchematicEditor;
    let documentHost: SchematicDocumentHostPort<HostedEditorState> | null = null;
    this.viewPersistence = new SchematicViewPersistenceController({
      schedule: callback => services.requestAnimationFrame(callback),
      cancel: handle => services.cancelAnimationFrame(handle),
      write: (id, view) => services.workspace.persistView?.(id, view),
      onError: () => editor.hostSetStatus("View settings could not be saved. Your schematic content is unchanged.")
    });
    const analysisEl = mounts.analysisEl;
    if (!analysisEl) throw new Error("The schematic Web host requires an Analysis mount element.");

    const analysis = services.createAnalysisController(analysisEl, {
      getDocument: () => editor.hostDocument(),
      prepareNetPick: () => editor.hostPrepareAnalysisNetPick(),
      focusCanvas: () => editor.hostFocusCanvas(),
      setStatus: (message) => editor.hostSetStatus(message),
      persistWorkspaceState: () => {
        const session = documentHost?.activeSession();
        if (session) {
          const view = editor.hostCaptureView();
          this.viewPersistence.update(session.id, { zoom: view.zoom, viewTranslate: view.translate, presentationMode: view.presentationMode, analysisSelection: analysis.selection() });
        }
      }
    });
    const contextMenu = services.createContextMenuController({
      onPaste: () => documentHost?.pasteFromClipboard(),
      getExportInput: () => editor.hostPrepareSelectionExportInput(),
      getNetlistText: () => editor.hostPrepareSelectionNetlistText(),
      getJsonText: () => editor.hostPrepareSelectionJsonText(),
      setStatus: (message) => editor.hostSetStatus(message)
    });
    const bridge: SchematicEditorHostBridge = {
      analysis,
      contextMenu,
      commit: (content) => {
        const session = documentHost?.activeSession();
        if (!session) return true;
        session.editorState.history ??= createSchematicContentHistoryAdapter(content);
        session.editorState.history.push(content);
        void documentHost?.persistActive();
        return true;
      },
      saveState: () => documentHost?.activeSession()?.saveState ?? "saved",
      undo: () => {
        const content = documentHost?.activeSession()?.editorState.history?.undo() ?? null;
        if (content) services.ownerWindow.queueMicrotask(() => documentHost?.persistActive());
        return content;
      },
      redo: () => {
        const content = documentHost?.activeSession()?.editorState.history?.redo() ?? null;
        if (content) services.ownerWindow.queueMicrotask(() => documentHost?.persistActive());
        return content;
      },
      canUndo: () => documentHost?.activeSession()?.editorState.history?.canUndo ?? false,
      canRedo: () => documentHost?.activeSession()?.editorState.history?.canRedo ?? false,
      ownsKeyboardTarget: (target) => (
        mounts.shellEl.contains(target as Node)
        || (
          target === services.ownerDocument.body
          && mounts.shellEl.closest(".tab-panel")?.classList.contains("is-active") === true
        )
      ),
      onViewChange: view => {
        const session = documentHost?.activeSession();
        if (!session) return;
        const settings = { zoom: view.zoom, viewTranslate: view.translate, presentationMode: view.presentationMode, analysisSelection: analysis.selection() };
        if (session.state) Object.assign(session.state, settings);
        this.viewPersistence.update(session.id, settings);
      }
    };

    editor = new SchematicEditor(mounts, services, bridge);
    documentHost = services.createDocumentHost(mounts.documentTabsEl, {
      createEditorState: (document) => ({
        history: document ? createSchematicContentHistoryAdapter(contentFromDocument(document)) : null
      }),
      captureActiveSession: (session) => this.captureActiveSession(editor, analysis, session),
      restoreInitialSession: (session) => this.restoreSession(editor, session),
      switchSession: (_outgoing, target) => { this.viewPersistence.flush(); this.restoreSession(editor, target); },
      destroySession: () => {},
      finishActiveEdits: () => editor.hostFinishActiveEdits(),
      isDisposableBlank: (session) => this.isDisposableBlank(session),
      currentDocument: () => editor.hostDocument(),
      currentPresentationMode: () => editor.hostCaptureView().presentationMode,
      applyClipboardDocument: (document) => editor.hostBeginClipboardCopy(document),
      setStatus: (message, log) => editor.hostSetStatus(message, log),
      fit: () => editor.fit(),
      isDestroyed: () => this.destroyed,
      onSaveStateChange: () => editor.hostNotifySaveStateChange()
    });

    this.editor = editor;
    this.analysis = analysis;
    this.contextMenu = contextMenu;
    this.documentHost = documentHost;
    this.unbindOptions = bindSchematicWebOptions(mounts.shellEl, () => editor.hostRefreshLanguage());
  }

  init() {
    if (this.initialized || this.destroyed) return;
    this.initialized = true;
    this.editor.init();
    this.analysis.bind();
    this.services.ownerWindow.addEventListener("beforeunload", this.beforeUnload);
    void this.documentHost.init();
  }

  destroy() {
    if (this.destroyResult) return this.destroyResult;
    if (this.destroyed) return Promise.resolve();
    this.editor.flushTransientEdits("destroy");
    this.destroyed = true;
    this.unbindOptions();
    this.services.ownerWindow.removeEventListener("beforeunload", this.beforeUnload);
    this.viewPersistence.destroy();
    this.documentHost.destroy();
    this.analysis.destroy();
    this.contextMenu.destroy();
    this.destroyResult = Promise.resolve(this.editor.destroy());
    return this.destroyResult;
  }

  getState(): SchematicEditorState {
    return this.editor.getState();
  }

  getContent(): SchematicContent {
    return this.editor.getContent();
  }

  replaceContent(content: SchematicContent, originOrOptions?: string | SchematicEditorMutationOptions) {
    this.editor.replaceContent(content, originOrOptions);
  }

  transact(mutate: (draft: SchematicContent) => void, options?: SchematicEditorMutationOptions) {
    this.editor.transact(mutate, options);
  }

  run(command: string) {
    this.editor.run(command);
  }

  execute(command: SchematicEditorCommand) {
    return this.editor.execute(command);
  }

  flushTransientEdits(reason?: string) {
    this.editor.flushTransientEdits(reason);
  }

  fit() {
    this.editor.fit();
  }

  focus() {
    this.editor.focus();
  }

  hasExportableSelection() {
    return this.editor.hasExportableSelection();
  }

  getSelectionExportInput() {
    return this.editor.getSelectionExportInput();
  }

  getSelectionContent() {
    return this.editor.getSelectionContent();
  }

  subscribe(listener: SchematicEditorStateListener) {
    return this.editor.subscribe(listener);
  }

  private captureActiveSession(
    editor: SchematicEditor,
    analysis: SchematicAnalysisControllerPort,
    session: SchematicHostedDocumentSession<HostedEditorState>
  ) {
    const snapshot = editor.hostCaptureDocument();
    session.state = this.services.workspace.createDocumentSnapshot(snapshot.document, {
      analysisSelection: analysis.selection(),
      zoom: snapshot.view.zoom,
      viewTranslate: snapshot.view.translate,
      presentationMode: snapshot.view.presentationMode
    });
  }

  private restoreSession(
    editor: SchematicEditor,
    session: SchematicHostedDocumentSession<HostedEditorState>
  ) {
    const storedState = session.state ?? this.readDocumentState(session.id);
    if (!session.state) session.storageStatus = storedState ? "loaded" : "missing";
    const state = storedState ?? blankState();
    session.state = state;
    const projection = this.services.workspace.projectDocumentRestore(state, {
      minZoom: 0.00001,
      maxZoom: 280
    });
    const document = projection.document ?? createEmptySchematicDocument();
    session.editorState.history ??= createSchematicContentHistoryAdapter(contentFromDocument(document));
    editor.hostActivateDocument({
      id: session.id,
      title: session.title,
      document,
      view: {
        zoom: projection.view.zoom,
        translate: projection.view.translate,
        presentationMode: projection.presentationMode
      },
      analysisSelection: projection.analysisSelection ?? emptyAnalysisSelection()
    });
  }

  private readDocumentState(id: string) {
    try {
      return this.services.workspace.readDocument(id);
    } catch (error) {
      console.error("A schematic tab snapshot was damaged; opening a blank document.", error);
      return undefined;
    }
  }

  private isDisposableBlank(session: SchematicHostedDocumentSession<HostedEditorState>) {
    const state = session.state ?? this.readDocumentState(session.id);
    const documentIsEmpty = !state?.document || isEmptySchematicDocument(state.document);
    const history = session.editorState.history;
    return documentIsEmpty && (!history || (!history.canUndo && !history.canRedo));
  }
}

function blankState(): SchematicDocumentState {
  const view = defaultSchematicView();
  return {
    document: createEmptySchematicDocument(),
    analysisSelection: emptyAnalysisSelection(),
    zoom: view.zoom,
    viewTranslate: { ...view.translate },
    presentationMode: false
  };
}

function emptyAnalysisSelection() {
  return { inputP: "", inputN: "", outputP: "", outputN: "" };
}
