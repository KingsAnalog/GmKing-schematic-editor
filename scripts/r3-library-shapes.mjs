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
    const visiblePaths = [...(cell?.querySelectorAll("path") ?? [])].filter((path) => {
      const style = getComputedStyle(path);
      return path.getAttribute("d") && style.display !== "none" && style.stroke !== "none" && Number(style.opacity) > 0;
    });
    return {
      type: cell?.getAttribute("data-type"),
      texts: cell?.querySelectorAll("text").length,
      visiblePaths: visiblePaths.length,
      pathData: visiblePaths.map((path) => [path.getAttribute("d"), getComputedStyle(path).stroke]),
      ports: cell?.querySelectorAll(".joint-port").length,
      properties: Boolean(document.querySelector("[data-property-component-form]")),
      nameHidden: document.querySelector("[data-property-ref]")?.closest(".property-row")?.hidden,
      labelHidden: document.querySelector("[data-property-label-visible]")?.closest(".property-row")?.hidden,
      rectangleInputs: document.querySelectorAll("[data-property-rectangle]").length,
      pinInputs: document.querySelectorAll("[data-property-triangle-pins]").length,
      shapeForm: Boolean(document.querySelector("[data-property-shape-form]"))
    };
  });
  const expectedRectanglePath = "M 0 0 L 30 0 L 30 40 L 0 40 Z";
  if (rectangle.type !== "eda.LibraryShape" || rectangle.texts !== 0 || rectangle.visiblePaths !== 1 || rectangle.pathData[0]?.[0] !== expectedRectanglePath || rectangle.ports !== 0 || !rectangle.properties || !rectangle.nameHidden || !rectangle.labelHidden || rectangle.rectangleInputs !== 2 || rectangle.pinInputs !== 0 || rectangle.shapeForm) {
    throw new Error("rectangle decoration/selection/10 px geometry failed: " + JSON.stringify(rectangle));
  }

  const rectangleScreenBounds = () => evaluate(page, () => {
    const path = document.querySelector("[model-id] path");
    const bounds = path?.getBoundingClientRect();
    return { x: bounds?.x, y: bounds?.y, width: bounds?.width, height: bounds?.height };
  });
  const beforeRectangleClick = await rectangleScreenBounds();
  await clickPoint(beforeRectangleClick.x + beforeRectangleClick.width / 2, beforeRectangleClick.y);
  const afterRectangleClick = await rectangleScreenBounds();
  const rectangleClickStable = JSON.stringify(beforeRectangleClick) === JSON.stringify(afterRectangleClick)
    && await evaluate(page, () => Boolean(document.querySelector("[data-property-component-form]")));
  if (!rectangleClickStable) {
    throw new Error("rectangle moved after a simple click: " + JSON.stringify({ beforeRectangleClick, afterRectangleClick }));
  }

  await evaluate(page, () => {
    for (const property of ["width", "height"]) {
      const input = document.querySelector(`[data-property-rectangle='${property}']`);
      input.value = "0.5";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await waitFor(page, () => document.querySelector("[model-id] path")?.getAttribute("d") === "M 0 0 L 10 0 L 10 10 L 0 10 Z", "small rectangle did not resize to 10 x 10");
  const smallRectangle = await evaluate(page, () => {
    const cell = document.querySelector("[model-id]");
    const frame = cell?.querySelector("rect");
    const path = cell?.querySelector("path");
    const frameBounds = frame?.getBoundingClientRect();
    const pathBounds = path?.getBoundingClientRect();
    return {
      frameWidth: frame?.getAttribute("width"),
      frameHeight: frame?.getAttribute("height"),
      frameStroke: frame ? getComputedStyle(frame).stroke : null,
      aligned: Boolean(frameBounds && pathBounds && ["x", "y", "width", "height"].every(key => Math.abs(frameBounds[key] - pathBounds[key]) < 0.01))
    };
  });
  if (smallRectangle.frameWidth !== "10" || smallRectangle.frameHeight !== "10" || smallRectangle.frameStroke !== "rgb(0, 95, 158)" || !smallRectangle.aligned) {
    throw new Error("small rectangle selection frame does not match its outline: " + JSON.stringify(smallRectangle));
  }

  await clickSelector(page, "[data-sidebar-tab='library']");
  await evaluate(page, () => document.querySelector("[data-library-item='triangle']")?.click());
  const triangleStart = await assertInitialSnapMarker("triangle");
  await clickPoint(triangleStart.x, triangleStart.y);
  const firstTrianglePreview = await evaluate(page, () => ({
    lineCount: document.querySelectorAll(".schematic-shape-draft polyline").length,
    snapMarker: Boolean(document.querySelector(".schematic-shape-draft-grid-point")),
    hidden: document.querySelector(".schematic-shape-draft")?.hasAttribute("hidden")
  }));
  if (firstTrianglePreview.lineCount !== 0 || !firstTrianglePreview.snapMarker || firstTrianglePreview.hidden) {
    throw new Error("triangle first-point preview must not contain a line: " + JSON.stringify(firstTrianglePreview));
  }
  const triangleSecondPoint = { x: triangleStart.x + 160, y: triangleStart.y + 160 };
  await clickPoint(triangleSecondPoint.x, triangleSecondPoint.y);
  const secondTrianglePreview = await evaluate(page, (first, second) => {
    const paperBounds = document.querySelector("[data-schematic-paper]")?.getBoundingClientRect();
    const point = value => `${value.x - paperBounds.left},${value.y - paperBounds.top}`;
    return {
      lines: [...document.querySelectorAll(".schematic-shape-draft polyline")].map(line => line.getAttribute("points")),
      expected: [`${point(first)} ${point(second)}`],
      snapMarker: Boolean(document.querySelector(".schematic-shape-draft-grid-point")),
      hidden: document.querySelector(".schematic-shape-draft")?.hasAttribute("hidden")
    };
  }, triangleStart, triangleSecondPoint);
  if (JSON.stringify(secondTrianglePreview.lines) !== JSON.stringify(secondTrianglePreview.expected)
    || !secondTrianglePreview.snapMarker || secondTrianglePreview.hidden) {
    throw new Error("triangle second-point preview must contain only first-to-current: " + JSON.stringify(secondTrianglePreview));
  }

  const triangleThirdPoint = { x: triangleStart.x, y: triangleStart.y + 160 };
  await movePoint(triangleThirdPoint.x, triangleThirdPoint.y);
  const trianglePreview = await evaluate(page, (first, second, current) => {
    const paperBounds = document.querySelector("[data-schematic-paper]")?.getBoundingClientRect();
    const point = value => `${value.x - paperBounds.left},${value.y - paperBounds.top}`;
    return {
      lines: [...document.querySelectorAll(".schematic-shape-draft polyline")].map(line => line.getAttribute("points")),
      expected: [
        `${point(first)} ${point(second)}`,
        `${point(first)} ${point(current)}`,
        `${point(second)} ${point(current)}`
      ],
      snapMarker: Boolean(document.querySelector(".schematic-shape-draft-grid-point")),
      hidden: document.querySelector(".schematic-shape-draft")?.hasAttribute("hidden")
    };
  }, triangleStart, triangleSecondPoint, triangleThirdPoint);
  if (JSON.stringify(trianglePreview.lines) !== JSON.stringify(trianglePreview.expected)
    || !trianglePreview.snapMarker || trianglePreview.hidden) {
    throw new Error("triangle third-point preview must preserve the existing edge and connect current to both vertices: " + JSON.stringify(trianglePreview));
  }
  await clickPoint(triangleThirdPoint.x, triangleThirdPoint.y);
  await waitFor(page, () => document.querySelectorAll("[model-id]").length === 2, "triangle was not created");
  const triangle = await evaluate(page, () => {
    const cells = [...document.querySelectorAll("[model-id]")];
    const cell = cells[cells.length - 1];
    const visiblePaths = [...(cell?.querySelectorAll("path") ?? [])].filter((path) => {
      const style = getComputedStyle(path);
      return path.getAttribute("d") && style.display !== "none" && style.stroke !== "none" && Number(style.opacity) > 0;
    });
    return {
      type: cell?.getAttribute("data-type"),
      texts: cell?.querySelectorAll("text").length,
      visiblePaths: visiblePaths.length,
      ports: cell?.querySelectorAll(".joint-port").length,
      nameHidden: document.querySelector("[data-property-ref]")?.closest(".property-row")?.hidden,
      labelHidden: document.querySelector("[data-property-label-visible]")?.closest(".property-row")?.hidden,
      pinInputs: document.querySelectorAll("[data-property-triangle-pins]").length
    };
  });
  if (triangle.type !== "eda.LibraryShape" || triangle.texts !== 0 || triangle.visiblePaths !== 1 || triangle.ports !== 0 || !triangle.nameHidden || !triangle.labelHidden || triangle.pinInputs !== 0) {
    throw new Error("triangle decorations remain: " + JSON.stringify(triangle));
  }

  const triangleHandle = await evaluate(page, () => {
    const cells = [...document.querySelectorAll("[model-id]")];
    const handle = cells[cells.length - 1]?.querySelector("[data-triangle-resize-handle='a']");
    const rect = handle?.getBoundingClientRect();
    return {
      found: Boolean(handle),
      opacity: handle ? getComputedStyle(handle).opacity : null,
      pointerEvents: handle ? getComputedStyle(handle).pointerEvents : null,
      componentId: handle?.getAttribute("data-component-id"),
      x: (rect?.left ?? 0) + (rect?.width ?? 0) / 2,
      y: (rect?.top ?? 0) + (rect?.height ?? 0) / 2,
      width: rect?.width,
      height: rect?.height
    };
  });
  const trianglePathBefore = await evaluate(page, () => {
    const cells = [...document.querySelectorAll("[model-id]")];
    return cells[cells.length - 1]?.querySelector("path")?.getAttribute("d");
  });
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: triangleHandle.x, y: triangleHandle.y });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: triangleHandle.x, y: triangleHandle.y, button: "left", buttons: 1, clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: triangleHandle.x, y: triangleHandle.y + 10, button: "left", buttons: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: triangleHandle.x, y: triangleHandle.y + 10, button: "left", buttons: 0, clickCount: 1 });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const trianglePathAfter = await evaluate(page, () => {
    const cells = [...document.querySelectorAll("[model-id]")];
    return cells[cells.length - 1]?.querySelector("path")?.getAttribute("d");
  });
  if (!triangleHandle.found || triangleHandle.opacity !== "1" || triangleHandle.pointerEvents !== "all"
    || trianglePathAfter !== "M 0 0 L 160 150 L 0 150 Z") {
    throw new Error("triangle odd-span vertex drag failed: " + JSON.stringify({ triangleHandle, trianglePathBefore, trianglePathAfter }));
  }

  const triangleFrame = await evaluate(page, () => {
    const cells = [...document.querySelectorAll("[model-id]")];
    const cell = cells[cells.length - 1];
    const frameBounds = cell?.querySelector("rect")?.getBoundingClientRect();
    const pathBounds = cell?.querySelector("path")?.getBoundingClientRect();
    return {
      aligned: Boolean(frameBounds && pathBounds && ["x", "y", "width", "height"].every(key => Math.abs(frameBounds[key] - pathBounds[key]) < 0.01)),
      handles: [...(cell?.querySelectorAll("[data-triangle-resize-handle]") ?? [])].map(handle => {
        const bounds = handle.getBoundingClientRect();
        return {
          vertex: handle.getAttribute("data-triangle-resize-handle"),
          opacity: getComputedStyle(handle).opacity,
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2
        };
      }),
      allVisibleHandles: [...document.querySelectorAll("[data-rectangle-resize-handle], [data-triangle-resize-handle]")]
        .filter(handle => Number(getComputedStyle(handle).opacity) > 0)
        .map(handle => ({
          componentId: handle.getAttribute("data-component-id"),
          rectangle: handle.getAttribute("data-rectangle-resize-handle"),
          triangle: handle.getAttribute("data-triangle-resize-handle")
        }))
    };
  });
  const visibleTriangleHandles = triangleFrame.handles.filter(handle => handle.opacity === "1");
  if (!triangleFrame.aligned || visibleTriangleHandles.length !== 3 || triangleFrame.allVisibleHandles.length !== 3
    || triangleFrame.allVisibleHandles.some(handle => !handle.triangle)) {
    throw new Error("triangle frame or resize handles are inconsistent after dragging: " + JSON.stringify(triangleFrame));
  }

  await clickSelector(page, "[data-sidebar-tab='library']");
  const palettePreviews = await evaluate(page, () => Object.fromEntries(["rectangle", "triangle"].map(type => {
    const svg = document.querySelector(`[data-library-item='${type}'] .palette-symbol-preview`);
    return [type, {
      viewBox: svg?.getAttribute("viewBox"),
      preserveAspectRatio: svg?.getAttribute("preserveAspectRatio")
    }];
  })));
  if (palettePreviews.rectangle?.viewBox !== "-4 -4 88 48" || palettePreviews.triangle?.viewBox !== "-4 -4 88 88"
    || Object.values(palettePreviews).some(preview => preview.preserveAspectRatio !== "xMidYMid meet")) {
    throw new Error("library shape previews are clipped or distorted: " + JSON.stringify(palettePreviews));
  }

  await evaluate(page, () => document.querySelector("[data-library-item='rectangle']")?.scrollIntoView({ block: "center" }));
  const shot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(outDir, "r3-library-shapes.png"), Buffer.from(shot.data, "base64"));
  console.log(JSON.stringify({ rectangle, smallRectangle, triangle, triangleFrame, palettePreviews, preview, trianglePreview, ok: true }));
} finally {
  page?.close();
  await browser?.close();
  await server.close();
}
