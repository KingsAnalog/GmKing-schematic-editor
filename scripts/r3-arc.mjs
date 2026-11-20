import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { clickSelector, evaluate, launchBrowser, navigate, openPage, serveDist, waitFor } from "./browser-smoke.mjs";

const server = await serveDist(fileURLToPath(new URL("../apps/web/dist", import.meta.url)));
let browser;
let page;

async function mouse(type, x, y, buttons = 0) {
  await page.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons, clickCount: 1 });
}

async function click(x, y) {
  await mouse("mouseMoved", x, y);
  await mouse("mousePressed", x, y, 1);
  await mouse("mouseReleased", x, y);
}

async function touch(x, y) {
  await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

const pathOnCanvas = () => evaluate(page, () => document.querySelector("[joint-selector='arcHit']")?.getAttribute("d"));

try {
  browser = await launchBrowser();
  page = await openPage(browser.baseUrl, server.url);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 980, deviceScaleFactor: 1, mobile: false });
  await navigate(page, server.url);
  await waitFor(page, () => Boolean(document.querySelector("[data-library-item='arc']")), "Arc not present in Library");
  assert.equal(await evaluate(page, () => document.querySelector("[data-library-item='arc']").lastElementChild.textContent), "Open shape");
  await evaluate(page, () => document.querySelector("[data-library-item='arc']").click());

  await click(600, 380);
  await click(780, 380);
  const flatPreviewHeight = await evaluate(page, () => document.querySelector(".schematic-shape-draft path")?.getBBox().height);
  assert.equal(flatPreviewHeight, 0, "Two endpoints should preview a straight chord");
  assert.equal(await pathOnCanvas(), undefined);
  await mouse("mouseMoved", 687, 317);
  const draft = await evaluate(page, () => {
    const paper = document.querySelector("[data-schematic-paper]").getBoundingClientRect();
    const path = document.querySelector(".schematic-shape-draft path");
    const marker = document.querySelector(".schematic-shape-draft-grid-point");
    const toScreen = ({ x, y }) => ({ x: x + paper.x, y: y + paper.y });
    const length = path.getTotalLength();
    return {
      path: path.getAttribute("d"), start: toScreen(path.getPointAtLength(0)), end: toScreen(path.getPointAtLength(length)),
      through: toScreen({ x: Number(marker.getAttribute("cx")), y: Number(marker.getAttribute("cy")) })
    };
  });
  assert.match(draft.path, / Q /);
  await click(687, 317);
  await waitFor(page, () => document.querySelectorAll("[data-arc-vertex]").length === 3, "Third point did not commit the arc");
  const initial = await pathOnCanvas();
  assert.match(initial, / Q /);
  assert.equal(await evaluate(page, () => document.querySelector("[data-property-library-shape-fill-fields]").hidden), true);

  const handles = () => evaluate(page, () => [...document.querySelectorAll("[data-arc-vertex]")].map(handle => {
    const rect = handle.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }));
  const [start, end, through] = await handles();
  [draft.start, draft.end, draft.through].forEach((expected, index) => {
    const actual = [start, end, through][index];
    assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 0.01, JSON.stringify({ expected, actual }));
  });
  const throughError = await evaluate(page, ({ x, y }) => {
    const path = document.querySelector("[joint-selector='arcHit']");
    const [sx, sy, cx, cy, ex, ey] = path.getAttribute("d").match(/-?\d+(?:\.\d+)?/g).map(Number);
    const halfway = new DOMPoint((sx + 2 * cx + ex) / 4, (sy + 2 * cy + ey) / 4).matrixTransform(path.getScreenCTM());
    return Math.hypot(halfway.x - x, halfway.y - y);
  }, through);
  assert.ok(throughError < 0.1, `The arc missed its third point by ${throughError}px`);
  const handlesLookDifferent = await evaluate(page, () => {
    const endpoint = document.querySelector("[data-arc-vertex='0']");
    const through = document.querySelector("[data-arc-vertex='2']");
    return Number(endpoint.getAttribute("rx")) > 0 && through.getAttribute("transform").startsWith("rotate(45 ");
  });
  assert.ok(handlesLookDifferent, "Endpoints should be round and the shaping point should be a diamond");
  const outside = { x: start.x - 47, y: start.y + 43 };
  await mouse("mousePressed", through.x, through.y, 1);
  await mouse("mouseMoved", (start.x + end.x) / 2, start.y, 1);
  const flatDragHeight = await evaluate(page, () => document.querySelector("[joint-selector='arcHit']").getBBox().height);
  assert.ok(flatDragHeight < 0.01, "The shaping point should cross the chord during a drag");
  await mouse("mouseMoved", outside.x, outside.y, 1);
  await mouse("mouseReleased", outside.x, outside.y);
  (await handles()).forEach((actual, index) => {
    const expected = [start, end, outside][index];
    assert.ok(Math.hypot(actual.x - expected.x, actual.y - expected.y) < 0.01, JSON.stringify({ expected, actual }));
  });
  const outsideLeft = await evaluate(page, () => document.querySelector("[joint-selector='arcHit']").getBoundingClientRect().left);
  assert.ok(outsideLeft < outside.x - 1, `The curve should bend beyond the outside point: ${outsideLeft}`);
  const reshaped = await pathOnCanvas();
  assert.notEqual(reshaped, initial);
  await clickSelector(page, "[data-command='undo']");
  assert.equal(await pathOnCanvas(), initial);
  await clickSelector(page, "[data-command='redo']");
  assert.equal(await pathOnCanvas(), reshaped);

  await waitFor(page, () => Object.keys(localStorage).some(key =>
    key.startsWith("adc-helper-schematic:") && localStorage.getItem(key)?.includes('"arcPoints":')
  ), "Arc was not saved");
  await navigate(page, server.url);
  await waitFor(page, () => Boolean(document.querySelector("[joint-selector='arcHit']")), "Saved arc was not restored");
  assert.equal(await pathOnCanvas(), reshaped);

  await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await waitFor(page, () => document.querySelector("[data-schematic-shell]")?.classList.contains("is-layout-narrow"), "Narrow layout not active");
  await evaluate(page, () => {
    document.documentElement.dataset.effectiveTheme = "dark";
    document.querySelector("[data-command='library']").click();
    document.querySelector("[data-library-item='arc']").click();
  });
  const paper = await evaluate(page, () => {
    const rect = document.querySelector("[data-schematic-paper]").getBoundingClientRect();
    return { x: rect.left, y: rect.top };
  });
  const touches = [{ x: paper.x + 60, y: paper.y + 200 }, { x: paper.x + 180, y: paper.y + 200 }, { x: paper.x + 120, y: paper.y + 200 }];
  await waitFor(page, points => points.every(({ x, y }) =>
    document.querySelector("[data-schematic-paper]").contains(document.elementFromPoint(x, y))
  ), "Mobile drawer covers the canvas", { args: [touches] });
  for (const { x, y } of touches) await touch(x, y);
  await waitFor(page, () => document.querySelectorAll("[data-arc-vertex]").length === 6, "Touch sequence did not commit the arc");
  const mobile = await evaluate(page, () => {
    const arcs = [...document.querySelectorAll("[joint-selector='arcHit']")];
    const arc = arcs.at(-1);
    return { width: document.documentElement.scrollWidth, path: arc.getAttribute("d"), curveHeight: arc.getBBox().height };
  });
  assert.equal(mobile.width, 375);
  assert.match(mobile.path, / Q /);
  assert.equal(mobile.curveHeight, 0, "A collinear third point should commit a straight shape");
  console.log(JSON.stringify({ ok: true, preview: draft.path, reshaped, mobile }));
} finally {
  page?.close();
  await browser?.close();
  await server.close();
}
