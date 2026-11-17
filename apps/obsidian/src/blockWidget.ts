import { WidgetType, type EditorView } from "@codemirror/view";
import type { SchematicActiveEditorCoordinator } from "./activeEditorCoordinator";
import {
  schematicBlockSessionsShareRuntime,
  subscribeSchematicBlockSession,
  type SchematicBlockSession
} from "./sessionField";

export class SchematicBlockWidget extends WidgetType {
  private readonly unsubscribeByRoot = new WeakMap<HTMLElement, () => void>();

  constructor(
    private readonly initialSession: SchematicBlockSession,
    private readonly coordinatorFor: (ownerWindow: Window & typeof globalThis) => SchematicActiveEditorCoordinator
  ) {
    super();
  }

  eq(other: SchematicBlockWidget) {
    return schematicBlockSessionsShareRuntime(this.initialSession, other.initialSession);
  }

  toDOM(view: EditorView) {
    const root = view.dom.ownerDocument.createElement("div");
    root.tabIndex = 0;
    this.coordinator(root).mountWidget(root, this.initialSession, view);
    this.subscribeRoot(root, view);
    return root;
  }

  updateDOM(root: HTMLElement, view: EditorView) {
    this.coordinator(root).updateWidget(root, this.initialSession, view);
    this.subscribeRoot(root, view);
    return true;
  }

  destroy(root: HTMLElement) {
    this.unsubscribeByRoot.get(root)?.();
    this.unsubscribeByRoot.delete(root);
    this.coordinator(root).disposeWidget(root, this.initialSession.id);
  }

  ignoreEvent() {
    return true;
  }

  private coordinator(root: HTMLElement) {
    const ownerWindow = root.ownerDocument.defaultView as Window & typeof globalThis;
    return this.coordinatorFor(ownerWindow);
  }

  private subscribeRoot(root: HTMLElement, view: EditorView) {
    if (this.unsubscribeByRoot.has(root)) return;
    this.unsubscribeByRoot.set(root, subscribeSchematicBlockSession(
      this.initialSession,
      (session) => {
        if (root.isConnected) this.coordinator(root).updateWidget(root, session, view);
      }
    ));
  }
}
