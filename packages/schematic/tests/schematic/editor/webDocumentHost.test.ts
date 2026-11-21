import { describe, expect, it, vi } from "vitest";
import { createEmptySchematicDocument } from "../../../src/schematic/document/documentModel";
import type {
  SchematicDocumentHostBridge,
  SchematicDocumentTabsPort,
  SchematicHostedDocumentSession,
  SchematicWorkspacePort
} from "../../../src/schematic/schematicEditorHostPorts";
import { SchematicWebDocumentHost } from "../../../src/schematic/schematicWebDocumentHost";
import type { SchematicDocumentTabsOptions } from "../../../src/schematic/schematicDocumentTabs";
import type { SchematicDocument } from "../../../src/schematic/types";
import type { SchematicDocumentState } from "../../../src/shared/workspaceState";

interface EditorState {
  token: string;
}

describe("SchematicWebDocumentHost", () => {
  it("keeps a failed inactive draft open and its warning visible until retry succeeds", async () => {
    const fixture = createFixture({ activeDocumentId: "a", documents: [{ id: "a", title: "A" }, { id: "b", title: "B" }] });
    await fixture.host.init();
    const save = fixture.workspace.persistDocument.getMockImplementation()!;
    fixture.workspace.persistDocument.mockImplementation((id, state) => {
      if (id === "a") throw new Error("quota");
      return save(id, state);
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const clear = vi.mocked(fixture.tabs.clearStorageError);
    clear.mockClear();
    await fixture.tabsOptions.onActivate("b");
    expect(fixture.host.hasUnsavedChanges()).toBe(true);
    expect(clear).not.toHaveBeenCalled();
    await fixture.tabsOptions.onClose("a");
    expect(fixture.workspace.removeDocument).not.toHaveBeenCalled();
    fixture.workspace.persistDocument.mockImplementation(save);
    await fixture.tabsOptions.onRetrySave?.();
    expect(fixture.host.hasUnsavedChanges()).toBe(false);
    expect(clear).toHaveBeenCalled();
    log.mockRestore();
  });

  it("mounts immediately and ignores initialization completion after destruction", async () => {
    const fixture = createFixture();
    let finish!: () => void;
    fixture.workspace.persistDocument.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const pending = fixture.host.init();
    expect(fixture.bridge.restoreInitialSession).toHaveBeenCalledOnce();
    fixture.host.destroy();
    finish();
    await pending;
    expect(fixture.tabs.render).toHaveBeenCalledOnce();
    expect(fixture.workspace.persistManifest).not.toHaveBeenCalled();
  });

  it("owns manifest restore and persists the outgoing document before a switch", async () => {
    const fixture = createFixture({
      activeDocumentId: "doc-b",
      documents: [
        { id: "doc-a", title: "A" },
        { id: "doc-b", title: "B" }
      ]
    });

    await fixture.host.init();
    expect(fixture.tabs.bind).toHaveBeenCalledTimes(1);
    expect(fixture.bridge.restoreInitialSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: "doc-b", title: "B" })
    );
    expect(fixture.tabs.render).toHaveBeenLastCalledWith(
      [expect.objectContaining({ id: "doc-a" }), expect.objectContaining({ id: "doc-b" })],
      "doc-b"
    );

    await fixture.tabsOptions.onActivate("doc-a");
    expect(fixture.bridge.finishActiveEdits).toHaveBeenCalledTimes(1);
    expect(fixture.bridge.captureActiveSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: "doc-b" })
    );
    expect(fixture.workspace.persistDocument).toHaveBeenCalledWith("doc-b", expect.any(Object));
    expect(fixture.bridge.switchSession).toHaveBeenCalledWith(
      expect.objectContaining({ id: "doc-b" }),
      expect.objectContaining({ id: "doc-a" })
    );
    expect(fixture.workspace.persistManifest).toHaveBeenLastCalledWith(
      expect.objectContaining({ activeDocumentId: "doc-a" })
    );
  });

  it("keeps exactly one editor-state object per document without owning render surfaces", async () => {
    const fixture = createFixture();
    await fixture.host.init();
    await fixture.tabsOptions.onCreate();

    expect(fixture.bridge.createEditorState).toHaveBeenCalledTimes(2);
    expect(fixture.bridge.switchSession).toHaveBeenCalledTimes(1);
    const target = fixture.bridge.switchSession.mock.calls[0][1];
    expect(target.editorState).toEqual({ token: "state-2" });
    expect(target).not.toHaveProperty("runtime");
    expect(target).not.toHaveProperty("paper");
  });

  it("persists a dragged tab order without switching the active document", async () => {
    const fixture = createFixture({
      activeDocumentId: "doc-b",
      documents: [
        { id: "doc-a", title: "A" },
        { id: "doc-b", title: "B" },
        { id: "doc-c", title: "C" }
      ]
    });
    await fixture.host.init();

    await fixture.tabsOptions.onReorder?.("doc-a", 3);

    expect(fixture.workspace.persistManifest).toHaveBeenLastCalledWith({
      activeDocumentId: "doc-b",
      documents: [
        { id: "doc-b", title: "B" },
        { id: "doc-c", title: "C" },
        { id: "doc-a", title: "A" }
      ]
    });
    expect(fixture.tabs.render).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: "doc-b" }),
      expect.objectContaining({ id: "doc-c" }),
      expect.objectContaining({ id: "doc-a" })
    ], "doc-b");
    expect(fixture.bridge.switchSession).not.toHaveBeenCalled();
  });

  it("does not overwrite a missing stored snapshot with its blank fallback", async () => {
    const fixture = createFixture({
      activeDocumentId: "doc-b",
      documents: [
        { id: "doc-a", title: "A" },
        { id: "doc-b", title: "B" }
      ]
    }, Promise.resolve(createEmptySchematicDocument()), ["doc-b"]);

    await fixture.host.init();
    fixture.host.activeSession()!.storageStatus = "missing";
    await fixture.tabsOptions.onActivate("doc-a");

    expect(fixture.workspace.persistDocument).not.toHaveBeenCalled();
    expect(fixture.tabs.showStorageError).toHaveBeenCalledWith(
      "This schematic snapshot could not be loaded. Its blank fallback was not saved."
    );
    expect(fixture.bridge.switchSession).toHaveBeenCalled();
  });

  it("imports the tab bar clipboard document with all layers and object state", async () => {
    const imported = createEmptySchematicDocument();
    imported.layers!.push({ id: "annotations", name: "Annotations", visible: false, locked: true });
    imported.notes.push({ id: "note", layerId: "annotations", x: 0, y: 0, width: 160, format: "plain", text: "Imported" });
    imported.layerObjectStates = { note: { visible: false, z: 3 } };
    const fixture = createFixture(undefined, Promise.resolve(imported));
    await fixture.host.init();
    const originalId = fixture.host.activeDocumentId;
    await fixture.tabsOptions.onImportFromClipboard?.();

    const importedId = fixture.host.activeDocumentId;
    expect(importedId).not.toBe(originalId);
    expect(fixture.workspace.persistDocument).toHaveBeenCalledWith(importedId, { document: imported });
    expect(fixture.workspace.persistManifest).toHaveBeenLastCalledWith({
      activeDocumentId: importedId,
      documents: [
        { id: originalId, title: "Schematic 1" },
        { id: importedId, title: "Imported schematic" }
      ]
    });
    expect(fixture.bridge.fit).toHaveBeenCalledOnce();
    expect(fixture.bridge.applyClipboardDocument).not.toHaveBeenCalled();
  });

  it("preserves the current document and reports clipboard import errors", async () => {
    let rejectClipboard!: (reason: Error) => void;
    const clipboard = new Promise<SchematicDocument>((_, reject) => { rejectClipboard = reject; });
    const fixture = createFixture(undefined, clipboard);
    await fixture.host.init();
    const originalId = fixture.host.activeDocumentId;
    const pending = fixture.tabsOptions.onImportFromClipboard?.();
    rejectClipboard(new Error("Invalid JSON"));
    await pending;

    expect(fixture.host.activeDocumentId).toBe(originalId);
    expect(fixture.bridge.switchSession).not.toHaveBeenCalled();
    expect(fixture.bridge.setStatus).toHaveBeenCalledWith("Clipboard import failed: Invalid JSON");
  });

  it("ignores an earlier clipboard import when a file is opened first", async () => {
    let resolveClipboard!: (document: SchematicDocument) => void;
    const clipboard = new Promise<SchematicDocument>(resolve => { resolveClipboard = resolve; });
    const fixture = createFixture(undefined, clipboard);
    await fixture.host.init();
    const pending = fixture.tabsOptions.onImportFromClipboard?.();
    await fixture.tabsOptions.onImport?.({ name: "test.json" } as File);
    const activeFile = fixture.host.activeDocumentId;
    resolveClipboard(createEmptySchematicDocument());
    await pending;
    expect(fixture.host.activeDocumentId).toBe(activeFile);
    expect(fixture.bridge.switchSession).toHaveBeenCalledOnce();
  });

  it("invalidates pending Clipboard work and releases every host-owned lifecycle once", async () => {
    let resolveClipboard!: (document: SchematicDocument) => void;
    const clipboardResult = new Promise<SchematicDocument>((resolve) => {
      resolveClipboard = resolve;
    });
    const fixture = createFixture(undefined, clipboardResult);
    await fixture.host.init();
    const pendingImport = fixture.tabsOptions.onImportFromClipboard?.();

    fixture.host.destroy();
    fixture.host.destroy();
    resolveClipboard(createEmptySchematicDocument());
    await pendingImport;

    expect(fixture.tabs.destroy).toHaveBeenCalledTimes(1);
    expect(fixture.bridge.switchSession).not.toHaveBeenCalled();
    expect(fixture.bridge.applyClipboardDocument).not.toHaveBeenCalled();
    expect(fixture.bridge.destroySession).toHaveBeenCalledTimes(1);
  });
});

