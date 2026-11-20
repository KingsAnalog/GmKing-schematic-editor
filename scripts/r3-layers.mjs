import { build } from "esbuild";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  serveDist,
  launchBrowser,
  openPage,
  navigate,
  clickSelector,
  waitFor,
  evaluate
} from "./browser-smoke.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const tempRoot = path.resolve(root, "../../.tmp-build");
await fs.mkdir(tempRoot, { recursive: true });
const output = await fs.mkdtemp(path.join(tempRoot, "r3-layers-"));
const outDir = path.resolve(root, "../../.tmp-shots");
await fs.mkdir(outDir, { recursive: true });
let server;
let browser;
let page;

function assert(condition, message, evidence) {
  if (!condition) throw new Error(`${message} ${JSON.stringify(evidence)}`);
}

try {
  await build({
    absWorkingDir: root,
    stdin: {
      resolveDir: root,
      contents: `
        import { renderSchematicTab, initSchematicEditor } from '@edahelper/schematic/web';
        import '@edahelper/schematic/styles/web.css';
        import './apps/web/style.css';
        const root = document.querySelector('#app');
        root.innerHTML = renderSchematicTab();
        window.layersSmoke = { editor: initSchematicEditor(root) };
      `
    },
    outfile: path.join(output, "main.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    logLevel: "silent"
  });
  await fs.writeFile(
    path.join(output, "index.html"),
    '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="./main.css"></head><body><div id="app"></div><script type="module" src="./main.js"></script></body></html>'
  );
  server = await serveDist(output);
  browser = await launchBrowser();
  page = await openPage(browser.baseUrl, server.url);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 980, deviceScaleFactor: 1, mobile: false });
  await navigate(page, server.url);
  await waitFor(page, () => Boolean(window.layersSmoke?.editor), "editor did not mount");

  await evaluate(page, () => window.layersSmoke.editor.transact(draft => {
    draft.layers = [
      { id: "layer-1", name: "Base", visible: true, locked: false },
      { id: "layer-2", name: "Devices", visible: true, locked: false }
    ];
    draft.components = [
      { id: "resistor-1", type: "resistor", ref: "R1", x: 300, y: 200, rotation: 0, mirrored: false, values: { "layer:id": "layer-2" } },
      { id: "rectangle-1", type: "rectangle", ref: "X1", x: 500, y: 250, rotation: 0, mirrored: false, values: {} },
      { id: "triangle-1", type: "triangle", ref: "X2", x: 700, y: 250, rotation: 0, mirrored: false, values: {} }
    ];
    draft.wires = [
      { id: "wire-a", points: [{ x: 100, y: 100 }, { x: 300, y: 100 }], routeMode: "orthogonal" },
      { id: "wire-b", points: [{ x: 200, y: 100 }, { x: 200, y: 200 }], routeMode: "orthogonal" },
      { id: "wire-c", points: [{ x: 200, y: 100 }, { x: 200, y: 0 }], routeMode: "orthogonal" }
    ];
    draft.netLabels = [{ id: "label-1", name: "VOUT", attachment: { wireId: "wire-a", point: { x: 200, y: 100 } } }];
    draft.notes = [{ id: "note-1", x: 400, y: 400, width: 180, format: "plain", text: "Output stage" }];
  }, { origin: "editor", reason: "layers-tree-fixture" }));
  await clickSelector(page, "[data-sidebar-tab='layers']");
  await waitFor(page, () => document.querySelectorAll("[data-layer-object-select]").length >= 7, "objects did not render");

  const initial = await evaluate(page, () => ({
    groups: [...document.querySelectorAll(".layer-stack-group")].map(group => ({
      id: group.dataset.layerId,
      label: group.querySelector(".layer-select")?.textContent
    })),
    kinds: [...new Set([...document.querySelectorAll("[data-layer-object-kind]")].map(row => row.dataset.layerObjectKind))].sort(),
    pins: document.querySelectorAll("[data-layer-object-kind='pin']").length,
    objects: [...document.querySelectorAll("[data-layer-object-select]")].map(button => button.textContent)
  }));
  assert(initial.groups[0]?.id === "layer-2", "top layer order is incorrect", initial);
  assert(initial.groups[0]?.label === "Devices (1)" && initial.groups[1]?.label?.endsWith("(9)"), "object counts are incorrect", initial);
  assert(["component", "junction", "label", "note", "pin", "shape", "wire"].every(kind => initial.kinds.includes(kind)), "object types are missing", initial);
  assert(initial.pins === 2 && initial.objects.includes("Label VOUT") && initial.objects.includes("Note Output stage"), "object labels are missing", initial);

  await clickSelector(page, "[data-layer-tree-toggle='resistor-1']");
  assert(await evaluate(page, () => document.querySelectorAll("[data-layer-object-kind='pin']").length) === 0, "component pins did not collapse", {});
  await clickSelector(page, "[data-layer-tree-toggle='resistor-1']");
  await clickSelector(page, "[data-layer-object-select^='pin:resistor-1:']");
  const pinSelection = await evaluate(page, () => ({
    tab: document.querySelector(".schematic-sidebar-tab.is-active")?.dataset.sidebarTab,
    selected: [...document.querySelectorAll(".layer-object-row.is-selected [data-layer-object-target]")].map(button => button.dataset.layerObjectTarget)
  }));
  assert(pinSelection.tab === "layers" && pinSelection.selected.every(id => id === "resistor-1") && pinSelection.selected.length === 3, "pin did not select its parent component", pinSelection);

  await clickSelector(page, "[data-layer-object-select='note-1']");
  assert(await evaluate(page, () => document.querySelector("[data-layer-object-select='note-1']")?.getAttribute("aria-current")) === "true", "note selection did not synchronize", {});
  await clickSelector(page, "[data-layer-object-select='wire-a']");
  assert(await evaluate(page, () => document.querySelector("[data-layer-object-select='wire-a']")?.getAttribute("aria-current")) === "true", "wire selection did not synchronize", {});

  const controls = await evaluate(page, () => ({
    fixedPinDisabled: document.querySelector("[data-layer-object-visible^='pin:resistor-1:']")?.disabled,
    pinReorderDisabled: document.querySelector("[data-layer-object-up^='pin:resistor-1:']")?.disabled,
    topBoundaryDisabled: document.querySelector("[data-layer-id='layer-2'] [data-layer-object-up='resistor-1']")?.disabled
  }));
  assert(controls.fixedPinDisabled && controls.pinReorderDisabled && controls.topBoundaryDisabled, "object control boundaries are incorrect", controls);

  await clickSelector(page, "[data-layer-object-visible='rectangle-1']");
  await waitFor(page, () => !document.querySelector("[model-id='rectangle-1']")
    && window.layersSmoke.editor.getContent().layerObjectStates?.["rectangle-1"]?.visible === false, "component visibility did not reach canvas and document");
  await clickSelector(page, "[data-command='undo']");
  await waitFor(page, () => Boolean(document.querySelector("[model-id='rectangle-1']"))
    && window.layersSmoke.editor.getContent().layerObjectStates?.["rectangle-1"]?.visible !== false, "object visibility Undo failed");
  await clickSelector(page, "[data-command='redo']");
  await waitFor(page, () => !document.querySelector("[model-id='rectangle-1']"), "object visibility Redo failed");
  await clickSelector(page, "[data-layer-object-visible='rectangle-1']");
  await waitFor(page, () => Boolean(document.querySelector("[model-id='rectangle-1']")), "object visibility restore failed");

  for (const id of ["wire-a", "junction-200-100", "label-1", "note-1"]) {
    await clickSelector(page, `[data-layer-object-visible='${id}']`);
    await waitFor(page, objectId => window.layersSmoke.editor.getContent().layerObjectStates?.[objectId]?.visible === false,
      "object visibility state was not saved", { args: [id] });
    const absent = await evaluate(page, objectId => !document.querySelector(`[model-id='${objectId}']`)
      && !document.querySelector(`[data-note-id='${objectId}']`), id);
    assert(absent, "hidden object remains on canvas", { id });
    await clickSelector(page, `[data-layer-object-visible='${id}']`);
    await waitFor(page, objectId => window.layersSmoke.editor.getContent().layerObjectStates?.[objectId]?.visible !== false,
      "object visibility did not restore", { args: [id] });
  }

  const orderBefore = await evaluate(page, () => [...document.querySelectorAll("[data-layer-id='layer-1'] > .layer-object-tree > .layer-object-node > .layer-object-row")]
    .map(row => row.dataset.layerObjectId));
  const rectangleIndex = orderBefore.indexOf("rectangle-1");
  assert(rectangleIndex > 0, "rectangle cannot test upward movement", { orderBefore });
  await clickSelector(page, "[data-layer-object-up='rectangle-1']");
  const expectedOrder = [...orderBefore];
  [expectedOrder[rectangleIndex - 1], expectedOrder[rectangleIndex]] = [expectedOrder[rectangleIndex], expectedOrder[rectangleIndex - 1]];
  await waitFor(page, expected => {
    const actual = [...document.querySelectorAll("[data-layer-id='layer-1'] > .layer-object-tree > .layer-object-node > .layer-object-row")]
      .map(row => row.dataset.layerObjectId);
    return JSON.stringify(actual) === JSON.stringify(expected);
  }, "object tree order did not update", { args: [expectedOrder] });
  const stacked = await evaluate(page, () => ({
    rectangle: window.layersSmoke.editor.editor.graphAdapter.getCell("rectangle-1")?.get("z"),
    triangle: window.layersSmoke.editor.editor.graphAdapter.getCell("triangle-1")?.get("z"),
    saved: window.layersSmoke.editor.getContent().layerObjectStates
  }));
  assert(stacked.rectangle > stacked.triangle && stacked.saved?.["rectangle-1"]?.z > 0,
    "canvas stacking and saved z did not follow object order", stacked);
  await clickSelector(page, "[data-command='undo']");
  await waitFor(page, expected => JSON.stringify([...document.querySelectorAll("[data-layer-id='layer-1'] > .layer-object-tree > .layer-object-node > .layer-object-row")]
    .map(row => row.dataset.layerObjectId)) === JSON.stringify(expected), "object order Undo failed", { args: [orderBefore] });
  await clickSelector(page, "[data-command='redo']");
  await waitFor(page, expected => JSON.stringify([...document.querySelectorAll("[data-layer-id='layer-1'] > .layer-object-tree > .layer-object-node > .layer-object-row")]
    .map(row => row.dataset.layerObjectId)) === JSON.stringify(expected), "object order Redo failed", { args: [expectedOrder] });

  await evaluate(page, () => {
    const input = document.querySelector("[data-layer-lock='layer-1']");
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const lockedControls = await evaluate(page, () => ({
    visible: document.querySelector("[data-layer-object-visible='rectangle-1']")?.disabled,
    up: document.querySelector("[data-layer-object-up='rectangle-1']")?.disabled,
    down: document.querySelector("[data-layer-object-down='rectangle-1']")?.disabled
  }));
  assert(Object.values(lockedControls).every(Boolean), "locked layer object controls remain editable", lockedControls);
  await evaluate(page, () => {
    const input = document.querySelector("[data-layer-lock='layer-1']");
    input.checked = false;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  await clickSelector(page, "[data-layer-object-visible='rectangle-1']");
  await waitFor(page, () => Object.keys(localStorage).some(key => {
    try {
      return JSON.parse(localStorage.getItem(key))?.state?.document?.layerObjectStates?.["rectangle-1"]?.visible === false;
    } catch { return false; }
  }), "object visibility was not persisted");
  await navigate(page, server.url);
  await waitFor(page, () => Boolean(window.layersSmoke?.editor), "editor did not reload");
  await clickSelector(page, "[data-sidebar-tab='layers']");
  await waitFor(page, () => document.querySelector("[data-layer-object-visible='rectangle-1']")?.checked === false
    && !document.querySelector("[model-id='rectangle-1']"), "saved object visibility did not restore after reload");
  await clickSelector(page, "[data-layer-object-visible='rectangle-1']");
  await waitFor(page, () => Boolean(document.querySelector("[model-id='rectangle-1']")), "reloaded object did not become visible");

  await clickSelector(page, "[data-layer-up='layer-1']");
  assert(await evaluate(page, () => document.querySelector(".layer-stack-group")?.dataset.layerId) === "layer-1", "layer did not move upward", {});
  await clickSelector(page, "[data-layer-down='layer-1']");
  await evaluate(page, () => {
    const input = document.querySelector("[data-layer-visible='layer-2']");
    input.checked = false;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const hidden = await evaluate(page, () => ({
    disabled: document.querySelector("[data-layer-object-select='resistor-1']")?.disabled,
    cellPresent: Boolean(document.querySelector("[model-id='resistor-1']"))
  }));
  assert(hidden.disabled && !hidden.cellPresent, "hidden layer did not disable tree object and canvas cell", hidden);
  await evaluate(page, () => {
    const input = document.querySelector("[data-layer-visible='layer-2']");
    input.checked = true;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const desktopShot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(outDir, "r3-layers-desktop.png"), Buffer.from(desktopShot.data, "base64"));

  const dark = await evaluate(page, () => {
    document.documentElement.dataset.effectiveTheme = "dark";
    const luminance = value => {
      const rgb = value.match(/[\d.]+/g)?.slice(0, 3).map(Number) ?? [0, 0, 0];
      const linear = rgb.map(channel => {
        const normalized = channel / 255;
        return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    };
    const measure = (text, surface) => {
      const textColor = getComputedStyle(text).color;
      const backgroundColor = getComputedStyle(surface).backgroundColor;
      const first = luminance(textColor);
      const second = luminance(backgroundColor);
      return { textColor, backgroundColor, contrast: (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05) };
    };
    const row = document.querySelector("[data-layer-id='layer-2'] .layer-stack-row");
    const activeTab = document.querySelector(".schematic-sidebar-tab.is-active");
    const title = document.querySelector("[data-sidebar-panel='layers'] .palette-title");
    const panel = document.querySelector("[data-schematic-palette]");
    return {
      layerRow: measure(row.querySelector(".layer-select"), row),
      objectRow: measure(document.querySelector("[data-layer-object-select='note-1']"), panel),
      activeTab: measure(activeTab, activeTab),
      panelTitle: measure(title, panel)
    };
  });
  assert(Object.values(dark).every(entry => entry.contrast >= 4.5), "dark Layers text contrast is insufficient", dark);
  const darkShot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(outDir, "r3-layers-dark.png"), Buffer.from(darkShot.data, "base64"));
  await evaluate(page, () => delete document.documentElement.dataset.effectiveTheme);

  await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await waitFor(page, () => document.querySelector("[data-schematic-shell]")?.classList.contains("is-layout-narrow"), "mobile narrow layout did not activate");
  await evaluate(page, () => document.querySelector("[data-command='library']")?.click());
  await waitFor(page, () => document.querySelector("[data-schematic-shell]")?.classList.contains("is-left-panel-visible"), "mobile left drawer did not open");
  await new Promise(resolve => setTimeout(resolve, 200));
  await clickSelector(page, "[data-sidebar-tab='layers']");
  await waitFor(page, () => document.querySelector(".schematic-sidebar-tab.is-active")?.dataset.sidebarTab === "layers"
    && document.querySelector("[data-sidebar-panel='layers']")?.hidden === false, "mobile Layers tab did not activate");
  await new Promise(resolve => setTimeout(resolve, 250));
  const mobile = await evaluate(page, () => {
    const panel = document.querySelector("[data-schematic-palette]");
    const rect = panel?.getBoundingClientRect();
    return {
      viewport: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      panelX: rect?.x,
      panelWidth: rect?.width,
      panelRight: rect?.right,
      rows: document.querySelectorAll("[data-layer-object-select]").length
    };
  });
  assert(mobile.documentWidth === 375 && mobile.panelX >= 0 && mobile.panelRight <= 375 && mobile.rows >= 7, "mobile object tree overflows", mobile);
  const mobileShot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(outDir, "r3-layers-mobile.png"), Buffer.from(mobileShot.data, "base64"));

  console.log(JSON.stringify({ initial, pinSelection, hidden, dark, mobile, ok: true }));
} finally {
  page?.close();
  await browser?.close();
  await server?.close();
  await fs.rm(output, { recursive: true, force: true });
}
