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

async function drag(x1, y1, x2, y2) {
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x1, y: y1 });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: x1, y: y1, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x2, y: y2, button: "left", buttons: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x2, y: y2, button: "left", clickCount: 1 });
}

async function drawShape(kind, x1, y1, x2, y2, count) {
  await evaluate(page, (value) => document.querySelector(`[data-shape-add='${value}']`)?.click(), kind);
  await drag(x1, y1, x2, y2);
  await waitFor(page, (expected) => document.querySelectorAll("[data-layer='shape']").length === expected, `shape ${kind} was not drawn`, { args: [count] });
}

try {
  page = await openPage(browser.baseUrl, server.url);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 980, deviceScaleFactor: 1, mobile: false });
  await navigate(page, server.url);
  await waitFor(page, () => Boolean(document.querySelector("[data-schematic-paper] svg")), "editor did not mount");
  await clickSelector(page, "[data-sidebar-tab='layers']");
  await waitFor(page, () => document.querySelector("[data-sidebar-panel='layers']")?.hidden === false, "layers panel did not open");

  await drawShape("rectangle", 620, 280, 900, 470, 1);
  const rectangle = await evaluate(page, () => ({
    formHidden: document.querySelector("[data-shape-form]")?.hidden,
    kind: document.querySelector("[data-shape-field='kind']")?.value,
    radius: document.querySelector("[data-shape-field='radius']")?.value,
    width: document.querySelector("[data-shape-field='width']")?.value,
    path: document.querySelector("[data-layer='shape'] path")?.getAttribute("d"),
    layers: document.querySelectorAll(".layer-stack-row").length,
    shapes: document.querySelectorAll("[data-layer='shape']").length
  }));
  if (rectangle.formHidden !== false || rectangle.kind !== "rectangle" || !rectangle.path?.includes("Q")) {
    throw new Error("rectangle/rounded shape failed: " + JSON.stringify(rectangle));
  }
  const beforePath = rectangle.path;
  await evaluate(page, () => {
    const input = document.querySelector("[data-shape-field='radius']");
    if (input) {
      input.value = "30";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const afterPath = await evaluate(page, () => document.querySelector("[data-layer='shape'] path")?.getAttribute("d"));
  if (!afterPath || afterPath === beforePath) throw new Error("corner radius did not update the path");

  const moveBefore = await evaluate(page, () => ({
    transform: document.querySelector("[data-layer='shape']")?.getAttribute("transform"),
    rect: (() => {
      const box = document.querySelector("[data-layer='shape']")?.getBoundingClientRect();
      return box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
    })()
  }));
  if (!moveBefore.rect) throw new Error("shape has no hit box");
  await drag(moveBefore.rect.x, moveBefore.rect.y, moveBefore.rect.x + 40, moveBefore.rect.y + 20);
  await new Promise((resolve) => setTimeout(resolve, 250));
  const moveAfter = await evaluate(page, () => document.querySelector("[data-layer='shape']")?.getAttribute("transform"));
  if (moveAfter === moveBefore.transform) throw new Error("shape did not move");

  await drawShape("triangle", 980, 300, 1160, 480, 2);
  await evaluate(page, () => document.querySelector("[data-layer-add]")?.click());
  await waitFor(page, () => document.querySelectorAll(".layer-stack-row").length === 2, "layer was not added");
  await drawShape("ellipse", 760, 540, 940, 680, 3);

  await evaluate(page, () => {
    const row = [...document.querySelectorAll(".layer-stack-row")]
      .find(item => item.querySelector(".layer-select")?.textContent === "Layer 1");
    const input = row?.querySelector("[data-layer-visible]");
    if (input) {
      input.checked = false;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await waitFor(page, () => document.querySelectorAll("[data-layer='shape']").length === 1, "layer visibility did not hide shapes");
  await evaluate(page, () => {
    const row = [...document.querySelectorAll(".layer-stack-row")]
      .find(item => item.querySelector(".layer-select")?.textContent === "Layer 1");
    const input = row?.querySelector("[data-layer-visible]");
    if (input) {
      input.checked = true;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await waitFor(page, () => document.querySelectorAll("[data-layer='shape']").length === 3, "layer visibility did not restore shapes");

  const final = await evaluate(page, () => ({
    layers: [...document.querySelectorAll(".layer-stack-row .layer-select")].map(item => item.textContent),
    active: document.querySelector(".layer-stack-row.is-active .layer-select")?.textContent,
    shapes: document.querySelectorAll("[data-layer='shape']").length,
    kinds: [...document.querySelectorAll("[data-layer='shape']")].map(item => item.getAttribute("data-shape-kind")),
    z: [...document.querySelectorAll("[data-layer='shape']")].map(item => item.getAttribute("transform"))
  }));
  const shot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(outDir, "r3-shapes.png"), Buffer.from(shot.data, "base64"));
  console.log(JSON.stringify({ rectangle, final, ok: true }));
} finally {
  page?.close();
  await browser?.close();
  await server.close();
}
