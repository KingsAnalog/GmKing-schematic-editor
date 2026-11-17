import {
  commitNoteEditDocumentOp,
  commitNoteFontSizeDocumentOp,
  commitNoteWidthDocumentOp,
  moveSchematicNoteDocumentOp,
  setNoteFormatDocumentOp,
  type NoteEditCommitSnapshot,
  type SchematicDocumentOpResult
} from "../document/documentOps";
import { snapPoint } from "../geometry";
import type { Point, SchematicDocument, SchematicNote, SchematicNoteFormat } from "../types";
import {
  applyNoteFontSize,
  applyNoteWidth,
  createNoteFontSizeSnapshot,
  createNoteWidthSnapshot,
  normalizeNoteFontSizeInput,
  normalizeNoteWidthInput,
  type NoteFontSizePropertySnapshot,
  type NoteWidthPropertySnapshot
} from "./noteProperties";
import { noteFontSizePx } from "./noteSizing";

export interface NoteInteractionLayer {
  getNoteElement(noteId: string): unknown | null;
  mountEditor(note: SchematicNote): boolean;
  focusEditor(note: SchematicNote): void;
  readEditor(note: SchematicNote): { text: string };
  flushEditor(note: SchematicNote): void;
  insertEditorText(note: SchematicNote, text: string): boolean;
  unmountEditor(note: SchematicNote): void;
  resizeNoteToContent(note: SchematicNote, fontSizePx: number): void;
  resizeNoteToText(note: SchematicNote, text: string, fontSizePx: number): void;
  applyNoteElementSize(note: SchematicNote): void;
  refreshMarkdownLayout(noteId: string): void;
  setNoteFontSize(note: SchematicNote, fontSizePx: number): void;
}

export type NoteInteractionScheduleFrame = (callback: () => void) => void;

export type NoteLiveMutationResult =
  | { valid: false; changed: false }
  | { valid: true; changed: boolean; value: number };

export type NoteDragMoveResult =
  | { kind: "ignored" }
  | { kind: "move"; noteId: string; changedNoteIds: string[] };

export type NoteWidthDragEndResult =
  | { kind: "ignored" }
  | { kind: "ended"; commit: SchematicDocumentOpResult | null };

export interface NoteFormatChangePreparation {
  noteId: string;
  format: SchematicNoteFormat;
  note: SchematicNote;
  precedingCommits: SchematicDocumentOpResult[];
}

export interface NoteInteractionInvalidation {
  edit: boolean;
  drag: boolean;
  width: boolean;
  fontSize: boolean;
}

export interface NotePointerInteractionCleanup {
  dragNoteIds: string[];
  widthNoteId: string | null;
}

interface ActiveEdit {
  generation: number;
  note: SchematicNote;
  snapshot: NoteEditCommitSnapshot;
}

interface ActiveDrag {
  note: SchematicNote;
  pointerId: number;
  clientX: number;
  clientY: number;
  startPositions: Map<string, Point>;
  moved: boolean;
}

interface PropertyTransaction<Snapshot> {
  note: SchematicNote;
  snapshot: Snapshot;
  mergedIntoEdit: boolean;
}

interface ActiveWidthDrag {
  pointerId: number;
  note: SchematicNote;
  startClientX: number;
  startClientY: number;
  startWidth: number;
}

const defaultScheduleFrame: NoteInteractionScheduleFrame = (callback) => {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => callback());
  } else {
    queueMicrotask(callback);
  }
};

export class SchematicNoteInteractionController {
  private activeEdit: ActiveEdit | null = null;
  private activeDrag: ActiveDrag | null = null;
  private completedDrag: { noteId: string; moved: boolean } | null = null;
  private widthTransaction: PropertyTransaction<NoteWidthPropertySnapshot> | null = null;
  private fontSizeTransaction: PropertyTransaction<NoteFontSizePropertySnapshot> | null = null;
  private widthDrag: ActiveWidthDrag | null = null;
  private nextEditGeneration = 1;

  constructor(
    private readonly document: SchematicDocument,
    private readonly layer: NoteInteractionLayer,
    private readonly scheduleFrame: NoteInteractionScheduleFrame = defaultScheduleFrame
  ) {}

