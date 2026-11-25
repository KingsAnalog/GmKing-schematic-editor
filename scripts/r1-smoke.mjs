import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveDist, launchBrowser, openPage, navigate, clickSelector, waitFor, evaluate } from "./browser-smoke.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const dist = path.resolve(here, "../apps/web/dist");
const outDir = process.env.SCHEMATIC_SMOKE_ARTIFACTS ?? path.resolve(here, "../../../.tmp-shots");
await fs.mkdir(outDir, { recursive: true });
const server = await serveDist(dist);
const browser = await launchBrowser();
let page;
try {
  page = await openPage(browser.baseUrl, server.url);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 980, deviceScaleFactor: 1, mobile: false });
  await navigate(page, server.url);
  await waitFor(page, () => Boolean(document.querySelector("[data-schematic-paper] svg")), "editor did not mount");

  async function key(key, code, modifiers = 0, text) {
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, modifiers, ...(text ? { text } : {}) });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers });
  }
  async function click(x, y) {
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  }
  async function clickExposed(selector, width) {
    const hitState = () => evaluate(page, selector => {
      const { x, y, width, height } = document.querySelector(selector).getBoundingClientRect();
      const hit = document.elementFromPoint(x + width / 2, y + height / 2);
      return { x, y, width, height, hit: hit?.outerHTML.slice(0, 180), shell: document.querySelector(".schematic-shell").className };
    }, selector);
    await waitFor(page, (selector) => {
      const button = document.querySelector(selector);
      const box = button.getBoundingClientRect();
      return button.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
    }, `${selector} is covered at ${width}px`, { args: [selector] }).catch(async error => {
      throw new Error(`${error.message} ${JSON.stringify(await hitState())}`);
    });
    await clickSelector(page, selector);
  }
  const countComponents = () => evaluate(page, () => document.querySelectorAll("[model-id]").length);
  const status = () => evaluate(page, () => document.querySelector("[data-schematic-status]")?.textContent ?? "");

  await evaluate(page, () => document.querySelector("[data-schematic-paper]")?.focus());
  await key("i", "KeyI", 0, "i");
  await waitFor(page, () => document.querySelector("[data-schematic-instance-browser]")?.hidden === false, "i did not open the browser");
  const defaults = await evaluate(page, () => ({
    library: document.querySelector("[data-library-id].is-selected")?.dataset.libraryId,
    cell: document.querySelector("[data-cell-item].is-active")?.dataset.cellItem,
    query: document.querySelector("[data-browser-cell-search]")?.value,
    focused: document.activeElement?.hasAttribute("data-browser-cell-search")
  }));
  if (defaults.library !== "all" || defaults.cell !== "resistor" || defaults.query !== "res" || !defaults.focused) {
    throw new Error("unexpected browser defaults: " + JSON.stringify(defaults));
  }

  await key("Enter", "Enter");
  await waitFor(page, () => document.querySelector("[data-schematic-instance-browser]")?.hidden === true, "Enter did not close the browser");
  await click(800, 420);
  await waitFor(page, () => document.querySelectorAll("[model-id]").length > 0, "resistor was not placed");
  await key("Escape", "Escape");
  await waitFor(page, () => document.querySelectorAll("[model-id]").length === 1, "placement preview did not settle");
  const afterPlace = { count: await countComponents(), status: await status() };
  if (afterPlace.count !== 1) throw new Error("expected one component: " + JSON.stringify(afterPlace));

  await key("z", "KeyZ", 2);
  await waitFor(page, () => document.querySelectorAll("[model-id]").length === 0, "undo did not remove the resistor");

  await clickSelector(page, "[data-sidebar-tab='library']");
  await clickSelector(page, "[data-library-item='capacitor']");
  await click(900, 500);
  await key("Escape", "Escape");
  await waitFor(page, () => document.querySelectorAll("[model-id]").length === 1, "sidebar capacitor was not placed");

  await clickSelector(page, "[data-command='netlist']");
  await waitFor(page, () => document.querySelector("[data-schematic-analysis-panel]")?.getAttribute("aria-hidden") === "false", "netlist did not open the dock");
  await waitFor(page, () => document.querySelector("[data-right-panel='netlist']")?.hidden === false, "netlist panel is not visible");
  await clickSelector(page, "[data-right-view='analysis']");
  await waitFor(page, () => document.querySelector("[data-right-panel='analysis']")?.hidden === false, "analysis panel did not switch");
  const tabSwitch = await evaluate(page, () => ({
    analysis: document.querySelector("[data-right-panel='analysis']")?.hidden,
    netlist: document.querySelector("[data-right-panel='netlist']")?.hidden
  }));
  if (tabSwitch.analysis !== false || tabSwitch.netlist !== true) {
    throw new Error("dock tabs did not switch exclusively: " + JSON.stringify(tabSwitch));
  }
  await clickSelector(page, "[data-right-view='netlist']");
  await waitFor(page, () => document.querySelector("[data-right-panel='netlist']")?.hidden === false, "netlist tab did not switch back");
  await clickSelector(page, "[data-command='netlist']");
  await waitFor(page, () => document.querySelector("[data-schematic-analysis-panel]")?.getAttribute("aria-hidden") === "true", "active toolbar view did not close the dock");

  await key("l", "KeyL", 10);
  await waitFor(page, () => document.querySelector("[data-schematic-log]")?.hidden === false, "Ctrl+Shift+L did not open the log");
  const logRows = await evaluate(page, () => document.querySelectorAll(".schematic-log-row").length);
  if (logRows < 1) throw new Error("log has no entries");

  const logBefore = await evaluate(page, () => {
    const drawer = document.querySelector("[data-schematic-log]");
    const handle = document.querySelector("[data-log-resizer]");
    const rect = handle?.getBoundingClientRect();
    return {
      height: drawer?.getBoundingClientRect().height ?? 0,
      x: rect ? rect.left + rect.width / 2 : 0,
      y: rect ? rect.top + rect.height / 2 : 0
    };
  });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: logBefore.x, y: logBefore.y, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: logBefore.x, y: logBefore.y - 60, button: "left", buttons: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: logBefore.x, y: logBefore.y - 60, button: "left", clickCount: 1 });
  await waitFor(page, (height) => (document.querySelector("[data-schematic-log]")?.getBoundingClientRect().height ?? 0) > height + 20, "log did not resize", { args: [logBefore.height] });
  const logAfter = await evaluate(page, () => ({
    height: document.querySelector("[data-schematic-log]")?.getBoundingClientRect().height ?? 0,
    stored: JSON.parse(localStorage.getItem("at-schematic-layout") ?? "null")?.logHeight
  }));
  if (Math.abs((logAfter.stored ?? 0) - logAfter.height) > 2) throw new Error("log height was not persisted: " + JSON.stringify(logAfter));

  await clickSelector(page, "[data-command='analysis']");
  await waitFor(page, () => document.querySelector("[data-right-panel='analysis']")?.hidden === false, "analysis did not reopen");
  await clickSelector(page, "[data-sidebar-tab='properties']");
  await navigate(page, server.url);
  await waitFor(page, () => Boolean(document.querySelector("[data-schematic-paper] svg")), "editor did not remount after reload");
  const persisted = await evaluate(page, () => ({
    tab: document.querySelector(".schematic-sidebar-tab.is-active")?.getAttribute("data-sidebar-tab"),
    dockVisible: document.querySelector("[data-schematic-analysis-panel]")?.getAttribute("aria-hidden") === "false",
    analysisOpen: document.querySelector("[data-right-panel='analysis']")?.hidden === false,
    logHeight: Number.parseFloat((document.querySelector("[data-schematic-log]")?.style.height ?? "0")) || 0,
    layout: JSON.parse(localStorage.getItem("at-schematic-layout") ?? "null")
  }));
  if (persisted.tab !== "properties" || !persisted.dockVisible || !persisted.analysisOpen || persisted.layout?.rightActiveView !== "analysis") {
    throw new Error("UI state did not persist: " + JSON.stringify(persisted));
  }
  if (Math.abs(persisted.logHeight - logAfter.height) > 2) {
    throw new Error("log height did not survive reload: " + JSON.stringify({ persisted, logAfter }));
  }

  const result = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(outDir, "r1-after-place.png"), Buffer.from(result.data, "base64"));
  for (const width of [375, 768, 1080]) {
    await evaluate(page, () => localStorage.removeItem("at-schematic-layout"));
    await page.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width === 375 });
    await navigate(page, new URL(`?viewport=${width}`, server.url).href);
    await waitFor(page, (width) => window.innerWidth === width
      && !!document.querySelector(".schematic-shell.is-layout-ready [data-schematic-paper] svg"),
    "layout did not settle at requested width", { args: [width] });

    const libraryOpen = await evaluate(page, () => !!document.querySelector(".schematic-shell.is-left-panel-visible"));
    const libraryControl = libraryOpen ? "[data-sidebar-tab='library']" : "[data-command='library']";
    await clickExposed(libraryControl, width);
    await waitFor(page, () => document.querySelector(".is-left-panel-visible [data-library-item='capacitor']")?.getClientRects().length,
      `Library did not open at ${width}px`);
    if (width < 1080) {
      await click(width - 24, 330);
      await waitFor(page, () => !document.querySelector(".schematic-shell.is-left-panel-visible"), `Library drawer did not close at ${width}px`);
    }

    await evaluate(page, () => document.querySelector("[data-schematic-paper]")?.focus());
    await key("i", "KeyI", 0, "i");
    await waitFor(page, () => document.querySelector("[data-schematic-instance-browser]")?.hidden === false, "instance browser did not open");
    assert(await evaluate(page, () => {
      const box = document.querySelector(".schematic-instance-browser").getBoundingClientRect();
      return box.width > 0 && box.left >= 0 && box.right <= window.innerWidth;
    }), `instance browser overflows at ${width}px`);
    await key("Escape", "Escape");
    await waitFor(page, () => document.querySelector("[data-schematic-instance-browser]")?.hidden === true,
      `instance browser did not close at ${width}px`);

    await clickExposed("[data-command='netlist']", width);
    await waitFor(page, () => document.querySelector("[data-schematic-analysis-panel]")?.getAttribute("aria-hidden") === "false",
      `Netlist dock did not open at ${width}px`);
    const rail = await evaluate(page, () => {
      const box = document.querySelector("[data-schematic-panel-resizer='right']").getBoundingClientRect();
      const state = JSON.parse(localStorage.getItem("at-schematic-layout"));
      return { x: box.x + box.width / 2, y: box.y + Math.min(25, box.height / 2), width: state.rightWidth };
    });
    const dragX = width === 375 ? 6 : -36;
    await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: rail.x, y: rail.y, button: "left", clickCount: 1 });
    await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rail.x + dragX, y: rail.y, buttons: 1, button: "left" });
    await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rail.x + dragX, y: rail.y, button: "left", clickCount: 1 });
    const resized = rail.width - dragX;
    await waitFor(page, width => JSON.parse(localStorage.getItem("at-schematic-layout")).rightWidth === width,
      `right dock width did not change after dragging at ${width}px`, { args: [resized] });
    await navigate(page, new URL(`?viewport=${width}&reload=1`, server.url).href);
    await waitFor(page, () => document.querySelector(".schematic-shell.is-layout-ready"), "layout did not restore");
    assert.equal(await evaluate(page, () => document.querySelector(".schematic-shell").style.getPropertyValue("--schematic-right-panel-width")), `${resized}px`);
    assert.equal(await evaluate(page, () => JSON.parse(localStorage.getItem("at-schematic-layout")).rightActiveView), "netlist");
    if (width < 1080) await clickExposed("[data-command='netlist']", width);
    await waitFor(page, () => document.querySelector("[data-right-panel='netlist']")?.hidden === false
      && document.querySelector("[data-schematic-analysis-panel]")?.getAttribute("aria-hidden") === "false", "Netlist dock did not restore");
  }

  await evaluate(page, () => {
    const input = document.querySelector("[data-schematic-document-import-input]");
    const transfer = new DataTransfer();
    transfer.items.add(new File(["{invalid-json"], "broken.sch.json", { type: "application/json" }));
    input.files = transfer.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await waitFor(page, () => /^Import failed/.test(document.querySelector("[data-schematic-status]").textContent), "bad JSON did not report an import error");
  await clickSelector(page, "[data-log-toggle]");
  const importError = await evaluate(page, () => {
    const filter = document.querySelector("[data-log-level]");
    filter.value = "error";
    filter.dispatchEvent(new Event("change", { bubbles: true }));
    return [...document.querySelectorAll(".schematic-log-row")].find(row => row.textContent.includes("Import failed"))?.textContent;
  });
  assert.match(importError, /import.*Import failed/i);
  await clickSelector(page, "[data-log-close]");
  await page.send("Browser.setDownloadBehavior", { behavior: "deny" });
  await evaluate(page, () => {
    const original = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      if (blob.type === "application/json") void blob.text().then(content => { window.r1Export = content; });
      return original(blob);
    };
  });
  await clickSelector(page, "[data-schematic-document-export]");
  await clickSelector(page, "[data-schematic-export-format='json']");
  await waitFor(page, () => !!window.r1Export, "document JSON was not exported");
  const exported = await evaluate(page, () => window.r1Export);
  assert.equal(JSON.parse(exported).format, "adc-helper/schematic");
  assert.doesNotMatch(exported, /Import failed|broken\.sch\.json|"(?:eventLog|logs?)"\s*:/);
  console.log(JSON.stringify({ defaults, afterPlace, logRows, viewports: [375, 768, 1080], failedImportExport: true, ok: true }));
} finally {
  page?.close();
  await browser?.close();
  await server.close();
}
