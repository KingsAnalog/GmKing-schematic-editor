import { build } from "esbuild";
import { promises as fs } from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
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
const outDir = process.env.SCHEMATIC_SMOKE_ARTIFACTS ?? path.resolve(root, "../../.tmp-shots");
await fs.mkdir(outDir, { recursive: true });
let server;
let browser;
let page;

async function clickPoint({ x, y }, modifiers = 0) {
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, modifiers });
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1, modifiers });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", buttons: 0, clickCount: 1, modifiers });
}

async function pressKey(key) {
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key, code: key });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key });
}

function assert(condition, message, evidence) {
  if (!condition) throw new Error(`${message} ${JSON.stringify(evidence)}`);
}

async function importDocumentFile(json, filename) {
  await evaluate(page, (json, filename) => {
    const input = document.querySelector("[data-schematic-document-import-input]");
    const files = new DataTransfer();
    files.items.add(new File([json], filename, { type: "application/json" }));
    input.files = files.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, json, filename);
}

async function checkImageExport({ hiddenWireId, branchId, shapeId, copiedShapeId }) {
  const baseline = await evaluate(page, () => {
    const { editor, mountReadonlySchematicViewer, objectIds } = window.layersSmoke;
    editor.transact(draft => {
      draft.notes.push(
        { id: "front-note", layerId: "layer-2", x: 100, y: 100, width: 120, format: "plain", text: "Front" },
        { id: "back-note", layerId: "layer-2", x: 100, y: 100, width: 120, format: "plain", text: "Back" },
        { id: "private-note", layerId: "layer-3", x: 2200, y: 100, width: 160, height: 80, format: "plain",
          backgroundColor: "#ff0000", text: "Private" }
      );
      draft.layerObjectStates["front-note"] = { z: 20 };
    }, { origin: "editor", reason: "image-export-fixture" });

    const content = editor.getContent();
    const host = document.createElement("div");
    host.style.cssText = "width:320px;height:160px";
    document.body.append(host);
    const viewer = mountReadonlySchematicViewer(host, content);
    const viewerIds = objectIds(host);
    const viewerDisplay = {
      hop: host.querySelector("[data-wire-id='display-crossing'] path")?.getAttribute("d"),
      font: host.querySelector("[data-note-id='output-note'] text")?.getAttribute("font-family")
    };
    viewer.destroy();
    host.remove();

    const createUrl = URL.createObjectURL;
    const click = HTMLAnchorElement.prototype.click;
    const blobs = new Map();
    URL.createObjectURL = function(blob) {
      const url = createUrl.call(this, blob);
      blobs.set(url, blob);
      return url;
    };
    const downloads = window.layersSmoke.downloads = [];
    HTMLAnchorElement.prototype.click = function() {
      const blob = blobs.get(this.href);
      if (this.download && blob) downloads.push({ filename: this.download, blob });
      else click.call(this);
    };
    return { viewerIds, viewerDisplay, content: JSON.stringify(content) };
  });
  const trigger = "[data-schematic-document-export]";
  const dialog = "[data-schematic-document-export-dialog][open]";
  const hiddenInput = "[data-schematic-export-hidden]";
  let downloadCount = 0;
  const openExport = async () => {
    await clickSelector(page, trigger);
    await waitFor(page, selector => !!document.querySelector(selector), "Export schematic dialog did not open", { args: [dialog] });
    assert(await evaluate(page, selector => !document.querySelector(selector).checked, hiddenInput),
      "export dialog did not default to visible objects", {});
  };
  const download = async (format, includeHidden = false) => {
    await openExport();
    if (includeHidden) await clickSelector(page, hiddenInput);
    await clickSelector(page, `[data-schematic-export-format='${format}']`);
    await waitFor(page, count => window.layersSmoke.downloads.length === count, `${format} export did not download`, { args: [++downloadCount] });
  };
  await download("svg");
  await download("svg", true);
  await download("png");
  await download("png", true);
  await download("json", true);

  const exported = await evaluate(page, async () => {
    const { downloads, editor, objectIds } = window.layersSmoke;
    const svgNodes = await Promise.all(downloads.slice(0, 2).map(async ({ blob }) =>
      new DOMParser().parseFromString(await blob.text(), "image/svg+xml").documentElement));
    const ids = svgNodes.map(objectIds);
    const pngSizes = await Promise.all(downloads.slice(2, 4).map(async ({ blob }, index) => {
      const image = await createImageBitmap(blob);
      const svg = svgNodes[index];
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0);
      const privateRect = svg.querySelector("[data-note-id='private-note'] rect");
      let hiddenNoteColor;
      if (privateRect) {
        const [x, y, width, height] = svg.getAttribute("viewBox").split(" ").map(Number);
        const sampleX = Number(privateRect.getAttribute("x")) + Number(privateRect.getAttribute("width")) / 2;
        const sampleY = Number(privateRect.getAttribute("y")) + Number(privateRect.getAttribute("height")) - 6;
        const px = (sampleX - x) * image.width / width;
        const py = (sampleY - y) * image.height / height;
        hiddenNoteColor = Array.from(context.getImageData(Math.floor(px), Math.floor(py), 1, 1).data);
      }
      image.close();
      return { w: canvas.width, h: canvas.height, hiddenNoteColor,
        svgWidth: +svg.getAttribute("width"), svgHeight: +svg.getAttribute("height") };
    }));
    return {
      ids, pngSizes, files: downloads.map(item => [item.filename, item.blob.type]),
      displays: svgNodes.map(svg => ({
        hop: svg.querySelector("[data-wire-id='display-crossing'] path")?.getAttribute("d"),
        font: svg.querySelector("[data-note-id='output-note'] text")?.getAttribute("font-family")
      })),
      jsonText: await downloads[4].blob.text(),
      currentContent: JSON.stringify(editor.getContent())
    };
  });
  const [visible, all] = exported.ids;
  assert(baseline.viewerDisplay.hop?.includes("C ") && baseline.viewerDisplay.font?.startsWith("Consolas")
    && exported.displays.every(display => isDeepStrictEqual(display, baseline.viewerDisplay)),
    "SVG and readonly viewer disagree about the RC crossing or note font", { viewer: baseline.viewerDisplay, svg: exported.displays });
  assert(isDeepStrictEqual(visible, baseline.viewerIds) && visible.includes(branchId)
    && visible.includes(shapeId) && visible.includes(copiedShapeId) && visible.includes("output-label")
    && visible.indexOf("back-note") < visible.indexOf("front-note"), "viewer and default SVG differ in visibility or order", exported.ids);
  assert(!visible.includes("private-note") && !visible.includes("locked-note") && !visible.includes(hiddenWireId)
    && all.includes("private-note") && all.includes("locked-note") && all.includes(hiddenWireId),
    "image visibility modes selected the wrong objects", exported.ids);
  assert(exported.files.every(([file, mime], index) => file.endsWith([".svg", ".svg", ".png", ".png", ".sch.json"][index])
    && mime === ["image/svg+xml", "image/svg+xml", "image/png", "image/png", "application/json"][index]),
    "image or JSON file metadata is incorrect", exported.files);
  assert(exported.pngSizes.every(size => size.w === size.svgWidth * 2 && size.h === size.svgHeight * 2)
    && exported.pngSizes[1].w > exported.pngSizes[0].w
    && exported.pngSizes[1].hiddenNoteColor?.[0] > 220 && exported.pngSizes[1].hiddenNoteColor?.[1] < 140,
    "PNG does not match SVG bounds or the hidden note failed to rasterize", exported.pngSizes);
  const json = JSON.parse(exported.jsonText).schematic;
  assert(exported.currentContent === baseline.content && json.layers.find(layer => layer.id === "layer-3")?.visible === false
    && json.layerObjectStates[hiddenWireId]?.visible === false,
    "export mutated the document or lost JSON visibility state", { files: exported.files });

  const checkDialogLayout = () => evaluate(page, selector => {
    const box = document.querySelector(selector);
    const button = box.querySelector("[data-schematic-export-format='svg']");
    const buttonStyle = getComputedStyle(button);
    const luminance = (rgb) => {
      const channels = rgb.match(/\d+(?:\.\d+)?/g).slice(0, 3).map(channel => {
        const s = Number(channel) / 255;
        return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const values = [luminance(buttonStyle.color), luminance(buttonStyle.backgroundColor)].sort((a, b) => a - b);
    const rect = box.getBoundingClientRect();
    return { contrast: (values[1] + 0.05) / (values[0] + 0.05), left: rect.left, right: rect.right, viewport: innerWidth };
  }, dialog);
  await openExport();
  const light = await checkDialogLayout();
  assert(light.contrast >= 4.5, "Light export text contrast is insufficient", light);
  await clickSelector(page, "[data-schematic-export-cancel]");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await evaluate(page, () => { document.documentElement.dataset.effectiveTheme = "dark"; });
  await waitFor(page, () => document.querySelector("[data-schematic-shell]").classList.contains("is-layout-narrow"),
    "375px export layout did not activate");
  await openExport();
  const dark = await checkDialogLayout();
  assert(dark.viewport === 375 && dark.left >= 0 && dark.right <= 375 && dark.contrast >= 4.5,
    "Dark mobile export dialog is clipped or has insufficient contrast", dark);
  await pressKey("Escape");
  await waitFor(page, selector => !document.querySelector(selector), "Escape did not close the export dialog", { args: [dialog] });
  return exported.jsonText;
}

async function checkLayersRoundTrip(fixture, { selectInLayers, moveSelection, emptyCanvasPoint }) {
  const priorTab = await evaluate(page, () => window.layersSmoke.editor.editor.activeHostedDocumentId);
  await importDocumentFile(fixture, "r3-1f-layer-roundtrip.sch.json");
  await waitFor(page, id => window.layersSmoke.editor.editor.activeHostedDocumentId !== id
    && !!document.querySelector("[model-id='output-branch']"), "round-trip circuit did not load", { args: [priorTab] });

  const shapeId = "roundtrip-shape";
  await evaluate(page, id => window.layersSmoke.editor.transact(draft => {
    draft.components.push({ id, type: "rectangle", ref: "X1", x: 790, y: 110, rotation: 0, mirrored: false, values: {} });
    draft.wires.push({ id: "display-crossing", layerId: "layer-1", routeMode: "orthogonal",
      points: [{ x: 550, y: 80 }, { x: 550, y: 180 }] });
    draft.layerObjectStates ??= {};
    draft.layerObjectStates["display-crossing"] = { z: 100 };
  }, { origin: "editor", reason: "layer-roundtrip-fixture" }), shapeId);

  const readContent = () => evaluate(page, () => window.layersSmoke.editor.getContent());
  const readNetlists = () => evaluate(page, () => window.layersSmoke.netlists());
  const baselineNetlists = await readNetlists();
  assert(/\bR1\b/.test(baselineNetlists.spice) && /\bC1\b/.test(baselineNetlists.spice)
    && baselineNetlists.diagnostics.every(item => item.severity !== "error"), "RC baseline netlist is invalid", baselineNetlists);
  const expectNetlists = async stage => {
    const actual = await readNetlists();
    assert(isDeepStrictEqual(actual, baselineNetlists), `RC netlists or diagnostics changed after ${stage}`, actual);
  };
  const worldPoint = (x, y) => evaluate(page, (x, y) => {
    const point = window.layersSmoke.editor.editor.paper.localToClientPoint(x, y);
    return { x: point.x, y: point.y };
  }, x, y);

  await selectInLayers("output-branch");
  await moveSelection("layer-1");
  await selectInLayers(shapeId);
  await moveSelection("layer-2");
  const reassigned = await readContent();
  assert(reassigned.wires.find(wire => wire.id === "output-branch")?.layerId === "layer-1"
    && reassigned.components.find(component => component.id === shapeId)?.values["layer:id"] === "layer-2",
    "round-trip layer reassignment failed", reassigned.layerObjectStates);
  await expectNetlists("layer reassignment");

  await clickSelector(page, "[data-schematic-open-options]");
  await evaluate(page, () => {
    for (const [selector, value] of [["[data-schematic-wire-crossings]", "hop"], ["[data-schematic-text-font]", "serif"]]) {
      const select = document.querySelector(selector);
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await clickSelector(page, "[data-schematic-options-close]");
  const wirePath = id => evaluate(page, id => document.querySelector(`[model-id='${id}'] [joint-selector='line']`)?.getAttribute("d"), id);
  const outputHop = () => evaluate(page, () => document.querySelector("[model-id='output-branch'] [joint-selector='line']")?.getAttribute("d"));
  assert((await outputHop())?.includes("C "), "Hop should draw on the top RC wire", await wirePath("display-crossing"));
  await expectNetlists("Hop and default text font");

  await selectInLayers("output-note");
  await clickSelector(page, "[data-sidebar-tab='properties']");
  await evaluate(page, () => {
    const select = document.querySelector("[data-property-text-font='note']");
    if (!select.getClientRects().length) throw new Error("note font override is hidden");
    select.value = "mono";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const fonts = await evaluate(page, () => ({
    label: document.querySelector("[model-id='output-label'] [joint-selector='label']")?.getAttribute("font-family"),
    note: document.querySelector("[data-note-id='output-note']")?.style.fontFamily
  }));
  assert(fonts.label?.startsWith("Georgia") && fonts.note?.startsWith("Consolas"), "RC label or note did not apply the requested font", fonts);
  await expectNetlists("note font override");

  await selectInLayers("display-crossing");
  for (let attempt = 0; attempt < 12 && !(await wirePath("display-crossing"))?.includes("C "); attempt++) {
    await evaluate(page, () => document.querySelector("[data-layer-object-up='display-crossing']").click());
    await evaluate(page, () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  }
  const crossingForExport = await wirePath("display-crossing");
  assert(crossingForExport?.includes("C ") && !(await outputHop())?.includes("C "), "layer reorder did not move the Hop to the new top wire", crossingForExport);
  await evaluate(page, () => document.querySelector("[data-layer-object-visible='display-crossing']").click());
  await waitFor(page, () => !document.querySelector("[model-id='display-crossing']")
    && document.querySelector("[model-id='output-branch'] [joint-selector='line']")?.getAttribute("d")?.split("M").length === 2,
    "hiding the upper wire did not remove the crossing gap");
  await expectNetlists("crossing visibility and order");
  await evaluate(page, () => document.querySelector("[data-layer-object-visible='display-crossing']").click());
  const originalState = (await readContent()).layerObjectStates["output-branch"];

  await clickSelector(page, "[data-sidebar-tab='layers']");
  await evaluate(page, () => document.querySelector("[data-layer-select='layer-2']").click());
  await clickSelector(page, "[data-command='wire']");
  await clickPoint(await worldPoint(590, 60));
  await clickPoint(await worldPoint(590, 130));
  await pressKey("Enter");
  await waitFor(page, () => !!document.querySelector("[model-id='junction-590-130']"), "Wire tool did not split the output conductor");
  await pressKey("Escape");
  const split = await readContent();
  const { wireId: rightSegmentId, point: labelPoint } = split.netLabels.find(label => label.id === "output-label").attachment;
  const rightSegment = split.wires.find(wire => wire.id === rightSegmentId);
  const leftSegment = split.wires.find(wire => wire.id === "output-branch");
  const branch = split.wires.find(wire => wire.layerId === "layer-2" && wire.points.some(point => point.x === 590 && point.y === 60));
  assert(rightSegmentId !== "output-branch" && isDeepStrictEqual(labelPoint, { x: 630, y: 130 })
    && [leftSegment, rightSegment].every(wire => wire?.layerId === "layer-1"
      && isDeepStrictEqual(split.layerObjectStates[wire.id], originalState)),
    "split did not preserve the output label, layer or stack position", { rightSegmentId, labelPoint, leftSegment, rightSegment });
  assert(branch && split.connections.wires[branch.id].some(node =>
    [leftSegment, rightSegment].every(wire => split.connections.wires[wire.id].includes(node))),
    "the branch and both output segments do not share the physical node", split.connections.wires);
  await expectNetlists("T-junction split");

  await selectInLayers(shapeId);
  await clickPoint(await worldPoint(675, 130), 8);
  await evaluate(page, () => window.layersSmoke.editor.editor.hostFocusCanvas());
  await pressKey("c");
  await clickPoint(await worldPoint(675, 150));
  await waitFor(page, () => document.querySelector("[data-schematic-status]")?.textContent.includes("2 objects attached to cursor"),
    "copy did not pick both the shape and the split wire");
  await clickPoint(await emptyCanvasPoint());
  await waitFor(page, () => window.layersSmoke.editor.getContent().components.filter(component => component.type === "rectangle").length === 2,
    "the copied shape did not commit");
  await pressKey("Escape");
  const duplicated = await readContent();
  const copiedShape = duplicated.components.find(component => component.type === "rectangle" && component.id !== shapeId);
  const copiedWire = duplicated.wires.find(wire => !split.wires.some(previous => previous.id === wire.id));
  assert(copiedShape?.values["layer:id"] === "layer-2" && copiedWire?.layerId === "layer-1"
    && duplicated.layerObjectStates[copiedWire.id]?.z > originalState.z,
    "mixed copy lost the shape or wire layer or the placement order", { copiedShape, copiedWire });
  await expectNetlists("shape and wire copy");

  await clickSelector(page, "[data-sidebar-tab='layers']");
  await evaluate(page, id => {
    document.querySelector(`[data-layer-object-visible='${id}']`).click();
    document.querySelector("[data-layer-visible='layer-3']").click();
  }, rightSegmentId);
  await waitFor(page, id => {
    const content = window.layersSmoke.editor.getContent();
    return content.layerObjectStates?.[id]?.visible === false && content.layers.find(layer => layer.id === "layer-3")?.visible === false
      && !document.querySelector(`[model-id='${id}'], [data-note-id='locked-note']`)
      && !!document.querySelector("[model-id='output-label']");
  }, "single-object or whole-layer visibility did not reach the canvas", { args: [rightSegmentId] });
  await expectNetlists("wire and layer visibility changes");

  const json = await checkImageExport({ hiddenWireId: rightSegmentId, branchId: branch.id, shapeId, copiedShapeId: copiedShape.id });
  const exportedContent = await readContent();
  await expectNetlists("SVG, PNG and JSON export");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 980, deviceScaleFactor: 1, mobile: false });
  await navigate(page, server.url);
  await waitFor(page, id => !!document.querySelector(`[model-id='${id}']`), "copied shape did not reload", { args: [copiedShape.id] });
  const reloaded = await readContent();
  assert(isDeepStrictEqual(reloaded, exportedContent), "reloading changed the circuit or Layers state", reloaded);
  await expectNetlists("workspace reload");

  const reloadedTab = await evaluate(page, () => window.layersSmoke.editor.editor.activeHostedDocumentId);
  await importDocumentFile(json, "r3-1f-layer-roundtrip-export.sch.json");
  await waitFor(page, id => window.layersSmoke.editor.editor.activeHostedDocumentId !== id,
    "exported JSON did not open in a new document", { args: [reloadedTab] });
  const imported = await readContent();
  assert(isDeepStrictEqual(imported, exportedContent), "file round-trip changed the circuit or Layers state", imported);
  await waitFor(page, () => document.querySelector("[model-id='display-crossing'] [joint-selector='line']")
    ?.getAttribute("d")?.includes("C "), "JSON re-import did not redraw the Hop");
  assert(imported.display?.wireCrossings === "hop" && imported.display?.textFont === "serif"
    && imported.notes.find(note => note.id === "output-note")?.fontFamily === "mono"
    && (await wirePath("display-crossing"))?.includes("C "), "JSON re-import lost Hop or note font settings", imported.display);
  await expectNetlists("JSON re-import");
}

try {
  await build({
    absWorkingDir: root,
    stdin: {
      resolveDir: root,
      contents: `
        import { renderSchematicTab, initSchematicEditor } from '@edahelper/schematic/web';
        import { mountReadonlySchematicViewer } from '@edahelper/schematic/viewer';
        import { buildStructuralNetlist } from './packages/schematic/dist/schematic/netlist/build.js';
        import { printNetlist } from './packages/schematic/dist/schematic/netlist/print.js';
        import '@edahelper/schematic/styles/web.css';
        import './apps/web/style.css';
        const root = document.querySelector('#app');
        root.innerHTML = renderSchematicTab();
        const editor = initSchematicEditor(root);
        window.layersSmoke = {
          editor, mountReadonlySchematicViewer,
          objectIds(root) {
            return [...root.querySelectorAll("[data-component-id], [data-net-label-id], [data-note-id], [data-wire-id]")]
              .map(node => node.dataset.componentId ?? node.dataset.netLabelId ?? node.dataset.noteId ?? node.dataset.wireId);
          },
          netlists() {
            const design = buildStructuralNetlist(editor.editor.hostDocument());
            return {
              spice: printNetlist(design, "spice"),
              spectre: printNetlist(design, "spectre"),
              diagnostics: design.diagnostics
            };
          }
        };
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

  await evaluate(page, () => window.layersSmoke.editor.transact(draft => {
    for (const wire of draft.wires.filter(wire => wire.id === "wire-a" || wire.id.startsWith("wire-a-segment-"))) {
      wire.layerId = "layer-2";
    }
    draft.netLabels[0].layerId = "layer-2";
    draft.notes[0].layerId = "layer-2";
  }, { origin: "editor", reason: "assigned-layer-fixture" }));
  const resolvedLayers = await evaluate(page, () => ["wire-a", "label-1", "note-1", "junction-200-100"].map(id =>
    document.querySelector(`[data-layer-object-select='${id}']`)?.closest("[data-layer-id]")?.dataset.layerId
  ));
  assert(resolvedLayers.every(id => id === "layer-2"), "assigned objects and junction are not grouped on the upper layer", resolvedLayers);
  await evaluate(page, () => document.querySelector("[data-layer-visible='layer-2']").click());
  const displayed = await evaluate(page, () => ({
    wire: !!document.querySelector("[model-id='wire-a']"),
    label: !!document.querySelector("[model-id='label-1']"),
    note: !!document.querySelector("[data-note-id='note-1']"),
    junctionLayer: document.querySelector("[data-layer-object-select='junction-200-100']")
      ?.closest("[data-layer-id]")?.dataset.layerId
  }));
  assert(!displayed.wire && !displayed.label && !displayed.note && displayed.junctionLayer === "layer-1",
    "cross-layer visibility or junction ownership disagrees with the object tree", displayed);
  await evaluate(page, () => document.querySelector("[data-layer-visible='layer-2']").click());

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

  await page.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 980, deviceScaleFactor: 1, mobile: false });
  const rcFixture = await fs.readFile(new URL("./fixtures/r3-1c-rc-layer-test.schematic.json", import.meta.url), "utf8");
  await importDocumentFile(rcFixture, "r3-1c-rc-layer-test.schematic.json");
  await waitFor(page, () => !!document.querySelector("[model-id='output-branch']")
    && window.layersSmoke.editor.getContent().notes.some(note => note.id === "output-note"), "RC fixture did not import");

  const fileImport = await evaluate(page, () => ({
    content: window.layersSmoke.editor.getContent(),
    activeTab: document.querySelector("[data-schematic-document-tab][aria-selected='true']").dataset.schematicDocumentTab,
    tabCount: document.querySelectorAll("[data-schematic-document-tab]").length
  }));
  await evaluate(page, source => Object.defineProperty(navigator, "clipboard", {
    configurable: true, value: { readText: async () => source }
  }), rcFixture);
  await clickSelector(page, "[data-schematic-document-paste]");
  await waitFor(page, expected => {
    const active = document.querySelector("[data-schematic-document-tab][aria-selected='true']");
    return active?.dataset.schematicDocumentTab !== expected.activeTab
      && document.querySelectorAll("[data-schematic-document-tab]").length === expected.tabCount + 1;
  }, "Paste schematic JSON did not open a new document", { args: [fileImport] });
  const clipboardContent = await evaluate(page, () => window.layersSmoke.editor.getContent());
  assert(JSON.stringify(fileImport.content) === JSON.stringify(clipboardContent),
    "clipboard and file import produced different schematic content", clipboardContent.layers);

  const selectInLayers = async id => {
    await clickSelector(page, "[data-sidebar-tab='layers']");
    await clickSelector(page, `[data-layer-object-select='${id}']`);
    await clickSelector(page, "[data-sidebar-tab='properties']");
  };
  const moveSelection = layerId => evaluate(page, id => {
    const layer = document.querySelector("[data-property-layer]");
    layer.value = id;
    layer.dispatchEvent(new Event("change", { bubbles: true }));
  }, layerId);
  const importConnections = await evaluate(page, () => window.layersSmoke.editor.getContent().connections);
  await selectInLayers("output-label");
  const ui = await evaluate(page, () => {
    const layer = document.querySelector("[data-property-layer]");
    return { shown: !!layer.getBoundingClientRect().width, value: layer.value,
      locked: [...layer.options].find(option => option.value === "layer-3").disabled };
  });
  assert(ui.shown && ui.value === "layer-2" && ui.locked, "label layer or locked target option is incorrect", ui);
  await moveSelection("layer-3");
  const rejected = await evaluate(page, () => window.layersSmoke.editor.getContent().netLabels.find(label => label.id === "output-label").layerId);
  assert(rejected === "layer-2", "locked layer accepted an assignment", rejected);
  await moveSelection("layer-1");
  await waitFor(page, () => window.layersSmoke.editor.getContent().netLabels.find(label => label.id === "output-label").layerId === "layer-1",
    "label did not move to the base layer");
  assert(await evaluate(page, () => document.querySelector("[data-layer-object-select='output-label']")?.hasAttribute("aria-current")),
    "visible label lost its selection after a layer move", {});
  await clickSelector(page, "[data-command='undo']");
  await waitFor(page, () => window.layersSmoke.editor.getContent().netLabels.find(label => label.id === "output-label").layerId === "layer-2",
    "Undo did not restore the label layer");

  const wirePoint = id => evaluate(page, wireId => {
    const path = document.querySelector(`[model-id='${wireId}'] [joint-selector='line']`);
    const point = path.getPointAtLength(path.getTotalLength() * 0.35).matrixTransform(path.getScreenCTM());
    return { x: point.x, y: point.y };
  }, id);
  await selectInLayers("output-note");
  await clickPoint(await wirePoint("input-wire-segment-1"), 8);
  const mixed = await evaluate(page, () => {
    const select = document.querySelector("[data-property-layer]");
    return { value: select.value, text: select.selectedOptions[0]?.textContent };
  });
  assert(mixed.value === "" && mixed.text === "Multiple layers", "mixed note and wire selection did not show mixed layers", mixed);
  await moveSelection("layer-1");
  await waitFor(page, () => {
    const content = window.layersSmoke.editor.getContent();
    return content.notes.find(note => note.id === "output-note").layerId === "layer-1"
      && content.layerObjectStates?.["output-note"]?.z > content.layerObjectStates?.["input-wire-segment-1"]?.z;
  }, "batch assignment did not keep stack order");
  await clickSelector(page, "[data-command='undo']");
  await waitFor(page, () => window.layersSmoke.editor.getContent().notes.find(note => note.id === "output-note").layerId === "layer-2",
    "Undo did not restore the mixed layer assignment");
  await clickSelector(page, "[data-command='redo']");
  await waitFor(page, () => window.layersSmoke.editor.getContent().notes.find(note => note.id === "output-note").layerId === "layer-1",
    "Redo did not restore the mixed layer assignment");
  const finalConnections = await evaluate(page, () => window.layersSmoke.editor.getContent().connections);
  assert(JSON.stringify(importConnections) === JSON.stringify(finalConnections), "layer assignment changed connection bindings", finalConnections);

  await evaluate(page, () => document.querySelector("[data-layer-visible='layer-1']").click());
  await selectInLayers("output-branch");
  const hiddenAssignmentState = () => evaluate(page, () => {
    const row = document.querySelector("[data-layer-object-select='output-branch']");
    const layer = document.querySelector("[data-property-layer]");
    return {
      layer: row?.closest("[data-layer-id]")?.dataset.layerId,
      disabled: row?.disabled,
      selected: row?.hasAttribute("aria-current"),
      drawn: !!document.querySelector("[model-id='output-branch']"),
      baseVisible: window.layersSmoke.editor.getContent().layers.find(layer => layer.id === "layer-1").visible,
      select: layer.value,
      selection: [...window.layersSmoke.editor.editor.selectionSession.selectedIds]
    };
  });
  const beforeHiddenAssignment = await hiddenAssignmentState();
  assert(beforeHiddenAssignment.selected && beforeHiddenAssignment.baseVisible === false,
    "hidden destination scenario was not prepared", beforeHiddenAssignment);
  await moveSelection("layer-1");
  const hiddenAssignment = await hiddenAssignmentState();
  assert(hiddenAssignment.layer === "layer-1" && hiddenAssignment.disabled && !hiddenAssignment.selected && !hiddenAssignment.drawn,
    "move into a hidden layer did not remove the canvas selection", hiddenAssignment);
  await clickSelector(page, "[data-command='undo']");
  await evaluate(page, () => document.querySelector("[data-layer-visible='layer-1']").click());

  await clickSelector(page, "[data-sidebar-tab='layers']");
  await clickSelector(page, "[data-layer-select='layer-2']");
  await clickSelector(page, "[data-layer-delete]");
  assert(await evaluate(page, () => window.layersSmoke.editor.getContent().layers.some(layer => layer.id === "layer-2")),
    "occupied layer was deleted", {});
  const blank = await evaluate(page, () => {
    const paper = document.querySelector("[data-schematic-paper]").getBoundingClientRect();
    return { x: paper.right - 300, y: paper.bottom - 100 };
  });
  await clickSelector(page, "[data-command='wire']");
  await clickPoint(blank);
  await clickPoint({ x: blank.x + 70, y: blank.y });
  await pressKey("Enter");
  await waitFor(page, () => window.layersSmoke.editor.getContent().wires.some(wire =>
    wire.layerId === "layer-2" && wire.id !== "output-branch"), "new wire was not assigned to the active layer");
  await pressKey("Escape");
  await clickSelector(page, "[data-command='note']");
  await waitFor(page, () => window.layersSmoke.editor.getContent().notes.some(note => note.id !== "output-note" && note.layerId === "layer-2"),
    "new note was not assigned to the active layer");
  await pressKey("Escape");
  await clickSelector(page, "[data-command='label']");
  await evaluate(page, () => {
    const input = document.querySelector("[data-property-label-tool-input]");
    input.value = "TEST";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.focus();
  });
  await pressKey("Enter");
  await clickPoint(await wirePoint("input-wire-segment-1"));
  await waitFor(page, () => window.layersSmoke.editor.getContent().netLabels.some(label => label.name === "TEST" && label.layerId === "layer-2"),
    "new label was not assigned to the active layer");
  await pressKey("Escape");

  await clickSelector(page, "[data-sidebar-tab='layers']");
  await clickSelector(page, "[data-layer-select='layer-3']");
  const noteCount = await evaluate(page, () => window.layersSmoke.editor.getContent().notes.length);
  await clickSelector(page, "[data-command='note']");
  const lockedPlacement = await evaluate(page, () => ({
    notes: window.layersSmoke.editor.getContent().notes.length,
    status: document.querySelector("[data-schematic-status]").textContent
  }));
  assert(lockedPlacement.notes === noteCount && /locked/.test(lockedPlacement.status),
    "locked active layer accepted a new note", lockedPlacement);

  await selectInLayers("output-branch");
  await clickSelector(page, "[data-sidebar-tab='layers']");
  await clickSelector(page, "[data-layer-select='layer-1']");
  const sourceTab = await evaluate(page, () =>
    document.querySelector("[data-schematic-document-tab][aria-selected='true']").dataset.schematicDocumentTab);
  const sameDocumentWireIds = await evaluate(page, () => window.layersSmoke.editor.getContent().wires.map(wire => wire.id));
  await evaluate(page, () => window.layersSmoke.editor.editor.hostFocusCanvas());
  await pressKey("c");
  await clickPoint({ x: blank.x, y: blank.y - 200 });
  await clickPoint({ x: blank.x + 80, y: blank.y - 200 });
  await waitFor(page, ids => window.layersSmoke.editor.getContent().wires.some(wire => !ids.includes(wire.id) && wire.layerId === "layer-2"),
    "copy within the tab did not retain the source layer", { args: [sameDocumentWireIds] });
  await pressKey("Escape");
  await clickSelector(page, "[data-command='undo']");
  await waitFor(page, ids => window.layersSmoke.editor.getContent().wires.every(wire => ids.includes(wire.id)),
    "copy Undo failed", { args: [sameDocumentWireIds] });
  await clickSelector(page, "[data-command='redo']");
  await waitFor(page, ids => window.layersSmoke.editor.getContent().wires.some(wire => !ids.includes(wire.id) && wire.layerId === "layer-2"),
    "copy Redo failed", { args: [sameDocumentWireIds] });

  const emptyCanvasPoint = () => evaluate(page, () => {
    const paper = document.querySelector("[data-schematic-paper]");
    const rect = paper.getBoundingClientRect();
    for (let y = rect.bottom - 100; y > rect.top + 50; y -= 50) {
      for (let x = rect.right - 180; x > rect.left + 50; x -= 50) {
        const target = document.elementFromPoint(x, y);
        if (target && paper.contains(target) && !target.closest("[model-id], [data-note-id]")) return { x, y };
      }
    }
    throw new Error("No empty canvas point in the active document");
  });
  const activateTab = async id => {
    await evaluate(page, id => document.querySelector(`[data-schematic-document-tab='${id}']`).click(), id);
    await waitFor(page, id => document.querySelector("[data-schematic-document-tab][aria-selected='true']")?.dataset.schematicDocumentTab === id,
      "the requested document tab did not activate", { args: [id] });
  };
  await activateTab(fileImport.activeTab);
  await evaluate(page, () => {
    document.querySelector("[data-sidebar-tab='layers']").click();
    document.querySelector("[data-layer-select='layer-3']").click();
  });
  await waitFor(page, () => document.querySelector("[data-layer-id='layer-3'] > .layer-stack-row.is-active"),
    "locked layer did not become active before switching tabs");
  await activateTab(sourceTab);
  await selectInLayers("output-branch");
  await evaluate(page, () => window.layersSmoke.editor.editor.hostFocusCanvas());
  await pressKey("c");
  await clickPoint(await emptyCanvasPoint());
  await waitFor(page, () => document.querySelector("[data-schematic-status]")?.textContent.includes("attached to cursor"),
    "cross-tab copy did not capture a reference point");
  await activateTab(fileImport.activeTab);
  await clickPoint(await emptyCanvasPoint());
  await waitFor(page, count => window.layersSmoke.editor.getContent().wires.length === count
    && /locked/.test(document.querySelector("[data-schematic-status]").textContent),
    "copy into a locked destination layer was not rejected", { args: [fileImport.content.wires.length] });
  await clickSelector(page, "[data-sidebar-tab='layers']");
  await evaluate(page, () => document.querySelector("[data-layer-select='layer-1']").click());
  await clickPoint(await emptyCanvasPoint());
  await waitFor(page, ids => window.layersSmoke.editor.getContent().wires.some(wire => !ids.includes(wire.id) && wire.layerId === "layer-1"),
    "cross-tab copy did not use the destination layer", { args: [fileImport.content.wires.map(wire => wire.id)] });
  await pressKey("Escape");

  await selectInLayers("output-branch");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 1, mobile: true });
  await waitFor(page, () => document.querySelector("[data-schematic-shell]").classList.contains("is-layout-narrow"), "narrow layout unavailable after import");
  await evaluate(page, () => {
    document.documentElement.dataset.effectiveTheme = "dark";
    const shell = document.querySelector("[data-schematic-shell]");
    if (!shell.classList.contains("is-left-panel-visible")) document.querySelector("[data-command='library']").click();
    document.querySelector("[data-sidebar-tab='properties']").click();
  });
  await waitFor(page, () => {
    const select = document.querySelector("[data-property-layer]");
    const { width, left, right } = select.getBoundingClientRect();
    return select.value === "layer-2" && width > 0 && left >= 0 && right <= innerWidth;
  }, "mobile Layer selector was clipped or hidden");

  const mobileTabCount = await evaluate(page, () => document.querySelectorAll("[data-schematic-document-tab]").length);
  await evaluate(page, () => document.querySelector("[data-schematic-panel-backdrop]").click());
  await waitFor(page, () => {
    const button = document.querySelector("[data-schematic-document-paste]");
    const { x, y, width, height } = button.getBoundingClientRect();
    return button.contains(document.elementFromPoint(x + width / 2, y + height / 2));
  }, "mobile clipboard button is covered");
  await clickSelector(page, "[data-schematic-document-paste]");
  await waitFor(page, count => document.querySelectorAll("[data-schematic-document-tab]").length === count + 1
    && window.layersSmoke.editor.getContent().layers.length === 3
    && !window.layersSmoke.editor.getContent().netLabels.some(label => label.name === "TEST"),
    "clipboard import did not open a layered document on mobile", { args: [mobileTabCount] });

  await page.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 980, deviceScaleFactor: 1, mobile: false });
  await evaluate(page, () => delete document.documentElement.dataset.effectiveTheme);
  await clickSelector(page, "[data-schematic-document-new]");
  await waitFor(page, () => window.layersSmoke.editor.getContent().wires.length === 0, "blank test document did not open");
  await evaluate(page, () => {
    window.layersSmoke.editor.transact(draft => {
      draft.layers.push({ id: "layer-2", name: "Destination", visible: true, locked: false });
    });
    const source = {
      format: "adc-helper/schematic",
      schematic: {
        components: [], notes: [], junctionAppearances: [],
        wires: [{ id: "hidden-source", routeMode: "orthogonal", points: [{ x: 0, y: 0 }, { x: 200, y: 0 }], layerId: "layer-1" }],
        connections: { wires: { "hidden-source": ["left", "right"] }, pins: {} },
        netLabels: [{ id: "probe", name: "PROBE", attachment: { wireId: "hidden-source", point: { x: 170, y: 0 } } }],
        layerObjectStates: { "hidden-source": { visible: false, z: 2 } }
      }
    };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { readText: async () => JSON.stringify(source) } });
  });
  await clickSelector(page, "[data-sidebar-tab='layers']");
  await clickSelector(page, "[data-layer-select='layer-2']");
  const pastePoint = await emptyCanvasPoint();
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", ...pastePoint, button: "right", buttons: 2, clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...pastePoint, button: "right", buttons: 0, clickCount: 1 });
  await clickSelector(page, "[data-paste-schematic]");
  await waitFor(page, () => document.querySelector("[data-schematic-status]")?.textContent.includes("attached to cursor"),
    "canvas paste did not start placement");
  await clickPoint(pastePoint);
  await pressKey("Escape");
  const pasted = await evaluate(page, () => {
    const content = window.layersSmoke.editor.getContent();
    const wire = content.wires[0];
    return { id: wire?.id, start: wire?.points[0], layerId: wire?.layerId,
      state: content.layerObjectStates?.[wire?.id], drawn: !!document.querySelector(`[model-id='${wire?.id}']`) };
  });
  assert(pasted.layerId === "layer-2" && pasted.state.visible === false && !pasted.drawn,
    "canvas paste did not apply the active layer or keep the wire hidden", pasted);

  await evaluate(page, start => window.layersSmoke.editor.transact(draft => {
    draft.wires.push({
      id: "split-branch", layerId: "layer-2", routeMode: "orthogonal",
      points: [{ x: start.x + 100, y: start.y }, { x: start.x + 100, y: start.y + 80 }]
    });
  }, { origin: "editor", reason: "split-copied-wire" }), pasted.start);
  const splitPersisted = (hiddenId, z) => {
    const content = window.layersSmoke.editor.getContent();
    const pieces = content.wires.filter(wire => wire.id !== "split-branch");
    if (pieces.length !== 2) return false;
    const branchNode = content.connections.wires["split-branch"][0];
    return pieces.every(wire => wire.layerId === "layer-2" && content.layerObjectStates?.[wire.id]?.visible === false
      && content.layerObjectStates[wire.id].z === z && content.connections.wires[wire.id].includes(branchNode)
      && !document.querySelector(`[model-id='${wire.id}']`))
      && content.netLabels[0].attachment.wireId !== hiddenId
      && pieces.some(wire => wire.id === content.netLabels[0].attachment.wireId);
  };
  const splitArgs = { args: [pasted.id, pasted.state.z] };
  await waitFor(page, splitPersisted, "split pieces lost layer state, connection or label", splitArgs);
  await clickSelector(page, "[data-command='undo']");
  await waitFor(page, id => {
    const content = window.layersSmoke.editor.getContent();
    return content.wires.length === 1 && content.netLabels[0].attachment.wireId === id
      && content.layerObjectStates?.[id]?.visible === false;
  }, "split Undo did not restore the original wire", { args: [pasted.id] });
  await clickSelector(page, "[data-command='redo']");
  await waitFor(page, splitPersisted, "split Redo did not restore the wires", splitArgs);
  await navigate(page, server.url);
  await waitFor(page, splitPersisted, "split layer state did not survive reload", splitArgs);

  await checkLayersRoundTrip(rcFixture, { selectInLayers, moveSelection, emptyCanvasPoint });
  console.log(JSON.stringify({ initial, pinSelection, hidden, dark, mobile, importedRc: true, clipboardImport: true,
    copyAndSplit: true, imageExport: true, layerRoundTrip: true, netlistFormats: ["spice", "spectre"], ok: true }));
} finally {
  page?.close();
  await browser?.close();
  await server?.close();
  await fs.rm(output, { recursive: true, force: true });
}
