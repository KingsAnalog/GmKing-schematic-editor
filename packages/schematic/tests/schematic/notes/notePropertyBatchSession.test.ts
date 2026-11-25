import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import {
  NotePropertyBatchSession,
  type NotePropertyBatchFrameScheduler,
  type NotePropertyBatchProjectionContext
} from "../../../src/schematic/notes/notePropertyBatchSession";
import type { SchematicDocument, SchematicNote } from "../../../src/schematic/types";

class ManualFrameScheduler implements NotePropertyBatchFrameScheduler {
  private nextHandle = 1;
  readonly callbacks = new Map<number, () => void>();
  readonly cancelled: number[] = [];

  request(callback: () => void) {
    const handle = this.nextHandle++;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancel(handle: number) {
    this.cancelled.push(handle);
    this.callbacks.delete(handle);
  }

  runNext() {
    const entry = this.callbacks.entries().next().value as [number, () => void] | undefined;
    if (!entry) return false;
    this.callbacks.delete(entry[0]);
    entry[1]();
    return true;
  }
}

function note(id: string, overrides: Partial<SchematicNote> = {}): SchematicNote {
  return {
    id,
    x: 20,
    y: 40,
    width: 120,
    height: 60,
    anchor: "upperLeft",
    text: id,
    fontSizePx: 14,
    ...overrides
  };
}

function documentWith(...notes: SchematicNote[]): SchematicDocument {
  return fixtureDocument({
    components: [],
    wires: [],
    junctions: [],

    junctionAppearances: [],
    netLabels: [],
    notes
  });
}

function setup(...notes: SchematicNote[]) {
  const document = documentWith(...notes);
  const scheduler = new ManualFrameScheduler();
  const projected: Array<{ id: string; context: NotePropertyBatchProjectionContext }> = [];
  const session = new NotePropertyBatchSession(
    document,
    (target, context) => {
      projected.push({ id: target.id, context });
      if (context.phase !== "preview") return;
      if (context.kind === "font-size") {
        target.width = (target.fontSizePx ?? 14) * 10;
        target.height = (target.fontSizePx ?? 14) * 4;
      } else {
        target.height = target.width / 4;
      }
    },
    scheduler
  );
  return { document, scheduler, projected, session };
}

describe("NotePropertyBatchSession preflight", () => {
  it("resolves and snapshots Note targets in document order", () => {
    const first = note("first");
    const second = note("second");
    const { session } = setup(first, second);

    expect(session.begin("font-size", ["second", "first", "second"])).toEqual({
      ok: true,
      kind: "font-size",
      noteIds: ["first", "second"],
      reused: false
    });
    expect(session.activeNoteIds).toEqual(["first", "second"]);
  });

  it("rejects missing, ambiguous, empty, targets atomically", () => {
    const markdown = note("markdown", { anchor: "upperLeft", width: 320 });
    const plain = note("plain");
    const duplicated = note("markdown", { anchor: "upperLeft", width: 340 });
    const { session } = setup(markdown, plain, duplicated);

    expect(session.begin("font-size", [])).toEqual({
      ok: false,
      reason: "empty",
      noteIds: []
    });
    expect(session.begin("font-size", ["missing"])).toEqual({
      ok: false,
      reason: "missing",
      noteIds: ["missing"]
    });
    expect(session.begin("font-size", ["markdown"])).toEqual({
      ok: false,
      reason: "ambiguous",
      noteIds: ["markdown"]
    });
    expect(session.activeKind).toBeNull();
    expect([markdown.width, plain.width, duplicated.width]).toEqual([320, 120, 340]);
  });
});

describe("NotePropertyBatchSession preview and commit", () => {
  it("coalesces normalized font-size input to one RAF and projects every changed Note", () => {
    const first = note("first", { fontSizePx: 12 });
    const second = note("second", { fontSizePx: 16 });
    const { scheduler, projected, session } = setup(first, second);
    session.begin("font-size", ["second", "first"]);

    expect(session.input("17.6")).toEqual({ accepted: true, value: 18, scheduled: true });
    expect(session.input("20")).toEqual({ accepted: true, value: 20, scheduled: false });
    expect(scheduler.callbacks.size).toBe(1);
    expect([first.fontSizePx, second.fontSizePx]).toEqual([12, 16]);

    scheduler.runNext();
    expect([first.fontSizePx, second.fontSizePx]).toEqual([20, 20]);
    expect([first.width, first.height, second.width, second.height]).toEqual([200, 80, 200, 80]);
    expect(projected.map(({ id }) => id)).toEqual(["first", "second"]);

    expect(session.commit()).toEqual({
      changed: true,
      historyIntent: "push",
      selectedIds: [],
      noteIds: ["first", "second"],
      status: "Note font size updated."
    });
    expect(session.commit()).toBeNull();
  });

  it("flushes the final normalized value synchronously before commit", () => {
    const first = note("first", { fontSizePx: 12 });
    const second = note("second", { fontSizePx: 16 });
    const { scheduler, session } = setup(first, second);
    session.begin("font-size", ["first", "second"]);

    session.input("18");
    const result = session.commit("19.4");

    expect(scheduler.cancelled).toEqual([1]);
    expect(scheduler.callbacks.size).toBe(0);
    expect([first.fontSizePx, second.fontSizePx]).toEqual([19, 19]);
    expect(result).toMatchObject({
      changed: true,
      historyIntent: "push",
      noteIds: ["first", "second"]
    });
  });

  it("returns history none when resolved values and measured bounds end at their snapshots", () => {
    const implicitDefault = note("implicit", { fontSizePx: undefined, width: 120, height: 60 });
    const explicitDefault = note("explicit", { fontSizePx: 14, width: 140, height: 80 });
    const { scheduler, projected, session } = setup(implicitDefault, explicitDefault);
    session.begin("font-size", ["implicit", "explicit"]);

    session.input("18");
    scheduler.runNext();
    session.input("14");
    scheduler.runNext();

    expect(implicitDefault).toMatchObject({ fontSizePx: undefined, width: 120, height: 60 });
    expect(explicitDefault).toMatchObject({ fontSizePx: 14, width: 140, height: 80 });
    expect(projected.map(({ context }) => context.phase)).toEqual([
      "preview",
      "preview",
      "restore",
      "restore"
    ]);
    expect(session.commit()).toEqual({
      changed: false,
      historyIntent: "none",
      selectedIds: [],
      noteIds: [],
      status: ""
    });
  });

  it("drops a superseded queued value when the current input is invalid", () => {
    const target = note("target", { fontSizePx: 12 });
    const { scheduler, session } = setup(target);
    session.begin("font-size", ["target"]);

    session.input("18");
    expect(session.input("bad")).toEqual({ accepted: false, reason: "invalid" });
    expect(scheduler.cancelled).toEqual([1]);
    expect(target.fontSizePx).toBe(12);
    expect(session.commit("bad")).toMatchObject({ changed: false, historyIntent: "none" });
  });
});

describe("NotePropertyBatchSession rollback and invalidation", () => {
  it("cancels queued work and restores the complete group snapshot on Escape", () => {
    const first = note("first", { fontSizePx: 12, width: 120, height: 40 });
    const second = note("second", { fontSizePx: 16, width: 180, height: undefined });
    const { scheduler, projected, session } = setup(first, second);
    session.begin("font-size", ["first", "second"]);
    session.input("18");
    scheduler.runNext();
    session.input("20");

    expect(session.cancel()).toEqual({
      cancelled: true,
      restored: true,
      noteIds: ["first", "second"]
    });
    expect(scheduler.cancelled).toEqual([2]);
    expect(first).toMatchObject({ fontSizePx: 12, width: 120, height: 40 });
    expect(second.fontSizePx).toBe(16);
    expect(second.width).toBe(180);
    expect(second.height).toBeUndefined();
    expect(projected.slice(-2)).toEqual([
      { id: "first", context: { kind: "font-size", phase: "restore" } },
      { id: "second", context: { kind: "font-size", phase: "restore" } }
    ]);
    expect(session.activeKind).toBeNull();
  });

  it("discards stale queued work without touching replacement document objects", () => {
    const original = note("target", { fontSizePx: 12 });
    const { document, scheduler, projected, session } = setup(original);
    session.begin("font-size", ["target"]);
    session.input("18");
    const staleFrame = [...scheduler.callbacks.values()][0];
    const replacement = note("target", { fontSizePx: 30, width: 500, height: 200 });
    document.notes = [replacement];

    expect(session.invalidateAgainstDocument(["target"])).toEqual({
      invalidated: true,
      reason: "document",
      restored: false,
      noteIds: []
    });
    staleFrame?.();

    expect(replacement).toMatchObject({ fontSizePx: 30, width: 500, height: 200 });
    expect(original.fontSizePx).toBe(12);
    expect(projected).toEqual([]);
    expect(session.commit()).toBeNull();
  });

  it("restores still-live targets when one target disappears during a preview", () => {
    const first = note("first", { fontSizePx: 12, width: 120, height: 40 });
    const removed = note("removed", { fontSizePx: 16, width: 180, height: 80 });
    const { document, scheduler, projected, session } = setup(first, removed);
    session.begin("font-size", ["first", "removed"]);
    session.input("20");
    scheduler.runNext();
    document.notes = [first];

    expect(session.invalidateAgainstDocument(["first"])).toEqual({
      invalidated: true,
      reason: "document",
      restored: true,
      noteIds: ["first"]
    });
    expect(first).toMatchObject({ fontSizePx: 12, width: 120, height: 40 });
    expect(projected.at(-1)).toEqual({
      id: "first",
      context: { kind: "font-size", phase: "restore" }
    });
  });
});
