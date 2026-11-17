import { createServer } from "node:http";
import { createReadStream, existsSync, promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import net from "node:net";
import { isDeepStrictEqual } from "node:util";
class SmokeError extends Error {
  constructor(message, evidence = undefined) {
    super(message);
    this.name = "SmokeError";
    this.evidence = evidence;
  }
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
  }

  static async connect(wsUrl) {
    const socket = new WebSocket(wsUrl);
    const client = new CdpClient(socket);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    socket.addEventListener("message", (event) => {
      void client.handleMessage(event.data);
    });
    socket.addEventListener("close", () => {
      const error = new Error("CDP websocket closed");
      for (const { reject } of client.pending.values()) reject(error);
      client.pending.clear();
    });
    return client;
  }

  send(method, params = {}) {
    const id = this.nextId++;
    const message = JSON.stringify({ id, method, params });
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new SmokeError(`CDP ${method} timed out after 20s; browser page is unresponsive`));
      }, 20000);
      this.pending.set(id, {
        resolve: value => { clearTimeout(timer); resolve(value); },
        reject: error => { clearTimeout(timer); reject(error); },
        method
      });
    });
    this.socket.send(message);
    return promise;
  }

  close() {
    this.socket.close();
  }

  async handleMessage(raw) {
    const message = JSON.parse(await websocketMessageText(raw));
    if (!message.id) {
      if (message.method === "Runtime.exceptionThrown") console.error("[browser exception]", message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
      return;
    }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(`${pending.method} failed: ${message.error.message}`));
      return;
    }
    pending.resolve(message.result);
  }
}

async function websocketMessageText(raw) {
  if (typeof raw === "string") return raw;
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString("utf8");
  if (ArrayBuffer.isView(raw)) return Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength).toString("utf8");
  if (raw && typeof raw.text === "function") return raw.text();
  return String(raw);
}

async function navigate(page, url) {
  await page.send("Page.navigate", { url });
  await waitFor(page, () => document.readyState !== "loading" && Boolean(document.querySelector("#app")?.childElementCount), `Page did not load ${url}`, {
    timeoutMs: 15000
  });
}

async function clickSelector(page, selector, options = {}) {
  const rect = await evaluate(page, (targetSelector) => {
    const element = document.querySelector(targetSelector);
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: box.top + box.height / 2, width: box.width, height: box.height };
  }, selector);
  if (!rect || rect.width <= 0 || rect.height <= 0) throw new SmokeError(`Cannot click missing or hidden selector: ${selector}`);
  await clickAt(page, rect.x, rect.y, options);
}

async function clickAt(page, x, y, options = {}) {
  const point = { x: Math.round(x), y: Math.round(y) };
  const modifiers = keyModifierMask(options);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point, button: "none", modifiers });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", buttons: 1, clickCount: 1, modifiers });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", buttons: 0, clickCount: 1, modifiers });
}

function keyModifierMask(options = {}) {
  return (options.altKey ? 1 : 0) | (options.ctrlKey ? 2 : 0) | (options.metaKey ? 4 : 0) | (options.shiftKey ? 8 : 0);
}

async function evaluate(page, fn, ...args) {
  const expression = `(${fn.toString()})(...${JSON.stringify(args)})`;
  const result = await page.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true
  });
  if (result.exceptionDetails) {
    const text = result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Runtime.evaluate failed";
    throw new SmokeError(text);
  }
  return result.result?.value;
}

function ensureBrowserSmokeRuntime() {
  if (typeof WebSocket !== "function") {
    throw new SmokeError(
      `Node ${process.version} does not provide a global WebSocket. Run this smoke with Node 22+ or another runtime with a built-in WebSocket.`
    );
  }
}

async function serveDist(distDir) {
  const port = await freePort();
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
      const decodedPath = decodeURIComponent(url.pathname);
      const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, "");
      let filePath = path.join(distDir, normalizedPath);
      const stat = await fs.stat(filePath).catch(() => null);
      if (!stat || stat.isDirectory()) filePath = path.join(distDir, "index.html");
      if (!filePath.startsWith(distDir)) {
        response.writeHead(403);
        response.end("Forbidden");
        return;
      }
      response.writeHead(200, { "content-type": mimeType(filePath) });
      createReadStream(filePath).pipe(response);
    } catch (error) {
      response.writeHead(500);
      response.end(String(error));
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolve) => server.close(resolve))
  };
}

