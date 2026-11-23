import type {
  SchematicDocumentHistoryIntent,
  SchematicDocumentOpResult
} from "../document/documentOps";
import type { SchematicDocument, SchematicNote } from "../types";
import {
  applyNoteFontSize,
  normalizeNoteFontSizeInput
} from "./noteProperties";
import { noteFontSizePx } from "./noteSizing";

export type NotePropertyBatchKind = "font-size";
export type NotePropertyBatchProjectionPhase = "preview" | "restore";

export interface NotePropertyBatchProjectionContext {
  kind: NotePropertyBatchKind;
  phase: NotePropertyBatchProjectionPhase;
}

export type NotePropertyBatchProject = (
  note: SchematicNote,
  context: NotePropertyBatchProjectionContext
) => void;

export interface NotePropertyBatchFrameScheduler {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

export interface NotePropertyBatchSnapshot {
  noteId: string;
  fontSizePx?: number;
  width: number;
  height?: number;
}

export type NotePropertyBatchBeginResult =
  | {
      ok: true;
      kind: NotePropertyBatchKind;
      noteIds: string[];
      reused: boolean;
    }
  | {
      ok: false;
      reason: "empty" | "missing" | "ambiguous";
      noteIds: string[];
    };

export type NotePropertyBatchInputResult =
  | { accepted: false; reason: "inactive" | "invalid" }
  | { accepted: true; value: number; scheduled: boolean };

export interface NotePropertyBatchCancelResult {
  cancelled: boolean;
  restored: boolean;
  noteIds: string[];
}

export type NotePropertyBatchInvalidationResult =
  | { invalidated: false }
  | {
      invalidated: true;
      reason: "document" | "selection";
      restored: boolean;
      noteIds: string[];
    };

interface ActiveNoteTarget {
  note: SchematicNote;
  snapshot: NotePropertyBatchSnapshot;
  resolvedValue: number;
}

interface ActiveNotePropertyBatch {
  kind: NotePropertyBatchKind;
  targets: ActiveNoteTarget[];
  pendingValue: number | null;
  frameHandle: number | null;
}

const defaultFrameScheduler: NotePropertyBatchFrameScheduler = {
  request(callback) {
    if (typeof requestAnimationFrame === "function") {
      return requestAnimationFrame(() => callback());
    }
    return setTimeout(callback, 0) as unknown as number;
  },
  cancel(handle) {
    if (typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(handle);
      return;
    }
    clearTimeout(handle);
  }
};

/**
 * Owns a single live multi-Note size edit. The document is mutated for preview,
 * while history and persistence remain the caller's responsibility at commit.
 */
export class NotePropertyBatchSession {
  private active: ActiveNotePropertyBatch | null = null;

  constructor(
    private readonly document: SchematicDocument,
    private readonly projectNote: NotePropertyBatchProject,
    private readonly scheduler: NotePropertyBatchFrameScheduler = defaultFrameScheduler
  ) {}

  get activeKind() {
    return this.active?.kind ?? null;
  }

  get activeNoteIds() {
    return this.active?.targets.map(({ note }) => note.id) ?? [];
  }

  begin(kind: NotePropertyBatchKind, selectedIds: readonly string[]): NotePropertyBatchBeginResult {
    const preflight = this.preflight(selectedIds);
    if (!preflight.ok) return preflight;

    if (
      this.active?.kind === kind &&
      sameOrderedIds(
        this.active.targets.map(({ note }) => note.id),
        preflight.notes.map((note) => note.id)
      ) &&
      this.sessionTargetsAreLive(this.active)
    ) {
      return {
        ok: true,
        kind,
        noteIds: preflight.notes.map((note) => note.id),
        reused: true
      };
    }

    this.cancel();
    this.active = {
      kind,
      targets: preflight.notes.map((note) => ({
        note,
        snapshot: snapshotNote(note),
        resolvedValue: noteFontSizePx(note)
      })),
      pendingValue: null,
      frameHandle: null
    };
    return {
      ok: true,
      kind,
      noteIds: preflight.notes.map((note) => note.id),
      reused: false
    };
  }

  input(value: string): NotePropertyBatchInputResult {
    const session = this.active;
    if (!session) return { accepted: false, reason: "inactive" };

    const normalized = normalizeNoteFontSizeInput(value);
    if (normalized === null) {
      session.pendingValue = null;
      this.cancelScheduledFrame(session);
      return { accepted: false, reason: "invalid" };
    }

    session.pendingValue = normalized;
    if (session.frameHandle !== null) {
      return { accepted: true, value: normalized, scheduled: false };
    }
    session.frameHandle = this.scheduler.request(() => {
      if (this.active !== session) return;
      session.frameHandle = null;
      this.flushPending(session);
    });
    return { accepted: true, value: normalized, scheduled: true };
  }

  /**
   * Applies the control's final value synchronously, even when its preview RAF
   * has not run yet, then returns the caller's single history intent.
   */
  commit(finalValue?: string): SchematicDocumentOpResult | null {
    const session = this.active;
    if (!session) return null;

    if (finalValue !== undefined) {
      const normalized = normalizeNoteFontSizeInput(finalValue);
      session.pendingValue = normalized;
    }
    this.cancelScheduledFrame(session);
    if (!this.sessionTargetsAreLive(session)) {
      this.active = null;
      this.restoreCurrentTargets(session);
      return null;
    }
    this.flushPending(session);
    if (this.active !== session) return null;

    this.active = null;
    const changedNoteIds = session.targets
      .filter(({ note, snapshot }) => snapshotChanged(snapshot, note))
      .map(({ note }) => note.id);
    const changed = changedNoteIds.length > 0;
    return batchCommitResult(changed, changedNoteIds);
  }

