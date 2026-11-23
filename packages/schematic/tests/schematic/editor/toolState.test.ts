import { describe, expect, it } from "vitest";
import {
  buildCancelToolIntent,
  buildCopyToolNoSourceEntryIntent,
  buildCopyToolSourceEntryIntent,
  buildDeleteToolEntryIntent,
  buildMoveBehaviorToolEntryIntent,
  buildPlacementToolEntryIntent,
  buildWireToolEntryIntent,
  isDeleteToolMode,
  isToolMode,
  projectSchematicEscapeKeyIntent,
  projectSchematicKeyboardShortcut,
  type SchematicEscapeKeyIntent,
  type SchematicEscapeKeyProjectionInput,
  type SchematicKeyboardShortcutIntent,
  type SchematicKeyboardShortcutSnapshot,
  projectSchematicToolbarCommand,
  projectSchematicToolbarCommandIntent,
  type ToolbarProjectionInput,
  type ToolMode
} from "../../../src/schematic/toolState";

const noKeyboardShortcutIntent: SchematicKeyboardShortcutIntent = {
  kind: "none",
  preventDefault: false,
  stopPropagation: false
};

const noEscapeKeyIntent: SchematicEscapeKeyIntent = {
  kind: "none",
  preventDefault: false,
  stopPropagation: false,
  focusCanvas: false
};

const baseEscapeKeyInput: SchematicEscapeKeyProjectionInput = {
  key: "Escape",
  contextMenuOpen: false,
  queryTarget: false,
  dropdownOpen: false,
  optionsOpen: false,
  editable: false,
};

const escapeKeyCases: Array<{
  label: string;
  input: Partial<SchematicEscapeKeyProjectionInput>;
  expected: SchematicEscapeKeyIntent;
}> = [
  {
    label: "projects context menu close before every other Escape target",
    input: {
      contextMenuOpen: true,
      queryTarget: true,
      dropdownOpen: true,
      optionsOpen: true,
      editable: true,
    },
    expected: { kind: "close-context-menu", preventDefault: true, stopPropagation: true, focusCanvas: true }
  },
  {
    label: "projects instance dropdown close before options close",
    input: { queryTarget: true, dropdownOpen: true, optionsOpen: true },
    expected: { kind: "close-instance-dropdown", preventDefault: true, stopPropagation: true, focusCanvas: false }
  },
  {
    label: "projects instance dropdown close before an editable query can handle Escape",
    input: {
      queryTarget: true,
      dropdownOpen: true,
      editable: true,
    },
    expected: { kind: "close-instance-dropdown", preventDefault: true, stopPropagation: true, focusCanvas: false }
  },
  {
    label: "projects instance options close",
    input: { queryTarget: true, optionsOpen: true },
    expected: { kind: "close-instance-options", preventDefault: true, stopPropagation: true, focusCanvas: false }
  },
  {
    label: "ignores open instance popups when Escape did not originate from the query target",
    input: { queryTarget: false, dropdownOpen: true, optionsOpen: true },
    expected: { kind: "cancel-tool", preventDefault: true, stopPropagation: true, focusCanvas: false }
  },
  {
    label: "leaves editable controls to their local Escape handler",
    input: { editable: true },
    expected: noEscapeKeyIntent
  },
  {
    label: "projects plain Escape to cancel the active tool",
    input: {},
    expected: { kind: "cancel-tool", preventDefault: true, stopPropagation: true, focusCanvas: false }
  },
  {
    label: "leaves non-Escape keys as no-ops",
    input: {
      key: "Enter",
      contextMenuOpen: true,
      queryTarget: true,
      dropdownOpen: true,
      optionsOpen: true,
      editable: true,
    },
    expected: noEscapeKeyIntent
  }
];

