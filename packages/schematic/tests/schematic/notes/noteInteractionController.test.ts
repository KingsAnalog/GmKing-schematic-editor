import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it } from "vitest";
import {
  SchematicNoteInteractionController,
  type NoteInteractionLayer
} from "../../../src/schematic/notes/noteInteractionController";
import type { SchematicDocument, SchematicNote } from "../../../src/schematic/types";

function note(overrides: Partial<SchematicNote> = {}): SchematicNote {
  return {
    id: "note-1",
    x: 0,
    y: 0,
    width: 80,
    height: 40,
    format: "plain",
    text: "before",
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

class FakeNoteLayer implements NoteInteractionLayer {
  readonly elements = new Set<string>();
  readonly editorText = new Map<string, string>();
  readonly calls: string[] = [];
  readonly contentSizes = new Map<string, { width: number; height: number }>();
  readonly textSizes = new Map<string, { width: number; height: number }>();
  mountSucceeds = true;
  modeGate: Promise<void> | null = null;

  constructor(notes: readonly SchematicNote[]) {
    notes.forEach((target) => {
      this.elements.add(target.id);
      this.editorText.set(target.id, target.text);
    });
  }

  getNoteElement(noteId: string) {
    return this.elements.has(noteId) ? { noteId } : null;
  }

  mountEditor(target: SchematicNote) {
    this.calls.push(`mount:${target.id}`);
    return this.mountSucceeds;
  }

  focusEditor(target: SchematicNote) {
    this.calls.push(`focus:${target.id}`);
  }

  readEditor(target: SchematicNote) {
    this.calls.push(`read:${target.id}`);
    return { text: this.editorText.get(target.id) ?? target.text };
  }

  flushEditor(target: SchematicNote) {
    this.calls.push(`flush:${target.id}`);
  }

  insertEditorText(target: SchematicNote, text: string) {
    this.calls.push(`insert:${target.id}:${text}`);
    this.editorText.set(target.id, `${this.editorText.get(target.id) ?? target.text}${text}`);
    return true;
  }

  unmountEditor(target: SchematicNote) {
    this.calls.push(`unmount:${target.id}`);
  }

  resizeNoteToContent(target: SchematicNote) {
    this.calls.push(`resize-content:${target.id}`);
    const size = this.contentSizes.get(target.id);
    if (!size || target.format === "markdown") return;
    target.width = size.width;
    target.height = size.height;
  }

  resizeNoteToText(target: SchematicNote) {
    this.calls.push(`resize-text:${target.id}`);
    const size = this.textSizes.get(target.id);
    if (!size || target.format === "markdown") return;
    target.width = size.width;
    target.height = size.height;
  }

  applyNoteElementSize(target: SchematicNote) {
    this.calls.push(`apply-size:${target.id}`);
  }

  refreshMarkdownLayout(noteId: string) {
    this.calls.push(`refresh-markdown:${noteId}`);
  }

  setNoteFontSize(target: SchematicNote, fontSizePx: number) {
    this.calls.push(`font:${target.id}:${fontSizePx}`);
  }

}

function setup(...notes: SchematicNote[]) {
  const document = documentWith(...notes);
  const layer = new FakeNoteLayer(notes);
  const frames: Array<() => void> = [];
  const controller = new SchematicNoteInteractionController(document, layer, (callback) => frames.push(callback));
  return { controller, document, layer, frames };
}

describe("SchematicNoteInteractionController edit lifecycle", () => {
  it("begins idempotently and generation-guards delayed focus after finish", () => {
    const target = note();
    const { controller, layer, frames } = setup(target);

    expect(controller.beginEdit(target.id)).toBe(true);
    expect(controller.beginEdit(target.id)).toBe(true);
    expect(layer.calls.filter((call) => call === "mount:note-1")).toHaveLength(1);
    expect(layer.calls.filter((call) => call === "focus:note-1")).toHaveLength(1);

    expect(controller.finishEdit(target.id)).toMatchObject({ changed: false, historyIntent: "none" });
    frames.forEach((frame) => frame());

    expect(layer.calls.filter((call) => call === "focus:note-1")).toHaveLength(1);
    expect(controller.editingNoteId).toBeNull();
  });

  it("clears and unmounts an active edit when its live note is missing", () => {
    const target = note();
    const { controller, document, layer } = setup(target);
    controller.beginEdit(target.id);

    document.notes = [];

    expect(controller.finishEdit(target.id)).toBeNull();
    expect(controller.hasActiveEdit()).toBe(false);
    expect(layer.calls).toContain("unmount:note-1");
  });

  it("reads normalized Plain text and includes measured size in one edit commit", () => {
    const target = note({ text: "before", width: 80, height: 40 });
    const { controller, layer } = setup(target);
    layer.editorText.set(target.id, "line 1\r\nline 2");
    layer.contentSizes.set(target.id, { width: 120, height: 60 });

    controller.beginEdit(target.id);
    expect(controller.readEditor(target.id)).toBe(true);
    expect(target).toMatchObject({ text: "line 1\nline 2", width: 120, height: 60 });

    expect(controller.finishEdit(target.id)).toMatchObject({
      changed: true,
      historyIntent: "push",
      status: "Note updated."
    });
    expect(layer.calls).toContain("resize-content:note-1");
    expect(layer.calls).toContain("apply-size:note-1");
  });

  it("routes printable input through the active edit only", () => {
    const target = note({ text: "before" });
    const { controller, layer } = setup(target);

    expect(controller.insertText("c")).toBe(false);
    controller.beginEdit(target.id);
    expect(controller.insertText("c")).toBe(true);
    expect(layer.editorText.get(target.id)).toBe("beforec");
    controller.finishEdit(target.id);
    expect(controller.insertText("x")).toBe(false);
  });

  it("reads Markdown source while leaving Markdown height to the resize callback", () => {
    const target = note({ format: "markdown", text: "# Before", width: 320, height: 40 });
    const { controller, layer } = setup(target);
    layer.editorText.set(target.id, "# After\r\n\r\n$A_v$");
    layer.contentSizes.set(target.id, { width: 500, height: 200 });

    controller.beginEdit(target.id);
    expect(controller.readEditor(target.id)).toBe(true);

    expect(target).toMatchObject({ text: "# After\n\n$A_v$", width: 320, height: 40 });
    expect(layer.calls).toContain("resize-content:note-1");
  });

  it("keeps checkpoints non-destructive and flushes transient editors only on finish", () => {
    const target = note({ format: "markdown", text: "before" });
    const { controller, layer } = setup(target);
    layer.editorText.set(target.id, "after");

    controller.beginEdit(target.id);
    controller.checkpointEdit(target.id);
    expect(layer.calls).not.toContain("flush:note-1");
    expect(controller.editingNoteId).toBe(target.id);
    expect(controller.hasActiveEdit()).toBe(true);

    layer.editorText.set(target.id, "after again");
    expect(controller.checkpointEdit(target.id)).toMatchObject({
      changed: true,
      historyIntent: "push"
    });
    expect(controller.editingNoteId).toBe(target.id);
    expect(controller.hasActiveEdit()).toBe(true);

    controller.finishEdit(target.id);
    const flushIndex = layer.calls.lastIndexOf("flush:note-1");
    const readIndex = layer.calls.lastIndexOf("read:note-1");
    expect(flushIndex).toBeGreaterThanOrEqual(0);
    expect(flushIndex).toBeLessThan(readIndex);
  });

  it("guards Markdown text by the active edit while allowing live read-only height updates", () => {
    const target = note({ format: "markdown", text: "before", width: 320, height: 40 });
    const { controller, layer } = setup(target);

    expect(controller.acceptMarkdownChange(target.id, "ignored")).toBe(false);
    expect(controller.acceptMarkdownResize(target.id, 60)).toBe(true);
    expect(target.height).toBe(60);
    controller.beginEdit(target.id);
    expect(controller.acceptMarkdownChange("other", "ignored")).toBe(false);
    expect(controller.acceptMarkdownChange(target.id, "after\r\nnext")).toBe(true);
    expect(controller.acceptMarkdownResize("other", 80)).toBe(false);
    expect(controller.acceptMarkdownResize(target.id, Number.NaN)).toBe(false);
    expect(controller.acceptMarkdownResize(target.id, 80)).toBe(true);
    expect(target).toMatchObject({ text: "after\nnext", height: 80 });
    expect(layer.calls).toContain("apply-size:note-1");

    controller.finishEdit(target.id);
    expect(controller.acceptMarkdownChange(target.id, "stale")).toBe(false);
    expect(controller.acceptMarkdownResize(target.id, 120)).toBe(true);
    expect(target.height).toBe(120);
  });

});

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

    expect(controller.clearPointerInteractions("rollback")).toEqual({
      dragNoteIds: [first.id, second.id],
      widthNoteId: null
    });
    expect([first.x, first.y, second.x, second.y]).toEqual([180, 140, 180, 340]);
    expect(controller.endDrag(7)).toBeNull();
  });
});

