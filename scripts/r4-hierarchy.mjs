import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { clickSelector, evaluate, launchBrowser, navigate, openPage, serveDist, waitFor } from "./browser-smoke.mjs";

const server = await serveDist(fileURLToPath(new URL("../apps/web/dist", import.meta.url)));
let browser, page;
try {
  browser = await launchBrowser();
  page = await openPage(browser.baseUrl, "about:blank");
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await viewport(1600, 980);
  await navigate(page, server.url);
  await waitFor(page, () => Boolean(document.querySelector("[data-schematic-paper] svg")), "editor did not mount");
  await clickSelector(page, "[data-command='analysis']");
  await clickSelector(page, "[data-right-view='hierarchy']");
  await clickSelector(page, "[data-hierarchy-action='new-sheet']");
  await set("[data-hierarchy-dialog] input", "divider", "input");
  await clickSelector(page, "[data-hierarchy-confirm]");
  await waitForSheet("divider", "new sheet did not open");
  await clickSelector(page, "[data-command='undo']");
  await waitForSheet("top", "undoing sheet creation did not return to Top");
  await clickSelector(page, "[data-command='redo']");
  await evaluate(page, () => [...document.querySelectorAll("[data-hierarchy-sheet]")].find(section =>
    section.querySelector("summary").textContent === "divider").querySelector("[data-hierarchy-action='enter']").click());
  await waitForSheet("divider", "redo did not restore the child sheet");
  const canvas = await evaluate(page, () => {
    const bounds = document.querySelector("[data-schematic-paper]").getBoundingClientRect();
    return { x: bounds.x + 120, y: bounds.y + 200 };
  });
  await evaluate(page, () => document.querySelector("[data-schematic-paper]").focus());
  await key("p", "KeyP");
  await waitFor(page, () => document.querySelector("[data-hierarchy-dialog]")?.open, "P did not open pin properties");
  await set("[data-hierarchy-dialog] [data-pin-name]", "IN", "input");
  await clickSelector(page, "[data-hierarchy-confirm]");
  await pointer(canvas.x, canvas.y);
  await waitFor(page, () => document.querySelector("[data-hierarchy-properties]:not([hidden]) [data-pin-name]")?.value === "IN", "placed pin did not appear in Properties");
  await clickSelector(page, "[data-command='pin']");
  await set("[data-hierarchy-dialog] [data-pin-name]", "OUT", "input");
  await set("[data-hierarchy-dialog] [data-pin-type]", "output");
  await clickSelector(page, "[data-hierarchy-confirm]");
  await pointer(canvas.x + 220, canvas.y);
  await waitFor(page, () => document.querySelector("[data-hierarchy-properties]:not([hidden]) [data-pin-name]")?.value === "OUT", "the second pin was not placed");
  await waitForProject(project => project.sheets.find(sheet => sheet.name === "divider").content.components.length === 2, "the second pin was not saved");
  const child = await readProject();
  assert.deepEqual(child.sheets.find(sheet => sheet.name === "divider").content.components.map(component => component.ref), ["IN", "OUT"]);

  await clickSelector(page, "[data-hierarchy-action='top']");
  await clickSelector(page, "[data-sidebar-tab='library']");
  await set("[data-library-select]", "hierarchy");
  assert.equal(await evaluate(page, () => document.querySelectorAll("[data-library-sheet]").length), 2);
  await clickSelector(page, "[data-library-sheet]:not([disabled])");
  await pointer(canvas.x + 300, canvas.y + 80);
  await waitFor(page, () => [...document.querySelectorAll("[model-id]")].some(cell =>
    !cell.getAttribute("model-id").startsWith("preview") && cell.querySelectorAll(".joint-port").length === 2), "parent symbol has no pins");
  const state = await readProject();
  const instance = state.sheets.find(sheet => sheet.id === state.topSheetId).content.components[0];
  const port = state.sheets.find(sheet => sheet.name === "divider").content.components.find(component => component.ref === "OUT");
  const wireStart = await evaluate(page, ({ instanceId, portId }) => {
    const cell = document.querySelector(`[model-id="${instanceId}"]`);
    const endpoint = [...cell.querySelectorAll("rect[port]")].find(rect => rect.getAttribute("port") === portId);
    const bounds = endpoint?.getBoundingClientRect();
    return bounds && { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  }, { instanceId: instance.id, portId: port.id });
  assert(wireStart, "the square terminal is not a real port");
  await key("w", "KeyW");
  await pointer(wireStart.x, wireStart.y);
  await pointer(wireStart.x + 70, wireStart.y);
  await key("Enter", "Enter");
  await key("Escape", "Escape");
  await waitFor(page, () => {
    const manifest = JSON.parse(localStorage.getItem("schematic-workspace"));
    const state = JSON.parse(localStorage.getItem("adc-helper-schematic:" + manifest.activeDocumentId)).state;
    return state.project.sheets.find(sheet => sheet.id === state.project.topSheetId).content.wires.length > 0;
  }, "could not wire to the square terminal");
  const before = (await readProject()).sheets.find(sheet => sheet.id === state.topSheetId).content;
  assert(before.connections.wires[before.wires[0].id].includes(before.connections.pins[instance.id][port.id]), "wire is not bound to OUT");
  await key("e", "KeyE");
  await waitFor(page, () => document.querySelector(".schematic-paper.is-hierarchy-picking"), "E did not arm sheet selection");
  await pointer(canvas.x, canvas.y - 30);
  await waitForSheet("top", "clicking an empty area unexpectedly navigated");
  await clickSelector(page, `[model-id="${instance.id}"] [joint-selector="frame"]`);
  await waitForSheet("divider", "E followed by a click inside the symbol did not descend");
  const childPanel = "[data-hierarchy-sheet][open]:has([data-hierarchy-section='pin-list'] [data-hierarchy-action='select-pin'])";
  assert.deepEqual(await evaluate(page, selector => {
    const active = document.querySelector(selector);
    return [...active.querySelectorAll(":scope > .hierarchy-actions button, :scope > [data-hierarchy-section]")]
      .map(element => element.dataset.hierarchyAction ?? element.dataset.hierarchySection);
  }, childPanel), ["rename", "enter", "place", "set-top", "delete", "include-cells", "pin-list", "show-callers"]);
  await clickSelector(page, `${childPanel} [data-hierarchy-section='show-callers'] summary`);
  await waitFor(page, () => document.querySelector("[data-hierarchy-section='show-callers'][open] [data-hierarchy-action='caller']")?.textContent.includes("X1"),
    "Show callers did not open or list the parent instance");
  await clickSelector(page, `${childPanel} [data-hierarchy-section='pin-list'] summary`);
  assert.equal(await evaluate(page, selector => document.querySelector(`${selector} [data-hierarchy-section='pin-list']`).open, childPanel), false);
  await clickSelector(page, `${childPanel} [data-hierarchy-section='pin-list'] summary`);
  await evaluate(page, () => [...document.querySelectorAll("[data-hierarchy-action='select-pin']")].find(button => button.textContent === "OUT").click());
  await set("[data-hierarchy-properties] [data-pin-name]", "VOUT");
  await set("[data-hierarchy-properties] [data-pin-direction]", "top");
  await evaluate(page, () => document.querySelector("[data-schematic-paper]").focus());
  await key("e", "KeyE", 2);
  await waitForSheet("top", "Ctrl+E did not return to the parent sheet");
  await waitForProject((project, { instanceId, portId, originalNode }) =>
    project.sheets.find(sheet => sheet.id === project.topSheetId).content.connections.pins[instanceId][portId] !== originalNode,
  "the moved pin was not saved", { instanceId: instance.id, portId: port.id, originalNode: before.connections.pins[instance.id][port.id] });
  const after = (await readProject()).sheets.find(sheet => sheet.id === state.topSheetId).content;
  assert.deepEqual(after.wires, before.wires);
  assert.deepEqual(after.connections.wires, before.connections.wires);
  assert.notEqual(after.connections.pins[instance.id][port.id], before.connections.pins[instance.id][port.id]);
  await clickSelector(page, "[data-command='netlist']");
  await waitFor(page, () => document.querySelector("[data-netlist-code]")?.textContent.includes(".subckt divider IN VOUT"), "renamed formal pin missing from SPICE");
  await clickSelector(page, "[data-netlist-format='spectre']");
  assert.match(await evaluate(page, () => document.querySelector("[data-netlist-code]").textContent), /subckt divider \(IN VOUT\)/);

  await clickSelector(page, "[data-right-view='hierarchy']");
  await clickSelector(page, "[data-hierarchy-action='enter-instance']");
  await evaluate(page, () => [...document.querySelectorAll("[data-hierarchy-action='select-pin']")].find(button => button.textContent === "VOUT").click());
  await clickSelector(page, "[data-hierarchy-action='delete-pin']");
  await clickSelector(page, "[data-hierarchy-action='up']");
  await waitForProject((project, { instanceId, portId }) => !project.sheets.find(sheet => sheet.id === project.topSheetId).content.connections.pins[instanceId][portId],
    "the pin deletion was not saved", { instanceId: instance.id, portId: port.id });
  const deleted = (await readProject()).sheets.find(sheet => sheet.id === state.topSheetId).content;
  assert.deepEqual(deleted.wires, before.wires);
  assert.deepEqual(deleted.connections.wires, before.connections.wires);
  assert.equal(deleted.connections.pins[instance.id][port.id], undefined);
  await clickSelector(page, "[data-command='undo']");
  await waitFor(page, ({ instanceId, portId }) => {
    const manifest = JSON.parse(localStorage.getItem("schematic-workspace"));
    const { project } = JSON.parse(localStorage.getItem("adc-helper-schematic:" + manifest.activeDocumentId)).state;
    return Boolean(project.sheets.find(sheet => sheet.id === project.topSheetId).content.connections.pins[instanceId][portId]);
  }, "undo did not restore the deleted pin", { args: [{ instanceId: instance.id, portId: port.id }] });
  const restored = (await readProject()).sheets.find(sheet => sheet.id === state.topSheetId).content;
  assert.deepEqual(restored.connections.pins, after.connections.pins);
  await clickSelector(page, "[data-hierarchy-action='enter-instance']");
  await clickSelector(page, "[data-hierarchy-sheet][open] [data-hierarchy-action='pin-down']:not([disabled])");
  await clickSelector(page, "[data-hierarchy-action='up']");
  await clickSelector(page, "[data-right-view='netlist']");
  await waitFor(page, () => document.querySelector("[data-netlist-code]")?.textContent.includes("subckt divider (VOUT IN)"), "explicit port reordering did not update the netlist");

  await evaluate(page, () => {
    const create = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      if (blob.type.startsWith("application/json")) void blob.text().then(value => { window.exportedProject = value; });
      return create(blob);
    };
  });
  await clickSelector(page, "[data-schematic-document-export]");
  await clickSelector(page, "[data-schematic-export-format='project']");
  await waitFor(page, () => typeof window.exportedProject === "string", "project file was not exported");
  const exported = JSON.parse(await evaluate(page, () => window.exportedProject));
  assert.equal(exported.format, "analog-tools/schematic-project");
  assert.equal(exported.version, 2);
  assert.equal(exported.sheets.length, 2);
  await evaluate(page, () => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([window.exportedProject], "r4-test.atproj.json", { type: "application/json" }));
    const input = document.querySelector("input[type='file']");
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await waitFor(page, () => JSON.parse(localStorage.getItem("schematic-workspace")).documents.length === 2, "project file did not open in a new tab");
  await evaluate(page, () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText: async () => window.exportedProject } });
  });
  await clickSelector(page, "[data-schematic-document-paste]");
  await waitFor(page, () => JSON.parse(localStorage.getItem("schematic-workspace")).documents.length === 3, "pasted project did not open in a new tab");
  await navigate(page, new URL("?restore", server.url).href);
  await waitFor(page, id => Boolean(document.querySelector(`[model-id="${id}"]`)), "project did not restore", { args: [instance.id] });
  await evaluate(page, () => document.querySelector("[data-schematic-open-options]").click());
  await set("[data-schematic-theme-select]", "dark");
  await evaluate(page, () => document.querySelector("[data-schematic-options-dialog]").close());
  await viewport(375, 760);
  await waitFor(page, () => innerWidth === 375 && document.querySelector(".is-layout-narrow"), "mobile layout did not apply");
  await evaluate(page, () => document.querySelector("[data-command='pin']").click());
  await waitFor(page, () => {
    const dialog = document.querySelector("[data-hierarchy-dialog]");
    const rect = dialog.getBoundingClientRect();
    return dialog.open && rect.left >= 0 && rect.right <= innerWidth && getComputedStyle(dialog).colorScheme.includes("dark");
  }, "mobile dark Pin dialog overflows or uses the wrong theme");
  console.log("R4 hierarchy passed: right dock, Pin, Library, square terminals, wire preservation, delete/undo, port order, both netlists, project export/import, reload and 375px dark mode.");
} finally {
  page?.close();
  await browser?.close();
  await server.close();
}

function viewport(width, height) {
  return page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
}
async function pointer(x, y) {
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1 });
}
async function key(key, code, modifiers = 0) {
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, modifiers });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers });
}
function waitForSheet(name, message) {
  return waitFor(page, expected => document.querySelector("[data-hierarchy-action='breadcrumb'][aria-current='page']")?.textContent === expected,
    message, { args: [name] });
}
function set(selector, value, event = "change") {
  return evaluate(page, (selector, value, type) => {
    const control = document.querySelector(selector);
    control.value = value;
    control.dispatchEvent(new Event(type, { bubbles: true }));
  }, selector, value, event);
}
function readProject() {
  return evaluate(page, () => {
    const manifest = JSON.parse(localStorage.getItem("schematic-workspace"));
    return JSON.parse(localStorage.getItem("adc-helper-schematic:" + manifest.activeDocumentId)).state.project;
  });
}
async function waitForProject(predicate, message, input) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const project = await readProject();
    if (project && predicate(project, input)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.fail(message);
}
