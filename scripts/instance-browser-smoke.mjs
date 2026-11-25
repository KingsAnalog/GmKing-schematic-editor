import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { clickSelector, evaluate, launchBrowser, navigate, openPage, serveDist, waitFor } from "./browser-smoke.mjs";

const server = await serveDist(fileURLToPath(new URL("../apps/web/dist/", import.meta.url)));
let browser;
let page;
const dialog = "[data-schematic-instance-browser]";
const field = name => `[data-browser-properties] [${name}]`;
const shapeStroke = field("data-property-library-shape-stroke-width");
const templateComponent = field("data-browser-template-component");
const mosWidth = field("data-property-mos-param='w'");

try {
  browser = await launchBrowser();
  page = await openPage(browser.baseUrl, "about:blank");
  await viewport(1440);
  await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] });
  await navigate(page, server.url);
  await waitFor(page, () => !!document.querySelector("[data-schematic-paper] svg"), "Editor did not mount");

  await openBrowser();
  await assertPreview("resistor");
  await assertVisible(field("data-property-value"));
  assert.equal(await visible(templateComponent), false);
  await selectLibrary("shapes");
  for (const shape of ["rectangle", "triangle", "circle", "polygon", "polyline", "arc"]) {
    await selectCell(shape);
    await assertPreview(shape);
    const open = shape === "polyline" || shape === "arc";
    await assertVisible(shapeStroke);
    assert.equal(await visible(field("data-property-library-shape-arrow='endArrow'")), open);
    assert.equal(await visible(field("data-property-library-shape-fill-enabled")), !open);
  }
  await selectCell("triangle");
  await change(shapeStroke, "8");
  await clickSelector(page, field("data-property-library-shape-fill-enabled"));
  await change(field("data-property-library-shape-fill-opacity"), "0.5");
  await clickSelector(page, ".browser-place");
  await clickCanvas(650, 320);
  await clickCanvas(580, 440);
  await clickCanvas(720, 440);
  await waitFor(page, () => document.querySelector('[model-id] [stroke-width="8"]'), "Triangle placement did not apply the stroke width");
  const triangle = (await savedDocument()).components.find(item => item.type === "triangle");
  assert.equal(triangle.values.libraryShapeFillEnabled, "true");
  assert.equal(triangle.values.libraryShapeFillOpacity, "0.5");

  await openBrowser();
  await selectLibrary("templates");
  for (const template of ["common_source_nmos", "inverter_mos", "flipped_amp_diff"]) {
    await selectCell(template);
    await assertPreview(template);
    await assertVisible(templateComponent);
  }
  await selectCell("inverter_mos");
  assert.equal(await evaluate(page, selector => document.querySelector(selector).options.length, templateComponent), 3);
  await change(mosWidth, "2u");
  await selectTemplateComponent(1);
  await change(mosWidth, "3u");
  await selectTemplateComponent(0);
  assert.equal(await evaluate(page, selector => document.querySelector(selector).value, mosWidth), "2u");
  await clickSelector(page, ".browser-place");
  await clickCanvas(900, 400);
  await key("Escape", "Escape");
  await waitFor(page, () => document.querySelectorAll(".joint-element[model-id]").length >= 4, "Template was not placed");
  const template = await savedDocument();
  assert.equal(template.components.find(item => item.type === "pmos").values["mos:w"], "2u");
  assert.equal(template.components.find(item => item.type === "nmos").values["mos:w"], "3u");
  assert(template.wires.length >= 3, "Template wires were not retained");

  await clickSelector(page, "[data-schematic-open-options]");
  await change("[data-schematic-theme-select]", "dark");
  await clickSelector(page, "[data-schematic-options-close]");
  await viewport(375);
  await openBrowser();
  await selectLibrary("shapes");
  await selectCell("triangle");
  await assertPreview("triangle at 375px in dark mode");
  await assertVisible(shapeStroke);
  await selectLibrary("templates");
  await selectCell("inverter_mos");
  await assertPreview("inverter at 375px in dark mode");
  await assertVisible(templateComponent);
  assert.equal(await evaluate(page, () => document.documentElement.dataset.effectiveTheme), "dark");
  console.log("Add Instance previews, shape styles, template component properties and placement passed at desktop and 375px.");
} finally {
  page?.close();
  await browser?.close();
  await server.close();
}

async function openBrowser() {
  await evaluate(page, () => document.querySelector("[data-schematic-paper]").focus());
  await key("i", "KeyI", "i");
  await waitFor(page, selector => !document.querySelector(selector).hidden, "I did not open Add Instance", { args: [dialog] });
}

async function selectLibrary(id) { await clickExposed(`[data-library-id="${id}"]`); }
async function selectCell(id) { await clickExposed(`[data-cell-item="${id}"]`); }

async function clickExposed(selector) {
  await evaluate(page, selector => document.querySelector(selector).scrollIntoView({ block: "nearest" }), selector);
  await clickSelector(page, selector);
}

async function assertPreview(label) {
  assert(await evaluate(page, () => {
    const preview = document.querySelector("[data-browser-symbol]");
    preview.scrollIntoView({ block: "nearest" });
    const column = preview.parentElement.getBoundingClientRect();
    const svg = preview.querySelector("svg");
    const bounds = svg?.getBoundingClientRect();
    const ink = svg?.querySelector("g")?.getBoundingClientRect();
    const box = preview.getBoundingClientRect();
    return bounds?.height > 0 && ink?.width > 0 && ink.height > 0 &&
      box.left >= column.left - 1 && box.right <= column.right + 1 &&
      ink.left >= box.left - 1 && ink.right <= box.right + 1 &&
      ink.top >= box.top - 1 && ink.bottom <= box.bottom + 1 &&
      box.top >= preview.previousElementSibling.getBoundingClientRect().bottom - 1 &&
      box.bottom <= preview.nextElementSibling.getBoundingClientRect().top + 1;
  }), `${label} preview overflows or overlaps its properties`);
}

async function visible(selector) {
  return evaluate(page, selector => !!document.querySelector(selector)?.getClientRects().length, selector);
}
async function assertVisible(selector) { assert(await visible(selector), `${selector} is hidden`); }

async function change(selector, value) {
  await evaluate(page, (selector, value) => {
    const input = document.querySelector(selector);
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, selector, value);
}

async function selectTemplateComponent(index) {
  await evaluate(page, (selector, index) => {
    const select = document.querySelector(selector);
    select.selectedIndex = index;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, templateComponent, index);
}

async function savedDocument() {
  return evaluate(page, () => {
    const { activeDocumentId } = JSON.parse(localStorage.getItem("schematic-workspace"));
    return JSON.parse(localStorage.getItem("adc-helper-schematic:" + activeDocumentId)).state.document;
  });
}

async function viewport(width) {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: false });
}

async function key(key, code, text) {
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, ...(text ? { text } : {}) });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code });
}

async function clickCanvas(x, y) {
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}
