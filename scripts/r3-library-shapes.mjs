import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveDist, launchBrowser, openPage, navigate, waitFor, evaluate, clickSelector } from "./browser-smoke.mjs";

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
  await new Promise((resolve) => setTimeout(resolve, 80));
}

try {
  page = await openPage(browser.baseUrl, server.url);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 980, deviceScaleFactor: 1, mobile: false });
  await navigate(page, server.url);
  await waitFor(page, () => Boolean(document.querySelector("[data-schematic-paper] svg")), "editor did not mount");

  await evaluate(page, () => document.querySelector("[data-library-item='rectangle']")?.click());
  await waitFor(page, () => document.querySelector(".schematic-shape-draft")?.hasAttribute("hidden") === false, "rectangle draw mode did not start");
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 620, y: 280, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 900, y: 470, button: "left", buttons: 1 });
  const preview = await evaluate(page, () => ({
    draft: document.querySelector(".schematic-shape-draft")?.hasAttribute("hidden") === false,
    rect: Boolean(document.querySelector(".schematic-shape-draft rect"))
  }));
  if (!preview.draft || !preview.rect) throw new Error("rectangle dashed preview missing: " + JSON.stringify(preview));
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 900, y: 470, button: "left", clickCount: 1 });
  await waitFor(page, () => document.querySelectorAll("[model-id]").length === 1, "rectangle was not created");
  const rectangle = await evaluate(page, () => {
    const cell = document.querySelector("[model-id]");
    const visibleTexts = [...(cell?.querySelectorAll("text") ?? [])].filter((text) => {
      const style = getComputedStyle(text);
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0;
    });
    const visiblePaths = [...(cell?.querySelectorAll("path") ?? [])].filter((path) => {
      const style = getComputedStyle(path);
      return path.getAttribute("d") && style.display !== "none" && style.stroke !== "none" && Number(style.opacity) > 0;
    });
    return {
      type: cell?.getAttribute("data-type"),
      visibleTexts: visibleTexts.length,
      visiblePaths: visiblePaths.length,
      pathData: visiblePaths.map((path) => [path.getAttribute("d"), getComputedStyle(path).stroke]),
      ports: cell?.querySelectorAll(".joint-port").length,
      properties: Boolean(document.querySelector("[data-property-component-form]")),
      shapeForm: Boolean(document.querySelector("[data-property-shape-form]"))
    };
  });
  if (rectangle.type !== "eda.Symbol" || rectangle.visibleTexts !== 0 || rectangle.visiblePaths !== 1 || rectangle.ports !== 0 || !rectangle.properties || rectangle.shapeForm) {
    throw new Error("rectangle decoration/selection failed: " + JSON.stringify(rectangle));
  }

  await clickSelector(page, "[data-sidebar-tab='library']");
  await evaluate(page, () => document.querySelector("[data-library-item='triangle']")?.click());
  await clickPoint(980, 300);
  await clickPoint(1160, 480);
  const trianglePreview = await evaluate(page, () => ({
    line: Boolean(document.querySelector(".schematic-shape-draft polyline")),
    hidden: document.querySelector(".schematic-shape-draft")?.hasAttribute("hidden")
  }));
  if (!trianglePreview.line || trianglePreview.hidden) throw new Error("triangle dashed segment missing");
  await clickPoint(980, 480);
  await waitFor(page, () => document.querySelectorAll("[model-id]").length === 2, "triangle was not created");
  const triangle = await evaluate(page, () => {
    const cells = [...document.querySelectorAll("[model-id]")];
    const cell = cells[cells.length - 1];
    const visibleTexts = [...(cell?.querySelectorAll("text") ?? [])].filter((text) => {
      const style = getComputedStyle(text);
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0;
    });
    const visiblePaths = [...(cell?.querySelectorAll("path") ?? [])].filter((path) => {
      const style = getComputedStyle(path);
      return path.getAttribute("d") && style.display !== "none" && style.stroke !== "none" && Number(style.opacity) > 0;
    });
    return {
      visibleTexts: visibleTexts.length,
      textData: visibleTexts.map((text) => [text.textContent, getComputedStyle(text).opacity, text.outerHTML.slice(0, 240)]),
      visiblePaths: visiblePaths.length,
      ports: cell?.querySelectorAll(".joint-port").length
    };
  });
  if (triangle.visibleTexts !== 0 || triangle.visiblePaths !== 1 || triangle.ports !== 0) {
    throw new Error("triangle decorations remain: " + JSON.stringify(triangle));
  }

  const shot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(outDir, "r3-library-shapes.png"), Buffer.from(shot.data, "base64"));
  console.log(JSON.stringify({ rectangle, triangle, preview, trianglePreview, ok: true }));
} finally {
  page?.close();
  await browser?.close();
  await server.close();
}
