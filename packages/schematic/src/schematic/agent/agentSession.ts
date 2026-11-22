import { AGENT_ENDPOINT } from "./agentPrompt";
import { readAgentTransaction, type AgentTransaction } from "./agentTransaction";

export type AgentStatus = "off" | "waiting" | "connected" | "paused" | "offline";
export interface AgentContext {
  documentId: string;
  projectId: string;
  sheetId: string;
  revision: number;
}

interface AgentHost {
  context(): AgentContext | undefined;
  busy(): boolean;
  snapshot(): object;
  transact(transaction: AgentTransaction): object;
  render(): void;
}

const PAIR_MS = 2 * 60_000;
const SESSION_MS = 30 * 60_000;
const MAX_RECEIPTS = 512;
const PAGE_ENDPOINT = AGENT_ENDPOINT.replace(/agent$/, "page");
const error = (code: string, fields?: object) => ({ ok: false, code, ...fields });

export class AgentSession {
  private channel = "";
  private key = "";
  private credential = "";
  private token = "";
  private documentId = "";
  private expires = 0;
  private paused = false;
  private reachable = false;
  private writing = false;
  private lastReadRevision: number | undefined;
  private timer = 0;
  private controller: AbortController | undefined;
  private readonly receipts = new Map<string, { hash: string; result: object }>();

  constructor(private readonly view: Window & typeof globalThis, private readonly host: AgentHost) {}

  get status(): AgentStatus {
    if (!this.channel) return "off";
    if (this.paused) return "paused";
    if (!this.reachable) return "offline";
    return this.token ? "connected" : "waiting";
  }

  get pairingCode() { return this.credential; }

  begin() {
    const context = this.host.context();
    if (!context) return;
    this.disconnect();
    this.channel = this.secret();
    this.key = this.secret();
    this.credential = `${this.channel}.${this.secret()}`;
    this.documentId = context.documentId;
    this.expires = Date.now() + PAIR_MS;
    const controller = new this.view.AbortController();
    this.controller = controller;
    this.host.render();
    void this.poll(controller);
  }

  togglePause() {
    if (this.channel) this.paused = !this.paused;
    this.lastReadRevision = undefined;
    this.host.render();
  }

  disconnect() {
    if (this.reachable) {
      void this.send({ close: true }, this.view.AbortSignal.timeout(2500)).catch(() => {});
    }
    this.controller?.abort();
    this.controller = undefined;
    this.view.clearTimeout(this.timer);
    this.channel = this.key = this.credential = this.token = this.documentId = "";
    this.reachable = this.paused = false;
    this.lastReadRevision = undefined;
    this.receipts.clear();
    this.host.render();
  }

  private secret() {
    return Array.from(this.view.crypto.getRandomValues(new Uint8Array(16)), byte =>
      byte.toString(16).padStart(2, "0")).join("");
  }

  private validContext() {
    const context = this.host.context();
    return Date.now() < this.expires && context?.documentId === this.documentId ? context : undefined;
  }

  private send(message: object, signal: AbortSignal) {
    return this.view.fetch(PAGE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ channel: this.channel, key: this.key, ...message }),
      cache: "no-store", credentials: "omit", redirect: "error", referrerPolicy: "no-referrer", signal
    });
  }

  private async poll(controller: AbortController, reply?: { id: string; result: object }) {
    if (controller.signal.aborted) return;
    if (!this.validContext()) { this.disconnect(); return; }
    let nextReply = reply;
    try {
      const response = await this.send({ reply }, this.view.AbortSignal.any([controller.signal, this.view.AbortSignal.timeout(2500)]));
      if (!response.ok) throw new Error("Connector unavailable");
      const { request } = await response.json();
      if (controller.signal.aborted) return;
      if (reply && "disconnected" in reply.result) { this.disconnect(); return; }
      if (!this.reachable) { this.reachable = true; this.host.render(); }
      nextReply = request ? { id: request.id, result: await this.handle(request.body, controller) } : undefined;
    } catch {
      if (controller.signal.aborted) return;
      this.lastReadRevision = undefined;
      if (this.reachable) { this.reachable = false; this.host.render(); }
    }
    if (!controller.signal.aborted) {
      this.timer = this.view.setTimeout(() => { void this.poll(controller, nextReply); }, this.reachable ? 250 : 1000);
    }
  }

  private async handle(body: Record<string, unknown>, controller: AbortController): Promise<object> {
    const context = this.validContext();
    if (!context) return error("SESSION_EXPIRED");
    if (body.method === "pair") {
      if (this.paused) return error("SUSPENDED");
      if (!this.credential || body.code !== this.credential) return error("PAIRING_INVALID");
      this.credential = "";
      this.token = `${this.channel}.${this.secret()}`;
      this.expires = Date.now() + SESSION_MS;
      this.host.render();
      return { ok: true, token: this.token, expiresAt: this.expires };
    }
    if (!this.token || body.token !== this.token) return error("UNAUTHORIZED");
    if (body.method === "disconnect") {
      this.token = "";
      return { ok: true, disconnected: true };
    }
    if (this.paused) return error("SUSPENDED");
    if (body.method === "snapshot") {
      if (this.host.busy() || this.writing) return error("HUMAN_BUSY");
      const snapshot = this.host.snapshot();
      this.lastReadRevision = context.revision;
      return { ok: true, ...snapshot };
    }
    if (body.method !== "transact") return error("UNKNOWN_METHOD");

    let transaction: AgentTransaction;
    try { transaction = readAgentTransaction(body.transaction); } catch (cause) {
      return error("INVALID_TRANSACTION", { message: (cause as Error).message });
    }
    const bytes = new TextEncoder().encode(JSON.stringify(body.transaction));
    const hash = Array.from(new Uint8Array(await this.view.crypto.subtle.digest("SHA-256", bytes))).join(",");
    if (controller.signal.aborted || body.token !== this.token) return error("UNAUTHORIZED");
    if (this.paused) return error("SUSPENDED");
    const latest = this.validContext();
    if (!latest) return error("SESSION_EXPIRED");
    const { requestId, baseRevision } = transaction;
    const previous = this.receipts.get(requestId);
    if (previous) return previous.hash === hash ? previous.result : error("REQUEST_ID_REUSED");
    if (baseRevision !== latest.revision) return error("REVISION_CONFLICT", {
      revision: latest.revision, message: "The circuit changed. Read the latest snapshot before retrying."
    });
    if (baseRevision !== this.lastReadRevision) return error("READ_REQUIRED");
    if (this.host.busy() || this.writing) return error("HUMAN_BUSY");
    if (this.receipts.size >= MAX_RECEIPTS) return error("SESSION_REQUEST_LIMIT");
    this.writing = true;
    try {
      const result = this.host.transact(transaction);
      this.receipts.set(requestId, { hash, result });
      if (!transaction.dryRun) this.lastReadRevision = undefined;
      return result;
    } finally {
      this.writing = false;
    }
  }
}
