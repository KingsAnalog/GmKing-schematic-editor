import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { serveDist, launchBrowser, openPage, navigate, clickSelector, waitFor, evaluate } from "./browser-smoke.mjs";

const here = fileURLToPath(new URL(".", import.meta.url));
const dist = path.resolve(here, "../apps/web/dist");
const outDir = process.env.SCHEMATIC_SMOKE_ARTIFACTS ?? path.resolve(here, "../../../.tmp-shots");
await fs.mkdir(outDir, { recursive: true });
const { createSchematicDocument, contentFromDocument } = await import("../packages/schematic/dist/schematic/document/documentModel.js");
const content = contentFromDocument(createSchematicDocument({
  components: [
    ...[
      ["R1", "resistor", { main: "1k" }], ["R2", "resistor", { main: "2k" }],
      ["M1", "nmos", { "mos:w": "1u", "mos:l": "0.15u" }],
      ["M2", "pmos", { "mos:w": "2u", "mos:l": "0.15u" }],
      ["Q1", "npn", {}], ["Q2", "pnp", {}],
      ["C1", "capacitor", { main: "1p" }], ["L1", "inductor", { main: "1u" }]
    ].map(([ref, type, values], index) => ({
      id: ref, type, ref, x: 300 + 120 * (index % 4), y: 200 + 180 * Math.floor(index / 4),
      rotation: 0, mirrored: false, values
    }))
  ]
}));
const server = await serveDist(dist);
const browser = await launchBrowser();
let page;
try {
  page = await openPage(browser.baseUrl, server.url);
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 980, deviceScaleFactor: 1, mobile: false });
  await navigate(page, server.url);
  await waitFor(page, () => Boolean(document.querySelector("[data-schematic-paper] svg")), "editor did not mount");
  await evaluate(page, (snapshot) => {
    localStorage.setItem("schematic-workspace", JSON.stringify({ activeDocumentId: "smoke", documents: [{ id: "smoke", title: "Netlist smoke" }] }));
    localStorage.setItem("adc-helper-schematic:smoke", JSON.stringify({
      format: "adc-helper/schematic-workspace-snapshot",
      state: { document: snapshot, zoom: 1, viewTranslate: { x: 0, y: 0 }, presentationMode: false }
    }));
  }, content);
  await navigate(page, server.url);
  await waitFor(page, () => Boolean(document.querySelector("[model-id='R1']")), "saved resistor did not restore");
  await clickSelector(page, "[data-command='netlist']");
  await waitFor(page, () => document.querySelector("[data-right-panel='netlist']")?.hidden === false, "netlist tab did not open");
  await waitFor(page, () => (document.querySelector("[data-netlist-diagnostics-list]")?.childElementCount ?? 0) > 0, "diagnostics did not render");
  const state = await evaluate(page, () => ({
    status: document.querySelector("[data-netlist-status]")?.textContent,
    code: document.querySelector("[data-netlist-code]")?.textContent,
    diagnostics: document.querySelectorAll(".netlist-diagnostic").length,
    state: document.querySelector("[data-netlist-status]")?.getAttribute("data-state"),
    configInNetlist: Boolean(document.querySelector("[data-right-panel='netlist'] [data-netlist-process]")),
    panes: [...document.querySelectorAll(".netlist-pane")].map(element => element.getBoundingClientRect().height)
  }));
  if (state.state !== "error" || state.diagnostics < 1 || !state.code?.includes("R1") || state.configInNetlist
    || state.panes.length !== 2 || state.panes[0] < 100 || Math.abs(state.panes[0] - state.panes[1]) > 1) {
    throw new Error("netlist panel did not generate with diagnostics: " + JSON.stringify(state));
  }
  const shot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(outDir, "r2-netlist-generated.png"), Buffer.from(shot.data, "base64"));

  await clickSelector(page, "[data-netlist-format='spectre']");
  const format = await evaluate(page, () => document.querySelector("[data-netlist-format='spectre']")?.getAttribute("aria-pressed"));
  if (format !== "true") throw new Error("format did not switch");

  await clickSelector(page, "[data-schematic-open-options]");
  assert.deepEqual(await evaluate(page, () =>
    [...document.querySelectorAll("[data-schematic-options-dialog] select")].map(select => select.closest("label").firstElementChild.textContent)
  ), ["Language", "Color mode", "Default text font", "Process", "Symbol template", "Wire crossings", "Wire angle"]);
  await change("[data-netlist-process]", "custom");
  await clickSelector(page, "[data-schematic-options-close]");

  for (const [ref, defaultModel] of [["R1", "R"], ["R2", "R"], ["C1", "C"], ["L1", "L"],
    ["M1", "NMOS"], ["M2", "PMOS"], ["Q1", "NPN"], ["Q2", "PNP"]]) {
    await selectDevice(ref);
    const control = await evaluate(page, () => {
      const row = document.querySelector("[data-property-device-model]:not([hidden])");
      return {
        placeholder: row.querySelector("[data-property-model-input]:not([hidden])")?.placeholder,
        section: row.dataset.propertyDeviceModel,
        next: row.nextElementSibling?.getAttributeNames().filter(name => name.startsWith("data-property-")),
        separator: getComputedStyle(row).borderTopWidth
      };
    });
    assert.equal(control.placeholder, defaultModel);
    const passive = ["R", "L", "C"].includes(defaultModel);
    assert.equal(control.section, passive ? "passive" : "transistor");
    assert(control.next.includes(passive ? "data-property-value-row" : "data-property-mos-params"));
    if (passive) assert.equal(control.separator, "1px");
  }

  await selectDevice("R1");
  await change("[data-property-device-model='passive'] [data-property-model-input]", "my_res");
  await selectDevice("M1");
  await change("[data-property-device-model='transistor'] [data-property-model-input]", "my_nmos");
  await waitFor(page, () => {
    const code = document.querySelector("[data-netlist-code]").textContent;
    return /R1 \(.*\) my_res r=1k/.test(code) && /R2 \(.*\) resistor r=2k/.test(code)
      && /M1 \(.*\) my_nmos w=1u/.test(code) && /M2 \(.*\) PMOS w=2u/.test(code);
  }, "Spectre did not use separate models");
  await clickSelector(page, "[data-netlist-format='spice']");
  await waitFor(page, () => {
    const code = document.querySelector("[data-netlist-code]").textContent;
    return /XR1 .* my_res r=1k/.test(code) && /R2 .* 2k/.test(code)
      && /XM1 .* my_nmos w=1u/.test(code);
  }, "SPICE did not use separate models");
  await clickSelector(page, "[data-command='undo']");
  await waitFor(page, () => !document.querySelector("[data-netlist-code]").textContent.includes("my_nmos"), "device model Undo failed");
  await clickSelector(page, "[data-command='redo']");
  await waitFor(page, () => document.querySelector("[data-netlist-code]").textContent.includes("my_nmos"), "device model Redo failed");
  await clickSelector(page, "[data-netlist-format='spectre']");

  await clickSelector(page, "[data-netlist-diagnostic-component='R1']");
  await waitFor(page, () => (document.querySelector("[data-schematic-status]")?.textContent ?? "").includes("Selected R1"), "diagnostic did not select the component");
  await waitFor(page, () => {
    const paper = document.querySelector("[data-schematic-paper]").getBoundingClientRect();
    const frame = document.querySelector("[model-id='R1'] [joint-selector='body']") ?? document.querySelector("[model-id='R1']");
    const bounds = frame.getBoundingClientRect();
    return Math.abs(bounds.x + bounds.width / 2 - paper.x - paper.width / 2) < 24
      && Math.abs(bounds.y + bounds.height / 2 - paper.y - paper.height / 2) < 24;
  }, "diagnostic did not center the component while retaining zoom");
  await page.send("Browser.setDownloadBehavior", { behavior: "deny" });
  await evaluate(page, () => {
    const createUrl = URL.createObjectURL.bind(URL);
    URL.createObjectURL = blob => {
      if (blob.type.startsWith("text/plain")) void blob.text().then(value => { window.r2Downloaded = value; });
      return createUrl(blob);
    };
    const exec = document.execCommand.bind(document);
    document.execCommand = command => {
      if (command !== "copy") return exec(command);
      window.r2Copied = document.activeElement.value;
      return true;
    };
  });
  await clickSelector(page, "[data-netlist-copy]");
  await clickSelector(page, "[data-netlist-download]");
  await waitFor(page, () => window.r2Downloaded?.includes("my_res"), "download was blocked by diagnostics");
  const exports = await evaluate(page, () => [window.r2Copied, window.r2Downloaded]);
  assert(exports[0]?.startsWith("// analog-tools") && exports[0] === exports[1], "copy and download must contain the same Spectre text");

  await clickSelector(page, "[data-schematic-open-options]");
  await change("[data-netlist-process]", "gf180mcu");
  await clickSelector(page, "[data-schematic-options-close]");
  await selectDevice("M1");
  assert.equal(await evaluate(page, () => document.querySelector("[data-property-device-model='transistor'] [data-property-model-select]").value), "my_nmos");
  await selectDevice("M2");
  const presetModel = await evaluate(page, () => {
    const select = document.querySelector("[data-property-device-model='transistor'] [data-property-model-select]");
    return [...select.options].find(option => option.value.includes("_pfet_") && option.value !== select.options[1].value)?.value;
  });
  assert(presetModel, "the GF180MCU PMOS list did not offer a model override");
  await change("[data-property-device-model='transistor'] [data-property-model-select]", presetModel);
  assert.equal(await evaluate(page, () => document.querySelector("[data-property-device-model='transistor'] [data-property-model-select]").value), presetModel);
  await waitFor(page, () => {
    const saved = JSON.parse(localStorage.getItem("adc-helper-schematic:smoke")).state.document;
    return saved.netlistProcess === "gf180mcu"
      && saved.components.find(instance => instance.ref === "R1")?.values["netlist:model"] === "my_res";
  }, "process and instance models did not persist");
  await navigate(page, new URL("?restore", server.url).href);
  await waitFor(page, () => document.querySelector("[data-netlist-process]")?.value === "gf180mcu", "process did not restore");
  await selectDevice("M1");
  assert.equal(await evaluate(page, () => document.querySelector("[data-property-device-model='transistor'] [data-property-model-select]").value), "my_nmos");

  await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 760, deviceScaleFactor: 1, mobile: true });
  await waitFor(page, () => innerWidth === 375 && document.querySelector(".is-layout-narrow"), "mobile layout did not apply");
  await clickSelector(page, "[data-schematic-open-options]");
  await change("[data-schematic-language-select]", "zh");
  await change("[data-schematic-theme-select]", "dark");
  assert(await evaluate(page, () => {
    const options = document.querySelector("[data-schematic-options-dialog]");
    return options.innerText.includes("工艺") && options.getBoundingClientRect().right <= innerWidth
      && getComputedStyle(options.querySelector("[data-netlist-process]")).colorScheme === "dark";
  }), "localized dark Options does not fit 375px");
  await clickSelector(page, "[data-schematic-options-close]");
  await evaluate(page, () => document.querySelector("[data-command='netlist']").click());
  await waitFor(page, () => {
    const [code, diagnostics] = [...document.querySelectorAll(".netlist-pane")].map(pane => pane.getBoundingClientRect());
    return code.height > 100 && Math.abs(code.height - diagnostics.height) <= 1
      && code.right <= innerWidth && diagnostics.right <= innerWidth;
  }, "mobile netlist panes overflow or are unequal").catch(async error => {
    const rects = await evaluate(page, () => [...document.querySelectorAll(".netlist-pane")].map(pane => pane.getBoundingClientRect().toJSON()));
    throw new Error(`${error.message}: ${JSON.stringify(rects)}`);
  });
  console.log(JSON.stringify({ diagnosticCentered: true, errorExport: true, panes: state.panes, instanceModels: true, restoredProcess: true, ok: true }));

  async function selectDevice(ref) {
    await clickSelector(page, "[data-sidebar-tab='layers']");
    await evaluate(page, ref => document.querySelector(`[data-layer-object-select='${ref}']`).click(), ref);
    await clickSelector(page, "[data-sidebar-tab='properties']");
  }

  function change(selector, value) {
    return evaluate(page, (selector, value) => {
      const control = document.querySelector(selector);
      control.value = value;
      control.dispatchEvent(new Event("change", { bubbles: true }));
    }, selector, value);
  }
} finally {
  page?.close();
  await browser?.close();
  await server.close();
}
