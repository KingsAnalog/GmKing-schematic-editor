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

async function clickPoint(x, y) {
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 60));
}

async function chooseShape(kind) {
  await evaluate(page, () => document.querySelector("[data-command='shapes']")?.click());
  await waitFor(page, () => document.querySelector("[data-shape-picker]")?.hidden === false, "shape picker did not open");
  await evaluate(page, (value) => document.querySelector(`[data-shape-tool='${value}']`)?.click(), kind);
  await waitFor(page, () => document.querySelector("[data-shape-picker]")?.hidden === true, "shape picker did not close");
}

async function drawShape(kind, points, count) {
  await chooseShape(kind);
  for (const [x, y] of points) await clickPoint(x, y);
  await waitFor(page, (expected) => document.querySelectorAll("[data-layer='shape']").length === expected, `${kind} was not drawn`, { args: [count] });
}

try {
  page = await openPage(browser.baseUrl, server.url);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 980, deviceScaleFactor: 1, mobile: false });
  await navigate(page, server.url);
  await waitFor(page, () => Boolean(document.querySelector("[data-schematic-paper] svg")), "editor did not mount");

  await drawShape("rectangle", [[620, 280], [900, 470]], 1);
  const rectangle = await evaluate(page, () => ({
    propertiesActive: document.querySelector("[data-sidebar-tab='properties']")?.classList.contains("is-active"),
    formHidden: document.querySelector("[data-property-shape-form]")?.hidden,
    kind: document.querySelector("[data-shape-field='kind']")?.value,
    radius: document.querySelector("[data-shape-field='radius']")?.value,
    fill: document.querySelector("[data-shape-field='fill']")?.value,
    stroke: document.querySelector("[data-shape-field='stroke']")?.value,
    path: document.querySelector("[data-layer='shape'] path")?.getAttribute("d"),
    points: document.querySelector("[data-shape-field='points']")?.value
  }));
  if (rectangle.propertiesActive !== true || rectangle.formHidden !== false || rectangle.kind !== "rectangle" || rectangle.radius !== "0") {
    throw new Error("rectangle/properties failed: " + JSON.stringify(rectangle));
  }
  if (rectangle.fill !== "#ffffff" || rectangle.stroke !== "#111111") throw new Error("shape defaults are wrong");
  if (!rectangle.points?.includes(",-")) throw new Error("rectangle grid points missing");

  const beforePath = rectangle.path;
  await evaluate(page, () => {
    const input = document.querySelector("[data-shape-field='radius']");
    if (input) {
      input.value = "24";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const afterPath = await evaluate(page, () => document.querySelector("[data-layer='shape'] path")?.getAttribute("d"));
  if (!afterPath || afterPath === beforePath) throw new Error("corner radius did not update the path");

  await drawShape("triangle", [[980, 300], [1160, 480], [980, 480]], 2);
  await clickSelector(page, "[data-sidebar-tab='layers']");
  await evaluate(page, () => document.querySelector("[data-layer-add]")?.click());
  await waitFor(page, () => document.querySelectorAll(".layer-stack-row").length === 2, "layer was not added");
  await drawShape("ellipse", [[760, 540], [960, 540], [760, 620], [760, 700]], 3);

  await chooseShape("line");
  await clickPoint(320, 760);
  await clickPoint(520, 760);
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 520, y: 760, button: "left", clickCount: 2 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 520, y: 760, button: "left", clickCount: 2 });
  await waitFor(page, () => document.querySelectorAll("[data-layer='shape']").length === 4, "line was not drawn");
  const arrowField = await evaluate(page, () => Boolean(document.querySelector("[data-shape-field='endArrow']")));
  if (!arrowField) throw new Error("line arrow property missing");
  await evaluate(page, () => {
    const select = document.querySelector("[data-shape-field='endArrow']");
    if (select) {
      select.value = "triangle";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 250));
  const arrowPath = await evaluate(page, () => {
    const cell = document.querySelector("[data-shape-kind='line']");
    return [...(cell?.querySelectorAll("path") ?? [])].map(path => path.getAttribute("d")).filter(Boolean);
  });
  if (arrowPath.length < 2) throw new Error("line arrow did not render: " + JSON.stringify(arrowPath));

  const lineBox = await evaluate(page, () => {
    const box = document.querySelector("[data-shape-kind='line']")?.getBoundingClientRect();
    return box ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : null;
  });
  if (!lineBox) throw new Error("line shape has no hit box");
  await clickPoint(lineBox.x, lineBox.y);
  await waitFor(page, () => document.querySelector("[data-property-shape-form]")?.hidden === false, "shape properties did not open");
  const shapeShot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(outDir, "r3-shapes.png"), Buffer.from(shapeShot.data, "base64"));

  await clickSelector(page, "[data-sidebar-tab='library']");
  await evaluate(page, () => document.querySelector("[data-library-item='resistor']")?.click());
  await clickPoint(1200, 680);
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await waitFor(page, () => document.querySelectorAll("[model-id]").length === 5, "resistor was not placed");
  await clickPoint(1200, 680);
  const componentLayer = await evaluate(page, () => {
    const row = document.querySelector("[data-property-layer-row]");
    const select = document.querySelector("[data-property-layer]");
    return { hidden: row?.hidden, options: [...(select?.options ?? [])].map(option => option.value) };
  });
  if (componentLayer.hidden !== false || componentLayer.options.length !== 2) {
    throw new Error("component layer select failed: " + JSON.stringify(componentLayer));
  }
  await evaluate(page, () => {
    const select = document.querySelector("[data-property-layer]");
    if (select && select.options.length > 1) {
      select.value = select.options[1].value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });

  await waitFor(page, () => [...document.querySelectorAll(".layer-select")].some(item => item.textContent?.includes("(3)")), "component layer move failed");

  const final = await evaluate(page, () => ({
    layers: [...document.querySelectorAll(".layer-stack-row .layer-select")].map(item => item.textContent),
    active: document.querySelector(".layer-stack-row.is-active .layer-select")?.textContent,
    shapes: document.querySelectorAll("[data-layer='shape']").length,
    kinds: [...document.querySelectorAll("[data-layer='shape']")].map(item => item.getAttribute("data-shape-kind")),
    transforms: [...document.querySelectorAll("[data-layer='shape']")].map(item => item.getAttribute("transform"))
  }));
  const componentShot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(outDir, "r3-components-layers.png"), Buffer.from(componentShot.data, "base64"));
  console.log(JSON.stringify({ rectangle, final, ok: true }));
} finally {
  page?.close();
  await browser?.close();
  await server.close();
}
