// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import { SchematicEditor } from "../../../src/schematic/editor";
import type { SchematicEditorCommand } from "../../../src/schematic/editorHandle";

type SchematicEditorEventHandlers = {
  handleKeydown(this: unknown, event: KeyboardEvent): void;
  handleSchematicContextMenu(this: unknown, event: MouseEvent): void;
  executeTypedCommand(this: unknown, command: SchematicEditorCommand): boolean;
  applyWireRouteModeCommand(
    this: unknown,
    routeMode: "orthogonal" | "freeAngle" | "toggle"
  ): boolean;
};

const handlers = SchematicEditor.prototype as unknown as SchematicEditorEventHandlers;

afterEach(() => {
  document.body.replaceChildren();
});

describe("schematic editor event boundary", () => {
  it("keeps shared shortcuts active inside an outer CM contenteditable host", () => {
    const { outer, shell, canvas } = nestedContenteditableCanvas();
    let shortcutKind = "none";
    const editor = {
      hostBridge: { ownsKeyboardTarget: () => true },
      options: { shellEl: shell },
      rectangleResizeSession: { isActive: false },
      noteLayer: { element: { querySelector: () => null, contains: () => false } },
      contextMenuController: { hidden: true },
      instanceSelector: {
        isQueryTarget: () => false,
        hasDropdownOpen: () => false,
        hasOptionsOpen: () => false,
        handleKeyboardCapture: () => false
      },
      noteInteractionController: { hasActiveEdit: () => false },
      transientToolSession: { mode: "select" },
      applySchematicKeyboardShortcutIntent: (
        event: KeyboardEvent,
        intent: { kind: string; preventDefault: boolean; stopPropagation: boolean }
      ) => {
        shortcutKind = intent.kind;
        if (intent.preventDefault) event.preventDefault();
        if (intent.stopPropagation) event.stopPropagation();
      }
    };
    outer.addEventListener("keydown", (event) => handlers.handleKeydown.call(editor, event));

    const event = new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
      cancelable: true
    });
    canvas.dispatchEvent(event);

    expect(shortcutKind).toBe("undo");
    expect(event.defaultPrevented).toBe(true);
  });

  it("keeps the shared canvas context menu active inside an outer CM contenteditable host", () => {
    const { outer, shell, canvas } = nestedContenteditableCanvas();
    let decisionKind = "none";
    const target = { kind: "component", id: "R7" };
    const editor = {
      options: { shellEl: shell },
      viewportController: { isMousePanActive: () => false },
      transientToolSession: { mode: "select" },
      contextTargetFromEvent: () => target,
      contextTargetIsSelected: () => true,
      hasExportableSelection: () => true,
      applySchematicContextMenuDecision: (
        _event: MouseEvent,
        _target: unknown,
        decision: { kind: string }
      ) => {
        decisionKind = decision.kind;
      }
    };
    outer.addEventListener("contextmenu", (event) => (
      handlers.handleSchematicContextMenu.call(editor, event as MouseEvent)
    ));

    canvas.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2
    }));

    expect(decisionKind).toBe("show");
  });

  it("routes typed wire mode changes through the shared controller only while drawing a wire", () => {
    let routeMode = "orthogonal" as "orthogonal" | "freeAngle";
    const previews: Array<{ x: number; y: number } | null> = [];
    const editor = {
      transientToolSession: { mode: "wire" },
      lastPointerPoint: { x: 60, y: 40 },
      wireToolController: {
        setRouteMode(next: "orthogonal" | "freeAngle") {
          routeMode = next;
          return routeMode;
        },
        toggleRouteMode() {
          routeMode = routeMode === "orthogonal" ? "freeAngle" : "orthogonal";
          return routeMode;
        }
      },
      applyWireRouteModeCommand(next: "orthogonal" | "freeAngle" | "toggle") {
        return handlers.applyWireRouteModeCommand.call(this, next);
      },
      updateWirePreview(point: { x: number; y: number } | null) {
        previews.push(point);
      }
    };

    expect(handlers.executeTypedCommand.call(editor, {
      kind: "wire-route",
      routeMode: "freeAngle"
    })).toBe(true);
    expect(routeMode).toBe("freeAngle");

    expect(handlers.executeTypedCommand.call(editor, {
      kind: "wire-route",
      routeMode: "toggle"
    })).toBe(true);
    expect(routeMode).toBe("orthogonal");
    expect(previews).toEqual([{ x: 60, y: 40 }, { x: 60, y: 40 }]);

    editor.transientToolSession.mode = "select";
    expect(handlers.executeTypedCommand.call(editor, {
      kind: "wire-route",
      routeMode: "toggle"
    })).toBe(false);
    expect(routeMode).toBe("orthogonal");
    expect(previews).toHaveLength(2);
  });
});

function nestedContenteditableCanvas() {
  const outer = document.createElement("div");
  outer.setAttribute("contenteditable", "true");
  const shell = document.createElement("div");
  const canvas = document.createElement("div");
  shell.append(canvas);
  outer.append(shell);
  document.body.append(outer);
  return { outer, shell, canvas };
}