async function launchBrowser() {
  const executable = process.env.SCHEMATIC_BROWSER_EXECUTABLE || findBrowserExecutable();
  if (!executable) {
    throw new SmokeError("No Chrome/Edge executable found. Set SCHEMATIC_BROWSER_EXECUTABLE or ADCH_BROWSER_URL.");
  }

  const port = await freePort();
  const userDataDir = await fs.mkdtemp(path.join(tmpdir(), "schematic-browser-"));
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "--remote-allow-origins=*",
    "--headless=chrome",
    "--no-sandbox",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "about:blank"
  ];
  const proc = spawn(executable, args, { stdio: "ignore", windowsHide: true });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    await waitForRemoteDebugging(baseUrl, proc);
  } catch (error) {
    await stopBrowserProcess(proc);
    await removeBrowserProfile(userDataDir);
    throw error;
  }

  return {
    baseUrl,
    close: async () => {
      await stopBrowserProcess(proc);
      await removeBrowserProfile(userDataDir);
    }
  };
}

async function stopBrowserProcess(proc) {
  if (proc.exitCode !== null) return;
  proc.kill();
  await Promise.race([
    new Promise((resolve) => proc.once("exit", resolve)),
    delay(3000)
  ]);
}

async function removeBrowserProfile(userDataDir) {
  const resolved = path.resolve(userDataDir);
  if (path.dirname(resolved) !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith("schematic-browser-")) throw new Error("Unexpected browser profile path");
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await fs.rm(userDataDir, { recursive: true, force: true });
      return;
    } catch (error) {
      if (attempt === 2) throw error;
      await delay(250);
    }
  }
}

function findBrowserExecutable() {
  const candidates = process.platform === "win32"
    ? [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        path.join(process.env.LOCALAPPDATA ?? "", "Google\\Chrome\\Application\\chrome.exe"),
        "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
        "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
      ]
    : process.platform === "darwin"
      ? [
          "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
          "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
        ]
      : [
          "/usr/bin/google-chrome",
          "/usr/bin/google-chrome-stable",
          "/usr/bin/chromium",
          "/usr/bin/chromium-browser",
          "/usr/bin/microsoft-edge"
        ];
  return candidates.find((candidate) => candidate && existsSync(candidate)) ?? null;
}

async function waitForRemoteDebugging(baseUrl, proc) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10000) {
    if (proc.exitCode !== null) throw new SmokeError(`Browser exited before remote debugging started with code ${proc.exitCode}`);
    try {
      const response = await fetch(`${baseUrl}/json/version`);
      if (response.ok) return;
    } catch {
      // Retry until Chrome opens the debugging endpoint.
    }
    await delay(100);
  }
  throw new SmokeError(`Timed out waiting for browser remote debugging at ${baseUrl}`);
}

async function openPage(baseUrl, url) {
  const endpoint = await createDebugTarget(baseUrl, url);
  return CdpClient.connect(endpoint);
}

