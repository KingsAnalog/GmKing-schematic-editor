import { copySourceCount, copySourceFromDocument } from "./copyModel";
import {
  createEmptySchematicDocument,
  isEmptySchematicDocument
} from "./document/documentModel";
import { RecentlyClosedTabController } from "./recentlyClosedTab";
import { uniqueSchematicTabTitle } from "./schematicTabTitle";
import type {
  ImportedSchematicDocumentFile,
  SchematicClipboardPort,
  SchematicDocumentFilePort,
  SchematicDocumentHostBridge,
  SchematicDocumentHostPort,
  SchematicDocumentTabsPort,
  SchematicHostedDocumentSession,
  SchematicWorkspacePort
} from "./schematicEditorHostPorts";
import type { SchematicDocumentExportFormat, SchematicDocumentTabsOptions } from "./schematicDocumentTabs";
import type { SchematicDocument } from "./types";
import { defaultSchematicView } from "./viewAdapter";

const CLOSED_TAB_UNDO_WINDOW_MS = 10_000;

export interface SchematicWebDocumentHostOptions<EditorState> {
  workspace: SchematicWorkspacePort;
  documentFiles: SchematicDocumentFilePort;
  clipboard: SchematicClipboardPort;
  createId(): string;
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
  createTabs(options: SchematicDocumentTabsOptions): SchematicDocumentTabsPort;
  bridge: SchematicDocumentHostBridge<EditorState>;
}

