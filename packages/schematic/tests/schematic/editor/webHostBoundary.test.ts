import { describe, expect, it } from "vitest";
import { createEmptySchematicDocument } from "../../../src/schematic/document/documentModel";
import editorSource from "../../../src/schematic/editor.ts?raw";
import hostSource from "../../../src/schematic/schematicWebHost.ts?raw";
import documentHostSource from "../../../src/schematic/schematicWebDocumentHost.ts?raw";
import editorHostSource from "../../../src/schematic/schematicWebEditorHostController.ts?raw";
import type { SchematicEditorHandle } from "../../../src/schematic/editorHandle";
import type { SchematicDocumentHostBridge, SchematicEditorHostServices } from "../../../src/schematic/schematicEditorHostPorts";
import {
  createSchematicWebHostServices,
  SchematicWebHost
} from "../../../src/schematic/schematicWebHost";

const MOUNT_SELECTORS = [
  "[data-schematic-shell]",
  "[data-schematic-document-tabs]",
  "[data-schematic-paper]",
  "[data-schematic-palette]",
  "[data-schematic-property-editor]",
  "[data-schematic-status]",
  "[data-schematic-analysis-panel]"
] as const;

class FakeRoot {
  constructor(private readonly elements: Map<string, HTMLElement>) {}

  querySelector<T extends HTMLElement>(selector: string): T | null {
    return (this.elements.get(selector) as T | undefined) ?? null;
  }
}

class FakeHandle implements SchematicEditorHandle {
  initCount = 0;
  destroyCount = 0;
  readonly cleanup = Promise.resolve();

  init() {
    this.initCount += 1;
  }

  destroy() {
    this.destroyCount += 1;
    return this.cleanup;
  }

  getState() {
    return {} as never;
  }

  getContent() {
    return {} as never;
  }

  replaceContent() {}
  transact() {}
  execute() { return true; }
  run() {}
  flushTransientEdits() {}
  fit() {}
  focus() {}
  hasExportableSelection() { return false; }
  getSelectionExportInput() { return Promise.resolve({} as never); }
  getSelectionContent() { return null; }
  subscribe() {
    return () => {};
  }
}

describe("SchematicWebHost", () => {
  it("derives runtime capabilities from the mount ownerDocument realm", () => {
    let requestedFrame: FrameRequestCallback | null = null;
    const ownerWindow = {
      navigator: { clipboard: null },
      localStorage: {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
      },
      crypto: { randomUUID: () => "realm-id" },
      AbortController,
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        requestedFrame = callback;
        return 17;
      },
      cancelAnimationFrame: () => {},
      setTimeout: () => 23,
      clearTimeout: () => {},
      innerWidth: 1200,
      innerHeight: 800
    } as unknown as Window & typeof globalThis;
    const ownerDocument = { defaultView: ownerWindow } as unknown as Document;
    const root = { ownerDocument } as HTMLElement;

    const services = createSchematicWebHostServices(root);

    expect(services.ownerDocument).toBe(ownerDocument);
    expect(services.ownerWindow).toBe(ownerWindow);
    expect(services.idFactory()).toBe("realm-id");
    expect(services.createAbortController()).toBeInstanceOf(AbortController);
    expect(services.requestAnimationFrame(() => {})).toBe(17);
    expect(requestedFrame).not.toBeNull();
    expect(services.setTimeout(() => {}, 10)).toBe(23);
  });

  it("creates and saves Web documents on HTTP without secure-context APIs", async () => {
    const stored = new Map<string, string>();
    const ownerWindow = {
      navigator: {},
      crypto: { getRandomValues: (bytes: Uint8Array) => globalThis.crypto.getRandomValues(bytes) },
      AbortController,
      setTimeout: () => 1,
      clearTimeout: () => {}
    } as unknown as Window & typeof globalThis;
    const root = {
      ownerDocument: { defaultView: ownerWindow },
      addEventListener: () => {},
      querySelector: () => null
    } as unknown as HTMLElement;
    const services = createSchematicWebHostServices(root, {
      storage: {
        getItem: (key) => stored.get(key) ?? null,
        setItem: (key, value) => { stored.set(key, value); },
        removeItem: (key) => { stored.delete(key); }
      }
    });
    const ids = Array.from({ length: 64 }, () => services.idFactory());
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    ids.forEach(id => expect(id).toMatch(uuid));
    expect(new Set(ids).size).toBe(ids.length);

    let restoredId = "";
    const bridge: SchematicDocumentHostBridge<null> = {
      createEditorState: () => null,
      captureActiveSession: () => {},
      restoreInitialSession: (session) => { restoredId = session.id; },
      switchSession: () => {},
      destroySession: () => {},
      finishActiveEdits: () => {},
      isDisposableBlank: () => true,
      currentDocument: createEmptySchematicDocument,
      currentPresentationMode: () => false,
      applyClipboardDocument: () => {},
      setStatus: () => {},
      fit: () => {},
      isDestroyed: () => false
    };
    const host = services.createDocumentHost(root, bridge);
    await host.init();
    expect(host.activeDocumentId).toMatch(uuid);
    expect(host.activeDocumentId).toBe(restoredId);
    expect(ids).not.toContain(host.activeDocumentId);
    expect(host.activeSession()?.saveState).toBe("saved");
    expect(services.workspace.readManifest()?.activeDocumentId).toBe(host.activeDocumentId);
    expect(services.workspace.readDocument(host.activeDocumentId)?.document)
      .toEqual(createEmptySchematicDocument());
    host.destroy();
  });

  it("preserves idempotent editor cleanup without exposing a window global", async () => {
    const elements = new Map<string, HTMLElement>(
      MOUNT_SELECTORS.map((selector) => [selector, { selector } as unknown as HTMLElement])
    );
    const ownerWindow = {} as Window & typeof globalThis;
    const services = { ownerWindow } as SchematicEditorHostServices;
    const handle = new FakeHandle();
    const host = new SchematicWebHost(
      new FakeRoot(elements) as unknown as HTMLElement,
      (_mount, receivedServices) => {
        expect(receivedServices).toBe(services);
        return handle;
      },
      services
    );

    const mounted = host.mount();
    expect(mounted).toBe(handle);
    expect(handle.initCount).toBe(1);
    expect("schematicEditor" in ownerWindow).toBe(false);

    const first = mounted?.destroy();
    const second = mounted?.destroy();
    expect(first).toBe(handle.cleanup);
    expect(second).toBe(handle.cleanup);
    expect(handle.destroyCount).toBe(1);
    expect("schematicEditor" in ownerWindow).toBe(false);
    await first;
  });
});