async function createDebugTarget(baseUrl, url) {
  const encodedUrl = encodeURIComponent(url);
  for (const method of ["PUT", "GET"]) {
    try {
      const response = await fetch(`${baseUrl}/json/new?${encodedUrl}`, { method });
      if (!response.ok) continue;
      const target = await response.json();
      if (target.webSocketDebuggerUrl) return target.webSocketDebuggerUrl;
    } catch {
      // Try the next creation method or the fallback below.
    }
  }

  const listResponse = await fetch(`${baseUrl}/json/list`);
  if (!listResponse.ok) throw new SmokeError(`Cannot create or list browser targets at ${baseUrl}`);
  const targets = await listResponse.json();
  const page = targets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
  if (!page) throw new SmokeError(`No debuggable page target is available at ${baseUrl}`);
  return page.webSocketDebuggerUrl;
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function mimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".wasm": "application/wasm",
    ".svg": "image/svg+xml",
    ".png": "image/png"
  }[extension] ?? "application/octet-stream";
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
async function waitFor(page, predicate, message, options = {}) {
  const start = Date.now();
  while(Date.now()-start < (options.timeoutMs ?? 15000)) {
    if(await evaluate(page,predicate,...(options.args ?? [])))return;
    await delay(100);
  }
  throw new Error(message + " " + JSON.stringify(await evaluate(page,()=>({ status:document.querySelector("[data-schematic-status]")?.textContent, diagnostics:document.querySelector("[data-analysis-diagnostics]")?.textContent, ports:[...document.querySelectorAll("[data-net-select]")].map(s=>({field:s.dataset.netSelect,value:s.value,options:[...s.options].map(o=>o.value)})) }))));
}
async function main() {
  ensureBrowserSmokeRuntime();
  const { createSchematicDocument, contentFromDocument } = await import("../packages/schematic/dist/schematic/document/documentModel.js");
  const dist = fileURLToPath(new URL("../apps/web/dist",import.meta.url));
  const server = await serveDist(dist);
  let browser, page;
  try {
    browser = await launchBrowser(); page = await openPage(browser.baseUrl,server.url);
    await page.send("Page.enable"); await page.send("Runtime.enable");
    await page.send("Emulation.setDeviceMetricsOverride", { width:1440,height:1000,deviceScaleFactor:1,mobile:false });
    await navigate(page,server.url);
    await waitFor(page,()=>Boolean(document.querySelector("[data-schematic-paper] svg")),"Standalone editor did not mount");
    const smokeContent = contentFromDocument(createSchematicDocument({components:[{id:"R1",type:"resistor",ref:"R1",x:300,y:100,rotation:0,mirrored:false,values:{main:"1k"}},{id:"GND1",type:"gnd",ref:"GND1",x:340,y:120,rotation:0,mirrored:false,values:{}},{id:"inv",type:"inverter",ref:"X1",variantId:"variable",x:100,y:100,rotation:0,mirrored:false,values:{}}]}));
    await evaluate(page,content=>{
      localStorage.setItem("schematic-workspace",JSON.stringify({activeDocumentId:"smoke",documents:[{id:"smoke",title:"Standalone smoke"}]}));
      localStorage.setItem("adc-helper-schematic:smoke",JSON.stringify({format:"adc-helper/schematic-workspace-snapshot",state:{document:content,zoom:1,viewTranslate:{x:0,y:0},presentationMode:false}}));
    }, smokeContent);
    await navigate(page,server.url);
    await waitFor(page,()=>Boolean(document.querySelector("[model-id='inv']")),"Standalone saved document did not restore");
    await clickSelector(page,"[data-command='fit']");
    await clickSelector(page,"[model-id='inv']");
    await waitFor(page,()=>Boolean(document.querySelector("[data-property-pin-visibility-id='vdd']")),"Supply pin controls missing");
    await clickSelector(page,"[data-property-pin-visibility-id='vdd']");
    await clickSelector(page,"[data-property-pin-visibility-id='gnd']");
    await waitFor(page,()=>document.querySelectorAll("[model-id='inv'] [joint-selector='symbolPinMarks']").length===1 && document.querySelector("[data-property-pin-visibility-id='gnd']")?.checked,"Supply edits failed");
    await clickSelector(page,"[data-command='undo']");
    await clickSelector(page,"[model-id='inv']");
    await waitFor(page,()=>document.querySelector("[data-property-pin-visibility-id='vdd']")?.checked && !document.querySelector("[data-property-pin-visibility-id='gnd']")?.checked,"Standalone Undo failed");
    await clickSelector(page,"[data-command='redo']");
    await navigate(page,server.url);
    await waitFor(page,()=>Boolean(document.querySelector("[model-id='inv']")),"Reload failed");
    await clickSelector(page,"[data-command='fit']");await clickSelector(page,"[model-id='inv']");
    await waitFor(page,()=>document.querySelector("[data-property-pin-visibility-id='vdd']")?.checked && document.querySelector("[data-property-pin-visibility-id='gnd']")?.checked,"Edits were not saved across reload");
    // The inverter is an annotation with floating nets; use only the grounded resistor for analysis.
    await evaluate(page,()=>{
      const key="adc-helper-schematic:smoke";
      const snapshot=JSON.parse(localStorage.getItem(key));
      snapshot.state.document.components=snapshot.state.document.components.filter(component=>component.id!=="inv");
      if(snapshot.state.document.connections) delete snapshot.state.document.connections.pins.inv;
      localStorage.setItem(key,JSON.stringify(snapshot));
    });
    await navigate(page,server.url);
    await waitFor(page,()=>Boolean(document.querySelector("[model-id='R1']")),"Analysis fixture did not load");
    // Analysis starts collapsed. Open it through the accessible resize handle.
    await evaluate(page, () => document.querySelector('[data-schematic-panel-resizer="right"]').focus());
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Home", code: "Home", windowsVirtualKeyCode: 36 });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Home", code: "Home", windowsVirtualKeyCode: 36 });
    await waitFor(page, () => document.querySelector("[data-schematic-analysis-panel]")?.getAttribute("aria-hidden") === "false", "Analysis panel did not open");
    await evaluate(page,()=>{
      for(const field of ["inputP","outputP","inputN","outputN"]){
        const select=document.querySelector('[data-net-select="'+field+'"]');
        select.value=field.endsWith("N") ? "0" : "R1_P";
        select.dispatchEvent(new Event("change",{bubbles:true}));
      }
    });
    await clickSelector(page,"[data-analysis='compute']");
    await waitFor(page,()=>document.querySelector("[data-analysis-progress]")?.hidden && Boolean(document.querySelector("[data-analysis-transfer]")?.innerHTML),"Analysis Worker did not return a transfer function");
    await checkBlankCanvasPaste(page);
    await checkVoltageSourceConfiguration(page, server.url);
    await checkNoteAppearance(page, server.url);
    await checkDisabledPins(page, server.url);
    const overflow = await evaluate(page,()=>({ width:document.documentElement.scrollWidth, height:document.documentElement.scrollHeight, viewportWidth:innerWidth, viewportHeight:innerHeight }));
    if(overflow.width > overflow.viewportWidth || overflow.height > overflow.viewportHeight)throw new Error("Standalone page overflows its viewport: "+JSON.stringify(overflow));
    const unrelated = await evaluate(page,()=>localStorage.getItem("adc-helper-workspace-v1"));
    if(unrelated!==null)throw new Error("Standalone app used ADChelper workspace state");
    const screenshot=process.argv.find(arg=>arg.startsWith("--screenshot="))?.slice(13);
    if(screenshot){const shot=await page.send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});await fs.writeFile(path.resolve(screenshot),Buffer.from(shot.data,"base64"));}
    console.log("[schematic-web] mount, storage, VDD/GND, Undo/Redo, reload, analysis and right-click Paste/Cancel/Undo/Redo passed");
  } finally {page?.close();await browser?.close();await server.close();}
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error=>{
    console.error(error);
    if (error.evidence) console.error(JSON.stringify(error.evidence, null, 2));
    process.exitCode=1;
  });
}

