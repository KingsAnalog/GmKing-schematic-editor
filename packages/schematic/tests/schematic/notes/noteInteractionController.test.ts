import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import {
  SchematicNoteInteractionController
  } from "../../../src/schematic/notes/noteInteractionController";
import type { SchematicNote } from "../../../src/schematic/types";
function note(overrides: Partial<SchematicNote> = {}): SchematicNote {
  return {
    id: "note-1",
    x: 0,
    y: 0,
    width: 80,
    height: 40,
    anchor: "upperLeft",
    text: "before",
    ...overrides
  };
}

function setup(...notes: SchematicNote[]) { return { controller: new SchematicNoteInteractionController(fixtureDocument({ notes })) }; }

describe("SchematicNoteInteractionController drag lifecycle", () => {
  it("moves a selected Note group through zoom and grid snapping, then returns one commit", () => {
    const first = note({ id: "note-1", x: 180, y: 140 });
    const second = note({ id: "note-2", x: 180, y: 340 });
    const { controller } = setup(first, second);

    expect(controller.beginDrag({
      noteId: first.id,
      pointerId: 7,
      clientX: 100,
      clientY: 80,
      selectedNoteIds: new Set([first.id, second.id])
    })).toBe(true);

    expect(controller.moveDrag({ pointerId: 7, clientX: 145, clientY: 125, zoom: 2 })).toEqual({
      kind: "move",
      noteId: first.id,
      changedNoteIds: [first.id, second.id]
    });
    expect([first.x, first.y, second.x, second.y]).toEqual([200, 160, 200, 360]);

    expect(controller.endDrag(7)).toEqual({
      changed: true,
      historyIntent: "push",
      selectedIds: [],
      noteIds: [first.id, second.id],
      status: "Note moved."
    });
    expect(controller.endDrag(7)).toBeNull();
    expect(controller.consumeMoved(first.id)).toBe(true);
    expect(controller.consumeMoved(first.id)).toBe(false);
  });

  it("ignores a wrong pointer and returns a no-history result for an unmoved drag", () => {
    const target = note({ x: 200, y: 220 });
    const { controller } = setup(target);
    controller.beginDrag({
      noteId: target.id,
      pointerId: 7,
      clientX: 100,
      clientY: 80,
      selectedNoteIds: new Set([target.id])
    });

    expect(controller.moveDrag({ pointerId: 9, clientX: 160, clientY: 80, zoom: 1 })).toEqual({ kind: "ignored" });
    expect(controller.endDrag(9)).toBeNull();
    expect(controller.endDrag(7)).toMatchObject({ changed: false, historyIntent: "none" });
  });

  it("rolls an active Note group drag back when a tool transition clears pointer state", () => {
    const first = note({ id: "note-1", x: 180, y: 140 });
    const second = note({ id: "note-2", x: 180, y: 340 });
    const { controller } = setup(first, second);
    controller.beginDrag({
      noteId: first.id,
      pointerId: 7,
      clientX: 100,
      clientY: 80,
      selectedNoteIds: new Set([first.id, second.id])
    });
    controller.moveDrag({ pointerId: 7, clientX: 140, clientY: 120, zoom: 1 });

    expect(controller.clearPointerInteractions("rollback")).toEqual([first.id, second.id]);
    expect([first.x, first.y, second.x, second.y]).toEqual([180, 140, 180, 340]);
    expect(controller.endDrag(7)).toBeNull();
  });
});