describe("schematic Web host import boundary", () => {
  it("keeps Web effects behind injected host ports", () => {
    [
      "./analysis/analysisController",
      "./contextMenuController",
      "./schematicClipboard",
      "./schematicClipboardWebAdapter",
      "./schematicDocumentFile",
      "./schematicDocumentWebAdapter",
      "./schematicDocumentTabs",
      "./workspaceAdapter"
    ].forEach((specifier) => expect(editorSource).not.toContain(`from \"${specifier}\"`));

    expect(editorSource).toContain('from "./schematicHostedEditor"');
    expect(editorSource).not.toContain('from "./schematicEditorHostPorts"');
    expect(editorSource).not.toContain("this.host.workspace.");
    expect(editorSource).not.toContain("this.host.documentFiles.");
    expect(editorSource).not.toContain("this.host.clipboard.");
    expect(editorSource).not.toContain("documentSessions");
    expect(editorSource).not.toContain("this.options.analysisEl");
    expect(editorSource).not.toMatch(/\bwindow\./);
    expect(editorSource).not.toMatch(/\bdocument\.(?:addEventListener|createElement)/);

    expect(hostSource).toContain('from "./workspacePersistence"');
    expect(hostSource).toContain('from "./schematicDocumentWebAdapter"');
    expect(hostSource).toContain('from "./schematicClipboardWebAdapter"');
    expect(hostSource).toContain("new SchematicAnalysisController");
    expect(hostSource).toContain("new SchematicDocumentTabs");
    expect(documentHostSource).toContain("private sessions:");
    expect(documentHostSource).toContain("this.options.workspace.persistDocument");
    expect(editorHostSource).toContain("new SchematicEditor(mounts, services, bridge)");
  });

  it("splits deterministic editor cleanup from Web controller cleanup", () => {
    const destroyStart = editorSource.indexOf("  destroy() {");
    const destroyEnd = editorSource.indexOf("  getState()", destroyStart);
    const destroy = editorSource.slice(destroyStart, destroyEnd);

    expect(destroy).toContain("this.lifecycleController.abort();");
    expect(destroy).toContain("this.junctionRenderCoordinator.cancelScheduledRefresh();");
    expect(destroy).toContain("this.notePropertyBatchSession.dispose();");
    expect(destroy).toContain("this.propertyInteractions.dispose();");
    expect(destroy).toContain("this.noteInteractionController.cancelDrag();");
    expect(destroy).not.toContain("this.analysisController.destroy();");
    expect(destroy).toContain("this.activeRenderRuntime.surface.destroy();");
    expect(destroy).toContain("this.noteLayer.destroy()");
    expect(editorHostSource).toContain("this.documentHost.destroy();");
    expect(editorHostSource).toContain("this.analysis.destroy();");
    expect(editorHostSource).toContain("this.contextMenu.destroy();");
    expect(editorHostSource).toContain("Promise.resolve(this.editor.destroy())");
  });
});