  get editingNoteId() {
    return this.activeEdit?.note.id ?? null;
  }

  hasActiveEdit() {
    return this.activeEdit !== null;
  }

  isEditing(noteId: string) {
    return this.activeEdit?.note.id === noteId;
  }

  beginEdit(noteId: string) {
    const note = this.noteById(noteId);
    if (!note || !this.layer.getNoteElement(noteId)) return false;
    if (this.activeEdit) return this.activeEdit.note === note;

    const generation = this.nextEditGeneration++;
    const edit: ActiveEdit = {
      generation,
      note,
      snapshot: createEditSnapshot(note)
    };
    this.activeEdit = edit;
    if (!this.layer.mountEditor(note)) {
      this.activeEdit = null;
      return false;
    }

    this.layer.focusEditor(note);
    this.scheduleFrame(() => {
      if (!this.editIsCurrent(edit)) return;
      this.layer.focusEditor(note);
    });
    return true;
  }

  readEditor(noteId: string) {
    const edit = this.activeEdit;
    if (!edit || edit.note.id !== noteId || !this.editIsCurrent(edit)) return false;
    const note = edit.note;
    const before = { text: note.text, width: note.width, height: note.height };
    note.text = normalizeText(this.layer.readEditor(note).text);
    this.layer.resizeNoteToContent(note, noteFontSizePx(note));
    this.layer.applyNoteElementSize(note);
    return before.text !== note.text || before.width !== note.width || before.height !== note.height;
  }

  insertText(text: string) {
    const edit = this.activeEdit;
    if (!edit || !text || !this.editIsCurrent(edit)) return false;
    return this.layer.insertEditorText(edit.note, text);
  }

  finishEdit(noteId = this.editingNoteId) {
    const edit = this.activeEdit;
    if (!edit || noteId === null || edit.note.id !== noteId) return null;
    const liveNote = this.noteById(noteId);
    if (liveNote !== edit.note) {
      this.clearEdit(edit, true);
      return null;
    }

    this.layer.flushEditor(liveNote);
    this.readEditor(noteId);
    this.clearEdit(edit, true);
    this.clearMergedPropertyTransactions(noteId);
    return commitNoteEditDocumentOp(edit.snapshot, liveNote);
  }

  checkpointEdit(noteId = this.editingNoteId) {
    const edit = this.activeEdit;
    if (!edit || noteId === null || edit.note.id !== noteId) return null;
    const liveNote = this.noteById(noteId);
    if (liveNote !== edit.note) return null;
    this.readEditor(noteId);
    const result = commitNoteEditDocumentOp(edit.snapshot, liveNote);
    if (result.changed) edit.snapshot = createEditSnapshot(liveNote);
    return result;
  }

  acceptMarkdownChange(noteId: string, markdown: string) {
    const edit = this.activeEdit;
    if (!edit || edit.note.id !== noteId || edit.note.format !== "markdown" || !this.editIsCurrent(edit)) return false;
    const text = normalizeText(markdown);
    if (edit.note.text === text) return false;
    edit.note.text = text;
    return true;
  }

  acceptMarkdownResize(noteId: string, height: number) {
    const note = this.noteById(noteId);
    if (
      !note ||
      note.format !== "markdown" ||
      !Number.isFinite(height) ||
      note.height === height
    ) {
      return false;
    }
    note.height = height;
    this.layer.applyNoteElementSize(note);
    return true;
  }

  prepareFormatChange(noteId: string, format: SchematicNoteFormat): NoteFormatChangePreparation | null {
    const note = this.noteById(noteId);
    if (!note || note.format === format) return null;
    const precedingCommits: SchematicDocumentOpResult[] = [];
    if (this.isEditing(noteId)) {
      const editCommit = this.finishEdit(noteId);
      if (editCommit) precedingCommits.push(editCommit);
    }
    precedingCommits.push(...this.flushPropertyEdits());
    return { noteId, format, note, precedingCommits };
  }

