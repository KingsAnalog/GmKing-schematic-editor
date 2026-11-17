import {
  assignRestoredSchematicDocument,
  cloneSchematicDocument,
  restoreSchematicDocument
} from "./document/documentModel";
import type {
  SchematicPropertyBatchCommand,
  SchematicPropertyBatchCommandResult,
  SchematicPropertyBatchSelection
} from "./propertyBatchCommands";
import type { SchematicDocument } from "./types";

export type SchematicPropertyEditKind =
  | `source-field:${string}`
  | `triangle-pins:${"ab" | "bc" | "ca"}`
  | "component-ref"
  | "component-value"
  | "component-color"
  | "network-color"
  | "wire-digital-label"
  | "net-label"
  | "note-background"
  | "note-text-color"
  | "rectangle-width"
  | "rectangle-height"
  | "rectangle-left-pins"
  | "rectangle-right-pins"
  | "rectangle-top-pins"
  | "rectangle-bottom-pins";

export interface SchematicPropertyEditFrameScheduler {
  request(callback: () => void): number;
  cancel(handle: number): void;
}

export interface SchematicPropertyEditCommitResult {
  kind: "inactive" | "committed" | "invalid";
  changed: boolean;
  restored: boolean;
  rebuildCounters: boolean;
  status: string;
}

export interface SchematicPropertyEditCancelResult {
  cancelled: boolean;
  restored: boolean;
}

type ApplyPropertyPreview = (
  selection: SchematicPropertyBatchSelection,
  command: SchematicPropertyBatchCommand
) => SchematicPropertyBatchCommandResult;

interface ActivePropertyEdit {
  kind: SchematicPropertyEditKind;
  selection: {
    selectedIds: string[];
    selectedNoteIds: string[];
  };
  baseline: SchematicDocument;
  baselineSignature: string;
  pendingCommand: SchematicPropertyBatchCommand | null;
  frameHandle: number | null;
  rebuildCounters: boolean;
  lastStatus: string;
}

const defaultFrameScheduler: SchematicPropertyEditFrameScheduler = {
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
 * Owns one live Property Editor edit. Preview commands mutate the live document,
 * while the caller records a single history snapshot only after commit.
 */
export class SchematicPropertyEditSession {
  private active: ActivePropertyEdit | null = null;

  constructor(
    private readonly document: SchematicDocument,
    private readonly applyPreview: ApplyPropertyPreview,
    private readonly onRestore: () => void,
    private readonly scheduler: SchematicPropertyEditFrameScheduler = defaultFrameScheduler
  ) {}

  get activeKind() {
    return this.active?.kind ?? null;
  }

  begin(kind: SchematicPropertyEditKind, selection: SchematicPropertyBatchSelection) {
    const normalizedSelection = normalizeSelection(selection);
    if (
      this.active?.kind === kind
      && sameIds(this.active.selection.selectedIds, normalizedSelection.selectedIds)
      && sameIds(this.active.selection.selectedNoteIds, normalizedSelection.selectedNoteIds)
    ) {
      return true;
    }
    if (this.active) this.cancel();
    if (normalizedSelection.selectedIds.length + normalizedSelection.selectedNoteIds.length === 0) {
      return false;
    }
    const baseline = cloneSchematicDocument(this.document);
    this.active = {
      kind,
      selection: normalizedSelection,
      baseline,
      baselineSignature: documentSignature(baseline),
      pendingCommand: null,
      frameHandle: null,
      rebuildCounters: false,
      lastStatus: ""
    };
    return true;
  }

  input(kind: SchematicPropertyEditKind, command: SchematicPropertyBatchCommand) {
    const session = this.active;
    if (!session || session.kind !== kind) return false;
    session.pendingCommand = command;
    if (session.frameHandle !== null) return true;
    session.frameHandle = this.scheduler.request(() => {
      if (this.active !== session) return;
      session.frameHandle = null;
      this.flushPending(session);
    });
    return true;
  }

  commit(
    kind: SchematicPropertyEditKind,
    finalCommand: SchematicPropertyBatchCommand
  ): SchematicPropertyEditCommitResult {
    const session = this.active;
    if (!session || session.kind !== kind) {
      return inactiveCommitResult();
    }

    session.pendingCommand = finalCommand;
    this.cancelScheduledFrame(session);
    const outcome = this.flushPending(session);
    if (outcome?.kind === "rejected") {
      this.active = null;
      this.restore(session);
      return {
        kind: "invalid",
        changed: false,
        restored: true,
        rebuildCounters: false,
        status: outcome.status
      };
    }

    this.active = null;
    const changed = documentSignature(this.document) !== session.baselineSignature;
    return {
      kind: "committed",
      changed,
      restored: false,
      rebuildCounters: changed && session.rebuildCounters,
      status: changed ? session.lastStatus : ""
    };
  }

  commitPending(): SchematicPropertyEditCommitResult {
    const session = this.active;
    if (!session) return inactiveCommitResult();
    this.cancelScheduledFrame(session);
    const outcome = this.flushPending(session);
    if (outcome?.kind === "rejected") {
      this.active = null;
      this.restore(session);
      return {
        kind: "invalid",
        changed: false,
        restored: true,
        rebuildCounters: false,
        status: outcome.status
      };
    }
    this.active = null;
    const changed = documentSignature(this.document) !== session.baselineSignature;
    return {
      kind: "committed",
      changed,
      restored: false,
      rebuildCounters: changed && session.rebuildCounters,
      status: changed ? session.lastStatus : ""
    };
  }

  cancel(kind?: SchematicPropertyEditKind): SchematicPropertyEditCancelResult {
    const session = this.active;
    if (!session || (kind !== undefined && session.kind !== kind)) {
      return { cancelled: false, restored: false };
    }
    this.cancelScheduledFrame(session);
    this.active = null;
    this.restore(session);
    return { cancelled: true, restored: true };
  }

  dispose() {
    return this.cancel();
  }

  private flushPending(session: ActivePropertyEdit) {
    const command = session.pendingCommand;
    session.pendingCommand = null;
    if (!command) return null;
    const outcome = this.applyPreview(session.selection, command);
    if (outcome.kind === "changed") {
      session.rebuildCounters ||= outcome.rebuildCounters;
      session.lastStatus = outcome.status;
    }
    return outcome;
  }

  private cancelScheduledFrame(session: ActivePropertyEdit) {
    if (session.frameHandle === null) return;
    this.scheduler.cancel(session.frameHandle);
    session.frameHandle = null;
  }

  private restore(session: ActivePropertyEdit) {
    assignRestoredSchematicDocument(
      this.document,
      restoreSchematicDocument(session.baseline)
    );
    this.onRestore();
  }
}

function normalizeSelection(selection: SchematicPropertyBatchSelection) {
  return {
    selectedIds: [...new Set(selection.selectedIds)],
    selectedNoteIds: [...new Set(selection.selectedNoteIds)]
  };
}

function sameIds(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function documentSignature(document: SchematicDocument) {
  return JSON.stringify(document);
}

function inactiveCommitResult(): SchematicPropertyEditCommitResult {
  return {
    kind: "inactive",
    changed: false,
    restored: false,
    rebuildCounters: false,
    status: ""
  };
}
