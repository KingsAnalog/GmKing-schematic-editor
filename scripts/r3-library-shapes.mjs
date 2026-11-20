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

async function movePoint(x, y) {
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
}

async function clickPoint(x, y) {
  await movePoint(x, y);
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 80));
}

async function readSnapMarker() {
  return evaluate(page, () => {
    const marker = document.querySelector(".schematic-shape-draft-grid-point");
    const paper = document.querySelector("[data-schematic-paper]");
    const bounds = paper?.getBoundingClientRect();
    const cx = Number(marker?.getAttribute("cx"));
    const cy = Number(marker?.getAttribute("cy"));
    return {
      marker: Boolean(marker),
      cx,
      cy,
      clientX: (bounds?.left ?? 0) + cx,
      clientY: (bounds?.top ?? 0) + cy,
      rectanglePreview: Boolean(document.querySelector(".schematic-shape-draft rect")),
      trianglePreview: Boolean(document.querySelector(".schematic-shape-draft polyline"))
    };
  });
}

async function assertInitialSnapMarker(kind) {
  await movePoint(620, 280);
  await waitFor(page, () => Boolean(document.querySelector(".schematic-shape-draft-grid-point")), `${kind} initial snap marker missing`);
  const initial = await readSnapMarker();
  if (!initial.marker || initial.rectanglePreview || initial.trianglePreview) {
    throw new Error(`${kind} initial snap preview failed: ${JSON.stringify(initial)}`);
  }

  await movePoint(initial.clientX + 2, initial.clientY + 2);
  const nearby = await readSnapMarker();
  if (nearby.cx !== initial.cx || nearby.cy !== initial.cy) {
    throw new Error(`${kind} snapped before the 10 px creation step: ${JSON.stringify({ initial, nearby })}`);
  }

  await movePoint(initial.clientX + 10, initial.clientY + 10);
  const stepped = await readSnapMarker();
  if (stepped.cx - initial.cx !== 10 || stepped.cy - initial.cy !== 10) {
    throw new Error(`${kind} did not advance by one canvas grid cell: ${JSON.stringify({ initial, stepped })}`);
  }
  return { x: stepped.clientX, y: stepped.clientY };
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
  const rectangleStart = await assertInitialSnapMarker("rectangle");
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: rectangleStart.x, y: rectangleStart.y, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: rectangleStart.x + 30, y: rectangleStart.y + 40, button: "left", buttons: 1 });
  const preview = await evaluate(page, () => ({
    draft: document.querySelector(".schematic-shape-draft")?.hasAttribute("hidden") === false,
    rect: Boolean(document.querySelector(".schematic-shape-draft rect")),
    rectWidth: Number(document.querySelector(".schematic-shape-draft rect")?.getAttribute("width")),
    rectHeight: Number(document.querySelector(".schematic-shape-draft rect")?.getAttribute("height")),
    snapMarker: Boolean(document.querySelector(".schematic-shape-draft-grid-point"))
  }));
  if (!preview.draft || !preview.rect || preview.rectWidth !== 30 || preview.rectHeight !== 40 || !preview.snapMarker) {
    throw new Error("rectangle dashed preview does not follow the 10 px grid: " + JSON.stringify(preview));
  }
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rectangleStart.x + 30, y: rectangleStart.y + 40, button: "left", clickCount: 1 });
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
  const expectedRectanglePath = "M 20 20 L 50 20 L 50 60 L 20 60 Z";
  if (rectangle.type !== "eda.Symbol" || rectangle.visibleTexts !== 0 || rectangle.visiblePaths !== 1 || rectangle.pathData[0]?.[0] !== expectedRectanglePath || rectangle.ports !== 0 || !rectangle.properties || rectangle.shapeForm) {
    throw new Error("rectangle decoration/selection/10 px geometry failed: " + JSON.stringify(rectangle));
  }

  await clickSelector(page, "[data-sidebar-tab='library']");
  await evaluate(page, () => document.querySelector("[data-library-item='triangle']")?.click());
  const triangleStart = await assertInitialSnapMarker("triangle");
  await clickPoint(triangleStart.x, triangleStart.y);
  await clickPoint(triangleStart.x + 160, triangleStart.y + 160);
  const trianglePreview = await evaluate(page, () => ({
    line: Boolean(document.querySelector(".schematic-shape-draft polyline")),
    snapMarker: Boolean(document.querySelector(".schematic-shape-draft-grid-point")),
    hidden: document.querySelector(".schematic-shape-draft")?.hasAttribute("hidden")
  }));
  if (!trianglePreview.line || !trianglePreview.snapMarker || trianglePreview.hidden) throw new Error("triangle dashed segment missing: " + JSON.stringify(trianglePreview));
  await clickPoint(triangleStart.x, triangleStart.y + 160);
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