  applyPreparedFormatChange(preparation: NoteFormatChangePreparation) {
    if (this.noteById(preparation.noteId) !== preparation.note) return null;
    return setNoteFormatDocumentOp(preparation.note, preparation.format);
  }

  beginDrag(input: {
    noteId: string;
    pointerId: number;
    clientX: number;
    clientY: number;
    selectedNoteIds: ReadonlySet<string>;
  }) {
    const note = this.noteById(input.noteId);
    if (!note) return false;
    const draggedIds = input.selectedNoteIds.has(note.id) ? input.selectedNoteIds : new Set([note.id]);
    const startPositions = new Map(
      this.document.notes
        .filter((candidate) => draggedIds.has(candidate.id))
        .map((candidate) => [candidate.id, { x: candidate.x, y: candidate.y }])
    );
    this.activeDrag = {
      note,
      pointerId: input.pointerId,
      clientX: input.clientX,
      clientY: input.clientY,
      startPositions,
      moved: false
    };
    this.completedDrag = null;
    return true;
  }

  moveDrag(input: { pointerId: number; clientX: number; clientY: number; zoom: number }): NoteDragMoveResult {
    const drag = this.activeDrag;
    if (!drag || drag.pointerId !== input.pointerId || this.noteById(drag.note.id) !== drag.note) return { kind: "ignored" };
    const zoom = Math.max(input.zoom, Number.EPSILON);
    const start = drag.startPositions.get(drag.note.id);
    if (!start) return { kind: "ignored" };
    const activePoint = snapPoint({
      x: start.x + (input.clientX - drag.clientX) / zoom,
      y: start.y + (input.clientY - drag.clientY) / zoom
    });
    const nextPositions = projectNoteGroupDrag(drag.startPositions, drag.note.id, activePoint);
    const changedNoteIds: string[] = [];
    nextPositions.forEach((point, noteId) => {
      const note = this.noteById(noteId);
      if (note && moveSchematicNoteDocumentOp(note, point).changed) changedNoteIds.push(noteId);
    });
    if (changedNoteIds.length > 0) drag.moved = true;
    return { kind: "move", noteId: drag.note.id, changedNoteIds };
  }

  endDrag(pointerId: number) {
    const drag = this.activeDrag;
    if (!drag || drag.pointerId !== pointerId) return null;
    this.activeDrag = null;
    this.completedDrag = { noteId: drag.note.id, moved: drag.moved };
    return noteCommitResult(drag.moved, drag.moved ? "Note moved." : "", drag.moved ? [...drag.startPositions.keys()] : []);
  }

  consumeMoved(noteId: string) {
    const moved =
      (this.activeDrag?.note.id === noteId && this.activeDrag.moved) ||
      (this.completedDrag?.noteId === noteId && this.completedDrag.moved) ||
      false;
    if (this.completedDrag?.noteId === noteId) this.completedDrag = null;
    return moved;
  }

  cancelDrag() {
    this.activeDrag = null;
    this.completedDrag = null;
  }

  beginWidthPropertyEdit(noteId: string) {
    const note = this.noteById(noteId);
    if (!note || note.format !== "markdown") return false;
    if (this.widthTransaction) return this.widthTransaction.note === note;
    this.widthTransaction = {
      note,
      snapshot: createNoteWidthSnapshot(note),
      mergedIntoEdit: this.activeEdit?.note === note
    };
    return true;
  }

  applyWidthInput(noteId: string, value: string): NoteLiveMutationResult {
    const width = normalizeNoteWidthInput(value);
    return width === null ? invalidMutation() : this.applyWidth(noteId, width);
  }

  finishWidthPropertyEdit() {
    const transaction = this.widthTransaction;
    this.widthTransaction = null;
    if (!transaction || this.noteById(transaction.note.id) !== transaction.note) return null;
    if (transaction.mergedIntoEdit && this.activeEdit?.note === transaction.note) return null;
    return commitNoteWidthDocumentOp(transaction.snapshot, transaction.note);
  }

