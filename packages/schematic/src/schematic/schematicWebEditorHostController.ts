import {
  createSchematicContentHistoryAdapter,
  type SchematicContentHistoryAdapter
} from "./document/contentHistoryAdapter";
import {
  contentFromDocument,
  createEmptySchematicDocument,
  documentFromContent,
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
import { createSnapshotHistory } from "../shared/history";
import { buildProjectNetlist } from "./netlist/project";
import { blockTarget, projectSheetOrder, refreshProjectSymbols, singleSheetProject, type SchematicProject } from "./schematicProject";
import { SchematicHierarchyPanel, type HierarchyStep } from "./schematicHierarchyPanel";

interface HostedEditorState {
  history: SchematicContentHistoryAdapter | null;
  project?: SchematicProject;
  hierarchyHistory?: ReturnType<typeof createSnapshotHistory<SchematicProject>>;
  path?: HierarchyStep[];
  views?: Map<string, SchematicDocumentState>;
}

/** Composes one host-neutral editor with Web-owned document and Analysis services. */
export class SchematicWebEditorHostController implements SchematicEditorHandle {
  private readonly editor: SchematicEditor;
  private readonly analysis: SchematicAnalysisControllerPort;
  private readonly contextMenu: SchematicContextMenuControllerPort;
  private readonly documentHost: SchematicDocumentHostPort<HostedEditorState>;
  private readonly viewPersistence: SchematicViewPersistenceController;
  private readonly unbindOptions: () => void;
  private readonly hierarchy: SchematicHierarchyPanel;
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
        if (session.editorState.project || content.components.some(component => component.type === "sheetPort" || component.type === "sheetBlock")) {
          const state = session.editorState;
          this.ensureProject(session);
          const next = structuredClone(state.project!);
          const sheet = next.sheets.find(item => item.id === this.currentSheetId(session))!;
          sheet.content = content;
          projectSheetOrder(next);
          refreshProjectSymbols(next);
          state.project = next;
          state.hierarchyHistory!.push(next);
          services.ownerWindow.queueMicrotask(() => this.hierarchy.refresh());
        } else {
          session.editorState.history ??= createSchematicContentHistoryAdapter(content);
          session.editorState.history.push(content);
        }
        void documentHost?.persistActive();
        return true;
      },
      saveState: () => documentHost?.activeSession()?.saveState ?? "saved",
      undo: () => {
        if (documentHost?.activeSession()?.editorState.project) return this.restoreProjectHistory("undo");
        const content = documentHost?.activeSession()?.editorState.history?.undo() ?? null;
        if (content) services.ownerWindow.queueMicrotask(() => documentHost?.persistActive());
        return content;
      },
      redo: () => {
        if (documentHost?.activeSession()?.editorState.project) return this.restoreProjectHistory("redo");
        const content = documentHost?.activeSession()?.editorState.history?.redo() ?? null;
        if (content) services.ownerWindow.queueMicrotask(() => documentHost?.persistActive());
        return content;
      },
      canUndo: () => {
        const state = documentHost?.activeSession()?.editorState;
        return state?.hierarchyHistory?.canUndo ?? state?.history?.canUndo ?? false;
      },
      canRedo: () => {
        const state = documentHost?.activeSession()?.editorState;
        return state?.hierarchyHistory?.canRedo ?? state?.history?.canRedo ?? false;
      },
      projectNetlist: () => {
        const project = documentHost?.activeSession()?.editorState.project;
        return project ? buildProjectNetlist(project) : null;
      },
      selectProjectDiagnostic: (sheetId, id) => {
        const session = documentHost?.activeSession();
        if (session && sheetId !== this.currentSheetId(session)) this.navigateProject([{ sheetId }]);
        editor.hostSelectHierarchyComponent(id, true);
      },
      hierarchyLibrary: () => this.hierarchy?.library() ?? [],
      placeHierarchySheet: id => this.hierarchy.placeSheet(id),
      onHierarchySelectionChange: id => this.hierarchy?.select(id),
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
    this.hierarchy = new SchematicHierarchyPanel(mounts.shellEl, {
      project: () => {
        const session = this.documentHost.activeSession();
        return session && (session.editorState.project ?? singleSheetProject(session.id, session.title));
      },
      path: () => this.documentHost.activeSession()?.editorState.path ?? [{ sheetId: "top" }],
      change: mutate => this.changeProject(mutate),
      navigate: (path, selection) => this.navigateProject(path, selection),
      arm: component => { this.ensureProject(this.documentHost.activeSession()); editor.hostArmHierarchyPlacement(component); },
      cancelTool: () => { editor.execute({ kind: "cancel" }); },
      focus: id => editor.hostSelectHierarchyComponent(id, true),
      status: text => editor.hostSetStatus(text),
      refreshLibrary: () => editor.hostRefreshHierarchy(),
      id: () => services.idFactory()
    });
    this.unbindOptions = bindSchematicWebOptions(mounts.shellEl, () => {
      editor.hostRefreshLanguage();
      this.hierarchy.refresh();
    });
  }

  init() {
    if (this.initialized || this.destroyed) return;
    this.initialized = true;
    this.editor.init();
    this.hierarchy.bind();
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
    this.hierarchy.destroy();
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
    if (session.editorState.project) {
      session.state.project = session.editorState.project;
      session.state.sheetPath = session.editorState.path;
    }
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
    const stateProject = storedState?.project;
    if (stateProject && !session.editorState.project) {
      session.editorState.project = stateProject;
      session.editorState.hierarchyHistory = createSnapshotHistory(stateProject);
      session.editorState.path = storedState?.sheetPath;
    }
    this.validatePath(session);
    const selected = session.editorState.project?.sheets.find(item => item.id === this.currentSheetId(session));
    const document = selected ? documentFromContent(selected.content) : projection.document ?? createEmptySchematicDocument();
    session.editorState.history ??= createSchematicContentHistoryAdapter(contentFromDocument(document));
    editor.hostActivateDocument({
      id: selected ? `${session.id}/${selected.id}` : session.id,
      title: selected?.name ?? session.title,
      document,
      view: {
        zoom: projection.view.zoom,
        translate: projection.view.translate,
        presentationMode: projection.presentationMode
      },
      analysisSelection: projection.analysisSelection ?? emptyAnalysisSelection()
    });
    this.hierarchy?.refresh();
  }

  private currentSheetId(session: SchematicHostedDocumentSession<HostedEditorState>) {
    return session.editorState.path?.at(-1)?.sheetId ?? session.editorState.project?.topSheetId ?? "top";
  }

  private ensureProject(session: SchematicHostedDocumentSession<HostedEditorState> | null) {
    if (!session || session.editorState.project) return;
    const project = singleSheetProject(session.id, session.title, this.editor.hostDocument());
    session.editorState.project = project;
    session.editorState.hierarchyHistory = session.editorState.history?.map(content => ({
      ...project, sheets: [{ ...project.sheets[0], content }]
    })) ?? createSnapshotHistory(project);
    session.editorState.path = [{ sheetId: project.topSheetId }];
  }

  private changeProject(mutate: (project: SchematicProject, activeSheetId: string) => void) {
    const session = this.documentHost.activeSession();
    if (!session) return;
    this.editor.hostFinishActiveEdits();
    this.ensureProject(session);
    const state = session.editorState;
    const next = structuredClone(state.project!);
    const activeId = this.currentSheetId(session);
    mutate(next, activeId);
    projectSheetOrder(next);
    refreshProjectSymbols(next);
    if (!state.hierarchyHistory!.push(next)) return;
    state.project = next;
    this.validatePath(session);
    const sheet = next.sheets.find(item => item.id === this.currentSheetId(session))!;
    if (sheet.id === activeId) {
      const selected = this.editor.hostSelectedHierarchyComponent()?.id;
      this.editor.replaceContent(sheet.content, { commit: false, origin: "host", reason: "hierarchy" });
      if (selected && sheet.content.components.some(component => component.id === selected)) this.editor.hostSelectHierarchyComponent(selected);
    } else this.restoreSession(this.editor, session);
    this.hierarchy.refresh();
    void this.documentHost.persistActive();
  }

  private navigateProject(path: HierarchyStep[], selection?: string) {
    const session = this.documentHost.activeSession();
    if (!session) return;
    this.editor.hostFinishActiveEdits();
    this.ensureProject(session);
    this.viewPersistence.flush();
    const state = session.editorState;
    const view = this.editor.hostCaptureView();
    state.views ??= new Map();
    state.views.set(this.currentSheetId(session), { zoom: view.zoom, viewTranslate: view.translate,
      presentationMode: view.presentationMode, analysisSelection: this.analysis.selection() });
    state.path = path;
    this.validatePath(session);
    const target = state.views.get(this.currentSheetId(session));
    session.state = { ...target, project: state.project, sheetPath: state.path };
    this.restoreSession(this.editor, session);
    if (selection) this.editor.hostSelectHierarchyComponent(selection, true);
    void this.documentHost.persistActive();
  }

  private validatePath(session: SchematicHostedDocumentSession<HostedEditorState>) {
    const { project, path } = session.editorState;
    if (!project) return;
    const valid: HierarchyStep[] = [];
    for (const step of path ?? []) {
      if (!project.sheets.some(sheet => sheet.id === step.sheetId)) break;
      const previous = valid.at(-1);
      if (previous) {
        const instance = project.sheets.find(sheet => sheet.id === previous.sheetId)?.content.components
          .find(component => component.id === step.instanceId);
        if (!instance || blockTarget(instance) !== step.sheetId) break;
      }
      valid.push(step);
    }
    session.editorState.path = valid.length ? valid : [{ sheetId: project.topSheetId }];
  }

  private restoreProjectHistory(direction: "undo" | "redo") {
    const session = this.documentHost.activeSession();
    if (!session) return null;
    const project = session.editorState.hierarchyHistory?.[direction]();
    if (!project) return null;
    const before = this.currentSheetId(session);
    session.editorState.project = project;
    this.validatePath(session);
    const sheet = project.sheets.find(item => item.id === this.currentSheetId(session))!;
    this.services.ownerWindow.queueMicrotask(() => {
      if (this.documentHost.activeSession() !== session) return;
      if (sheet.id !== before) {
        session.state = { ...session.editorState.views?.get(sheet.id), project, sheetPath: session.editorState.path };
        this.restoreSession(this.editor, session);
      }
      this.hierarchy.refresh();
      void this.documentHost.persistActive();
    });
    return sheet.content;
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
    if (session.editorState.project || state?.project) return false;
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