export { launchBrowser, openPage, navigate, evaluate, clickSelector, waitFor, serveDist };

async function checkDisabledPins(page, url) {
  const { getComponentDef } = await import("../packages/schematic/dist/schematic/catalog.js");
  const { componentPinPoint } = await import("../packages/schematic/dist/schematic/connectivity.js");
  const { contentFromDocument, documentFromContent, createSchematicDocument } = await import("../packages/schematic/dist/schematic/document/documentModel.js");
  const cases = [["plus", "top"], ["multiply", "left"], ["adc", "out"], ["dac", "in"],
    ["inverter", "vdd"], ["dff", "qbar"], ["switch", "ctrl"], ["plus", "top", true]];
  const readDocument = () => readSmokeDocument(page);
  const waitForStoredX = expected => waitFor(page, x =>
    JSON.parse(localStorage.getItem("adc-helper-schematic:smoke")).state.document.components[0].x === x,
    "Component position was not saved", { args: [expected] });
  async function selectComponent() {
    const point = await evaluate(page, () => {
      const box = document.querySelector('[model-id="pin-test"] [joint-selector="frame"]').getBoundingClientRect();
      for (const fx of [0.25, 0.75, 0.5]) for (const fy of [0.25, 0.75, 0.5]) {
        const x = box.left + box.width * fx, y = box.top + box.height * fy;
        const target = document.elementFromPoint(x, y);
        if (target?.closest('[model-id]')?.getAttribute('model-id') === 'pin-test'
          && !target.closest('[port], [data-switch-blade]')) return { x, y };
      }
      throw new Error("No component body point available for selection");
    });
    await clickAt(page, point.x, point.y);
    await waitFor(page, () => !!document.querySelector('[data-property-pin-visibility-id]'), "Pin settings missing after selection");
  }
  async function dragComponent() {
    const point = await evaluate(page, () => {
      const frame = document.querySelector('[model-id="pin-test"] [joint-selector="frame"]');
      const box = frame.getBoundingClientRect();
      const scale = Math.hypot(frame.getScreenCTM().a, frame.getScreenCTM().b);
      return { x: box.left + box.width / 2, y: box.top + box.height / 2, dx: 40 * scale, dy: 20 * scale };
    });
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x, y: point.y });
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", buttons: 1, clickCount: 1 });
    for (const fraction of [0.25, 0.5, 1]) {
      await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: point.x + point.dx * fraction, y: point.y + point.dy * fraction, button: "left", buttons: 1 });
    }
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x + point.dx, y: point.y + point.dy, button: "left", buttons: 0, clickCount: 1 });
  }
  async function expectPort(pinId, visible) {
    const present = await evaluate(page, pinId => !!document.querySelector('[model-id="pin-test"] [port="' + pinId + '"]'), pinId);
    if (present !== visible) throw new SmokeError("Disabled pin still has a port, or re-enabling failed", { pinId, visible, present });
  }
  for (const [type, pinId, interior = false] of cases) {
    const def = getComponentDef(type);
    const component = { id: "pin-test", ref: "X1", type, variantId: def.defaultVariantId,
      x: 200, y: 200, rotation: 90, mirrored: true,
      values: { ...def.defaultValues, labelVisible: "true", ["pinVisible:" + pinId]: "true" } };
    const pin = componentPinPoint(component, pinId);
    component.values["pinVisible:" + pinId] = "false";
    const horizontal = Math.abs(pin.x - component.x) > Math.abs(pin.y - component.y);
    const tangent = horizontal ? { x: 0, y: 20 } : { x: 20, y: 0 };
    const points = interior
      ? [{ x: pin.x - tangent.x, y: pin.y - tangent.y }, { x: pin.x + tangent.x, y: pin.y + tangent.y }]
      : [pin, horizontal ? { x: pin.x + Math.sign(pin.x - component.x) * 80, y: pin.y }
        : { x: pin.x, y: pin.y + Math.sign(pin.y - component.y) * 80 }];
    const content = contentFromDocument(createSchematicDocument({ components: [component], wires: [{ id: "wire", points, routeMode: "orthogonal" }] }));
    await evaluate(page, content => {
      localStorage.setItem("adc-helper-schematic:smoke", JSON.stringify({
        format: "adc-helper/schematic-workspace-snapshot",
        state: { document: content,
        zoom: 1, viewTranslate: { x: 0, y: 0 }, presentationMode: false }
      }));
    }, content);
    await navigate(page, url);
    await waitFor(page, () => !!document.querySelector('[model-id="pin-test"]'), "Disabled-pin fixture did not load");
    await clickSelector(page, '[data-command="fit"]');
    await selectComponent();
    await expectPort(pinId, false);
    const before = contentFromDocument(documentFromContent(await readDocument()));
    await dragComponent();
    await waitForStoredX(before.components[0].x + 40);
    const moved = await readDocument();
    if (!isDeepStrictEqual(before.wires, moved.wires) || moved.components[0].x === before.components[0].x) {
      throw new SmokeError("Disabled-pin drag moved wires or failed to move the component", { type, pinId, interior, before, moved });
    }
    await clickSelector(page, '[data-command="undo"]');
    await waitForStoredX(before.components[0].x);
    const undone = await readDocument();
    if (!isDeepStrictEqual(undone, before)) throw new SmokeError("Pin drag Undo failed", JSON.stringify({ type, before, undone }));
    await clickSelector(page, '[data-command="redo"]');
    await waitForStoredX(moved.components[0].x);
    if (!isDeepStrictEqual(await readDocument(), moved)) throw new SmokeError("Pin drag Redo failed");
    await clickSelector(page, '[data-command="undo"]');
    await waitForStoredX(before.components[0].x);
    await selectComponent();
    const toggle = '[data-property-pin-visibility-id="' + pinId + '"]';
    await clickSelector(page, toggle);
    await expectPort(pinId, true);
    await dragComponent();
    await waitForStoredX(moved.components[0].x);
    if (isDeepStrictEqual((await readDocument()).wires, before.wires)) throw new SmokeError("Enabled pin stopped stretching wires", { type, pinId });
    await clickSelector(page, '[data-command="undo"]');
    await waitForStoredX(before.components[0].x);
    await selectComponent();
    await clickSelector(page, toggle);
    await waitFor(page, (pin, fallback) => (JSON.parse(localStorage.getItem("adc-helper-schematic:smoke")).state.document.components[0].values["pinVisible:" + pin] ?? fallback) === "false", "Disabled pin setting was not saved", { args: [pinId, def.defaultValues?.["pinVisible:" + pinId] ?? "true"] });
    await navigate(page, url);
    await waitFor(page, () => !!document.querySelector('[model-id="pin-test"]'), "Disabled-pin reload failed");
    await expectPort(pinId, false);
    await selectComponent();
    const toggleState = await evaluate(page, toggle => document.querySelector(toggle)?.checked, toggle);
    if (toggleState !== false) throw new SmokeError("Disabled pin lost its configuration control after reload", { type, pinId });
  }
  console.log("[disabled-pins] all seven component families, wire endpoints/interiors, re-enable, Undo/Redo and reload passed");
}