describe("SchematicNoteInteractionController property transactions", () => {
  it("applies live Markdown width and returns exactly one width commit", () => {
    const target = note({ format: "markdown", width: 320 });
    const { controller, layer } = setup(target);

    expect(controller.beginWidthPropertyEdit(target.id)).toBe(true);
    expect(controller.applyWidthInput(target.id, "371")).toEqual({ valid: true, changed: true, value: 380 });
    expect(target.width).toBe(380);
    expect(layer.calls).toContain("apply-size:note-1");
    expect(layer.calls).toContain("refresh-markdown:note-1");
    expect(controller.finishWidthPropertyEdit()).toMatchObject({
      changed: true,
      historyIntent: "push",
      status: "Note width updated."
    });
    expect(controller.finishWidthPropertyEdit()).toBeNull();
  });

  it("converts a width drag through zoom and commits only on pointerup", () => {
    const target = note({ format: "markdown", width: 320 });
    const { controller } = setup(target);

    expect(controller.beginWidthDrag({ noteId: target.id, pointerId: 3, clientX: 100, clientY: 0 })).toBe(true);
    expect(controller.moveWidthDrag({ pointerId: 3, clientX: 220, clientY: 0, zoom: 2 })).toEqual({
      valid: true,
      changed: true,
      value: 380
    });
    expect(controller.endWidthDrag(3)).toMatchObject({
      kind: "ended",
      commit: { changed: true, historyIntent: "push" }
    });
    expect(controller.endWidthDrag(3)).toEqual({ kind: "ignored" });
  });

  it.each([
    [90, 0, 120], [180, -120, 0], [270, 0, -120]
  ] as const)("resizes a %d degree Markdown note along its rotated width axis", (rotation, dx, dy) => {
    const target = note({ format: "markdown", width: 320, rotation });
    const { controller } = setup(target);
    controller.beginWidthDrag({ noteId: target.id, pointerId: 3, clientX: 100, clientY: 100 });
    expect(controller.moveWidthDrag({ pointerId: 3, clientX: 100 + dx, clientY: 100 + dy, zoom: 2 })).toEqual({
      valid: true, changed: true, value: 380
    });
    expect(controller.endWidthDrag(3)).toMatchObject({ kind: "ended", commit: { changed: true, historyIntent: "push" } });
  });

  it("rolls an active width drag back and discards its pending property transaction", () => {
    const target = note({ format: "markdown", width: 320 });
    const { controller, layer } = setup(target);
    controller.beginWidthDrag({ noteId: target.id, pointerId: 3, clientX: 100, clientY: 0 });
    controller.moveWidthDrag({ pointerId: 3, clientX: 220, clientY: 0, zoom: 2 });

    expect(controller.clearPointerInteractions("rollback")).toEqual({
      dragNoteIds: [],
      widthNoteId: target.id
    });
    expect(target.width).toBe(320);
    expect(layer.calls).toContain("apply-size:note-1");
    expect(layer.calls).toContain("refresh-markdown:note-1");
    expect(controller.endWidthDrag(3)).toEqual({ kind: "ignored" });
    expect(controller.finishWidthPropertyEdit()).toBeNull();
  });

  it("folds width changes made during an active edit into the edit snapshot", () => {
    const target = note({ format: "markdown", text: "before", width: 320 });
    const { controller, layer } = setup(target);
    layer.editorText.set(target.id, "after");

    controller.beginEdit(target.id);
    controller.beginWidthDrag({ noteId: target.id, pointerId: 3, clientX: 100, clientY: 0 });
    controller.moveWidthDrag({ pointerId: 3, clientX: 160, clientY: 0, zoom: 1 });

    expect(controller.endWidthDrag(3)).toEqual({ kind: "ended", commit: null });
    expect(controller.finishEdit(target.id)).toMatchObject({
      changed: true,
      historyIntent: "push",
      status: "Note updated."
    });
    expect(controller.flushPropertyEdits()).toEqual([]);
    expect(target).toMatchObject({ text: "after", width: 380 });
  });

  it("applies live font size and returns exactly one property commit", () => {
    const target = note({ fontSizePx: 14, width: 80, height: 40 });
    const { controller, layer } = setup(target);
    layer.textSizes.set(target.id, { width: 100, height: 60 });

    expect(controller.applyFontSizeInput(target.id, "17.6")).toEqual({
      valid: true,
      changed: true,
      value: 18
    });
    expect(target).toMatchObject({ fontSizePx: 18, width: 100, height: 60 });
    expect(layer.calls).toContain("font:note-1:18");
    expect(controller.finishFontSizePropertyEdit()).toMatchObject({
      changed: true,
      historyIntent: "push",
      status: "Note font size updated."
    });
    expect(controller.finishFontSizePropertyEdit()).toBeNull();
    expect(controller.applyFontSizeInput(target.id, "bad")).toEqual({ valid: false, changed: false });
  });

  it("merges an active font-size property edit into the outer note edit", () => {
    const target = note({ fontSizePx: 14 });
    const { controller } = setup(target);

    controller.beginEdit(target.id);
    controller.beginFontSizePropertyEdit(target.id);
    controller.applyFontSizeInput(target.id, "18");

    expect(controller.finishFontSizePropertyEdit()).toBeNull();
    expect(controller.finishEdit(target.id)).toMatchObject({
      changed: true,
      historyIntent: "push",
      status: "Note updated."
    });
    expect(target.fontSizePx).toBe(18);
  });

  it("prepares edit/property commits before applying a reversible format mutation", () => {
    const target = note({ format: "markdown", text: "# Before", width: 320 });
    const { controller, layer } = setup(target);
    layer.editorText.set(target.id, "# After");

    controller.beginEdit(target.id);
    controller.beginWidthPropertyEdit(target.id);
    controller.applyWidthInput(target.id, "380");

    const preparation = controller.prepareFormatChange(target.id, "plain");

    expect(preparation).not.toBeNull();
    expect(target).toMatchObject({ format: "markdown", text: "# After", width: 380 });
    expect(preparation?.precedingCommits).toHaveLength(1);
    expect(preparation?.precedingCommits[0]).toMatchObject({ changed: true, status: "Note updated." });

    expect(controller.applyPreparedFormatChange(preparation!)).toMatchObject({
      changed: true,
      historyIntent: "push",
      status: "Note format changed to plain."
    });
    expect(target).toMatchObject({ format: "plain", text: "# After", width: 380 });
  });

  it("flushes independent font and width transactions once", () => {
    const plain = note({ id: "plain", fontSizePx: 14 });
    const markdown = note({ id: "markdown", format: "markdown", width: 320 });
    const { controller } = setup(plain, markdown);

    controller.applyFontSizeInput(plain.id, "18");
    controller.applyWidthInput(markdown.id, "380");

    expect(controller.flushPropertyEdits().map((commit) => commit.status)).toEqual([
      "Note font size updated.",
      "Note width updated."
    ]);
    expect(controller.flushPropertyEdits()).toEqual([]);
  });
});