const keyboardShortcutCases: Array<{
  label: string;
  snapshot: SchematicKeyboardShortcutSnapshot;
  mode?: ToolMode;
  expected: SchematicKeyboardShortcutIntent;
}> = [
  {
    label: "projects Ctrl+Z to undo with propagation stopped",
    snapshot: { key: "z", ctrlKey: true },
    expected: { kind: "undo", preventDefault: true, stopPropagation: true }
  },
  {
    label: "projects Meta+Z to undo with propagation stopped",
    snapshot: { key: "z", metaKey: true },
    expected: { kind: "undo", preventDefault: true, stopPropagation: true }
  },
  {
    label: "projects Ctrl+Shift+Z to redo with propagation stopped",
    snapshot: { key: "Z", ctrlKey: true, shiftKey: true },
    expected: { kind: "redo", preventDefault: true, stopPropagation: true }
  },
  {
    label: "projects Ctrl+Y to redo with propagation stopped",
    snapshot: { key: "y", ctrlKey: true },
    expected: { kind: "redo", preventDefault: true, stopPropagation: true }
  },
  {
    label: "projects Enter in wire mode to finish wire",
    snapshot: { key: "Enter" },
    mode: "wire",
    expected: { kind: "finish-wire", preventDefault: true, stopPropagation: false }
  },
  {
    label: "leaves Enter outside wire mode as a no-op",
    snapshot: { key: "Enter" },
    mode: "select",
    expected: noKeyboardShortcutIntent
  },
  {
    label: "projects Delete to delete selected objects or begin delete mode",
    snapshot: { key: "Delete" },
    expected: { kind: "delete-selected-or-begin-tool", preventDefault: true, stopPropagation: false }
  },
  {
    label: "projects Backspace to delete selected objects or begin delete mode",
    snapshot: { key: "Backspace" },
    expected: { kind: "delete-selected-or-begin-tool", preventDefault: true, stopPropagation: false }
  },
  {
    label: "projects Shift+Delete to temporary-delete selected objects or begin temporary-delete mode",
    snapshot: { key: "Delete", shiftKey: true },
    expected: { kind: "temporary-delete-selected-or-begin-tool", preventDefault: true, stopPropagation: false }
  },
  {
    label: "projects Shift+Backspace to temporary-delete selected objects or begin temporary-delete mode",
    snapshot: { key: "Backspace", shiftKey: true },
    expected: { kind: "temporary-delete-selected-or-begin-tool", preventDefault: true, stopPropagation: false }
  },
  {
    label: "projects i to open the instance palette",
    snapshot: { key: "i" },
    expected: { kind: "open-instance-palette", preventDefault: true, stopPropagation: false }
  },
  {
    label: "projects w to begin signal wire mode",
    snapshot: { key: "w" },
    expected: { kind: "begin-wire", variant: "signal", preventDefault: true, stopPropagation: false }
  },
  {
    label: "projects Shift+w to begin wide wire mode",
    snapshot: { key: "W", shiftKey: true },
    expected: { kind: "begin-wire", variant: "wide", preventDefault: true, stopPropagation: false }
  },
  {
    label: "projects c to begin copy mode",
    snapshot: { key: "c" },
    expected: { kind: "begin-copy", preventDefault: true, stopPropagation: false }
  },
  {
    label: "projects Shift+n without other modifiers to create a note",
    snapshot: { key: "N", shiftKey: true },
    expected: { kind: "create-note", preventDefault: true, stopPropagation: false }
  },
  {
    label: "leaves plain n as a no-op",
    snapshot: { key: "n" },
    expected: noKeyboardShortcutIntent
  },
  {
    label: "leaves Alt+Shift+n as a no-op",
    snapshot: { key: "N", shiftKey: true, altKey: true },
    expected: noKeyboardShortcutIntent
  },
  {
    label: "projects m to stretch move behavior",
    snapshot: { key: "m" },
    expected: { kind: "set-move-behavior", behavior: "stretch", preventDefault: true, stopPropagation: false }
  },
  {
    label: "projects Shift+m to move-only behavior",
    snapshot: { key: "M", shiftKey: true },
    expected: { kind: "set-move-behavior", behavior: "moveOnly", preventDefault: true, stopPropagation: false }
  },
  {
    label: "projects r to rotate selection or preview",
    snapshot: { key: "r" },
    expected: { kind: "rotate", preventDefault: true, stopPropagation: false }
  },
  {
    label: "projects Ctrl+R to mirror up-down and stop browser refresh",
    snapshot: { key: "r", ctrlKey: true },
    expected: { kind: "mirror", axis: "y", preventDefault: true, stopPropagation: true }
  },
  {
    label: "projects Shift+r to mirror selection or preview left-right",
    snapshot: { key: "R", shiftKey: true },
    expected: { kind: "mirror", axis: "x", preventDefault: true, stopPropagation: false }
  },
  {
    label: "leaves Ctrl+Shift+R available for the browser",
    snapshot: { key: "R", ctrlKey: true, shiftKey: true },
    expected: noKeyboardShortcutIntent
  },
  {
    label: "leaves Meta+R available for the host",
    snapshot: { key: "r", metaKey: true },
    expected: noKeyboardShortcutIntent
  },
  {
    label: "projects f to fit the canvas",
    snapshot: { key: "f" },
    expected: { kind: "fit", preventDefault: true, stopPropagation: false }
  },
  {
    label: "projects u to undo without stopping propagation",
    snapshot: { key: "u" },
    expected: { kind: "undo", preventDefault: true, stopPropagation: false }
  },
  {
    label: "projects Shift+u to redo without stopping propagation",
    snapshot: { key: "U", shiftKey: true },
    expected: { kind: "redo", preventDefault: true, stopPropagation: false }
  },
  {
    label: "leaves unrelated keys as no-ops",
    snapshot: { key: "q" },
    expected: noKeyboardShortcutIntent
  }
];

