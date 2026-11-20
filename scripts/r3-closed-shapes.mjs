import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { clickSelector, evaluate, launchBrowser, navigate, openPage, serveDist, waitFor } from "./browser-smoke.mjs";

const server = await serveDist(fileURLToPath(new URL("../apps/web/dist", import.meta.url)));
let browser;
let page;

const mouse = (type, x, y, buttons = 0) =>
  page.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons, clickCount: 1 });

async function click(x, y) {
  await mouse("mouseMoved", x, y);
  await mouse("mousePressed", x, y, 1);
  await mouse("mouseReleased", x, y);
}

async function touch(x, y) {
  await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

const startDrawing = kind => evaluate(page, type => document.querySelector(`[data-library-item='${type}']`).click(), kind);

const artwork = kind => evaluate(page, type => {
  const path = document.querySelector(`[data-${type}-vertex]`).closest("[model-id]").querySelector("[joint-selector='symbolBody']");
  const { width, height } = path.getBBox();
  return { width, height, d: path.getAttribute("d"), fill: path.getAttribute("fill") };
}, kind);

const handles = kind => evaluate(page, type => Array.from(
  document.querySelectorAll(`[data-${type}-vertex]`), handle => {
    const { x, y, width, height } = handle.getBoundingClientRect();
    if (!width || !height) throw new Error(`Hidden ${type} handle`);
    return { x: x + width / 2, y: y + height / 2 };
  }
), kind);

function closeTo(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 0.05, `${actual} should be near ${expected}`);
}

const previewSegments = () => evaluate(page, () => Array.from(
  document.querySelectorAll(".schematic-shape-draft polyline"), line => line.getAttribute("points").split(" ")
));

const pointerMarker = () => evaluate(page, () => {
  const marker = document.querySelector(".schematic-shape-draft-grid-point");
  return `${marker.getAttribute("cx")},${marker.getAttribute("cy")}`;
});

const applyFill = () => evaluate(page, () => {
  const field = document.querySelector("[data-property-library-shape-fill-fields]");
  const toggle = document.querySelector("[data-property-library-shape-fill-enabled]");
  const label = document.querySelector("[data-property-library-shape-fill-color]");
  const swatch = document.querySelector("[data-library-shape-fill-color-swatch='#ff0000']");
  if (field.hidden || toggle.disabled || !swatch || label.parentElement.lastElementChild !== label) {
    throw new Error(`Closed-shape properties are missing: ${JSON.stringify({ hidden: field.hidden, disabled: toggle.disabled, swatch: !!swatch })}`);
  }
  if (!toggle.checked) toggle.click();
  swatch.click();
});