describe("SchematicNoteInteractionController invalidation", () => {
  it("invalidates edit, drag, width, and font state when restore replaces the live Note object", () => {
    const target = note({ format: "markdown", width: 320 });
    const { controller, document, layer, frames } = setup(target);

    controller.beginEdit(target.id);
    controller.beginDrag({
      noteId: target.id,
      pointerId: 7,
      clientX: 0,
      clientY: 0,
      selectedNoteIds: new Set([target.id])
    });
    controller.beginWidthPropertyEdit(target.id);
    controller.beginFontSizePropertyEdit(target.id);
    document.notes = [{ ...target }];

    expect(controller.invalidateAgainstDocument()).toEqual({
      edit: true,
      drag: true,
      width: true,
      fontSize: true
    });
    expect(controller.hasActiveEdit()).toBe(false);
    expect(controller.flushPropertyEdits()).toEqual([]);
    expect(layer.calls).toContain("unmount:note-1");

    const focusCount = layer.calls.filter((call) => call === "focus:note-1").length;
    frames.forEach((frame) => frame());
    expect(layer.calls.filter((call) => call === "focus:note-1")).toHaveLength(focusCount);
  });

  it("invalidates a stale width drag after its property transaction was already finished", () => {
    const target = note({ format: "markdown", width: 320 });
    const { controller, document } = setup(target);

    controller.beginWidthDrag({ noteId: target.id, pointerId: 8, clientX: 100, clientY: 0 });
    controller.finishWidthPropertyEdit();
    document.notes = [note({ id: target.id, format: "markdown", width: 320 })];

    expect(controller.invalidateAgainstDocument()).toMatchObject({ width: true });
    expect(controller.endWidthDrag(8)).toEqual({ kind: "ignored" });
  });
});
