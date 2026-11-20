import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { clickSelector, evaluate, launchBrowser, navigate, openPage, serveDist, waitFor } from "./browser-smoke.mjs";

const server = await serveDist(fileURLToPath(new URL("../apps/web/dist", import.meta.url)));
let browser;
let page;

async function key(key, code = key, text) {
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key, code, ...(text ? { text } : {}) });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code });
}

async function mouse(type, x, y, buttons, clickCount = 1) {
  await page.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons, clickCount });
}

async function click(x, y) {
  await mouse("mousePressed", x, y, 1);
  await mouse("mouseReleased", x, y, 0);
}

async function touch(x, y) {
  await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

const currentPath = () => evaluate(page, () => document.querySelector(
  "[data-polyline-vertex]")?.closest("[model-id]")?.querySelector("[joint-selector='symbolBody']")?.getAttribute("d")
);

try {
  browser = await launchBrowser();
  page = await openPage(browser.baseUrl, server.url);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 980, deviceScaleFactor: 1, mobile: false });
  await navigate(page, server.url);
  await waitFor(page, () => Boolean(document.querySelector("[data-library-item='polyline']")), "Library did not mount");
  assert.equal(await evaluate(page, () => document.querySelector("[data-library-item='polyline']").lastElementChild.textContent), "Open shape");
  assert.equal(await evaluate(page, () => document.querySelector("[data-library-item='rectangle']").lastElementChild.textContent), "Closed shape");

  await evaluate(page, () => document.querySelector("[data-schematic-paper]").focus());
  await key("i", "KeyI", "i");
  await clickSelector(page, "[data-library-id='shapes']");
  await evaluate(page, () => {
    const search = document.querySelector("[data-browser-cell-search]");
    search.value = "折线";
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  assert.equal(await evaluate(page, () => document.querySelector("[data-cell-item].is-active")?.dataset.cellItem), "polyline");
  await key("Enter");
  await waitFor(page, () => document.querySelector(".schematic-polyline-finish")?.hidden === false, "Shapes category did not start drawing");
  const buttonDisabled = () => evaluate(page, () => document.querySelector(".schematic-polyline-finish").disabled);
  await click(600, 300);
  await click(602, 302);
  assert.equal(await buttonDisabled(), true, "consecutive clicks on the same grid point must count once");
  await click(700, 300);
  assert.equal(await buttonDisabled(), false);
  await mouse("mouseMoved", 750, 350, 0);
  assert.equal(await evaluate(page, () => document.querySelectorAll(".schematic-shape-draft polyline").length), 2);
  await click(750, 350);
  await key("Enter");
  await waitFor(page, () => document.querySelectorAll("[data-polyline-vertex]").length === 3, "Enter did not commit a three-point shape");

  const initial = await currentPath();
  assert.match(initial, /^M \d+ \d+ L \d+ \d+ L \d+ \d+$/);
  assert.equal(await evaluate(page, () => document.querySelector("[data-property-library-shape-fill-fields]").hidden), true);
  const handles = () => evaluate(page, () => Array.from(document.querySelectorAll("[data-polyline-vertex]"), handle => {
    const box = handle.getBoundingClientRect();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  }));
  const before = await handles();
  const moved = { x: before[1].x + 20, y: before[1].y - 30 };
  await mouse("mousePressed", before[1].x, before[1].y, 1);
  await mouse("mouseMoved", moved.x, moved.y, 1);
  await mouse("mouseReleased", moved.x, moved.y, 0);
  assert.deepEqual(await handles(), [before[0], moved, before[2]]);
  const movedPath = await currentPath();
  assert.notEqual(initial, movedPath);
  await clickSelector(page, "[data-command='undo']");
  assert.equal(await currentPath(), initial);
  await clickSelector(page, "[data-command='redo']");
  assert.equal(await currentPath(), movedPath);

  const arrowPath = () => evaluate(page, () => document.querySelector("[joint-selector='symbolMarker'][d]")?.getAttribute("d"));
  await click((before[0].x + moved.x) / 2, (before[0].y + moved.y) / 2);
  const setArrow = (property, value) => evaluate(page, (field, next) => {
    const select = document.querySelector(`[data-property-library-shape-arrow="${field}"]`);
    if (select.disabled) throw new Error(`Arrow field ${field} is disabled`);
    select.value = next;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, property, value);
  await setArrow("startArrow", "open");
  const open = await arrowPath();
  assert.equal(open.match(/M /g).length, 1);
  assert.notEqual(await currentPath(), movedPath);
  await setArrow("startArrowSize", "large");
  assert.notEqual(await arrowPath(), open);
  assert.equal(await evaluate(page, () => document.querySelectorAll(
    '[data-property-library-shape-arrow] option[value="asmeFilled"]'
  ).length), 2);
  await setArrow("endArrow", "asmeFilled");
  const both = await arrowPath();
  assert.equal(both.match(/M /g).length, 2);
  const [tipX, tipY, firstX, firstY, lastX, lastY] = both.split("M ").at(-1).match(/-?\d+(?:\.\d+)?/g).map(Number);
  const headLength = Math.hypot(tipX - (firstX + lastX) / 2, tipY - (firstY + lastY) / 2);
  const baseWidth = Math.hypot(firstX - lastX, firstY - lastY);
  assert.ok(Math.abs(headLength - 24) < 1e-6 && Math.abs(baseWidth - 16) < 1e-6, JSON.stringify({ headLength, baseWidth }));
  await clickSelector(page, "[data-command='undo']");
  assert.equal((await arrowPath()).match(/M /g).length, 1);
  await clickSelector(page, "[data-command='redo']");
  assert.equal(await arrowPath(), both);

  const trimmedPath = await currentPath();
  await waitFor(page, () => Object.keys(localStorage).some(key => {
    const raw = localStorage.getItem(key);
    return key.startsWith("adc-helper-schematic:") && raw?.includes('"libraryShapeEndArrow":"asmeFilled"')
      && raw.includes('"libraryShapeStartArrowSize":"large"');
  }), "arrows were not saved");
  await navigate(page, server.url);
  await waitFor(page, () => Boolean(document.querySelector("[data-polyline-vertex]")), "polyline was not restored");
  assert.equal(await currentPath(), trimmedPath);
  assert.equal(await arrowPath(), both);

  await clickSelector(page, "[data-sidebar-tab='library']");
  await evaluate(page, () => document.querySelector("[data-library-item='polyline']").click());
  await click(600, 450);
  await key("Escape");
  assert.equal(await evaluate(page, () => document.querySelector(".schematic-polyline-finish").hidden), true);
  assert.equal(await evaluate(page, () => document.querySelectorAll("[data-polyline-vertex]").length), 3);

  await evaluate(page, () => document.querySelector("[data-library-item='polyline']").click());
  await click(600, 450);
  await click(680, 450);
  await mouse("mousePressed", 680, 450, 1, 2);
  await mouse("mouseReleased", 680, 450, 0, 2);
  await waitFor(page, () => document.querySelectorAll("[data-polyline-vertex]").length === 5, "double-click did not finish the draft");
  await clickSelector(page, "[data-command='undo']");
  await waitFor(page, () => document.querySelectorAll("[data-polyline-vertex]").length === 3, "undo did not remove the second polyline");

  await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true });
  await waitFor(page, () => document.querySelector("[data-schematic-shell]")?.classList.contains("is-layout-narrow"), "mobile layout did not activate");
  await evaluate(page, () => {
    document.documentElement.dataset.effectiveTheme = "dark";
    document.querySelector("[data-command='library']").click();
    document.querySelector("[data-library-item='polyline']").click();
  });
  await waitFor(page, () => document.querySelector(".schematic-polyline-finish")?.hidden === false
    && !document.querySelector("[data-schematic-shell]").classList.contains("is-left-panel-visible"), "mobile Library did not yield to the canvas");
  const bounds = await evaluate(page, () => {
    const paper = document.querySelector("[data-schematic-paper]").getBoundingClientRect();
    return { left: paper.left, top: paper.top };
  });
  await waitFor(page, ({ left, top }) => {
    const paper = document.querySelector("[data-schematic-paper]");
    return [70, 150].every(offset => paper.contains(document.elementFromPoint(left + offset, top + 190)));
  }, "the drawer transition still covers the mobile canvas", { args: [bounds] });
  await touch(bounds.left + 70, bounds.top + 190);
  await touch(bounds.left + 150, bounds.top + 190);
  await waitFor(page, () => !document.querySelector(".schematic-polyline-finish").disabled, "mobile touches did not add two vertices");
  const finish = await evaluate(page, () => {
    const button = document.querySelector(".schematic-polyline-finish");
    const box = button.getBoundingClientRect();
    const luminance = rgb => rgb.match(/\d+/g).slice(0, 3).reduce((sum, channel, index) => {
      const v = Number(channel) / 255;
      return sum + [0.2126, 0.7152, 0.0722][index] * (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    }, 0);
    function contrast() {
      const { color, backgroundColor } = getComputedStyle(button);
      const [dark, light] = [luminance(color), luminance(backgroundColor)].sort((a, b) => a - b);
      return (light + 0.05) / (dark + 0.05);
    }
    const darkContrast = contrast();
    document.documentElement.dataset.effectiveTheme = "light";
    const lightContrast = contrast();
    document.documentElement.dataset.effectiveTheme = "dark";
    return {
      x: Math.round(box.left + box.width / 2), y: Math.round(box.top + box.height / 2),
      right: box.right, width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
      darkContrast, lightContrast
    };
  });
  assert.ok(finish.darkContrast >= 4.5 && finish.lightContrast >= 4.5, JSON.stringify(finish));
  assert.ok(finish.right <= 375 && finish.width === 375 && finish.scrollWidth === 375, JSON.stringify(finish));
  await touch(finish.x, finish.y);
  await waitFor(page, () => document.querySelectorAll("[data-polyline-vertex]").length === 5, "mobile Finish did not create a horizontal polyline");
  await evaluate(page, () => {
    document.querySelector("[data-command='library']").click();
    document.querySelector("[data-sidebar-tab='properties']").click();
  });
  await waitFor(page, () => {
    const arrows = [...document.querySelectorAll("[data-property-library-shape-arrow]")];
    return arrows.length === 4 && arrows.every(input => {
      const box = input.getBoundingClientRect();
      return box.width > 0 && box.left >= 0 && box.right <= 375;
    });
  }, "mobile arrow controls were clipped");
  console.log(JSON.stringify({ ok: true, mobileDarkContrast: finish.darkContrast, mobileLightContrast: finish.lightContrast }));
} finally {
  page?.close();
  await browser?.close();
  await server.close();
}
