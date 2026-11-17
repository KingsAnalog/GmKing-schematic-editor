import { describe, expect, it } from "vitest";
import {
  SchematicPropertyEditSession,
  type SchematicPropertyEditFrameScheduler
} from "../../../src/schematic/propertyEditSession";
import { executeSchematicPropertyBatchCommand } from "../../../src/schematic/propertyBatchCommands";
import { emptyDoc, fixtureComponent } from "../support/fixtures";

function createHarness() {
  const component = fixtureComponent("resistor", "R1", 0, 0);
  const document = { ...emptyDoc(), components: [component] };
  const callbacks: Array<() => void> = [];
  const cancelled: number[] = [];
  const scheduler: SchematicPropertyEditFrameScheduler = {
    request(callback) {
      callbacks.push(callback);
      return callbacks.length;
    },
    cancel(handle) {
      cancelled.push(handle);
    }
  };
  let restoreCount = 0;
  const session = new SchematicPropertyEditSession(
    document,
    (selection, command) =>
      executeSchematicPropertyBatchCommand(document, selection, command),
    () => {
      restoreCount += 1;
    },
    scheduler
  );
  const selection = { selectedIds: [component.id], selectedNoteIds: [] };
  return {
    callbacks,
    cancelled,
    component,
    document,
    selection,
    session,
    restoreCount: () => restoreCount
  };
}

describe("SchematicPropertyEditSession", () => {
  it("coalesces RAF previews and commits the final value as one transaction", () => {
    const harness = createHarness();
    expect(harness.session.begin("component-ref", harness.selection)).toBe(true);
    harness.session.input("component-ref", { kind: "component-ref", ref: "Rfb" });
    harness.session.input("component-ref", { kind: "component-ref", ref: "Rout" });
    expect(harness.callbacks).toHaveLength(1);

    harness.callbacks[0]();
    expect(harness.document.components[0].ref).toBe("Rout");
    const result = harness.session.commit(
      "component-ref",
      { kind: "component-ref", ref: "Rfinal" }
    );
    expect(result).toMatchObject({
      kind: "committed",
      changed: true,
      rebuildCounters: true
    });
    expect(harness.document.components[0].ref).toBe("Rfinal");
  });

  it("restores invalid commits and Escape cancellation to the full baseline", () => {
    const invalid = createHarness();
    invalid.session.begin("component-ref", invalid.selection);
    invalid.session.input("component-ref", { kind: "component-ref", ref: "Rpreview" });
    invalid.callbacks[0]();
    expect(invalid.document.components[0].ref).toBe("Rpreview");
    expect(invalid.session.commit("component-ref", { kind: "component-ref", ref: " " }))
      .toMatchObject({ kind: "invalid", restored: true, changed: false });
    expect(invalid.document.components[0].ref).toBe("R1");
    expect(invalid.restoreCount()).toBe(1);

    const cancelled = createHarness();
    cancelled.session.begin("component-ref", cancelled.selection);
    cancelled.session.input("component-ref", { kind: "component-ref", ref: "Rpreview" });
    cancelled.callbacks[0]();
    expect(cancelled.session.cancel("component-ref")).toEqual({
      cancelled: true,
      restored: true
    });
    expect(cancelled.document.components[0].ref).toBe("R1");
  });

  it("does not create a commit when the user returns to the baseline", () => {
    const harness = createHarness();
    harness.session.begin("component-ref", harness.selection);
    harness.session.input("component-ref", { kind: "component-ref", ref: "Rfb" });
    harness.callbacks[0]();
    const result = harness.session.commit(
      "component-ref",
      { kind: "component-ref", ref: "R1" }
    );
    expect(result).toMatchObject({ kind: "committed", changed: false });
    expect(harness.document.components[0].ref).toBe("R1");
  });
});