try {
  browser = await launchBrowser();
  page = await openPage(browser.baseUrl, server.url);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 980, deviceScaleFactor: 1, mobile: false });
  await navigate(page, server.url);
  await waitFor(page, () => Boolean(document.querySelector("[data-library-item='polygon']")), "Closed shapes are missing from Library");
  const categories = await evaluate(page, () => ["circle", "polygon"].map(
    type => document.querySelector(`[data-library-item='${type}']`).lastElementChild.textContent
  ));
  assert.deepEqual(categories, ["Closed shape", "Closed shape"]);

  await startDrawing("circle");
  await click(650, 430);
  await click(650, 430);
  assert.equal(await evaluate(page, () => document.querySelectorAll("[data-circle-vertex]").length), 0);
  await mouse("mouseMoved", 680, 470);
  const previewRadius = () => evaluate(page, () => Number(document.querySelector("circle.schematic-shape-draft-shape").getAttribute("r")));
  const firstRadius = await previewRadius();
  await mouse("mouseMoved", 690, 510);
  const finalRadius = await previewRadius();
  assert.ok(firstRadius > 0 && finalRadius > firstRadius);
  await click(690, 510);
  await waitFor(page, () => document.querySelectorAll("[data-circle-vertex]").length === 4, "Circle did not commit with four handles");
  const initialCircle = await artwork("circle");
  closeTo(initialCircle.width, initialCircle.height);
  const [top, right, bottom, left] = await handles("circle");
  closeTo((right.x - left.x) / 2, finalRadius);
  closeTo(top.x, bottom.x);
  closeTo(left.y, right.y);
  await mouse("mousePressed", right.x, right.y, 1);
  await mouse("mouseMoved", right.x + 60, right.y + 20, 1);
  await mouse("mouseReleased", right.x + 60, right.y + 20);
  const ellipse = await artwork("circle");
  const [, movedRight, , fixedLeft] = await handles("circle");
  closeTo(fixedLeft.x, left.x);
  closeTo(fixedLeft.y, left.y);
  closeTo(movedRight.y, right.y);
  assert.ok(movedRight.x > right.x + 40);
  closeTo(ellipse.height, initialCircle.height);
  assert.ok(ellipse.width > initialCircle.width);
  await clickSelector(page, "[data-command='undo']");
  assert.equal((await artwork("circle")).d, initialCircle.d);
  await clickSelector(page, "[data-command='redo']");
  assert.equal((await artwork("circle")).d, ellipse.d);
  await click((fixedLeft.x + movedRight.x) / 2, right.y);
  await applyFill();
  assert.equal((await artwork("circle")).fill, "#ff0000");

  await clickSelector(page, "[data-sidebar-tab='library']");
  await startDrawing("polygon");
  const vertices = [[960, 350], [1090, 350], [1160, 440], [1090, 530], [960, 500]];
  const marked = [];
  for (const [index, [x, y]] of vertices.entries()) {
    await mouse("mouseMoved", x, y);
    const target = await pointerMarker();
    if (index >= 2) {
      assert.deepEqual(await previewSegments(), [marked, [marked.at(-1), target], [target, marked[0]]]);
    }
    await click(x, y);
    marked.push(target);
  }
  await click(...vertices[0]);
  await waitFor(page, expected => document.querySelectorAll("[data-polygon-vertex]").length === expected, "Clicking the start did not close the polygon", { args: [vertices.length] });
  const polygon = await artwork("polygon");
  assert.equal((polygon.d.match(/ L /g) ?? []).length, vertices.length - 1);
  assert.match(polygon.d, / Z$/);
  const points = await handles("polygon");
  const moved = { x: points[2].x + 20, y: points[2].y - 30 };
  await mouse("mousePressed", points[2].x, points[2].y, 1);
  await mouse("mouseMoved", moved.x, moved.y, 1);
  await mouse("mouseReleased", moved.x, moved.y);
  const editedPoints = await handles("polygon");
  editedPoints.forEach((point, index) => {
    if (index === 2) assert.ok(point.x > points[2].x && point.y < points[2].y);
    else assert.deepEqual(point, points[index]);
  });
  await applyFill();
  const editedPolygon = await artwork("polygon");
  assert.notEqual(editedPolygon.d, polygon.d);
  assert.equal(editedPolygon.fill, "#ff0000");

  await waitFor(page, () => Object.keys(localStorage).some(key => {
    const raw = localStorage.getItem(key);
    return key.startsWith("adc-helper-schematic:") && raw.includes('"circleRadiusX":') && raw.includes('"polygonPoints":');
  }), "Closed geometries were not saved");
  await navigate(page, server.url);
  await waitFor(page, () => Boolean(document.querySelector("[data-polygon-vertex]")), "Closed shapes were not restored");
  assert.equal((await artwork("circle")).d, ellipse.d);
  assert.deepEqual(await artwork("polygon"), editedPolygon);

  await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await waitFor(page, () => document.querySelector("[data-schematic-shell]")?.classList.contains("is-layout-narrow"), "Narrow layout is missing");
  const beginMobileShape = kind => evaluate(page, type => {
    document.documentElement.dataset.effectiveTheme = "dark";
    document.querySelector("[data-command='library']").click();
    document.querySelector("[data-sidebar-tab='library']").click();
    document.querySelector(`[data-library-item='${type}']`).click();
  }, kind);
  const paper = await evaluate(page, () => {
    const { x, y } = document.querySelector("[data-schematic-paper]").getBoundingClientRect();
    return { x, y };
  });
  const drawAt = (x, y) => touch(paper.x + x, paper.y + y);
  const waitForCanvas = () => waitFor(page, ({ x, y }) => document.querySelector("[data-schematic-paper]")
    .contains(document.elementFromPoint(x + 110, y + 220)), "Mobile drawer covers the drawing area", { args: [paper] });
  await beginMobileShape("circle");
  await waitForCanvas();
  await drawAt(110, 220);
  await drawAt(145, 250);
  await waitFor(page, () => document.querySelectorAll("[data-circle-vertex]").length === 8, "Mobile circle was not added");
  await beginMobileShape("polygon");
  await waitForCanvas();
  await drawAt(70, 220);
  await drawAt(120, 270);
  await drawAt(165, 210);
  const finish = await evaluate(page, () => {
    const button = document.querySelector(".schematic-polygon-finish");
    const { x, y, width, height } = button.getBoundingClientRect();
    const luminance = color => color.match(/\d+/g).slice(0, 3).reduce((sum, channel, index) => {
      const v = Number(channel) / 255;
      return sum + [0.2126, 0.7152, 0.0722][index] * (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    }, 0);
    const contrast = theme => {
      document.documentElement.dataset.effectiveTheme = theme;
      const { color, backgroundColor } = getComputedStyle(button);
      const [dark, light] = [luminance(color), luminance(backgroundColor)].sort((a, b) => a - b);
      return (light + 0.05) / (dark + 0.05);
    };
    return { x: x + width / 2, y: y + height / 2, enabled: !button.disabled, light: contrast("light"), dark: contrast("dark") };
  });
  assert.ok(finish.enabled && finish.light >= 4.5 && finish.dark >= 4.5, JSON.stringify(finish));
  await touch(finish.x, finish.y);
  await waitFor(page, () => document.querySelectorAll("[data-polygon-vertex]").length === 8, "Mobile Finish did not close the polygon");
  await evaluate(page, () => {
    document.querySelector("[data-command='library']").click();
    document.querySelector("[data-sidebar-tab='properties']").click();
  });
  await waitFor(page, () => {
    const controls = [...document.querySelectorAll("[data-library-shape-fill-color-swatch], [data-property-library-shape-fill-color]")];
    return controls.length > 1 && controls.every(control => {
      const { width, left, right } = control.getBoundingClientRect();
      return width > 0 && left >= 0 && right <= innerWidth;
    });
  }, "Dark, narrow Properties drawer did not fit the viewport");
  await applyFill();
  assert.equal(await evaluate(page, () => document.documentElement.scrollWidth), 375);
  console.log(JSON.stringify({ ok: true, finalRadius, ellipse, polygon: editedPolygon, mobileWidth: 375 }));
} finally {
  page?.close();
  await browser?.close();
  await server.close();
}
