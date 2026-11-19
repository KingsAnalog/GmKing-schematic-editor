import type { WireVariant } from "./types";

export const TOOL_MODES = ["select", "place", "wire", "label", "delete", "temp-delete", "copy"] as const;

export type ToolMode = (typeof TOOL_MODES)[number];
export type ToolFocusTarget = "canvas" | "palette" | "none";
export type DeleteToolMode = Extract<ToolMode, "delete" | "temp-delete">;
export type WireToolVariant = WireVariant;

export type SchematicKeyboardShortcutSnapshot = {
  key: string;
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
};

type SchematicKeyboardShortcutIntentBase = {
  preventDefault: boolean;
  stopPropagation: boolean;
};

export type SchematicKeyboardShortcutIntent =
  | (SchematicKeyboardShortcutIntentBase & { kind: "none"; preventDefault: false; stopPropagation: false })
  | (SchematicKeyboardShortcutIntentBase & { kind: "undo"; preventDefault: true })
  | (SchematicKeyboardShortcutIntentBase & { kind: "redo"; preventDefault: true })
  | (SchematicKeyboardShortcutIntentBase & { kind: "finish-wire"; preventDefault: true; stopPropagation: false })
  | (SchematicKeyboardShortcutIntentBase & { kind: "delete-selected-or-begin-tool"; preventDefault: true; stopPropagation: false })
  | (SchematicKeyboardShortcutIntentBase & { kind: "temporary-delete-selected-or-begin-tool"; preventDefault: true; stopPropagation: false })
  | (SchematicKeyboardShortcutIntentBase & { kind: "open-instance-palette"; preventDefault: true; stopPropagation: false })
  | (SchematicKeyboardShortcutIntentBase & {
      kind: "begin-wire";
      preventDefault: true;
      stopPropagation: false;
      variant: WireToolVariant;
    })
  | (SchematicKeyboardShortcutIntentBase & { kind: "begin-copy"; preventDefault: true; stopPropagation: false })
  | (SchematicKeyboardShortcutIntentBase & { kind: "begin-label"; preventDefault: true; stopPropagation: false })
  | (SchematicKeyboardShortcutIntentBase & { kind: "create-note"; preventDefault: true; stopPropagation: false })
  | (SchematicKeyboardShortcutIntentBase & {
      kind: "set-move-behavior";
      preventDefault: true;
      stopPropagation: false;
      behavior: "stretch" | "moveOnly";
    })
  | (SchematicKeyboardShortcutIntentBase & { kind: "rotate"; preventDefault: true; stopPropagation: false })
  | (SchematicKeyboardShortcutIntentBase & { kind: "mirror"; preventDefault: true; stopPropagation: false; axis: "x" | "y" })
  | (SchematicKeyboardShortcutIntentBase & { kind: "fit"; preventDefault: true; stopPropagation: false })
  | (SchematicKeyboardShortcutIntentBase & { kind: "toggle-log"; preventDefault: true; stopPropagation: true });

export type SchematicEscapeKeyProjectionInput = {
  key: string;
  contextMenuOpen: boolean;
  queryTarget: boolean;
  dropdownOpen: boolean;
  optionsOpen: boolean;
  editable: boolean;
  noteEditorTarget: boolean;
  noteEditingActive: boolean;
};

type SchematicEscapeKeyIntentBase = {
  preventDefault: boolean;
  stopPropagation: boolean;
  focusCanvas: boolean;
};

export type SchematicEscapeKeyIntent =
  | (SchematicEscapeKeyIntentBase & { kind: "none"; preventDefault: false; stopPropagation: false; focusCanvas: false })
  | (SchematicEscapeKeyIntentBase & { kind: "close-context-menu"; preventDefault: true; stopPropagation: true; focusCanvas: true })
  | (SchematicEscapeKeyIntentBase & {
      kind: "close-instance-dropdown";
      preventDefault: true;
      stopPropagation: true;
      focusCanvas: false;
    })
  | (SchematicEscapeKeyIntentBase & {
      kind: "close-instance-options";
      preventDefault: true;
      stopPropagation: true;
      focusCanvas: false;
    })
  | (SchematicEscapeKeyIntentBase & { kind: "finish-note-edit"; preventDefault: true; stopPropagation: true; focusCanvas: true })
  | (SchematicEscapeKeyIntentBase & { kind: "cancel-tool"; preventDefault: true; stopPropagation: true; focusCanvas: false });

export type CancelToolIntent = {
  nextMode: Extract<ToolMode, "select">;
  closeInstancePanel: true;
  focusTarget: Extract<ToolFocusTarget, "canvas">;
  status: string;
};

export type DeleteToolEntryIntent = {
  nextMode: DeleteToolMode;
  closeInstancePanel: true;
  clearSelection: true;
  focusTarget: Extract<ToolFocusTarget, "canvas">;
  status: string;
};

