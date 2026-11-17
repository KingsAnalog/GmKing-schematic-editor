import {
  viewTargetFromModel,
  viewTargetFromNoteId,
  type ModelLike,
  type SchematicViewTarget
} from "./viewTargets";

export const SCHEMATIC_COPY_MENU_LABELS = {
  svg: "Copy as SVG",
  png: "Copy as PNG",
  netlist: "Copy as Netlist",
  json: "Copy as JSON"
} as const;

export const SCHEMATIC_PASTE_MENU_LABEL = "Paste schematic from clipboard";
export type SchematicContextMenuScope = "selection" | "blank";

export type SchematicCopyFormat = keyof typeof SCHEMATIC_COPY_MENU_LABELS;
export type SchematicContextMenuAction =
  | { kind: "copy"; format: SchematicCopyFormat; label: string }
  | { kind: "paste"; label: typeof SCHEMATIC_PASTE_MENU_LABEL };

export function schematicContextMenuActions(scope: SchematicContextMenuScope, includeNetlist = true): readonly SchematicContextMenuAction[] {
  if (scope === "blank") return [{ kind: "paste", label: SCHEMATIC_PASTE_MENU_LABEL }];
  return (Object.entries(SCHEMATIC_COPY_MENU_LABELS) as Array<[SchematicCopyFormat, string]>)
    .filter(([format]) => includeNetlist || format !== "netlist")
    .map(([format, label]) => ({ kind: "copy", format, label }));
}

export type SchematicContextMenuDecisionKind = "ignore-panning" | "close" | "select-and-show" | "show" | "show-blank";

export type SchematicContextMenuCloseReason = "inactive-or-editable" | "no-target" | "empty-selection";

export interface SchematicContextMenuTargetProjectionInput {
  readonly noteId?: string | null;
  readonly model?: ModelLike | null;
}

export interface SchematicContextMenuDecisionInput<TTarget = unknown> {
  readonly isPanning: boolean;
  readonly isSelectMode: boolean;
  readonly isEditableTarget: boolean;
  readonly isBlankCanvas?: boolean;
  readonly target: TTarget | null;
  readonly targetSelected: boolean;
  readonly hasExportableSelection: boolean;
}

export interface SchematicContextMenuDecision {
  readonly kind: SchematicContextMenuDecisionKind;
  readonly closeReason?: SchematicContextMenuCloseReason;
  readonly preventDefault: boolean;
  readonly stopPropagation: boolean;
  readonly focusCanvas: boolean;
  readonly selectTarget: boolean;
  readonly closeMenu: boolean;
  readonly showMenu: boolean;
}

export function projectSchematicContextMenuTarget(input: SchematicContextMenuTargetProjectionInput): SchematicViewTarget | null {
  const noteTarget = viewTargetFromNoteId(input.noteId);
  return noteTarget ?? viewTargetFromModel(input.model);
}

export function decideSchematicContextMenuOpen(input: SchematicContextMenuDecisionInput): SchematicContextMenuDecision {
  if (input.isPanning) {
    return {
      kind: "ignore-panning",
      preventDefault: true,
      stopPropagation: false,
      focusCanvas: false,
      selectTarget: false,
      closeMenu: false,
      showMenu: false
    };
  }

  if (!input.isSelectMode || input.isEditableTarget) {
    return closeContextMenuDecision("inactive-or-editable", false);
  }

  if (!input.target && input.isBlankCanvas === false) {
    return closeContextMenuDecision("no-target", false);
  }

  if (!input.target) {
    return {
      kind: "show-blank",
      preventDefault: true,
      stopPropagation: true,
      focusCanvas: true,
      selectTarget: false,
      closeMenu: false,
      showMenu: true
    };
  }

  const selectTarget = !input.targetSelected;
  if (selectTarget) {
    return {
      kind: "select-and-show",
      preventDefault: true,
      stopPropagation: true,
      focusCanvas: true,
      selectTarget: true,
      closeMenu: false,
      showMenu: true
    };
  }

  if (!input.hasExportableSelection) {
    return {
      kind: "close",
      closeReason: "empty-selection",
      preventDefault: true,
      stopPropagation: true,
      focusCanvas: true,
      selectTarget: false,
      closeMenu: true,
      showMenu: false
    };
  }

  return {
    kind: "show",
    preventDefault: true,
    stopPropagation: true,
    focusCanvas: true,
    selectTarget: false,
    closeMenu: false,
    showMenu: true
  };
}

function closeContextMenuDecision(closeReason: SchematicContextMenuCloseReason, consumeTargetEvent: boolean): SchematicContextMenuDecision {
  return {
    kind: "close",
    closeReason,
    preventDefault: consumeTargetEvent,
    stopPropagation: consumeTargetEvent,
    focusCanvas: consumeTargetEvent,
    selectTarget: false,
    closeMenu: true,
    showMenu: false
  };
}
