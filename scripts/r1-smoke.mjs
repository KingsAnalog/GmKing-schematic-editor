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
  const netlistVisible = await evaluate(page, () => !document.querySelector("[data-right-panel='netlist']")?.hidden);
  if (!netlistVisible) throw new Error("netlist panel is not visible");
  await clickSelector(page, "[data-right-view='diagnostics']");
  await waitFor(page, () => !document.querySelector("[data-right-panel='diagnostics']")?.hidden, "diagnostics panel did not switch");

  await key("l", "KeyL", 10);
  await waitFor(page, () => document.querySelector("[data-schematic-log]")?.hidden === false, "Ctrl+Shift+L did not open the log");
  const logRows = await evaluate(page, () => document.querySelectorAll(".schematic-log-row").length);
  if (logRows < 1) throw new Error("log has no entries");

  const result = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(outDir, "r1-after-place.png"), Buffer.from(result.data, "base64"));
  console.log(JSON.stringify({ defaults, afterPlace, logRows, ok: true }));
} finally {
  page?.close();
  await browser?.close();
  await server.close();
}
