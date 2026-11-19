import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveDist, launchBrowser, openPage, navigate, clickSelector, waitFor, evaluate } from "./browser-smoke.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const dist = path.resolve(here, "../apps/web/dist");
const outDir = path.resolve(here, "../../../.tmp-shots");
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
  console.log(JSON.stringify({ defaults, afterPlace, logRows, ok: true }));
} finally {
  page?.close();
  await browser?.close();
  await server.close();
}