function createFixture(
  manifest: { activeDocumentId: string; documents: Array<{ id: string; title: string }> } | undefined = undefined,
  clipboardResult: Promise<SchematicDocument> = Promise.resolve(createEmptySchematicDocument()),
  missingDocumentIds: readonly string[] = []
) {
  const snapshots = new Map<string, SchematicDocumentState>();
  manifest?.documents.forEach(({ id }) => {
    if (!missingDocumentIds.includes(id)) snapshots.set(id, { document: createEmptySchematicDocument() });
  });
  const workspace: SchematicWorkspacePort = {
    createDocumentSnapshot: vi.fn((document) => ({ document })),
    projectDocumentRestore: vi.fn(() => ({
      document: createEmptySchematicDocument(),
      presentationMode: false,
      view: { zoom: 1, translate: { x: 0, y: 0 } }
    })),
    readManifest: vi.fn(() => manifest),
    persistManifest: vi.fn((value) => value),
    readDocument: vi.fn((id) => snapshots.get(id)),
    persistDocument: vi.fn((id, state) => {
      snapshots.set(id, state);
      return state;
    }),
    removeDocument: vi.fn((id) => {
      snapshots.delete(id);
    })
  };
  const tabs: SchematicDocumentTabsPort = {
    bind: vi.fn(),
    destroy: vi.fn(),
    render: vi.fn(),
    showCloseSnackbar: vi.fn(),
    hideCloseSnackbar: vi.fn(),
    showStorageError: vi.fn(),
    clearStorageError: vi.fn()
  };
  let tabsOptions!: SchematicDocumentTabsOptions;
  let stateNumber = 0;
  const bridge: SchematicDocumentHostBridge<EditorState> = {
    createEditorState: vi.fn(() => ({ token: `state-${++stateNumber}` })),
    captureActiveSession: vi.fn((session: SchematicHostedDocumentSession<EditorState>) => {
      session.state = { document: createEmptySchematicDocument() };
    }),
    restoreInitialSession: vi.fn(),
    switchSession: vi.fn(),
    destroySession: vi.fn(),
    finishActiveEdits: vi.fn(),
    isDisposableBlank: vi.fn(() => true),
    currentDocument: vi.fn(() => createEmptySchematicDocument()),
    currentPresentationMode: vi.fn(() => false),
    applyClipboardDocument: vi.fn(),
    setStatus: vi.fn(),
    fit: vi.fn(),
    isDestroyed: vi.fn(() => false)
  };
  const host = new SchematicWebDocumentHost({
    workspace,
    documentFiles: {
      read: vi.fn(async () => ({ title: "Imported", document: createEmptySchematicDocument() })),
      download: vi.fn(),
      downloadImage: vi.fn(async () => {})
    },
    clipboard: { readDocument: vi.fn(() => clipboardResult) },
    createId: vi.fn(() => `doc-${stateNumber + 1}`),
    setTimeout: vi.fn(() => 1),
    clearTimeout: vi.fn(),
    createTabs: (options) => {
      tabsOptions = options;
      return tabs;
    },
    bridge
  });

  return {
    host,
    workspace: workspace as SchematicWorkspacePort & {
      persistDocument: ReturnType<typeof vi.fn>;
      persistManifest: ReturnType<typeof vi.fn>;
    },
    tabs: tabs as SchematicDocumentTabsPort & {
      bind: ReturnType<typeof vi.fn>;
      destroy: ReturnType<typeof vi.fn>;
      render: ReturnType<typeof vi.fn>;
      showStorageError: ReturnType<typeof vi.fn>;
    },
    get tabsOptions() {
      return tabsOptions;
    },
    bridge: bridge as SchematicDocumentHostBridge<EditorState> & {
      createEditorState: ReturnType<typeof vi.fn>;
      captureActiveSession: ReturnType<typeof vi.fn>;
      restoreInitialSession: ReturnType<typeof vi.fn>;
      switchSession: ReturnType<typeof vi.fn>;
      destroySession: ReturnType<typeof vi.fn>;
      finishActiveEdits: ReturnType<typeof vi.fn>;
      applyClipboardDocument: ReturnType<typeof vi.fn>;
    }
  };
}

