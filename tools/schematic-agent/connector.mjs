import { createServer } from "node:http";
import { randomUUID } from "node:crypto";

const HOST = "127.0.0.1";
const PORT = 43765;
const MAX_BYTES = 2 * 1024 * 1024;
const channels = new Map();
const identifier = /^[0-9a-f]{32}$/;
const credentials = /^([0-9a-f]{32})\.([0-9a-f]{32})$/;

function send(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function validOrigin(origin) {
  if (!origin || origin === "null") return false;
  try {
    const url = new URL(origin);
    return url.origin === origin && (url.protocol === "https:" ||
      (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)));
  } catch {
    return false;
  }
}

async function readBody(request, maxBytes) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxBytes) throw new Error("TOO_LARGE");
    chunks.push(chunk);
  }
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("BAD_REQUEST");
  return parsed;
}

function poll(body, origin, response) {
  if (typeof body.channel !== "string" || typeof body.key !== "string" ||
    !identifier.test(body.channel) || !identifier.test(body.key)) {
    return send(response, 400, { code: "BAD_CHANNEL" });
  }
  let channel = channels.get(body.channel);
  if (!channel) {
    if (body.close === true) return send(response, 200, { request: null });
    if (channels.size >= 32) return send(response, 429, { code: "CHANNEL_LIMIT" });
    channel = { origin, key: body.key, lastSeen: 0, pending: null };
    channels.set(body.channel, channel);
  }
  if (origin !== channel.origin || body.key !== channel.key) return send(response, 403, { code: "FORBIDDEN" });
  if (body.close === true) {
    channel.pending?.finish(200, { ok: false, code: "SESSION_CLOSED" });
    channels.delete(body.channel);
    return send(response, 200, { request: null });
  }
  channel.lastSeen = Date.now();
  if (channel.pending && body.reply?.id === channel.pending.id) {
    channel.pending.finish(200, body.reply.result);
  }
  send(response, 200, { request: channel.pending?.request ?? null });
}

function forward(body, response) {
  const value = body.method === "pair" ? body.code : body.token;
  const match = typeof value === "string" ? credentials.exec(value) : null;
  const channel = match && channels.get(match[1]);
  if (!channel || Date.now() - channel.lastSeen > 8000) return send(response, 503, { code: "PAGE_OFFLINE" });
  if (channel.pending) return send(response, 409, { code: "REQUEST_IN_PROGRESS" });
  if (!["pair", "snapshot", "transact", "disconnect"].includes(body.method)) {
    return send(response, 400, { code: "UNKNOWN_METHOD" });
  }
  const id = randomUUID();
  const finish = (status, value) => {
    clearTimeout(timeout);
    if (channel.pending?.id === id) channel.pending = null;
    if (!response.destroyed) send(response, status, value);
  };
  const timeout = setTimeout(() => finish(504, { code: "PAGE_TIMEOUT" }), 10000);
  channel.pending = { id, request: { id, body }, finish };
  response.once("close", () => {
    if (channel.pending?.id === id) finish(499, { code: "CANCELLED" });
  });
}

const server = createServer(async (request, response) => {
  const origin = request.headers.origin;
  if (request.headers.host !== `${HOST}:${PORT}`) return send(response, 403, { code: "FORBIDDEN" });
  if (request.url === "/page" && validOrigin(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
    if (request.method === "OPTIONS") {
      response.setHeader("Access-Control-Allow-Methods", "POST");
      response.setHeader("Access-Control-Allow-Headers", "Content-Type");
      response.setHeader("Access-Control-Allow-Private-Network", "true");
      return response.writeHead(204).end();
    }
  } else if (request.url !== "/agent" || origin || request.headers["sec-fetch-site"]) {
    return send(response, 403, { code: "FORBIDDEN" });
  }
  if (request.method !== "POST" || !/^application\/json(?:;|$)/i.test(request.headers["content-type"] ?? "")) {
    return send(response, 415, { code: "JSON_REQUIRED" });
  }
  try {
    const body = await readBody(request, request.url === "/page" ? 32 * 1024 * 1024 : MAX_BYTES);
    if (request.url === "/page") poll(body, origin, response);
    else forward(body, response);
  } catch (error) {
    const tooLarge = error.message === "TOO_LARGE";
    if (!response.destroyed) send(response, tooLarge ? 413 : 400, { code: tooLarge ? "TOO_LARGE" : "BAD_REQUEST" });
  }
});

server.requestTimeout = 15000;
server.listen(PORT, HOST, () => {
  console.log(`Schematic Agent connector listening at http://${HOST}:${PORT}/agent`);
});
setInterval(() => {
  for (const [id, channel] of channels) if (Date.now() - channel.lastSeen > 60000) channels.delete(id);
}, 15000).unref();
