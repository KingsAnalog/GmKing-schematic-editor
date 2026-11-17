export interface SnapshotHistoryOptions<T> {
  maxDepth?: number;
  clone?: (state: T) => T;
  serialize?: (state: T) => string;
}

interface HistoryEntry<T> {
  value: T;
  serialized: string;
}

const DEFAULT_MAX_DEPTH = 256;

export class SnapshotHistory<T> {
  private readonly maxDepth: number;
  private readonly cloneState: (state: T) => T;
  private readonly serializeState: (state: T) => string;
  private undoStack: Array<HistoryEntry<T>> = [];
  private redoStack: Array<HistoryEntry<T>> = [];

  constructor(initialState: T, options: SnapshotHistoryOptions<T> = {}) {
    this.maxDepth = Math.max(1, Math.trunc(options.maxDepth ?? DEFAULT_MAX_DEPTH));
    this.cloneState = options.clone ?? defaultClone;
    this.serializeState = options.serialize ?? defaultSerialize;
    this.reset(initialState);
  }

  get canUndo() {
    return this.undoStack.length > 1;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  push(state: T) {
    const entry = this.makeEntry(state);
    const previous = this.undoStack[this.undoStack.length - 1];
    if (previous?.serialized === entry.serialized) {
      return false;
    }
    this.undoStack.push(entry);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
    return true;
  }

  undo(currentState?: T) {
    if (!this.canUndo) {
      return null;
    }
    const current = this.undoStack.pop();
    if (current) {
      this.redoStack.push(currentState === undefined ? current : this.makeEntry(currentState));
    }
    return this.cloneState(this.undoStack[this.undoStack.length - 1].value);
  }

  redo(currentState?: T) {
    const next = this.redoStack.pop();
    if (!next) {
      return null;
    }
    if (currentState !== undefined) {
      const current = this.makeEntry(currentState);
      const previous = this.undoStack[this.undoStack.length - 1];
      if (previous?.serialized !== current.serialized) {
        this.undoStack.push(current);
      }
    }
    this.undoStack.push(next);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    return this.cloneState(next.value);
  }

  reset(state: T) {
    this.undoStack = [this.makeEntry(state)];
    this.redoStack = [];
  }

  private makeEntry(state: T): HistoryEntry<T> {
    const value = this.cloneState(state);
    return {
      value,
      serialized: this.serializeState(value)
    };
  }
}

export function createSnapshotHistory<T>(initialState: T, options?: SnapshotHistoryOptions<T>) {
  return new SnapshotHistory(initialState, options);
}

function defaultClone<T>(state: T) {
  return JSON.parse(JSON.stringify(state)) as T;
}

function defaultSerialize<T>(state: T) {
  return JSON.stringify(state);
}
