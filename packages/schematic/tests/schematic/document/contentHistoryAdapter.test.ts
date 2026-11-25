import { describe, expect, it } from "vitest";
import {
  createSchematicContentHistoryAdapter
} from "../../../src/schematic/document/contentHistoryAdapter";
import { createEmptySchematicContent } from "../../../src/schematic/document/documentModel";
import type { SchematicContent } from "../../../src/schematic/types";

function withNote(content: SchematicContent, id: string, text: string) {
  const next = structuredClone(content);
  next.notes.push({
    id,
    x: 0,
    y: 0,
    width: 120,
    height: 40,
    anchor: "upperLeft",
    text
  });
  return next;
}

describe("schematic content history adapter", () => {
  it("stores isolated content snapshots and never carries derived or host state", () => {
    const initial = createEmptySchematicContent() as SchematicContent & {
      junctions?: Array<{ x: number; y: number }>;
      view?: { zoom: number };
      analysis?: { result: string };
    };
    initial.junctions = [{ x: 20, y: 20 }];
    initial.view = { zoom: 4 };
    initial.analysis = { result: "stale" };
    const history = createSchematicContentHistoryAdapter(initial);
    const changed = withNote(initial, "note-1", "first");

    expect(history.push(changed)).toBe(true);
    changed.notes[0].text = "mutated after push";

    const previous = history.undo();
    expect(previous?.notes).toEqual([]);
    expect(previous).not.toHaveProperty("junctions");
    expect(previous).not.toHaveProperty("view");
    expect(previous).not.toHaveProperty("analysis");

    const next = history.redo();
    expect(next?.notes[0].text).toBe("first");
    expect(next).not.toHaveProperty("junctions");
  });

  it("deduplicates normalized content and clears redo after a new commit", () => {
    const initial = createEmptySchematicContent();
    const history = createSchematicContentHistoryAdapter(initial);
    const first = withNote(initial, "note-1", "first");

    expect(history.push(first)).toBe(true);
    expect(history.push(structuredClone(first))).toBe(false);
    expect(history.canUndo).toBe(true);
    expect(history.undo()).toEqual(initial);
    expect(history.canRedo).toBe(true);

    expect(history.push(withNote(initial, "note-2", "replacement"))).toBe(true);
    expect(history.canRedo).toBe(false);
  });
});