const toolbarCommandIntentCases: Array<{
  command: string;
  expected: ReturnType<typeof projectSchematicToolbarCommandIntent>;
}> = [
  { command: "instance", expected: { kind: "toggle-instance-tool" } },
  { command: "wire", expected: { kind: "toggle-wire-tool", variant: "signal" } },
  { command: "note", expected: { kind: "create-note" } },
  { command: "rotate", expected: { kind: "rotate" } },
  { command: "mirror-x", expected: { kind: "mirror", axis: "y" } },
  { command: "mirror-y", expected: { kind: "mirror", axis: "x" } },
  { command: "delete", expected: { kind: "delete-selected-or-begin-tool" } },
  { command: "temp-delete", expected: { kind: "temporary-delete-selected-or-begin-tool" } },
  { command: "presentation", expected: { kind: "toggle-presentation-mode" } },
  { command: "fit", expected: { kind: "fit" } },
  { command: "reset", expected: { kind: "reset" } },
  { command: "undo", expected: { kind: "undo" } },
  { command: "redo", expected: { kind: "redo" } },
  { command: "unknown", expected: { kind: "none" } },
  { command: "", expected: { kind: "none" } }
];

describe("schematic tool state", () => {
  it("builds the cancel intent", () => {
    expect(buildCancelToolIntent()).toEqual({
      nextMode: "select",
      closeInstancePanel: true,
      focusTarget: "canvas",
      status: "Tool canceled."
    });
  });

  it("builds the delete tool entry intent", () => {
    expect(buildDeleteToolEntryIntent("delete")).toEqual({
      nextMode: "delete",
      closeInstancePanel: true,
      clearSelection: true,
      focusTarget: "canvas",
      status: "Delete mode: click an object to delete it, drag a box to delete enclosed objects, Esc cancels."
    });
  });

  it("builds the temporary delete tool entry intent", () => {
    expect(buildDeleteToolEntryIntent("temp-delete")).toEqual({
      nextMode: "temp-delete",
      closeInstancePanel: true,
      clearSelection: true,
      focusTarget: "canvas",
      status: "Temporary Delete mode: click a component or wire to toggle it, drag a box to toggle enclosed components and wires, Esc cancels."
    });
  });

  it("builds the signal wire tool entry intent", () => {
    expect(buildWireToolEntryIntent("signal")).toEqual({
      nextMode: "wire",
      closeInstancePanel: true,
      wireVariant: "signal",
      focusTarget: "canvas",
      status: "Wire mode: click a pin, wire, or grid point to start. Double-click or press Enter to finish."
    });
  });

  it("builds the wide wire tool entry intent", () => {
    expect(buildWireToolEntryIntent("wide")).toEqual({
      nextMode: "wire",
      closeInstancePanel: true,
      wireVariant: "wide",
      focusTarget: "canvas",
      status: "Wide wire mode: click a pin, wire, or grid point to start. Double-click or press Enter to finish."
    });
  });

  it("builds the placement tool entry intent with default selector options", () => {
    const item = { paletteId: "custom-item" };

    expect(buildPlacementToolEntryIntent(item)).toEqual({
      nextMode: "place",
      placementItem: item,
      instanceSelectorBeginPlacementOptions: {
        armKeyboard: undefined,
        prefillQuery: undefined
      },
      updatePlacementPreview: true,
      syncToolUi: true,
      focusTarget: "canvas",
      syncPlacementStatus: true
    });
  });

  it("maps placement entry options to InstanceSelector begin-placement options", () => {
    expect(buildPlacementToolEntryIntent("resistor", { armPaletteKeyboard: true, prefillQuery: true })).toEqual({
      nextMode: "place",
      placementItem: "resistor",
      instanceSelectorBeginPlacementOptions: {
        armKeyboard: true,
        prefillQuery: true
      },
      updatePlacementPreview: true,
      syncToolUi: true,
      focusTarget: "canvas",
      syncPlacementStatus: true
    });
  });

  it("builds the stretch move behavior tool entry intent", () => {
    const intent = buildMoveBehaviorToolEntryIntent("stretch");

    expect(intent).toEqual({
      moveBehavior: "stretch",
      nextMode: "move",
      closeInstancePanel: true,
      syncToolUi: true,
      focusTarget: "canvas",
      status: "Stretch move: click an object or drag a box to move with connections. Esc cancels."
    });
  });

  it("builds the move-only behavior tool entry intent", () => {
    const intent = buildMoveBehaviorToolEntryIntent("moveOnly");

    expect(intent).toEqual({
      moveBehavior: "moveOnly",
      nextMode: "move",
      closeInstancePanel: true,
      syncToolUi: true,
      focusTarget: "canvas",
      status: "Move only: click an object or drag a box to move without pulling attached wires. Esc cancels."
    });
  });

  it("builds the copy tool no-source entry intent", () => {
    expect(buildCopyToolNoSourceEntryIntent()).toEqual({
      nextMode: "copy",
      closeInstancePanel: true,
      suppressNextBlankClick: false,
      hasSource: false,
      syncToolUi: true,
      focusTarget: "canvas",
      status: "Copy mode: click an object or drag a box to copy. Esc cancels."
    });
  });

  it("builds the copy tool source-attached entry intent for one object", () => {
    expect(buildCopyToolSourceEntryIntent(1)).toEqual({
      nextMode: "copy",
      closeInstancePanel: true,
      suppressNextBlankClick: false,
      hasSource: true,
      sourceCount: 1,
      updateCopyPreview: true,
      syncToolUi: true,
      focusTarget: "canvas",
      status: "Copy mode: 1 object attached to cursor. Click to place; Esc cancels."
    });
  });

  it("builds the copy tool source-attached entry intent for multiple objects", () => {
    expect(buildCopyToolSourceEntryIntent(3)).toEqual({
      nextMode: "copy",
      closeInstancePanel: true,
      suppressNextBlankClick: false,
      hasSource: true,
      sourceCount: 3,
      updateCopyPreview: true,
      syncToolUi: true,
      focusTarget: "canvas",
      status: "Copy mode: 3 objects attached to cursor. Click to place; Esc cancels."
    });
  });

  it("projects toolbar active state and undo/redo disabled state", () => {
    const state: ToolbarProjectionInput = {
      mode: "wire",
      presentationMode: true,
      canUndo: false,
      canRedo: true
    };

    expect(projectSchematicToolbarCommand(state, { command: "instance", kind: "tool" })).toEqual({
      active: false,
      ariaPressed: false
    });
    expect(projectSchematicToolbarCommand(state, { command: "wire", kind: "tool" })).toEqual({
      active: true,
      ariaPressed: true
    });
    expect(projectSchematicToolbarCommand(state, { command: "presentation", kind: "toggle" })).toEqual({
      active: true,
      ariaPressed: true
    });
    expect(projectSchematicToolbarCommand({ ...state, mode: "delete" }, { command: "delete", kind: "action" })).toEqual({
      active: true,
      ariaPressed: null
    });
    expect(projectSchematicToolbarCommand({ ...state, mode: "temp-delete" }, { command: "temp-delete", kind: "action" })).toEqual({
      active: true,
      ariaPressed: null
    });
    expect(projectSchematicToolbarCommand({ ...state, mode: "copy" }, { command: "copy", kind: "tool" })).toEqual({
      active: true,
      ariaPressed: true
    });
    expect(projectSchematicToolbarCommand(state, { command: "undo", kind: "action" })).toEqual({
      active: false,
      ariaPressed: null,
      disabled: true
    });
    expect(projectSchematicToolbarCommand(state, { command: "redo", kind: "action" })).toEqual({
      active: false,
      ariaPressed: null,
      disabled: false
    });
  });

  it.each(toolbarCommandIntentCases)("projects toolbar command '$command' to a typed intent", ({ command, expected }) => {
    expect(projectSchematicToolbarCommandIntent(command)).toEqual(expected);
  });

  it.each(keyboardShortcutCases)("$label", ({ snapshot, mode = "select", expected }) => {
    expect(projectSchematicKeyboardShortcut(snapshot, mode)).toEqual(expected);
  });

  it.each(escapeKeyCases)("$label", ({ input, expected }) => {
    expect(projectSchematicEscapeKeyIntent({ ...baseEscapeKeyInput, ...input })).toEqual(expected);
  });

  it("leaves Escape handling outside the regular schematic keyboard shortcut projection", () => {
    expect(projectSchematicKeyboardShortcut({ key: "Escape" }, "select")).toEqual(noKeyboardShortcutIntent);
  });

  it("leaves slash to the host instead of consuming it as a schematic shortcut", () => {
    expect(projectSchematicKeyboardShortcut({ key: "/" }, "select")).toEqual(noKeyboardShortcutIntent);
  });

  it("recognizes only concrete schematic tool modes", () => {
    expect(isToolMode("select")).toBe(true);
    expect(isToolMode("place")).toBe(true);
    expect(isToolMode("wire")).toBe(true);
    expect(isToolMode("delete")).toBe(true);
    expect(isToolMode("temp-delete")).toBe(true);
    expect(isToolMode("copy")).toBe(true);
    expect(isToolMode("net-pick")).toBe(false);
  });

  it("recognizes delete tool modes", () => {
    expect(isDeleteToolMode("delete")).toBe(true);
    expect(isDeleteToolMode("temp-delete")).toBe(true);
    expect(isDeleteToolMode("select")).toBe(false);
    expect(isDeleteToolMode("place")).toBe(false);
    expect(isDeleteToolMode("wire")).toBe(false);
    expect(isDeleteToolMode("copy")).toBe(false);
  });
});