  cancel(): NotePropertyBatchCancelResult {
    const session = this.active;
    if (!session) return { cancelled: false, restored: false, noteIds: [] };

    this.cancelScheduledFrame(session);
    this.active = null;
    const restoredIds = this.restoreCurrentTargets(session);
    return {
      cancelled: true,
      restored: restoredIds.length > 0,
      noteIds: restoredIds
    };
  }

  /**
   * Call after selection changes or a document restore. Selection invalidation
   * rolls a valid preview back; replacement document objects are never mutated.
   */
  invalidateAgainstDocument(currentSelectionIds: readonly string[]): NotePropertyBatchInvalidationResult {
    const session = this.active;
    if (!session) return { invalidated: false };

    if (!this.sessionTargetsAreLive(session)) {
      this.cancelScheduledFrame(session);
      this.active = null;
      const restoredIds = this.restoreCurrentTargets(session);
      return {
        invalidated: true,
        reason: "document",
        restored: restoredIds.length > 0,
        noteIds: restoredIds
      };
    }

    const selectedIds = uniqueIds(currentSelectionIds);
    const targetIds = session.targets.map(({ note }) => note.id);
    if (selectedIds.length === targetIds.length && targetIds.every((id) => selectedIds.includes(id))) {
      return { invalidated: false };
    }

    const result = this.cancel();
    return {
      invalidated: true,
      reason: "selection",
      restored: result.restored,
      noteIds: result.noteIds
    };
  }

  dispose() {
    return this.cancel();
  }

  private preflight(
    selectedIds: readonly string[]
  ):
    | { ok: true; notes: SchematicNote[] }
    | Extract<NotePropertyBatchBeginResult, { ok: false }> {
    const requestedIds = uniqueIds(selectedIds);
    if (requestedIds.length === 0) return { ok: false, reason: "empty", noteIds: [] };

    const requested = new Set(requestedIds);
    const noteCounts = new Map<string, number>();
    for (const note of this.document.notes) {
      if (requested.has(note.id)) noteCounts.set(note.id, (noteCounts.get(note.id) ?? 0) + 1);
    }
    const ambiguousIds = requestedIds.filter((id) => (noteCounts.get(id) ?? 0) > 1);
    if (ambiguousIds.length > 0) {
      return { ok: false, reason: "ambiguous", noteIds: ambiguousIds };
    }

    const missingIds = requestedIds.filter((id) => (noteCounts.get(id) ?? 0) === 0);
    if (missingIds.length > 0) return { ok: false, reason: "missing", noteIds: missingIds };

    const notes = this.document.notes.filter((note) => requested.has(note.id));
    return { ok: true, notes };
  }

  private flushPending(session: ActiveNotePropertyBatch) {
    if (session.pendingValue === null) return;
    if (!this.sessionTargetsAreLive(session)) {
      this.active = null;
      this.restoreCurrentTargets(session);
      return;
    }

    const value = session.pendingValue;
    session.pendingValue = null;
    for (const target of session.targets) {
      if (value === target.resolvedValue) {
        if (!snapshotChanged(target.snapshot, target.note)) continue;
        restoreSnapshot(target.note, target.snapshot);
        this.projectNote(target.note, { kind: session.kind, phase: "restore" });
        continue;
      }

      const result = applyNoteFontSize(target.note, value);
      if (result.status === "changed") {
        this.projectNote(target.note, { kind: session.kind, phase: "preview" });
      }
    }
  }

  private cancelScheduledFrame(session: ActiveNotePropertyBatch) {
    if (session.frameHandle === null) return;
    this.scheduler.cancel(session.frameHandle);
    session.frameHandle = null;
  }

  private sessionTargetsAreLive(session: ActiveNotePropertyBatch) {
    if (session.targets.length === 0) return false;
    const liveById = new Map<string, SchematicNote | null>();
    for (const note of this.document.notes) {
      if (!liveById.has(note.id)) {
        liveById.set(note.id, note);
      } else {
        liveById.set(note.id, null);
      }
    }
    return session.targets.every(
      ({ note }) =>
        liveById.get(note.id) === note
    );
  }

  private restoreCurrentTargets(session: ActiveNotePropertyBatch) {
    const currentNotes = new Set(this.document.notes);
    const restoredIds: string[] = [];
    for (const target of session.targets) {
      if (!currentNotes.has(target.note)) continue;
      restoreSnapshot(target.note, target.snapshot);
      this.projectNote(target.note, { kind: session.kind, phase: "restore" });
      restoredIds.push(target.note.id);
    }
    return restoredIds;
  }
}

function snapshotNote(note: SchematicNote): NotePropertyBatchSnapshot {
  return {
    noteId: note.id,
    fontSizePx: note.fontSizePx,
    width: note.width,
    height: note.height
  };
}

function restoreSnapshot(note: SchematicNote, snapshot: NotePropertyBatchSnapshot) {
  note.fontSizePx = snapshot.fontSizePx;
  note.width = snapshot.width;
  note.height = snapshot.height;
}

function snapshotChanged(snapshot: NotePropertyBatchSnapshot, note: SchematicNote) {
  return (
    snapshot.fontSizePx !== note.fontSizePx ||
    snapshot.width !== note.width ||
    snapshot.height !== note.height
  );
}

function uniqueIds(ids: readonly string[]) {
  return [...new Set(ids)];
}

function sameOrderedIds(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function batchCommitResult(
  changed: boolean,
  noteIds: string[]
): SchematicDocumentOpResult {
  const historyIntent: SchematicDocumentHistoryIntent = changed ? "push" : "none";
  return {
    changed,
    historyIntent,
    selectedIds: [],
    noteIds,
    status: changed
      ? "Note font size updated."
      : ""
  };
}