  beginWidthDrag(input: { noteId: string; pointerId: number; clientX: number; clientY: number }) {
    const note = this.noteById(input.noteId);
    if (!note || note.format !== "markdown" || !this.beginWidthPropertyEdit(note.id)) return false;
    this.widthDrag = {
      pointerId: input.pointerId,
      note,
      startClientX: input.clientX,
      startClientY: input.clientY,
      startWidth: note.width
    };
    return true;
  }

  moveWidthDrag(input: { pointerId: number; clientX: number; clientY: number; zoom: number }): NoteLiveMutationResult {
    const drag = this.widthDrag;
    if (!drag || drag.pointerId !== input.pointerId || this.noteById(drag.note.id) !== drag.note) return invalidMutation();
    const angle = (drag.note.rotation ?? 0) * Math.PI / 180;
    const delta = (input.clientX - drag.startClientX) * Math.cos(angle) + (input.clientY - drag.startClientY) * Math.sin(angle);
    const width = drag.startWidth + delta / Math.max(input.zoom, Number.EPSILON);
    return this.applyWidth(drag.note.id, width);
  }

  endWidthDrag(pointerId: number): NoteWidthDragEndResult {
    if (!this.widthDrag || this.widthDrag.pointerId !== pointerId) return { kind: "ignored" };
    this.widthDrag = null;
    return { kind: "ended", commit: this.finishWidthPropertyEdit() };
  }

  cancelWidthDrag() {
    this.widthDrag = null;
  }

  clearPointerInteractions(policy: "rollback" | "discard"): NotePointerInteractionCleanup {
    const drag = this.activeDrag;
    const widthDrag = this.widthDrag;
    const dragNoteIds = drag ? [...drag.startPositions.keys()] : [];

    if (policy === "rollback") {
      drag?.startPositions.forEach((point, noteId) => {
        const note = this.noteById(noteId);
        if (!note) return;
        note.x = point.x;
        note.y = point.y;
      });
      if (widthDrag && this.noteById(widthDrag.note.id) === widthDrag.note) {
        widthDrag.note.width = widthDrag.startWidth;
        this.layer.applyNoteElementSize(widthDrag.note);
        this.layer.refreshMarkdownLayout(widthDrag.note.id);
      }
    }

    this.cancelDrag();
    this.widthDrag = null;
    if (widthDrag && this.widthTransaction?.note === widthDrag.note) {
      this.widthTransaction = null;
    }
    return {
      dragNoteIds,
      widthNoteId: widthDrag?.note.id ?? null
    };
  }

  beginFontSizePropertyEdit(noteId: string) {
    const note = this.noteById(noteId);
    if (!note) return false;
    if (this.fontSizeTransaction) return this.fontSizeTransaction.note === note;
    this.fontSizeTransaction = {
      note,
      snapshot: createNoteFontSizeSnapshot(note),
      mergedIntoEdit: this.activeEdit?.note === note
    };
    return true;
  }

  applyFontSizeInput(noteId: string, value: string): NoteLiveMutationResult {
    const fontSize = normalizeNoteFontSizeInput(value);
    if (fontSize === null) return invalidMutation();
    const note = this.noteById(noteId);
    if (!note || !this.beginFontSizePropertyEdit(noteId)) return invalidMutation();
    const result = applyNoteFontSize(note, fontSize);
    if (result.status === "changed") {
      this.layer.resizeNoteToText(note, note.text, result.nextSize);
      this.layer.setNoteFontSize(note, result.nextSize);
    }
    return { valid: true, changed: result.status === "changed", value: result.nextSize };
  }

  finishFontSizePropertyEdit() {
    const transaction = this.fontSizeTransaction;
    this.fontSizeTransaction = null;
    if (!transaction || this.noteById(transaction.note.id) !== transaction.note) return null;
    if (transaction.mergedIntoEdit && this.activeEdit?.note === transaction.note) return null;
    return commitNoteFontSizeDocumentOp(transaction.snapshot, transaction.note);
  }

  flushPropertyEdits() {
    this.widthDrag = null;
    const commits = [
      this.finishFontSizePropertyEdit(),
      this.finishWidthPropertyEdit()
    ];
    return commits.filter((commit): commit is SchematicDocumentOpResult => commit !== null);
  }