/** Web-only multi-document policy around one active schematic editor. */
export class SchematicWebDocumentHost<EditorState>
implements SchematicDocumentHostPort<EditorState> {
  private readonly tabs: SchematicDocumentTabsPort;
  private readonly recentlyClosed: RecentlyClosedTabController<
    SchematicHostedDocumentSession<EditorState>
  >;
  private sessions: Array<SchematicHostedDocumentSession<EditorState>> = [];
  private nextDocumentNumber = 1;
  private pasteRequestId = 0;
  private importRequestId = 0;
  private initialized = false;
  private destroyed = false;
  private actionQueue = Promise.resolve();
  private readonly saveRequests = new WeakMap<object, number>();
  activeDocumentId = "";

  constructor(private readonly options: SchematicWebDocumentHostOptions<EditorState>) {
    this.recentlyClosed = new RecentlyClosedTabController(CLOSED_TAB_UNDO_WINDOW_MS, {
      setTimeout: options.setTimeout,
      clearTimeout: options.clearTimeout
    });
    this.tabs = options.createTabs({
      onActivate: (id) => this.runAction(() => this.activate(id)),
      onClose: (id) => this.runAction(() => this.close(id)),
      onCreate: () => this.runAction(() => this.create()),
      onReorder: (id, insertionIndex) => this.runAction(() => this.reorder(id, insertionIndex)),
      onRename: (id, title) => this.runAction(() => this.rename(id, title)),
      onImport: (file) => this.importDocument(() => this.options.documentFiles.read(file), "Import failed"),
      onImportFromClipboard: () => this.importDocument(async () => ({
        title: "Imported schematic",
        document: await this.options.clipboard.readDocument()
      }), "Clipboard import failed"),
      onExport: (format, includeHidden) => this.exportActive(format, includeHidden),
      onRetrySave: () => this.runAction(() => this.retrySave())
    });
  }

  async init() {
    if (this.initialized || this.destroyed) return;
    this.initialized = true;
    this.tabs.bind();
    const manifest = this.options.workspace.readManifest();
    this.sessions = manifest?.documents.map((document) => ({
      ...document,
      state: null,
      storageStatus: "unloaded" as const,
      editorState: this.options.bridge.createEditorState()
    })) ?? [];
    if (this.sessions.length === 0) {
      const initial = this.makeSession();
      this.sessions.push(initial);
    }

    this.nextDocumentNumber = nextSchematicDocumentNumber(this.sessions);
    const requestedActiveId = manifest?.activeDocumentId;
    const active = this.sessions.find((session) => session.id === requestedActiveId)
      ?? this.sessions[0];
    this.activeDocumentId = active.id;
    this.options.bridge.restoreInitialSession(active);
    this.renderTabs();
    if (!manifest) {
      await this.persistSession(active, "The initial schematic could not be saved. It remains available in the current page.");
      if (!this.destroyed) await this.persistManifest();
    }
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.pasteRequestId += 1;
    this.importRequestId += 1;
    this.tabs.destroy();
    const retained = this.recentlyClosed.take();
    this.recentlyClosed.clear();
    const sessions = new Set(this.sessions);
    if (retained) sessions.add(retained.value);
    sessions.forEach((session) => this.options.bridge.destroySession(session));
    this.sessions = [];
    this.activeDocumentId = "";
  }

  activeSession() {
    return this.sessions.find((session) => session.id === this.activeDocumentId) ?? null;
  }

  hasUnsavedChanges() {
    return this.sessions.some(session => session.saveState === "pending" || session.saveState === "failed");
  }

  private runAction(action: () => Promise<void>) {
    const pending = this.actionQueue.then(() => { if (!this.destroyed) return action(); });
    this.actionQueue = pending.catch(error => this.showStorageError("The workspace change could not be saved.", error));
    return this.actionQueue;
  }

  async persistActive(
    errorMessage = "Automatic save failed. This schematic remains open in the current page."
  ) {
    const session = this.activeSession();
    if (!session) return true;
    this.options.bridge.captureActiveSession(session);
    return this.persistSession(session, errorMessage);
  }

  private async retrySave() {
    this.options.bridge.finishActiveEdits();
    await this.persistActive();
    for (const session of this.sessions) {
      if (session.id !== this.activeDocumentId && session.saveState === "failed") {
        await this.persistSession(session, `The schematic "${session.title}" could not be saved.`);
      }
    }
    if (!this.destroyed) await this.persistManifest();
  }

  private clearStorageErrorIfSaved() {
    if (!this.destroyed && !this.sessions.some(session => session.saveState === "failed")) {
      this.tabs.clearStorageError();
    }
  }

  private async create() {
    const session = this.makeSession();
    this.options.bridge.finishActiveEdits();
    if (!await this.persistActive()) return;
    if (!await this.persistSession(session, "The new schematic could not be saved.")) return;

    const nextSessions = [...this.sessions, session];
    if (!await this.persistManifestSnapshot(
      nextSessions,
      session.id,
      "The new schematic could not be opened."
    )) {
      void this.removeSnapshotBestEffort(session.id);
      return;
    }
    this.sessions = nextSessions;
    this.renderTabs();
    await this.activate(session.id, { skipCurrentSave: true, persistManifest: false });
  }

  private async close(id: string) {
    const index = this.sessions.findIndex((session) => session.id === id);
    if (index < 0) return;
    const closed = this.sessions[index];
    const closingActive = id === this.activeDocumentId;
    if (closingActive) {
      this.options.bridge.finishActiveEdits();
      if (!await this.persistActive("The schematic could not be saved, so it was not closed.")) return;
    } else {
      closed.state ??= this.options.workspace.readDocument(closed.id) ?? blankState();
      if (closed.saveState === "pending" || closed.saveState === "failed") {
        if (!await this.persistSession(closed, "The schematic could not be saved, so it was not closed.")) return;
      }
    }
    const closedDocumentIsEmpty = isEmptySchematicDocument(
      closed.state?.document ?? createEmptySchematicDocument()
    );

    const previousSessions = this.sessions;
    const previousActiveId = this.activeDocumentId;
    let replacement: SchematicHostedDocumentSession<EditorState> | null = null;
    let nextSessions = previousSessions.filter((session) => session.id !== id);
    if (nextSessions.length === 0) {
      replacement = this.makeSession();
      if (!await this.persistSession(
        replacement,
        "A blank replacement schematic could not be saved, so the current schematic was not closed."
      )) return;
      nextSessions = [replacement];
    }

    const nextActiveId = closingActive
      ? (previousSessions[index + 1] ?? previousSessions[index - 1] ?? replacement)?.id
      : previousActiveId;
    if (!nextActiveId) return;
    if (!await this.persistManifestSnapshot(
      nextSessions,
      nextActiveId,
      "The tab list could not be saved, so the schematic was not closed."
    )) {
      if (replacement) void this.removeSnapshotBestEffort(replacement.id);
      return;
    }

    try {
      await this.options.workspace.removeDocument(closed.id);
      this.clearStorageErrorIfSaved();
    } catch (error) {
      try {
        await this.options.workspace.persistManifest({
          activeDocumentId: previousActiveId,
          documents: previousSessions.map(({ id: sessionId, title }) => ({ id: sessionId, title }))
        });
      } catch {
        // The in-memory tabs remain authoritative until a later successful save.
      }
      if (replacement) void this.removeSnapshotBestEffort(replacement.id);
      this.showStorageError(
        "The schematic storage entry could not be removed, so the tab was kept open.",
        error
      );
      return;
    }

    this.sessions = nextSessions;
    if (closingActive) {
      await this.activate(nextActiveId, {
        skipCurrentSave: true,
        persistManifest: false,
        outgoing: closed
      });
    } else {
      this.renderTabs();
    }

    if (closedDocumentIsEmpty) {
      const displaced = this.recentlyClosed.take();
      if (displaced) this.options.bridge.destroySession(displaced.value);
      this.options.bridge.destroySession(closed);
      this.tabs.hideCloseSnackbar();
      return;
    }

    const displaced = this.recentlyClosed.take();
    if (displaced) this.options.bridge.destroySession(displaced.value);
    this.recentlyClosed.replace(
      { value: closed, index, ...(replacement ? { replacementId: replacement.id } : {}) },
      (expired) => {
        this.options.bridge.destroySession(expired.value);
        this.tabs.hideCloseSnackbar();
      }
    );
    this.showRecentlyClosedSnackbar(closed.title);
  }

  private async restoreRecentlyClosed() {
    const entry = this.recentlyClosed.peek();
    if (!entry) return;
    this.options.bridge.finishActiveEdits();
    if (!await this.persistActive(
      "The active schematic could not be saved, so the closed tab was not restored."
    )) {
      this.showRecentlyClosedSnackbar(entry.value.title);
      return;
    }

    const replacement = entry.replacementId
      ? this.sessions.find((session) => session.id === entry.replacementId) ?? null
      : null;
    const removeReplacement = replacement
      ? this.options.bridge.isDisposableBlank(replacement)
      : false;
    const retained = removeReplacement
      ? this.sessions.filter((session) => session.id !== replacement?.id)
      : [...this.sessions];
    const insertionIndex = Math.min(Math.max(0, entry.index), retained.length);
    const nextSessions = [...retained];
    nextSessions.splice(insertionIndex, 0, entry.value);

    if (!await this.persistSession(
      entry.value,
      "The closed schematic could not be written back to storage."
    )) {
      this.showRecentlyClosedSnackbar(entry.value.title);
      return;
    }
    if (!await this.persistManifestSnapshot(
      nextSessions,
      entry.value.id,
      "The tab list could not be saved, so the closed schematic was not restored."
    )) {
      void this.removeSnapshotBestEffort(entry.value.id);
      this.showRecentlyClosedSnackbar(entry.value.title);
      return;
    }

    if (removeReplacement && replacement) {
      try {
        await this.options.workspace.removeDocument(replacement.id);
        this.clearStorageErrorIfSaved();
      } catch (error) {
        try {
          await this.options.workspace.persistManifest({
            activeDocumentId: this.activeDocumentId,
            documents: this.sessions.map(({ id, title }) => ({ id, title }))
          });
        } catch {
          // The current in-memory tab set remains intact until a later save succeeds.
        }
        void this.removeSnapshotBestEffort(entry.value.id);
        this.showStorageError(
          "The blank replacement tab could not be removed, so the closed schematic was not restored.",
          error
        );
        this.showRecentlyClosedSnackbar(entry.value.title);
        return;
      }
      this.options.bridge.destroySession(replacement);
    }

    this.recentlyClosed.take();
    this.sessions = nextSessions;
    await this.activate(entry.value.id, { skipCurrentSave: true, persistManifest: false });
  }

  private async rename(id: string, requestedTitle: string) {
    const session = this.sessions.find((candidate) => candidate.id === id);
    if (!session) return;
    const title = uniqueSchematicTabTitle(
      requestedTitle,
      this.sessions.filter((candidate) => candidate.id !== id).map((candidate) => candidate.title)
    );
    if (!title || title === session.title) {
      this.renderTabs();
      return;
    }
    const projected = this.sessions.map((candidate) => (
      candidate.id === id ? { ...candidate, title } : candidate
    ));
    if (!await this.persistManifestSnapshot(
      projected,
      this.activeDocumentId,
      "The schematic title could not be saved, so the old title was restored."
    )) {
      this.renderTabs();
      return;
    }
    session.title = title;
    this.renderTabs();
  }

  private async reorder(id: string, insertionIndex: number) {
    const sourceIndex = this.sessions.findIndex((session) => session.id === id);
    if (sourceIndex < 0) return;
    const boundedInsertionIndex = Math.max(0, Math.min(this.sessions.length, insertionIndex));
    const destinationIndex = boundedInsertionIndex > sourceIndex
      ? boundedInsertionIndex - 1
      : boundedInsertionIndex;
    if (destinationIndex === sourceIndex) return;

    const projected = [...this.sessions];
    const [moved] = projected.splice(sourceIndex, 1);
    projected.splice(destinationIndex, 0, moved);
    if (!await this.persistManifestSnapshot(
      projected,
      this.activeDocumentId,
      "The schematic tab order could not be saved, so the previous order was restored."
    )) {
      this.renderTabs();
      return;
    }
    this.sessions = projected;
    this.renderTabs();
  }

  private async exportActive(format: SchematicDocumentExportFormat, includeHidden: boolean) {
    const session = this.activeSession();
    if (!session) return;
    try {
      this.options.bridge.finishActiveEdits();
      const document = this.options.bridge.currentDocument();
      if (format === "json") {
        void this.persistActive();
        this.options.documentFiles.download(document, session.title);
      } else {
        await this.options.documentFiles.downloadImage(document, session.title, format, {
          includeHidden,
          presentationMode: this.options.bridge.currentPresentationMode()
        });
      }
    } catch (error) {
      if (this.destroyed || this.activeDocumentId !== session.id) return;
      this.options.bridge.setStatus(
        error instanceof Error ? `Export failed: ${error.message}` : "Export failed."
      );
    }
  }

  async pasteFromClipboard() {
    const requestId = ++this.pasteRequestId;
    const requestedDocumentId = this.activeDocumentId;
    let imported: SchematicDocument;
    try {
      imported = await this.options.clipboard.readDocument();
    } catch (error) {
      if (!this.requestIsCurrent(requestId, requestedDocumentId)) return;
      this.options.bridge.setStatus(
        error instanceof Error
          ? `Could not paste schematic JSON from clipboard: ${error.message}`
          : "Could not paste schematic JSON from clipboard."
      );
      return;
    }
    if (!this.requestIsCurrent(requestId, requestedDocumentId)) return;
    if (copySourceCount(copySourceFromDocument(imported)) === 0) {
      this.options.bridge.setStatus("The clipboard schematic does not contain copyable objects.");
      return;
    }
    this.options.bridge.applyClipboardDocument(imported);
  }

  private async importDocument(read: () => Promise<ImportedSchematicDocumentFile>, errorPrefix: string) {
    const requestId = ++this.importRequestId;
    const isCurrent = () => !this.destroyed && !this.options.bridge.isDestroyed() && requestId === this.importRequestId;
    let imported: ImportedSchematicDocumentFile;
    try {
      imported = await read();
    } catch (error) {
      if (isCurrent()) {
        this.options.bridge.setStatus(error instanceof Error ? `${errorPrefix}: ${error.message}` : `${errorPrefix}.`);
      }
      return;
    }
    if (!isCurrent()) return;

    await this.runAction(async () => {
      if (!isCurrent()) return;
      this.options.bridge.finishActiveEdits();
      const saved = await this.persistActive("The active schematic could not be saved, so the imported schematic was not opened.");
      if (saved && isCurrent()) await this.openImportedDocument(imported);
    });
  }

  private async openImportedDocument(imported: ImportedSchematicDocumentFile) {
    const title = uniqueSchematicTabTitle(
      imported.title,
      this.sessions.map((session) => session.title)
    ) ?? "Imported schematic";
    const view = defaultSchematicView();
    const state = this.options.workspace.createDocumentSnapshot(imported.document, {
      analysisSelection: emptyAnalysisSelection(),
      zoom: view.zoom,
      viewTranslate: view.translate,
      presentationMode: false
    });
    const session: SchematicHostedDocumentSession<EditorState> = {
      id: this.options.createId(),
      title,
      state,
      storageStatus: "new",
      editorState: this.options.bridge.createEditorState(imported.document)
    };
    if (!await this.persistSession(session, "The imported schematic could not be written to storage.")) {
      this.options.bridge.destroySession(session);
      return;
    }
    if (this.destroyed) {
      this.options.bridge.destroySession(session);
      void this.removeSnapshotBestEffort(session.id);
      return;
    }

    const nextSessions = [...this.sessions, session];
    if (!await this.persistManifestSnapshot(
      nextSessions,
      session.id,
      "The imported schematic could not be added to the tab list."
    )) {
      this.options.bridge.destroySession(session);
      void this.removeSnapshotBestEffort(session.id);
      return;
    }
    if (this.destroyed) {
      this.options.bridge.destroySession(session);
      return;
    }
    this.sessions = nextSessions;
    this.renderTabs();
    await this.activate(session.id, { skipCurrentSave: true, persistManifest: false });
    if (!this.destroyed) this.options.bridge.fit();
  }

  private async activate(
    id: string,
    options: {
      skipCurrentSave?: boolean;
      persistManifest?: boolean;
      outgoing?: SchematicHostedDocumentSession<EditorState>;
    } = {}
  ) {
    if (id === this.activeDocumentId) return;
    const target = this.sessions.find((session) => session.id === id);
    if (!target) return;
    const outgoing = options.outgoing ?? this.activeSession();
    if (!options.skipCurrentSave) {
      this.options.bridge.finishActiveEdits();
      await this.persistActive();
    }
    if (this.destroyed) return;
    this.activeDocumentId = target.id;
    this.options.bridge.switchSession(outgoing, target);
    this.renderTabs();
    if (options.persistManifest !== false) await this.persistManifest();
  }

  private makeSession(): SchematicHostedDocumentSession<EditorState> {
    const title = `Schematic ${this.nextDocumentNumber++}`;
    return {
      id: this.options.createId(),
      title,
      state: blankState(),
      storageStatus: "new",
      editorState: this.options.bridge.createEditorState()
    };
  }

  private async persistSession(
    session: SchematicHostedDocumentSession<EditorState>,
    errorMessage: string
  ) {
    if (
      session.storageStatus === "missing"
      && (!session.state?.document || isEmptySchematicDocument(session.state.document))
    ) {
      session.saveState = "failed";
      this.showStorageError(
        "This schematic snapshot could not be loaded. Its blank fallback was not saved."
      );
      return false;
    }
    const request = (this.saveRequests.get(session) ?? 0) + 1;
    this.saveRequests.set(session, request);
    session.saveState = "pending";
    if (!this.destroyed) this.options.bridge.onSaveStateChange?.();
    try {
      await this.options.workspace.persistDocument(session.id, session.state ?? {});
      session.storageStatus = "loaded";
      if (this.saveRequests.get(session) === request) {
        session.saveState = "saved";
        if (!this.destroyed) this.options.bridge.onSaveStateChange?.();
        if (!this.destroyed) this.clearStorageErrorIfSaved();
      }
      return true;
    } catch (error) {
      if (this.saveRequests.get(session) === request) {
        session.saveState = "failed";
        if (!this.destroyed) this.options.bridge.onSaveStateChange?.();
        if (!this.destroyed) this.showStorageError(errorMessage, error);
      }
      return false;
    }
  }

  private persistManifest() {
    return this.persistManifestSnapshot(
      this.sessions,
      this.activeDocumentId,
      "The schematic tab list could not be saved."
    );
  }

  private async persistManifestSnapshot(
    sessions: readonly SchematicHostedDocumentSession<EditorState>[],
    activeDocumentId: string,
    errorMessage: string
  ) {
    try {
      await this.options.workspace.persistManifest({
        activeDocumentId,
        documents: sessions.map(({ id, title }) => ({ id, title }))
      });
      this.clearStorageErrorIfSaved();
      return true;
    } catch (error) {
      this.showStorageError(errorMessage, error);
      return false;
    }
  }

  private async removeSnapshotBestEffort(id: string) {
    try {
      await this.options.workspace.removeDocument(id);
    } catch {
      // A stale orphan is harmless because it is not referenced by the manifest.
    }
  }

  private requestIsCurrent(requestId: number, documentId: string) {
    return !this.destroyed
      && !this.options.bridge.isDestroyed()
      && requestId === this.pasteRequestId
      && documentId === this.activeDocumentId;
  }

  private renderTabs() {
    this.tabs.render(this.sessions, this.activeDocumentId);
  }

  private showRecentlyClosedSnackbar(title: string) {
    this.tabs.showCloseSnackbar({
      message: `Closed "${title}".`,
      timeoutMs: 0,
      onUndo: () => this.runAction(() => this.restoreRecentlyClosed())
    });
  }

  private showStorageError(message: string, error?: unknown) {
    if (error === undefined) console.error(message);
    else console.error(message, error);
    this.tabs.showStorageError(error instanceof Error && error.name === "SchematicStorageConflict" ? error.message : message);
  }
}

function blankState() {
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

function nextSchematicDocumentNumber(
  sessions: readonly Pick<SchematicHostedDocumentSession<unknown>, "title">[]
) {
  return sessions.reduce((next, session) => {
    const match = /^Schematic (\d+)$/.exec(session.title);
    return match ? Math.max(next, Number(match[1]) + 1) : next;
  }, 1);
}
