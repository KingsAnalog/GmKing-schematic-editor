import { fixtureDocument } from "../support/fixtureDocument";
import { describe, expect, it, vi } from "vitest";
import {
  SchematicAnalysisWorkerClient,
  type SchematicAnalysisWorkerLike,
  type SchematicAnalysisWorkerRequest,
  type SchematicAnalysisWorkerResponse
} from "../../../src/schematic/analysis/analysisWorkerClient";
import type { AnalysisPortSelection, AnalysisResult, SchematicDocument } from "../../../src/schematic/types";

type MessageListener = (event: MessageEvent<SchematicAnalysisWorkerResponse>) => void;
type ErrorListener = (event: ErrorEvent) => void;

class FakeWorker implements SchematicAnalysisWorkerLike {
  readonly postedMessages: SchematicAnalysisWorkerRequest[] = [];
  terminateCalls = 0;
  nextPostError: Error | null = null;
  private readonly messageListeners = new Set<MessageListener>();
  private readonly errorListeners = new Set<ErrorListener>();

  postMessage(message: SchematicAnalysisWorkerRequest) {
    if (this.nextPostError) {
      const error = this.nextPostError;
      this.nextPostError = null;
      throw error;
    }
    this.postedMessages.push(message);
  }

  addEventListener(type: "message", listener: MessageListener): void;
  addEventListener(type: "error", listener: ErrorListener): void;
  addEventListener(type: "message" | "error", listener: MessageListener | ErrorListener) {
    if (type === "message") {
      this.messageListeners.add(listener as MessageListener);
      return;
    }
    this.errorListeners.add(listener as ErrorListener);
  }

  removeEventListener(type: "message", listener: MessageListener): void;
  removeEventListener(type: "error", listener: ErrorListener): void;
  removeEventListener(type: "message" | "error", listener: MessageListener | ErrorListener) {
    if (type === "message") {
      this.messageListeners.delete(listener as MessageListener);
      return;
    }
    this.errorListeners.delete(listener as ErrorListener);
  }

  terminate() {
    this.terminateCalls += 1;
  }

  messageListenerCount() {
    return this.messageListeners.size;
  }

  errorListenerCount() {
    return this.errorListeners.size;
  }

  emitMessage(id: number, result: AnalysisResult) {
    const event = { data: { id, result } } as MessageEvent<SchematicAnalysisWorkerResponse>;
    [...this.messageListeners].forEach((listener) => listener(event));
  }

  emitError(message?: string) {
    const event = { message } as ErrorEvent;
    [...this.errorListeners].forEach((listener) => listener(event));
  }
}

function createHarness() {
  const workers: FakeWorker[] = [];
  const client = new SchematicAnalysisWorkerClient(() => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  });
  return { client, workers };
}

function sampleDocument(): SchematicDocument {
  return fixtureDocument({

    junctionAppearances: [],
    netLabels: [],
    notes: [],
    components: [],
    wires: [],
    junctions: []
  });
}

function sampleSelection(): AnalysisPortSelection {
  return {
    inputP: "in",
    inputN: "0",
    outputP: "out",
    outputN: "0"
  };
}

function resultWithDiagnostic(diagnostic: string): AnalysisResult {
  return {
    ok: true,
    diagnostics: [diagnostic]
  };
}

