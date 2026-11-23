import { COPY_PICK_STATUS, type ToolMode } from "./toolState";
import type { Point } from "./types";

export const POINTER_CLICK_COPY_EMPTY_STATUS = COPY_PICK_STATUS;
export const POINTER_CLICK_COMPONENT_ANALYSIS_BLOCKED_STATUS =
  "Voltage-node pick is wire-based. Click a wire or wire node; component pins are reserved for current picks.";

export type PointerClickTarget =
  | { kind: "blank"; point: Point }
  | { kind: "preview"; surface: "element" | "link"; point: Point }
  | {
      kind: "junction";
      id: string | null;
      selectionId: string | null;
      point: Point | null;
      placementPoint: Point;
    }
  | { kind: "component"; id: string; point: Point; switchBlade?: boolean }
  | { kind: "inductor-coupling"; id: string; point: Point }
  | { kind: "wire"; id: string | null; point: Point }
  | { kind: "net-label"; id: string; point: Point }
  | { kind: "pin"; componentId: string; point: Point };

export type PointerClickRoutingInput = {
  readonly mode: ToolMode;
  readonly target: PointerClickTarget;
  readonly copyHasSource: boolean;
  readonly analysisPickActive: boolean;
  readonly deleteMode: boolean;
  readonly selectionModified?: boolean;
};

export type PointerClickRoutingIntent =
  | { kind: "ignore" }
  | { kind: "status"; message: string }
  | { kind: "clear-selection" }
  | { kind: "place-copy"; point: Point }
  | { kind: "place-active-item"; point: Point }
  | { kind: "wire-blank-click"; point: Point }
  | { kind: "wire-pin-click"; point: Point }
  | { kind: "place-label"; point: Point; wireId?: string }
  | { kind: "begin-copy"; ids: readonly string[]; point: Point }
  | { kind: "delete-targets"; ids: readonly string[] }
  | { kind: "analysis-pick-net"; point: Point }
  | { kind: "cycle-switch"; id: string }
  | { kind: "select-target"; id: string };

export function decideSchematicPointerClick(input: PointerClickRoutingInput): PointerClickRoutingIntent {
  switch (input.target.kind) {
    case "blank":
      return decideBlankPointerClick(input);
    case "preview":
      return decidePreviewPointerClick(input);
    case "junction":
      return decideJunctionPointerClick(input);
    case "component":
      return decideComponentPointerClick(input);
    case "inductor-coupling":
      return decideInductorCouplingPointerClick(input);
    case "wire":
      return decideWirePointerClick(input);
    case "net-label":
      return decideNetLabelPointerClick(input);
    case "pin":
      return decidePinPointerClick(input);
  }
}

function decideInductorCouplingPointerClick(input: PointerClickRoutingInput): PointerClickRoutingIntent {
  const { mode, target } = input;
  if (target.kind !== "inductor-coupling") return ignoreIntent();
  if (mode === "copy" && input.copyHasSource) return placeCopyIntent(target.point);
  if (mode === "copy") return statusIntent("Select both inductors to copy their coupling.");
  if (input.deleteMode) return deleteTargetsIntent([target.id]);
  if (mode === "select") return selectTargetIntent(target.id);
  return ignoreIntent();
}

function decideBlankPointerClick(input: PointerClickRoutingInput): PointerClickRoutingIntent {
  const { mode, target } = input;
  if (target.kind !== "blank") return ignoreIntent();

  if (mode === "copy") {
    return input.copyHasSource ? placeCopyIntent(target.point) : statusIntent(POINTER_CLICK_COPY_EMPTY_STATUS);
  }
  if (mode === "place") return placeActiveItemIntent(target.point);
  if (mode === "wire") return wireBlankClickIntent(target.point);
  if (mode === "label") return statusIntent("Net labels must be attached to a wire or junction.");
  if (input.deleteMode) return ignoreIntent();
  if (input.analysisPickActive) return analysisPickNetIntent(target.point);
  return { kind: "clear-selection" };
}

function decidePreviewPointerClick(input: PointerClickRoutingInput): PointerClickRoutingIntent {
  const { mode, target } = input;
  if (target.kind !== "preview") return ignoreIntent();

  if (mode === "copy" && input.copyHasSource) return placeCopyIntent(target.point);
  if (mode === "place" && target.surface === "element") return placeActiveItemIntent(target.point);
  if (mode === "wire" && target.surface === "link") return wireBlankClickIntent(target.point);
  return ignoreIntent();
}

function decideJunctionPointerClick(input: PointerClickRoutingInput): PointerClickRoutingIntent {
  const { mode, target } = input;
  if (target.kind !== "junction") return ignoreIntent();

  if (mode === "copy") {
    if (input.copyHasSource) return placeCopyIntent(target.placementPoint);
    if (target.point && target.id) return beginCopyIntent([target.id], target.point);
    return ignoreIntent();
  }
  if (mode === "place") return target.point ? placeActiveItemIntent(target.point) : ignoreIntent();
  if (mode === "wire") return target.point ? wireBlankClickIntent(target.point) : ignoreIntent();
  if (mode === "label") return target.point ? { kind: "place-label", point: target.point } : ignoreIntent();
  if (input.deleteMode) return target.id ? deleteTargetsIntent([target.id]) : ignoreIntent();
  if (input.analysisPickActive) return target.point ? analysisPickNetIntent(target.point) : ignoreIntent();
  return target.selectionId ? selectTargetIntent(target.selectionId) : ignoreIntent();
}

