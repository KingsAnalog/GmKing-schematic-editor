import type { SelectionMoveBehavior } from "./selection/selectionMoveTransaction";
import type { Point } from "./types";
import type { ToolMode } from "./toolState";

export type TransientToolTransitionReason =
  | "enter-tool"
  | "cancel"
  | "move-behavior"
  | "analysis"
  | "create-note"
  | "selection"
  | "restore"
  | "reset";

export type TransientInteractionCleanupPolicy = "rollback" | "discard";

export interface SchematicTransientToolSessionHooks {
  clearToolCursorFeedback?(): void;
  clearWireSegmentMove(): void;
  resetWireTool(): void;
  clearActiveNetPick(): void;
  clearDeleteHover(): void;
  clearPlacementPreview(): void;
  clearShapeDraft?(): void;
  clearWirePreview(): void;
  clearCopyPreview(): void;
  clearCopyState(): void;
  clearLabelDocumentInteraction(): void;
  clearLabelState(): void;
  clearSelectionBox(): void;
  clearNotePointerInteractions(policy: TransientInteractionCleanupPolicy): void;
  clearCellGeometryInteraction(policy: TransientInteractionCleanupPolicy): void;
  updatePlacementPreview(point: Point | null): void;
  updateWirePreview(point: Point | null): void;
  updateCopyPreview(point: Point | null): void;
  updateMovePreview?(point: Point | null): void;
  updateLabelPreview(point: Point | null): void;
}

export class SchematicTransientToolSessionCoordinator {
  private modeState: ToolMode = "select";
  private moveBehaviorState: SelectionMoveBehavior = "stretch";

  constructor(private readonly hooks: SchematicTransientToolSessionHooks) {}

  get mode() {
    return this.modeState;
  }

  get moveBehavior() {
    return this.moveBehaviorState;
  }

  setMode(mode: ToolMode) {
    this.modeState = mode;
  }

  setMoveBehavior(moveBehavior: SelectionMoveBehavior) {
    this.moveBehaviorState = moveBehavior;
  }

  snapshot() {
    return {
      mode: this.modeState,
      moveBehavior: this.moveBehaviorState
    };
  }

  transition(mode: ToolMode, reason: TransientToolTransitionReason) {
    const previousMode = this.modeState;
    this.hooks.clearToolCursorFeedback?.();
    this.hooks.clearShapeDraft?.();
    this.modeState = mode;
    if (
      previousMode === "select"
      && mode === "select"
      && (reason === "selection" || reason === "move-behavior")
    ) {
      this.clearSelectPointerInteractions();
      return;
    }
    this.clearAll(reason);
  }

  prepareHistoryRestore() {
    this.hooks.clearToolCursorFeedback?.();
    this.hooks.clearShapeDraft?.();
    this.hooks.clearWireSegmentMove();
    this.hooks.resetWireTool();
    this.hooks.clearActiveNetPick();
    this.hooks.clearDeleteHover();
    this.hooks.clearPlacementPreview();
    this.hooks.clearWirePreview();
    this.hooks.clearCopyPreview();
    this.hooks.clearLabelDocumentInteraction();
    this.hooks.clearSelectionBox();
    this.hooks.clearNotePointerInteractions("discard");
    this.hooks.clearCellGeometryInteraction("discard");
  }

  prepareDocumentSwitch(preserveCopyState: boolean) {
    this.hooks.clearToolCursorFeedback?.();
    this.hooks.clearShapeDraft?.();
    this.modeState = "select";
    this.moveBehaviorState = "stretch";
    this.hooks.clearWireSegmentMove();
    this.hooks.resetWireTool();
    this.hooks.clearActiveNetPick();
    this.hooks.clearDeleteHover();
    this.hooks.clearPlacementPreview();
    this.hooks.clearWirePreview();
    this.hooks.clearCopyPreview();
    if (!preserveCopyState) this.hooks.clearCopyState();
    this.hooks.clearLabelState();
    this.hooks.clearSelectionBox();
    this.hooks.clearNotePointerInteractions("rollback");
    this.hooks.clearCellGeometryInteraction("rollback");
    this.modeState = preserveCopyState ? "copy" : "select";
  }

  private clearSelectPointerInteractions() {
    this.hooks.clearWireSegmentMove();
    this.hooks.clearLabelState();
    this.hooks.clearSelectionBox();
    this.hooks.clearNotePointerInteractions("rollback");
    this.hooks.clearCellGeometryInteraction("rollback");
  }

  private clearAll(reason: TransientToolTransitionReason) {
    const interactionPolicy: TransientInteractionCleanupPolicy =
      reason === "restore" || reason === "reset" ? "discard" : "rollback";
    this.hooks.clearWireSegmentMove();
    this.hooks.resetWireTool();
    this.hooks.clearActiveNetPick();
    this.hooks.clearDeleteHover();
    this.hooks.clearPlacementPreview();
    this.hooks.clearWirePreview();
    this.hooks.clearCopyState();
    this.hooks.clearLabelState();
    this.hooks.clearSelectionBox();
    this.hooks.clearNotePointerInteractions(interactionPolicy);
    this.hooks.clearCellGeometryInteraction(interactionPolicy);
  }

  projectActivePreview(point: Point | null, copyPoint: Point | null = point) {
    switch (this.modeState) {
      case "place":
        this.hooks.updatePlacementPreview(point);
        return;
      case "wire":
        this.hooks.updateWirePreview(point);
        return;
      case "copy":
        this.hooks.updateCopyPreview(copyPoint);
        return;
      case "move":
      case "rotate":
        this.hooks.updateMovePreview?.(point);
        return;
      case "label":
        this.hooks.updateLabelPreview(point);
        return;
      default:
        return;
    }
  }
}
