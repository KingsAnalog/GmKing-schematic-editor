import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createSchematicDocument } from "../packages/schematic/dist/schematic/document/documentModel.js";
import { serializeSchematicContent } from "../packages/schematic/dist/schematic/schematicDocumentCodec.js";
import { clickSelector, evaluate, launchBrowser, navigate, openPage, serveDist, waitFor } from "./browser-smoke.mjs";

let requests = 0;
let allowFirstSuccess;
const firstSuccess = new Promise(resolve => { allowFirstSuccess = resolve; });
const dist = new URL("../apps/web/dist/", import.meta.url);
const mathJaxFiles = (await readdir(new URL("vendor/mathjax/", dist))).filter(name => name.endsWith(".js"));
assert.equal(mathJaxFiles.length, 1);
const mathJaxPath = "vendor/mathjax/" + mathJaxFiles[0];
const server = await serveDist(fileURLToPath(dist), {
  base: "/tools/schematic/",
  async intercept(path, response) {
    if (path !== mathJaxPath) return false;
    requests++;
    if (requests === 1) {
      response.writeHead(503, { "cache-control": "no-store" }).end();
      return true;
    }
    if (requests === 2) await firstSuccess;
    return false;
  }
});

let browser, page;
const formulaSelector = '[data-note-id="formula-a"]';
try {
  browser = await launchBrowser();
  page = await openPage(browser.baseUrl, "about:blank");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(page, server.url);
  await waitFor(page, () => !!document.querySelector("[data-schematic-paper] svg"), "Initial render did not complete");
  await assertNotRequested();

  await clickSelector(page, "[data-sidebar-tab='library']");
  await clickSelector(page, "[data-library-item='resistor']");
  await clickCanvas(700, 400);
  await key("Escape", "Escape", 27);
  await waitFor(page, () => document.querySelectorAll("[model-id]").length === 1, "Resistor placement did not settle");
  await key("w", "KeyW", 87);
  await clickCanvas(850, 450);
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1000, y: 450, button: "none" });
  await key("Enter", "Enter", 13);
  await key("Escape", "Escape", 27);
  await waitFor(page, () => document.querySelectorAll("[model-id]").length === 2, "Wire placement did not finish");
  await assertNotRequested();

  const plainCircuit = createSchematicDocument({
    components: [{ id: "plain-r", type: "resistor", ref: "R1", x: 250, y: 200, rotation: 0, mirrored: false, values: { main: "1k" } }],
    wires: [{ id: "plain-wire", routeMode: "orthogonal", points: [{ x: 180, y: 200 }, { x: 210, y: 200 }] }],
    notes: [note("plain", "Plain text only", 290)]
  });
  await importDocument(plainCircuit, "plain");
  await waitFor(page, () => document.querySelector("[data-note-id='plain'] text")?.textContent === "Plain text only" &&
    document.querySelector("[model-id='plain-wire']"), "Plain circuit did not open");
  const plainTab = await activeTabSelector();
  await assertNotRequested();

  const formulas = createSchematicDocument({
    notes: [note("formula-a", "Gain \\(A_v = -g_m R_D\\)", 200), note("formula-b", "\\[g_m = \\frac{2 I_D}{V_{OV}}\\]", 290)]
  });
  await importDocument(formulas, "formulas");
  await waitFor(page, () => document.querySelector('[data-note-id="formula-a"]')?.textContent.includes("g_m") &&
    !document.querySelector("script[src*='mathjax/']"), "Failed load did not leave a TeX fallback");
  assert.equal(requests, 1, "Concurrent formula notes must share the failed request");
  const formulaTab = await activeTabSelector();
  await captureDownloads();
  await exportDocument("svg");
  await waitFor(page, () => !!document.querySelector("script[src*='mathjax/']"), "Export did not retry the load");
  await clickSelector(page, plainTab);
  await waitFor(page, () => !!document.querySelector("[data-note-id='plain']") && !document.querySelector("[data-note-id='formula-a']"),
    "Switching during a formula request did not open the plain tab");
  allowFirstSuccess();
  await waitFor(page, () => !!window.webMathSvg, "SVG requested before MathJax readiness was not delivered");
  await assertStandaloneSvg(2);
  assert.equal(await evaluate(page, () => !!document.querySelector(".schematic-note-content svg path")), false);
  await clickSelector(page, formulaTab);
  await waitFor(page, () => document.querySelectorAll(".schematic-note-content svg").length === 2, "Returning to the formula tab did not typeset both Notes");
  assert.equal(requests, 2, "Successful load must be reused after a tab switch");

  await exportDocument("png");
  await assertPng();
  // Exercise the download fallback without a system clipboard in headless Chrome.
  await evaluate(page, () => Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined }));
  await copySelection("svg");
  await assertStandaloneSvg(1);
  await copySelection("png");
  await assertPng();
  assert.equal(requests, 2);

  // A new document window must start loading as soon as the formula tab is restored.
  await navigate(page, new URL("?restored", server.url).href);
  await waitFor(page, () => document.querySelectorAll(".schematic-note-content svg").length === 2, "Saved formula tab did not load MathJax on restore");
  assert.equal(requests, 3);
  await clickSelector(page, plainTab);
  await waitFor(page, () => !!document.querySelector("[data-note-id='plain']"), "Plain tab did not activate");
  await navigate(page, new URL("?edit-plain", server.url).href);
  await waitFor(page, () => !!document.querySelector("[data-note-id='plain'] text"), "Saved plain tab did not restore");
  assert.equal(requests, 3);
  await clickSelector(page, "[data-note-id='plain']");
  await evaluate(page, () => {
    const input = document.querySelector("[data-property-note-text]");
    input.value = "An edited formula \\(x^2\\)";
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await waitFor(page, () => !!document.querySelector("[data-note-id='plain'] svg path"), "Editing a plain Note into a formula did not load MathJax");
  assert.equal(requests, 4);
  console.log("Web MathJax passed: cold blank, component and wire placement, plain circuit, one concurrent load, retry, document switch/restore, first edit and full/selection SVG/PNG.");
} finally {
  allowFirstSuccess();
  page?.close();
  await browser?.close();
  await server.close();
}

function note(id, text, y) {
  return { id, text, x: 240, y, width: 180, anchor: "lowerLeft", fontSizePx: 18 };
}

async function activeTabSelector() {
  const id = await evaluate(page, () => document.querySelector("[data-schematic-document-tab][aria-selected='true']").dataset.schematicDocumentTab);
  return `[data-schematic-document-tab="${id}"]`;
}

async function assertNotRequested() {
  assert.equal(requests, 0);
  assert.equal(await evaluate(page, () => !!window.MathJax || !!document.querySelector("script[src*='mathjax/']")), false);
}

async function clickCanvas(x, y) {
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
}

async function key(key, code, windowsVirtualKeyCode) {
  for (const type of ["keyDown", "keyUp"]) {
    await page.send("Input.dispatchKeyEvent", { type, key, code, windowsVirtualKeyCode });
  }
}

async function importDocument(content, name) {
  await evaluate(page, (json, name) => {
    const files = new DataTransfer();
    files.items.add(new File([json], name + ".sch.json", { type: "application/json" }));
    const input = document.querySelector("[data-schematic-document-import-input]");
    input.files = files.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, serializeSchematicContent(content), name);
}

async function captureDownloads() {
  await evaluate(page, () => {
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      if (blob.type.startsWith("image/svg+xml") && blob.size) void blob.text().then(text => { window.webMathSvg = text; });
      if (blob.type === "image/png") void blob.arrayBuffer().then(buffer => { window.webMathPng = [...new Uint8Array(buffer, 0, 8)]; });
      return original(blob);
    };
  });
}

async function exportDocument(format) {
  await evaluate(page, () => { window.webMathSvg = window.webMathPng = null; });
  await clickSelector(page, "[data-schematic-document-export]");
  await clickSelector(page, `[data-schematic-export-format="${format}"]`);
}

async function copySelection(format) {
  await evaluate(page, selector => {
    window.webMathSvg = window.webMathPng = null;
    const note = document.querySelector(selector);
    const bounds = note.getBoundingClientRect();
    note.dispatchEvent(new MouseEvent("contextmenu", {
      bubbles: true, button: 2, clientX: bounds.x + 4, clientY: bounds.y + 4
    }));
  }, formulaSelector);
  await clickSelector(page, `[data-copy-export="${format}"]`);
}

async function assertStandaloneSvg(expectedNotes) {
  await waitFor(page, expected => {
    const raw = window.webMathSvg;
    if (!raw) return false;
    const svg = new DOMParser().parseFromString(raw, "image/svg+xml");
    return svg.querySelectorAll("[data-note-id] svg").length === expected &&
      svg.querySelectorAll("[data-note-id] [data-mml-node] path").length > 0;
  }, "SVG is missing standalone formula glyphs", { args: [expectedNotes] });
  assert(await evaluate(page, async () => {
    const image = new Image();
    image.src = "data:image/svg+xml," + encodeURIComponent(window.webMathSvg);
    await image.decode();
    return image.naturalWidth > 0 && image.naturalHeight > 0;
  }));
}

async function assertPng() {
  await waitFor(page, () => Array.isArray(window.webMathPng), "PNG was not delivered");
  assert.deepEqual(await evaluate(page, () => window.webMathPng), [137, 80, 78, 71, 13, 10, 26, 10]);
}