async function checkBlankCanvasPaste(page) {
  const point = await evaluate(page, () => {
    const paper = document.querySelector("[data-schematic-paper]");
    const rect = paper.getBoundingClientRect();
    for (let y = rect.top + 50; y < rect.bottom - 30; y += 50) {
      for (let x = rect.left + 50; x < rect.right - 30; x += 50) {
        const target = document.elementFromPoint(x, y);
        if (target && paper.contains(target) && !target.closest("[model-id], [data-note-id]")) return { x, y };
      }
    }
    throw new Error("No blank canvas point found.");
  });
  const baseline = await evaluate(page, () => {
    const source = {
      format: "adc-helper/schematic",
      schematic: { components: [], wires: [], connections: { wires: {}, pins: {} }, junctionAppearances: [], netLabels: [],
        notes: [{ id: "clipboard-note", x: 0, y: 0, width: 120, height: 40, format: "plain", text: "Pasted from clipboard" }] }
    };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText: async () => JSON.stringify(source) } });
    return JSON.stringify(JSON.parse(localStorage.getItem("adc-helper-schematic:smoke")).state.document);
  });
  async function openPaste() {
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", ...point, button: "none" });
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "right", buttons: 2, clickCount: 1 });
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "right", buttons: 0, clickCount: 1 });
    await waitFor(page, () => {
      const paste = document.querySelector("[data-paste-schematic]");
      return paste && paste.getBoundingClientRect().width > 0;
    }, "Blank canvas Paste menu did not open");
    const copiesHidden = await evaluate(page, () => [...document.querySelectorAll("[data-copy-export]")].every(button => getComputedStyle(button).display === "none"));
    if (!copiesHidden) throw new SmokeError("Blank menu shows selection-only copy actions.");
    await clickSelector(page, "[data-paste-schematic]");
    await waitFor(page, () => document.querySelector("[data-schematic-status]")?.textContent.includes("attached to cursor"), "Paste did not enter placement preview");
  }
  async function escape() {
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  }
  await openPaste();
  await escape();
  const canceled = await evaluate(page, () => JSON.stringify(JSON.parse(localStorage.getItem("adc-helper-schematic:smoke")).state.document));
  if (canceled !== baseline) throw new SmokeError("Canceling paste changed the document.");
  await openPaste();
  await clickAt(page, point.x, point.y);
  await escape();
  await waitFor(page, () => JSON.parse(localStorage.getItem("adc-helper-schematic:smoke")).state.document.notes.length === 1, "Pasted note was not committed");
  await clickSelector(page, "[data-command='undo']");
  await waitFor(page, () => JSON.parse(localStorage.getItem("adc-helper-schematic:smoke")).state.document.notes.length === 0, "Paste Undo was not saved");
  const undone = await evaluate(page, () => JSON.stringify(JSON.parse(localStorage.getItem("adc-helper-schematic:smoke")).state.document));
  if (!isDeepStrictEqual(JSON.parse(undone), JSON.parse(baseline))) {
    throw new SmokeError("Paste Undo did not restore the existing schematic.", { baseline: JSON.parse(baseline), undone: JSON.parse(undone) });
  }
  await clickSelector(page, "[data-command='redo']");
  await waitFor(page, () => JSON.parse(localStorage.getItem("adc-helper-schematic:smoke")).state.document.notes[0]?.text === "Pasted from clipboard", "Paste Redo failed");
}