export type WireToolEntryIntent = {
  nextMode: Extract<ToolMode, "wire">;
  closeInstancePanel: true;
  wireVariant: WireToolVariant;
  focusTarget: Extract<ToolFocusTarget, "canvas">;
  status: string;
};

export type PlacementToolEntryOptions = {
  armPaletteKeyboard?: boolean;
  prefillQuery?: boolean;
};

export type PlacementToolEntryIntent<TItem> = {
  nextMode: Extract<ToolMode, "place">;
  placementItem: TItem;
  instanceSelectorBeginPlacementOptions: {
    armKeyboard?: boolean;
    prefillQuery?: boolean;
  };
  updatePlacementPreview: true;
  syncToolUi: true;
  focusTarget: Extract<ToolFocusTarget, "canvas">;
  syncPlacementStatus: true;
};

export type MoveBehaviorToolEntryBehavior = "stretch" | "moveOnly";

export type MoveBehaviorToolEntryIntent = {
  moveBehavior: MoveBehaviorToolEntryBehavior;
  nextMode: Extract<ToolMode, "select">;
  closeInstancePanel: true;
  syncToolUi: true;
  focusTarget: Extract<ToolFocusTarget, "canvas">;
  status: string;
};

type CopyToolEntryIntentBase = {
  nextMode: Extract<ToolMode, "copy">;
  closeInstancePanel: true;
  suppressNextBlankClick: false;
  syncToolUi: true;
  focusTarget: Extract<ToolFocusTarget, "canvas">;
  updateCopyPreview?: true;
  status: string;
};

export type CopyToolNoSourceEntryIntent = CopyToolEntryIntentBase & {
  hasSource: false;
  awaitingReference: false;
};

export type CopyToolSourceEntryIntent = CopyToolEntryIntentBase & {
  hasSource: true;
  awaitingReference: false;
  sourceCount: number;
  updateCopyPreview: true;
};

export type CopyToolReferenceEntryIntent = CopyToolEntryIntentBase & {
  hasSource: false;
  awaitingReference: true;
  sourceCount: number;
};

export type CopyToolEntryIntent = CopyToolNoSourceEntryIntent | CopyToolSourceEntryIntent | CopyToolReferenceEntryIntent;

export type ToolbarProjectionInput = {
  mode: ToolMode;
  presentationMode: boolean;
  canUndo: boolean;
  canRedo: boolean;
};

export type ToolbarCommandProjection = {
  active: boolean;
  ariaPressed: boolean | null;
  disabled?: boolean;
};

export type SchematicToolbarCommandIntent =
    | { kind: "none" }
    | { kind: "toggle-instance-tool" }
    | { kind: "toggle-wire-tool"; variant: Extract<WireToolVariant, "signal"> }
    | { kind: "toggle-label-tool" }
    | { kind: "create-note" }
  | { kind: "rotate" }
  | { kind: "mirror"; axis: "x" | "y" }
  | { kind: "delete-selected-or-begin-tool" }
  | { kind: "temporary-delete-selected-or-begin-tool" }
  | { kind: "toggle-presentation-mode" }
  | { kind: "fit" }
  | { kind: "reset" }
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "open-library" }
  | { kind: "open-right-view"; view: "analysis" | "netlist" }
  | { kind: "toggle-log" };

const TOOL_MODE_SET = new Set<string>(TOOL_MODES);
const DELETE_TOOL_ENTRY_STATUS: Record<DeleteToolMode, string> = {
  delete: "Delete mode: click an object to delete it, drag a box to delete enclosed objects, Esc cancels.",
  "temp-delete": "Temporary Delete mode: click a component or wire to toggle it, drag a box to toggle enclosed components and wires, Esc cancels."
};
const WIRE_TOOL_ENTRY_STATUS: Record<WireToolVariant, string> = {
  signal: "Wire mode: click a pin or grid point to start; empty clicks add bends; pin click or Enter terminates.",
  wide: "Wide wire mode: click a pin or grid point to start; empty clicks add bends; pin click or Enter terminates."
};
const MOVE_BEHAVIOR_TOOL_ENTRY_STATUS: Record<MoveBehaviorToolEntryBehavior, string> = {
  stretch: "Stretch move active: moved components pull attached wire endpoints. Shift+M switches to move-only.",
  moveOnly: "Move-only active: moved components do not pull attached wires. M switches back to stretch move."
};

export function isToolMode(value: string): value is ToolMode {
  return TOOL_MODE_SET.has(value);
}

export function isDeleteToolMode(mode: ToolMode): mode is DeleteToolMode {
  return mode === "delete" || mode === "temp-delete";
}

