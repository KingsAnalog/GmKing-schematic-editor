import type { SchematicDocumentState } from "../shared/workspaceState";

type ViewSnapshot = Omit<SchematicDocumentState, "document">;

/** Coalesces viewport changes without reading, cloning or saving circuit content. */
export class SchematicViewPersistenceController {
  private pending = new Map<string, ViewSnapshot>();
  private frame: number | null = null;

  constructor(private readonly options: {
    schedule(callback: () => void): number;
    cancel(handle: number): void;
    write(id: string, view: ViewSnapshot): void;
    onError(error: unknown): void;
  }) {}

  update(id: string, view: ViewSnapshot) {
    this.pending.set(id, structuredClone(view));
    this.frame ??= this.options.schedule(() => { this.frame = null; this.flush(); });
  }

  flush() {
    if (this.frame !== null) this.options.cancel(this.frame);
    this.frame = null;
    for (const [id, view] of this.pending) {
      try { this.options.write(id, view); this.pending.delete(id); }
      catch (error) { this.options.onError(error); }
    }
  }

  destroy() { this.flush(); this.pending.clear(); }
}