describe("SchematicAnalysisWorkerClient", () => {
  it("lazy creates one worker and posts the id, document, and selection", async () => {
    const { client, workers } = createHarness();
    const document = sampleDocument();
    const selection = sampleSelection();
    const result = resultWithDiagnostic("done");

    expect(workers).toHaveLength(0);
    const request = client.run(17, { document, selection });

    expect(workers).toHaveLength(1);
    expect(workers[0].postedMessages).toEqual([{ id: 17, document, selection }]);

    workers[0].emitMessage(17, result);
    await expect(request).resolves.toBe(result);
  });

  it("ignores non-matching message IDs and keeps listeners installed", async () => {
    const { client, workers } = createHarness();
    const request = client.run(7, { document: sampleDocument(), selection: sampleSelection() });
    const worker = workers[0];

    worker.emitMessage(99, resultWithDiagnostic("ignored"));

    expect(worker.messageListenerCount()).toBe(1);
    expect(worker.errorListenerCount()).toBe(1);

    const result = resultWithDiagnostic("matched");
    worker.emitMessage(7, result);
    await expect(request).resolves.toBe(result);
  });

  it("resolves matching messages and removes message and error listeners", async () => {
    const { client, workers } = createHarness();
    const request = client.run(3, { document: sampleDocument(), selection: sampleSelection() });
    const worker = workers[0];
    const result = resultWithDiagnostic("matched");

    expect(worker.messageListenerCount()).toBe(1);
    expect(worker.errorListenerCount()).toBe(1);

    worker.emitMessage(3, result);
    await expect(request).resolves.toBe(result);

    expect(worker.messageListenerCount()).toBe(0);
    expect(worker.errorListenerCount()).toBe(0);
  });

  it("rejects worker errors with event.message or fallback text and cleans up", async () => {
    const { client, workers } = createHarness();
    const first = client.run(1, { document: sampleDocument(), selection: sampleSelection() });
    const worker = workers[0];

    worker.emitError("worker exploded");
    await expect(first).rejects.toThrow("worker exploded");
    expect(worker.messageListenerCount()).toBe(0);
    expect(worker.errorListenerCount()).toBe(0);

    const second = client.run(2, { document: sampleDocument(), selection: sampleSelection() });

    const replacement = workers[1];
    expect(worker.terminateCalls).toBe(1);
    replacement.emitError();
    await expect(second).rejects.toThrow("Symbolic analysis worker failed.");
    expect(replacement.messageListenerCount()).toBe(0);
    expect(replacement.errorListenerCount()).toBe(0);
  });

  it("resolves concurrent requests independently and only cleans up matching listeners", async () => {
    const { client, workers } = createHarness();
    const first = client.run(1, { document: sampleDocument(), selection: sampleSelection() });
    const second = client.run(2, { document: sampleDocument(), selection: sampleSelection() });
    const worker = workers[0];
    const firstResult = resultWithDiagnostic("first");
    const secondResult = resultWithDiagnostic("second");

    expect(worker.postedMessages.map((message) => message.id)).toEqual([1, 2]);
    expect(worker.messageListenerCount()).toBe(2);
    expect(worker.errorListenerCount()).toBe(2);

    worker.emitMessage(2, secondResult);
    await expect(second).resolves.toBe(secondResult);
    expect(worker.messageListenerCount()).toBe(1);
    expect(worker.errorListenerCount()).toBe(1);

    worker.emitMessage(1, firstResult);
    await expect(first).resolves.toBe(firstResult);
    expect(worker.messageListenerCount()).toBe(0);
    expect(worker.errorListenerCount()).toBe(0);
  });

  it("reuses the same worker across sequential calls", async () => {
    const { client, workers } = createHarness();
    const first = client.run(1, { document: sampleDocument(), selection: sampleSelection() });
    const worker = workers[0];
    const firstResult = resultWithDiagnostic("first");

    worker.emitMessage(1, firstResult);
    await expect(first).resolves.toBe(firstResult);

    const secondResult = resultWithDiagnostic("second");
    const second = client.run(2, { document: sampleDocument(), selection: sampleSelection() });

    expect(workers).toHaveLength(1);
    expect(workers[0]).toBe(worker);

    worker.emitMessage(2, secondResult);
    await expect(second).resolves.toBe(secondResult);
    expect(worker.postedMessages.map((message) => message.id)).toEqual([1, 2]);
  });

  it("cancels pending requests, terminates the busy worker, and creates a fresh worker later", async () => {
    const { client, workers } = createHarness();
    const pending = client.run(1, { document: sampleDocument(), selection: sampleSelection() });
    const firstWorker = workers[0];

    client.cancel();

    await expect(pending).rejects.toThrow("Symbolic analysis canceled.");
    expect(firstWorker.terminateCalls).toBe(1);
    expect(firstWorker.messageListenerCount()).toBe(0);
    expect(firstWorker.errorListenerCount()).toBe(0);

    const next = client.run(2, { document: sampleDocument(), selection: sampleSelection() });
    expect(workers).toHaveLength(2);
    workers[1].emitMessage(2, resultWithDiagnostic("fresh"));
    await expect(next).resolves.toEqual(resultWithDiagnostic("fresh"));
  });
});

describe("Worker failure recovery", () => {
  it("cleans up a failed send without disturbing another pending request", async () => {
    const { client, workers } = createHarness();
    const first = client.run(1, { document: sampleDocument(), selection: sampleSelection() });
    const worker = workers[0];
    worker.nextPostError = new Error("DataCloneError");
    await expect(client.run(2, { document: sampleDocument(), selection: sampleSelection() })).rejects.toThrow("DataCloneError");
    expect(worker.messageListenerCount()).toBe(1);
    expect(worker.errorListenerCount()).toBe(1);
    worker.emitMessage(1, resultWithDiagnostic("first survived"));
    await expect(first).resolves.toEqual(resultWithDiagnostic("first survived"));
    expect(worker.messageListenerCount()).toBe(0);
    expect(worker.errorListenerCount()).toBe(0);
    expect(worker.terminateCalls).toBe(0);
  });

  it("rejects all pending requests on a worker crash and recreates the worker on retry", async () => {
    const { client, workers } = createHarness();
    const first = client.run(1, { document: sampleDocument(), selection: sampleSelection() });
    const second = client.run(2, { document: sampleDocument(), selection: sampleSelection() });
    const oldWorker = workers[0];
    oldWorker.emitError("load failure");
    await expect(first).rejects.toThrow("load failure");
    await expect(second).rejects.toThrow("load failure");
    expect(oldWorker.messageListenerCount()).toBe(0);
    expect(oldWorker.errorListenerCount()).toBe(0);
    expect(oldWorker.terminateCalls).toBe(1);
    const retry = client.run(3, { document: sampleDocument(), selection: sampleSelection() });
    expect(workers).toHaveLength(2);
    workers[1].emitMessage(3, resultWithDiagnostic("recovered"));
    await expect(retry).resolves.toEqual(resultWithDiagnostic("recovered"));
  });

  it("returns a rejected promise on construction failure and permits a later retry", async () => {
    const worker = new FakeWorker();
    const factory = vi.fn()
      .mockImplementationOnce(() => { throw new Error("Worker unavailable"); })
      .mockReturnValue(worker);
    const client = new SchematicAnalysisWorkerClient(factory);
    await expect(client.run(1, { document: sampleDocument(), selection: sampleSelection() })).rejects.toThrow("Worker unavailable");
    const retry = client.run(2, { document: sampleDocument(), selection: sampleSelection() });
    worker.emitMessage(2, resultWithDiagnostic("ready"));
    await expect(retry).resolves.toEqual(resultWithDiagnostic("ready"));
    client.cancel();
    client.cancel();
    expect(worker.terminateCalls).toBe(1);
  });
});
