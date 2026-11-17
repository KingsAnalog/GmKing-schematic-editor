export interface RecentlyClosedTabEntry<T> {
  value: T;
  index: number;
  replacementId?: string;
}

export interface RecentlyClosedTabRuntime {
  setTimeout(callback: () => void, delayMs: number): number;
  clearTimeout(handle: number): void;
}

export class RecentlyClosedTabController<T> {
  private entry: RecentlyClosedTabEntry<T> | null = null;
  private timer: number | null = null;

  constructor(
    private readonly timeoutMs: number,
    private readonly runtime: RecentlyClosedTabRuntime = {
      setTimeout: (callback, delayMs) => globalThis.setTimeout(callback, delayMs) as unknown as number,
      clearTimeout: (handle) => globalThis.clearTimeout(handle)
    }
  ) {}

  replace(
    entry: RecentlyClosedTabEntry<T>,
    onExpire?: (entry: RecentlyClosedTabEntry<T>) => void
  ) {
    this.clear();
    this.entry = entry;
    this.timer = this.runtime.setTimeout(() => {
      if (this.entry !== entry) return;
      this.entry = null;
      this.timer = null;
      onExpire?.(entry);
    }, this.timeoutMs);
  }

  peek() {
    return this.entry;
  }

  take() {
    const entry = this.entry;
    this.clear();
    return entry;
  }

  clear() {
    if (this.timer !== null) this.runtime.clearTimeout(this.timer);
    this.timer = null;
    this.entry = null;
  }
}
