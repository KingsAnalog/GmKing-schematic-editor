import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveDist, launchBrowser, openPage, navigate, waitFor, evaluate, clickSelector } from "./browser-smoke.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const dist = path.resolve(here, "../apps/web/dist");
const server = await serveDist(dist);
const browser = await launchBrowser();
let page;

async function jitterClick(x, y, jitter) {
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x + jitter, y: y + jitter / 2, button: "left", buttons: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x + jitter, y: y + jitter / 2, button: "left", clickCount: 1 });
}

try {
  page = await openPage(browser.baseUrl, server.url);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 980, deviceScaleFactor: 1, mobile: false });
  await navigate(page, server.url);
  await waitFor(page, () => Boolean(document.querySelector("[data-schematic-paper] svg")), "editor did not mount");

  await clickSelector(page, "[data-sidebar-tab='library']");
  await clickSelector(page, "[data-library-item='resistor']");
  await jitterClick(700, 400, 2);
  await waitFor(page, () => document.querySelectorAll("[model-id]").length === 2, "jittered first click did not place a component and preview");
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await waitFor(page, () => document.querySelectorAll("[model-id]").length === 1, "first jittered placement did not settle to one component");
  await clickSelector(page, "[data-sidebar-tab='library']");
  await clickSelector(page, "[data-library-item='resistor']");
  await jitterClick(900, 500, 5);
  await waitFor(page, () => document.querySelectorAll("[model-id]").length === 3, "jittered second click did not place a component and preview");
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await waitFor(page, () => document.querySelectorAll("[model-id]").length === 2, "second jittered placement did not settle to one component");
  const result = await evaluate(page, () => ({
    count: document.querySelectorAll("[model-id]").length,
    status: document.querySelector("[data-schematic-status]")?.textContent
  }));
  console.log(JSON.stringify({ ...result, ok: true }));
} finally {
  page?.close();
  await browser?.close();
  await server.close();
}