describe("clipboard paste entry", () => {
  it("starts placement from the shared public entry without replacing the document", async () => {
    const imported = createEmptySchematicDocument();
    imported.notes.push({ id: "copied-note", x: 0, y: 0, width: 120, height: 40, format: "plain", text: "pasted" });
    const fixture = createFixture(undefined, Promise.resolve(imported));
    await fixture.host.init();
    await fixture.host.pasteFromClipboard();
    expect(fixture.bridge.applyClipboardDocument).toHaveBeenCalledWith(imported);
    expect(fixture.bridge.switchSession).not.toHaveBeenCalled();
  });

  it("ignores a clipboard result after switching to a different document", async () => {
    let finish!: (document: SchematicDocument) => void;
    const pending = new Promise<SchematicDocument>(resolve => { finish = resolve; });
    const fixture = createFixture({ activeDocumentId: "a", documents: [{ id: "a", title: "A" }, { id: "b", title: "B" }] }, pending);
    await fixture.host.init();
    const paste = fixture.host.pasteFromClipboard();
    await fixture.tabsOptions.onActivate("b");
    const imported = createEmptySchematicDocument();
    imported.notes.push({ id: "note", x: 0, y: 0, width: 120, height: 40, format: "plain", text: "late" });
    finish(imported);
    await paste;
    expect(fixture.bridge.applyClipboardDocument).not.toHaveBeenCalled();
  });
});