function decideComponentPointerClick(input: PointerClickRoutingInput): PointerClickRoutingIntent {
  const { mode, target } = input;
  if (target.kind !== "component") return ignoreIntent();

  if (mode === "copy") {
    return input.copyHasSource ? placeCopyIntent(target.point) : beginCopyIntent([target.id], target.point);
  }
  if (mode === "place") return ignoreIntent();
  if (mode === "wire") return wireBlankClickIntent(target.point);
  if (mode === "label") return statusIntent("Net labels attach to wires and junctions, not component bodies.");
  if (input.deleteMode) return deleteTargetsIntent([target.id]);
  if (input.analysisPickActive) return componentAnalysisBlockedStatusIntent();
  if (mode === "select" && target.switchBlade && !input.selectionModified) return { kind: "cycle-switch", id: target.id };
  return selectTargetIntent(target.id);
}

function decideWirePointerClick(input: PointerClickRoutingInput): PointerClickRoutingIntent {
  const { mode, target } = input;
  if (target.kind !== "wire") return ignoreIntent();

  if (mode === "copy") {
    if (input.copyHasSource) return placeCopyIntent(target.point);
    return target.id ? beginCopyIntent([target.id], target.point) : ignoreIntent();
  }
  if (mode === "place") return ignoreIntent();
  if (mode === "wire") return wireBlankClickIntent(target.point);
  if (mode === "label") return target.id ? { kind: "place-label", point: target.point, wireId: target.id } : ignoreIntent();
  if (input.deleteMode) return target.id ? deleteTargetsIntent([target.id]) : ignoreIntent();
  if (input.analysisPickActive) return analysisPickNetIntent(target.point);
  return target.id ? selectTargetIntent(target.id) : ignoreIntent();
}

function decideNetLabelPointerClick(input: PointerClickRoutingInput): PointerClickRoutingIntent {
  const { mode, target } = input;
  if (target.kind !== "net-label") return ignoreIntent();
  if (mode === "copy") {
    return input.copyHasSource ? placeCopyIntent(target.point) : beginCopyIntent([target.id], target.point);
  }
  if (input.deleteMode) return deleteTargetsIntent([target.id]);
  if (mode === "label") return statusIntent("Click the supporting wire or junction to place a net label.");
  if (mode === "wire" || mode === "place") return ignoreIntent();
  return selectTargetIntent(target.id);
}

function decidePinPointerClick(input: PointerClickRoutingInput): PointerClickRoutingIntent {
  const { mode, target } = input;
  if (target.kind !== "pin") return ignoreIntent();

  if (mode === "copy") {
    return input.copyHasSource ? placeCopyIntent(target.point) : beginCopyIntent([target.componentId], target.point);
  }
  if (mode === "wire") return wirePinClickIntent(target.point);
  if (mode === "label") return statusIntent("Net labels attach to wires and junctions, not isolated component pins.");
  if (input.deleteMode) return deleteTargetsIntent([target.componentId]);
  if (input.analysisPickActive) return componentAnalysisBlockedStatusIntent();
  return selectTargetIntent(target.componentId);
}

function ignoreIntent(): PointerClickRoutingIntent {
  return { kind: "ignore" };
}

function statusIntent(message: string): PointerClickRoutingIntent {
  return { kind: "status", message };
}

function componentAnalysisBlockedStatusIntent(): PointerClickRoutingIntent {
  return statusIntent(POINTER_CLICK_COMPONENT_ANALYSIS_BLOCKED_STATUS);
}

function placeCopyIntent(point: Point): PointerClickRoutingIntent {
  return { kind: "place-copy", point };
}

function placeActiveItemIntent(point: Point): PointerClickRoutingIntent {
  return { kind: "place-active-item", point };
}

function wireBlankClickIntent(point: Point): PointerClickRoutingIntent {
  return { kind: "wire-blank-click", point };
}

function wirePinClickIntent(point: Point): PointerClickRoutingIntent {
  return { kind: "wire-pin-click", point };
}

function beginCopyIntent(ids: readonly string[], point: Point): PointerClickRoutingIntent {
  return { kind: "begin-copy", ids, point };
}

function deleteTargetsIntent(ids: readonly string[]): PointerClickRoutingIntent {
  return { kind: "delete-targets", ids };
}

function analysisPickNetIntent(point: Point): PointerClickRoutingIntent {
  return { kind: "analysis-pick-net", point };
}

function selectTargetIntent(id: string): PointerClickRoutingIntent {
  return { kind: "select-target", id };
}
