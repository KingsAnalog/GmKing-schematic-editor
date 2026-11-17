import { describe, expect, it } from "vitest";
import {
  decideSchematicPointerClick,
  POINTER_CLICK_COMPONENT_ANALYSIS_BLOCKED_STATUS,
  POINTER_CLICK_COPY_EMPTY_STATUS
} from "../../../src/schematic/pointerClickRoutingModel";
import type { PointerClickTarget } from "../../../src/schematic/pointerClickRoutingModel";
import type { ToolMode } from "../../../src/schematic/toolState";

const point = { x: 40, y: 60 };

function decide(options: {
  mode?: ToolMode;
  target: PointerClickTarget;
  copyHasSource?: boolean;
  copyAwaitingReference?: boolean;
  analysisPickActive?: boolean;
  deleteMode?: boolean;
  selectionModified?: boolean;
}) {
  return decideSchematicPointerClick({
    mode: options.mode ?? "select",
    target: options.target,
    copyHasSource: options.copyHasSource ?? false,
    copyAwaitingReference: options.copyAwaitingReference ?? false,
    analysisPickActive: options.analysisPickActive ?? false,
    deleteMode: options.deleteMode ?? false,
    selectionModified: options.selectionModified
  });
}

describe("decideSchematicPointerClick", () => {
  it("cycles only a plain blade click while preserving other tool and selection gestures", () => {
    const target: PointerClickTarget = { kind: "component", id: "S1", point, switchBlade: true };
    expect(decide({ target })).toEqual({ kind: "cycle-switch", id: "S1" });
    expect(decide({ target, selectionModified: true })).toEqual({ kind: "select-target", id: "S1" });
    expect(decide({ target: { ...target, switchBlade: false } })).toEqual({ kind: "select-target", id: "S1" });
    expect(decide({ target, mode: "wire" })).toEqual({ kind: "wire-blank-click", point });
    expect(decide({ target, mode: "copy" })).toEqual({ kind: "begin-copy", ids: ["S1"], point });
    expect(decide({ target, mode: "place" })).toEqual({ kind: "ignore" });
    expect(decide({ target, deleteMode: true })).toEqual({ kind: "delete-targets", ids: ["S1"] });
    expect(decide({ target, analysisPickActive: true })).toEqual({ kind: "status", message: POINTER_CLICK_COMPONENT_ANALYSIS_BLOCKED_STATUS });
  });

  it("routes blank clicks by tool mode", () => {
    const target: PointerClickTarget = { kind: "blank", point };

    expect(decide({ mode: "copy", target, copyAwaitingReference: true })).toEqual({ kind: "set-copy-reference", point });
    expect(decide({ mode: "copy", target, copyHasSource: true })).toEqual({ kind: "place-copy", point });
    expect(decide({ mode: "copy", target })).toEqual({ kind: "status", message: POINTER_CLICK_COPY_EMPTY_STATUS });
    expect(decide({ mode: "place", target })).toEqual({ kind: "place-active-item", point });
    expect(decide({ mode: "wire", target })).toEqual({ kind: "wire-blank-click", point });
    expect(decide({ mode: "delete", target, deleteMode: true })).toEqual({ kind: "ignore" });
    expect(decide({ target, analysisPickActive: true })).toEqual({ kind: "analysis-pick-net", point });
    expect(decide({ target })).toEqual({ kind: "clear-selection" });
  });

  it("routes preview clicks through the active tool without treating preview links as placement targets", () => {
    expect(decide({ mode: "copy", target: { kind: "preview", surface: "element", point }, copyAwaitingReference: true })).toEqual({
      kind: "set-copy-reference",
      point
    });
    expect(decide({ mode: "copy", target: { kind: "preview", surface: "element", point } })).toEqual({ kind: "place-copy", point });
    expect(decide({ mode: "place", target: { kind: "preview", surface: "element", point } })).toEqual({
      kind: "place-active-item",
      point
    });
    expect(decide({ mode: "place", target: { kind: "preview", surface: "link", point } })).toEqual({ kind: "ignore" });
    expect(decide({ mode: "wire", target: { kind: "preview", surface: "link", point } })).toEqual({
      kind: "wire-blank-click",
      point
    });
    expect(decide({ target: { kind: "preview", surface: "element", point } })).toEqual({ kind: "ignore" });
  });

  it("routes junction clicks using copy id, selection id, and exact junction point", () => {
    const target: PointerClickTarget = {
      kind: "junction",
      id: "junction-40-60",
      selectionId: "junction-40-60",
      point,
      placementPoint: { x: 45, y: 65 }
    };

    expect(decide({ mode: "copy", target, copyAwaitingReference: true })).toEqual({ kind: "set-copy-reference", point });
    expect(decide({ mode: "copy", target, copyHasSource: true })).toEqual({ kind: "place-copy", point: { x: 45, y: 65 } });
    expect(decide({ mode: "copy", target })).toEqual({ kind: "begin-copy", ids: ["junction-40-60"], point });
    expect(decide({ mode: "place", target })).toEqual({ kind: "place-active-item", point });
    expect(decide({ mode: "wire", target })).toEqual({ kind: "wire-blank-click", point });
    expect(decide({ mode: "delete", target, deleteMode: true })).toEqual({ kind: "delete-targets", ids: ["junction-40-60"] });
    expect(decide({ target, analysisPickActive: true })).toEqual({ kind: "analysis-pick-net", point });
    expect(decide({ target })).toEqual({ kind: "select-target", id: "junction-40-60" });
  });

  it("ignores unresolved junction targets except source-placement copy fallback", () => {
    const target: PointerClickTarget = {
      kind: "junction",
      id: null,
      selectionId: null,
      point: null,
      placementPoint: point
    };

    expect(decide({ mode: "copy", target, copyAwaitingReference: true })).toEqual({ kind: "set-copy-reference", point });
    expect(decide({ mode: "copy", target, copyHasSource: true })).toEqual({ kind: "place-copy", point });
    expect(decide({ mode: "copy", target })).toEqual({ kind: "ignore" });
    expect(decide({ mode: "place", target })).toEqual({ kind: "ignore" });
    expect(decide({ target })).toEqual({ kind: "ignore" });
  });

  it("routes component clicks while preserving place-mode ignore and analysis status", () => {
    const target: PointerClickTarget = { kind: "component", id: "R1", point };

    expect(decide({ mode: "copy", target, copyAwaitingReference: true })).toEqual({ kind: "set-copy-reference", point });
    expect(decide({ mode: "copy", target, copyHasSource: true })).toEqual({ kind: "place-copy", point });
    expect(decide({ mode: "copy", target })).toEqual({ kind: "begin-copy", ids: ["R1"], point });
    expect(decide({ mode: "place", target })).toEqual({ kind: "ignore" });
    expect(decide({ mode: "wire", target })).toEqual({ kind: "wire-blank-click", point });
    expect(decide({ mode: "delete", target, deleteMode: true })).toEqual({ kind: "delete-targets", ids: ["R1"] });
    expect(decide({ target, analysisPickActive: true })).toEqual({
      kind: "status",
      message: POINTER_CLICK_COMPONENT_ANALYSIS_BLOCKED_STATUS
    });
    expect(decide({ target })).toEqual({ kind: "select-target", id: "R1" });
  });

  it("routes wire clicks and preserves unresolved-link behavior", () => {
    const target: PointerClickTarget = { kind: "wire", id: "w1", point };

    expect(decide({ mode: "copy", target, copyAwaitingReference: true })).toEqual({ kind: "set-copy-reference", point });
    expect(decide({ mode: "copy", target, copyHasSource: true })).toEqual({ kind: "place-copy", point });
    expect(decide({ mode: "copy", target })).toEqual({ kind: "begin-copy", ids: ["w1"], point });
    expect(decide({ mode: "place", target })).toEqual({ kind: "ignore" });
    expect(decide({ mode: "wire", target })).toEqual({ kind: "wire-blank-click", point });
    expect(decide({ mode: "delete", target, deleteMode: true })).toEqual({ kind: "delete-targets", ids: ["w1"] });
    expect(decide({ target, analysisPickActive: true })).toEqual({ kind: "analysis-pick-net", point });
    expect(decide({ target })).toEqual({ kind: "select-target", id: "w1" });

    const unresolved: PointerClickTarget = { kind: "wire", id: null, point };
    expect(decide({ mode: "copy", target: unresolved, copyHasSource: true })).toEqual({ kind: "place-copy", point });
    expect(decide({ mode: "copy", target: unresolved })).toEqual({ kind: "ignore" });
    expect(decide({ mode: "wire", target: unresolved })).toEqual({ kind: "wire-blank-click", point });
    expect(decide({ mode: "delete", target: unresolved, deleteMode: true })).toEqual({ kind: "ignore" });
    expect(decide({ target: unresolved, analysisPickActive: true })).toEqual({ kind: "analysis-pick-net", point });
    expect(decide({ target: unresolved })).toEqual({ kind: "ignore" });
  });

  it("routes pin clicks separately from component body clicks", () => {
    const target: PointerClickTarget = { kind: "pin", componentId: "R1", point };

    expect(decide({ mode: "copy", target, copyAwaitingReference: true })).toEqual({ kind: "set-copy-reference", point });
    expect(decide({ mode: "copy", target, copyHasSource: true })).toEqual({ kind: "place-copy", point });
    expect(decide({ mode: "copy", target })).toEqual({ kind: "begin-copy", ids: ["R1"], point });
    expect(decide({ mode: "wire", target })).toEqual({ kind: "wire-pin-click", point });
    expect(decide({ mode: "delete", target, deleteMode: true })).toEqual({ kind: "delete-targets", ids: ["R1"] });
    expect(decide({ target, analysisPickActive: true })).toEqual({
      kind: "status",
      message: POINTER_CLICK_COMPONENT_ANALYSIS_BLOCKED_STATUS
    });
    expect(decide({ mode: "place", target })).toEqual({ kind: "select-target", id: "R1" });
  });
});
