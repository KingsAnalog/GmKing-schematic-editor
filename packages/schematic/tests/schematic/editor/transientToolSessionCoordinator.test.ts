import { describe, expect, it, vi } from "vitest";
import {
  SchematicTransientToolSessionCoordinator,
  type SchematicTransientToolSessionHooks
} from "../../../src/schematic/transientToolSessionCoordinator";

function sessionHarness() {
  const calls: string[] = [];
  const call = (name: string) => vi.fn(() => calls.push(name));
  const hooks: SchematicTransientToolSessionHooks = {
    clearWireSegmentMove: call("clear-wire-segment-move"),
    resetWireTool: call("reset-wire-tool"),
    clearActiveNetPick: call("clear-active-net"),
    clearDeleteHover: call("clear-delete-hover"),
    clearPlacementPreview: call("clear-placement-preview"),
    clearWirePreview: call("clear-wire-preview"),
    clearCopyPreview: call("clear-copy-preview"),
    clearCopyState: call("clear-copy-state"),
    clearLabelDocumentInteraction: call("clear-label-document-interaction"),
    clearLabelState: call("clear-label-state"),
    clearSelectionBox: call("clear-selection-box"),
    clearNotePointerInteractions: vi.fn((policy) => calls.push(`clear-note-pointer-${policy}`)),
    clearCellGeometryInteraction: vi.fn((policy) => calls.push(`clear-cell-geometry-${policy}`)),
    updatePlacementPreview: vi.fn(),
    updateWirePreview: vi.fn(),
    updateCopyPreview: vi.fn(),
    updateLabelPreview: vi.fn()
  };
  return {
    calls,
    hooks,
    session: new SchematicTransientToolSessionCoordinator(hooks)
  };
}

