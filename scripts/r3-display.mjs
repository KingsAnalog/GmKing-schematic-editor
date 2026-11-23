import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { clickSelector, evaluate, launchBrowser, navigate, openPage, serveDist, waitFor } from "./browser-smoke.mjs";
import { contentFromDocument, createSchematicDocument } from "../packages/schematic/dist/schematic/document/documentModel.js";
import { deriveSchematicTopology } from "../packages/schematic/dist/schematic/topology.js";

const server = await serveDist(fileURLToPath(new URL("../apps/web/dist", import.meta.url)));
const storageKey = "adc-helper-schematic:display";
const options = "[data-schematic-open-options]";
const closeOptions = "[data-schematic-options-close]";
const crossingSelect = "[data-schematic-wire-crossings]";
const fontSelect = "[data-schematic-text-font]";
let browser;
let page;

try {
  browser = await launchBrowser();
  page = await openPage(browser.baseUrl, "about:blank");
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Browser.setDownloadBehavior", { behavior: "deny" });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate(page, server.url);
  const circuit = contentFromDocument(createSchematicDocument({
    wires: [
      { id: "flat", routeMode: "orthogonal", points: [{ x: 130, y: 160 }, { x: 330, y: 160 }] },
      { id: "bridge", routeMode: "orthogonal", points: [{ x: 230, y: 70 }, { x: 230, y: 250 }] }
    ],
    netLabels: [{ id: "label", name: "输出", attachment: { wireId: "flat", point: { x: 130, y: 160 } } }],
    notes: [{ id: "note", x: 150, y: 265, width: 125, height: 42, anchor: "upperLeft", text: "控制字形" }]
  }));
  await evaluate(page, (key, document) => {
    localStorage.setItem("schematic-workspace", JSON.stringify({
      activeDocumentId: "display", documents: [{ id: "display", title: "Display regression" }]
    }));
    localStorage.setItem(key, JSON.stringify({
      format: "adc-helper/schematic-workspace-snapshot",
      state: { document, zoom: 1, viewTranslate: { x: 0, y: 0 }, presentationMode: false }
    }));
  }, storageKey, circuit);
  await navigate(page, server.url);
  await waitFor(page, () => document.querySelector('[model-id="bridge"] [joint-selector="line"]'), "Circuit did not load");
  const initialPath = await wirePath("bridge");
  const nets = deriveSchematicTopology(circuit).netResolution.wireNetNames;
  assert.notEqual(nets.get("flat"), nets.get("bridge"));

  await clickSelector(page, options);
  await select(crossingSelect, "hop");
  await select(fontSelect, "serif");
  await waitFor(page, () => document.querySelector('[model-id="bridge"] [joint-selector="line"]')?.getAttribute("d").includes("C"), "Bridge did not render on canvas");
  assert.match(await wirePath("flat"), /L 222 160 M 238 160/);
  await clickSelector(page, closeOptions);
  await waitFor(page, () => document.querySelector('[data-note-id="note"]')?.style.fontFamily.startsWith("Georgia"), "Document note font did not apply");
  assert.match(await labelFont(), /^Georgia/);

  await clickSelector(page, '[model-id="label"]');
  await select('[data-property-text-font="label"]', "mono");
  assert.match(await labelFont(), /^Consolas/);
  await clickSelector(page, '[data-note-id="note"]');
  await select('[data-property-text-font="note"]', "sans");
  assert.match(await evaluate(page, () => document.querySelector('[data-note-id="note"]').style.fontFamily), /Inter/);

  await clickSelector(page, "[data-command='undo']");
  assert.match(await evaluate(page, () => document.querySelector('[data-note-id="note"]').style.fontFamily), /^Georgia/);
  await clickSelector(page, "[data-command='redo']");
  await waitFor(page, (key) => JSON.parse(localStorage.getItem(key))?.state.document.notes[0].fontFamily === "sans", "Note override did not persist", { args: [storageKey] });
  await navigate(page, server.url);
  await waitFor(page, () => document.querySelector('[model-id="bridge"] [joint-selector="line"]')?.getAttribute("d").includes("C"), "Reload lost the bridge");
  const restored = await evaluate(page, key => JSON.parse(localStorage.getItem(key)).state.document, storageKey);
  assert.deepEqual(restored.display, { wireCrossings: "hop", textFont: "serif" });
  assert.deepEqual(restored.connections, circuit.connections);
  assert.deepEqual(deriveSchematicTopology(restored).netResolution.wireNetNames, nets);
  assert.match(await labelFont(), /^Consolas/);

  await evaluate(page, () => {
    const createObjectURL = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      if (blob.type.startsWith("image/svg+xml")) void blob.text().then(value => { window.exportedSvg = value; });
      if (blob.type === "image/png") void blob.arrayBuffer().then(value => {
        window.exportedPng = Array.from(new Uint8Array(value, 0, 8));
      });
      return createObjectURL(blob);
    };
  });
  await clickSelector(page, "[data-schematic-document-export]");
  await clickSelector(page, '[data-schematic-export-format="svg"]');
  await waitFor(page, () => typeof window.exportedSvg === "string", "SVG export did not produce a file");
  const svg = await evaluate(page, () => window.exportedSvg);
  assert.match(svg, /data-wire-id="bridge"><path d="[^"]*C /);
  assert.match(svg, /data-net-label-id="label"[^>]*font-family="Consolas/);
  await clickSelector(page, "[data-schematic-document-export]");
  await clickSelector(page, '[data-schematic-export-format="png"]');
  await waitFor(page, () => Array.isArray(window.exportedPng), "PNG export did not produce a file");
  assert.deepEqual(await evaluate(page, () => window.exportedPng), [137, 80, 78, 71, 13, 10, 26, 10]);

  await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await waitFor(page, () => document.querySelector(".schematic-shell.is-layout-narrow"), "Narrow layout not ready");
  await evaluate(page, () => {
    const backdrop = document.querySelector("[data-schematic-panel-backdrop]");
    if (!backdrop.hidden) backdrop.click();
  });
  await waitFor(page, () => {
    const button = document.querySelector("[data-schematic-open-options]");
    const box = button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  }, "Mobile Options button is obscured");
  await clickSelector(page, options);
  await waitFor(page, () => document.querySelector("[data-schematic-options-dialog]").matches(":modal"), "Mobile Options did not open");
  const mobile = await evaluate(page, () => {
    const dialog = document.querySelector("[data-schematic-options-dialog]");
    const box = dialog.getBoundingClientRect();
    return { left: box.left, right: box.right, bottom: box.bottom, width: innerWidth, height: innerHeight };
  });
  assert.ok(mobile.left >= 0 && mobile.right <= mobile.width && mobile.bottom <= mobile.height, JSON.stringify(mobile));
  await select(crossingSelect, "plain");
  await waitFor(page, (expected) => document.querySelector('[model-id="bridge"] [joint-selector="line"]').getAttribute("d") === expected, "Plain style was not restored", { args: [initialPath] });
  console.log("[r3-display] hop/plain, text inheritance and overrides, Undo/Redo, storage, SVG/PNG, electrical isolation and 375px passed");
} finally {
  page?.close();
  try {
    await browser?.close();
  } finally {
    await server.close();
  }
}

async function select(selector, value) {
  await evaluate(page, (selector, value) => {
    const select = document.querySelector(selector);
    if (!select?.getClientRects().length) throw new Error(`Setting is not visible: ${selector}`);
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, selector, value);
  await delay(50);
}

function wirePath(id) {
  return evaluate(page, id => document.querySelector(`[model-id="${id}"] [joint-selector="line"]`).getAttribute("d"), id);
}

function labelFont() {
  return evaluate(page, () => document.querySelector('[model-id="label"] [joint-selector="label"]').getAttribute("font-family"));
}