async function checkVoltageSourceConfiguration(page, url) {
  const { createSchematicDocument, contentFromDocument } = await import("../packages/schematic/dist/schematic/document/documentModel.js");
  const content = contentFromDocument(createSchematicDocument({
    components: [{ id: "source-config", type: "voltageSource", ref: "V1", variantId: "dc",
      x: 200, y: 160, rotation: 0, mirrored: false, values: { main: "1.2" } }]
  }));
  await evaluate(page, content => {
    const key = "adc-helper-schematic:smoke";
    const state = JSON.parse(localStorage.getItem(key));
    state.state.document = content;
    localStorage.setItem(key, JSON.stringify(state));
  }, content);
  async function selectSource() {
    await waitFor(page, () => !!document.querySelector("[model-id='source-config']"), "vsource did not render");
    await clickSelector(page, "[data-command='fit']");
    await clickSelector(page, "[model-id='source-config']");
  }
  async function type(value, expectedFields) {
    const count = await evaluate(page, value => {
      const select = document.querySelector("[data-property-variant]");
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return { count: document.querySelectorAll("[data-property-vsource-fields] input, [data-property-vsource-fields] select").length, selected: select.value, status: document.querySelector("[data-schematic-status]")?.textContent, stored: JSON.parse(localStorage.getItem("adc-helper-schematic:smoke")).state.document.components[0].variantId };
    }, value);
    if (count.count !== expectedFields) throw new SmokeError("Wrong field count for " + value, { ...count, expectedFields });
  }
  async function field(key, value) {
    await evaluate(page, key => {
      const input = document.querySelector('[data-property-vsource-field="' + key + '"]');
      if (!input) throw new Error("Missing vsource input: " + key);
      input.scrollIntoView({ block: "nearest" });
      input.focus();
      input.select();
    }, key);
    await page.send("Input.insertText", { text: value });
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
  }
  await navigate(page, url);
  await selectSource();
  await type("sine", 6);
  await field("vsource:sine:frequency", "100Meg");
  await field("vsource:sine:amplitude", "500m");
  await type("pulse", 9);
  await evaluate(page, () => {
    const select = document.querySelector("[data-property-vsource-option]");
    select.value = "halfsine";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await field("vsource:pulse:period", "10n");
  await type("exp", 7);
  await field("vsource:exp:riseConstant", "20p");
  await type("bit", 8);
  await field("vsource:bit:riseDelay", "30p");
  await type("pwl", 7);
  await field("vsource:pwl:pairs", "4");
  const rows = await evaluate(page, () => document.querySelectorAll("[data-property-vsource-field]").length);
  if (rows !== 11) throw new SmokeError("PWL did not grow to four time/voltage pairs", { rows });
  await clickSelector(page, "[data-command='undo']");
  await selectSource();
  const undone = await evaluate(page, () => document.querySelector('[data-property-vsource-field="vsource:pwl:pairs"]').value);
  if (undone !== "2") throw new SmokeError("PWL pair-count Undo failed");
  await clickSelector(page, "[data-command='redo']");
  await selectSource();
  for (const [index, time, voltage] of [[1, "0", "0"], [2, "1n", "1.2"], [3, "2n", "0.4"], [4, "3n", "0"]]) {
    await field("vsource:pwl:time" + index, time);
    await field("vsource:pwl:voltage" + index, voltage);
  }
  await navigate(page, url);
  await selectSource();
  const saved = await evaluate(page, () => {
    const source = JSON.parse(localStorage.getItem("adc-helper-schematic:smoke")).state.document.components[0];
    document.querySelector("[data-property-variant]").scrollIntoView({ block: "start" });
    return { variant: source.variantId, values: source.values,
      fields: document.querySelectorAll("[data-property-vsource-fields] input").length };
  });
  if (saved.variant !== "pwl" || saved.fields !== 11 || saved.values["vsource:pwl:time4"] !== "3n"
    || saved.values["vsource:pwl:voltage3"] !== "0.4" || saved.values["vsource:sine:frequency"] !== "100Meg"
    || saved.values["vsource:pulse:edgeType"] !== "halfsine") {
    throw new SmokeError("vsource settings did not survive type changes and reload", saved);
  }
  console.log("[vsource] all source types, dynamic PWL pairs, Undo/Redo and reload passed");
}

async function checkNoteAppearance(page, url) {
  const { createSchematicDocument, contentFromDocument } = await import("../packages/schematic/dist/schematic/document/documentModel.js");
  const content = contentFromDocument(createSchematicDocument({
    wires: [{ id: "colors-wire", points: [{ x: 60, y: 220 }, { x: 400, y: 220 }], routeMode: "orthogonal" }],
    notes: [{ id: "colors-note", x: 180, y: 160, width: 200, height: 40, fontSizePx: 18, format: "plain", text: "Colored note" }]
  }));
  await evaluate(page, content => {
    const key = "adc-helper-schematic:smoke";
    const state = JSON.parse(localStorage.getItem(key));
    state.state.document = content;
    localStorage.setItem(key, JSON.stringify(state));
  }, content);
  await navigate(page, url);
  await waitFor(page, () => !!document.querySelector("[data-note-id='colors-note']"), "Plain Note did not mount");
  await clickSelector(page, "[data-command='fit']");
  await clickSelector(page, "[data-note-id='colors-note']");
  const initial = await evaluate(page, () => getComputedStyle(document.querySelector("[data-note-id='colors-note']")).backgroundColor);
  if (initial !== "rgba(0, 0, 0, 0)") throw new SmokeError("Plain Note is not transparent by default", { initial });
  await clickSelector(page, "[data-note-text-color-swatch='#ff0000']");
  await waitFor(page, () => getComputedStyle(document.querySelector("[data-note-id='colors-note']")).color === "rgb(255, 0, 0)", "Red Note text did not render");
  await clickSelector(page, "[data-command='undo']");
  await waitFor(page, () => getComputedStyle(document.querySelector("[data-note-id='colors-note']")).color === "rgb(17, 17, 17)", "Text-color Undo failed");
  await clickSelector(page, "[data-command='redo']");
  await clickSelector(page, "[data-note-id='colors-note']");
  await evaluate(page, () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await evaluate(page, () => {
    const color = document.querySelector("[data-property-note-text-color]");
    color.focus();
    color.value = "#0000ff";
    color.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await waitFor(page, () => getComputedStyle(document.querySelector("[data-note-id='colors-note']")).color === "rgb(0, 0, 255)", "Text-color preview failed");
  await evaluate(page, () => {
    document.querySelector("[data-property-note-text-color]").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });
  await waitFor(page, () => getComputedStyle(document.querySelector("[data-note-id='colors-note']")).color === "rgb(255, 0, 0)", "Text-color cancel did not restore red");
  await clickSelector(page, "[data-note-background-swatch='#ff0000']");
  await waitFor(page, () => getComputedStyle(document.querySelector("[data-note-id='colors-note']")).backgroundColor === "rgb(255, 0, 0)", "Red Note fill did not render");
  await clickSelector(page, "[data-note-background-swatch='none']");
  const point = await evaluate(page, () => {
    const rect = document.querySelector("[model-id='colors-wire']").getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await clickAt(page, point.x, point.y);
  await clickSelector(page, "[data-network-color-swatch='#ff0000']");
  await waitFor(page, () => {
    const saved = JSON.parse(localStorage.getItem("adc-helper-schematic:smoke")).state.document;
    return saved.notes[0].textColor === "#ff0000" && saved.notes[0].backgroundColor === null && saved.wires[0].appearance?.color === "#ff0000";
  }, "Note and wire colors were not saved");
  const saved = await readSmokeDocument(page);
  if (saved.notes[0].textColor !== "#ff0000" || saved.notes[0].backgroundColor !== null || saved.wires[0].appearance.color !== "#ff0000") {
    throw new SmokeError("Note and wire colors were not saved", saved);
  }
  await navigate(page, url);
  await waitFor(page, () => !!document.querySelector("[data-note-id='colors-note']"), "Colored Note did not restore");
  await clickSelector(page, "[data-command='fit']");
  await clickSelector(page, "[data-note-id='colors-note']");
  const restored = await evaluate(page, () => {
    const note = document.querySelector("[data-note-id='colors-note']");
    return { color: getComputedStyle(note).color, background: getComputedStyle(note).backgroundColor };
  });
  if (restored.color !== "rgb(255, 0, 0)" || restored.background !== "rgba(0, 0, 0, 0)") {
    throw new SmokeError("Note appearance did not survive reload", restored);
  }
  const palette = await evaluate(page, () => [...document.querySelectorAll("[data-note-background-swatch]")].map(button => {
    const rect = button.getBoundingClientRect();
    return { width: rect.width, top: rect.top };
  }));
  if (palette.some(button => button.width < 18) || new Set(palette.map(button => button.top)).size < 2) {
    throw new SmokeError("Expanded color palette did not wrap at a usable size", palette);
  }
  console.log("[note-colors] transparent default, text/fill/wire red, preview cancel, Undo/Redo and reload passed");
}

async function readSmokeDocument(page) {
  // Wait behind submitted content writes, which now acquire a cross-window lock.
  return evaluate(page, () => navigator.locks.request("adc-helper-schematic:smoke", () =>
    JSON.parse(localStorage.getItem("adc-helper-schematic:smoke")).state.document));
}
