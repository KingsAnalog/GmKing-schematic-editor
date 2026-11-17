import {
  Modal,
  Plugin,
  type App,
  type Editor,
  type MarkdownFileInfo,
  type MarkdownView
} from "obsidian";
import type { SchematicEditorCommand } from "@edahelper/schematic/editor";
import {
  createEmptySchematicContent,
  serializeSchematicContent
} from "@edahelper/schematic/core";
import { SchematicActiveEditorCoordinator } from "./activeEditorCoordinator";
import { SchematicBlockWidget } from "./blockWidget";
import { renderSchematicBlockSvg, updateSchematicBlockHeight } from "./blockSizing";
import { showSchematicExportMenu } from "./exports";
import { parseSchematicFence } from "./fence";
import { insertSchematicFenceAtSelection } from "./insertCommand";
import { createSchematicSessionField } from "./sessionField";
import { WindowCoordinatorRegistry } from "./windowCoordinatorRegistry";

export default class SchematicEditorPlugin extends Plugin {
  private readonly coordinators = new WindowCoordinatorRegistry(
    (ownerWindow) => new SchematicActiveEditorCoordinator(ownerWindow)
  );
  private nextSessionId = 1;
  private nextReadingId = 1;

  async onload() {
    const sessionField = createSchematicSessionField({
      createId: () => `schematic-block-${this.nextSessionId++}`,
      createWidget: (session) => new SchematicBlockWidget(
        session,
        (ownerWindow) => this.coordinatorFor(ownerWindow)
      )
    });
    this.registerEditorExtension(sessionField);
    this.registerMarkdownPostProcessor((element) => this.processReadingView(element));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.freezeAll("active-leaf-change")));
    this.registerEvent(this.app.workspace.on("file-open", () => this.freezeAll("file-open")));
    this.registerEvent(this.app.workspace.on("window-close", (_workspaceWindow, ownerWindow) => {
      this.coordinators.destroyWindow(ownerWindow);
    }));
    this.registerEvent(this.app.workspace.on("layout-change", () => {
      this.coordinators.forEach((coordinator) => coordinator.auditActiveRoot());
    }));
    this.registerCommands();
  }

  onunload() {
    this.coordinators.destroyAll();
  }

  private registerCommands() {
    this.addCommand({
      id: "insert-schematic",
      name: "Insert schematic",
      editorCallback: (editor, context) => this.insertSchematic(editor, context)
    });
    const commands: Array<[string, string, SchematicEditorCommand]> = [
      ["add-instance", "Add instance", { kind: "instance" }],
      ["draw-wire", "Draw signal wire", { kind: "wire", variant: "signal" }],
      ["draw-wide-wire", "Draw wide wire", { kind: "wire", variant: "wide" }],
      ["toggle-wire-route", "Toggle wire route mode", { kind: "wire-route", routeMode: "toggle" }],
      ["add-label", "Add net label", { kind: "label" }],
      ["add-note", "Add plain Note", { kind: "note" }],
      ["placement-copy", "Placement copy", { kind: "copy" }],
      ["stretch-move", "Use stretch move", { kind: "move", behavior: "stretch" }],
      ["move-only", "Use move-only", { kind: "move", behavior: "moveOnly" }],
      ["rotate", "Rotate selection or placement", { kind: "rotate" }],
      ["mirror-x", "Mirror selection left-right", { kind: "mirror", axis: "x" }],
      ["mirror-y", "Mirror selection up-down", { kind: "mirror", axis: "y" }],
      ["delete", "Delete selection or enter delete tool", { kind: "delete" }],
      ["temporary-delete", "Toggle temporary deletion", { kind: "delete", temporary: true }],
      ["fit", "Fit schematic", { kind: "fit" }],
      ["undo", "Undo schematic gesture", { kind: "undo" }],
      ["redo", "Redo schematic gesture", { kind: "redo" }],
      ["cancel-tool", "Cancel schematic tool", { kind: "cancel" }]
    ];
    commands.forEach(([id, name, command]) => this.addActiveCommand(id, name, (editor) => {
      editor.execute(command);
    }));
    this.addActiveCommand("toggle-properties", "Toggle Property Editor", (_editor, coordinator) => {
      coordinator.togglePropertyDrawer();
    });
    this.addActiveCommand("copy-export", "Copy schematic or selection", (_editor, coordinator) => {
      coordinator.showActiveExportMenu();
    });
    this.addActiveCommand("reset", "Reset schematic", (editor) => {
      new ConfirmResetModal(this.app, () => editor.execute({ kind: "reset" })).open();
    });
  }

  private addActiveCommand(
    id: string,
    name: string,
    execute: (
      editor: NonNullable<ReturnType<SchematicActiveEditorCoordinator["activeEditor"]>>,
      coordinator: SchematicActiveEditorCoordinator
    ) => void
  ) {
    this.addCommand({
      id,
      name,
      checkCallback: (checking) => {
        const coordinator = this.focusedCoordinator();
        const editor = coordinator?.activeEditor();
        if (!coordinator || !editor) return false;
        if (!checking) execute(editor, coordinator);
        return true;
      }
    });
  }

  private insertSchematic(editor: Editor, context: MarkdownView | MarkdownFileInfo) {
    const canonical = serializeSchematicContent(createEmptySchematicContent());
    const ownerDocument = "containerEl" in context
      ? context.containerEl.ownerDocument
      : this.app.workspace.activeLeaf?.view.containerEl.ownerDocument ?? document;
    const ownerWindow = ownerDocument.defaultView as Window & typeof globalThis;
    const coordinator = this.coordinatorFor(ownerWindow);
    insertSchematicFenceAtSelection(
      editor,
      canonical,
      (from, to) => coordinator.queueAutoActivation(from, to)
    );
  }

  private processReadingView(element: HTMLElement) {
    const codeBlocks = [
      ...(element.matches("pre") ? [element] : []),
      ...element.querySelectorAll<HTMLElement>("pre")
    ];
    codeBlocks.forEach((pre) => {
      const code = pre.querySelector<HTMLElement>("code.language-json, code[data-language='json']");
      if (!code) return;
      const source = code.textContent ?? "";
      const projection = parseSchematicFence(`\`\`\`json\n${source.replace(/\n?$/, "\n")}\`\`\``);
      if (!projection) return;
      const root = pre.ownerDocument.createElement("div");
      root.className = "schematic-editor-block schematic-editor-reading";
      if (projection.kind === "diagnostic") {
        const diagnostic = pre.ownerDocument.createElement("div");
        diagnostic.className = "schematic-editor-diagnostic";
        diagnostic.textContent = projection.message;
        root.appendChild(diagnostic);
      } else {
        const namespace = `schematic-reading-${this.nextReadingId++}`;
        const container = pre.ownerDocument.createElement("div");
        container.className = "schematic-static-svg";
        const rendering = renderSchematicBlockSvg(projection.content, namespace);
        updateSchematicBlockHeight(root, rendering);
        container.innerHTML = rendering.svg;
        root.appendChild(container);
        root.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          showSchematicExportMenu(
            { content: projection.content, namespace },
            { x: event.clientX, y: event.clientY },
            root.ownerDocument
          );
        });
      }
      pre.replaceWith(root);
    });
  }

  private coordinatorFor(ownerWindow: Window & typeof globalThis) {
    return this.coordinators.getOrCreate(ownerWindow);
  }

  private focusedCoordinator() {
    const focused = this.coordinators.find(
      (coordinator) => !!coordinator.activeEditor() && coordinator.ownerWindow.document.hasFocus()
    );
    if (focused) return focused;
    const ownerWindow = this.app.workspace.activeLeaf?.view.containerEl.ownerDocument.defaultView;
    return ownerWindow
      ? this.coordinators.get(ownerWindow)
      : null;
  }

  private freezeAll(reason: string) {
    this.coordinators.forEach((coordinator) => coordinator.freeze(reason));
  }
}

class ConfirmResetModal extends Modal {
  constructor(app: App, private readonly confirmReset: () => void) {
    super(app);
  }

  onOpen() {
    this.setTitle("Reset schematic?");
    this.contentEl.createEl("p", {
      text: "This removes all objects from the active schematic. The change can be undone from the note history."
    });
    const actions = this.contentEl.createDiv({ cls: "modal-button-container" });
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    const reset = actions.createEl("button", { text: "Reset", cls: "mod-warning" });
    reset.addEventListener("click", () => {
      this.confirmReset();
      this.close();
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}
