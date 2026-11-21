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
    { id: "R1", type: "resistor", ref: "R1", x: 300, y: 200, rotation: 0, mirrored: false, values: { main: "1k" } }
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
    devices: document.querySelectorAll("[data-netlist-device]").length,
    diagnosticsBelowCode: Boolean(
      document.querySelector("[data-netlist-code] + [data-netlist-diagnostics-summary]")
    )
  }));
  if (state.state !== "error" || state.diagnostics < 1 || !state.code?.includes("R1") || state.devices !== 7 || !state.diagnosticsBelowCode) {
    throw new Error("netlist panel did not generate with diagnostics: " + JSON.stringify(state));
  }
  const shot = await page.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await fs.writeFile(path.join(outDir, "r2-netlist-generated.png"), Buffer.from(shot.data, "base64"));

  await clickSelector(page, "[data-netlist-format='spectre']");
  const format = await evaluate(page, () => document.querySelector("[data-netlist-format='spectre']")?.getAttribute("aria-pressed"));
  if (format !== "true") throw new Error("format did not switch");

  await evaluate(page, () => {
    const process = document.querySelector("[data-netlist-process]");
    if (process) {
      process.value = "custom";
      process.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await waitFor(page, () => document.querySelectorAll("[data-netlist-device]").length === 7, "custom devices did not render");
  const custom = await evaluate(page, () => ({
    tag: document.querySelector("[data-netlist-device='nmos']")?.tagName,
    nmos: document.querySelector("[data-netlist-device='nmos']")?.value,
    resistor: document.querySelector("[data-netlist-device='resistor']")?.value
  }));
  if (custom.tag !== "INPUT" || custom.nmos !== "NMOS" || custom.resistor !== "R") {
    throw new Error("custom defaults are wrong: " + JSON.stringify(custom));
  }
  await evaluate(page, () => {
    const input = document.querySelector("[data-netlist-device='resistor']");
    if (input) {
      input.value = "my_res";
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
  await waitFor(page, () => (document.querySelector("[data-netlist-code]")?.textContent ?? "").includes("my_res"), "custom resistor model did not reach the netlist");

  await clickSelector(page, "[data-netlist-diagnostic-component]");
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
  console.log(JSON.stringify({ state, format, diagnosticCentered: true, errorExport: true, ok: true }));
} finally {
  page?.close();
  await browser?.close();
  await server.close();
}
