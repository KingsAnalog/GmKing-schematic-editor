import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveDist, launchBrowser, openPage, navigate, waitFor, evaluate, clickSelector } from "./browser-smoke.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const dist = path.resolve(here, "../apps/web/dist");
const outDir = process.env.SCHEMATIC_SMOKE_ARTIFACTS ?? path.resolve(here, "../../../.tmp-shots");
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

async function chooseLanguage(value) {
  await clickSelector(page, "[data-schematic-open-options]");
  await evaluate(page, value => {
    const select = document.querySelector("[data-schematic-language-select]");
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
  await clickSelector(page, "[data-schematic-options-close]");
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

  await chooseLanguage("zh");
  await evaluate(page, () => document.querySelector("[data-library-item='rectangle']")?.click());
  await waitFor(page, () => document.querySelector("[data-schematic-status]").textContent.startsWith("矩形："), "rectangle drawing instructions were not localized");
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
  await waitFor(page, () => document.querySelector("[data-schematic-status]").textContent === "已创建矩形。", "rectangle status was not localized");
  await clickSelector(page, "[data-log-toggle]");
  const chineseLog = await evaluate(page, () => {
    const search = document.querySelector("[data-log-search]");
    search.value = "已创建矩形";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    const visible = Array.from(document.querySelectorAll(".schematic-log-message"), row => row.textContent);
    const execCommand = document.execCommand;
    let copiedLog;
    document.execCommand = () => { copiedLog = document.activeElement.value; return true; };
    try {
      document.querySelector("[data-log-copy]").click();
    } finally {
      document.execCommand = execCommand;
    }
    search.value = "";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    return { visible, copiedLog };
  });
  if (chineseLog.visible.join("") !== "已创建矩形。" || !chineseLog.copiedLog?.includes("已创建矩形。")) {
    throw new Error("localized rectangle log was missing from search or copy: " + JSON.stringify(chineseLog));
  }
  await chooseLanguage("en");
  await waitFor(page, () => Array.from(document.querySelectorAll(".schematic-log-message")).some(row => row.textContent === "Rectangle created."), "existing rectangle log did not switch to English");
  await clickSelector(page, "[data-log-close]");
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
      nameHidden: document.querySelector("[data-property-ref]") === null,
      labelHidden: document.querySelector("[data-property-label-visible]") === null,
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

  const rectangleEdgeHandles = await evaluate(page, () => {
    const cell = document.querySelector("[model-id]");
    const pathBounds = cell?.querySelector("path")?.getBoundingClientRect();
    return {
      handles: [...(cell?.querySelectorAll("[data-rectangle-resize-handle]") ?? [])].map(handle => {
        const bounds = handle.getBoundingClientRect();
        return {
          edge: handle.getAttribute("data-rectangle-resize-handle"),
          opacity: getComputedStyle(handle).opacity,
          pointerEvents: getComputedStyle(handle).pointerEvents,
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2
        };
      }),
      pathBounds: pathBounds ? { x: pathBounds.x, y: pathBounds.y, width: pathBounds.width, height: pathBounds.height } : null
    };
  });
  const expectedEdges = ["nw", "ne", "se", "sw", "n", "e", "s", "w"];
  if (JSON.stringify(rectangleEdgeHandles.handles.map(handle => handle.edge)) !== JSON.stringify(expectedEdges)
    || rectangleEdgeHandles.handles.some(handle => handle.opacity !== "1" || handle.pointerEvents !== "all")) {
    throw new Error("rectangle must expose four corner and four edge-midpoint handles: " + JSON.stringify(rectangleEdgeHandles));
  }
  const edgeHandle = rectangleEdgeHandles.handles.find(handle => handle.edge === "e");
  const beforeEdgeDrag = rectangleEdgeHandles.pathBounds;
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: edgeHandle.x, y: edgeHandle.y });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: edgeHandle.x, y: edgeHandle.y, button: "left", buttons: 1, clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: edgeHandle.x + 20, y: edgeHandle.y + 30, button: "left", buttons: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: edgeHandle.x + 20, y: edgeHandle.y + 30, button: "left", buttons: 0, clickCount: 1 });
  await waitFor(page, () => document.querySelector("[model-id] path")?.getAttribute("d") === "M 0 0 L 30 0 L 30 10 L 0 10 Z", "east edge did not resize only rectangle width");
  const afterEdgeDrag = await evaluate(page, () => {
    const bounds = document.querySelector("[model-id] path")?.getBoundingClientRect();
    return bounds ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : null;
  });
  if (!beforeEdgeDrag || !afterEdgeDrag
    || afterEdgeDrag.x !== beforeEdgeDrag.x || afterEdgeDrag.y !== beforeEdgeDrag.y
    || afterEdgeDrag.width !== beforeEdgeDrag.width + 20 || afterEdgeDrag.height !== beforeEdgeDrag.height) {
    throw new Error("rectangle east-edge drag moved the opposite edge or changed height: " + JSON.stringify({ beforeEdgeDrag, afterEdgeDrag }));
  }
  const rectangleHandlesShot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(outDir, "r3-rectangle-edge-handles.png"), Buffer.from(rectangleHandlesShot.data, "base64"));

  await evaluate(page, () => {
    const changeNumber = (selector, value) => {
      const input = document.querySelector(selector);
      input.value = String(value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };
    changeNumber("[data-property-library-shape-stroke-width]", 2.5);
    const lineStyle = document.querySelector("[data-property-library-shape-line-style]");
    lineStyle.value = "dashDot";
    lineStyle.dispatchEvent(new Event("change", { bubbles: true }));
    changeNumber("[data-property-library-shape-corner-radius]", 2);
    const fill = document.querySelector("[data-property-library-shape-fill-enabled]");
    fill.checked = true;
    fill.dispatchEvent(new Event("change", { bubbles: true }));
    const fillColor = document.querySelector("[data-property-library-shape-fill-color]");
    const red = document.querySelector('[data-library-shape-fill-color-swatch="#ff0000"]');
    const white = document.querySelector('[data-library-shape-fill-color-swatch="default"]');
    red.click();
    if (fillColor.value !== "#ff0000" || red.getAttribute("aria-pressed") !== "true") throw new Error("red fill swatch did not apply");
    white.click();
    if (fillColor.value !== "#ffffff" || white.getAttribute("aria-pressed") !== "true" || fillColor.parentElement.lastElementChild !== fillColor) {
      throw new Error("fill palette did not restore default white or put the picker last");
    }
    fillColor.value = "#123abc";
    fillColor.dispatchEvent(new Event("input", { bubbles: true }));
    fillColor.dispatchEvent(new Event("change", { bubbles: true }));
    changeNumber("[data-property-library-shape-fill-opacity]", 0.35);
  });
  const styledRectanglePath = "M 2 0 L 28 0 Q 30 0 30 2 L 30 8 Q 30 10 28 10 L 2 10 Q 0 10 0 8 L 0 2 Q 0 0 2 0 Z";
  await waitFor(page, path => document.querySelector("[model-id] path")?.getAttribute("d") === path, "rectangle corner radius did not render", { args: [styledRectanglePath] });
  const styledRectangle = await evaluate(page, () => {
    const path = document.querySelector("[model-id] path");
    return {
      fill: path?.getAttribute("fill"),
      fillOpacity: path?.getAttribute("fill-opacity"),
      strokeWidth: path?.getAttribute("stroke-width"),
      dash: path?.getAttribute("stroke-dasharray"),
      fillColorDisabled: document.querySelector("[data-property-library-shape-fill-color]")?.disabled,
      nameAbsent: document.querySelector("[data-property-ref]") === null,
      labelAbsent: document.querySelector("[data-property-label-visible]") === null
    };
  });
  if (styledRectangle.fill !== "#123abc" || styledRectangle.fillOpacity !== "0.35"
    || styledRectangle.strokeWidth !== "2.5" || styledRectangle.dash !== "12 5 2 5"
    || styledRectangle.fillColorDisabled || !styledRectangle.nameAbsent || !styledRectangle.labelAbsent) {
    throw new Error("rectangle style controls did not update the shared renderer: " + JSON.stringify(styledRectangle));
  }
  await clickSelector(page, "[data-command='undo']");
  await waitFor(page, () => document.querySelector("[model-id] path")?.getAttribute("fill-opacity") === "1", "rectangle style Undo failed");
  await clickSelector(page, "[data-command='redo']");
  await waitFor(page, () => document.querySelector("[model-id] path")?.getAttribute("fill-opacity") === "0.35", "rectangle style Redo failed");
  await waitFor(page, expectedPath => Object.keys(localStorage).some(key => {
    try {
      const state = JSON.parse(localStorage.getItem(key));
      const rectangle = state?.state?.document?.components?.find(component => component.type === "rectangle");
      const path = document.querySelector("[model-id] path");
      return rectangle?.values?.libraryShapeFillColor === "#123abc"
        && rectangle?.values?.libraryShapeFillOpacity === "0.35"
        && path?.getAttribute("d") === expectedPath;
    } catch { return false; }
  }), "rectangle styles were not saved", { args: [styledRectanglePath] });
  await navigate(page, server.url);
  await waitFor(page, path => document.querySelector("[model-id] path")?.getAttribute("d") === path
    && document.querySelector("[model-id] path")?.getAttribute("fill") === "#123abc"
    && document.querySelector("[model-id] path")?.getAttribute("stroke-dasharray") === "12 5 2 5",
  "rectangle styles did not survive reload", { args: [styledRectanglePath] });

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
  await chooseLanguage("zh");
  await clickSelector(page, "[data-log-toggle]");
  await waitFor(page, () => Array.from(document.querySelectorAll(".schematic-log-message")).some(row => row.textContent === "已创建三角形。"), "existing triangle log did not switch to Chinese");
  await clickSelector(page, "[data-log-close]");
  await chooseLanguage("en");
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
      nameHidden: document.querySelector("[data-property-ref]") === null,
      labelHidden: document.querySelector("[data-property-label-visible]") === null,
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

  await evaluate(page, () => {
    const lineStyle = document.querySelector("[data-property-library-shape-line-style]");
    lineStyle.value = "dotted";
    lineStyle.dispatchEvent(new Event("change", { bubbles: true }));
    const width = document.querySelector("[data-property-library-shape-stroke-width]");
    width.value = "1.5";
    width.dispatchEvent(new Event("input", { bubbles: true }));
    width.dispatchEvent(new Event("change", { bubbles: true }));
    const fill = document.querySelector("[data-property-library-shape-fill-enabled]");
    fill.checked = true;
    fill.dispatchEvent(new Event("change", { bubbles: true }));
    const opacity = document.querySelector("[data-property-library-shape-fill-opacity]");
    opacity.value = "0.6";
    opacity.dispatchEvent(new Event("input", { bubbles: true }));
    opacity.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const styledTriangle = await evaluate(page, () => {
    const cells = [...document.querySelectorAll("[model-id]")];
    const path = cells[cells.length - 1]?.querySelector("path");
    return {
      d: path?.getAttribute("d"),
      fill: path?.getAttribute("fill"),
      fillOpacity: path?.getAttribute("fill-opacity"),
      strokeWidth: path?.getAttribute("stroke-width"),
      dash: path?.getAttribute("stroke-dasharray"),
      cornerHidden: document.querySelector("[data-property-library-shape-corner-radius-row]")?.hidden,
      rectangleFieldsHidden: document.querySelector("[data-property-rectangle-fields]")?.hidden
    };
  });
  if (styledTriangle.d !== trianglePathAfter || styledTriangle.fill !== "#ffffff"
    || styledTriangle.fillOpacity !== "0.6" || styledTriangle.strokeWidth !== "1.5"
    || styledTriangle.dash !== "2 5" || !styledTriangle.cornerHidden || !styledTriangle.rectangleFieldsHidden) {
    throw new Error("triangle shared styles or rectangle-only controls failed: " + JSON.stringify(styledTriangle));
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

  await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await waitFor(page, () => document.querySelector("[data-schematic-shell]")?.classList.contains("is-layout-narrow"),
    "mobile narrow layout did not activate");
  await evaluate(page, () => document.querySelector("[data-command='library']")?.click());
  await waitFor(page, () => document.querySelector("[data-schematic-shell]")?.classList.contains("is-left-panel-visible"),
    "mobile left drawer did not open");
  await waitFor(page, () => {
    const tab = document.querySelector("[data-sidebar-tab='properties']");
    const rect = tab?.getBoundingClientRect();
    return Boolean(rect?.width && tab.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)));
  }, "mobile Properties tab is not yet clickable");
  await clickSelector(page, "[data-sidebar-tab='properties']");
  await waitFor(page, () => {
    const fields = document.querySelector("[data-property-library-shape-fill-fields]");
    const panel = document.querySelector("[data-schematic-property-editor]")?.getBoundingClientRect();
    return !fields?.hidden && panel?.width > 0 && panel.left >= 0;
  }, "mobile shape properties did not open");
  const mobilePanel = await evaluate(page, () => {
    const panel = document.querySelector("[data-schematic-property-editor]");
    const bounds = panel?.getBoundingClientRect();
    const color = document.querySelector("[data-property-library-shape-fill-color]");
    const fillSwatches = [...document.querySelectorAll("[data-library-shape-fill-color-swatch]"), color];
    const fillPaletteFits = fillSwatches.length > 1 && fillSwatches.every(swatch => {
      const rect = swatch.getBoundingClientRect();
      return rect.width > 0 && rect.left >= bounds.left && rect.right <= bounds.right;
    });
    return {
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      panelX: bounds?.x,
      panelWidth: bounds?.width,
      fillColorDisabled: color?.disabled,
      fillPaletteFits,
      cornerHidden: document.querySelector("[data-property-library-shape-corner-radius-row]")?.hidden
    };
  });
  if (mobilePanel.viewport !== 375 || mobilePanel.documentWidth > 375
    || mobilePanel.panelX === undefined || mobilePanel.panelX < 0
    || !mobilePanel.panelWidth || mobilePanel.panelX + mobilePanel.panelWidth > 375
    || mobilePanel.fillColorDisabled || !mobilePanel.fillPaletteFits || !mobilePanel.cornerHidden) {
    throw new Error("mobile shape properties are clipped or inconsistent: " + JSON.stringify(mobilePanel));
  }
  const mobileShot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(outDir, "r3-shape-properties-mobile.png"), Buffer.from(mobileShot.data, "base64"));
  console.log(JSON.stringify({ rectangle, smallRectangle, triangle, triangleFrame, palettePreviews, preview, trianglePreview, mobilePanel, ok: true }));
} finally {
  page?.close();
  await browser?.close();
  await server.close();
}