describe("SchematicTransientToolSessionCoordinator", () => {
  it("owns mode and move behavior without cleanup on direct state changes", () => {
    const { calls, session } = sessionHarness();

    expect(session.mode).toBe("select");
    expect(session.moveBehavior).toBe("stretch");

    session.setMode("copy");
    session.setMoveBehavior("moveOnly");

    expect(session.snapshot()).toEqual({
      mode: "copy",
      moveBehavior: "moveOnly"
    });
    expect(calls).toEqual([]);
  });

  it("transitions mode and clears every transient target by default", () => {
    const { calls, session } = sessionHarness();

    session.transition("delete", "enter-tool");

    expect(session.mode).toBe("delete");
    expect(calls).toEqual([
      "clear-wire-segment-move",
      "reset-wire-tool",
      "clear-active-net",
      "clear-delete-hover",
      "clear-placement-preview",
      "clear-wire-preview",
      "clear-copy-state",
      "clear-label-state",
      "clear-selection-box",
      "clear-note-pointer-rollback",
      "clear-cell-geometry-rollback"
    ]);
  });

  it.each(["restore", "reset"] as const)(
    "discards stale document interactions during %s without rolling them back",
    (reason) => {
      const { calls, session } = sessionHarness();
      session.setMode("copy");

      session.transition("select", reason);

      expect(calls).toContain("clear-note-pointer-discard");
      expect(calls).toContain("clear-cell-geometry-discard");
      expect(calls).not.toContain("clear-note-pointer-rollback");
      expect(calls).not.toContain("clear-cell-geometry-rollback");
    }
  );

  it("prepares a history restore without exiting the active tool or clearing persistent tool state", () => {
    const { calls, session } = sessionHarness();
    session.setMode("copy");

    session.prepareHistoryRestore();

    expect(session.mode).toBe("copy");
    expect(calls).toEqual([
      "clear-wire-segment-move",
      "reset-wire-tool",
      "clear-active-net",
      "clear-delete-hover",
      "clear-placement-preview",
      "clear-wire-preview",
      "clear-copy-preview",
      "clear-label-document-interaction",
      "clear-selection-box",
      "clear-note-pointer-discard",
      "clear-cell-geometry-discard"
    ]);
    expect(calls).not.toContain("clear-copy-state");
    expect(calls).not.toContain("clear-label-state");
  });

  it("switches documents while preserving an armed cross-tab copy source", () => {
    const { calls, session } = sessionHarness();
    session.setMode("copy");
    session.setMoveBehavior("moveOnly");

    session.prepareDocumentSwitch(true);

    expect(session.snapshot()).toEqual({ mode: "copy", moveBehavior: "stretch" });
    expect(calls).toContain("clear-copy-preview");
    expect(calls).not.toContain("clear-copy-state");
    expect(calls).toContain("clear-label-state");
    expect(calls).toContain("clear-note-pointer-rollback");
    expect(calls).toContain("clear-cell-geometry-rollback");
  });

  it("switches documents back to select and clears copy state when nothing is armed", () => {
    const { calls, session } = sessionHarness();
    session.setMode("wire");

    session.prepareDocumentSwitch(false);

    expect(session.snapshot()).toEqual({ mode: "select", moveBehavior: "stretch" });
    expect(calls).toContain("clear-copy-state");
  });

  it.each(["selection", "move-behavior"] as const)(
    "preserves an active analysis pick while clearing select pointer state for %s",
    (reason) => {
      const { calls, hooks, session } = sessionHarness();

      session.transition("select", reason);

      expect(hooks.clearActiveNetPick).not.toHaveBeenCalled();
      expect(hooks.resetWireTool).not.toHaveBeenCalled();
      expect(hooks.clearCopyState).not.toHaveBeenCalled();
      expect(calls).toEqual([
        "clear-wire-segment-move",
        "clear-label-state",
        "clear-selection-box",
        "clear-note-pointer-rollback",
        "clear-cell-geometry-rollback"
      ]);
    }
  );

  it.each(["copy", "label", "wire", "delete"] as const)(
    "fully exits %s when move behavior switches back to select",
    (mode) => {
      const { calls, session } = sessionHarness();
      session.setMode(mode);

      session.transition("select", "move-behavior");

      expect(session.mode).toBe("select");
      expect(calls).toContain("clear-copy-state");
      expect(calls).toContain("clear-label-state");
      expect(calls).toContain("clear-delete-hover");
    }
  );

  it("cleans transient state even when re-entering the same tool mode", () => {
    const { calls, session } = sessionHarness();
    session.setMode("place");

    session.transition("place", "enter-tool");

    expect(calls).toContain("clear-placement-preview");
  });

  it("projects exactly the preview owned by the active mode", () => {
    const { hooks, session } = sessionHarness();
    const point = { x: 120, y: 140 };
    const copyPoint = { x: 80, y: 100 };

    session.setMode("place");
    session.projectActivePreview(point, copyPoint);
    session.setMode("wire");
    session.projectActivePreview(point, copyPoint);
    session.setMode("copy");
    session.projectActivePreview(point, copyPoint);
    session.setMode("label");
    session.projectActivePreview(point, copyPoint);
    session.setMode("select");
    session.projectActivePreview(point, copyPoint);

    expect(hooks.updatePlacementPreview).toHaveBeenCalledOnce();
    expect(hooks.updatePlacementPreview).toHaveBeenCalledWith(point);
    expect(hooks.updateWirePreview).toHaveBeenCalledOnce();
    expect(hooks.updateWirePreview).toHaveBeenCalledWith(point);
    expect(hooks.updateCopyPreview).toHaveBeenCalledOnce();
    expect(hooks.updateCopyPreview).toHaveBeenCalledWith(copyPoint);
    expect(hooks.updateLabelPreview).toHaveBeenCalledOnce();
    expect(hooks.updateLabelPreview).toHaveBeenCalledWith(point);
  });

  it("uses the ordinary pointer point for copy when no fallback is supplied", () => {
    const { hooks, session } = sessionHarness();
    const point = { x: 200, y: 220 };

    session.setMode("copy");
    session.projectActivePreview(point);

    expect(hooks.updateCopyPreview).toHaveBeenCalledWith(point);
  });
});