  invalidateAgainstDocument(): NoteInteractionInvalidation {
    const invalidation: NoteInteractionInvalidation = { edit: false, drag: false, width: false, fontSize: false };
    if (this.activeEdit && this.noteById(this.activeEdit.note.id) !== this.activeEdit.note) {
      const edit = this.activeEdit;
      this.clearEdit(edit, true);
      invalidation.edit = true;
    }
    if (this.activeDrag && this.noteById(this.activeDrag.note.id) !== this.activeDrag.note) {
      this.cancelDrag();
      invalidation.drag = true;
    }
    if (this.widthTransaction && this.noteById(this.widthTransaction.note.id) !== this.widthTransaction.note) {
      this.widthTransaction = null;
      this.widthDrag = null;
      invalidation.width = true;
    }
    if (this.widthDrag && this.noteById(this.widthDrag.note.id) !== this.widthDrag.note) {
      this.widthDrag = null;
      invalidation.width = true;
    }
    if (this.fontSizeTransaction && this.noteById(this.fontSizeTransaction.note.id) !== this.fontSizeTransaction.note) {
      this.fontSizeTransaction = null;
      invalidation.fontSize = true;
    }
    if (this.completedDrag && !this.noteById(this.completedDrag.noteId)) this.completedDrag = null;
    return invalidation;
  }

  dispose() {
    if (this.activeEdit) this.clearEdit(this.activeEdit, true);
    this.cancelDrag();
    this.widthDrag = null;
    this.widthTransaction = null;
    this.fontSizeTransaction = null;
  }

  private applyWidth(noteId: string, width: number): NoteLiveMutationResult {
    const note = this.noteById(noteId);
    if (!note || note.format !== "markdown" || !this.beginWidthPropertyEdit(noteId)) return invalidMutation();
    const result = applyNoteWidth(note, width);
    if (result.status === "changed") {
      this.layer.applyNoteElementSize(note);
      this.layer.refreshMarkdownLayout(note.id);
    }
    return { valid: true, changed: result.status === "changed", value: result.nextSize };
  }

  private editIsCurrent(edit: ActiveEdit) {
    return this.activeEdit === edit && this.noteById(edit.note.id) === edit.note;
  }

  private clearEdit(edit: ActiveEdit, unmount: boolean) {
    if (this.activeEdit === edit) this.activeEdit = null;
    if (unmount) this.layer.unmountEditor(edit.note);
  }

  private clearMergedPropertyTransactions(noteId: string) {
    if (this.widthTransaction?.note.id === noteId && this.widthTransaction.mergedIntoEdit) {
      this.widthTransaction = null;
      this.widthDrag = null;
    }
    if (this.fontSizeTransaction?.note.id === noteId && this.fontSizeTransaction.mergedIntoEdit) {
      this.fontSizeTransaction = null;
    }
  }

  private noteById(noteId: string) {
    return this.document.notes.find((note) => note.id === noteId);
  }
}

export function projectNoteGroupDrag(
  startPositions: ReadonlyMap<string, Point>,
  activeNoteId: string,
  activePoint: Point
) {
  const activeStart = startPositions.get(activeNoteId);
  if (!activeStart) return new Map<string, Point>();
  const dx = activePoint.x - activeStart.x;
  const dy = activePoint.y - activeStart.y;
  return new Map(
    [...startPositions].map(([noteId, start]) => [noteId, { x: start.x + dx, y: start.y + dy }])
  );
}

function createEditSnapshot(note: SchematicNote): NoteEditCommitSnapshot {
  return {
    noteId: note.id,
    text: note.text,
    width: note.width,
    height: note.height,
    fontSizePx: note.fontSizePx
  };
}

function normalizeText(value: string) {
  return value.replace(/\r\n?/g, "\n");
}

function invalidMutation(): NoteLiveMutationResult {
  return { valid: false, changed: false };
}

function noteCommitResult(changed: boolean, status: string, noteIds: string[]): SchematicDocumentOpResult {
  return {
    changed,
    historyIntent: changed ? "push" : "none",
    selectedIds: [],
    noteIds,
    status
  };
}
