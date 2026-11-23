import { moveSchematicNoteDocumentOp, type SchematicDocumentOpResult } from "../document/documentOps";
import { snapPoint } from "../geometry";
import type { Point, SchematicDocument, SchematicNote } from "../types";

type NoteDragMoveResult =
  | { kind: "ignored" }
  | { kind: "move"; noteId: string; changedNoteIds: string[] };

interface ActiveDrag {
  note: SchematicNote;
  pointerId: number;
  clientX: number;
  clientY: number;
  startPositions: Map<string, Point>;
  moved: boolean;
}

export class SchematicNoteInteractionController {
  private activeDrag: ActiveDrag | null = null;
  private completedDrag: { noteId: string; moved: boolean } | null = null;

  constructor(private readonly document: SchematicDocument) {}

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

  clearPointerInteractions(policy: "rollback" | "discard") {
    const drag = this.activeDrag;
    this.cancelDrag();
    if (!drag) return [];
    if (policy === "rollback" && this.noteById(drag.note.id) === drag.note) {
      for (const [id, point] of drag.startPositions) {
        const note = this.noteById(id);
        if (note) Object.assign(note, point);
      }
    }
    return [...drag.startPositions.keys()];
  }

  invalidateAgainstDocument() {
    if (!this.activeDrag || this.noteById(this.activeDrag.note.id) === this.activeDrag.note) return false;
    this.cancelDrag();
    return true;
  }

  private noteById(id: string) {
    return this.document.notes.find(note => note.id === id);
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

function noteCommitResult(changed: boolean, status: string, noteIds: string[]): SchematicDocumentOpResult {
  return {
    changed,
    historyIntent: changed ? "push" : "none",
    selectedIds: [],
    noteIds,
    status
  };
}