export function projectSchematicKeyboardShortcut(
  snapshot: SchematicKeyboardShortcutSnapshot,
  mode: ToolMode
): SchematicKeyboardShortcutIntent {
  const key = snapshot.key.toLowerCase();
  const modifierKey = !!snapshot.ctrlKey || !!snapshot.metaKey;

  if (modifierKey && snapshot.shiftKey && key === "l") {
    return { kind: "toggle-log", preventDefault: true, stopPropagation: true };
  }

  if (modifierKey && key === "z") {
    return snapshot.shiftKey
      ? { kind: "redo", preventDefault: true, stopPropagation: true }
      : { kind: "undo", preventDefault: true, stopPropagation: true };
  }

  if (modifierKey && key === "y") {
    return { kind: "redo", preventDefault: true, stopPropagation: true };
  }

  if (key === "enter" && mode === "wire") {
    return { kind: "finish-wire", preventDefault: true, stopPropagation: false };
  }

  if (key === "delete" || key === "backspace") {
    return snapshot.shiftKey
      ? { kind: "temporary-delete-selected-or-begin-tool", preventDefault: true, stopPropagation: false }
      : { kind: "delete-selected-or-begin-tool", preventDefault: true, stopPropagation: false };
  }

  if (key === "i") {
    return { kind: "open-instance-palette", preventDefault: true, stopPropagation: false };
  }

  if (key === "w") {
    return { kind: "begin-wire", variant: snapshot.shiftKey ? "wide" : "signal", preventDefault: true, stopPropagation: false };
  }

  if (key === "c") {
    return { kind: "begin-copy", preventDefault: true, stopPropagation: false };
  }

  if (key === "l") {
    return { kind: "begin-label", preventDefault: true, stopPropagation: false };
  }

  if (snapshot.shiftKey && !snapshot.ctrlKey && !snapshot.metaKey && !snapshot.altKey && key === "n") {
    return { kind: "create-note", preventDefault: true, stopPropagation: false };
  }

  if (key === "m") {
    return {
      kind: "set-move-behavior",
      behavior: snapshot.shiftKey ? "moveOnly" : "stretch",
      preventDefault: true,
      stopPropagation: false
    };
  }

  if (snapshot.shiftKey && !snapshot.ctrlKey && !snapshot.metaKey && !snapshot.altKey && key === "r") {
    return { kind: "mirror", axis: "x", preventDefault: true, stopPropagation: false };
  }

  if (key === "r") {
    return { kind: "rotate", preventDefault: true, stopPropagation: false };
  }

  if (key === "f") {
    return { kind: "fit", preventDefault: true, stopPropagation: false };
  }

  if (key === "u") {
    return snapshot.shiftKey
      ? { kind: "redo", preventDefault: true, stopPropagation: false }
      : { kind: "undo", preventDefault: true, stopPropagation: false };
  }

  return { kind: "none", preventDefault: false, stopPropagation: false };
}

export function projectSchematicEscapeKeyIntent(input: SchematicEscapeKeyProjectionInput): SchematicEscapeKeyIntent {
  if (input.key.toLowerCase() !== "escape") {
    return { kind: "none", preventDefault: false, stopPropagation: false, focusCanvas: false };
  }

  if (input.contextMenuOpen) {
    return { kind: "close-context-menu", preventDefault: true, stopPropagation: true, focusCanvas: true };
  }

  if (input.queryTarget && input.dropdownOpen) {
    return { kind: "close-instance-dropdown", preventDefault: true, stopPropagation: true, focusCanvas: false };
  }

  if (input.queryTarget && input.optionsOpen) {
    return { kind: "close-instance-options", preventDefault: true, stopPropagation: true, focusCanvas: false };
  }

  if (input.editable && input.noteEditorTarget && input.noteEditingActive) {
    return { kind: "finish-note-edit", preventDefault: true, stopPropagation: true, focusCanvas: true };
  }

  if (input.editable) {
    return { kind: "none", preventDefault: false, stopPropagation: false, focusCanvas: false };
  }

  return { kind: "cancel-tool", preventDefault: true, stopPropagation: true, focusCanvas: false };
}

export function projectSchematicToolbarCommandIntent(command: string): SchematicToolbarCommandIntent {
  switch (command) {
    case "instance":
      return { kind: "toggle-instance-tool" };
    case "wire":
      return { kind: "toggle-wire-tool", variant: "signal" };
    case "label":
      return { kind: "toggle-label-tool" };
    case "note":
      return { kind: "create-note" };
    case "rotate":
      return { kind: "rotate" };
    case "mirror-x":
      return { kind: "mirror", axis: "x" };
    case "mirror-y":
      return { kind: "mirror", axis: "y" };
    case "delete":
      return { kind: "delete-selected-or-begin-tool" };
    case "temp-delete":
      return { kind: "temporary-delete-selected-or-begin-tool" };
    case "presentation":
      return { kind: "toggle-presentation-mode" };
    case "fit":
      return { kind: "fit" };
    case "reset":
      return { kind: "reset" };
    case "undo":
      return { kind: "undo" };
    case "redo":
      return { kind: "redo" };
    case "library":
      return { kind: "open-library" };
    case "analysis":
      return { kind: "open-right-view", view: "analysis" };
    case "netlist":
      return { kind: "open-right-view", view: "netlist" };
    case "diagnostics":
      return { kind: "open-right-view", view: "netlist" };
    case "log":
      return { kind: "toggle-log" };
    default:
      return { kind: "none" };
  }
}

