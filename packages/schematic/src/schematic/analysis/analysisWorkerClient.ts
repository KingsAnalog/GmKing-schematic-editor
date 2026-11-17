import type { AnalysisPortSelection, AnalysisResult, SchematicDocument } from "../types";

const SYMBOLIC_ANALYSIS_WORKER_FAILED_MESSAGE = "Symbolic analysis worker failed.";

export interface SchematicAnalysisWorkerPayload {
  document: SchematicDocument;
  selection: AnalysisPortSelection;
}

export interface SchematicAnalysisWorkerRequest extends SchematicAnalysisWorkerPayload {
  id: number;
}

export interface SchematicAnalysisWorkerResponse {
  id: number;
  result: AnalysisResult;
}

export interface SchematicAnalysisWorkerLike {
  postMessage(message: SchematicAnalysisWorkerRequest): void;
  addEventListener(type: "message", listener: (event: MessageEvent<SchematicAnalysisWorkerResponse>) => void): void;
  addEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  removeEventListener(type: "message", listener: (event: MessageEvent<SchematicAnalysisWorkerResponse>) => void): void;
  removeEventListener(type: "error", listener: (event: ErrorEvent) => void): void;
  terminate?(): void;
}

export type SchematicAnalysisWorkerFactory = () => SchematicAnalysisWorkerLike;

export function createDefaultSchematicAnalysisWorker(): SchematicAnalysisWorkerLike {
  return new Worker(new URL("./analysis.worker.ts", import.meta.url), { type: "module" });
}

export class SchematicAnalysisWorkerClient {
  private worker: SchematicAnalysisWorkerLike | null = null;
  private readonly pending = new Set<{
    reject(error: Error): void;
    cleanup(): void;
  }>();

  constructor(private readonly createWorker: SchematicAnalysisWorkerFactory = createDefaultSchematicAnalysisWorker) {}

  async run(runId: number, payload: SchematicAnalysisWorkerPayload): Promise<AnalysisResult> {
    const worker = this.ensureWorker();
    return new Promise<AnalysisResult>((resolve, reject) => {
      let pending!: { reject(error: Error): void; cleanup(): void };
      const cleanup = () => {
        worker.removeEventListener("message", handleMessage);
        worker.removeEventListener("error", handleError);
        this.pending.delete(pending);
      };

      const handleMessage = (event: MessageEvent<SchematicAnalysisWorkerResponse>) => {
        if (event.data.id !== runId) return;
        cleanup();
        resolve(event.data.result);
      };

      const handleError = (event: ErrorEvent) => {
        this.discardWorker(worker, new Error(event.message || SYMBOLIC_ANALYSIS_WORKER_FAILED_MESSAGE));
      };

      pending = { reject, cleanup };
      this.pending.add(pending);
      try {
        worker.addEventListener("message", handleMessage);
        worker.addEventListener("error", handleError);
        worker.postMessage({ id: runId, ...payload });
      } catch (error) {
        // A payload that cannot be cloned must not leak listeners or cancel other requests.
        cleanup();
        reject(error);
      }
    });
  }

  cancel() {
    if (this.worker) this.discardWorker(this.worker, new Error("Symbolic analysis canceled."));
  }

  private discardWorker(worker: SchematicAnalysisWorkerLike, error: Error) {
    if (this.worker !== worker) return;
    this.worker = null;
    [...this.pending].forEach((pending) => {
      pending.cleanup();
      pending.reject(error);
    });
    worker.terminate?.();
  }

  private ensureWorker() {
    if (!this.worker) this.worker = this.createWorker();
    return this.worker;
  }
}