export function buildCancelToolIntent(): CancelToolIntent {
  return {
    nextMode: "select",
    closeInstancePanel: true,
    focusTarget: "canvas",
    status: "Tool canceled."
  };
}

export function buildDeleteToolEntryIntent(nextMode: DeleteToolMode): DeleteToolEntryIntent {
  return {
    nextMode,
    closeInstancePanel: true,
    clearSelection: true,
    focusTarget: "canvas",
    status: DELETE_TOOL_ENTRY_STATUS[nextMode]
  };
}

export function buildWireToolEntryIntent(variant: WireToolVariant): WireToolEntryIntent {
  return {
    nextMode: "wire",
    closeInstancePanel: true,
    wireVariant: variant,
    focusTarget: "canvas",
    status: WIRE_TOOL_ENTRY_STATUS[variant]
  };
}

export function buildPlacementToolEntryIntent<TItem>(
  item: TItem,
  options: PlacementToolEntryOptions = {}
): PlacementToolEntryIntent<TItem> {
  return {
    nextMode: "place",
    placementItem: item,
    instanceSelectorBeginPlacementOptions: {
      armKeyboard: options.armPaletteKeyboard,
      prefillQuery: options.prefillQuery
    },
    updatePlacementPreview: true,
    syncToolUi: true,
    focusTarget: "canvas",
    syncPlacementStatus: true
  };
}

export function buildMoveBehaviorToolEntryIntent(behavior: MoveBehaviorToolEntryBehavior): MoveBehaviorToolEntryIntent {
  return {
    moveBehavior: behavior,
    nextMode: "select",
    closeInstancePanel: true,
    syncToolUi: true,
    focusTarget: "canvas",
    status: MOVE_BEHAVIOR_TOOL_ENTRY_STATUS[behavior]
  };
}

export function buildCopyToolNoSourceEntryIntent(): CopyToolNoSourceEntryIntent {
  return {
    nextMode: "copy",
    closeInstancePanel: true,
    suppressNextBlankClick: false,
    hasSource: false,
    awaitingReference: false,
    syncToolUi: true,
    focusTarget: "canvas",
    status: "Copy mode: click an object to copy, or Esc cancels."
  };
}

export function buildCopyToolReferenceEntryIntent(sourceCount: number): CopyToolReferenceEntryIntent {
  return {
    nextMode: "copy",
    closeInstancePanel: true,
    suppressNextBlankClick: false,
    hasSource: false,
    awaitingReference: true,
    sourceCount,
    syncToolUi: true,
    focusTarget: "canvas",
    status: `Copy mode: ${sourceCount} object${sourceCount === 1 ? "" : "s"} selected. Click a reference point; Esc cancels.`
  };
}

export function buildCopyToolSourceEntryIntent(sourceCount: number): CopyToolSourceEntryIntent {
  return {
    nextMode: "copy",
    closeInstancePanel: true,
    suppressNextBlankClick: false,
    hasSource: true,
    awaitingReference: false,
    sourceCount,
    updateCopyPreview: true,
    syncToolUi: true,
    focusTarget: "canvas",
    status: `Copy mode: ${sourceCount} object${sourceCount === 1 ? "" : "s"} attached to cursor. Click to place; Esc cancels.`
  };
}

export function projectSchematicToolbarCommand(
  input: ToolbarProjectionInput,
  button: { command?: string; kind?: string }
): ToolbarCommandProjection {
  const active =
    (button.command === "instance" && input.mode === "place") ||
    (button.command === "wire" && input.mode === "wire") ||
    (button.command === "label" && input.mode === "label") ||
    (button.command === "delete" && input.mode === "delete") ||
    (button.command === "temp-delete" && input.mode === "temp-delete") ||
    (button.command === "copy" && input.mode === "copy") ||
    (button.command === "presentation" && input.presentationMode);
  const projection: ToolbarCommandProjection = {
    active,
    ariaPressed: button.kind === "tool" || button.kind === "toggle" ? active : null
  };

  if (button.command === "undo") projection.disabled = !input.canUndo;
  if (button.command === "redo") projection.disabled = !input.canRedo;

  return projection;
}
